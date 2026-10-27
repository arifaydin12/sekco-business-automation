'use strict';

/**
 * The static demo (docs/) runs the same UI against an in-browser mock API. These tests load that mock
 * under Node (with stubbed localStorage / fetch) and check that it follows the same rules as the real
 * server and starts from the same seed data as scripts/seed.js.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildPlan } = require('../scripts/seed');

const ROOT = path.join(__dirname, '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'));

describe('demo mock API', () => {
    let mock;
    let tokens;
    const call = (method, url, token, body) => {
        const [pathname, qs = ''] = url.split('?');
        return mock.mockRequest(method, pathname, { query: Object.fromEntries(new URLSearchParams(qs)), body, token });
    };
    const fails = async (promise, status, code) => {
        await assert.rejects(promise, (err) => {
            assert.equal(err.status, status, `expected HTTP ${status}, got ${err.status} (${err.message})`);
            if (code) assert.equal(err.code, code);
            return true;
        });
    };

    before(async () => {
        // Browser globals used by the mock
        const store = new Map();
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k)
        };
        globalThis.__SEKCO_MOCK_LATENCY__ = 0;
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url, ...rest) =>
            String(url).endsWith('data/seed.json')
                ? { ok: true, json: async () => seed }
                : realFetch(url, ...rest);

        // The front-end files are plain .js ES modules; copy them as .mjs so Node can import them
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sekco-mock-'));
        for (const name of ['mock-api', 'mock-store', 'errors']) {
            const code = fs
                .readFileSync(path.join(ROOT, 'public', 'js', 'api', `${name}.js`), 'utf8')
                .replace(/from '\.\/([\w-]+)\.js'/g, "from './$1.mjs'");
            fs.writeFileSync(path.join(dir, `${name}.mjs`), code);
        }
        mock = await import(pathToFileURL(path.join(dir, 'mock-api.mjs')).href);
        await mock.ready();

        tokens = {};
        for (const [role, email] of [['admin', 'alex.morgan@sekco.example'], ['manager', 'priya.nair@sekco.example'], ['manager2', 'marco.bellini@sekco.example'], ['user', 'daniel.okafor@sekco.example']]) {
            const res = await call('POST', '/auth/login', null, { email, password: seed.defaultPassword });
            tokens[role] = res.data.token;
        }
    });

    it('starts from the same data as the MySQL seed script', async () => {
        const plan = buildPlan(seed, new Date());
        const tasks = await call('GET', '/tasks?pageSize=100&sort=newest', tokens.admin);
        assert.equal(tasks.meta.total, plan.tasks.length);

        const byTitle = new Map(tasks.data.map(t => [t.title, t]));
        for (const t of plan.tasks) {
            const got = byTitle.get(t.title);
            assert.ok(got, `task "${t.title}" exists`);
            assert.equal(got.status, t.status);
            assert.equal(got.priority, t.priority);
            assert.equal(got.dueDate, new Date(plan.todayMs + t.due * 86400000).toISOString().slice(0, 10));
            assert.ok(Math.abs(new Date(got.createdAt).getTime() - t.createdAt) < 5000, `createdAt of "${t.title}"`);
            assert.equal(got.commentCount, t.comments.length);
        }

        const projects = await call('GET', '/projects?pageSize=100', tokens.admin);
        assert.deepEqual(projects.data.map(p => p.name).sort(), plan.projects.map(p => p.name).sort());
        const users = await call('GET', '/users?pageSize=100', tokens.admin);
        assert.equal(users.meta.total, seed.users.length);
        const activity = await call('GET', '/activity?pageSize=100', tokens.admin);
        assert.equal(activity.meta.total, plan.events.length);
    });

    it('authenticates like the server and keeps registration disabled', async () => {
        await fails(call('POST', '/auth/login', null, { email: 'alex.morgan@sekco.example', password: 'wrong-pass-1' }), 401, 'UNAUTHORIZED');
        await fails(call('POST', '/auth/login', null, {}), 400, 'VALIDATION_ERROR');
        await fails(call('POST', '/auth/register', null, { name: 'x' }), 403, 'REGISTRATION_DISABLED');
        await fails(call('GET', '/projects', null), 401);
        await fails(call('GET', '/projects', 'demo-token-9999'), 401);
        const me = await call('GET', '/auth/me', tokens.manager);
        assert.equal(me.data.role, 'Manager');
        assert.equal(me.data.passwordHash, undefined);
    });

    it('enforces roles', async () => {
        await fails(call('POST', '/users', tokens.manager, { name: 'Nope Person', email: 'nope@sekco.example', password: 'Welcome-123' }), 403);
        await fails(call('POST', '/projects', tokens.user, { name: 'Sneaky project' }), 403);
        const projects = await call('GET', '/projects?pageSize=100', tokens.admin);
        const priya = projects.data.find(p => p.managerName === 'Priya Nair');
        await fails(call('PATCH', `/projects/${priya.id}`, tokens.manager2, { name: 'Hijacked' }), 403);
        const patched = await call('PATCH', `/projects/${priya.id}`, tokens.manager, { description: 'Edited by its manager' });
        assert.equal(patched.data.description, 'Edited by its manager');
    });

    it('validates input with the same error shape', async () => {
        await assert.rejects(call('POST', '/users', tokens.admin, { name: 'x', email: 'bad', password: 'short', role: 'Root' }), (err) => {
            assert.equal(err.status, 400);
            assert.equal(err.code, 'VALIDATION_ERROR');
            const paths = err.details.map(d => d.path);
            for (const p of ['name', 'email', 'password', 'role']) assert.ok(paths.includes(p), p);
            return true;
        });
        await fails(call('POST', '/projects', tokens.manager, { name: 'Backwards', startDate: '2026-05-10', endDate: '2026-05-01' }), 400, 'VALIDATION_ERROR');
        await fails(call('GET', '/users?pageSize=1000', tokens.admin), 400);
    });

    it('computes project progress from tasks', async () => {
        const created = await call('POST', '/projects', tokens.manager, { name: 'Mock progress project', status: 'Active' });
        const id = created.data.id;
        assert.equal(created.data.progress, 0);
        const mk = (title, status) => call('POST', '/tasks', tokens.manager, { title, projectId: id, status });
        const [a, b, c] = [await mk('Task A', 'To do'), await mk('Task B', 'To do'), await mk('Task C', 'To do')];
        const progress = async () => (await call('GET', `/projects/${id}`, tokens.user)).data.progress;

        assert.equal(await progress(), 0);
        await call('PATCH', `/tasks/${a.data.id}`, tokens.manager, { status: 'Done' });
        assert.equal(await progress(), 33);
        await call('PATCH', `/tasks/${b.data.id}`, tokens.manager, { status: 'In progress' });
        assert.equal(await progress(), 33);
        await call('PATCH', `/tasks/${b.data.id}`, tokens.manager, { status: 'Done' });
        assert.equal(await progress(), 67);
        await call('PATCH', `/tasks/${c.data.id}`, tokens.manager, { status: 'Done' });
        assert.equal(await progress(), 100);
        const done = await call('GET', `/tasks/${c.data.id}`, tokens.manager);
        assert.ok(done.data.completedAt);
        await call('PATCH', `/tasks/${c.data.id}`, tokens.manager, { status: 'To do' });
        assert.equal((await call('GET', `/tasks/${c.data.id}`, tokens.manager)).data.completedAt, null);
        assert.equal(await progress(), 67);
        await call('DELETE', `/tasks/${c.data.id}`, tokens.manager);
        assert.equal(await progress(), 100);
    });

    it('lets assignees move only their own task status, and supports comments', async () => {
        const mine = await call('GET', '/tasks?mine=true&open=true&pageSize=5', tokens.user);
        const task = mine.data[0];
        assert.deepEqual(task.permissions, { edit: false, status: true, delete: false });
        await fails(call('PATCH', `/tasks/${task.id}`, tokens.user, { title: 'Renamed' }), 403);
        const moved = await call('PATCH', `/tasks/${task.id}`, tokens.user, { status: 'In progress' });
        assert.equal(moved.data.status, 'In progress');

        const others = await call('GET', '/tasks?pageSize=100', tokens.user);
        const foreign = others.data.find(t => t.assigneeId !== task.assigneeId && !t.permissions.status);
        await fails(call('PATCH', `/tasks/${foreign.id}`, tokens.user, { status: 'Done' }), 403);

        const comment = await call('POST', `/tasks/${task.id}/comments`, tokens.user, { body: 'Working on it' });
        assert.equal(comment.data.userName, 'Daniel Okafor');
        await fails(call('DELETE', `/comments/${comment.data.id}`, tokens.manager, undefined), 403);
        await call('DELETE', `/comments/${comment.data.id}`, tokens.user);
        const detail = await call('GET', `/tasks/${task.id}`, tokens.user);
        assert.ok(!detail.data.comments.some(c => c.id === comment.data.id));
    });

    it('serves dashboard statistics consistent with the task list', async () => {
        const { data } = await call('GET', '/stats/dashboard', tokens.admin);
        const all = (await call('GET', '/tasks?pageSize=100', tokens.admin)).data;
        assert.equal(data.kpis.totalTasks, all.length);
        assert.equal(data.kpis.overdueTasks, all.filter(t => t.overdue).length);
        assert.equal(data.tasksByStatus['To do'] + data.tasksByStatus['In progress'] + data.tasksByStatus.Done, all.length);
        assert.equal(data.activityOverTime.length, 14);
        assert.ok(data.recentActivity.length > 0 && data.recentActivity.length <= 8);
        assert.ok(data.projectProgress.every(p => p.progress >= 0 && p.progress <= 100));
    });

    it('can be reset to the original seed data', async () => {
        const before = (await call('GET', '/projects?pageSize=100', tokens.admin)).meta.total;
        await call('POST', '/projects', tokens.admin, { name: 'Temporary project' });
        assert.equal((await call('GET', '/projects?pageSize=100', tokens.admin)).meta.total, before + 1);
        await mock.resetData();
        assert.equal((await call('GET', '/projects?pageSize=100', tokens.admin)).meta.total, seed.projects.length);
    });
});
