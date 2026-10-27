import { h, mount, icon, fmtDate, plural } from '../ui/dom.js';
import { avatar, badge, card, emptyState, errorState, loadingState, pageHeader, progressBar } from '../ui/components.js';
import { donutChart, activityChart } from '../ui/charts.js';
import { activityFeed, taskListItem } from '../ui/feed.js';
import { api } from '../api/index.js';
import { openTaskModal } from './task-modal.js';

const greeting = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

function kpiCard({ label, value, hint, iconName, tone, href }) {
    return h(
        href ? 'a' : 'div',
        { class: ['kpi', `kpi-${tone}`], href },
        h('span', { class: 'kpi-icon' }, icon(iconName, 20)),
        h('span', { class: 'kpi-text' }, h('span', { class: 'kpi-label' }, label), h('span', { class: 'kpi-value' }, String(value)), h('span', { class: 'kpi-hint' }, hint))
    );
}

function statusCard(counts) {
    const segments = [
        { label: 'To do', value: counts['To do'], tone: 'todo' },
        { label: 'In progress', value: counts['In progress'], tone: 'progress' },
        { label: 'Done', value: counts.Done, tone: 'done' }
    ];
    const total = segments.reduce((s, x) => s + x.value, 0);
    return card(
        { title: 'Tasks by status', subtitle: 'All projects' },
        h(
            'div',
            { class: 'status-chart' },
            donutChart(segments),
            h(
                'ul',
                { class: 'legend legend-list' },
                segments.map(s =>
                    h('li', null,
                        h('span', { class: ['legend-swatch', `swatch-${s.tone}`] }),
                        h('span', { class: 'legend-label' }, s.label),
                        h('strong', null, String(s.value)),
                        h('span', { class: 'legend-pct' }, `${total ? Math.round((s.value / total) * 100) : 0}%`)
                    )
                )
            )
        )
    );
}

function projectsCard(projects) {
    return card(
        { title: 'Project progress', subtitle: 'Computed from finished tasks', actions: h('a', { class: 'link-btn', href: '#/projects' }, 'All projects') },
        projects.length
            ? h(
                  'ul',
                  { class: 'progress-list' },
                  projects.map(p =>
                      h('li', { class: 'progress-row' },
                          h('div', { class: 'progress-row-head' },
                              h('a', { class: 'progress-row-name', href: `#/projects/${p.id}` }, p.name),
                              badge(p.status)
                          ),
                          progressBar(p.progress),
                          h('p', { class: 'progress-row-meta' },
                              `${p.doneCount} of ${plural(p.taskCount, 'task')} done`,
                              p.overdueCount > 0 && h('span', { class: 'meta-danger' }, ` · ${p.overdueCount} overdue`),
                              p.endDate && ` · due ${fmtDate(p.endDate)}`
                          )
                      )
                  )
              )
            : emptyState({ iconName: 'folder', title: 'No projects yet' })
    );
}

function workloadCard(workload) {
    const max = Math.max(1, ...workload.map(w => w.open + w.done));
    return card(
        { title: 'Workload by person', subtitle: 'Open and finished tasks per assignee' },
        workload.length
            ? h(
                  'ul',
                  { class: 'workload' },
                  workload.map(w =>
                      h('li', { class: 'workload-row' },
                          h('div', { class: 'workload-person' }, avatar(w.name, 26), h('span', null, w.name)),
                          h(
                              'div',
                              { class: 'workload-bar', role: 'img', 'aria-label': `${w.name}: ${w.open} open, ${w.done} done${w.overdue ? `, ${w.overdue} overdue` : ''}` },
                              h('span', { class: 'workload-seg seg-open', style: { width: `${(w.open / max) * 100}%` } }),
                              h('span', { class: 'workload-seg seg-done', style: { width: `${(w.done / max) * 100}%` } })
                          ),
                          h('span', { class: 'workload-num' }, `${w.open} open`, w.overdue > 0 && h('span', { class: 'meta-danger' }, ` · ${w.overdue} late`))
                      )
                  ),
                  h('li', { class: 'workload-legend legend legend-inline' },
                      h('span', { class: 'legend-swatch swatch-open' }), 'Open',
                      h('span', { class: 'legend-swatch swatch-done' }), 'Done'
                  )
              )
            : emptyState({ iconName: 'users', title: 'No assigned tasks yet' })
    );
}

export async function renderDashboard({ el, user }) {
    const first = user.name.split(' ')[0];
    const header = pageHeader({
        title: `${greeting()}, ${first}`,
        subtitle: new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
        actions: h('a', { class: 'btn btn-secondary', href: '#/board' }, icon('board', 16), 'Open board')
    });
    const content = h('div', { class: 'dashboard' }, loadingState('cards', 4));
    mount(el, header, content);

    async function load() {
        content.replaceChildren(loadingState('cards', 4));
        let data;
        try {
            ({ data } = await api.dashboard());
        } catch (error) {
            content.replaceChildren(errorState(error, load));
            return;
        }
        const k = data.kpis;

        const kpis = h(
            'div',
            { class: 'kpi-grid' },
            kpiCard({ label: 'Open tasks', value: k.openTasks, hint: `${data.tasksByStatus['In progress']} in progress`, iconName: 'tasks', tone: 'brand', href: '#/board' }),
            kpiCard({ label: 'Overdue', value: k.overdueTasks, hint: k.overdueTasks ? 'Need attention' : 'Nothing is late', iconName: 'alert', tone: k.overdueTasks ? 'danger' : 'success', href: '#/board?overdue=1' }),
            kpiCard({ label: 'Done this week', value: k.completedThisWeek, hint: `${k.doneTasks} done in total`, iconName: 'check', tone: 'success' }),
            kpiCard({ label: 'Active projects', value: k.activeProjects, hint: `of ${k.totalProjects} projects`, iconName: 'folder', tone: 'info', href: '#/projects' })
        );

        const activityCard = card(
            { title: 'Task activity', subtitle: 'Created vs. completed, last 14 days' },
            activityChart(data.activityOverTime)
        );

        const myTasksCard = card(
            {
                title: 'My tasks',
                subtitle: k.myOpenTasks ? `${plural(k.myOpenTasks, 'open task')}${k.myOverdueTasks ? `, ${k.myOverdueTasks} overdue` : ''}` : 'Nothing assigned to you',
                actions: h('a', { class: 'link-btn', href: '#/board?assignee=me' }, 'View on board')
            },
            data.myTasks.length
                ? h('ul', { class: 'task-list' }, data.myTasks.map(t => taskListItem(t, (task) => openTaskModal({ taskId: task.id, onChange: load }))))
                : emptyState({ iconName: 'check', title: 'All clear', text: 'You have no open tasks assigned to you.' })
        );

        const feedCard = card(
            { title: 'Recent activity', actions: h('span', { class: 'card-chip' }, icon('activity', 14), 'Live') },
            data.recentActivity.length ? activityFeed(data.recentActivity) : emptyState({ iconName: 'activity', title: 'No activity yet' })
        );

        content.replaceChildren(
            kpis,
            h('div', { class: 'grid grid-status' }, statusCard(data.tasksByStatus), activityCard),
            h('div', { class: 'grid grid-2' }, projectsCard(data.projectProgress), workloadCard(data.workload)),
            h('div', { class: 'grid grid-2' }, myTasksCard, feedCard)
        );
    }
    await load();
}
