import { h, icon, relTime, fmtDateTime } from '../ui/dom.js';
import { avatar, badge, field, applyFormErrors, formError, withBusy, loadingState, errorState } from '../ui/components.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { api } from '../api/index.js';
import { state } from '../store.js';

export const STATUSES = ['To do', 'In progress', 'Done'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

/** Projects the current user may add tasks to (admins: all, managers: the ones they lead). */
export async function loadManageableProjects() {
    const { data } = await api.projects.list({ pageSize: 100, sort: 'name' });
    return data.filter(p => p.permissions.edit);
}

/**
 * Opens the task dialog.
 *  - { taskId }               view / edit an existing task (with comments)
 *  - { projectId, status }    create a task, optionally pre-filled
 * `onChange()` is called after any change so the caller can refresh its data.
 */
export function openTaskModal({ taskId, projectId, status, onChange = () => {} }) {
    return openModal({
        title: taskId ? 'Task' : 'New task',
        size: 'lg',
        render: (modal) => {
            const body = h('div', { class: 'modal-body' }, loadingState('list', 6));
            load(modal, body, { taskId, projectId, status, onChange });
            return body;
        }
    });
}

async function load(modal, body, opts) {
    try {
        const [users, task, projects] = await Promise.all([
            api.users.directory(),
            opts.taskId ? api.tasks.get(opts.taskId) : Promise.resolve({ data: null }),
            opts.taskId ? api.projects.list({ pageSize: 100, sort: 'name' }) : loadManageableProjects().then(data => ({ data }))
        ]);
        body.replaceChildren(renderContent(modal, { ...opts, users: users.data, task: task.data, projects: projects.data }));
        const first = body.querySelector('input:not([disabled]), select:not([disabled])');
        if (first) first.focus();
    } catch (error) {
        body.replaceChildren(errorState(error, () => {
            body.replaceChildren(loadingState('list', 6));
            load(modal, body, opts);
        }));
    }
}

function renderContent(modal, { task, users, projects, projectId, status, onChange }) {
    const isNew = !task;
    const perms = task ? task.permissions : { edit: true, status: true, delete: false };
    const readOnly = !perms.edit && !perms.status;

    if (isNew && projects.length === 0) {
        return h('div', { class: 'state state-empty' }, h('h3', { class: 'state-title' }, 'No project available'), h('p', { class: 'state-text' }, 'You can only add tasks to projects you manage. Create a project first.'));
    }
    if (task) modal.setTitle(`Task #${task.id}`);

    const projectOptions = projects.map(p => ({ value: p.id, label: p.name }));
    if (task && !projectOptions.some(o => o.value === task.projectId)) projectOptions.push({ value: task.projectId, label: task.projectName });

    const fields = {
        title: field('input', { label: 'Title', name: 'title', value: task?.title || '', required: true, maxlength: 160, disabled: !perms.edit }),
        description: field('textarea', { label: 'Description', name: 'description', value: task?.description || '', rows: 5, maxlength: 5000, disabled: !perms.edit }),
        projectId: field('select', { label: 'Project', name: 'projectId', options: projectOptions, value: task ? task.projectId : projectId || projectOptions[0].value, required: true, disabled: !perms.edit }),
        assigneeId: field('select', {
            label: 'Assignee',
            name: 'assigneeId',
            options: [{ value: '', label: 'Unassigned' }, ...users.map(u => ({ value: u.id, label: u.name }))],
            value: task?.assigneeId ?? '',
            disabled: !perms.edit
        }),
        priority: field('select', { label: 'Priority', name: 'priority', options: PRIORITIES, value: task?.priority || 'Medium', disabled: !perms.edit }),
        status: field('select', { label: 'Status', name: 'status', options: STATUSES, value: task?.status || status || 'To do', disabled: !perms.status }),
        dueDate: field('input', { label: 'Due date', name: 'dueDate', type: 'date', value: task?.dueDate || '', disabled: !perms.edit })
    };
    const error = formError();

    const intValue = (v) => (v === '' ? null : Number(v));
    const readValues = () => ({
        title: fields.title.input.value.trim(),
        description: fields.description.input.value.trim() || null,
        projectId: Number(fields.projectId.input.value),
        assigneeId: intValue(fields.assigneeId.input.value),
        priority: fields.priority.input.value,
        status: fields.status.input.value,
        dueDate: fields.dueDate.input.value || null
    });

    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, isNew ? 'Create task' : 'Save changes');

    const form = h(
        'form',
        {
            class: 'task-form',
            novalidate: true,
            onsubmit: async (event) => {
                event.preventDefault();
                error.hide();
                const values = readValues();
                let payload = values;
                if (task) {
                    // Only send what changed (and only the status for users who may not edit the task)
                    const before = { title: task.title, description: task.description, projectId: task.projectId, assigneeId: task.assigneeId, priority: task.priority, status: task.status, dueDate: task.dueDate };
                    payload = {};
                    for (const key of Object.keys(values)) {
                        if (!perms.edit && key !== 'status') continue;
                        if (values[key] !== before[key]) payload[key] = values[key];
                    }
                    if (Object.keys(payload).length === 0) {
                        modal.close();
                        return;
                    }
                }
                try {
                    await withBusy(save, () => (task ? api.tasks.update(task.id, payload) : api.tasks.create(payload)));
                    toast(isNew ? 'Task created' : 'Task updated');
                    onChange();
                    modal.close();
                } catch (err) {
                    error.show(applyFormErrors(fields, err));
                }
            }
        },
        h('div', { class: 'task-form-grid' },
            h('div', { class: 'span-2' }, fields.title.el),
            h('div', { class: 'span-2' }, fields.description.el),
            fields.projectId.el,
            fields.assigneeId.el,
            fields.priority.el,
            fields.status.el,
            fields.dueDate.el
        ),
        readOnly && h('p', { class: 'form-note' }, icon('lock', 14), 'You can view this task but only its assignee, the project manager or an administrator can change it.'),
        !readOnly && !perms.edit && h('p', { class: 'form-note' }, icon('info', 14), 'You can update the status of this task. Other fields are managed by the project manager.'),
        error,
        h(
            'div',
            { class: 'modal-actions modal-actions-split' },
            task && perms.delete
                ? h('button', {
                      class: 'btn btn-ghost-danger',
                      type: 'button',
                      onclick: async () => {
                          const yes = await confirmDialog({ title: 'Delete task?', message: `"${task.title}" and its comments will be permanently deleted.`, confirmLabel: 'Delete task', danger: true });
                          if (!yes) return;
                          try {
                              await api.tasks.remove(task.id);
                              toast('Task deleted');
                              onChange();
                              modal.close();
                          } catch (err) {
                              toast(err.message, 'error');
                          }
                      }
                  }, icon('trash', 16), 'Delete')
                : h('span'),
            h('div', { class: 'modal-actions-main' },
                h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => modal.close() }, readOnly ? 'Close' : 'Cancel'),
                !readOnly && save
            )
        ),
        task && h('p', { class: 'task-meta' },
            `Created ${fmtDateTime(task.createdAt)}`,
            task.completedAt ? ` · Completed ${fmtDateTime(task.completedAt)}` : ` · Updated ${relTime(task.updatedAt)}`
        )
    );

    if (isNew) return h('div', { class: 'task-modal task-modal-new' }, form);
    return h('div', { class: 'task-modal' }, form, commentsPanel(task, onChange));
}

