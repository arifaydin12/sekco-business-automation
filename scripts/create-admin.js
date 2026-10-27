'use strict';

/**
 * Creates an administrator account (use it for the very first login on a fresh database).
 *   npm run create-admin -- "Admin Name" admin@example.com "a-strong-password1"
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/server/config');

(async () => {
    const [name, rawEmail, password] = process.argv.slice(2);
    if (!name || !rawEmail || !password) {
        console.error('Usage: npm run create-admin -- "Admin Name" admin@example.com "password"');
        process.exit(1);
    }
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        console.error('Please provide a valid email address.');
        process.exit(1);
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        console.error('Password must be at least 8 characters long and contain a letter and a number.');
        process.exit(1);
    }

    const config = loadConfig();
    const db = await mysql.createConnection(config.db);
    try {
        const hash = await bcrypt.hash(password, config.bcryptRounds);
        await db.query(
            "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'Admin', 'Active')",
            [name.trim(), email, hash]
        );
        console.log(`Admin user created: ${email}`);
    } finally {
        await db.end();
    }
})().catch(err => {
    console.error(err.code === 'ER_DUP_ENTRY' ? 'A user with this email already exists.' : err.message);
    process.exit(1);
});
