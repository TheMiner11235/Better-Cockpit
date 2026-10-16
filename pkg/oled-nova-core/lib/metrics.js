import cockpit from "cockpit";

/* 287-safe metrics sampling: reads /proc and hwmon directly so it does not
 * depend on the newer "fsinfo"/"metrics1" channels. Every sensor is
 * best-effort: if the file/sensor is missing we return null and the caller
 * renders a dash instead of breaking the sampler loop.
 */

function parse_stat(text) {
    const line = text.split("\n").find(l => l.startsWith("cpu "));
    if (!line)
        return null;
    const parts = line.trim().split(/\s+/).slice(1);
    const fields = parts.map(Number);
    const idle = fields[3] + (fields[4] || 0);
    const total = fields.reduce((a, b) => a + b, 0);
    return { idle, total };
}

function parse_meminfo(text) {
    const out = {};
    for (const line of text.split("\n")) {
        const m = line.match(/^(\w+):\s+(\d+)/);
        if (m)
            out[m[1]] = Number(m[2]);
    }
    return out;
}

export class Sampler {
    constructor() {
        this._prev = null;
    }

    async sample() {
        const [stat_text, mem_text] = await Promise.all([
            cockpit.file("/proc/stat").read(),
            cockpit.file("/proc/meminfo").read(),
        ]);

        const cur = parse_stat(stat_text);
        let cpu = 0;
        if (this._prev && cur) {
            const dt = cur.total - this._prev.total;
            const di = cur.idle - this._prev.idle;
            if (dt > 0)
                cpu = Math.max(0, Math.min(100, (1 - di / dt) * 100));
        }
        this._prev = cur;

        const info = parse_meminfo(mem_text);
        const total = info.MemTotal || 0;
        const available = info.MemAvailable != null ? info.MemAvailable : info.MemFree || 0;
        const memory = total ? Math.max(0, Math.min(100, (1 - available / total) * 100)) : 0;

        return { cpu, memory };
    }
}

/* Parse /proc/diskstats: field 6 = sectors read, field 10 = sectors written
 * (1-based inclusive in the kernel docs; here after the trimmed split the
 * counters are idx 2 and 6). We sum across physical devices and report the
 * delta per second. */
function parse_diskstats(text) {
    let read = 0;
    let write = 0;
    for (const line of text.split("\n")) {
        const f = line.trim().split(/\s+/);
        if (f.length < 14)
            continue;
        const name = f[2];
        if (/^(loop|ram|zram|dm-|md|sr)/.test(name))
            continue;
        read += Number(f[5]) || 0;
        write += Number(f[9]) || 0;
    }
    return { read, write };
}

const SECTOR = 512;

export class DiskIo {
    constructor() {
        this._prev = null;
        this._prev_t = 0;
    }

    async sample() {
        const text = await cockpit.file("/proc/diskstats").read();
        const cur = parse_diskstats(text);
        const now = performance.now();
        let read_bps = 0;
        let write_bps = 0;
        if (this._prev) {
            const dt = (now - this._prev_t) / 1000;
            if (dt > 0) {
                read_bps = Math.max(0, (cur.read - this._prev.read) * SECTOR / dt);
                write_bps = Math.max(0, (cur.write - this._prev.write) * SECTOR / dt);
            }
        }
        this._prev = cur;
        this._prev_t = now;
        return { read_bps, write_bps };
    }
}

export function disk_usage() {
    return cockpit.spawn(["df", "-kP", "/"], { err: "message" })
            .then(out => {
                const lines = out.trim().split("\n");
                const parts = lines[lines.length - 1].trim().split(/\s+/);
                const total = Number(parts[1]);
                const used = Number(parts[2]);
                if (!total)
                    return null;
                return { percent: (used / total) * 100, used_kb: used, total_kb: total };
            })
            .catch(() => null);
}

/* Walk hwmon, preferring real CPU sensors over board/battery chips. */
export function cpu_temperature() {
    const script = "for h in /sys/class/hwmon/hwmon*; do " +
        "n=$(cat \"$h/name\" 2>/dev/null); " +
        "case \"$n\" in coretemp|k10temp|zenpower|cpu_thermal|acpitz) " +
        "if [ -r \"$h/temp1_input\" ]; then cat \"$h/temp1_input\"; exit 0; fi;; esac; " +
        "done; " +
        "for t in /sys/class/hwmon/hwmon*/temp1_input; do " +
        "if [ -r \"$t\" ]; then cat \"$t\"; exit 0; fi; done";
    return cockpit.spawn(["sh", "-c", script], { err: "message" })
            .then(out => {
                const v = parseFloat(out);
                return Number.isFinite(v) ? v / 1000 : null;
            })
            .catch(() => null);
}

