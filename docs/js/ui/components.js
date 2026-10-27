import { h, icon, initials, hueFor, plural } from './dom.js';

const slug = (text) => String(text).toLowerCase().replace(/\s+/g, '-');

/** Colored pill for statuses, priorities and roles. */
export function badge(text, extra) {
    return h('span', { class: ['badge', `badge-${slug(text)}`, extra] }, h('span', { class: 'badge-dot', 'aria-hidden': 'true' }), text);
}

export function priorityBadge(priority) {
    return h('span', { class: ['badge', 'badge-priority', `badge-${slug(priority)}`] }, icon('flag', 12), priority);
}

export function avatar(name, size = 28) {
    if (!name) {
        return h('span', { class: 'avatar avatar-empty', style: { width: `${size}px`, height: `${size}px` }, title: 'Unassigned', 'aria-label': 'Unassigned' }, icon('user', Math.round(size * 0.55)));
    }
    return h(
        'span',
        {
            class: 'avatar',
            title: name,
            'aria-label': name,
            style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px`, '--hue': hueFor(name) }
        },
        initials(name)
    );
}

export function userChip(name, size = 24) {
    return h('span', { class: 'user-chip' }, avatar(name, size), h('span', { class: 'user-chip-name' }, name || 'Unassigned'));
}

export function progressBar(percent, { label = true, tone } = {}) {
    const safe = Math.max(0, Math.min(100, percent));
    return h(
        'div',
        { class: ['progress', tone && `progress-${tone}`] },
        h(
            'div',
            { class: 'progress-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': safe, 'aria-label': `Progress ${safe}%` },
            h('div', { class: 'progress-fill', style: { width: `${safe}%` } })
        ),
        label && h('span', { class: 'progress-label' }, `${safe}%`)
    );
}

export function button(label, { variant = 'secondary', iconName, onClick, type = 'button', size, disabled, attrs = {} } = {}) {
    return h(
        'button',
        { class: ['btn', `btn-${variant}`, size && `btn-${size}`], type, onclick: onClick, disabled, ...attrs },
        iconName && icon(iconName, 16),
        label
    );
}

export function iconButton(iconName, label, onClick, extra) {
    return h('button', { class: ['icon-btn', extra], type: 'button', 'aria-label': label, title: label, onclick: onClick }, icon(iconName, 18));
}

// ---------- states ----------

export function emptyState({ iconName = 'inbox', title, text, action }) {
    return h(
        'div',
        { class: 'state state-empty' },
        h('div', { class: 'state-icon' }, icon(iconName, 28)),
        h('h3', { class: 'state-title' }, title),
        text && h('p', { class: 'state-text' }, text),
        action
    );
}

export function errorState(error, retry) {
    return h(
        'div',
        { class: 'state state-error', role: 'alert' },
        h('div', { class: 'state-icon' }, icon('alert', 28)),
        h('h3', { class: 'state-title' }, 'Something went wrong'),
        h('p', { class: 'state-text' }, (error && error.message) || 'The data could not be loaded.'),
        retry && button('Try again', { variant: 'primary', iconName: 'refresh', onClick: retry })
    );
}

const skeletonBlock = (cls) => h('div', { class: ['skeleton', cls] });

/** Placeholder content while data loads. kinds: cards | table | list | board | page */
export function loadingState(kind = 'list', count = 5) {
    const wrap = h('div', { class: `loading loading-${kind}`, 'aria-busy': 'true', 'aria-label': 'Loading' });
    const rows = Array.from({ length: count });
    if (kind === 'cards') {
        rows.forEach(() => wrap.appendChild(h('div', { class: 'card skeleton-card' }, skeletonBlock('sk-title'), skeletonBlock('sk-line'), skeletonBlock('sk-line sk-short'), skeletonBlock('sk-bar'))));
    } else if (kind === 'board') {
        for (let c = 0; c < 3; c++) {
            wrap.appendChild(h('div', { class: 'board-col skeleton-col' }, skeletonBlock('sk-title'), ...[0, 1, 2].map(() => skeletonBlock('sk-task'))));
        }
    } else if (kind === 'table') {
        rows.forEach(() => wrap.appendChild(skeletonBlock('sk-row')));
    } else {
        rows.forEach(() => wrap.appendChild(skeletonBlock('sk-line')));
    }
    wrap.appendChild(h('span', { class: 'sr-only' }, 'Loading...'));
    return wrap;
}

// ---------- pagination ----------

export function pagination(meta, onPage, noun = 'result') {
    if (!meta || meta.total === 0) return null;
    const from = (meta.page - 1) * meta.pageSize + 1;
    const to = Math.min(meta.total, meta.page * meta.pageSize);
    return h(
        'nav',
        { class: 'pagination', 'aria-label': 'Pagination' },
        h('span', { class: 'pagination-info' }, `${from}-${to} of ${plural(meta.total, noun)}`),
        h(
            'div',
            { class: 'pagination-controls' },
            h('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: meta.page <= 1, onclick: () => onPage(meta.page - 1) }, icon('chevronLeft', 14), 'Previous'),
            h('span', { class: 'pagination-page' }, `Page ${meta.page} of ${meta.totalPages}`),
            h('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: meta.page >= meta.totalPages, onclick: () => onPage(meta.page + 1) }, 'Next', icon('chevronRight', 14))
        )
    );
}

// ---------- forms ----------

let fieldCounter = 0;

/**
 * Labelled form control. kind: input | select | textarea.
 * Returns { el, input, setError }.
 */
export function field(kind, { label, name, type = 'text', value = '', options = [], required, hint, placeholder, disabled, rows = 4, autocomplete, maxlength, min, max }) {
    const id = `f-${name}-${++fieldCounter}`;
    const errorEl = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert' });
    let input;
    const describedBy = [hint ? `${id}-hint` : null, `${id}-err`].filter(Boolean).join(' ');
    const common = { id, name, required, disabled, 'aria-describedby': describedBy, class: 'control' };

    if (kind === 'select') {
        input = h(
            'select',
            { ...common, value },
            options.map(option => {
                const o = typeof option === 'object' ? option : { value: option, label: option };
                return h('option', { value: o.value }, o.label);
            })
        );
    } else if (kind === 'textarea') {
        input = h('textarea', { ...common, rows, placeholder, maxlength }, value ?? '');
    } else {
        input = h('input', { ...common, type, value: value ?? '', placeholder, autocomplete, maxlength, min, max });
    }

    const el = h(
        'div',
        { class: ['field', disabled && 'field-disabled'], 'data-field': name },
        h('label', { for: id, class: 'field-label' }, label, required && h('span', { class: 'field-required', 'aria-hidden': 'true' }, ' *')),
        input,
        hint && h('p', { class: 'field-hint', id: `${id}-hint` }, hint),
        errorEl
    );
    const setError = (message) => {
        errorEl.textContent = message || '';
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        el.classList.toggle('field-invalid', !!message);
    };
    return { el, input, setError };
}

/** Shows server validation errors on matching fields. Returns the message to show for unmatched errors. */
export function applyFormErrors(fields, error) {
    for (const f of Object.values(fields)) f.setError('');
    let general = error && error.message ? error.message : 'Something went wrong.';
    if (error && Array.isArray(error.details) && error.details.length) {
        let matched = 0;
        const seen = new Set();
        for (const detail of error.details) {
            const target = fields[detail.path];
            if (target) {
                matched += 1;
                if (seen.has(detail.path)) continue; // show the first problem per field only
                seen.add(detail.path);
                target.setError(detail.message);
            }
        }
        if (matched === error.details.length) general = 'Please fix the highlighted fields.';
        else general = error.details.map(d => d.message).join(' ');
    }
    return general;
}

export function formError() {
    const el = h('div', { class: 'form-error', role: 'alert', hidden: true });
    el.show = (message) => {
        el.textContent = message;
        el.hidden = false;
    };
    el.hide = () => {
        el.hidden = true;
        el.textContent = '';
    };
    return el;
}

/** Disables a submit button and shows a spinner label while an async action runs. */
export async function withBusy(btn, task) {
    const original = [...btn.childNodes];
    btn.disabled = true;
    btn.classList.add('btn-busy');
    btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Working...');
    try {
        return await task();
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-busy');
        btn.replaceChildren(...original);
    }
}

export function pageHeader({ title, subtitle, actions, back }) {
    return h(
        'header',
        { class: 'page-header' },
        h(
            'div',
            { class: 'page-header-text' },
            back && h('a', { class: 'back-link', href: back.href }, icon('arrowLeft', 14), back.label),
            h('h1', { class: 'page-title', tabindex: '-1', id: 'page-title' }, title),
            subtitle && h('p', { class: 'page-subtitle' }, subtitle)
        ),
        actions && h('div', { class: 'page-actions' }, actions)
    );
}

export function card({ title, subtitle, actions, class: cls, bodyClass } = {}, ...content) {
    return h(
        'section',
        { class: ['card', cls] },
        (title || actions) &&
            h(
                'header',
                { class: 'card-header' },
                h('div', null, title && h('h2', { class: 'card-title' }, title), subtitle && h('p', { class: 'card-subtitle' }, subtitle)),
                actions
            ),
        h('div', { class: ['card-body', bodyClass] }, content)
    );
}
