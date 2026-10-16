/*
 * A lightweight rolling line graph rendered on a canvas.
 *
 * Sampling is decoupled from drawing: samples arrive at whatever rate the
 * caller pushes them, while a requestAnimationFrame loop interpolates the
 * "head" value toward the newest sample with a small time-based lag
 * (tau ~= 150 ms) and repaints. This mirrors the TMOG smoothing approach used
 * by the rings.
 */

function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)
        node.className = cls;
    if (text != null)
        node.textContent = text;
    return node;
}

function nice_ceiling(v) {
    if (!Number.isFinite(v) || v <= 0)
        return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
}

export class Graph {
    constructor({
        title, unit = "", color = "#a855f7", min = 0, max = 100,
        window = 120, autoscale = false
    }) {
        this.unit = unit;
        this.min = min;
        this.max = max;
        this.autoscale = autoscale;
        this.window = window; /* history window in seconds */
        this._color = color;

        this._hist = [];
        this._target = 0;
        this._displayed = null;
        this._override = null;
        this._last = null;
        this._tau = 0.15;
        this._raf = null;
        this._peak = 0;

        this._card = el("div", "on-card on-graph-card");
        const head = el("div", "on-graph-head");
        this._title_el = el("div", "on-graph-title", title);
        this._val_el = el("div", "on-graph-val", "—");
        head.append(this._title_el, this._val_el);

        this._canvas = document.createElement("canvas");
        this._canvas.className = "on-graph-canvas";
        this._card.append(head, this._canvas);

        this._ctx = this._canvas.getContext("2d");
        this._ro = new ResizeObserver(() => this._draw());
        this._ro.observe(this._card);
    }

    get element() {
        return this._card;
    }

    push(value, text = null) {
        const v = Number.isFinite(value) ? value : 0;
        const now = performance.now();
        this._hist.push({ t: now, v });
        const cutoff = now - this.window * 1000;
        while (this._hist.length > 1 && this._hist[0].t < cutoff)
            this._hist.shift();

        this._target = v;
        this._override = text;
        if (this._displayed == null)
            this._displayed = v;
        if (this._raf == null)
            this._raf = requestAnimationFrame(n => this._step(n));
    }

    _step(now) {
        this._raf = null;
        if (this._last == null)
            this._last = now;
        const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
        this._last = now;
        const k = 1 - Math.exp(-dt / this._tau);
        const diff = this._target - this._displayed;
        this._draw();
        if (Math.abs(diff) < 1e-4) {
            this._displayed = this._target;
            return;
        }
        this._displayed += diff * k;
        this._raf = requestAnimationFrame(n => this._step(n));
    }

    _range() {
        let min = this.min;
        let max = this.max;
        if (this.autoscale) {
            let peak = 0;
            for (const p of this._hist)
                peak = Math.max(peak, p.v);
            this._peak = Math.max(this._peak * 0.98, peak);
            min = 0;
            max = nice_ceiling(this._peak) || 1;
        }
        if (max <= min)
            max = min + 1;
        return { min, max };
    }

    _draw() {
        const cv = this._canvas;
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        if (!w || !h)
            return;
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);
        if (cv.width !== pw)
            cv.width = pw;
        if (cv.height !== ph)
            cv.height = ph;

        const ctx = this._ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const { min, max } = this._range();
        const pad_top = 8;
        const pad_bot = 6;
        const plot_h = Math.max(1, h - pad_top - pad_bot);
        const Y = v => pad_top + (1 - (v - min) / (max - min)) * plot_h;

        /* horizontal grid at 0/50/100% */
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        for (const f of [0, 0.5, 1]) {
            const y = Math.round(Y(min + (max - min) * f)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        const n = this._hist.length;
        this._val_el.textContent = this._override != null
            ? this._override
            : `${Math.round(this._displayed)}${this.unit}`;

        if (n < 2)
            return;

        const tnow = this._hist[n - 1].t;
        const t0 = tnow - this.window * 1000;
        const span = this.window * 1000;
        const X = t => ((t - t0) / span) * w;

        /* filled area */
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, this._color + "55");
        grad.addColorStop(1, this._color + "00");
        ctx.beginPath();
        ctx.moveTo(X(this._hist[0].t), h);
        for (const p of this._hist)
            ctx.lineTo(X(p.t), Y(p.v));
        ctx.lineTo(X(this._hist[n - 1].t), h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        /* line */
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const p = this._hist[i];
            const x = X(p.t);
            const y = Y(p.v);
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.strokeStyle = this._color;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = "round";
        ctx.stroke();

        /* smoothed head dot */
        const head_y = Y(Math.max(min, Math.min(max, this._displayed)));
        ctx.beginPath();
        ctx.arc(w - 2, head_y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = this._color;
        ctx.fill();
    }

    destroy() {
        this._ro.disconnect();
        if (this._raf != null) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }
}
