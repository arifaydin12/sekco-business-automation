import { h, icon } from './dom.js';

const ICON_FOR = { success: 'check', error: 'alert', info: 'info' };

function region() {
    let el = document.getElementById('toasts');
    if (!el) {
        el = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite', 'aria-atomic': 'false' });
        document.body.appendChild(el);
    }
    return el;
}

/** Shows a short notification. type: success | error | info */
export function toast(message, type = 'success', timeout = 4200) {
    const el = h(
        'div',
        { class: ['toast', `toast-${type}`], role: type === 'error' ? 'alert' : 'status' },
        icon(ICON_FOR[type] || 'info', 18),
        h('span', { class: 'toast-text' }, message),
        h(
            'button',
            { class: 'icon-btn toast-close', type: 'button', 'aria-label': 'Dismiss notification', onclick: () => dismiss() },
            icon('x', 14)
        )
    );
    let timer;
    function dismiss() {
        clearTimeout(timer);
        el.classList.add('toast-leaving');
        setTimeout(() => el.remove(), 180);
    }
    region().appendChild(el);
    timer = setTimeout(dismiss, timeout);
    return dismiss;
}
