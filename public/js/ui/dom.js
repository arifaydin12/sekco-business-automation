// Tiny DOM helpers: hyperscript-style element builder, SVG icons and formatting utilities.
// Elements are built with the DOM API (never innerHTML with user data), so values are always escaped.

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(el, props) {
    for (const [key, value] of Object.entries(props || {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') {
            el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
        } else if (key === 'style' && typeof value === 'object') {
            for (const [name, v] of Object.entries(value)) {
                if (name.startsWith('--')) el.style.setProperty(name, v);
                else el.style[name] = v;
            }
        } else if (key === 'dataset') {
            Object.assign(el.dataset, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') {
            // Properties are set after children exist (select values need their options)
        } else if (value === true) {
            el.setAttribute(key, '');
        } else {
            el.setAttribute(key, String(value));
        }
    }
}

function appendChildren(el, children) {
    for (const child of children) {
        if (child === null || child === undefined || child === false || child === true) continue;
        if (Array.isArray(child)) appendChildren(el, child);
        else if (child instanceof Node) el.appendChild(child);
        else el.appendChild(document.createTextNode(String(child)));
    }
}

function build(el, props, children) {
    if (props instanceof Node || Array.isArray(props) || typeof props !== 'object' || props === null) {
        if (props !== null && props !== undefined) children.unshift(props);
        props = null;
    }
    applyProps(el, props);
    appendChildren(el, children);
    if (props) {
        if ('value' in props && props.value != null) el.value = props.value;
        if ('checked' in props) el.checked = !!props.checked;
        if ('disabled' in props) el.disabled = !!props.disabled;
        if ('selected' in props) el.selected = !!props.selected;
    }
    return el;
}

/** h('div', { class: 'card', onclick }, child, 'text') */
export function h(tag, props, ...children) {
    return build(document.createElement(tag), props, children);
}

/** Same as h() but for SVG elements. */
export function svg(tag, props, ...children) {
    return build(document.createElementNS(SVG_NS, tag), props, children);
}

export function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

export function mount(el, ...children) {
    clear(el);
    appendChildren(el, children);
    return el;
}

// ---------- icons (24x24 stroke icons) ----------

const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    board: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="15" rx="1.5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
    chevronRight: '<path d="M9 18l6-6-6-6"/>',
    arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    trending: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>'
};

export function icon(name, size = 18, props = {}) {
    const el = svg('svg', {
        class: ['icon', props.class],
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        focusable: 'false'
    });
    el.innerHTML = ICONS[name] || '';
    return el;
}

// ---------- formatting ----------

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const parseDay = (str) => new Date(`${str}T00:00:00Z`);

/** "2026-10-27" -> "27 Oct 2026" */
export const fmtDate = (str) => (str ? dateFmt.format(parseDay(str)) : '');
export const fmtShortDate = (str) => (str ? shortDateFmt.format(parseDay(str)) : '');
export const fmtDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '');

export function relTime(iso) {
    if (!iso) return '';
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    return fmtDate(iso.slice(0, 10));
}

export const todayStr = () => new Date().toISOString().slice(0, 10);

/** Whole days from today (UTC) to the given YYYY-MM-DD date. Negative when in the past. */
export const daysUntil = (str) => Math.round((parseDay(str) - parseDay(todayStr())) / 86400000);

/** Human-readable due date status for a task. */
export function dueInfo(task) {
    if (!task.dueDate) return null;
    const d = daysUntil(task.dueDate);
    if (task.status === 'Done') return { text: fmtShortDate(task.dueDate), kind: 'done' };
    if (d < 0) return { text: d === -1 ? 'Overdue by 1 day' : `Overdue by ${-d} days`, short: fmtShortDate(task.dueDate), kind: 'overdue' };
    if (d === 0) return { text: 'Due today', short: 'Today', kind: 'soon' };
    if (d === 1) return { text: 'Due tomorrow', short: 'Tomorrow', kind: 'soon' };
    if (d <= 3) return { text: `Due in ${d} days`, short: fmtShortDate(task.dueDate), kind: 'soon' };
    return { text: `Due ${fmtDate(task.dueDate)}`, short: fmtShortDate(task.dueDate), kind: 'ok' };
}

export const initials = (name = '') =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join('');

export function hueFor(text = '') {
    let hash = 0;
    for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    return hash;
}

export function debounce(fn, wait = 250) {
    let timer;
    const debounced = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
