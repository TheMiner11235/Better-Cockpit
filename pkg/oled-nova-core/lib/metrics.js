import cockpit from "cockpit";

/* 289-safe metrics sampling: reads /proc and hwmon directly so it does not
 * depend on the newer "fsinfo"/"metrics1" channels.
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

export function cpu_temperature() {
    const script = "for t in /sys/class/hwmon/hwmon*/temp1_input; do " +
        "if [ -r \"$t\" ]; then cat \"$t\"; break; fi; done";
    return cockpit.spawn(["sh", "-c", script], { err: "message" })
            .then(out => {
                const v = parseFloat(out);
                return Number.isFinite(v) ? v / 1000 : null;
            })
            .catch(() => null);
}

export function loadavg() {
    return cockpit.file("/proc/loadavg").read()
            .then(text => text.trim().split(/\s+/))
            .catch(() => []);
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
