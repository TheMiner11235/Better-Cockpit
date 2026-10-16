const STORAGE_KEY = "oled-nova:settings";

const DEFAULTS = {
    accent: "#a855f7",
    term_font_size: 14,
    term_font_family: "",
    term_theme: "stock",
    term_cursor_blink: true,
    term_cursor_style: "block",
    term_scrollback: 5000,
    term_meta: false,
    shell: "/bin/bash",
};

export const ACCENTS = [
    { name: "Nova", hex: "#a855f7" },
    { name: "Azure", hex: "#3b82f6" },
    { name: "Cyan", hex: "#06b6d4" },
    { name: "Lime", hex: "#22c55e" },
    { name: "Rose", hex: "#ec4899" },
    { name: "Ember", hex: "#f97316" },
    { name: "Crimson", hex: "#ef4444" },
];

/* "stock" is the classic Linux/Tango ANSI palette, matching a stock Cockpit
 * terminal. The others are alternative presets the user can opt into.
 */
export const TERM_THEMES = {
    stock: {
        name: "Stock (ANSI)",
        background: "#000000",
        foreground: "#e6e6e6",
        cursor: "#e6e6e6",
        selectionBackground: "#a855f744",
        black: "#2e3436",
        red: "#cc0000",
        green: "#4e9a06",
        yellow: "#c4a000",
        blue: "#3465a4",
        magenta: "#75507b",
        cyan: "#06989a",
        white: "#d3d7cf",
        brightBlack: "#555753",
        brightRed: "#ef2929",
        brightGreen: "#8ae234",
        brightYellow: "#fce94f",
        brightBlue: "#729fcf",
        brightMagenta: "#ad7fa8",
        brightCyan: "#34e2e2",
        brightWhite: "#eeeeec",
    },
    nova: {
        name: "OLED Nova",
        background: "#000000",
        foreground: "#e9e9f2",
        cursor: "#a855f7",
        selectionBackground: "#a855f744",
        black: "#0c0c12",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e9e9f2",
        brightBlack: "#5a5a72",
        brightRed: "#ff6b6b",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
    },
    solarized: {
        name: "Solarized Dark",
        background: "#002b36",
        foreground: "#839496",
        cursor: "#93a1a1",
        selectionBackground: "#073642",
        black: "#073642",
        red: "#dc322f",
        green: "#859900",
        yellow: "#b58900",
        blue: "#268bd2",
        magenta: "#d33682",
        cyan: "#2aa198",
        white: "#eee8d5",
        brightBlack: "#002b36",
        brightRed: "#cb4b16",
        brightGreen: "#586e75",
        brightYellow: "#657b83",
        brightBlue: "#839496",
        brightMagenta: "#6c71c4",
        brightCyan: "#93a1a1",
        brightWhite: "#fdf6e3",
    },
    dracula: {
        name: "Dracula",
        background: "#282a36",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        selectionBackground: "#44475a",
        black: "#21222c",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#bd93f9",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
    },
};

export const DEFAULT_MONO = "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function hex_to_rgb(hex) {
    const m = hex.replace("#", "");
    const full = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
}

function shade(rgb, amount) {
    return rgb.map(v => Math.max(0, Math.min(255, Math.round(v * (1 + amount)))));
}

export function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return { ...DEFAULTS };
        return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
        return { ...DEFAULTS };
    }
}

export function save(settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        /* storage disabled: keep in-memory only */
    }
}

export function apply(settings) {
    const rgb = hex_to_rgb(settings.accent);
    const root = document.documentElement;
    root.style.setProperty("--on-accent", settings.accent);
    root.style.setProperty("--on-accent-2", `rgb(${shade(rgb, -0.2).join(", ")})`);
    root.style.setProperty("--on-accent-soft", `rgba(${rgb.join(", ")}, 0.16)`);
}

export function term_theme(settings) {
    return TERM_THEMES[settings.term_theme] || TERM_THEMES.stock;
}

export function term_font_family(settings) {
    return settings.term_font_family && settings.term_font_family.trim()
        ? settings.term_font_family.trim()
        : DEFAULT_MONO;
}

function field(label_text, control) {
    const wrap = document.createElement("div");
    wrap.className = "on-field";
    const label = document.createElement("label");
    label.textContent = label_text;
    wrap.append(label, control);
    return wrap;
}

function make_select(options, value, on_change) {
    const sel = document.createElement("select");
    sel.className = "on-input on-select";
    for (const opt of options) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
    }
    sel.value = value;
    sel.addEventListener("change", () => on_change(sel.value));
    return sel;
}

/* Renders the settings modal into `host` and calls onChange(settings) whenever
 * something changes.
 */
