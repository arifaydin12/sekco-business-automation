import { h, mount, icon, fmtDate, debounce, plural } from '../ui/dom.js';
import { badge, emptyState, errorState, loadingState, pageHeader, pagination, progressBar, userChip, field } from '../ui/components.js';
import { api } from '../api/index.js';
import { canCreateProjects } from '../store.js';
import { navigate, updateQuery } from '../router.js';
import { openProjectModal, PROJECT_STATUSES } from './project-modal.js';

const PAGE_SIZE = 9;

export function projectCard(p) {
    return h(
        'article',
        { class: 'project-card card' },
        h('div', { class: 'project-card-head' },
            h('h3', { class: 'project-card-title' }, h('a', { href: `#/projects/${p.id}`, class: 'stretched-link' }, p.name)),
            badge(p.status)
        ),
        h('p', { class: 'project-card-desc' }, p.description || 'No description yet.'),
        progressBar(p.progress),
        h('p', { class: 'project-card-stats' },
            icon('tasks', 14),
            `${p.doneCount}/${plural(p.taskCount, 'task')} done`,
            p.overdueCount > 0 && h('span', { class: 'chip chip-danger' }, `${p.overdueCount} overdue`)
        ),
        h('footer', { class: 'project-card-foot' },
            userChip(p.managerName || 'No manager', 24),
            p.endDate && h('span', { class: 'project-card-date', title: 'Due date' }, icon('calendar', 14), fmtDate(p.endDate))
        )
    );
}

export async function renderProjects({ el, query }) {
    const filters = { q: query.q || '', status: query.status || '', sort: query.sort || 'newest', page: Number(query.page) || 1 };

    const search = field('input', { label: 'Search projects', name: 'q', type: 'search', value: filters.q, placeholder: 'Search by name or description' });
    const status = field('select', { label: 'Status', name: 'status', options: [{ value: '', label: 'All statuses' }, ...PROJECT_STATUSES], value: filters.status });
    const sort = field('select', {
        label: 'Sort by',
        name: 'sort',
        options: [{ value: 'newest', label: 'Newest first' }, { value: 'name', label: 'Name' }, { value: 'deadline', label: 'Deadline' }, { value: 'progress', label: 'Progress' }],
        value: filters.sort
    });
    const results = h('div', { class: 'results' });
    const toolbar = h('div', { class: 'toolbar', role: 'search' },
        h('div', { class: 'toolbar-search' }, search.el),
        status.el,
        sort.el
    );

    const newProject = () => openProjectModal({ onSaved: (project) => navigate(`/projects/${project.id}`) });
    mount(el,
        pageHeader({
            title: 'Projects',
            subtitle: 'Everything your team is working on',
            actions: canCreateProjects() ? h('button', { class: 'btn btn-primary', type: 'button', onclick: newProject }, icon('plus', 16), 'New project') : null
        }),
        toolbar,
        results
    );

    async function load() {
        results.replaceChildren(loadingState('cards', 6));
        try {
            const { data, meta } = await api.projects.list({ q: filters.q, status: filters.status, sort: filters.sort, page: filters.page, pageSize: PAGE_SIZE });
            if (data.length === 0 && meta.total > 0 && filters.page > 1) {
                filters.page = meta.totalPages;
                return load();
            }
            if (data.length === 0) {
                const filtered = filters.q || filters.status;
                results.replaceChildren(
                    emptyState({
                        iconName: 'folder',
                        title: filtered ? 'No projects match your filters' : 'No projects yet',
                        text: filtered ? 'Try a different search term or clear the filters.' : canCreateProjects() ? 'Create your first project to start organizing work.' : 'A manager or administrator can create the first project.',
                        action: filtered
                            ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { search.input.value = ''; status.input.value = ''; filters.q = ''; filters.status = ''; apply(); } }, 'Clear filters')
                            : canCreateProjects() ? h('button', { class: 'btn btn-primary', type: 'button', onclick: newProject }, icon('plus', 16), 'New project') : null
                    })
                );
                return;
            }
            mount(results,
                h('div', { class: 'project-grid' }, data.map(projectCard)),
                pagination(meta, (page) => { filters.page = page; apply(); window.scrollTo({ top: 0 }); }, 'project')
            );
        } catch (error) {
            results.replaceChildren(errorState(error, load));
        }
    }

    function apply() {
        updateQuery({ q: filters.q || undefined, status: filters.status || undefined, sort: filters.sort !== 'newest' ? filters.sort : undefined, page: filters.page > 1 ? filters.page : undefined });
        return load();
    }

    const onSearch = debounce(() => { filters.q = search.input.value.trim(); filters.page = 1; apply(); }, 280);
    search.input.addEventListener('input', onSearch);
    status.input.addEventListener('change', () => { filters.status = status.input.value; filters.page = 1; apply(); });
    sort.input.addEventListener('change', () => { filters.sort = sort.input.value; filters.page = 1; apply(); });

    await load();
}
