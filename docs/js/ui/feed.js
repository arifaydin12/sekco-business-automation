import { h, icon, relTime, dueInfo, fmtDateTime } from './dom.js';
import { avatar, priorityBadge } from './components.js';

const ICON_FOR = {
    task: 'tasks',
    project: 'folder',
    comment: 'message',
    user: 'user'
};

/** Chronological activity list: "<user> <message>" with project link and relative time. */
export function activityFeed(items, { showProject = true } = {}) {
    return h(
        'ol',
        { class: 'feed' },
        items.map(item =>
            h(
                'li',
                { class: 'feed-item' },
                h('div', { class: 'feed-avatar' }, avatar(item.userName || 'System', 30)),
                h(
                    'div',
                    { class: 'feed-body' },
                    h('p', { class: 'feed-text' }, h('strong', null, item.userName || 'Someone'), ` ${item.message}`),
                    h(
                        'p',
                        { class: 'feed-meta' },
                        h('span', { class: 'feed-kind' }, icon(ICON_FOR[item.entityType] || 'activity', 12)),
                        showProject && item.projectId && item.projectName
                            ? [h('a', { href: `#/projects/${item.projectId}` }, item.projectName), ' · ']
                            : null,
                        h('time', { datetime: item.createdAt, title: fmtDateTime(item.createdAt) }, relTime(item.createdAt))
                    )
                )
            )
        )
    );
}

export function dueChip(task, { compact = false } = {}) {
    const info = dueInfo(task);
    if (!info) return null;
    const flagged = info.kind === 'overdue' || info.kind === 'soon';
    return h(
        'span',
        { class: ['due-chip', `due-${info.kind}`], title: info.text },
        icon(info.kind === 'overdue' ? 'alert' : 'calendar', 12),
        flagged && !compact ? info.text : info.short || info.text
    );
}

/** Clickable row used in "my tasks" and project task lists. */
export function taskListItem(task, onOpen, { showProject = true } = {}) {
    return h(
        'li',
        { class: 'task-item' },
        h(
            'button',
            { type: 'button', class: 'task-item-btn', onclick: () => onOpen(task) },
            h(
                'span',
                { class: 'task-item-main' },
                h('span', { class: 'task-item-title' }, task.title),
                showProject && h('span', { class: 'task-item-sub' }, task.projectName)
            ),
            h('span', { class: 'task-item-side' }, priorityBadge(task.priority), dueChip(task))
        )
    );
}