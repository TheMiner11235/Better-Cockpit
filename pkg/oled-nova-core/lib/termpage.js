import cockpit from "cockpit";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apply, open_settings, term_font_family, term_theme } from "./settings.js";

/* A full-bleed terminal page with a small top-right gear (settings) and a
 * fullscreen toggle, matching the look of the stock Cockpit terminal.
 */
export class TerminalPage {
    constructor(settings) {
        this._settings = settings;
        this._channel = null;
        this._term = null;
        this._fit = null;
        this._home = "/";

        this.element = document.createElement("div");
        this.element.className = "on-term-page";

        this._wrap = document.createElement("div");
        this._wrap.className = "on-term-wrap";

        this._host = document.createElement("div");
        this._host.className = "on-term-host";
        this._wrap.appendChild(this._host);

        const bar = document.createElement("div");
        bar.className = "on-term-bar";

        this._fs_btn = document.createElement("button");
        this._fs_btn.className = "on-term-ctl";
        this._fs_btn.title = "Toggle fullscreen (F11)";
        this._fs_btn.textContent = "⛶";
        this._fs_btn.addEventListener("click", () => this._toggle_fullscreen());

        this._gear = document.createElement("button");
        this._gear.className = "on-term-ctl on-term-gear";
        this._gear.title = "Terminal settings";
        this._gear.textContent = "⚙";
        this._gear.addEventListener("click", () => this.open_settings());

        bar.append(this._fs_btn, this._gear);
        this._wrap.appendChild(bar);

        this.element.appendChild(this._wrap);

        this._resize_observer = new ResizeObserver(() => this._fit_term());
        this._on_fs_change = () => {
            if (this._fs_btn)
                this._fs_btn.classList.toggle("on-active", !!document.fullscreenElement);
            setTimeout(() => this._fit_term(), 60);
        };
    }

    async start(home) {
        this._home = home || "/";
        apply(this._settings);
        this._apply_term_bg();
        if (!this._term) {
            this._term = new Terminal({
                cursorBlink: this._settings.term_cursor_blink,
                cursorStyle: this._settings.term_cursor_style,
                fontSize: this._settings.term_font_size,
                fontFamily: term_font_family(this._settings),
                theme: term_theme(this._settings),
                scrollback: this._settings.term_scrollback,
                macOptionIsMeta: this._settings.term_meta,
                allowProposedApi: true,
            });
            this._fit = new FitAddon();
            this._term.loadAddon(this._fit);
            this._term.open(this._host);
            this._term.onData(data => {
                if (!this._channel || !this._channel.valid)
                    return;
                if (data === "\x00")
                    return;
                this._channel.send(new TextEncoder().encode(data));
            });
            this._resize_observer.observe(this._host);
            document.addEventListener("fullscreenchange", this._on_fs_change);
        }
        this._connect();
        this._fit_term();
    }

    open_settings() {
        open_settings(this.element, this._settings, next => {
            this._settings = next;
            this.apply_settings(next);
        });
    }

    apply_settings(settings) {
        this._settings = settings;
        this._apply_term_bg();
        if (this._term) {
            const opts = this._term.options;
            opts.fontSize = settings.term_font_size;
            opts.fontFamily = term_font_family(settings);
            opts.theme = term_theme(settings);
            opts.cursorBlink = settings.term_cursor_blink;
            opts.cursorStyle = settings.term_cursor_style;
            opts.scrollback = settings.term_scrollback;
            opts.macOptionIsMeta = settings.term_meta;
            this._fit_term();
        }
    }

    _apply_term_bg() {
        const theme = term_theme(this._settings);
        document.documentElement.style.setProperty("--on-term-bg", (theme && theme.background) || "#000000");
    }

    _toggle_fullscreen() {
        if (document.fullscreenElement)
            document.exitFullscreen();
        else
            document.documentElement.requestFullscreen().catch(() => {});
    }

    _connect() {
        if (this._channel) {
            this._channel.removeEventListener("close", this._on_close);
            this._channel.close();
            this._channel = null;
        }
        if (this._term)
            this._term.reset();

        const shell = this._settings.shell || "/bin/bash";
        this._channel = cockpit.channel({
            payload: "stream",
            spawn: [shell],
            environ: ["TERM=xterm-256color"],
            directory: this._home,
            pty: true,
            binary: true,
            superuser: "try",
        });

        this._channel.addEventListener("message", (_ev, data) => {
            if (this._term)
                this._term.write(data);
        });

        this._on_close = (_ev, options) => {
            if (this._term) {
                this._term.write("\x1b[31m" + (options.problem || "disconnected") + "\x1b[m\r\n");
                this._term.write("Reload the page to start a new shell.\r\n");
            }
        };
        this._channel.addEventListener("close", this._on_close);

        this._channel.addEventListener("ready", () => {
            this._fit_term();
            if (this._term)
                this._term.focus();
        });
    }

    _fit_term() {
        if (!this._fit || !this._term || !this._host.isConnected)
            return;
        try {
            this._fit.fit();
        } catch (e) {
            return;
        }
        if (this._channel && this._channel.valid) {
            this._channel.control({ window: { rows: this._term.rows, cols: this._term.cols } });
        }
    }

    stop() {
        this._resize_observer.disconnect();
        document.removeEventListener("fullscreenchange", this._on_fs_change);
        if (this._channel) {
            this._channel.close();
            this._channel = null;
        }
    }
}
