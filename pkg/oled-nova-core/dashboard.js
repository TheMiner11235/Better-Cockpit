import cockpit from "cockpit";
import { Sampler, disk_usage, cpu_temperature, loadavg, format_kb } from "./lib/metrics.js";
import { Ring } from "./lib/rings.js";
import { ProcessList } from "./lib/processes.js";
import { load, apply } from "./lib/settings.js";

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

function init() {
    const root = document.getElementById("oled-root");
    apply(load());

    const page = el("div", "on-page");
    const head = el("div", "on-page-head");
    head.append(
        el("h2", "on-view-title", "Monitor"),
        el("p", "on-view-sub", "Live system overview — click a ring to see processes.")
    );

    const grid = el("div", "on-grid");

    const processes = new ProcessList({ interval: 2000 });

    const cpu_ring = new Ring({ title: "CPU", onClick: () => processes.open() });
    const mem_ring = new Ring({ title: "Memory", onClick: () => processes.open() });
    const disk_ring = new Ring({ title: "Disk /" });
    const temp_ring = new Ring({ title: "Power", unit: "°C" });
    for (const r of [cpu_ring, mem_ring, disk_ring, temp_ring])
        grid.appendChild(r.element);

    const info = el("div", "on-card on-info-card");
    info.appendChild(el("h3", null, "Host"));
    const info_rows = {};
    for (const [key, label] of [["hostname", "Hostname"], ["kernel", "Kernel"], ["uptime", "Uptime"], ["load", "Load average"], ["disk", "Disk /"]]) {
        const row = el("div", "on-kv");
        row.append(el("span", "on-kv-key", label), el("span", "on-kv-val", "…"));
        info_rows[key] = row.lastChild;
        info.appendChild(row);
    }
    grid.appendChild(info);

    page.append(head, grid, processes.element);
    root.appendChild(page);

    /* ---- sampling ---- */
    const sampler = new Sampler();
    let tick_count = 0;

    async function sample_tick() {
        const { cpu, memory } = await sampler.sample();
        cpu_ring.set(cpu / 100);
        mem_ring.set(memory / 100);
        tick_count += 1;
        if (tick_count % 4 === 1) {
            const [disk, temp] = await Promise.all([disk_usage(), cpu_temperature()]);
            if (disk) {
                disk_ring.set(disk.percent / 100);
                info_rows.disk.textContent = `${disk.percent.toFixed(1)}% · ${format_kb(disk.used_kb)} / ${format_kb(disk.total_kb)}`;
            }
            if (temp != null)
                temp_ring.set(temp / 100);
        }
    }

    sample_tick();
    setInterval(sample_tick, 1500);

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
