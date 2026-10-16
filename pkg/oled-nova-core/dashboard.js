import cockpit from "cockpit";
import {
    Sampler, DiskIo, PowerSampler,
    disk_usage, disk_temperature, cpu_temperature,
    top_processes, loadavg, format_kb, format_rate,
} from "./lib/metrics.js";
import { Ring } from "./lib/rings.js";
import { Graph } from "./lib/graphs.js";
import { ProcessList } from "./lib/processes.js";
import { load, apply, save } from "./lib/settings.js";

cockpit.translate();

function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)
        node.className = cls;
    if (text != null)
        node.textContent = text;
    return node;
}

function human_uptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days)
        return `${days}d ${hours}h ${mins}m`;
    if (hours)
        return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function proc_label(proc) {
    if (!proc)
        return "—";
    return `${proc.name} · ${proc.pid}`;
}

function ring_group(title, rings, extra_cls) {
    const card = el("div", "on-card on-ring-group" + (extra_cls ? " " + extra_cls : ""));
    card.appendChild(el("div", "on-group-title", title));
    const row = el("div", "on-group-rings");
    for (const r of rings)
        row.appendChild(r.element);
    card.appendChild(row);
    return card;
}

/* ---- full system information modal ---- */

function read_first(paths) {
    return cockpit.spawn(["sh", "-c",
        "for f in " + paths.join(" ") + "; do [ -r \"$f\" ] && { cat \"$f\"; exit 0; }; done"],
                         { err: "message" }).catch(() => null);
}

function get_model() {
    return read_first(["/sys/class/dmi/id/product_name", "/sys/class/dmi/id/board_name"])
            .then(v => {
                if (!v)
                    return null;
                return v.trim();
            });
}

function get_vendor() {
    return read_first(["/sys/class/dmi/id/sys_vendor", "/sys/class/dmi/id/board_vendor"])
            .then(v => (v ? v.trim() : null));
}

function get_asset_tag() {
    return read_first(["/sys/class/dmi/id/product_serial", "/sys/class/dmi/id/chassis_serial"])
            .then(v => (v ? v.trim() : null));
}

function get_machine_id() {
    return cockpit.file("/etc/machine-id").read()
            .then(v => v.trim())
            .catch(() => null);
}

function get_profile() {
    /* Prefer power-profiles-daemon, fall back to the cpufreq governor. */
    try {
        const client = cockpit.dbus("net.hadess.PowerProfiles");
        const proxy = client.proxy("net.hadess.PowerProfiles", "/net/hadess/PowerProfiles");
        return proxy.wait()
                .then(() => {
                    const p = proxy.ActiveProfile;
                    client.close();
                    return p;
                })
                .then(p => `Power profile: ${p}`)
                .catch(() => {
                    client.close();
                    return fallback_governor();
                });
    } catch (e) {
        return fallback_governor();
    }
}

function fallback_governor() {
    return read_first(["/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"])
            .then(v => (v ? `CPU governor: ${v.trim()}` : null));
}

function get_ssh_keys() {
    const script = "for f in $HOME/.ssh/*.pub; do [ -e \"$f\" ] && " +
        "printf '%s\\t%s\\n' \"$(basename \"$f\")\" \"$(cut -d' ' -f1 \"$f\")\"; done";
    return cockpit.spawn(["sh", "-c", script], { err: "message" })
            .then(out => out.trim())
            .catch(() => "");
}

