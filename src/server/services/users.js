'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const activity = require('./activity');
const { conflict, forbidden, notFound, badRequest } = require('../utils/errors');
const { paging, pageMeta, likeTerm, iso } = require('../utils/http');

let rounds = 10;
const setBcryptRounds = (n) => {
    rounds = n;
};
const hashPassword = (plain) => bcrypt.hash(plain, rounds);

const COLUMNS = 'id, name, email, role, status, job_title, last_login_at, created_at';

const map = (r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    jobTitle: r.job_title,
    lastLoginAt: iso(r.last_login_at),
    createdAt: iso(r.created_at)
});

/** Generates a random password that satisfies the password policy. */
function generatePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (const byte of crypto.randomBytes(12)) out += alphabet[byte % alphabet.length];
    return `${out}7`;
}

async function getRow(id) {
    const row = await db.one(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [id]);
    if (!row) throw notFound('User');
    return row;
}

async function list(filters) {
    const p = paging(filters);
    const where = [];
    const params = [];
    if (filters.q) {
        where.push('(name LIKE ? OR email LIKE ?)');
        params.push(likeTerm(filters.q), likeTerm(filters.q));
    }
    if (filters.role) {
        where.push('role = ?');
        params.push(filters.role);
    }
    if (filters.status) {
        where.push('status = ?');
        params.push(filters.status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.one(`SELECT COUNT(*) AS n FROM users ${clause}`, params)).n;
    const rows = await db.query(
        `SELECT ${COLUMNS} FROM users ${clause} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
        [...params, p.pageSize, p.offset]
    );
    return { items: rows.map(map), meta: pageMeta(p, total) };
}

/** Lightweight list of active users for pickers (assignee, manager). */
async function directory() {
    const rows = await db.query(
        `SELECT id, name, role, job_title FROM users WHERE status = 'Active' ORDER BY name ASC`
    );
    return rows.map(r => ({ id: r.id, name: r.name, role: r.role, jobTitle: r.job_title }));
}

async function get(id) {
    return map(await getRow(id));
}

async function create(input, actor) {
    const hash = await hashPassword(input.password);
    let result;
    try {
        result = await db.query(
            `INSERT INTO users (name, email, password_hash, role, status, job_title)
             VALUES (?, ?, ?, ?, 'Active', ?)`,
            [input.name, input.email, hash, input.role, input.jobTitle ?? null]
        );
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw conflict('A user with this email already exists');
        throw err;
    }
    await activity.log({
        userId: actor.id,
        action: 'user.created',
        entityType: 'user',
        entityId: result.insertId,
        message: `created the account for ${input.name} (${input.role})`
    });
    return get(result.insertId);
}

async function update(id, patch, actor) {
    const existing = await getRow(id);

    if (id === actor.id) {
        if (patch.role !== undefined && patch.role !== existing.role) {
            throw forbidden('You cannot change your own role');
        }
        if (patch.status !== undefined && patch.status !== 'Active') {
            throw forbidden('You cannot deactivate your own account');
        }
    }

    const columns = { name: 'name', email: 'email', role: 'role', status: 'status', jobTitle: 'job_title' };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(columns)) {
        if (patch[key] !== undefined) {
            sets.push(`${column} = ?`);
            params.push(patch[key]);
        }
    }
    try {
        await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw conflict('A user with this email already exists');
        throw err;
    }

    const changes = [];
    if (patch.role !== undefined && patch.role !== existing.role) changes.push(`role ${existing.role} → ${patch.role}`);
    if (patch.status !== undefined && patch.status !== existing.status) {
        changes.push(patch.status === 'Active' ? 'activated' : 'deactivated');
    }
    await activity.log({
        userId: actor.id,
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        message: `updated ${patch.name ?? existing.name}${changes.length ? ` (${changes.join(', ')})` : ''}`
    });
    return get(id);
}

async function resetPassword(id, password, actor) {
    const existing = await getRow(id);
    const temporaryPassword = password || generatePassword();
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(temporaryPassword), id]);
    await activity.log({
        userId: actor.id,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: id,
        message: `reset the password of ${existing.name}`
    });
    return { temporaryPassword: password ? undefined : temporaryPassword };
}

async function changeOwnPassword(userId, currentPassword, newPassword) {
    const row = await db.one('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!row) throw notFound('User');
    if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
        throw badRequest('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
        throw badRequest('The new password must be different from the current one');
    }
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword), userId]);
}

async function updateProfile(userId, patch) {
    const sets = [];
    const params = [];
    if (patch.name !== undefined) {
        sets.push('name = ?');
        params.push(patch.name);
    }
    if (patch.jobTitle !== undefined) {
        sets.push('job_title = ?');
        params.push(patch.jobTitle);
    }
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, userId]);
    return get(userId);
}

module.exports = {
    map,
    setBcryptRounds,
    hashPassword,
    generatePassword,
    list,
    directory,
    get,
    create,
    update,
    resetPassword,
    changeOwnPassword,
    updateProfile
};
