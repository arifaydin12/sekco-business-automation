import { h, mount, icon, fmtDate, relTime, debounce } from '../ui/dom.js';
import { avatar, badge, emptyState, errorState, field, applyFormErrors, formError, loadingState, pageHeader, pagination, withBusy } from '../ui/components.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { api } from '../api/index.js';
import { state } from '../store.js';
import { updateQuery } from '../router.js';

const ROLES = ['Admin', 'Manager', 'User'];
const PAGE_SIZE = 10;

function randomPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return `${[...bytes].map(b => alphabet[b % alphabet.length]).join('')}7`;
}

function userModal({ user, onSaved }) {
    const editing = !!user;
    const self = editing && user.id === state.user.id;
    openModal({
        title: editing ? `Edit ${user.name}` : 'Add user',
        render: (modal) => {
            const fields = {
                name: field('input', { label: 'Full name', name: 'name', value: user?.name || '', required: true, maxlength: 100, autocomplete: 'off' }),
                email: field('input', { label: 'Email address', name: 'email', type: 'email', value: user?.email || '', required: true, maxlength: 190, autocomplete: 'off' }),
                role: field('select', { label: 'Role', name: 'role', options: ROLES, value: user?.role || 'User', disabled: self, hint: self ? 'You cannot change your own role.' : undefined }),
                jobTitle: field('input', { label: 'Job title', name: 'jobTitle', value: user?.jobTitle || '', maxlength: 100 })
            };
            if (editing) {
                fields.status = field('select', { label: 'Status', name: 'status', options: ['Active', 'Inactive'], value: user.status, disabled: self });
            } else {
                fields.password = field('input', { label: 'Initial password', name: 'password', value: '', required: true, autocomplete: 'new-password', hint: 'At least 8 characters with a letter and a number. Share it securely; the user can change it in their profile.' });
            }
            const error = formError();
            const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save changes' : 'Create user');

            const form = h('form', {
                novalidate: true,
                onsubmit: async (event) => {
                    event.preventDefault();
                    error.hide();
                    const payload = {
                        name: fields.name.input.value.trim(),
                        email: fields.email.input.value.trim(),
                        role: fields.role.input.value,
                        jobTitle: fields.jobTitle.input.value.trim() || null
                    };
                    if (editing) payload.status = fields.status.input.value;
                    else payload.password = fields.password.input.value;
                    try {
                        await withBusy(submit, () => (editing ? api.users.update(user.id, payload) : api.users.create(payload)));
                        toast(editing ? 'User updated' : 'User created');
                        modal.close();
                        onSaved();
                    } catch (err) {
                        error.show(applyFormErrors(fields, err));
                    }
                }
            },
                h('div', { class: 'task-form-grid' },
                    h('div', { class: 'span-2' }, fields.name.el),
                    h('div', { class: 'span-2' }, fields.email.el),
                    fields.role.el,
                    editing ? fields.status.el : fields.jobTitle.el,
                    editing && h('div', { class: 'span-2' }, fields.jobTitle.el),
                    !editing && h('div', { class: 'span-2 field-with-action' }, fields.password.el,
                        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { fields.password.input.value = randomPassword(); fields.password.input.focus(); } }, icon('key', 14), 'Generate')
                    )
                ),
                error,
                h('div', { class: 'modal-actions' },
                    h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => modal.close() }, 'Cancel'),
                    submit
                )
            );
            return h('div', { class: 'modal-body' }, form);
        }
    });
}

function resetPasswordModal(user) {
    openModal({
        title: `Reset password for ${user.name}`,
        size: 'sm',
        render: (modal) => {
            const body = h('div', { class: 'modal-body' });
            const password = field('input', { label: 'New password (optional)', name: 'password', autocomplete: 'new-password', hint: 'Leave empty to generate a secure temporary password.' });
            const error = formError();
            const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Reset password');

            const showResult = (temporaryPassword) => {
                const output = h('input', { class: 'control mono', readonly: true, value: temporaryPassword, 'aria-label': 'Temporary password', onfocus: (e) => e.target.select() });
                mount(body,
                    h('p', null, 'Share this temporary password with the user through a secure channel. It is shown only once.'),
                    h('div', { class: 'copy-row' }, output,
                        h('button', {
                            class: 'btn btn-secondary',
                            type: 'button',
                            onclick: async () => {
                                try {
                                    await navigator.clipboard.writeText(temporaryPassword);
                                    toast('Password copied');
                                } catch {
                                    output.select();
                                    toast('Press Ctrl+C to copy', 'info');
                                }
                            }
                        }, icon('copy', 16), 'Copy')
                    ),
                    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': true, onclick: () => modal.close() }, 'Done'))
                );
            };

            mount(body,
                h('form', {
                    novalidate: true,
                    onsubmit: async (event) => {
                        event.preventDefault();
                        error.hide();
                        const value = password.input.value;
                        try {
                            const { data } = await withBusy(submit, () => api.users.resetPassword(user.id, value ? { password: value } : {}));
                            if (data.temporaryPassword) showResult(data.temporaryPassword);
                            else {
                                toast('Password updated');
                                modal.close();
                            }
                        } catch (err) {
                            error.show(applyFormErrors({ password }, err));
                        }
                    }
                },
                    h('p', null, 'The current password stops working immediately.'),
                    password.el,
                    error,
                    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => modal.close() }, 'Cancel'), submit)
                )
            );
            return body;
        }
    });
}

