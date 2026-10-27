'use strict';

const db = require('../db');
const activity = require('./activity');
const projects = require('./projects');
const comments = require('./comments');
const { badRequest, forbidden, notFound } = require('../utils/errors');
const { paging, pageMeta, likeTerm, iso, today } = require('../utils/http');

const { label } = activity;

const BASE_SELECT = `
    SELECT t.*, pr.name AS project_name, pr.manager_id AS project_manager_id, a.name AS assignee_name,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
    FROM tasks t
    JOIN projects pr ON pr.id = t.project_id
    LEFT JOIN users a ON a.id = t.assignee_id`;

/**
 * What the actor may do with a task:
 *  - Admins, and managers leading the task's project, may edit and delete everything.
 *  - Anyone may move the status of a task assigned to them.
 */
function permissionsFor(actor, row) {
    const full =
        actor.role === 'Admin' || (actor.role === 'Manager' && row.project_manager_id === actor.id);
    return { edit: full, status: full || row.assignee_id === actor.id, delete: full };
}

const isOverdue = (r) => r.status !== 'Done' && !!r.due_date && r.due_date < today();

const map = (r, actor) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    projectId: r.project_id,
    projectName: r.project_name,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    createdBy: r.created_by,
    priority: r.priority,
    status: r.status,
    dueDate: r.due_date,
    overdue: isOverdue(r),
    completedAt: iso(r.completed_at),
    commentCount: Number(r.comment_count),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    permissions: permissionsFor(actor, r)
});

async function getRow(id) {
    const row = await db.one(`${BASE_SELECT} WHERE t.id = ?`, [id]);
    if (!row) throw notFound('Task');
    return row;
}

async function assertValidAssignee(userId) {
    const user = await db.one('SELECT id, status FROM users WHERE id = ?', [userId]);
    if (!user) throw badRequest('The selected assignee does not exist');
    if (user.status !== 'Active') throw badRequest('The selected assignee is deactivated');
}

