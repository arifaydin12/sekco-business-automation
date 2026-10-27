import { h, mount, icon, debounce, plural } from '../ui/dom.js';
import { avatar, emptyState, errorState, field, loadingState, pageHeader, priorityBadge } from '../ui/components.js';
import { dueChip } from '../ui/feed.js';
import { toast } from '../ui/toast.js';
import { api } from '../api/index.js';
import { state, canCreateProjects } from '../store.js';
import { updateQuery } from '../router.js';
import { openTaskModal, STATUSES, PRIORITIES } from './task-modal.js';

const COLUMNS = [
    { status: 'To do', tone: 'todo', hint: 'Backlog and upcoming work' },
    { status: 'In progress', tone: 'progress', hint: 'Currently being worked on' },
    { status: 'Done', tone: 'done', hint: 'Finished work' }
];
const PRIORITY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const BOARD_LIMIT = 100;

function sortColumn(status, tasks) {
    const list = [...tasks];
    if (status === 'Done') return list.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    return list.sort((a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) ||
        (a.dueDate || '').localeCompare(b.dueDate || '') ||
        a.id - b.id
    );
}

export async function renderBoard({ el, query }) {
    const filters = {
        project: query.project || '',
        assignee: query.assignee || '',
        priority: query.priority || '',
        q: query.q || '',
        overdue: query.overdue === '1'
    };

    let tasks = [];
    let total = 0;
    let projects = [];
    let users = [];

    // ---- toolbar ----
    const projectSelect = field('select', { label: 'Project', name: 'project', options: [{ value: '', label: 'All projects' }], value: '' });
    const assigneeSelect = field('select', { label: 'Assignee', name: 'assignee', options: [{ value: '', label: 'Everyone' }], value: '' });
    const prioritySelect = field('select', { label: 'Priority', name: 'priority', options: [{ value: '', label: 'Any priority' }, ...PRIORITIES], value: filters.priority });
    const search = field('input', { label: 'Search tasks', name: 'q', type: 'search', value: filters.q, placeholder: 'Search tasks' });
    const overdueToggle = h('button', { class: 'chip-btn chip-toggle', type: 'button', 'aria-pressed': String(filters.overdue) }, icon('alert', 14), 'Overdue only');
    const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const board = h('div', { class: 'board' });
    const note = h('div', { class: 'board-note-host' });

    const canAdd = canCreateProjects();
    const newTask = (status) =>
        openTaskModal({ projectId: filters.project ? Number(filters.project) : undefined, status, onChange: load });

    mount(el,
        pageHeader({
            title: 'Board',
            subtitle: 'Drag cards between columns, or focus a card and press Shift + Arrow keys',
            actions: canAdd ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => newTask('To do') }, icon('plus', 16), 'New task') : null
        }),
        h('div', { class: 'toolbar', role: 'search' },
            h('div', { class: 'toolbar-search' }, search.el),
            projectSelect.el,
            assigneeSelect.el,
            prioritySelect.el,
            h('div', { class: 'toolbar-toggle' }, overdueToggle)
        ),
        note,
        live,
        board
    );

    function syncOverdueToggle() {
        overdueToggle.setAttribute('aria-pressed', String(filters.overdue));
        overdueToggle.classList.toggle('active', filters.overdue);
    }
    syncOverdueToggle();

    // ---- rendering ----
    function cardEl(task) {
        const editableStatus = task.permissions.status;
        const index = STATUSES.indexOf(task.status);
        const moveButton = (dir) => {
            const target = STATUSES[index + dir];
            if (!target || !editableStatus) return null;
            return h('button', {
                class: 'icon-btn icon-btn-sm',
                type: 'button',
                'aria-label': `Move "${task.title}" to ${target}`,
                title: `Move to ${target}`,
                onclick: (event) => { event.stopPropagation(); moveTask(task.id, target); }
            }, icon(dir < 0 ? 'chevronLeft' : 'chevronRight', 14));
        };

        const el = h('div', {
            class: ['task-card', `priority-${task.priority.toLowerCase()}`, !editableStatus && 'locked'],
            role: 'listitem',
            tabindex: '0',
            draggable: editableStatus ? 'true' : null,
            dataset: { id: task.id },
            'aria-label': `${task.title}. ${task.priority} priority. ${task.assigneeName ? `Assigned to ${task.assigneeName}.` : 'Unassigned.'} Press Enter to open.`,
            title: editableStatus ? undefined : 'Only the assignee, the project manager or an admin can move this task',
            onclick: () => openTaskModal({ taskId: task.id, onChange: load }),
            onkeydown: (event) => {
                if (event.target !== el) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openTaskModal({ taskId: task.id, onChange: load });
                } else if (event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
                    event.preventDefault();
                    const target = STATUSES[index + (event.key === 'ArrowRight' ? 1 : -1)];
                    if (target && editableStatus) moveTask(task.id, target);
                }
            },
            ondragstart: (event) => {
                if (!editableStatus) return event.preventDefault();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(task.id));
                drag.id = task.id;
                requestAnimationFrame(() => el.classList.add('dragging'));
                board.classList.add('is-dragging');
            },
            ondragend: () => {
                drag.id = null;
                el.classList.remove('dragging');
                board.classList.remove('is-dragging');
                board.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
            }
        },
            h('div', { class: 'task-card-top' },
                priorityBadge(task.priority),
                !filters.project && h('span', { class: 'task-card-project', title: task.projectName }, task.projectName)
            ),
            h('h3', { class: 'task-card-title' }, task.title),
            h('div', { class: 'task-card-foot' },
                h('div', { class: 'task-card-info' },
                    dueChip(task),
                    task.commentCount > 0 && h('span', { class: 'comment-count', title: plural(task.commentCount, 'comment') }, icon('message', 12), String(task.commentCount))
                ),
                avatar(task.assigneeName, 26)
            ),
            h('div', { class: 'task-card-move' }, moveButton(-1), moveButton(1))
        );
        return el;
    }

    function renderColumns() {
        const columns = COLUMNS.map(col => {
            const items = sortColumn(col.status, tasks.filter(t => t.status === col.status));
            const list = h('div', { class: 'board-list', role: 'list', 'aria-label': `${col.status} tasks` },
                items.length ? items.map(cardEl) : h('p', { class: 'board-empty' }, col.status === 'Done' ? 'Nothing finished yet' : 'No tasks here')
            );
            const column = h('section', {
                class: ['board-col', `col-${col.tone}`],
                'aria-label': col.status,
                dataset: { status: col.status },
                ondragover: (event) => {
                    if (drag.id === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    column.classList.add('drag-over');
                },
                ondragleave: (event) => {
                    if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
                },
                ondrop: (event) => {
                    event.preventDefault();
                    column.classList.remove('drag-over');
                    const id = drag.id ?? Number(event.dataTransfer.getData('text/plain'));
                    drag.id = null;
                    if (id) moveTask(id, col.status);
                }
            },
                h('header', { class: 'board-col-head' },
                    h('span', { class: ['status-dot', `dot-${col.tone}`], 'aria-hidden': 'true' }),
                    h('h2', { class: 'board-col-title' }, col.status),
                    h('span', { class: 'board-count' }, String(items.length)),
                    canAdd && h('button', { class: 'icon-btn icon-btn-sm board-add', type: 'button', 'aria-label': `Add task to ${col.status}`, title: `Add task to ${col.status}`, onclick: () => newTask(col.status) }, icon('plus', 16))
                ),
                list
            );
            return column;
        });
        mount(board, columns);
        board.classList.remove('is-dragging');

        mount(note,
            total > BOARD_LIMIT && h('p', { class: 'board-note' }, icon('info', 14), `Showing the first ${BOARD_LIMIT} of ${total} tasks. Pick a project or add filters to narrow the board.`)
        );
    }

    const drag = { id: null };

    async function moveTask(id, status) {
        const task = tasks.find(t => t.id === id);
        if (!task || task.status === status) return;
        if (!task.permissions.status) {
            toast('You can only move tasks assigned to you.', 'error');
            return;
        }
        const previous = { status: task.status, completedAt: task.completedAt };
        task.status = status;
        task.completedAt = status === 'Done' ? new Date().toISOString() : null;
        renderColumns();
        focusCard(id);
        live.textContent = `Moved "${task.title}" to ${status}`;
        try {
            const { data } = await api.tasks.update(id, { status });
            Object.assign(task, data);
            renderColumns();
            focusCard(id, false);
            toast(`Moved to ${status}`, 'success', 2200);
        } catch (error) {
            Object.assign(task, previous);
            renderColumns();
            toast(error.message || 'Could not move the task', 'error');
            live.textContent = `Could not move "${task.title}"`;
        }
    }

    function focusCard(id, focus = true) {
        if (!focus && !board.contains(document.activeElement) && document.activeElement !== document.body) return;
        const node = board.querySelector(`.task-card[data-id="${id}"]`);
        if (node && (focus || document.activeElement === document.body)) node.focus({ preventScroll: true });
    }

    async function load() {
        const first = tasks.length === 0 && board.childElementCount === 0;
        if (first) mount(board, loadingState('board'));
        try {
            const params = {
                projectId: filters.project || undefined,
                priority: filters.priority || undefined,
                q: filters.q || undefined,
                overdue: filters.overdue ? 'true' : undefined,
                sort: 'priority',
                pageSize: BOARD_LIMIT
            };
            if (filters.assignee === 'me') params.mine = 'true';
            else if (filters.assignee === 'none') params.unassigned = 'true';
            else if (filters.assignee) params.assigneeId = filters.assignee;

            const result = await api.tasks.list(params);
            tasks = result.data;
            total = result.meta.total;
            renderColumns();
            if (tasks.length === 0 && (filters.project || filters.assignee || filters.priority || filters.q || filters.overdue)) {
                board.prepend(h('div', { class: 'board-filter-empty' }, emptyState({ iconName: 'search', title: 'No tasks match these filters', text: 'Adjust or clear the filters to see more tasks.' })));
            }
        } catch (error) {
            mount(board, errorState(error, load));
        }
    }

    function apply() {
        updateQuery({
            project: filters.project || undefined,
            assignee: filters.assignee || undefined,
            priority: filters.priority || undefined,
            q: filters.q || undefined,
            overdue: filters.overdue ? '1' : undefined
        });
        return load();
    }

    // ---- wiring ----
    projectSelect.input.addEventListener('change', () => { filters.project = projectSelect.input.value; apply(); });
    assigneeSelect.input.addEventListener('change', () => { filters.assignee = assigneeSelect.input.value; apply(); });
    prioritySelect.input.addEventListener('change', () => { filters.priority = prioritySelect.input.value; apply(); });
    overdueToggle.addEventListener('click', () => { filters.overdue = !filters.overdue; syncOverdueToggle(); apply(); });
    search.input.addEventListener('input', debounce(() => { filters.q = search.input.value.trim(); apply(); }, 280));

    mount(board, loadingState('board'));
    try {
        const [projectResult, userResult] = await Promise.all([api.projects.list({ pageSize: 100, sort: 'name' }), api.users.directory()]);
        projects = projectResult.data;
        users = userResult.data;
    } catch (error) {
        mount(board, errorState(error, () => renderBoard({ el, query })));
        return;
    }

    projectSelect.input.replaceChildren(
        h('option', { value: '' }, 'All projects'),
        ...projects.map(p => h('option', { value: p.id }, p.name))
    );
    projectSelect.input.value = filters.project;
    assigneeSelect.input.replaceChildren(
        h('option', { value: '' }, 'Everyone'),
        h('option', { value: 'me' }, `Me (${state.user.name})`),
        h('option', { value: 'none' }, 'Unassigned'),
        ...users.filter(u => u.id !== state.user.id).map(u => h('option', { value: u.id }, u.name))
    );
    assigneeSelect.input.value = filters.assignee;
    if (assigneeSelect.input.value !== filters.assignee) filters.assignee = '';

    await load();
}