export async function renderUsers({ el, query }) {
    const filters = { q: query.q || '', role: query.role || '', status: query.status || '', page: Number(query.page) || 1 };

    const search = field('input', { label: 'Search users', name: 'q', type: 'search', value: filters.q, placeholder: 'Search by name or email' });
    const role = field('select', { label: 'Role', name: 'role', options: [{ value: '', label: 'All roles' }, ...ROLES], value: filters.role });
    const status = field('select', { label: 'Status', name: 'status', options: [{ value: '', label: 'All statuses' }, 'Active', 'Inactive'], value: filters.status });
    const results = h('div', { class: 'results' });

    mount(el,
        pageHeader({
            title: 'Users',
            subtitle: 'Accounts are created by administrators. There is no public sign-up.',
            actions: h('button', { class: 'btn btn-primary', type: 'button', onclick: () => userModal({ onSaved: load }) }, icon('plus', 16), 'Add user')
        }),
        h('div', { class: 'toolbar', role: 'search' }, h('div', { class: 'toolbar-search' }, search.el), role.el, status.el),
        results
    );

    async function setStatus(user, active) {
        if (!active) {
            const yes = await confirmDialog({ title: `Deactivate ${user.name}?`, message: 'They will be signed out and will not be able to sign in until you activate the account again. Their tasks and comments stay in place.', confirmLabel: 'Deactivate', danger: true });
            if (!yes) return;
        }
        try {
            await (active ? api.users.activate(user.id) : api.users.deactivate(user.id));
            toast(active ? `${user.name} activated` : `${user.name} deactivated`);
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function table(users) {
        return h('div', { class: 'table-wrap card card-flush' },
            h('table', { class: 'table table-users' },
                h('thead', null, h('tr', null, ['User', 'Role', 'Status', 'Last sign-in', ''].map((c, i) => h('th', { scope: 'col', class: i === 4 ? 'th-actions' : null }, c || h('span', { class: 'sr-only' }, 'Actions'))))),
                h('tbody', null,
                    users.map(u =>
                        h('tr', { class: u.status === 'Inactive' ? 'row-muted' : null },
                            h('td', null,
                                h('div', { class: 'person' }, avatar(u.name, 36),
                                    h('div', { class: 'person-text' }, h('span', { class: 'person-name' }, u.name, u.id === state.user.id && h('span', { class: 'you-tag' }, 'You')), h('span', { class: 'person-sub' }, u.email), u.jobTitle && h('span', { class: 'person-sub' }, u.jobTitle))
                                )
                            ),
                            h('td', null, badge(u.role)),
                            h('td', null, badge(u.status === 'Active' ? 'Active' : 'Inactive')),
                            h('td', { class: 'muted' }, u.lastLoginAt ? h('time', { datetime: u.lastLoginAt, title: fmtDate(u.lastLoginAt.slice(0, 10)) }, relTime(u.lastLoginAt)) : 'Never'),
                            h('td', null,
                                h('div', { class: 'row-actions' },
                                    u.id !== state.user.id && (u.status === 'Active'
                                        ? h('button', { class: 'btn btn-ghost-danger btn-sm', type: 'button', 'aria-label': `Deactivate ${u.name}`, onclick: () => setStatus(u, false) }, 'Deactivate')
                                        : h('button', { class: 'btn btn-secondary btn-sm', type: 'button', 'aria-label': `Activate ${u.name}`, onclick: () => setStatus(u, true) }, 'Activate')),
                                    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${u.name}`, title: 'Edit', onclick: () => userModal({ user: u, onSaved: load }) }, icon('edit', 16)),
                                    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Reset password for ${u.name}`, title: 'Reset password', onclick: () => resetPasswordModal(u) }, icon('key', 16))
                                )
                            )
                        )
                    )
                )
            )
        );
    }

    async function load() {
        results.replaceChildren(loadingState('table', 6));
        try {
            const { data, meta } = await api.users.list({ q: filters.q, role: filters.role, status: filters.status, page: filters.page, pageSize: PAGE_SIZE });
            if (data.length === 0 && meta.total > 0 && filters.page > 1) {
                filters.page = meta.totalPages;
                return load();
            }
            if (data.length === 0) {
                mount(results, emptyState({ iconName: 'users', title: 'No users found', text: 'Try a different search or filter.' }));
                return;
            }
            mount(results, table(data), pagination(meta, (page) => { filters.page = page; apply(); }, 'user'));
        } catch (error) {
            results.replaceChildren(errorState(error, load));
        }
    }

    function apply() {
        updateQuery({ q: filters.q || undefined, role: filters.role || undefined, status: filters.status || undefined, page: filters.page > 1 ? filters.page : undefined });
        return load();
    }

    search.input.addEventListener('input', debounce(() => { filters.q = search.input.value.trim(); filters.page = 1; apply(); }, 280));
    role.input.addEventListener('change', () => { filters.role = role.input.value; filters.page = 1; apply(); });
    status.input.addEventListener('change', () => { filters.status = status.input.value; filters.page = 1; apply(); });

    await load();
}
