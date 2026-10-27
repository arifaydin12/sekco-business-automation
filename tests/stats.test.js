'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, makeProject, makeTask, isoDate } = require('./helpers');

describe('dashboard statistics', () => {
    let ctx;
    before(async () => {
        ctx = await setup();
        const a = await makeProject(ctx, 'manager', { name: 'Stats A', status: 'Active' });
        const b = await makeProject(ctx, 'manager', { name: 'Stats B', status: 'Planning' });
        const user = ctx.users.user.id;
        const user2 = ctx.users.user2.id;

        await makeTask(ctx, a.id, 'manager', { title: 'A1', status: 'Done', assigneeId: user, priority: 'High' });
        await makeTask(ctx, a.id, 'manager', { title: 'A2', status: 'In progress', assigneeId: user, priority: 'High', dueDate: isoDate(-1) });
        await makeTask(ctx, a.id, 'manager', { title: 'A3', status: 'To do', assigneeId: user2, priority: 'Low', dueDate: isoDate(4) });
        await makeTask(ctx, a.id, 'manager', { title: 'A4', status: 'To do', priority: 'Urgent' });
        await makeTask(ctx, b.id, 'manager', { title: 'B1', status: 'Done', assigneeId: user2 });
        await makeTask(ctx, b.id, 'manager', { title: 'B2', status: 'To do', assigneeId: user2, dueDate: isoDate(-5) });
    });
    after(teardown);

    it('requires authentication', async () => {
        assert.equal((await ctx.anon().get('/api/stats/dashboard')).status, 401);
    });

    it('returns consistent KPIs, charts data and per-user figures', async () => {
        const res = await ctx.as('user').get('/api/stats/dashboard');
        assert.equal(res.status, 200);
        const d = res.body.data;

        assert.equal(d.kpis.totalProjects, 2);
        assert.equal(d.kpis.activeProjects, 1);
        assert.equal(d.kpis.totalTasks, 6);
        assert.equal(d.kpis.doneTasks, 2);
        assert.equal(d.kpis.openTasks, 4);
        assert.equal(d.kpis.overdueTasks, 2);
        assert.equal(d.kpis.completedThisWeek, 2);
        assert.equal(d.kpis.myOpenTasks, 1, 'only A2 is open and assigned to the signed-in user');
        assert.equal(d.kpis.myOverdueTasks, 1);

        assert.deepEqual(d.tasksByStatus, { 'To do': 3, 'In progress': 1, Done: 2 });
        assert.deepEqual(d.openTasksByPriority, { Urgent: 1, High: 1, Medium: 1, Low: 1 });
    });

    it('computes per-project progress and workload per user', async () => {
        const d = (await ctx.as('admin').get('/api/stats/dashboard')).body.data;
        const byName = Object.fromEntries(d.projectProgress.map(p => [p.name, p]));
        assert.equal(byName['Stats A'].progress, 25);
        assert.equal(byName['Stats A'].overdueCount, 1);
        assert.equal(byName['Stats B'].progress, 50);

        const load = Object.fromEntries(d.workload.map(w => [w.name, w]));
        assert.deepEqual(load['Test User'], { userId: ctx.users.user.id, name: 'Test User', open: 1, done: 1, overdue: 1 });
        assert.equal(load['Other User'].open, 2);
        assert.equal(load['Other User'].done, 1);
        assert.equal(load['Other User'].overdue, 1);
    });

    it('returns 14 daily buckets with created and completed counts', async () => {
        const d = (await ctx.as('admin').get('/api/stats/dashboard')).body.data;
        assert.equal(d.activityOverTime.length, 14);
        const last = d.activityOverTime[13];
        assert.equal(last.date, isoDate(0));
        assert.equal(last.created, 6);
        assert.equal(last.completed, 2);
        assert.equal(d.activityOverTime.reduce((sum, day) => sum + day.created, 0), 6);
    });

    it('includes recent activity and the personal task list', async () => {
        const d = (await ctx.as('user').get('/api/stats/dashboard')).body.data;
        assert.ok(d.recentActivity.length > 0);
        assert.ok(d.recentActivity.length <= 8);
        assert.deepEqual(d.myTasks.map(t => t.title), ['A2']);
    });
});
