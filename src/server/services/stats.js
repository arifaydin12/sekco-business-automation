'use strict';

const db = require('../db');
const activity = require('./activity');
const projects = require('./projects');
const tasks = require('./tasks');
const { today } = require('../utils/http');

const DAYS = 14;

const dayOffset = (base, offset) => {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
};

async function dashboard(actor) {
    const now = today();
    const weekAgo = `${dayOffset(now, -6)} 00:00:00`;
    const firstDay = dayOffset(now, -(DAYS - 1));

    const [taskTotals, projectTotals, userTotals, mine, byStatus, byPriority, workload, created, completed] =
        await Promise.all([
            db.one(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(status <> 'Done'), 0) AS open_count,
                        COALESCE(SUM(status = 'Done'), 0) AS done_count,
                        COALESCE(SUM(status <> 'Done' AND due_date IS NOT NULL AND due_date < ?), 0) AS overdue_count,
                        COALESCE(SUM(status = 'Done' AND completed_at >= ?), 0) AS completed_week
                 FROM tasks`,
                [now, weekAgo]
            ),
            db.one(
                `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Active'), 0) AS active_count FROM projects`
            ),
            db.one(`SELECT COUNT(*) AS total FROM users WHERE status = 'Active'`),
            db.one(
                `SELECT COALESCE(SUM(status <> 'Done'), 0) AS open_count,
                        COALESCE(SUM(status <> 'Done' AND due_date IS NOT NULL AND due_date < ?), 0) AS overdue_count
                 FROM tasks WHERE assignee_id = ?`,
                [now, actor.id]
            ),
            db.query('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status'),
            db.query("SELECT priority, COUNT(*) AS n FROM tasks WHERE status <> 'Done' GROUP BY priority"),
            db.query(
                `SELECT u.id, u.name,
                        COALESCE(SUM(t.status <> 'Done'), 0) AS open_count,
                        COALESCE(SUM(t.status = 'Done'), 0) AS done_count,
                        COALESCE(SUM(t.status <> 'Done' AND t.due_date IS NOT NULL AND t.due_date < ?), 0) AS overdue_count
                 FROM users u JOIN tasks t ON t.assignee_id = u.id
                 WHERE u.status = 'Active'
                 GROUP BY u.id, u.name
                 ORDER BY open_count DESC, done_count DESC, u.name ASC
                 LIMIT 8`,
                [now]
            ),
            db.query(
                'SELECT DATE(created_at) AS d, COUNT(*) AS n FROM tasks WHERE created_at >= ? GROUP BY d',
                [`${firstDay} 00:00:00`]
            ),
            db.query(
                'SELECT DATE(completed_at) AS d, COUNT(*) AS n FROM tasks WHERE completed_at >= ? GROUP BY d',
                [`${firstDay} 00:00:00`]
            )
        ]);

    const statusCounts = { 'To do': 0, 'In progress': 0, Done: 0 };
    for (const r of byStatus) statusCounts[r.status] = Number(r.n);

    const priorityCounts = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
    for (const r of byPriority) priorityCounts[r.priority] = Number(r.n);

    const createdByDay = new Map(created.map(r => [r.d, Number(r.n)]));
    const completedByDay = new Map(completed.map(r => [r.d, Number(r.n)]));
    const activityOverTime = [];
    for (let i = 0; i < DAYS; i++) {
        const date = dayOffset(firstDay, i);
        activityOverTime.push({
            date,
            created: createdByDay.get(date) || 0,
            completed: completedByDay.get(date) || 0
        });
    }

    const projectList = await projects.list({ page: 1, pageSize: 8, sort: 'deadline' }, actor);
    const myTasks = await tasks.list(
        { page: 1, pageSize: 6, mine: true, open: true, sort: 'due' },
        actor
    );

    return {
        kpis: {
            totalProjects: Number(projectTotals.total),
            activeProjects: Number(projectTotals.active_count),
            totalTasks: Number(taskTotals.total),
            openTasks: Number(taskTotals.open_count),
            doneTasks: Number(taskTotals.done_count),
            overdueTasks: Number(taskTotals.overdue_count),
            completedThisWeek: Number(taskTotals.completed_week),
            activeUsers: Number(userTotals.total),
            myOpenTasks: Number(mine.open_count),
            myOverdueTasks: Number(mine.overdue_count)
        },
        tasksByStatus: statusCounts,
        openTasksByPriority: priorityCounts,
        projectProgress: projectList.items.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            progress: p.progress,
            taskCount: p.taskCount,
            doneCount: p.doneCount,
            overdueCount: p.overdueCount,
            endDate: p.endDate
        })),
        workload: workload.map(r => ({
            userId: r.id,
            name: r.name,
            open: Number(r.open_count),
            done: Number(r.done_count),
            overdue: Number(r.overdue_count)
        })),
        activityOverTime,
        recentActivity: await activity.recent(8),
        myTasks: myTasks.items
    };
}

module.exports = { dashboard };