export function open_settings(host, current, onChange) {
    const settings = { ...current };

    const backdrop = document.createElement("div");
    backdrop.className = "on-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "on-modal";

    const head = document.createElement("div");
    head.className = "on-modal-head";
    const title = document.createElement("div");
    title.className = "on-modal-title";
    title.textContent = "Terminal settings";
    const spacer = document.createElement("div");
    spacer.className = "on-spacer";
    const close = document.createElement("button");
    close.className = "on-icon-btn";
    close.textContent = "✕";
    head.append(title, spacer, close);

    const body = document.createElement("div");
    body.className = "on-modal-body";

    /* accent */
    const swatches = document.createElement("div");
    swatches.className = "on-swatches";
    ACCENTS.forEach(a => {
        const s = document.createElement("button");
        s.className = "on-swatch" + (a.hex === settings.accent ? " on-active" : "");
        s.style.background = a.hex;
        s.title = a.name;
        s.addEventListener("click", () => {
            settings.accent = a.hex;
            swatches.querySelectorAll(".on-swatch").forEach(el => el.classList.remove("on-active"));
            s.classList.add("on-active");
            update();
        });
        swatches.appendChild(s);
    });
    body.appendChild(field("Accent colour", swatches));

    /* theme preset */
    body.appendChild(field("Colour preset", make_select(
        Object.entries(TERM_THEMES).map(([value, t]) => ({ value, label: t.name })),
        settings.term_theme,
        value => {
            settings.term_theme = value;
            update();
        }
    )));

    /* font family */
    const font_input = document.createElement("input");
    font_input.className = "on-input";
    font_input.placeholder = DEFAULT_MONO;
    font_input.value = settings.term_font_family;
    font_input.addEventListener("change", () => {
        settings.term_font_family = font_input.value.trim();
        update();
    });
    body.appendChild(field("Font family (leave empty for default)", font_input));

    /* font size */
    const size_input = document.createElement("input");
    size_input.type = "number";
    size_input.min = "8";
    size_input.max = "40";
    size_input.className = "on-input";
    size_input.value = String(settings.term_font_size);
    size_input.addEventListener("change", () => {
        settings.term_font_size = Math.max(8, Math.min(40, parseInt(size_input.value) || 14));
        size_input.value = String(settings.term_font_size);
        update();
    });
    body.appendChild(field("Font size (px)", size_input));

    /* cursor style */
    body.appendChild(field("Cursor style", make_select(
        [
            { value: "block", label: "Block" },
            { value: "underline", label: "Underline" },
            { value: "bar", label: "Bar" },
        ],
        settings.term_cursor_style,
        value => {
            settings.term_cursor_style = value;
            update();
        }
    )));

    /* cursor blink + alt-as-meta */
    const toggles = document.createElement("div");
    toggles.className = "on-row-between";
    const mk_toggle = (label_text, key) => {
        const row = document.createElement("div");
        row.className = "on-row-between";
        const l = document.createElement("span");
        l.textContent = label_text;
        const btn = document.createElement("button");
        btn.className = "on-btn on-toggle" + (settings[key] ? " on-on" : "");
        btn.textContent = settings[key] ? "On" : "Off";
        btn.addEventListener("click", () => {
            settings[key] = !settings[key];
            btn.textContent = settings[key] ? "On" : "Off";
            btn.classList.toggle("on-on", settings[key]);
            update();
        });
        row.append(l, btn);
        return row;
    };
    toggles.append(mk_toggle("Blinking cursor", "term_cursor_blink"));
    body.appendChild(toggles);
    body.appendChild(mk_toggle("Alt sends Meta (⌥)", "term_meta"));

    /* scrollback */
    const sb_input = document.createElement("input");
    sb_input.type = "number";
    sb_input.min = "1000";
    sb_input.max = "200000";
    sb_input.step = "1000";
    sb_input.className = "on-input";
    sb_input.value = String(settings.term_scrollback);
    sb_input.addEventListener("change", () => {
        settings.term_scrollback = Math.max(1000, Math.min(200000, parseInt(sb_input.value) || 5000));
        sb_input.value = String(settings.term_scrollback);
        update();
    });
    body.appendChild(field("Scrollback lines", sb_input));

    /* shell */
    const shell_input = document.createElement("input");
    shell_input.className = "on-input";
    shell_input.value = settings.shell;
    shell_input.addEventListener("change", () => {
        settings.shell = shell_input.value.trim() || "/bin/bash";
        update();
    });
    body.appendChild(field("Default shell", shell_input));

    /* keybindings reference */
    const keys = document.createElement("div");
    keys.className = "on-hint";
    keys.innerHTML = "<b>Keybindings</b><br>" +
        "Ctrl+C interrupt &middot; Ctrl+D end session &middot; Ctrl+L clear &middot; " +
        "Ctrl+A start of line &middot; Ctrl+E end of line &middot; " +
        "Ctrl+Shift+C / Ctrl+Shift+V copy / paste &middot; F11 fullscreen";
    body.appendChild(keys);

    const hint = document.createElement("div");
    hint.className = "on-hint";
    hint.textContent = "Preferences are stored locally in this browser.";
    body.appendChild(hint);

    modal.append(head, body);
    backdrop.appendChild(modal);

    function close_modal() {
        backdrop.remove();
        document.removeEventListener("keydown", on_key);
    }

    function on_key(ev) {
        if (ev.key === "Escape")
            close_modal();
    }

    function update() {
        apply(settings);
        save(settings);
        onChange(settings);
    }

    close.addEventListener("click", close_modal);
    backdrop.addEventListener("mousedown", ev => {
        if (ev.target === backdrop)
            close_modal();
    });
    document.addEventListener("keydown", on_key);

    host.appendChild(backdrop);
}
