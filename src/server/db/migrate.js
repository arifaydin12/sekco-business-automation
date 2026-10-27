'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SCHEMA_FILE = path.join(__dirname, '..', '..', '..', 'database.sql');

/**
 * Applies database.sql to the database named in dbConfig.database (creating it if needed).
 * The CREATE DATABASE / USE lines of the file are replaced by the configured name.
 * With { reset: true } the database is dropped first.
 */
async function migrate(dbConfig, { reset = false } = {}) {
    const name = dbConfig.database;
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
        throw new Error(`Invalid database name: ${name}`);
    }

    const sql = fs
        .readFileSync(SCHEMA_FILE, 'utf8')
        .split(/\r?\n/)
        .filter(line => !/^\s*(CREATE DATABASE|USE)\b/i.test(line))
        .join('\n');

    const conn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        multipleStatements: true
    });
    try {
        if (reset) await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
        await conn.query(
            `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        await conn.query(`USE \`${name}\``);
        await conn.query(sql);
    } finally {
        await conn.end();
    }
}

module.exports = { migrate };