/* Disk temperature: prefer an nvme/drivetemp hwmon chip, else give up. */
export function disk_temperature() {
    const script = "for h in /sys/class/hwmon/hwmon*; do " +
        "n=$(cat \"$h/name\" 2>/dev/null); " +
        "case \"$n\" in nvme|drivetemp|sd|sata*) " +
        "if [ -r \"$h/temp1_input\" ]; then cat \"$h/temp1_input\"; exit 0; fi;; esac; " +
        "done";
    return cockpit.spawn(["sh", "-c", script], { err: "message" })
            .then(out => {
                const v = parseFloat(out);
                return Number.isFinite(v) ? v / 1000 : null;
            })
            .catch(() => null);
}

/* Package power draw in watts. Tries Intel/AMD RAPL energy counters first
 * (needs read access, often root), then hwmon power1_input (microwatts). */
export class PowerSampler {
    constructor() {
        this._prev = null;
        this._prev_t = 0;
        this._mode = null;
    }

    async _read_energy() {
        const text = await cockpit.file("/sys/class/powercap/intel-rapl:0/energy_uj").read();
        const v = parseFloat(text);
        return Number.isFinite(v) ? v : null;
    }

    async _read_hwmon_power() {
        const script = "for p in /sys/class/hwmon/hwmon*/power1_input; do " +
            "if [ -r \"$p\" ]; then cat \"$p\"; exit 0; fi; done";
        try {
            const out = await cockpit.spawn(["sh", "-c", script], { err: "message" });
            const v = parseFloat(out);
            return Number.isFinite(v) ? v / 1e6 : null;
        } catch (e) {
            return null;
        }
    }

    async sample() {
        const now = performance.now();

        if (this._mode !== "hwmon") {
            let energy = null;
            try {
                energy = await this._read_energy();
            } catch (e) {
                energy = null;
            }
            if (energy != null) {
                this._mode = "rapl";
                let watts = null;
                if (this._prev != null) {
                    let de = energy - this._prev;
                    if (de < 0)
                        de += 2 ** 32; /* counter wrapped (32-bit uj) */
                    const dt = (now - this._prev_t) / 1000;
                    if (dt > 0)
                        watts = de / 1e6 / dt;
                }
                this._prev = energy;
                this._prev_t = now;
                return watts != null ? Math.max(0, watts) : null;
            }
            this._mode = "hwmon";
        }

        return this._read_hwmon_power();
    }
}

export function loadavg() {
    return cockpit.file("/proc/loadavg").read()
            .then(text => text.trim().split(/\s+/))
            .catch(() => []);
}

/* One ps call, then pick the busiest process by CPU and by memory. */
export function top_processes() {
    return cockpit.spawn(["ps", "-eo", "pid=,pcpu=,pmem=,comm="], { err: "message" })
            .then(out => {
                let top_cpu = null;
                let top_mem = null;
                for (const line of out.split("\n")) {
                    const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.*)$/);
                    if (!m)
                        continue;
                    const pid = Number(m[1]);
                    const pcpu = Number(m[2]);
                    const pmem = Number(m[3]);
                    const name = m[4] || "?";
                    if (!top_cpu || pcpu > top_cpu.pcpu)
                        top_cpu = { pid, name, pcpu, pmem };
                    if (!top_mem || pmem > top_mem.pmem)
                        top_mem = { pid, name, pcpu, pmem };
                }
                return { cpu: top_cpu, mem: top_mem };
            })
            .catch(() => ({ cpu: null, mem: null }));
}

export function format_kb(kb) {
    if (!Number.isFinite(kb))
        return "—";
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = kb;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function format_rate(bytes_per_sec) {
    if (!Number.isFinite(bytes_per_sec))
        return "—";
    const units = ["B/s", "KiB/s", "MiB/s", "GiB/s"];
    let value = bytes_per_sec;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
