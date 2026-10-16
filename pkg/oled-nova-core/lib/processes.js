import cockpit from "cockpit";

const COLUMNS = [
    { key: "pid", label: "PID", numeric: true },
    { key: "user", label: "User" },
    { key: "cpu", label: "CPU %", numeric: true },
    { key: "mem", label: "MEM %", numeric: true },
    { key: "rss", label: "RSS", numeric: true },
    { key: "time", label: "Time" },
    { key: "command", label: "Command" },
];

function parse_ps(out) {
    const rows = [];
    for (const line of out.split("\n")) {
        if (!line.trim())
            continue;
        const m = line.match(/^\s*(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
        if (!m)
            continue;
        rows.push({
            pid: Number(m[1]),
            user: m[2],
            cpu: Number(m[3]),
            mem: Number(m[4]),
            rss: Number(m[5]),
            time: m[6],
            command: m[7] || "?",
        });
    }
    return rows;
}

function cpu_color(cpu) {
    if (cpu >= 50)
        return "var(--on-red)";
    if (cpu >= 15)
        return "var(--on-amber)";
    return "var(--on-green)";
}

function format_rss(kb) {
    const mb = kb / 1024;
    if (mb >= 1024)
        return `${(mb / 1024).toFixed(1)} GiB`;
    return `${mb.toFixed(1)} MiB`;
}

/* A collapsible live process list. It is collapsed by default and only samples
 * while open, so it stays out of the way on the Monitor page.
 */
export class ProcessList {
    constructor({ interval = 2000 } = {}) {
        this._rows = [];
        this._filter = "";
        this._sort = { key: "cpu", dir: -1 };
        this._timer = null;
        this._selected = null;
        this._error = null;
        this._open = false;
        this._interval = interval;

        this.element = document.createElement("div");
        this.element.className = "on-processes";

        const header = document.createElement("button");
        header.className = "on-process-head";
        this._caret = document.createElement("span");
        this._caret.className = "on-process-caret";
        this._caret.textContent = "▸";
        this._title = document.createElement("span");
        this._title.className = "on-process-title";
        this._title.textContent = "Processes";
        this._count = document.createElement("span");
        this._count.className = "on-process-count";
        header.append(this._caret, this._title, this._count);
        header.addEventListener("click", () => this.toggle());

        this._body = document.createElement("div");
        this._body.className = "on-process-body";
        this._body.style.display = "none";

        const toolbar = document.createElement("div");
        toolbar.className = "on-toolbar";
        this._search = document.createElement("input");
        this._search.className = "on-input on-grow";
        this._search.placeholder = "Filter by command or user…";
        this._search.addEventListener("input", () => {
            this._filter = this._search.value.toLowerCase();
            this._render();
        });
        const refresh = document.createElement("button");
        refresh.className = "on-btn";
        refresh.textContent = "↻ Refresh";
        refresh.addEventListener("click", () => this.refresh());
        const kill = document.createElement("button");
        kill.className = "on-btn on-btn-danger";
        kill.textContent = "⨯ End process";
        kill.addEventListener("click", () => this._kill_selected());
        toolbar.append(this._search, refresh, kill);

        this._wrap = document.createElement("div");
        this._wrap.className = "on-table-wrap";

        this._body.append(toolbar, this._wrap);
        this.element.append(header, this._body);
    }

    get is_open() {
        return this._open;
    }

    toggle() {
        if (this._open)
            this.close();
        else
            this.open();
    }

    open() {
        this._open = true;
        this._caret.textContent = "▾";
        this._body.style.display = "";
        this.refresh();
        if (!this._timer)
            this._timer = setInterval(() => this.refresh(), this._interval);
    }

    close() {
        this._open = false;
        this._caret.textContent = "▸";
        this._body.style.display = "none";
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    async refresh() {
        try {
            const out = await cockpit.spawn(
                ["ps", "-eo", "pid=,user=,pcpu=,pmem=,rss=,etime=,args=", "--sort=-pcpu"],
                { err: "message" }
            );
            this._rows = parse_ps(out);
            this._error = null;
        } catch (e) {
            this._rows = [];
            this._error = cockpit.message(e);
        }
        this._render();
    }

    _kill_selected() {
        if (this._selected == null)
            return;
        const row = this._rows.find(r => r.pid === this._selected);
        const name = row ? row.command : `PID ${this._selected}`;
        if (!window.confirm(`End process ${this._selected}?\n${name}`))
            return;
        cockpit.spawn(["kill", "-TERM", String(this._selected)], { superuser: "try", err: "message" })
                .then(() => {
                    this._selected = null;
                    this.refresh();
                })
                .catch(e => window.alert(`Could not end process: ${cockpit.message(e)}`));
    }

    _visible_rows() {
        let rows = this._rows;
        if (this._filter) {
            rows = rows.filter(r =>
                r.command.toLowerCase().includes(this._filter) ||
                r.user.toLowerCase().includes(this._filter));
        }
        const { key, dir } = this._sort;
        const numeric = COLUMNS.find(c => c.key === key)?.numeric;
        rows = [...rows].sort((a, b) => {
            const av = a[key];
            const bv = b[key];
            if (numeric)
                return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });
        return rows.slice(0, 80);
    }

    _render() {
        this._count.textContent = this._rows.length ? `(${this._rows.length})` : "";
        this._wrap.textContent = "";

        if (this._error) {
            const err = document.createElement("div");
            err.className = "on-empty on-error";
            err.textContent = `Could not list processes: ${this._error}`;
            this._wrap.appendChild(err);
            return;
        }

        const table = document.createElement("table");
        table.className = "on-table";

        const thead = document.createElement("thead");
        const htr = document.createElement("tr");
        for (const col of COLUMNS) {
            const th = document.createElement("th");
            th.textContent = col.label + (this._sort.key === col.key ? (this._sort.dir < 0 ? " ▾" : " ▴") : "");
            th.addEventListener("click", () => {
                if (this._sort.key === col.key)
                    this._sort.dir *= -1;
                else
                    this._sort = { key: col.key, dir: col.numeric ? -1 : 1 };
                this._render();
            });
            htr.appendChild(th);
        }
        thead.appendChild(htr);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        for (const row of this._visible_rows()) {
            const tr = document.createElement("tr");
            if (row.pid === this._selected)
                tr.classList.add("on-selected");
            tr.addEventListener("click", () => {
                this._selected = row.pid;
                this._render();
            });
            tr.addEventListener("dblclick", () => this._kill_selected());

            const cells = [
                { text: String(row.pid), cls: "on-num on-muted" },
                { text: row.user, cls: "on-muted" },
                { text: row.cpu.toFixed(1), cls: "on-num" },
                { text: row.mem.toFixed(1), cls: "on-num" },
                { text: format_rss(row.rss), cls: "on-num on-muted" },
                { text: row.time, cls: "on-muted" },
                { text: row.command, cls: "" },
            ];
            cells.forEach((c, i) => {
                const td = document.createElement("td");
                td.className = c.cls;
                td.textContent = c.text;
                if (i === 2) {
                    const pill = document.createElement("span");
                    pill.className = "on-cpu-pill";
                    pill.style.color = cpu_color(row.cpu);
                    pill.textContent = c.text;
                    td.textContent = "";
                    td.appendChild(pill);
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        this._wrap.appendChild(table);
    }
}
