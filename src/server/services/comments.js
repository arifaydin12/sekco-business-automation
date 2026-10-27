'use strict';

const db = require('../db');
const activity = require('./activity');
const { forbidden, notFound } = require('../utils/errors');
const { iso } = require('../utils/http');

const map = (r) => ({
    id: r.id,
    taskId: r.task_id,
    userId: r.user_id,
    userName: r.user_name,
    userRole: r.user_role,
    body: r.body,
    createdAt: iso(r.created_at)
});

async function getRow(id) {
    const row = await db.one(
        `SELECT c.*, u.name AS user_name, u.role AS user_role
         FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
        [id]
    );
    if (!row) throw notFound('Comment');
    return row;
}

async function listForTask(taskId) {
    const rows = await db.query(
        `SELECT c.*, u.name AS user_name, u.role AS user_role
         FROM comments c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.task_id = ? ORDER BY c.created_at ASC, c.id ASC`,
        [taskId]
    );
    return rows.map(map);
}

async function add(taskId, body, actor) {
    const task = await db.one('SELECT id, title, project_id FROM tasks WHERE id = ?', [taskId]);
    if (!task) throw notFound('Task');
    const result = await db.query('INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)', [
        taskId,
        actor.id,
        body
    ]);
    await activity.log({
        userId: actor.id,
        action: 'comment.created',
        entityType: 'comment',
        entityId: result.insertId,
        projectId: task.project_id,
        message: `commented on ${activity.label(task.title)}`
    });
    return map(await getRow(result.insertId));
}

/** Authors may delete their own comments; admins may delete any. */
async function remove(commentId, actor) {
    const row = await getRow(commentId);
    if (actor.role !== 'Admin' && row.user_id !== actor.id) {
        throw forbidden('You can only delete your own comments');
    }
    await db.query('DELETE FROM comments WHERE id = ?', [commentId]);
}

module.exports = { listForTask, add, remove };
