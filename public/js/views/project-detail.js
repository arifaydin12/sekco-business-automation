import { h, mount, icon, fmtDate, daysUntil, plural } from '../ui/dom.js';
import { badge, card, emptyState, errorState, loadingState, pageHeader, priorityBadge, progressBar, userChip } from '../ui/components.js';
import { activityFeed, dueChip } from '../ui/feed.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { api } from '../api/index.js';
import { navigate } from '../router.js';
import { openProjectModal } from './project-modal.js';
import { openTaskModal } from './task-modal.js';

const STATUS_FILTERS = ['All', 'To do', 'In progress', 'Done'];

function deadlineText(project) {
    if (!project.endDate) return 'No deadline';
    const d = daysUntil(project.endDate);
    const rel = project.status === 'Completed' ? '' : d < 0 ? ` (${-d} days ago)` : d === 0 ? ' (today)' : ` (in ${plural(d, 'day')})`;
    return `${fmtDate(project.endDate)}${rel}`;
}

function detailsCard(project) {
    const row = (label, value) => h('div', { class: 'detail-row' }, h('dt', null, label), h('dd', null, value));
    return card(
        { title: 'Details' },
        h('dl', { class: 'details' },
            row('Manager', userChip(project.managerName || 'No manager', 24)),
            row('Status', badge(project.status)),
            row('Start', project.startDate ? fmtDate(project.startDate) : 'Not set'),
            row('Deadline', deadlineText(project)),
            row('Tasks', `${project.doneCount} of ${project.taskCount} done`),
            project.overdueCount > 0 && row('Overdue', h('span', { class: 'meta-danger' }, plural(project.overdueCount, 'task')))
        )
    );
}

