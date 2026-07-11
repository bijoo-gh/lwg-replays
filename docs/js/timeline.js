/**
 * Games-per-month activity timeline that doubles as the date-range filter.
 *
 * Single-series column chart, hand-rolled SVG. Drag across months to select
 * a range (click = one month); the selection is reported through
 * onRangeChange(startYm, endYm) — both inclusive 'YYYY-MM' — or (null, null)
 * when cleared. Selected months keep the series color, the rest drop to the
 * de-emphasis gray, so the active filter is visible in the chart itself.
 */
class ActivityTimeline {
    constructor(container, replays, onRangeChange) {
        this.container = container;
        this.onRangeChange = onRangeChange;
        this.months = this._aggregate(replays);
        this.selection = null;          // {a, b} indices, inclusive
        this.drag = null;

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tl-tooltip';
        this.container.appendChild(this.tooltip);

        this._render = this._render.bind(this);
        new ResizeObserver(() => this._render()).observe(this.container);
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', this._render);
        }
        this._render();
    }

    _aggregate(replays) {
        const byMonth = new Map();
        for (const r of replays) {
            const ym = (r.file_date || '').slice(0, 7);
            if (!/^\d{4}-\d{2}$/.test(ym)) continue;
            const m = byMonth.get(ym) || { count: 0, size: 0 };
            m.count += 1;
            m.size += r.file_size || 0;
            byMonth.set(ym, m);
        }
        const keys = [...byMonth.keys()].sort();
        if (!keys.length) return [];
        // continuous axis: fill the empty months between first and last
        const months = [];
        let [y, mo] = keys[0].split('-').map(Number);
        const last = keys[keys.length - 1];
        for (;;) {
            const ym = `${y}-${String(mo).padStart(2, '0')}`;
            const agg = byMonth.get(ym) || { count: 0, size: 0 };
            months.push({ ym, ...agg });
            if (ym === last) break;
            mo += 1;
            if (mo > 12) { mo = 1; y += 1; }
        }
        return months;
    }

    clear() { this._setSelection(null, true); }

    /** Select an inclusive 'YYYY-MM' range programmatically (clamped). */
    setRange(ymA, ymB) {
        const idx = ym => this.months.findIndex(m => m.ym === ym);
        let a = idx(ymA), b = idx(ymB);
        if (a === -1 && b === -1) return;
        if (a === -1) a = 0;
        if (b === -1) b = this.months.length - 1;
        this._setSelection({ a, b }, true);
    }

    _setSelection(sel, notify) {
        this.selection = sel;
        this._render();
        if (notify) {
            if (sel) {
                const a = this.months[Math.min(sel.a, sel.b)].ym;
                const b = this.months[Math.max(sel.a, sel.b)].ym;
                this.onRangeChange(a, b);
            } else {
                this.onRangeChange(null, null);
            }
        }
    }

    _css(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
    }

    _render() {
        const months = this.months;
        const old = this.container.querySelector('svg');
        if (old) old.remove();
        if (!months.length) return;

        const width = Math.max(this.container.clientWidth, 320);
        const plotH = 120, axisH = 22, padT = 18;
        const height = padT + plotH + axisH;
        const padL = 34, padR = 8;
        const plotW = width - padL - padR;
        const slot = plotW / months.length;
        const barW = Math.max(2, Math.min(24, slot - 2));
        const maxCount = Math.max(...months.map(m => m.count), 1);
        const yMax = this._niceMax(maxCount);
        const yScale = v => padT + plotH - (v / yMax) * plotH;

        const ink = {
            series: this._css('--series-1'),
            hover: this._css('--series-1-hover'),
            dim: this._css('--bar-dim'),
            grid: this._css('--gridline'),
            baseline: this._css('--baseline'),
            muted: this._css('--text-muted'),
            secondary: this._css('--text-secondary'),
        };

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label',
            `Games per month, ${months[0].ym} to ${months[months.length - 1].ym}`);

        const el = (tag, attrs, parent) => {
            const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
            (parent || svg).appendChild(node);
            return node;
        };

        // y gridlines + ticks (clean numbers, hairline, recessive)
        for (const v of [0, yMax / 2, yMax]) {
            const y = yScale(v);
            el('line', {
                x1: padL, x2: width - padR, y1: y, y2: y,
                stroke: v === 0 ? ink.baseline : ink.grid, 'stroke-width': 1,
                'shape-rendering': 'crispEdges',
            });
            if (v > 0) {
                const t = el('text', {
                    x: padL - 6, y: y + 4, 'text-anchor': 'end',
                    'font-size': 11, fill: ink.muted,
                    style: 'font-variant-numeric: tabular-nums',
                });
                t.textContent = String(v);
            }
        }

        // x labels: year under each January (and under the first month when
        // the series starts mid-year), "Jul" as the mid-year tick
        months.forEach((m, i) => {
            const [yy, mm] = m.ym.split('-');
            const isJan = mm === '01';
            const isFirst = i === 0 && !isJan;
            if (!isJan && !isFirst && mm !== '07') return;
            const x = padL + i * slot + slot / 2;
            const t = el('text', {
                x, y: padT + plotH + 15, 'text-anchor': 'middle',
                'font-size': 11, fill: ink.muted,
            });
            t.textContent = (isJan || isFirst) ? yy : 'Jul';
        });

        const inSel = i => !this.selection
            || (i >= Math.min(this.selection.a, this.selection.b)
                && i <= Math.max(this.selection.a, this.selection.b));

        // bars: rounded data-end, square baseline, surface gap via barW < slot
        const peak = months.reduce((p, m, i) => m.count > months[p].count ? i : p, 0);
        months.forEach((m, i) => {
            if (!m.count) return;
            const x = padL + i * slot + (slot - barW) / 2;
            const y = yScale(m.count);
            const h = padT + plotH - y;
            const r = Math.min(4, barW / 2, h);
            const fill = (this.selection && !inSel(i)) ? ink.dim : ink.series;
            el('path', {
                d: `M${x},${y + r}
                    a${r},${r} 0 0 1 ${r},-${r}
                    h${barW - 2 * r}
                    a${r},${r} 0 0 1 ${r},${r}
                    v${h - r} h${-barW} Z`,
                fill, 'data-i': i, class: 'tl-bar',
            });
        });

        // direct label on the peak month only
        if (months[peak].count) {
            const t = el('text', {
                x: padL + peak * slot + slot / 2, y: yScale(months[peak].count) - 5,
                'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600,
                fill: ink.secondary,
            });
            t.textContent = String(months[peak].count);
        }

        // hit layer: full-height transparent slots (hit target >> mark)
        months.forEach((m, i) => {
            const hit = el('rect', {
                x: padL + i * slot, y: padT, width: slot, height: plotH + axisH,
                fill: 'transparent', 'data-i': i, tabindex: m.count ? 0 : -1,
            });
            hit.addEventListener('pointerenter', () => this._hover(i, true));
            hit.addEventListener('pointerleave', () => this._hover(i, false));
            hit.addEventListener('focus', () => this._hover(i, true));
            hit.addEventListener('blur', () => this._hover(i, false));
            hit.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this._setSelection({ a: i, b: i }, true);
                }
            });
        });

        // brush: drag across slots to select a range, click for one month
        svg.addEventListener('pointerdown', e => {
            const i = this._slotAt(e, svg, padL, slot);
            if (i == null) return;
            this.drag = { a: i, b: i, moved: false };
            svg.setPointerCapture(e.pointerId);
        });
        svg.addEventListener('pointermove', e => {
            if (!this.drag) return;
            const i = this._slotAt(e, svg, padL, slot);
            if (i == null || i === this.drag.b) return;
            this.drag.b = i;
            this.drag.moved = true;
            this.selection = { a: this.drag.a, b: this.drag.b };
            this._render();
        });
        svg.addEventListener('pointerup', () => {
            if (!this.drag) return;
            this._setSelection({ a: this.drag.a, b: this.drag.b }, true);
            this.drag = null;
        });

        this.svg = svg;
        this.geo = { padL, slot, padT, plotH };
        this.container.appendChild(svg);
    }

    _slotAt(e, svg, padL, slot) {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
        const i = Math.floor((x - padL) / slot);
        return (i >= 0 && i < this.months.length) ? i : null;
    }

    _hover(i, on) {
        const m = this.months[i];
        const bar = this.svg.querySelector(`.tl-bar[data-i="${i}"]`);
        if (bar) {
            const inSel = !this.selection
                || (i >= Math.min(this.selection.a, this.selection.b)
                    && i <= Math.max(this.selection.a, this.selection.b));
            bar.setAttribute('fill', on ? this._css('--series-1-hover')
                : (this.selection && !inSel) ? this._css('--bar-dim')
                : this._css('--series-1'));
        }
        if (!on || !m) { this.tooltip.style.display = 'none'; return; }

        const [y, mo] = m.ym.split('-');
        const monthName = new Date(Number(y), Number(mo) - 1, 1)
            .toLocaleString('en', { month: 'long' });
        this.tooltip.replaceChildren();
        const v = document.createElement('div');
        v.className = 'tt-value';
        v.textContent = `${m.count} game${m.count === 1 ? '' : 's'}`;
        const l = document.createElement('div');
        l.textContent = `${monthName} ${y} · ${(m.size / 1048576).toFixed(1)} MB`;
        this.tooltip.append(v, l);

        const { padL, slot } = this.geo;
        const svgRect = this.svg.getBoundingClientRect();
        const scale = svgRect.width / this.svg.viewBox.baseVal.width;
        let left = (padL + i * slot + slot / 2) * scale - 40;
        left = Math.max(0, Math.min(left, this.container.clientWidth - 130));
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = '-8px';
        this.tooltip.style.display = 'block';
    }

    _niceMax(v) {
        const steps = [10, 20, 40, 50, 100, 150, 200, 300, 400, 500, 1000];
        for (const s of steps) if (v <= s) return s;
        return Math.ceil(v / 500) * 500;
    }
}
