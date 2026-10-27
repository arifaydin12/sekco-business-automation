'use strict';

const db = require('../db');
const activity = require('./activity');
const { badRequest, forbidden, notFound } = require('../utils/errors');
const { paging, pageMeta, likeTerm, iso, today } = require('../utils/http');

const { label } = activity;

const BASE_SELECT = `
    SELECT p.*, m.name AS manager_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Done') AS done_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'Done'
            AND t.due_date IS NOT NULL AND t.due_date < ?) AS overdue_count
    FROM projects p
    LEFT JOIN users m ON m.id = p.manager_id`;

/** Admins manage every project; managers manage the projects they lead. */
const canManage = (actor, project) =>
    actor.role === 'Admin' || (actor.role === 'Manager' && project.manager_id === actor.id);

/** Progress is the share of finished tasks, rounded to a whole percent (0 when there are no tasks). */
const computeProgress = (done, total) => (total > 0 ? Math.round((done * 100) / total) : 0);

const map = (r, actor) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    managerId: r.manager_id,
    managerName: r.manager_name,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    taskCount: Number(r.task_count),
    doneCount: Number(r.done_count),
    overdueCount: Number(r.overdue_count),
    progress: computeProgress(Number(r.done_count), Number(r.task_count)),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    permissions: { edit: canManage(actor, r), delete: canManage(actor, r) }
});

async function getRow(id) {
    const row = await db.one(`${BASE_SELECT} WHERE p.id = ?`, [today(), id]);
    if (!row) throw notFound('Project');
    return row;
}

async function assertValidManager(managerId) {
    const user = await db.one('SELECT id, role, status FROM users WHERE id = ?', [managerId]);
    if (!user) throw badRequest('The selected manager does not exist');
    if (user.status !== 'Active') throw badRequest('The selected manager is deactivated');
    if (user.role === 'User') throw badRequest('Only users with the Manager or Admin role can lead a project');
}

async function list(filters, actor) {
    const p = paging(filters);
    const where = [];
    const params = [];
    if (filters.q) {
        where.push('(p.name LIKE ? OR p.description LIKE ?)');
        params.push(likeTerm(filters.q), likeTerm(filters.q));
    }
    if (filters.status) {
        where.push('p.status = ?');
        params.push(filters.status);
    }
    if (filters.managerId) {
        where.push('p.manager_id = ?');
        params.push(filters.managerId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = {
        newest: 'p.created_at DESC, p.id DESC',
        name: 'p.name ASC',
        deadline: 'p.end_date IS NULL, p.end_date ASC, p.name ASC',
        progress: 'COALESCE(done_count / NULLIF(task_count, 0), 0) DESC, p.name ASC'
    }[filters.sort];

    const total = (await db.one(`SELECT COUNT(*) AS n FROM projects p ${clause}`, params)).n;
    const rows = await db.query(`${BASE_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [
        today(),
        ...params,
        p.pageSize,
        p.offset
    ]);
    return { items: rows.map(r => map(r, actor)), meta: pageMeta(p, total) };
}

async function get(id, actor) {
    const row = await getRow(id);
    const project = map(row, actor);
    const counts = await db.query(
        'SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status',
        [id]
    );
    project.tasksByStatus = { 'To do': 0, 'In progress': 0, Done: 0 };
    for (const c of counts) project.tasksByStatus[c.status] = Number(c.n);
    return project;
}

async function create(input, actor) {
    let managerId = input.managerId;
    if (managerId === undefined || (managerId === null && actor.role !== 'Admin')) managerId = actor.id;
    if (managerId !== null) await assertValidManager(managerId);

    const result = await db.query(
        `INSERT INTO projects (name, description, manager_id, status, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            input.name,
            input.description ?? null,
            managerId,
            input.status,
            input.startDate ?? null,
            input.endDate ?? null,
            actor.id
        ]
    );
    await activity.log({
        userId: actor.id,
        action: 'project.created',
        entityType: 'project',
        entityId: result.insertId,
        projectId: result.insertId,
        message: `created project ${label(input.name)}`
    });
    return get(result.insertId, actor);
}

async function update(id, patch, actor) {
    const existing = await getRow(id);
    if (!canManage(actor, existing)) throw forbidden('Only an administrator or the project manager can edit this project');

    const startDate = patch.startDate !== undefined ? patch.startDate : existing.start_date;
    const endDate = patch.endDate !== undefined ? patch.endDate : existing.end_date;
    if (startDate && endDate && endDate < startDate) {
        throw badRequest('End date must not be before the start date');
    }
    if (patch.managerId) await assertValidManager(patch.managerId);
    if (patch.managerId === null && actor.role !== 'Admin') {
        throw forbidden('Only an administrator can leave a project without a manager');
    }

    const columns = {
        name: 'name',
        description: 'description',
        managerId: 'manager_id',
        status: 'status',
        startDate: 'start_date',
        endDate: 'end_date'
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(columns)) {
        if (patch[key] !== undefined) {
            sets.push(`${column} = ?`);
            params.push(patch[key]);
        }
    }
    await db.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);

    const statusChanged = patch.status !== undefined && patch.status !== existing.status;
    await activity.log({
        userId: actor.id,
        action: statusChanged ? 'project.status_changed' : 'project.updated',
        entityType: 'project',
        entityId: id,
        projectId: id,
        message: statusChanged
            ? `changed the status of project ${label(patch.name ?? existing.name)} to ${patch.status}`
            : `updated project ${label(patch.name ?? existing.name)}`
    });
    return get(id, actor);
}

async function remove(id, actor) {
    const existing = await getRow(id);
    if (!canManage(actor, existing)) throw forbidden('Only an administrator or the project manager can delete this project');
    await activity.log({
        userId: actor.id,
        action: 'project.deleted',
        entityType: 'project',
        entityId: id,
        message: `deleted project ${label(existing.name)}`
    });
    await db.query('DELETE FROM projects WHERE id = ?', [id]);
}

module.exports = { list, get, create, update, remove, getRow, canManage, computeProgress };
