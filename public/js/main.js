import { h, mount } from './ui/dom.js';
import { emptyState, errorState } from './ui/components.js';
import { toast } from './ui/toast.js';
import { api, initApi, session } from './api/index.js';
import { state, theme } from './store.js';
import { defineRoutes, navigate, startRouter } from './router.js';
import { buildShell } from './layout.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProjects } from './views/projects.js';
import { renderProject } from './views/project-detail.js';
import { renderBoard } from './views/board.js';
import { renderUsers } from './views/users.js';
import { renderProfile } from './views/profile.js';

const app = document.getElementById('app');
let shell = null;

const renderNotFound = ({ el }) =>
    mount(
        el,
        emptyState({
            iconName: 'search',
            title: 'Page not found',
            text: 'The page you are looking for does not exist.',
            action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to dashboard')
        })
    );

const ROUTES = [
    { path: '/login', title: 'Sign in', public: true, view: renderLogin },
    { path: '/', title: 'Dashboard', view: renderDashboard },
    { path: '/projects', title: 'Projects', view: renderProjects },
    { path: '/projects/:id', title: 'Project', view: renderProject },
    { path: '/board', title: 'Board', view: renderBoard },
    { path: '/users', title: 'Users', roles: ['Admin'], view: renderUsers },
    { path: '/profile', title: 'Profile', view: renderProfile },
    { path: '/:rest', title: 'Not found', notFound: true, view: renderNotFound }
];

function setTitle(text) {
    document.title = `${text} - SEKCO`;
}

function leaveShell() {
    if (shell) shell.destroy();
    shell = null;
}

async function onRoute({ route, params, query, path }) {
    // Guards
    if (!route.public && !state.user) {
        navigate('/login', path && path !== '/' ? { redirect: `${path}` } : undefined, { replace: true });
        return;
    }
    if (route.public && state.user) {
        navigate('/', undefined, { replace: true });
        return;
    }

    setTitle(route.title);

    if (route.public) {
        leaveShell();
        const el = h('div', { class: 'view-root' });
        mount(app, el);
        await renderLogin({ el, params, query, user: null });
        return;
    }

    if (!shell) {
        shell = buildShell();
        mount(app, shell.el);
    }
    shell.setActive(path);

    // Each navigation renders into a fresh element, so a slow view that finishes late cannot
    // overwrite the page the user has already moved to.
    const el = h('div', { class: 'view' });
    mount(shell.main, el);
    window.scrollTo(0, 0);

    if (route.roles && !route.roles.includes(state.user.role)) {
        mount(el, emptyState({ iconName: 'lock', title: 'No access', text: 'Your role does not allow you to open this page.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to dashboard') }));
        return;
    }

    try {
        await route.view({ el, params, query, user: state.user });
    } catch (error) {
        if (error && error.status === 401) return;
        console.error(error);
        mount(el, errorState(error, () => onRoute({ route, params, query, path })));
    }
    const heading = el.querySelector('#page-title');
    if (heading && el.isConnected) heading.focus({ preventScroll: true });
}

window.addEventListener('sekco:unauthorized', () => {
    if (state.user) {
        state.user = null;
        toast('Your session has expired. Please sign in again.', 'info');
        navigate('/login');
    }
});

async function boot() {
    theme.apply();
    try {
        const { demo } = await initApi();
        state.demo = demo;
    } catch (error) {
        console.error(error);
        mount(app, errorState(error, () => window.location.reload()));
        return;
    }
    defineRoutes(ROUTES);

    if (session.token) {
        try {
            state.user = (await api.me()).data;
        } catch {
            session.token = null;
        }
    }
    startRouter(onRoute);
}

boot();
