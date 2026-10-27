import { h, svg, fmtShortDate } from './dom.js';

/**
 * Donut chart. segments: [{ label, value, tone }] where tone maps to the CSS class seg-<tone>.
 */
export function donutChart(segments, { size = 190, thickness = 22, centerLabel = 'tasks', ariaLabel } = {}) {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const r = (size - thickness) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const gap = total > 0 && segments.filter(s => s.value > 0).length > 1 ? 3 : 0;

    const chart = svg('svg', {
        class: 'donut',
        viewBox: `0 0 ${size} ${size}`,
        role: 'img',
        'aria-label': ariaLabel || `${total} ${centerLabel}: ${segments.map(s => `${s.value} ${s.label}`).join(', ')}`
    });
    chart.appendChild(svg('circle', { class: 'donut-track', cx: c, cy: c, r, fill: 'none', 'stroke-width': thickness }));

    let offset = 0;
    if (total > 0) {
        for (const s of segments) {
            if (s.value <= 0) continue;
            const length = (s.value / total) * circumference;
            chart.appendChild(
                svg(
                    'circle',
                    {
                        class: `donut-seg seg-${s.tone}`,
                        cx: c,
                        cy: c,
                        r,
                        fill: 'none',
                        'stroke-width': thickness,
                        'stroke-dasharray': `${Math.max(length - gap, 0.5)} ${circumference - Math.max(length - gap, 0.5)}`,
                        'stroke-dashoffset': -offset,
                        transform: `rotate(-90 ${c} ${c})`
                    },
                    svg('title', null, `${s.label}: ${s.value}`)
                )
            );
            offset += length;
        }
    }
    chart.appendChild(svg('text', { class: 'donut-total', x: c, y: c - 2, 'text-anchor': 'middle' }, String(total)));
    chart.appendChild(svg('text', { class: 'donut-caption', x: c, y: c + 20, 'text-anchor': 'middle' }, centerLabel));
    return chart;
}

/** Smooth path through points using Catmull-Rom to Bezier conversion. */
function smoothPath(points) {
    if (points.length < 2) return '';
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const t = 0.18;
        // Clamp control points between the two end points on the y axis so the curve never overshoots
        const lo = Math.min(p1[1], p2[1]);
        const hi = Math.max(p1[1], p2[1]);
        const clampY = (y) => Math.max(lo, Math.min(hi, y));
        const c1 = [p1[0] + (p2[0] - p0[0]) * t, clampY(p1[1] + (p2[1] - p0[1]) * t)];
        const c2 = [p2[0] - (p3[0] - p1[0]) * t, clampY(p2[1] - (p3[1] - p1[1]) * t)];
        d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
}

/**
 * Two-series area/line chart over days.
 * days: [{ date, created, completed }]
 */
export function activityChart(days) {
    const width = 640;
    const height = 230;
    const pad = { top: 14, right: 14, bottom: 28, left: 30 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const maxValue = Math.max(4, ...days.flatMap(d => [d.created, d.completed]));
    const yMax = Math.ceil(maxValue / 2) * 2;
    const x = (i) => pad.left + (days.length === 1 ? innerW / 2 : (i * innerW) / (days.length - 1));
    const y = (v) => pad.top + innerH - (v / yMax) * innerH;

    const root = svg('svg', {
        class: 'line-chart',
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': `Tasks created and completed per day over the last ${days.length} days`,
        preserveAspectRatio: 'xMidYMid meet'
    });

    const defs = svg('defs');
    for (const key of ['created', 'completed']) {
        defs.appendChild(
            svg(
                'linearGradient',
                { id: `grad-${key}`, x1: 0, y1: 0, x2: 0, y2: 1 },
                svg('stop', { class: `stop-${key}-top`, offset: '0%' }),
                svg('stop', { class: `stop-${key}-bottom`, offset: '100%' })
            )
        );
    }
    root.appendChild(defs);

    // grid + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
        const value = (yMax / ticks) * i;
        const yy = y(value);
        root.appendChild(svg('line', { class: 'chart-grid', x1: pad.left, x2: width - pad.right, y1: yy, y2: yy }));
        root.appendChild(svg('text', { class: 'chart-label', x: pad.left - 8, y: yy + 4, 'text-anchor': 'end' }, String(Math.round(value))));
    }
    // x labels
    days.forEach((d, i) => {
        if (i % 2 === 1 && i !== days.length - 1) return;
        root.appendChild(svg('text', { class: 'chart-label', x: x(i), y: height - 8, 'text-anchor': 'middle' }, fmtShortDate(d.date)));
    });

    for (const key of ['created', 'completed']) {
        const pts = days.map((d, i) => [Number(x(i).toFixed(1)), Number(y(d[key]).toFixed(1))]);
        const line = smoothPath(pts);
        const base = pad.top + innerH;
        root.appendChild(svg('path', { class: `area area-${key}`, d: `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`, fill: `url(#grad-${key})` }));
        root.appendChild(svg('path', { class: `series series-${key}`, d: line, fill: 'none' }));
        days.forEach((d, i) => {
            root.appendChild(
                svg('circle', { class: `dot dot-${key}`, cx: pts[i][0], cy: pts[i][1], r: 3.2 }, svg('title', null, `${fmtShortDate(d.date)} - ${key}: ${d[key]}`))
            );
        });
    }
    return h(
        'div',
        { class: 'chart-wrap' },
        root,
        h(
            'ul',
            { class: 'legend legend-inline' },
            h('li', null, h('span', { class: 'legend-swatch swatch-created' }), 'Created'),
            h('li', null, h('span', { class: 'legend-swatch swatch-completed' }), 'Completed')
        )
    );
}
