import cockpit from "cockpit";
import * as PK from "../lib/packagekit.js";
import { recommend } from "./lib/catalog.js";

cockpit.translate();

function compare_version(a, b) {
    const pa = String(a || "").split(/[.\-+~:]/);
    const pb = String(b || "").split(/[.\-+~:]/);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
        const xa = pa[i] || "";
        const xb = pb[i] || "";
        const na = /^\d+$/.test(xa) ? Number(xa) : null;
        const nb = /^\d+$/.test(xb) ? Number(xb) : null;
        if (na != null && nb != null) {
            if (na !== nb)
                return na - nb;
        } else {
            const c = xa.localeCompare(xb);
            if (c)
                return c;
        }
    }
    return 0;
}

const SEVERITY = {
    0: null,
    1: { cls: "on-sev-low", label: "Low" },
    2: { cls: "on-sev-mod", label: "Moderate" },
    3: { cls: "on-sev-imp", label: "Important" },
    4: { cls: "on-sev-crit", label: "Critical" },
};

function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)
        node.className = cls;
    if (text != null)
        node.textContent = text;
    return node;
}

function id_parts(id) {
    const p = id.split(";");
    return { name: p[0], version: p[1], arch: p[2] };
}

class SoftwareApp {
    constructor() {
        this.installed = null;
        this.available = null;
        this.updates = null;
        this.active = "updates";
        this._managers = null;
        this._av_page = 1;
        this._av_page_size = 50;
        this._av_filter = "";

        this.element = el("div", "on-page on-soft-page");

        this._busy = el("div", "on-busy on-soft-busy");
        const busy_box = el("div", "on-busy-box");
        this._busy_msg = el("div", "on-busy-msg", "Working…");
        const bar_wrap = el("div", "on-bar");
        this._busy_bar = el("div", "on-bar-fill");
        bar_wrap.appendChild(this._busy_bar);
        const cancel = el("button", "on-btn on-soft-cancel", "Cancel");
        cancel.addEventListener("click", () => { if (this._cancel) this._cancel(); });
        busy_box.append(this._busy_msg, bar_wrap, cancel);
        this._busy.appendChild(busy_box);

        this._build_tabs();
        this._build_panels();
        this.element.append(this._tabs, this._panels, this._busy);
    }

    /* ---------- chrome ---------- */

    _build_tabs() {
        this._tabs = el("div", "on-soft-tabs");
        const defs = [
            ["updates", "Updates"],
            ["installed", "Installed"],
            ["available", "Available"],
            ["recommended", "Recommended"],
        ];
        this._tab_btns = {};
        for (const [id, label] of defs) {
            const b = el("button", "on-soft-tab", label);
            b.dataset.tab = id;
            b.addEventListener("click", () => this._switch(id));
            this._tab_btns[id] = b;
            this._tabs.appendChild(b);
        }
        this._update_badge = el("span", "on-soft-badge", "0");
        this._update_badge.style.display = "none";
        this._tab_btns.updates.appendChild(this._update_badge);
    }

