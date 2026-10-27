import { h, icon } from './dom.js';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openCount = 0;

/**
 * Opens an accessible modal dialog (focus trap, Escape to close, focus restore).
 * `render(api)` must return the body element(s); api = { close, setTitle }.
 */
export function openModal({ title, render, size = 'md', onClose, labelledBy = 'modal-title' }) {
    const previouslyFocused = document.activeElement;
    let closed = false;

    const titleEl = h('h2', { class: 'modal-title', id: labelledBy }, title);
    const dialog = h('div', {
        class: ['modal', `modal-${size}`],
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': labelledBy,
        tabindex: '-1'
    });
    const backdrop = h('div', { class: 'modal-backdrop' }, dialog);

    function close(result) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.add('modal-leaving');
        setTimeout(() => backdrop.remove(), 120);
        openCount -= 1;
        if (openCount === 0) document.body.classList.remove('modal-open');
        if (previouslyFocused && previouslyFocused.focus && document.contains(previouslyFocused)) previouslyFocused.focus();
        if (onClose) onClose(result);
    }

    function onKey(event) {
        if (!backdrop.isConnected) return;
        // Only the top-most modal reacts
        const all = document.querySelectorAll('.modal-backdrop:not(.modal-leaving)');
        if (all[all.length - 1] !== backdrop) return;
        if (event.key === 'Escape') {
            event.stopPropagation();
            close();
        } else if (event.key === 'Tab') {
            const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    const api = {
        close,
        el: dialog,
        setTitle: (text) => {
            titleEl.textContent = text;
        }
    };

    dialog.appendChild(
        h(
            'header',
            { class: 'modal-header' },
            titleEl,
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close dialog', onclick: () => close() }, icon('x', 18))
        )
    );
    const body = render(api);
    dialog.appendChild(body);

    backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');
    openCount += 1;

    const autofocus = dialog.querySelector('[data-autofocus]') || dialog.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (autofocus || dialog).focus();
    return api;
}

/** Promise-based confirmation dialog. Resolves true when confirmed. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
        let answered = false;
        const answer = (value, modal) => {
            answered = true;
            resolve(value);
            modal.close();
        };
        openModal({
            title,
            size: 'sm',
            labelledBy: 'confirm-title',
            onClose: () => {
                if (!answered) resolve(false);
            },
            render: (modal) =>
                h(
                    'div',
                    { class: 'modal-body' },
                    h('p', { class: 'confirm-message' }, message),
                    h(
                        'div',
                        { class: 'modal-actions' },
                        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => answer(false, modal) }, 'Cancel'),
                        h(
                            'button',
                            { class: ['btn', danger ? 'btn-danger' : 'btn-primary'], type: 'button', 'data-autofocus': true, onclick: () => answer(true, modal) },
                            confirmLabel
                        )
                    )
                )
        });
    });
}
