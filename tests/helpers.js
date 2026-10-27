'use strict';

/**
 * Shared test helpers. The integration tests talk to a real MySQL server using a dedicated database
 * (TEST_DB_NAME, default "sekco_test") that is dropped and recreated for every test file.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-integration-tests-only-0123456789';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/server/config');
const { migrate } = require('../src/server/db/migrate');
const { createApp } = require('../src/server/app');
const db = require('../src/server/db');

const TEST_PASSWORD = 'Secret123';

function testConfig(overrides = {}) {
    const base = loadConfig();
    const database = process.env.TEST_DB_NAME || 'sekco_test';
    if (!/_test$/.test(database)) {
        throw new Error(`Refusing to run tests against "${database}": the test database name must end with "_test".`);
    }
    return {
        ...base,
        env: 'test',
        bcryptRounds: 4,
        loginRateLimit: { max: 1000, windowMs: 60000 },
        apiRateLimit: { max: 100000, windowMs: 60000 },
        ...overrides,
        db: { ...base.db, database }
    };
}

/** Recreates the test database, builds the app and inserts one account per role. */
async function setup(overrides = {}) {
    const config = testConfig(overrides);
    await db.close();
    await migrate(config.db, { reset: true });
    const app = createApp(config);

    const ctx = { app, config, users: {}, tokens: {} };
    ctx.createUser = async (key, { name, role = 'User', status = 'Active' } = {}) => {
        const email = `${key}@test.example`;
        const hash = await bcrypt.hash(TEST_PASSWORD, 4);
        const result = await db.query(
            'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
            [name || key, email, hash, role, status]
        );
        ctx.users[key] = { id: result.insertId, email, role, name: name || key };
        return ctx.users[key];
    };
    ctx.login = async (key) => {
        const res = await request(app).post('/api/auth/login').send({ email: ctx.users[key].email, password: TEST_PASSWORD });
        if (res.status !== 200) throw new Error(`Login failed for ${key}: ${res.status} ${JSON.stringify(res.body)}`);
        ctx.tokens[key] = res.body.data.token;
        return ctx.tokens[key];
    };
    /** Supertest request builder authenticated as the given test user. */
    ctx.as = (key) => {
        const auth = (req) => req.set('Authorization', `Bearer ${ctx.tokens[key]}`);
        return {
            get: (url) => auth(request(app).get(url)),
            post: (url, body) => auth(request(app).post(url)).send(body),
            patch: (url, body) => auth(request(app).patch(url)).send(body),
            delete: (url) => auth(request(app).delete(url))
        };
    };
    ctx.anon = () => request(app);

    await ctx.createUser('admin', { name: 'Test Admin', role: 'Admin' });
    await ctx.createUser('manager', { name: 'Test Manager', role: 'Manager' });
    await ctx.createUser('manager2', { name: 'Other Manager', role: 'Manager' });
    await ctx.createUser('user', { name: 'Test User', role: 'User' });
    await ctx.createUser('user2', { name: 'Other User', role: 'User' });
    for (const key of ['admin', 'manager', 'manager2', 'user', 'user2']) await ctx.login(key);
    return ctx;
}

async function teardown() {
    await db.close();
}

/** Shortcut: creates a project through the API and returns it. */
async function makeProject(ctx, as = 'manager', body = {}) {
    const res = await ctx.as(as).post('/api/projects', { name: 'Test project', ...body });
    if (res.status !== 201) throw new Error(`makeProject failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data;
}

async function makeTask(ctx, projectId, as = 'manager', body = {}) {
    const res = await ctx.as(as).post('/api/tasks', { title: 'Test task', projectId, ...body });
    if (res.status !== 201) throw new Error(`makeTask failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data;
}

const isoDate = (offsetDays = 0) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
};

module.exports = { setup, teardown, makeProject, makeTask, isoDate, TEST_PASSWORD, testConfig, request };