function open_full_metrics(rows) {
    const backdrop = el("div", "on-modal-backdrop");
    const modal = el("div", "on-modal");
    const head = el("div", "on-modal-head");
    const title = el("div", "on-modal-title", "System metrics");
    const spacer = el("div", "on-spacer");
    const close = el("button", "on-icon-btn", "✕");
    head.append(title, spacer, close);

    const body = el("div", "on-modal-body");
    const table = el("div", "on-metrics-table");
    const value_nodes = {};

    const add_row = (key, label) => {
        const row = el("div", "on-kv");
        row.append(el("span", "on-kv-key", label), el("span", "on-kv-val", "…"));
        value_nodes[key] = row.lastChild;
        table.appendChild(row);
    };
    for (const [key, label] of rows)
        add_row(key, label);
    body.appendChild(table);

    modal.append(head, body);
    backdrop.appendChild(modal);

    let clock_timer = null;
    const tick_clock = () => {
        value_nodes.time.textContent = new Date().toLocaleString();
    };

    const cleanup = () => {
        if (clock_timer)
            clearInterval(clock_timer);
        backdrop.remove();
        document.removeEventListener("keydown", on_key);
    };
    const on_key = ev => {
        if (ev.key === "Escape")
            cleanup();
    };

    close.addEventListener("click", cleanup);
    backdrop.addEventListener("mousedown", ev => {
        if (ev.target === backdrop)
            cleanup();
    });
    document.addEventListener("keydown", on_key);

    /* Fill async values */
    const set = (key, v) => { value_nodes[key].textContent = (v == null || v === "") ? "—" : v };
    get_vendor().then(v => get_model().then(m => set("model", [v, m].filter(Boolean).join(" "))));
    get_machine_id().then(v => set("machine_id", v));
    get_asset_tag().then(v => set("asset_tag", v));
    get_profile().then(v => set("profile", v));
    get_ssh_keys().then(v => set("ssh", v ? v.replace(/\n/g, "  ·  ") : "none"));
    set("uptime", "…");
    cockpit.file("/proc/uptime").read().then(v => set("uptime", human_uptime(parseFloat(v))))
            .catch(() => {});
    tick_clock();
    clock_timer = setInterval(tick_clock, 1000);

    document.body.appendChild(backdrop);
}