export async function renderProject({ el, params }) {
    const id = Number(params.id);
    mount(el, loadingState('list', 8));

    async function load() {
        let project;
        let tasks;
        let activity;
        try {
            [project, tasks, activity] = await Promise.all([
                api.projects.get(id),
                api.tasks.list({ projectId: id, pageSize: 100, sort: 'priority' }),
                api.projects.activity(id, { pageSize: 8 })
            ]);
        } catch (error) {
            if (error.status === 404) {
                mount(el, emptyState({ iconName: 'folder', title: 'Project not found', text: 'It may have been deleted.', action: h('a', { class: 'btn btn-primary', href: '#/projects' }, 'Back to projects') }));
            } else {
                mount(el, errorState(error, () => { mount(el, loadingState('list', 8)); load(); }));
            }
            return;
        }
        render(project.data, tasks.data, tasks.meta, activity.data);
    }

    function render(project, tasks, tasksMeta, activity) {
        let filter = 'All';
        const tableHost = h('div', { class: 'table-host' });
        const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter tasks by status' });

        const openTask = (task) => openTaskModal({ taskId: task.id, onChange: load });

        function renderChips() {
            chips.replaceChildren(
                ...STATUS_FILTERS.map(name => {
                    const count = name === 'All' ? tasks.length : tasks.filter(t => t.status === name).length;
                    return h('button', { type: 'button', class: ['chip-btn', filter === name && 'active'], 'aria-pressed': String(filter === name), onclick: () => { filter = name; renderChips(); renderTable(); } }, name, h('span', { class: 'chip-count' }, String(count)));
                })
            );
        }

        function renderTable() {
            const rows = filter === 'All' ? tasks : tasks.filter(t => t.status === filter);
            if (rows.length === 0) {
                mount(tableHost, emptyState({
                    iconName: 'tasks',
                    title: tasks.length === 0 ? 'No tasks yet' : `No ${filter.toLowerCase()} tasks`,
                    text: tasks.length === 0 ? (project.permissions.edit ? 'Add the first task to start tracking progress.' : 'Tasks added by the project manager will show up here.') : 'Pick another status filter to see more.',
                    action: tasks.length === 0 && project.permissions.edit ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openTaskModal({ projectId: project.id, onChange: load }) }, icon('plus', 16), 'Add task') : null
                }));
                return;
            }
            mount(tableHost,
                h('div', { class: 'table-wrap' },
                    h('table', { class: 'table' },
                        h('thead', null, h('tr', null, ['Task', 'Assignee', 'Priority', 'Status', 'Due'].map(c => h('th', { scope: 'col' }, c)))),
                        h('tbody', null,
                            rows.map(t =>
                                h('tr', null,
                                    h('td', { class: 'cell-title' }, h('button', { class: 'link-btn link-title', type: 'button', onclick: () => openTask(t) }, t.title), t.commentCount > 0 && h('span', { class: 'comment-count', title: `${plural(t.commentCount, 'comment')}` }, icon('message', 12), String(t.commentCount))),
                                    h('td', null, userChip(t.assigneeName, 24)),
                                    h('td', null, priorityBadge(t.priority)),
                                    h('td', null, badge(t.status)),
                                    h('td', null, dueChip(t, { compact: true }) || h('span', { class: 'muted' }, '-'))
                                )
                            )
                        )
                    )
                )
            );
        }

        const actions = [
            h('a', { class: 'btn btn-secondary', href: `#/board?project=${project.id}` }, icon('board', 16), 'Open board'),
            project.permissions.edit && h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openProjectModal({ project, onSaved: load }) }, icon('edit', 16), 'Edit'),
            project.permissions.delete && h('button', {
                class: 'btn btn-ghost-danger',
                type: 'button',
                onclick: async () => {
                    const yes = await confirmDialog({ title: 'Delete project?', message: `"${project.name}" and all of its ${plural(project.taskCount, 'task')} will be permanently deleted.`, confirmLabel: 'Delete project', danger: true });
                    if (!yes) return;
                    try {
                        await api.projects.remove(project.id);
                        toast('Project deleted');
                        navigate('/projects');
                    } catch (err) {
                        toast(err.message, 'error');
                    }
                }
            }, icon('trash', 16), 'Delete')
        ];

        mount(el,
            pageHeader({ title: project.name, subtitle: project.description || 'No description provided.', back: { href: '#/projects', label: 'All projects' }, actions }),
            h('div', { class: 'summary card' },
                h('div', { class: 'summary-progress' },
                    h('p', { class: 'summary-label' }, 'Progress'),
                    h('p', { class: 'summary-value' }, `${project.progress}%`),
                    progressBar(project.progress, { label: false })
                ),
                ...[['To do', 'todo'], ['In progress', 'progress'], ['Done', 'done']].map(([name, tone]) =>
                    h('div', { class: 'summary-stat' }, h('p', { class: 'summary-label' }, name), h('p', { class: ['summary-value', `tone-${tone}`] }, String(project.tasksByStatus[name])))
                ),
                h('div', { class: 'summary-stat' }, h('p', { class: 'summary-label' }, 'Overdue'), h('p', { class: ['summary-value', project.overdueCount ? 'tone-danger' : ''] }, String(project.overdueCount)))
            ),
            h('div', { class: 'detail-layout' },
                card(
                    {
                        title: 'Tasks',
                        subtitle: tasksMeta.total > tasks.length ? `Showing ${tasks.length} of ${tasksMeta.total}` : plural(tasksMeta.total, 'task'),
                        actions: project.permissions.edit ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openTaskModal({ projectId: project.id, onChange: load }) }, icon('plus', 14), 'Add task') : null,
                        class: 'card-flush'
                    },
                    chips,
                    tableHost
                ),
                h('div', { class: 'detail-side' },
                    detailsCard(project),
                    card({ title: 'Activity' }, activity.length ? activityFeed(activity, { showProject: false }) : emptyState({ iconName: 'activity', title: 'No activity yet' }))
                )
            )
        );
        renderChips();
        renderTable();
        const heading = el.querySelector('#page-title');
        if (heading && document.activeElement === document.body) heading.focus({ preventScroll: true });
    }

    await load();
}
