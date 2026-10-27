import { h, icon } from './ui/dom.js';
import { avatar, badge } from './ui/components.js';
import { confirmDialog } from './ui/modal.js';
import { state, theme, isAdmin } from './store.js';
import { resetDemoData, session } from './api/index.js';
import { navigate } from './router.js';

const NAV = [
    { href: '#/', label: 'Dashboard', icon: 'dashboard', active: (p) => p === '/' },
    { href: '#/projects', label: 'Projects', icon: 'folder', active: (p) => p.startsWith('/projects') },
    { href: '#/board', label: 'Board', icon: 'board', active: (p) => p.startsWith('/board') },
    { href: '#/users', label: 'Users', icon: 'users', active: (p) => p.startsWith('/users'), admin: true }
];

export function logout(reason) {
    session.token = null;
    state.user = null;
    navigate('/login', reason ? { reason } : undefined);
}

function demoBadge() {
    return h(
        'div',
        { class: 'demo-badge', role: 'status' },
        icon('info', 14),
        h('span', { class: 'demo-badge-text' }, 'Demo mode - data stays in your browser'),
        h('span', { class: 'demo-badge-short' }, 'Demo mode'),
        h(
            'button',
            {
                class: 'demo-reset',
                type: 'button',
                onclick: async () => {
                    const yes = await confirmDialog({
                        title: 'Reset demo data?',
                        message: 'All changes you made in this browser will be discarded and the original sample data is restored.',
                        confirmLabel: 'Reset demo',
                        danger: true
                    });
                    if (!yes) return;
                    await resetDemoData();
                    state.user = null;
                    window.location.hash = '#/login';
                    window.location.reload();
                }
            },
            'Reset'
        )
    );
}

/** Builds the authenticated application shell (sidebar, top bar, main area). */
export function buildShell() {
    const user = state.user;
    const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });

    const links = NAV.filter(item => !item.admin || isAdmin()).map(item => ({
        item,
        el: h('a', { class: 'nav-link', href: item.href }, icon(item.icon, 18), h('span', null, item.label))
    }));

    const sidebar = h(
        'aside',
        { class: 'sidebar', id: 'sidebar' },
        h(
            'a',
            { class: 'brand', href: '#/', 'aria-label': 'SEKCO home' },
            h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'S'),
            h('span', { class: 'brand-name' }, 'SEKCO')
        ),
        h('nav', { class: 'nav', 'aria-label': 'Main navigation' }, links.map(l => l.el)),
        h(
            'div',
            { class: 'sidebar-footer' },
            h(
                'a',
                { class: 'user-card', href: '#/profile', 'aria-label': 'Your profile' },
                avatar(user.name, 36),
                h('span', { class: 'user-card-text' }, h('span', { class: 'user-card-name' }, user.name), h('span', { class: 'user-card-role' }, user.role))
            )
        )
    );

    const backdrop = h('div', { class: 'sidebar-backdrop', onclick: () => setMenu(false) });
    const menuButton = h(
        'button',
        { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Open navigation', 'aria-controls': 'sidebar', 'aria-expanded': 'false', onclick: () => setMenu(!shell.classList.contains('menu-open')) },
        icon('menu', 20)
    );

    function setMenu(open) {
        shell.classList.toggle('menu-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
    }

    const themeButton = h('button', { class: 'icon-btn', type: 'button', onclick: () => theme.toggle() });
    const syncThemeButton = () => {
        const dark = theme.resolved === 'dark';
        themeButton.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
        themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        themeButton.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    };
    syncThemeButton();
    window.addEventListener('sekco:theme', syncThemeButton);

    const topbar = h(
        'header',
        { class: 'topbar' },
        menuButton,
        state.demo && demoBadge(),
        h('div', { class: 'topbar-spacer' }),
        h('span', { class: 'topbar-role' }, badge(user.role)),
        themeButton,
        h('a', { class: 'icon-btn', href: '#/profile', 'aria-label': 'Profile', title: 'Profile' }, icon('user', 18)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sign out', title: 'Sign out', onclick: () => logout() }, icon('logout', 18))
    );

    const shell = h(
        'div',
        { class: 'app-shell' },
        h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content'),
        sidebar,
        backdrop,
        h('div', { class: 'main-col' }, topbar, main)
    );

    return {
        el: shell,
        main,
        setActive(path) {
            for (const { item, el } of links) {
                const active = item.active(path);
                el.classList.toggle('active', active);
                if (active) el.setAttribute('aria-current', 'page');
                else el.removeAttribute('aria-current');
            }
            // The profile page is reached through the user card
            sidebar.querySelector('.user-card').classList.toggle('active', path === '/profile');
            setMenu(false);
        },
        destroy() {
            window.removeEventListener('sekco:theme', syncThemeButton);
        }
    };
}
