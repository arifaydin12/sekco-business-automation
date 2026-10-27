import { h, mount, icon } from '../ui/dom.js';
import { field, formError, withBusy } from '../ui/components.js';
import { api, session } from '../api/index.js';
import { state, theme } from '../store.js';
import { navigate } from '../router.js';
import { toast } from '../ui/toast.js';

const DEMO_ACCOUNTS = [
    { label: 'Admin', email: 'alex.morgan@sekco.example', note: 'Full access, manages users' },
    { label: 'Manager', email: 'priya.nair@sekco.example', note: 'Leads projects and tasks' },
    { label: 'User', email: 'daniel.okafor@sekco.example', note: 'Works on assigned tasks' }
];
const DEMO_PASSWORD = 'Demo1234!';

const FEATURES = [
    ['board', 'Kanban boards', 'Drag tasks between To do, In progress and Done.'],
    ['trending', 'Live progress', 'Project progress is computed from finished tasks.'],
    ['shield', 'Role-based access', 'Admin, Manager and User roles keep work in the right hands.']
];

export async function renderLogin({ el, query }) {
    const email = field('input', { label: 'Email address', name: 'email', type: 'email', required: true, autocomplete: 'username', placeholder: 'you@company.com' });
    const password = field('input', { label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' });
    const error = formError();
    const submit = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Sign in');

    const form = h(
        'form',
        {
            class: 'login-form',
            novalidate: true,
            onsubmit: async (event) => {
                event.preventDefault();
                error.hide();
                email.setError('');
                password.setError('');
                if (!email.input.value.trim()) return email.setError('Enter your email address'), email.input.focus();
                if (!password.input.value) return password.setError('Enter your password'), password.input.focus();
                try {
                    const result = await withBusy(submit, () => api.login(email.input.value, password.input.value));
                    session.token = result.data.token;
                    state.user = result.data.user;
                    toast(`Welcome back, ${result.data.user.name.split(' ')[0]}!`);
                    const target = query && query.redirect && query.redirect.startsWith('/') ? query.redirect : '/';
                    navigate(target, undefined, { replace: true });
                } catch (err) {
                    error.show(err.message);
                    password.input.select();
                }
            }
        },
        email.el,
        password.el,
        error,
        submit
    );

    const demoBox =
        state.demo &&
        h(
            'div',
            { class: 'demo-accounts' },
            h('p', { class: 'demo-accounts-title' }, 'Try it with a demo account'),
            h(
                'div',
                { class: 'demo-account-list' },
                DEMO_ACCOUNTS.map(account =>
                    h(
                        'button',
                        {
                            type: 'button',
                            class: 'demo-account',
                            onclick: () => {
                                email.input.value = account.email;
                                password.input.value = DEMO_PASSWORD;
                                form.requestSubmit();
                            }
                        },
                        h('span', { class: 'demo-account-role' }, account.label),
                        h('span', { class: 'demo-account-note' }, account.note)
                    )
                )
            ),
            h('p', { class: 'demo-accounts-hint' }, `One click signs you in. Password for all accounts: ${DEMO_PASSWORD}`)
        );

    mount(
        el,
        h(
            'div',
            { class: 'login-page' },
            h(
                'section',
                { class: 'login-hero', 'aria-hidden': 'false' },
                h('div', { class: 'brand brand-light' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'S'), h('span', { class: 'brand-name' }, 'SEKCO')),
                h('div', { class: 'login-hero-copy' },
                    h('h2', null, 'Plan work. Track progress. Ship together.'),
                    h('p', null, 'SEKCO brings projects, tasks and your team into one clear workspace.'),
                    h('ul', { class: 'feature-list' },
                        FEATURES.map(([ic, title, text]) =>
                            h('li', null, h('span', { class: 'feature-icon' }, icon(ic, 18)), h('div', null, h('strong', null, title), h('span', null, text)))
                        )
                    )
                )
            ),
            h(
                'section',
                { class: 'login-panel' },
                h('button', {
                    class: 'icon-btn login-theme',
                    type: 'button',
                    'aria-label': 'Toggle dark mode',
                    title: 'Toggle dark mode',
                    onclick: () => theme.toggle()
                }, icon('moon', 18)),
                h(
                    'div',
                    { class: 'login-card' },
                    state.demo && h('div', { class: 'demo-badge demo-badge-login', role: 'status' }, icon('info', 14), h('span', { class: 'demo-badge-text' }, 'Demo mode - data stays in your browser')),
                    h('h1', { class: 'login-title', tabindex: '-1', id: 'page-title' }, 'Sign in to SEKCO'),
                    h('p', { class: 'login-subtitle' }, state.demo ? 'This is a live demo running entirely in your browser.' : 'Accounts are created by your administrator.'),
                    form,
                    demoBox
                )
            )
        )
    );
    email.input.focus({ preventScroll: true });
}
