'use strict';

const db = require('../db');
const { paging, pageMeta, iso } = require('../utils/http');

const clip = (text, max = 255) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Shortens a user-provided name for use inside an activity message. */
const label = (text, max = 60) => `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;

async function log(entry, conn = null) {
    await db.query(
        `INSERT INTO activity (user_id, action, entity_type, entity_id, project_id, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            entry.userId ?? null,
            entry.action,
            entry.entityType,
            entry.entityId ?? null,
            entry.projectId ?? null,
            clip(entry.message)
        ],
        conn
    );
}

const map = (r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    projectId: r.project_id,
    projectName: r.project_name,
    message: r.message,
    createdAt: iso(r.created_at)
});

async function list(filters) {
    const p = paging(filters);
    const where = [];
    const params = [];
    if (filters.projectId) {
        where.push('a.project_id = ?');
        params.push(filters.projectId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (await db.one(`SELECT COUNT(*) AS n FROM activity a ${clause}`, params)).n;
    const rows = await db.query(
        `SELECT a.*, u.name AS user_name, pr.name AS project_name
         FROM activity a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN projects pr ON pr.id = a.project_id
         ${clause}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
        [...params, p.pageSize, p.offset]
    );
    return { items: rows.map(map), meta: pageMeta(p, total) };
}

async function recent(limit = 8) {
    const rows = await db.query(
        `SELECT a.*, u.name AS user_name, pr.name AS project_name
         FROM activity a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN projects pr ON pr.id = a.project_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ?`,
        [limit]
    );
    return rows.map(map);
}

module.exports = { log, list, recent, label };
