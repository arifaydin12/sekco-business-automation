import { h, mount, icon, fmtDate, relTime } from '../ui/dom.js';
import { avatar, badge, card, field, applyFormErrors, formError, pageHeader, withBusy } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { api } from '../api/index.js';
import { state, theme } from '../store.js';

export async function renderProfile({ el }) {
    const { data: me } = await api.me();
    state.user = { ...state.user, ...me };

    // ----- profile form -----
    const profileFields = {
        name: field('input', { label: 'Full name', name: 'name', value: me.name, required: true, maxlength: 100, autocomplete: 'name' }),
        jobTitle: field('input', { label: 'Job title', name: 'jobTitle', value: me.jobTitle || '', maxlength: 100, autocomplete: 'organization-title' })
    };
    const profileError = formError();
    const profileSave = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save profile');
    const profileForm = h('form', {
        novalidate: true,
        onsubmit: async (event) => {
            event.preventDefault();
            profileError.hide();
            try {
                const { data } = await withBusy(profileSave, () => api.updateProfile({ name: profileFields.name.input.value.trim(), jobTitle: profileFields.jobTitle.input.value.trim() || null }));
                state.user = { ...state.user, ...data };
                toast('Profile updated');
                // refresh sidebar and header text
                document.querySelectorAll('.user-card-name').forEach(n => { n.textContent = data.name; });
                el.querySelector('.profile-name').textContent = data.name;
            } catch (err) {
                profileError.show(applyFormErrors(profileFields, err));
            }
        }
    },
        h('div', { class: 'task-form-grid' }, profileFields.name.el, profileFields.jobTitle.el),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Email address'), h('p', { class: 'static-value' }, me.email), h('p', { class: 'field-hint' }, 'Your email is your sign-in name. Ask an administrator to change it.')),
        profileError,
        h('div', { class: 'modal-actions' }, profileSave)
    );

    // ----- password form -----
    const pw = {
        currentPassword: field('input', { label: 'Current password', name: 'currentPassword', type: 'password', required: true, autocomplete: 'current-password' }),
        newPassword: field('input', { label: 'New password', name: 'newPassword', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters, with a letter and a number.' }),
        confirm: field('input', { label: 'Confirm new password', name: 'confirm', type: 'password', required: true, autocomplete: 'new-password' })
    };
    const pwError = formError();
    const pwSave = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Change password');
    const pwForm = h('form', {
        novalidate: true,
        onsubmit: async (event) => {
            event.preventDefault();
            pwError.hide();
            for (const f of Object.values(pw)) f.setError('');
            if (pw.newPassword.input.value !== pw.confirm.input.value) {
                pw.confirm.setError('Passwords do not match');
                pw.confirm.input.focus();
                return;
            }
            try {
                await withBusy(pwSave, () => api.changePassword({ currentPassword: pw.currentPassword.input.value, newPassword: pw.newPassword.input.value }));
                toast('Password changed');
                pwForm.reset();
            } catch (err) {
                if (err.status === 400 && !err.details) pw.currentPassword.setError(err.message);
                else pwError.show(applyFormErrors(pw, err));
            }
        }
    },
        h('div', { class: 'stack' }, pw.currentPassword.el, pw.newPassword.el, pw.confirm.el),
        pwError,
        h('div', { class: 'modal-actions' }, pwSave)
    );

    // ----- appearance -----
    const modeOptions = [['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'dashboard', 'System']];
    const themeGroup = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Colour theme' });
    const renderThemeGroup = () => {
        themeGroup.replaceChildren(
            ...modeOptions.map(([value, ic, label]) =>
                h('button', {
                    type: 'button',
                    class: ['segment', theme.mode === value && 'active'],
                    role: 'radio',
                    'aria-checked': String(theme.mode === value),
                    onclick: () => { theme.set(value); renderThemeGroup(); }
                }, icon(ic, 16), label)
            )
        );
    };
    renderThemeGroup();

    mount(el,
        pageHeader({ title: 'Your profile', subtitle: 'Manage your account details, password and appearance' }),
        h('div', { class: 'profile-layout' },
            h('aside', { class: 'card profile-summary' },
                avatar(me.name, 72),
                h('h2', { class: 'profile-name' }, me.name),
                h('p', { class: 'profile-title' }, me.jobTitle || 'No job title'),
                badge(me.role),
                h('dl', { class: 'details details-compact' },
                    h('div', { class: 'detail-row' }, h('dt', null, 'Email'), h('dd', null, me.email)),
                    h('div', { class: 'detail-row' }, h('dt', null, 'Member since'), h('dd', null, fmtDate(me.createdAt.slice(0, 10)))),
                    h('div', { class: 'detail-row' }, h('dt', null, 'Last sign-in'), h('dd', null, me.lastLoginAt ? relTime(me.lastLoginAt) : 'Just now'))
                )
            ),
            h('div', { class: 'profile-main' },
                card({ title: 'Profile details' }, profileForm),
                card({ title: 'Change password', subtitle: 'Use a unique password you do not use anywhere else' }, pwForm),
                card({ title: 'Appearance', subtitle: 'Choose how SEKCO looks on this device' }, themeGroup)
            )
        )
    );
}