    _build_panels() {
        this._panels = el("div", "on-soft-panels");
        this._panel = {};

        /* updates */
        const up = el("div", "on-soft-panel");
        const up_bar = el("div", "on-soft-toolbar");
        this._update_all = el("button", "on-btn on-btn-primary", "Install all updates");
        this._update_all.addEventListener("click", () => this._install_updates(this.updates));
        this._refresh_btn = el("button", "on-btn", "Refresh");
        this._refresh_btn.addEventListener("click", () => this._reload(true));
        up_bar.append(this._update_all, this._refresh_btn);
        this._update_list = el("div", "on-list");
        up.append(up_bar, this._update_list);
        this._panel.updates = up;

        /* installed */
        const inst = el("div", "on-soft-panel");
        const inst_bar = el("div", "on-soft-toolbar");
        this._inst_search = el("input", "on-input on-grow");
        this._inst_search.placeholder = "Filter installed packages…";
        this._inst_search.addEventListener("input", () => this._render_installed());
        this._inst_count = el("span", "on-muted");
        inst_bar.append(this._inst_search, this._inst_count);
        this._installed_list = el("div", "on-list");
        inst.append(inst_bar, this._installed_list);
        this._panel.installed = inst;

        /* available */
        const av = el("div", "on-soft-panel");
        const av_bar = el("div", "on-soft-toolbar");
        this._av_search = el("input", "on-input on-grow");
        this._av_search.placeholder = "Filter packages in the repositories…";
        this._av_search.addEventListener("input", () => {
            this._av_filter = this._av_search.value.trim().toLowerCase();
            this._av_page = 1;
            this._render_available();
        });
        this._av_src = el("select", "on-select");
        this._av_src.title = "Filter by package manager";
        this._av_src.addEventListener("change", () => { this._av_page = 1; this._render_available() });
        this._av_sort = el("select", "on-select");
        this._av_sort.title = "Sort";
        for (const [v, l] of [["name", "Name ↑"], ["-name", "Name ↓"],
            ["version", "Version ↑"], ["-version", "Version ↓"], ["manager", "Source"]]) {
            const o = el("option", null, l);
            o.value = v;
            this._av_sort.appendChild(o);
        }
        this._av_sort.addEventListener("change", () => { this._av_page = 1; this._render_available() });
        this._av_count = el("span", "on-muted");
        av_bar.append(this._av_search, this._av_src, this._av_sort, this._av_count);
        this._av_pager_top = el("div", "on-pager");
        this._av_list = el("div", "on-list");
        this._av_pager_bot = el("div", "on-pager");
        av.append(av_bar, this._av_pager_top, this._av_list, this._av_pager_bot);
        this._panel.available = av;

        /* recommended */
        const rec = el("div", "on-soft-panel");
        this._rec_list = el("div", "on-list");
        rec.appendChild(this._rec_list);
        this._panel.recommended = rec;

        for (const id of Object.keys(this._panel))
            this._panels.appendChild(this._panel[id]);
    }

    _switch(id) {
        this.active = id;
        for (const k of Object.keys(this._tab_btns))
            this._tab_btns[k].classList.toggle("on-active", k === id);
        for (const k of Object.keys(this._panel))
            this._panel[k].classList.toggle("on-show", k === id);
        if (id === "installed")
            this._ensure_installed().then(() => this._render_installed());
        if (id === "available")
            this._ensure_available().then(() => this._render_available());
        if (id === "recommended")
            this._ensure_installed().then(() => this._render_recommended());
    }

    /* ---------- busy overlay ---------- */

    _busy_start(msg) {
        this._busy_msg.textContent = msg;
        this._busy_bar.style.width = "0%";
        this._cancel = null;
        this._busy.classList.add("on-show");
    }

    _busy_end() {
        this._busy.classList.remove("on-show");
    }

    _progress(msg) {
        this._busy_start(msg);
        return data => {
            if (data && data.percentage != null)
                this._busy_bar.style.width = Math.max(0, Math.min(100, data.percentage)) + "%";
            if (data && data.cancel)
                this._cancel = data.cancel;
            if (data && data.waiting)
                this._busy_msg.textContent = msg + " (waiting for PackageKit lock…)";
        };
    }

    /* ---------- data ---------- */

    async start() {
        this._switch("updates");
        this._busy_start("Loading updates…");
        try {
            await this._reload(false);
        } finally {
            this._busy_end();
        }
    }

    async _reload(force) {
        try {
            /* Refresh the PackageKit cache first, otherwise GetUpdates can
             * claim "up to date" against a stale cache. Failures (e.g. offline)
             * are non-fatal: we still try to list whatever is cached. */
            try {
                await PK.refresh(!!force, this._progress(force ? "Refreshing package cache…" : "Refreshing package list…"));
            } catch (e) {
                /* ignore: keep going with the cached update list */
            }
            this.updates = await PK.get_updates(false, this._progress("Checking for updates…"));
            this._render_updates();
            this._update_badge.textContent = String(this.updates.length);
            this._update_badge.style.display = this.updates.length ? "" : "none";
        } catch (ex) {
            this._update_list.replaceChildren(this._error_row(ex));
        } finally {
            this._busy_end();
        }
        if (force) {
            this.installed = null;
            if (this.active === "recommended")
                this._ensure_installed().then(() => this._render_recommended());
        }
    }

