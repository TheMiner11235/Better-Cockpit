import cockpit from "cockpit";
import { upload } from "cockpit-upload-helper";
import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";

function join(dir, name) {
    if (dir.endsWith("/"))
        return dir + name;
    return dir + "/" + name;
}

function list_dir(path) {
    return new Promise((resolve, reject) => {
        const channel = cockpit.channel({ payload: "fslist1", path, superuser: "try", watch: false });
        const items = [];
        channel.addEventListener("message", (_ev, data) => {
            const item = JSON.parse(data);
            if (item && item.event === "present")
                items.push({ name: item.path, type: item.type });
        });
        channel.addEventListener("close", (_ev, data) => {
            if (data.problem)
                reject(new Error(data.message || data.problem));
            else
                resolve(items);
        });
    });
}

const LANG_BY_EXT = {
    js: () => javascript(),
    mjs: () => javascript(),
    cjs: () => javascript(),
    jsx: () => javascript({ jsx: true }),
    ts: () => javascript({ typescript: true }),
    tsx: () => javascript({ jsx: true, typescript: true }),
    json: () => json(),
    yml: () => yaml(),
    yaml: () => yaml(),
    md: () => markdown(),
    markdown: () => markdown(),
};

function language_for(path) {
    const ext = path.split(".").pop().toLowerCase();
    return LANG_BY_EXT[ext] ? LANG_BY_EXT[ext]() : [];
}

