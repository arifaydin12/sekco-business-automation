'use strict';

const mysql = require('mysql2/promise');

let pool = null;

/** Creates the shared connection pool (idempotent). All sessions run in UTC. */
function init(dbConfig) {
    if (pool) return pool;
    pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        charset: 'utf8mb4',
        waitForConnections: true,
        connectionLimit: 10,
        timezone: 'Z',
        dateStrings: ['DATE']
    });
    pool.pool.on('connection', (connection) => {
        connection.query("SET time_zone = '+00:00'");
    });
    return pool;
}

function getPool() {
    if (!pool) throw new Error('Database pool is not initialised');
    return pool;
}

/** Runs a query and returns the rows (or the result header for writes). */
async function query(sql, params = [], conn = null) {
    const [rows] = await (conn || getPool()).query(sql, params);
    return rows;
}

async function one(sql, params = [], conn = null) {
    const rows = await query(sql, params, conn);
    return rows[0] || null;
}

/** Runs fn(connection) inside a transaction. */
async function transaction(fn) {
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function close() {
    if (!pool) return;
    const p = pool;
    pool = null;
    await p.end();
}

module.exports = { init, getPool, query, one, transaction, close };