    async _ensure_installed() {
        if (this.installed)
            return this.installed;
        this._installed_list.replaceChildren(el("div", "on-empty", "Loading installed packages…"));
        const map = new Map();
        try {
            await PK.cancellableTransaction("GetPackages", [PK.Enum.FILTER_INSTALLED], null, {
                Package: (info, id, summary) => {
                    const p = id_parts(id);
                    map.set(p.name, { id, name: p.name, version: p.version, arch: p.arch, summary });
                }
            });
            this.installed = map;
        } catch (ex) {
            this._installed_list.replaceChildren(this._error_row(ex));
            this.installed = new Map();
        }
        return this.installed;
    }

    /* ---------- actions ---------- */

    async _install_ids(ids, label) {
        if (!ids.length)
            return;
        this._busy_start(`${label}…`);
        try {
            await PK.cancellableTransaction("InstallPackages", [0, ids], this._progress(`${label}…`));
            this._reload(true);
        } catch (ex) {
            this._toast(ex.detail || String(ex));
        } finally {
            this._busy_end();
        }
    }

    async _install_names(names) {
        const label = names.length === 1 ? `Installing ${names[0]}` : `Installing ${names.length} packages`;
        this._busy_start(`${label}…`);
        const ids = [];
        try {
            await PK.cancellableTransaction("Resolve",
                                            [PK.Enum.FILTER_ARCH | PK.Enum.FILTER_NOT_SOURCE | PK.Enum.FILTER_NEWEST | PK.Enum.FILTER_NOT_INSTALLED, names],
                                            this._progress("Resolving packages…"),
                                            { Package: (info, id) => ids.push(id) });
            if (!ids.length)
                throw new PK.TransactionError("not-found", "No matching package found");
            await PK.cancellableTransaction("InstallPackages", [0, ids], this._progress(`${label}…`));
            this._reload(true);
        } catch (ex) {
            this._toast(ex.detail || String(ex));
        } finally {
            this._busy_end();
        }
    }

    async _remove_names(names) {
        const label = names.length === 1 ? `Removing ${names[0]}` : `Removing ${names.length} packages`;
        this._busy_start(`${label}…`);
        const ids = [];
        try {
            await PK.cancellableTransaction("Resolve",
                                            [PK.Enum.FILTER_NOT_SOURCE | PK.Enum.FILTER_INSTALLED, names],
                                            this._progress("Resolving packages…"),
                                            { Package: (info, id) => ids.push(id) });
            if (ids.length)
                await PK.cancellableTransaction("RemovePackages", [0, ids, true, false], this._progress(`${label}…`));
            this.installed = null;
            this._reload(true);
            if (this.active === "installed")
                this._ensure_installed().then(() => this._render_installed());
        } catch (ex) {
            this._toast(ex.detail || String(ex));
        } finally {
            this._busy_end();
        }
    }

    async _install_updates(updates) {
        if (!updates || !updates.length)
            return;
        this._busy_start("Installing updates…");
        try {
            await PK.update_packages(updates, this._progress("Installing updates…"));
            this.installed = null;
            await this._reload(false);
        } catch (ex) {
            this._toast(ex.detail || (ex.messages ? ex.messages.join("\n") : String(ex)));
        } finally {
            this._busy_end();
        }
    }

    async _detect_managers() {
        if (this._managers)
            return this._managers;
        const found = ["apt"];
        try {
            const out = await cockpit.spawn(["sh", "-c",
                "for c in snap flatpak npm pip3; do command -v \"$c\" >/dev/null 2>&1 && echo \"$c\"; done"],
                                            { err: "message" });
            for (const line of out.split("\n")) {
                const c = line.trim();
                if (!c)
                    continue;
                found.push(c === "pip3" ? "pip" : c);
            }
        } catch (e) {
            /* detection is best-effort */
        }
        this._managers = found;
        return found;
    }

    async _ensure_available() {
        if (this.available)
            return this.available;
        this._av_list.replaceChildren(el("div", "on-empty", "Loading available packages…"));
        const map = new Map();
        try {
            await PK.cancellableTransaction(
                "GetPackages",
                [PK.Enum.FILTER_NOT_INSTALLED | PK.Enum.FILTER_NEWEST | PK.Enum.FILTER_ARCH | PK.Enum.FILTER_NOT_SOURCE],
                this._progress("Loading available packages…"),
                {
                    Package: (info, id, summary) => {
                        const p = id_parts(id);
                        map.set(p.name, { id, name: p.name, version: p.version, arch: p.arch, summary, manager: "apt", info });
                    }
                });
            this.available = map;
        } catch (ex) {
            this._av_list.replaceChildren(this._error_row(ex));
            this.available = new Map();
        }
        await this._load_extra_sources(map);
        this._populate_sources();
        return this.available;
    }

