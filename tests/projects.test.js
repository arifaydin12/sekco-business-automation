'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, makeProject, makeTask, isoDate } = require('./helpers');

describe('projects', () => {
    let ctx;
    before(async () => {
        ctx = await setup();
    });
    after(teardown);

    describe('creating', () => {
        it('lets managers and admins create projects; the creator becomes the manager by default', async () => {
            const res = await ctx.as('manager').post('/api/projects', {
                name: 'Website relaunch',
                description: 'New marketing site',
                startDate: isoDate(-5),
                endDate: isoDate(30)
            });
            assert.equal(res.status, 201);
            const p = res.body.data;
            assert.equal(p.name, 'Website relaunch');
            assert.equal(p.managerId, ctx.users.manager.id);
            assert.equal(p.managerName, 'Test Manager');
            assert.equal(p.status, 'Planning');
            assert.equal(p.progress, 0);
            assert.equal(p.taskCount, 0);
            assert.deepEqual(p.permissions, { edit: true, delete: true });

            const adminMade = await ctx.as('admin').post('/api/projects', { name: 'Admin project', managerId: ctx.users.manager2.id, status: 'Active' });
            assert.equal(adminMade.status, 201);
            assert.equal(adminMade.body.data.managerId, ctx.users.manager2.id);
            assert.equal(adminMade.body.data.permissions.edit, true);
        });

        it('forbids regular users', async () => {
            const res = await ctx.as('user').post('/api/projects', { name: 'Sneaky project' });
            assert.equal(res.status, 403);
        });

        it('validates fields', async () => {
            const bad = await ctx.as('manager').post('/api/projects', { name: 'x', status: 'Nonsense', startDate: '31-12-2026' });
            assert.equal(bad.status, 400);
            const paths = bad.body.error.details.map(d => d.path);
            for (const f of ['name', 'status', 'startDate']) assert.ok(paths.includes(f), f);

            const order = await ctx.as('manager').post('/api/projects', { name: 'Backwards dates', startDate: isoDate(10), endDate: isoDate(1) });
            assert.equal(order.status, 400);
            assert.equal(order.body.error.details[0].path, 'endDate');
        });

        it('only accepts active managers or admins as project leads', async () => {
            const asUser = await ctx.as('admin').post('/api/projects', { name: 'Led by a user', managerId: ctx.users.user.id });
            assert.equal(asUser.status, 400);
            const missing = await ctx.as('admin').post('/api/projects', { name: 'Led by nobody', managerId: 999999 });
            assert.equal(missing.status, 400);
        });
    });

    describe('reading and filtering', () => {
        before(async () => {
            await makeProject(ctx, 'admin', { name: 'Alpha rollout', status: 'Active', endDate: isoDate(40) });
            await makeProject(ctx, 'admin', { name: 'Beta migration', status: 'On hold', endDate: isoDate(10) });
            await makeProject(ctx, 'manager2', { name: 'Gamma research', status: 'Completed' });
        });

        it('lists projects with pagination metadata', async () => {
            const res = await ctx.as('user').get('/api/projects?pageSize=2');
            assert.equal(res.status, 200);
            assert.equal(res.body.data.length, 2);
            assert.ok(res.body.meta.total >= 5);
            assert.equal(res.body.meta.pageSize, 2);
            assert.equal(res.body.meta.totalPages, Math.ceil(res.body.meta.total / 2));
        });

        it('filters by status, search text and manager', async () => {
            const status = await ctx.as('user').get('/api/projects?status=On%20hold');
            assert.deepEqual(status.body.data.map(p => p.name), ['Beta migration']);

            const search = await ctx.as('user').get('/api/projects?q=rollout');
            assert.deepEqual(search.body.data.map(p => p.name), ['Alpha rollout']);

            const mgr = await ctx.as('user').get(`/api/projects?managerId=${ctx.users.manager2.id}`);
            assert.ok(mgr.body.data.length >= 1);
            assert.ok(mgr.body.data.every(p => p.managerId === ctx.users.manager2.id));
        });

        it('sorts by name and by deadline', async () => {
            const byName = await ctx.as('user').get('/api/projects?sort=name&pageSize=100');
            const names = byName.body.data.map(p => p.name);
            assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));

            const byDeadline = await ctx.as('user').get('/api/projects?sort=deadline&pageSize=100');
            const dated = byDeadline.body.data.filter(p => p.endDate).map(p => p.endDate);
            assert.deepEqual(dated, [...dated].sort());
        });

        it('returns a project with task counts and 404s for unknown ids', async () => {
            const list = await ctx.as('user').get('/api/projects?q=Alpha');
            const res = await ctx.as('user').get(`/api/projects/${list.body.data[0].id}`);
            assert.equal(res.status, 200);
            assert.deepEqual(res.body.data.tasksByStatus, { 'To do': 0, 'In progress': 0, Done: 0 });
            assert.equal(res.body.data.permissions.edit, false);
            assert.equal((await ctx.as('user').get('/api/projects/999999')).status, 404);
        });
    });

    describe('updating and deleting', () => {
        it('lets the project manager and admins edit, but not other managers or users', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'Ownership test' });

            const own = await ctx.as('manager').patch(`/api/projects/${p.id}`, { status: 'Active', description: 'Updated' });
            assert.equal(own.status, 200);
            assert.equal(own.body.data.status, 'Active');
            assert.equal(own.body.data.description, 'Updated');

            const admin = await ctx.as('admin').patch(`/api/projects/${p.id}`, { name: 'Renamed by admin' });
            assert.equal(admin.status, 200);

            const other = await ctx.as('manager2').patch(`/api/projects/${p.id}`, { name: 'Hijacked' });
            assert.equal(other.status, 403);
            const user = await ctx.as('user').patch(`/api/projects/${p.id}`, { name: 'Hijacked' });
            assert.equal(user.status, 403);

            const viewed = await ctx.as('manager2').get(`/api/projects/${p.id}`);
            assert.equal(viewed.body.data.permissions.edit, false);
        });

        it('validates merged dates on update and rejects empty bodies', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'Dates', startDate: isoDate(0), endDate: isoDate(10) });
            const bad = await ctx.as('manager').patch(`/api/projects/${p.id}`, { endDate: isoDate(-3) });
            assert.equal(bad.status, 400);
            const empty = await ctx.as('manager').patch(`/api/projects/${p.id}`, {});
            assert.equal(empty.status, 400);
            const cleared = await ctx.as('manager').patch(`/api/projects/${p.id}`, { endDate: null });
            assert.equal(cleared.status, 200);
            assert.equal(cleared.body.data.endDate, null);
        });

        it('lets admins reassign the manager', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'Reassign me' });
            const res = await ctx.as('admin').patch(`/api/projects/${p.id}`, { managerId: ctx.users.manager2.id });
            assert.equal(res.status, 200);
            assert.equal(res.body.data.managerName, 'Other Manager');
            const edit = await ctx.as('manager2').patch(`/api/projects/${p.id}`, { name: 'Now mine' });
            assert.equal(edit.status, 200);
        });

        it('deletes a project together with its tasks (and only for permitted roles)', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'To delete' });
            const t = await makeTask(ctx, p.id);

            assert.equal((await ctx.as('manager2').delete(`/api/projects/${p.id}`)).status, 403);
            assert.equal((await ctx.as('manager').delete(`/api/projects/${p.id}`)).status, 204);
            assert.equal((await ctx.as('admin').get(`/api/projects/${p.id}`)).status, 404);
            assert.equal((await ctx.as('admin').get(`/api/tasks/${t.id}`)).status, 404);
        });
    });

    describe('progress', () => {
        it('is computed from finished tasks and follows every task change', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'Progress test' });
            const progress = async () => (await ctx.as('user').get(`/api/projects/${p.id}`)).body.data;

            assert.equal((await progress()).progress, 0);

            const t1 = await makeTask(ctx, p.id, 'manager', { title: 'First task' });
            const t2 = await makeTask(ctx, p.id, 'manager', { title: 'Second task' });
            const t3 = await makeTask(ctx, p.id, 'manager', { title: 'Third task' });
            let state = await progress();
            assert.equal(state.taskCount, 3);
            assert.equal(state.progress, 0);

            await ctx.as('manager').patch(`/api/tasks/${t1.id}`, { status: 'Done' });
            state = await progress();
            assert.equal(state.doneCount, 1);
            assert.equal(state.progress, 33);

            await ctx.as('manager').patch(`/api/tasks/${t2.id}`, { status: 'In progress' });
            assert.equal((await progress()).progress, 33, 'in-progress tasks do not count as done');

            await ctx.as('manager').patch(`/api/tasks/${t2.id}`, { status: 'Done' });
            assert.equal((await progress()).progress, 67);

            await ctx.as('manager').patch(`/api/tasks/${t3.id}`, { status: 'Done' });
            state = await progress();
            assert.equal(state.progress, 100);
            assert.deepEqual(state.tasksByStatus, { 'To do': 0, 'In progress': 0, Done: 3 });

            await ctx.as('manager').patch(`/api/tasks/${t3.id}`, { status: 'To do' });
            assert.equal((await progress()).progress, 67, 'reopening lowers progress');

            await ctx.as('manager').delete(`/api/tasks/${t3.id}`);
            state = await progress();
            assert.equal(state.taskCount, 2);
            assert.equal(state.progress, 100, 'deleting an open task raises progress');

            const listed = (await ctx.as('user').get('/api/projects?q=Progress%20test')).body.data[0];
            assert.equal(listed.progress, 100);
        });

        it('counts overdue open tasks per project', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'Overdue counter' });
            await makeTask(ctx, p.id, 'manager', { title: 'Late', dueDate: isoDate(-2) });
            await makeTask(ctx, p.id, 'manager', { title: 'Late but done', dueDate: isoDate(-2), status: 'Done' });
            await makeTask(ctx, p.id, 'manager', { title: 'Future', dueDate: isoDate(5) });
            const res = await ctx.as('user').get(`/api/projects/${p.id}`);
            assert.equal(res.body.data.overdueCount, 1);
        });
    });

    describe('activity', () => {
        it('records project events in the project activity feed', async () => {
            const p = await makeProject(ctx, 'manager', { name: 'Feed project' });
            await makeTask(ctx, p.id, 'manager', { title: 'Feed task' });
            await ctx.as('manager').patch(`/api/projects/${p.id}`, { status: 'Active' });
            const res = await ctx.as('user').get(`/api/projects/${p.id}/activity`);
            assert.equal(res.status, 200);
            const messages = res.body.data.map(a => a.message);
            assert.ok(messages.some(m => m.includes('created project "Feed project"')));
            assert.ok(messages.some(m => m.includes('created task "Feed task"')));
            assert.ok(messages.some(m => m.includes('changed the status')));
            assert.equal(res.body.data[0].userName, 'Test Manager');
            assert.equal((await ctx.as('user').get('/api/projects/999999/activity')).status, 404);
        });
    });
});