async function list(filters, actor) {
    const p = paging(filters);
    const where = [];
    const params = [];
    const now = today();

    if (filters.q) {
        where.push('(t.title LIKE ? OR t.description LIKE ?)');
        params.push(likeTerm(filters.q), likeTerm(filters.q));
    }
    if (filters.projectId) {
        where.push('t.project_id = ?');
        params.push(filters.projectId);
    }
    if (filters.mine) {
        where.push('t.assignee_id = ?');
        params.push(actor.id);
    } else if (filters.assigneeId) {
        where.push('t.assignee_id = ?');
        params.push(filters.assigneeId);
    }
    if (filters.unassigned) where.push('t.assignee_id IS NULL');
    if (filters.status) {
        where.push('t.status = ?');
        params.push(filters.status);
    }
    if (filters.open === true) where.push("t.status <> 'Done'");
    if (filters.priority) {
        where.push('t.priority = ?');
        params.push(filters.priority);
    }
    if (filters.overdue === true) {
        where.push("(t.status <> 'Done' AND t.due_date IS NOT NULL AND t.due_date < ?)");
        params.push(now);
    } else if (filters.overdue === false) {
        where.push("NOT (t.status <> 'Done' AND t.due_date IS NOT NULL AND t.due_date < ?)");
        params.push(now);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = {
        newest: 't.created_at DESC, t.id DESC',
        due: 't.due_date IS NULL, t.due_date ASC, t.id ASC',
        priority: "FIELD(t.priority, 'Urgent', 'High', 'Medium', 'Low'), t.due_date IS NULL, t.due_date ASC, t.id ASC",
        updated: 't.updated_at DESC, t.id DESC'
    }[filters.sort];

    const total = (
        await db.one(`SELECT COUNT(*) AS n FROM tasks t JOIN projects pr ON pr.id = t.project_id ${clause}`, params)
    ).n;
    const rows = await db.query(`${BASE_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [
        ...params,
        p.pageSize,
        p.offset
    ]);
    return { items: rows.map(r => map(r, actor)), meta: pageMeta(p, total) };
}

async function get(id, actor, { withComments = false } = {}) {
    const task = map(await getRow(id), actor);
    if (withComments) task.comments = await comments.listForTask(id);
    return task;
}

async function create(input, actor) {
    const project = await projects.getRow(input.projectId).catch(err => {
        if (err.status === 404) throw badRequest('The selected project does not exist');
        throw err;
    });
    if (!projects.canManage(actor, project)) {
        throw forbidden('Only an administrator or the project manager can add tasks to this project');
    }
    if (input.assigneeId) await assertValidAssignee(input.assigneeId);

    const result = await db.query(
        `INSERT INTO tasks (title, description, project_id, assignee_id, created_by, priority, status, due_date, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${input.status === 'Done' ? 'UTC_TIMESTAMP()' : 'NULL'})`,
        [
            input.title,
            input.description ?? null,
            input.projectId,
            input.assigneeId ?? null,
            actor.id,
            input.priority,
            input.status,
            input.dueDate ?? null
        ]
    );
    await activity.log({
        userId: actor.id,
        action: 'task.created',
        entityType: 'task',
        entityId: result.insertId,
        projectId: input.projectId,
        message: `created task ${label(input.title)}`
    });
    return get(result.insertId, actor, { withComments: true });
}

async function update(id, patch, actor) {
    const existing = await getRow(id);
    const perms = permissionsFor(actor, existing);

    const touched = Object.keys(patch).filter(key => patch[key] !== undefined);
    if (!perms.edit) {
        if (!perms.status) throw forbidden('You can only change tasks assigned to you');
        if (touched.some(key => key !== 'status')) {
            throw forbidden('You can only change the status of tasks assigned to you');
        }
    }

    if (patch.projectId !== undefined && patch.projectId !== existing.project_id) {
        const target = await projects.getRow(patch.projectId).catch(err => {
            if (err.status === 404) throw badRequest('The selected project does not exist');
            throw err;
        });
        if (!projects.canManage(actor, target)) {
            throw forbidden('You cannot move tasks into a project you do not manage');
        }
    }
    if (patch.assigneeId) await assertValidAssignee(patch.assigneeId);

    const columns = {
        title: 'title',
        description: 'description',
        projectId: 'project_id',
        assigneeId: 'assignee_id',
        priority: 'priority',
        status: 'status',
        dueDate: 'due_date'
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(columns)) {
        if (patch[key] !== undefined) {
            sets.push(`${column} = ?`);
            params.push(patch[key]);
        }
    }
    const statusChanged = patch.status !== undefined && patch.status !== existing.status;
    if (statusChanged) sets.push(patch.status === 'Done' ? 'completed_at = UTC_TIMESTAMP()' : 'completed_at = NULL');
    await db.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);

    const projectId = patch.projectId ?? existing.project_id;
    const title = patch.title ?? existing.title;
    const entry = { userId: actor.id, entityType: 'task', entityId: id, projectId };

    if (statusChanged) {
        const verb =
            patch.status === 'Done'
                ? `completed task ${label(title)}`
                : existing.status === 'Done'
                  ? `reopened task ${label(title)} (${patch.status})`
                  : `moved task ${label(title)} from ${existing.status} to ${patch.status}`;
        await activity.log({ ...entry, action: patch.status === 'Done' ? 'task.completed' : 'task.moved', message: verb });
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== existing.assignee_id) {
        let message = `unassigned task ${label(title)}`;
        if (patch.assigneeId) {
            const assignee = await db.one('SELECT name FROM users WHERE id = ?', [patch.assigneeId]);
            message = `assigned task ${label(title)} to ${assignee.name}`;
        }
        await activity.log({ ...entry, action: 'task.assigned', message });
    }
    const otherKeys = touched.filter(k => !['status', 'assigneeId'].includes(k));
    if (otherKeys.length) {
        await activity.log({ ...entry, action: 'task.updated', message: `updated task ${label(title)}` });
    }
    return get(id, actor, { withComments: true });
}

async function remove(id, actor) {
    const existing = await getRow(id);
    if (!permissionsFor(actor, existing).delete) {
        throw forbidden('Only an administrator or the project manager can delete this task');
    }
    await db.query('DELETE FROM tasks WHERE id = ?', [id]);
    await activity.log({
        userId: actor.id,
        action: 'task.deleted',
        entityType: 'task',
        entityId: id,
        projectId: existing.project_id,
        message: `deleted task ${label(existing.title)}`
    });
}

module.exports = { list, get, create, update, remove, getRow, permissionsFor };