    /* Best-effort: pull in packages from other detected managers so the
     * "Source" column/sort is meaningful. Only flatpak can be listed
     * non-interactively; snap/npm/pip are shown as filters but not indexed. */
    async _load_extra_sources(map) {
        const managers = await this._detect_managers();
        if (!managers.includes("flatpak"))
            return;
        try {
            const out = await cockpit.spawn(["flatpak", "remote-ls", "--app",
                "--columns=application,version,description"], { err: "message" });
            for (const line of out.split("\n")) {
                const parts = line.split("\t");
                const name = (parts[0] || "").trim();
                if (!name)
                    continue;
                map.set("flatpak:" + name, {
                    id: "flatpak:" + name,
                    name,
                    version: (parts[1] || "").trim(),
                    arch: "",
                    summary: (parts[2] || "").trim(),
                    manager: "flatpak",
                    info: -1,
                });
            }
        } catch (e) {
            /* flatpak listing failed - ignore */
        }
    }

    _populate_sources() {
        const managers = this._managers || ["apt"];
        const cur = this._av_src.value;
        const all = el("option", null, "All sources");
        all.value = "";
        this._av_src.replaceChildren(all);
        for (const m of managers) {
            const o = el("option", null, m);
            o.value = m;
            this._av_src.appendChild(o);
        }
        if (cur && [...this._av_src.options].some(o => o.value === cur))
            this._av_src.value = cur;
    }

    _build_pager(container, pages, current, go) {
        container.replaceChildren();
        if (pages <= 1) {
            container.style.display = "none";
            return;
        }
        container.style.display = "";
        const btn = (label, page, opts = {}) => {
            const b = el("button", null, label);
            if (opts.active)
                b.classList.add("on-active");
            if (opts.disabled)
                b.disabled = true;
            b.addEventListener("click", () => go(page));
            container.appendChild(b);
        };
        const ellipsis = () => container.appendChild(el("span", "on-pager-ellipsis", "…"));
        btn("‹", Math.max(1, current - 1), { disabled: current === 1 });
        const nums = new Set([1, pages]);
        for (let p = current - 2; p <= current + 2; p++) {
            if (p >= 1 && p <= pages)
                nums.add(p);
        }
        let prev = 0;
        for (const p of [...nums].sort((a, b) => a - b)) {
            if (p - prev > 1)
                ellipsis();
            btn(String(p), p, { active: p === current });
            prev = p;
        }
        btn("›", Math.min(pages, current + 1), { disabled: current === pages });
    }

    _goto_page(p) {
        this._av_page = p;
        this._render_available();
        this._av_list.scrollTop = 0;
    }

    /* ---------- rendering ---------- */

    _error_row(ex) {
        return el("div", "on-error", "PackageKit error: " + (ex.detail || ex.message || String(ex)));
    }

    _render_updates() {
        const list = this._update_list;
        list.replaceChildren();
        if (!this.updates || this.updates.length === 0) {
            list.appendChild(el("div", "on-empty", "The system is up to date."));
            this._update_all.disabled = true;
            return;
        }
        this._update_all.disabled = false;
        for (const u of this.updates) {
            const row = el("div", "on-row on-soft-row");
            const main = el("div", "on-soft-row-main");
            const title = el("div", "on-soft-row-title");
            title.appendChild(el("span", "on-soft-name", u.name));
            title.appendChild(el("span", "on-muted", u.version));
            const sev = SEVERITY[u.severity];
            if (sev)
                title.appendChild(el("span", "on-sev " + sev.cls, sev.label));
            main.append(title, el("div", "on-soft-row-sub", u.summary || ""));
            row.appendChild(main);
            list.appendChild(row);
        }
    }