function commentsPanel(task, onChange) {
    const list = h('ul', { class: 'comments' });
    const count = h('span', { class: 'comments-count' });
    let comments = task.comments || [];

    const textarea = h('textarea', { class: 'control', rows: 3, maxlength: 2000, placeholder: 'Write a comment...', 'aria-label': 'Add a comment' });
    const error = formError();
    const post = h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Comment');

    function renderList() {
        count.textContent = String(comments.length);
        list.replaceChildren(
            ...(comments.length
                ? comments.map(c =>
                      h('li', { class: 'comment' },
                          avatar(c.userName || 'Deleted user', 30),
                          h('div', { class: 'comment-body' },
                              h('div', { class: 'comment-head' },
                                  h('strong', null, c.userName || 'Deleted user'),
                                  c.userRole && badge(c.userRole, 'badge-sm'),
                                  h('time', { datetime: c.createdAt, title: fmtDateTime(c.createdAt) }, relTime(c.createdAt)),
                                  (state.user.role === 'Admin' || c.userId === state.user.id) &&
                                      h('button', {
                                          class: 'icon-btn icon-btn-sm comment-delete',
                                          type: 'button',
                                          'aria-label': 'Delete comment',
                                          title: 'Delete comment',
                                          onclick: async () => {
                                              try {
                                                  await api.deleteComment(c.id);
                                                  comments = comments.filter(x => x.id !== c.id);
                                                  renderList();
                                                  onChange();
                                              } catch (err) {
                                                  toast(err.message, 'error');
                                              }
                                          }
                                      }, icon('trash', 14))
                              ),
                              h('p', { class: 'comment-text' }, c.body)
                          )
                      )
                  )
                : [h('li', { class: 'comments-empty' }, 'No comments yet. Start the discussion.')])
        );
    }
    renderList();

    const form = h('form', {
        class: 'comment-form',
        novalidate: true,
        onsubmit: async (event) => {
            event.preventDefault();
            error.hide();
            const text = textarea.value.trim();
            if (!text) return error.show('Write something first.');
            try {
                const { data } = await withBusy(post, () => api.tasks.addComment(task.id, text));
                comments = [...comments, data];
                textarea.value = '';
                renderList();
                list.lastElementChild && list.lastElementChild.scrollIntoView({ block: 'nearest' });
                onChange();
            } catch (err) {
                error.show(err.message);
            }
        }
    }, textarea, error, h('div', { class: 'comment-form-actions' }, post));

    return h('aside', { class: 'comments-panel', 'aria-label': 'Comments' },
        h('h3', { class: 'comments-title' }, icon('message', 16), 'Comments ', count),
        list,
        form
    );
}