function init() {
    const root = document.getElementById("oled-root");
    const settings = load();
    apply(settings);

    const page = el("div", "on-page");
    const head = el("div", "on-page-head");
    const view_btn = el("button", "on-icon-btn on-view-toggle");
    view_btn.title = "Toggle graph view";
    view_btn.textContent = "⚙";
    view_btn.addEventListener("click", () => {
        const on = page.classList.toggle("on-graph-mode");
        view_btn.classList.toggle("on-active", on);
        settings.overview_view = on ? "graphs" : "rings";
        save(settings);
    });
    head.append(view_btn, el("h2", "on-view-title", "Overview"));

    const grid = el("div", "on-grid on-rings-view");

    const processes = new ProcessList({ interval: 2000 });

    const cpu_ring = new Ring({ title: "CPU", onClick: () => processes.open() });
    const mem_ring = new Ring({ title: "Memory", onClick: () => processes.open() });

    const read_ring = new Ring({ title: "Read", unit: "", small: true });
    const write_ring = new Ring({ title: "Write", unit: "", small: true });
    const dtemp_ring = new Ring({ title: "Disk temp", unit: "°C", small: true });
    const used_ring = new Ring({ title: "Space /", unit: "%", small: true });
    const disk_card = ring_group("Disk", [read_ring, write_ring, dtemp_ring, used_ring], "on-span-2");

    const power_ring = new Ring({ title: "Power", unit: "W" });
    const cpu_temp_ring = new Ring({ title: "CPU temp", unit: "°C" });
    const power_card = ring_group("Power & thermal", [power_ring, cpu_temp_ring], "on-span-2");

    const info = el("div", "on-card on-info-card on-clickable");
    info.setAttribute("role", "button");
    info.setAttribute("tabindex", "0");
    info.appendChild(el("h3", null, "Host"));
    const info_rows = {};
    for (const [key, label] of [["hostname", "Hostname"], ["kernel", "Kernel"], ["uptime", "Uptime"], ["load", "Load average"], ["disk", "Disk /"]]) {
        const row = el("div", "on-kv");
        row.append(el("span", "on-kv-key", label), el("span", "on-kv-val", "…"));
        info_rows[key] = row.lastChild;
        info.appendChild(row);
    }
    const open_metrics = () => open_full_metrics([
        ["model", "Model"],
        ["machine_id", "Machine ID"],
        ["asset_tag", "Asset tag"],
        ["time", "System time"],
        ["uptime", "Uptime"],
        ["profile", "Performance profile"],
        ["ssh", "SSH keys"],
    ]);
    info.addEventListener("click", open_metrics);
    info.addEventListener("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " ")
            open_metrics();
    });

    grid.append(cpu_ring.element, mem_ring.element, disk_card, power_card, info);

    /* ---- graph view (toggled from the gear) ---- */
    const graphs = el("div", "on-grid on-graphs-view");
    const cpu_graph = new Graph({ title: "CPU", unit: "%", color: "#a855f7" });
    const mem_graph = new Graph({ title: "Memory", unit: "%", color: "#22c55e" });
    const read_graph = new Graph({ title: "Disk read", color: "#06b6d4", autoscale: true, unit: " B/s" });
    const write_graph = new Graph({ title: "Disk write", color: "#f59e0b", autoscale: true, unit: " B/s" });
    const power_graph = new Graph({ title: "Power", color: "#ef4444", autoscale: true, unit: " W" });
    const temp_graph = new Graph({ title: "CPU temp", unit: "°C", color: "#3b82f6", min: 0, max: 110 });
    graphs.append(cpu_graph.element, mem_graph.element, read_graph.element,
                  write_graph.element, power_graph.element, temp_graph.element);

    page.append(head, grid, graphs, processes.element);
    root.appendChild(page);

    if (settings.overview_view === "graphs") {
        page.classList.add("on-graph-mode");
        view_btn.classList.add("on-active");
    }

    /* ---- sampling ---- */
    const sampler = new Sampler();
    const diskio = new DiskIo();
    const power = new PowerSampler();
    let tick_count = 0;
    let busy = false;
    let read_peak = 64 * 1024 * 1024;
    let write_peak = 64 * 1024 * 1024;

    async function sample_tick() {
        if (busy)
            return;
        busy = true;
        try {
            const results = await Promise.allSettled([sampler.sample(), diskio.sample(), top_processes()]);
            const sample = results[0].status === "fulfilled" ? results[0].value : null;
            const io = results[1].status === "fulfilled" ? results[1].value : null;
            const tops = results[2].status === "fulfilled" ? results[2].value : null;

            if (sample) {
                cpu_ring.set(sample.cpu / 100);
                mem_ring.set(sample.memory / 100);
                cpu_graph.push(sample.cpu, `${Math.round(sample.cpu)}%`);
                mem_graph.push(sample.memory, `${Math.round(sample.memory)}%`);
            }
            if (tops) {
                cpu_ring.set_sub(proc_label(tops.cpu));
                mem_ring.set_sub(proc_label(tops.mem));
            }
            if (io) {
                read_peak = Math.max(read_peak, io.read_bps);
                write_peak = Math.max(write_peak, io.write_bps);
                read_ring.set(io.read_bps / read_peak, format_rate(io.read_bps).replace(" ", "\u00a0"));
                write_ring.set(io.write_bps / write_peak, format_rate(io.write_bps).replace(" ", "\u00a0"));
                read_graph.push(io.read_bps, format_rate(io.read_bps));
                write_graph.push(io.write_bps, format_rate(io.write_bps));
            }

            tick_count += 1;
            if (tick_count % 3 === 1) {
                const slow = await Promise.allSettled([
                    disk_usage(), disk_temperature(), cpu_temperature(), power.sample(),
                ]);
                const disk = slow[0].status === "fulfilled" ? slow[0].value : null;
                const dtemp = slow[1].status === "fulfilled" ? slow[1].value : null;
                const ctemp = slow[2].status === "fulfilled" ? slow[2].value : null;
                const watts = slow[3].status === "fulfilled" ? slow[3].value : null;

                if (disk) {
                    used_ring.set(disk.percent / 100, `${Math.round(disk.percent)}`);
                    info_rows.disk.textContent = `${disk.percent.toFixed(1)}% · ${format_kb(disk.used_kb)} / ${format_kb(disk.total_kb)}`;
                }
                if (dtemp != null)
                    dtemp_ring.set(Math.min(dtemp / 100, 1), String(Math.round(dtemp)));
                if (ctemp != null) {
                    cpu_temp_ring.set(Math.min(ctemp / 100, 1), String(Math.round(ctemp)));
                    temp_graph.push(ctemp, `${Math.round(ctemp)}°C`);
                }
                if (watts != null) {
                    power_ring.set(Math.min(watts / 100, 1), watts.toFixed(1));
                    power_graph.push(watts, `${watts.toFixed(1)} W`);
                }
            }
        } catch (e) {
            /* never let a failed sample kill the loop */
        } finally {
            busy = false;
        }
    }

    sample_tick();
    setInterval(sample_tick, 1000);

    /* ---- host info ---- */
    cockpit.file("/etc/hostname").read()
            .then(name => { info_rows.hostname.textContent = name.trim() })
            .catch(() => { info_rows.hostname.textContent = cockpit.transport.host || "localhost" });
    cockpit.file("/proc/sys/kernel/osrelease").read()
            .then(v => { info_rows.kernel.textContent = v.trim() })
            .catch(() => {});
    cockpit.file("/proc/uptime").read()
            .then(v => { info_rows.uptime.textContent = human_uptime(parseFloat(v)) })
            .catch(() => {});
    loadavg().then(parts => {
        if (parts.length >= 3)
            info_rows.load.textContent = parts.slice(0, 3).join("  ");
    });
}

if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
else
    init();