    _render_installed() {
        const list = this._installed_list;
        if (!this.installed)
            return;
        const filter = this._inst_search.value.trim().toLowerCase();
        const names = [...this.installed.keys()].sort();
        const match = names.filter(n => !filter || n.toLowerCase().includes(filter) ||
            (this.installed.get(n).summary || "").toLowerCase().includes(filter));
        this._inst_count.textContent = `${match.length} / ${names.length}`;
        list.replaceChildren();
        if (match.length === 0) {
            list.appendChild(el("div", "on-empty", "No installed packages match."));
            return;
        }
        for (const name of match.slice(0, 600)) {
            const pkg = this.installed.get(name);
            const row = el("div", "on-row on-soft-row");
            const main = el("div", "on-soft-row-main");
            const title = el("div", "on-soft-row-title");
            title.appendChild(el("span", "on-soft-name", pkg.name));
            title.appendChild(el("span", "on-muted", pkg.version));
            main.append(title, el("div", "on-soft-row-sub", pkg.summary || ""));
            const remove = el("button", "on-btn on-btn-danger", "Remove");
            remove.addEventListener("click", () => {
                if (window.confirm(`Remove ${pkg.name}?`))
                    this._remove_names([pkg.name]);
            });
            row.append(main, remove);
            list.appendChild(row);
        }
    }

    _render_available() {
        const list = this._av_list;
        if (!this.available)
            return;

        const src = this._av_src.value;
        let rows = [...this.available.values()];
        if (src)
            rows = rows.filter(r => r.manager === src);
        if (this._av_filter) {
            const f = this._av_filter;
            rows = rows.filter(r => r.name.toLowerCase().includes(f) ||
                (r.summary || "").toLowerCase().includes(f));
        }

        const sortv = this._av_sort.value || "name";
        const desc = sortv.startsWith("-");
        const key = desc ? sortv.slice(1) : sortv;
        rows.sort((a, b) => {
            let r;
            if (key === "version")
                r = compare_version(a.version, b.version);
            else if (key === "manager")
                r = String(a.manager).localeCompare(String(b.manager)) || a.name.localeCompare(b.name);
            else
                r = a.name.localeCompare(b.name);
            return desc ? -r : r;
        });

        const total = rows.length;
        const size = this._av_page_size;
        const pages = Math.max(1, Math.ceil(total / size));
        if (this._av_page > pages)
            this._av_page = pages;
        const start = (this._av_page - 1) * size;
        const page_rows = rows.slice(start, start + size);

        this._av_count.textContent = total ? `${total} package${total === 1 ? "" : "s"}` : "";
        this._build_pager(this._av_pager_top, pages, this._av_page, p => this._goto_page(p));
        this._build_pager(this._av_pager_bot, pages, this._av_page, p => this._goto_page(p));

        list.replaceChildren();
        if (!total) {
            list.appendChild(el("div", "on-empty", "No packages match."));
            return;
        }
        for (const r of page_rows)
            list.appendChild(this._available_row(r));
    }

    _available_row(r) {
        const row = el("div", "on-row on-soft-row");
        const main = el("div", "on-soft-row-main");
        const title = el("div", "on-soft-row-title");
        title.appendChild(el("span", "on-soft-name", r.name));
        if (r.version)
            title.appendChild(el("span", "on-muted", r.version));
        title.appendChild(el("span", "on-src", r.manager));
        main.append(title, el("div", "on-soft-row-sub", r.summary || ""));
        if (r.manager !== "apt") {
            row.append(main, el("span", "on-soft-installed", "via " + r.manager));
            return row;
        }
        const btn = el("button", "on-btn on-btn-primary", "Install");
        btn.addEventListener("click", () => this._install_ids([r.id], `Installing ${r.name}`));
        row.append(main, btn);
        return row;
    }

    _render_recommended() {
        const list = this._rec_list;
        list.replaceChildren();
        const installed = this.installed || new Map();
        const recs = recommend(new Set(installed.keys()));
        if (!recs.length) {
            list.appendChild(el("div", "on-empty", "No recommendations right now."));
            return;
        }
        list.appendChild(el("div", "on-soft-note",
                            "Based on the packages already installed on this system."));
        for (const r of recs) {
            const row = el("div", "on-row on-soft-row");
            const main = el("div", "on-soft-row-main");
            main.append(el("div", "on-soft-row-title", r.name), el("div", "on-soft-row-sub", r.reason));
            const btn = el("button", "on-btn on-btn-primary", "Install");
            btn.addEventListener("click", () => this._install_names([r.name]));
            row.append(main, btn);
            list.appendChild(row);
        }
    }

    _toast(msg) {
        const t = el("div", "on-toast", msg);
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
    }
}

function init() {
    const root = document.getElementById("oled-root");
    const app = new SoftwareApp();
    root.appendChild(app.element);
    app.start();
}

if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
else
    init();
