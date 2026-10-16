const NS = "http://www.w3.org/2000/svg";

const STOPS = [
    [0.0, [34, 197, 94]],
    [0.5, [245, 158, 11]],
    [1.0, [239, 68, 68]],
];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function load_color(fraction) {
    const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
    let lo = STOPS[0];
    let hi = STOPS[STOPS.length - 1];
    for (let i = 0; i < STOPS.length - 1; i++) {
        if (f >= STOPS[i][0] && f <= STOPS[i + 1][0]) {
            lo = STOPS[i];
            hi = STOPS[i + 1];
            break;
        }
    }
    const span = hi[0] - lo[0] || 1;
    const t = (f - lo[0]) / span;
    const c = lo[1].map((v, i) => Math.round(lerp(v, hi[1][i], t)));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/* A thin SVG ring gauge with requestAnimationFrame easing, so values glide
 * instead of jumping when a sample arrives.
 */
export class Ring {
    constructor({ title, unit = "%", onClick = null }) {
        this.radius = 56;
        this.circumference = 2 * Math.PI * this.radius;
        this.target = 0;
        this.displayed = 0;
        this._frame = null;
        this._onClick = onClick;

        this._card = document.createElement("div");
        this._card.className = "on-card on-ring-card" + (onClick ? " on-clickable" : "");

        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 132 132");
        svg.setAttribute("class", "on-ring-svg");

        const track = document.createElementNS(NS, "circle");
        track.setAttribute("class", "on-ring-track");
        track.setAttribute("cx", "66");
        track.setAttribute("cy", "66");
        track.setAttribute("r", String(this.radius));

        this._value = document.createElementNS(NS, "circle");
        this._value.setAttribute("class", "on-ring-value");
        this._value.setAttribute("cx", "66");
        this._value.setAttribute("cy", "66");
        this._value.setAttribute("r", String(this.radius));
        this._value.setAttribute("transform", "rotate(-90 66 66)");
        this._value.setAttribute("stroke-dasharray", String(this.circumference));
        this._value.setAttribute("stroke-dashoffset", String(this.circumference));

        const text = document.createElementNS(NS, "text");
        text.setAttribute("class", "on-ring-label");
        text.setAttribute("x", "66");
        text.setAttribute("y", "64");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        this._label = text;

        const unit_el = document.createElementNS(NS, "text");
        unit_el.setAttribute("class", "on-ring-unit");
        unit_el.setAttribute("x", "66");
        unit_el.setAttribute("y", "84");
        unit_el.setAttribute("text-anchor", "middle");
        unit_el.textContent = unit;

        svg.appendChild(track);
        svg.appendChild(this._value);
        svg.appendChild(text);
        svg.appendChild(unit_el);

        const title_el = document.createElement("div");
        title_el.className = "on-ring-title";
        title_el.textContent = title;

        this._card.appendChild(svg);
        this._card.appendChild(title_el);

        if (onClick)
            this._card.addEventListener("click", onClick);

        this._paint();
    }

    get element() {
        return this._card;
    }

    set(fraction) {
        this.target = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
        if (this._frame == null)
            this._frame = requestAnimationFrame(() => this._tick());
    }

    _tick() {
        this._frame = null;
        const diff = this.target - this.displayed;
        if (Math.abs(diff) < 0.0006) {
            this.displayed = this.target;
            this._paint();
            return;
        }
        this.displayed += diff * 0.14;
        this._paint();
        this._frame = requestAnimationFrame(() => this._tick());
    }

    _paint() {
        const frac = this.displayed;
        this._value.setAttribute("stroke-dashoffset", String(this.circumference * (1 - frac)));
        this._value.setAttribute("stroke", load_color(frac));
        this._label.textContent = String(Math.round(frac * 100));
    }
}