const editor_theme = EditorView.theme({
    "&": { backgroundColor: "#000000", color: "#e9e9f2", height: "100%" },
    ".cm-content": { caretColor: "#a855f7", fontFamily: "var(--on-mono)" },
    ".cm-gutters": { backgroundColor: "#060608", color: "#5a5a72", border: "none" },
    ".cm-activeLine": { backgroundColor: "#0c0c12" },
    ".cm-activeLineGutter": { backgroundColor: "#0c0c12" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#a855f744 !important" },
    ".cm-cursor": { borderLeftColor: "#a855f7" },
}, { dark: true });

export class FileStudio {
    constructor() {
        this._cwd = "/";
        this._home = "/";
        this._entries = [];
        this._selected = null;
        this._expanded = new Set(["/"]);
        this._tree_cache = new Map();

        this.element = document.createElement("div");
        this.element.className = "on-page on-files-page";

        const head = document.createElement("div");
        head.innerHTML = "<h2 class='on-view-title'>File Studio</h2>" +
            "<p class='on-view-sub'>Browse, edit (CodeMirror), upload and manage files. Right-click for actions.</p>";

        const layout = document.createElement("div");
        layout.className = "on-files-layout";

        const tree_panel = document.createElement("div");
        tree_panel.className = "on-panel";
        const tree_head = document.createElement("div");
        tree_head.className = "on-panel-head";
        tree_head.textContent = "Folders";
        this._tree = document.createElement("div");
        this._tree.className = "on-tree";
        tree_panel.append(tree_head, this._tree);

        const list_panel = document.createElement("div");
        list_panel.className = "on-panel";
        this._crumb = document.createElement("div");
        this._crumb.className = "on-breadcrumb";
        this._list = document.createElement("div");
        this._list.className = "on-list";
        this._list.tabIndex = 0;

        list_panel.append(this._crumb, this._list);
        layout.append(tree_panel, list_panel);

        this.element.append(head, layout);

        this._context = document.createElement("div");
        this._context.className = "on-context";
        document.body.appendChild(this._context);

        this._upload_input = document.createElement("input");
        this._upload_input.type = "file";
        this._upload_input.multiple = true;
        this._upload_input.style.display = "none";
        this._upload_input.addEventListener("change", () => this._do_upload([...this._upload_input.files]));
        this.element.appendChild(this._upload_input);

        this._list.addEventListener("contextmenu", ev => {
            ev.preventDefault();
            const row = ev.target.closest(".on-row");
            if (row) {
                this._selected = { name: row.dataset.name, type: row.dataset.type };
                this._render_list();
                this._show_context(ev.clientX, ev.clientY, true);
            } else {
                this._show_context(ev.clientX, ev.clientY, false);
            }
        });

        document.addEventListener("mousedown", ev => {
            if (!this._context.contains(ev.target))
                this._context.classList.remove("on-open");
        });
    }

    async start(home) {
        this._home = home || "/";
        this._cwd = this._home;
        await this._render_tree();
        await this.navigate(this._home);
    }

    stop() {
        this._context.classList.remove("on-open");
    }

    async navigate(dir) {
        this._cwd = dir;
        try {
            const items = await list_dir(dir);
            this._entries = items
                    .map(i => ({ name: i.name, type: i.type }))
                    .sort((a, b) => {
                        if (a.type !== b.type)
                            return a.type === "directory" ? -1 : 1;
                        return a.name.localeCompare(b.name);
                    });
        } catch (e) {
            this._entries = [];
            this._list_error = cockpit.message(e);
        }
        this._selected = null;
        this._render_crumb();
        this._render_list();

        if (!this._expanded.has(dir)) {
            this._expanded.add(dir);
            await this._render_tree();
        }
        this._mark_current();
    }

    _render_crumb() {
        this._crumb.textContent = "";
        const parts = this._cwd.split("/").filter(Boolean);
        const root_btn = document.createElement("button");
        root_btn.className = "on-crumb";
        root_btn.textContent = "🏠 /";
        root_btn.addEventListener("click", () => this.navigate("/"));
        this._crumb.appendChild(root_btn);

        let acc = "";
        parts.forEach((part, idx) => {
            acc += "/" + part;
            const sep = document.createElement("span");
            sep.className = "on-muted";
            sep.textContent = "/";
            this._crumb.appendChild(sep);
            const btn = document.createElement("button");
            const target = acc;
            btn.className = "on-crumb" + (idx === parts.length - 1 ? " on-crumb-last" : "");
            btn.textContent = part;
            btn.addEventListener("click", () => this.navigate(target));
            this._crumb.appendChild(btn);
        });
    }

    _render_list() {
        this._list.textContent = "";
        if (this._list_error) {
            const err = document.createElement("div");
            err.className = "on-empty on-error";
            err.textContent = this._list_error;
            this._list.appendChild(err);
            return;
        }
        if (!this._entries.length) {
            const empty = document.createElement("div");
            empty.className = "on-empty";
            empty.textContent = "Empty folder";
            this._list.appendChild(empty);
            return;
        }
        for (const entry of this._entries) {
            const row = document.createElement("div");
            row.className = "on-row" + (this._selected && this._selected.name === entry.name && this._selected.type === entry.type ? " on-selected" : "");
            row.dataset.name = entry.name;
            row.dataset.type = entry.type;

            const ico = document.createElement("span");
            ico.className = "on-fico";
            ico.textContent = entry.type === "directory" ? "📁" : "📄";

            const name = document.createElement("span");
            name.className = "on-row-name";
            name.textContent = entry.name;

            const meta = document.createElement("span");
            meta.className = "on-row-meta";
            meta.textContent = entry.type === "directory" ? "dir" : "file";

            row.append(ico, name, meta);
            row.addEventListener("click", () => {
                this._selected = entry;
                this._render_list();
            });
            row.addEventListener("dblclick", () => {
                if (entry.type === "directory")
                    this.navigate(join(this._cwd, entry.name));
                else
                    this._open_editor(join(this._cwd, entry.name));
            });
            this._list.appendChild(row);
        }
    }

    async _render_tree() {
        this._tree.textContent = "";
        const root = document.createElement("div");
        root.className = "on-tree-node";
        root.innerHTML = "<span class='on-caret'>▾</span><span>🏠 /</span>";
        root.addEventListener("click", () => this.navigate("/"));
        this._tree.appendChild(root);
        await this._append_tree_child(this._tree, "/");
    }

    async _append_tree_child(container, dir) {
        let items;
        try {
            items = await list_dir(dir);
        } catch (e) {
            return;
        }
        const dirs = items
                .filter(i => i.type === "directory")
                .sort((a, b) => a.name.localeCompare(b.name));

        for (const d of dirs) {
            const path = join(dir, d.name);
            const node = document.createElement("div");
            node.className = "on-tree-node" + (this._cwd === path ? " on-current" : "");
            node.dataset.path = path;

            const caret = document.createElement("span");
            caret.className = "on-caret";
            caret.textContent = this._expanded.has(path) ? "▾" : "▸";
            const label = document.createElement("span");
            label.textContent = "📁 " + d.name;
            node.append(caret, label);

            const children = document.createElement("div");
            children.className = "on-tree-children";
            children.style.display = this._expanded.has(path) ? "" : "none";

            caret.addEventListener("click", ev => {
                ev.stopPropagation();
                if (this._expanded.has(path)) {
                    this._expanded.delete(path);
                    caret.textContent = "▸";
                    children.style.display = "none";
                } else {
                    this._expanded.add(path);
                    caret.textContent = "▾";
                    children.style.display = "";
                    if (!children.dataset.loaded) {
                        children.dataset.loaded = "1";
                        this._append_tree_child(children, path);
                    }
                }
            });

            node.addEventListener("click", () => this.navigate(path));

            container.append(node, children);
            if (this._expanded.has(path) && !children.dataset.loaded) {
                children.dataset.loaded = "1";
                await this._append_tree_child(children, path);
            }
        }
    }

    _mark_current() {
        this._tree.querySelectorAll(".on-tree-node").forEach(node => {
            node.classList.toggle("on-current", node.dataset.path === this._cwd);
        });
    }

    _show_context(x, y, on_entry) {
        this._context.textContent = "";
        const add = (label, danger, handler) => {
            const btn = document.createElement("button");
            btn.textContent = label;
            if (danger)
                btn.className = "on-danger";
            btn.addEventListener("click", () => {
                this._context.classList.remove("on-open");
                handler();
            });
            this._context.appendChild(btn);
        };
        const hr = () => this._context.appendChild(document.createElement("hr"));

        if (on_entry && this._selected) {
            const path = join(this._cwd, this._selected.name);
            if (this._selected.type === "file")
                add("Open", false, () => this._open_editor(path));
            add("Delete", true, () => this._delete(path, this._selected.name));
            hr();
        }
        add("Create folder", false, () => this._prompt_create_folder());
        add("Add empty file", false, () => this._prompt_create_file());
        add("Upload files…", false, () => this._upload_input.click());

        this._context.classList.add("on-open");
        const rect = this._context.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 8;
        const maxY = window.innerHeight - rect.height - 8;
        this._context.style.left = Math.min(x, maxX) + "px";
        this._context.style.top = Math.min(y, maxY) + "px";
    }

    _prompt_create_folder() {
        const name = window.prompt("New folder name:");
        if (!name)
            return;
        cockpit.spawn(["mkdir", "-p", "--", join(this._cwd, name)], { superuser: "try", err: "message" })
                .then(() => this.navigate(this._cwd))
                .catch(e => window.alert(`Could not create folder: ${cockpit.message(e)}`));
    }

    _prompt_create_file() {
        const name = window.prompt("New file name:");
        if (!name)
            return;
        cockpit.file(join(this._cwd, name), { superuser: "try" })
                .replace("")
                .then(() => {
                    this.navigate(this._cwd);
                    this._open_editor(join(this._cwd, name));
                })
                .catch(e => window.alert(`Could not create file: ${cockpit.message(e)}`));
    }

    _delete(path, name) {
        if (!window.confirm(`Delete "${name}"? This cannot be undone.`))
            return;
        cockpit.spawn(["rm", "-rf", "--", path], { superuser: "try", err: "message" })
                .then(() => this.navigate(this._cwd))
                .catch(e => window.alert(`Could not delete: ${cockpit.message(e)}`));
    }

    async _do_upload(files) {
        if (!files.length)
            return;
        const progress_modal = this._make_progress_modal(files.length);
        let done = 0;
        for (const file of files) {
            const dest = join(this._cwd, file.name);
            try {
                await upload(dest, file, bytes => progress_modal.set(file.name, bytes / file.size), undefined, { superuser: "try" });
            } catch (e) {
                window.alert(`Upload of ${file.name} failed: ${cockpit.message(e)}`);
            }
            done += 1;
            progress_modal.step(done);
        }
        progress_modal.close();
        this._upload_input.value = "";
        this.navigate(this._cwd);
    }

    _make_progress_modal(total) {
        const backdrop = document.createElement("div");
        backdrop.className = "on-modal-backdrop";
        const modal = document.createElement("div");
        modal.className = "on-modal";
        const body = document.createElement("div");
        body.className = "on-modal-body";
        const title = document.createElement("div");
        title.className = "on-modal-title";
        title.textContent = `Uploading ${total} file(s)…`;
        const status = document.createElement("div");
        status.className = "on-hint";
        status.textContent = "";
        const bar = document.createElement("div");
        bar.className = "on-progress";
        const fill = document.createElement("i");
        bar.appendChild(fill);
        body.append(title, status, bar);
        modal.appendChild(body);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        return {
            set(name, frac) {
                status.textContent = `${name} — ${Math.round(frac * 100)}%`;
                fill.style.width = `${Math.min(100, frac * 100)}%`;
            },
            step(done) {
                fill.style.width = "100%";
                status.textContent = `${done}/${total} complete`;
            },
            close() {
                backdrop.remove();
            },
        };
    }

    async _open_editor(path) {
        const backdrop = document.createElement("div");
        backdrop.className = "on-modal-backdrop";

        const modal = document.createElement("div");
        modal.className = "on-modal on-modal-wide";

        const head = document.createElement("div");
        head.className = "on-modal-head";
        const title = document.createElement("div");
        title.className = "on-modal-title";
        title.textContent = path;
        const spacer = document.createElement("div");
        spacer.className = "on-spacer";
        const close = document.createElement("button");
        close.className = "on-icon-btn";
        close.textContent = "✕";
        head.append(title, spacer, close);

        const body = document.createElement("div");
        body.className = "on-modal-body";
        const host = document.createElement("div");
        host.className = "on-editor-host";
        body.appendChild(host);

        const foot = document.createElement("div");
        foot.className = "on-modal-foot";
        const status = document.createElement("span");
        status.className = "on-busy";
        const reload = document.createElement("button");
        reload.className = "on-btn";
        reload.textContent = "Reload";
        const save = document.createElement("button");
        save.className = "on-btn on-btn-primary";
        save.textContent = "Save";
        foot.append(status, reload, save);
        foot.style.justifyContent = "space-between";

        modal.append(head, body, foot);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        let view = null;
        let dirty = false;
        let original = "";

        const file = cockpit.file(path, { superuser: "try" });

        const load = async () => {
            status.textContent = "Loading…";
            try {
                const text = await file.read();
                original = text == null ? "" : text;
                if (view)
                    view.destroy();
                view = new EditorView({
                    parent: host,
                    state: EditorState.create({
                        doc: original,
                        extensions: [
                            basicSetup,
                            editor_theme,
                            language_for(path),
                            keymap.of([{
                                key: "Mod-s",
                                preventDefault: true,
                                run: () => {
                                    do_save();
                                    return true;
                                },
                            }]),
                            EditorView.updateListener.of(u => {
                                if (u.docChanged) {
                                    dirty = true;
                                    status.textContent = "Unsaved changes";
                                }
                            }),
                        ],
                    }),
                });
                view.focus();
                status.textContent = "";
                dirty = false;
            } catch (e) {
                status.textContent = "";
                body.querySelector(".on-error")?.remove();
                const err = document.createElement("div");
                err.className = "on-error";
                err.textContent = `Could not read file: ${cockpit.message(e)}`;
                body.insertBefore(err, host);
            }
        };

        const do_save = async () => {
            if (!view)
                return;
            status.textContent = "Saving…";
            try {
                await file.replace(view.state.doc.toString());
                original = view.state.doc.toString();
                dirty = false;
                status.textContent = "Saved";
                setTimeout(() => {
                    if (status.textContent === "Saved")
                        status.textContent = "";
                }, 1500);
            } catch (e) {
                status.textContent = `Save failed: ${cockpit.message(e)}`;
            }
        };

        const close_modal = () => {
            if (dirty && !window.confirm("Discard unsaved changes?"))
                return;
            file.close();
            if (view)
                view.destroy();
            backdrop.remove();
            document.removeEventListener("keydown", on_key);
        };
        const on_key = ev => {
            if (ev.key === "Escape")
                close_modal();
        };

        close.addEventListener("click", close_modal);
        reload.addEventListener("click", load);
        save.addEventListener("click", do_save);
        backdrop.addEventListener("mousedown", ev => {
            if (ev.target === backdrop)
                close_modal();
        });
        document.addEventListener("keydown", on_key);

        await load();
    }
}
