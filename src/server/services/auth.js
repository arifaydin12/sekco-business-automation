'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const users = require('./users');
const { unauthorized, forbidden } = require('../utils/errors');

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function login(config, email, password) {
    const row = await db.one('SELECT id, password_hash, status FROM users WHERE email = ?', [email]);
    const matches = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !matches) throw unauthorized('Invalid email or password');
    if (row.status !== 'Active') throw forbidden('This account is deactivated. Contact an administrator.');

    await db.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
    const token = jwt.sign({ sub: row.id }, config.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: config.jwtExpiresIn
    });
    return { token, user: await users.get(row.id) };
}

module.exports = { login };
