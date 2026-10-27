import { h } from '../ui/dom.js';
import { field, applyFormErrors, formError, withBusy, loadingState, errorState } from '../ui/components.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { api } from '../api/index.js';
import { state } from '../store.js';

export const PROJECT_STATUSES = ['Planning', 'Active', 'On hold', 'Completed'];

/** Create (no project) or edit (project) dialog. `onSaved(project)` receives the saved project. */
export function openProjectModal({ project, onSaved = () => {} } = {}) {
    return openModal({
        title: project ? 'Edit project' : 'New project',
        render: (modal) => {
            const body = h('div', { class: 'modal-body' }, loadingState('list', 5));
            const load = async () => {
                try {
                    const { data: users } = await api.users.directory();
                    body.replaceChildren(buildForm(modal, project, users.filter(u => u.role !== 'User'), onSaved));
                    const first = body.querySelector('input');
                    if (first) first.focus();
                } catch (error) {
                    body.replaceChildren(errorState(error, load));
                }
            };
            load();
            return body;
        }
    });
}

function buildForm(modal, project, managers, onSaved) {
    const isAdmin = state.user.role === 'Admin';
    const managerOptions = managers.map(u => ({ value: u.id, label: `${u.name} (${u.role})` }));
    if (isAdmin) managerOptions.unshift({ value: '', label: 'No manager' });

    const fields = {
        name: field('input', { label: 'Project name', name: 'name', value: project?.name || '', required: true, maxlength: 120 }),
        description: field('textarea', { label: 'Description', name: 'description', value: project?.description || '', rows: 4, maxlength: 5000 }),
        managerId: field('select', { label: 'Manager', name: 'managerId', options: managerOptions, value: project ? project.managerId ?? '' : state.user.id }),
        status: field('select', { label: 'Status', name: 'status', options: PROJECT_STATUSES, value: project?.status || 'Planning' }),
        startDate: field('input', { label: 'Start date', name: 'startDate', type: 'date', value: project?.startDate || '' }),
        endDate: field('input', { label: 'End date', name: 'endDate', type: 'date', value: project?.endDate || '' })
    };
    const error = formError();
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, project ? 'Save changes' : 'Create project');

    return h(
        'form',
        {
            novalidate: true,
            onsubmit: async (event) => {
                event.preventDefault();
                error.hide();
                const payload = {
                    name: fields.name.input.value.trim(),
                    description: fields.description.input.value.trim() || null,
                    managerId: fields.managerId.input.value === '' ? null : Number(fields.managerId.input.value),
                    status: fields.status.input.value,
                    startDate: fields.startDate.input.value || null,
                    endDate: fields.endDate.input.value || null
                };
                try {
                    const { data } = await withBusy(submit, () => (project ? api.projects.update(project.id, payload) : api.projects.create(payload)));
                    toast(project ? 'Project updated' : 'Project created');
                    modal.close();
                    onSaved(data);
                } catch (err) {
                    error.show(applyFormErrors(fields, err));
                }
            }
        },
        h('div', { class: 'task-form-grid' },
            h('div', { class: 'span-2' }, fields.name.el),
            h('div', { class: 'span-2' }, fields.description.el),
            fields.managerId.el,
            fields.status.el,
            fields.startDate.el,
            fields.endDate.el
        ),
        error,
        h('div', { class: 'modal-actions' },
            h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => modal.close() }, 'Cancel'),
            submit
        )
    );
}
