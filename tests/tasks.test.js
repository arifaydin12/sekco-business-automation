'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, makeProject, makeTask, isoDate } = require('./helpers');

describe('tasks', () => {
    let ctx;
    let project;
    let otherProject;
    before(async () => {
        ctx = await setup();
        project = await makeProject(ctx, 'manager', { name: 'Task project' });
        otherProject = await makeProject(ctx, 'manager2', { name: 'Other managers project' });
    });
    after(teardown);

    describe('creating', () => {
        it('lets the project manager create a task with defaults', async () => {
            const res = await ctx.as('manager').post('/api/tasks', { title: 'Write specification', projectId: project.id });
            assert.equal(res.status, 201);
            const t = res.body.data;
            assert.equal(t.title, 'Write specification');
            assert.equal(t.status, 'To do');
            assert.equal(t.priority, 'Medium');
            assert.equal(t.assigneeId, null);
            assert.equal(t.completedAt, null);
            assert.equal(t.projectName, 'Task project');
            assert.equal(t.createdBy, ctx.users.manager.id);
            assert.deepEqual(t.comments, []);
        });

        it('stores all fields and sets completed_at when created as Done', async () => {
            const res = await ctx.as('admin').post('/api/tasks', {
                title: 'Everything set',
                description: 'Detailed text',
                projectId: project.id,
                assigneeId: ctx.users.user.id,
                priority: 'Urgent',
                status: 'Done',
                dueDate: isoDate(3)
            });
            assert.equal(res.status, 201);
            const t = res.body.data;
            assert.equal(t.assigneeName, 'Test User');
            assert.equal(t.priority, 'Urgent');
            assert.equal(t.dueDate, isoDate(3));
            assert.ok(t.completedAt);
            assert.equal(t.overdue, false);
        });

        it('forbids users and managers of other projects', async () => {
            const user = await ctx.as('user').post('/api/tasks', { title: 'Not allowed', projectId: project.id });
            assert.equal(user.status, 403);
            const other = await ctx.as('manager2').post('/api/tasks', { title: 'Not allowed', projectId: project.id });
            assert.equal(other.status, 403);
        });

        it('validates input', async () => {
            const res = await ctx.as('manager').post('/api/tasks', { title: 'a', projectId: 'abc', priority: 'Whenever', dueDate: 'tomorrow' });
            assert.equal(res.status, 400);
            const paths = res.body.error.details.map(d => d.path);
            for (const f of ['title', 'projectId', 'priority', 'dueDate']) assert.ok(paths.includes(f), f);
        });

        it('rejects unknown projects, unknown assignees and deactivated assignees', async () => {
            assert.equal((await ctx.as('admin').post('/api/tasks', { title: 'Ghost project', projectId: 999999 })).status, 400);
            assert.equal((await ctx.as('manager').post('/api/tasks', { title: 'Ghost user', projectId: project.id, assigneeId: 999999 })).status, 400);
            await ctx.createUser('retired', { status: 'Inactive' });
            assert.equal((await ctx.as('manager').post('/api/tasks', { title: 'Retired user', projectId: project.id, assigneeId: ctx.users.retired.id })).status, 400);
        });
    });

    describe('status changes', () => {
        it('sets completed_at when a task is done and clears it when reopened', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Lifecycle task' });
            const progress = await ctx.as('manager').patch(`/api/tasks/${t.id}`, { status: 'In progress' });
            assert.equal(progress.body.data.status, 'In progress');
            assert.equal(progress.body.data.completedAt, null);

            const done = await ctx.as('manager').patch(`/api/tasks/${t.id}`, { status: 'Done' });
            assert.ok(done.body.data.completedAt);
            const finishedAt = done.body.data.completedAt;

            const same = await ctx.as('manager').patch(`/api/tasks/${t.id}`, { title: 'Lifecycle task (renamed)' });
            assert.equal(same.body.data.completedAt, finishedAt, 'unrelated edits keep completed_at');

            const reopened = await ctx.as('manager').patch(`/api/tasks/${t.id}`, { status: 'To do' });
            assert.equal(reopened.body.data.completedAt, null);
        });

        it('lets an assignee move only the status of their own task', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Assigned to user', assigneeId: ctx.users.user.id });
            assert.deepEqual(t.permissions, { edit: true, status: true, delete: true });

            const own = await ctx.as('user').get(`/api/tasks/${t.id}`);
            assert.deepEqual(own.body.data.permissions, { edit: false, status: true, delete: false });

            const move = await ctx.as('user').patch(`/api/tasks/${t.id}`, { status: 'In progress' });
            assert.equal(move.status, 200);
            assert.equal(move.body.data.status, 'In progress');

            const edit = await ctx.as('user').patch(`/api/tasks/${t.id}`, { title: 'My own title', status: 'Done' });
            assert.equal(edit.status, 403);
            const reassign = await ctx.as('user').patch(`/api/tasks/${t.id}`, { assigneeId: ctx.users.user2.id });
            assert.equal(reassign.status, 403);
            const del = await ctx.as('user').delete(`/api/tasks/${t.id}`);
            assert.equal(del.status, 403);
        });

        it('stops users from touching tasks assigned to someone else', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Not yours', assigneeId: ctx.users.user2.id });
            const res = await ctx.as('user').patch(`/api/tasks/${t.id}`, { status: 'Done' });
            assert.equal(res.status, 403);
        });
    });

    describe('editing and deleting', () => {
        it('lets the project manager and admins edit everything', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Editable' });
            const res = await ctx.as('manager').patch(`/api/tasks/${t.id}`, {
                title: 'Edited title',
                description: 'Now with details',
                priority: 'High',
                assigneeId: ctx.users.user.id,
                dueDate: isoDate(7)
            });
            assert.equal(res.status, 200);
            assert.equal(res.body.data.title, 'Edited title');
            assert.equal(res.body.data.priority, 'High');
            assert.equal(res.body.data.assigneeName, 'Test User');
            assert.equal(res.body.data.dueDate, isoDate(7));

            const cleared = await ctx.as('admin').patch(`/api/tasks/${t.id}`, { assigneeId: null, dueDate: null, description: '' });
            assert.equal(cleared.body.data.assigneeId, null);
            assert.equal(cleared.body.data.dueDate, null);
            assert.equal(cleared.body.data.description, null);
        });

        it('forbids managers of other projects, and validates', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Protected' });
            assert.equal((await ctx.as('manager2').patch(`/api/tasks/${t.id}`, { title: 'Mine now' })).status, 403);
            assert.equal((await ctx.as('manager').patch(`/api/tasks/${t.id}`, {})).status, 400);
            assert.equal((await ctx.as('manager').patch(`/api/tasks/${t.id}`, { status: 'Blocked' })).status, 400);
            assert.equal((await ctx.as('manager').patch('/api/tasks/999999', { title: 'Nothing here' })).status, 404);
        });

        it('only lets managers move tasks into projects they manage', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Movable' });
            assert.equal((await ctx.as('manager').patch(`/api/tasks/${t.id}`, { projectId: otherProject.id })).status, 403);
            const mine = await makeProject(ctx, 'manager', { name: 'Second project of mine' });
            const moved = await ctx.as('manager').patch(`/api/tasks/${t.id}`, { projectId: mine.id });
            assert.equal(moved.status, 200);
            assert.equal(moved.body.data.projectId, mine.id);
        });

        it('deletes tasks (permitted roles only)', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Disposable' });
            assert.equal((await ctx.as('manager2').delete(`/api/tasks/${t.id}`)).status, 403);
            assert.equal((await ctx.as('manager').delete(`/api/tasks/${t.id}`)).status, 204);
            assert.equal((await ctx.as('manager').get(`/api/tasks/${t.id}`)).status, 404);
        });
    });

    describe('listing', () => {
        let p;
        before(async () => {
            p = await makeProject(ctx, 'admin', { name: 'Listing project', managerId: ctx.users.manager.id });
            await makeTask(ctx, p.id, 'admin', { title: 'Alpha overdue', dueDate: isoDate(-3), assigneeId: ctx.users.user.id, priority: 'High' });
            await makeTask(ctx, p.id, 'admin', { title: 'Beta later', dueDate: isoDate(10), assigneeId: ctx.users.user2.id, priority: 'Low' });
            await makeTask(ctx, p.id, 'admin', { title: 'Gamma done late', dueDate: isoDate(-8), status: 'Done', assigneeId: ctx.users.user.id });
            await makeTask(ctx, p.id, 'admin', { title: 'Delta unassigned', priority: 'Urgent', status: 'In progress' });
        });

        const list = async (query, as = 'user') => (await ctx.as(as).get(`/api/tasks?projectId=${p.id}&${query}`)).body;

        it('paginates', async () => {
            const body = await list('pageSize=3&page=2');
            assert.equal(body.data.length, 1);
            assert.deepEqual(body.meta, { page: 2, pageSize: 3, total: 4, totalPages: 2 });
        });

        it('filters by status, priority, assignee, mine and unassigned', async () => {
            assert.deepEqual((await list('status=Done')).data.map(t => t.title), ['Gamma done late']);
            assert.deepEqual((await list('priority=Urgent')).data.map(t => t.title), ['Delta unassigned']);
            assert.equal((await list(`assigneeId=${ctx.users.user2.id}`)).meta.total, 1);
            assert.equal((await list('mine=true', 'user')).meta.total, 2);
            assert.equal((await list('mine=true', 'user2')).meta.total, 1);
            assert.deepEqual((await list('unassigned=true')).data.map(t => t.title), ['Delta unassigned']);
        });

        it('treats only open tasks past their due date as overdue', async () => {
            const overdue = await list('overdue=true');
            assert.deepEqual(overdue.data.map(t => t.title), ['Alpha overdue']);
            assert.equal(overdue.data[0].overdue, true);
            const notOverdue = await list('overdue=false');
            assert.equal(notOverdue.meta.total, 3);
            const all = await list('pageSize=100');
            assert.equal(all.data.find(t => t.title === 'Gamma done late').overdue, false);
            assert.equal((await list('open=true')).meta.total, 3);
        });

        it('searches titles and sorts by due date or priority', async () => {
            assert.deepEqual((await list('q=beta')).data.map(t => t.title), ['Beta later']);
            const byDue = (await list('sort=due')).data.map(t => t.title);
            assert.deepEqual(byDue, ['Gamma done late', 'Alpha overdue', 'Beta later', 'Delta unassigned']);
            const byPriority = (await list('sort=priority')).data.map(t => t.priority);
            assert.deepEqual(byPriority, ['Urgent', 'High', 'Medium', 'Low']);
        });

        it('rejects invalid filter values', async () => {
            assert.equal((await ctx.as('user').get('/api/tasks?status=Blocked')).status, 400);
            assert.equal((await ctx.as('user').get('/api/tasks?page=0')).status, 400);
        });
    });

    describe('comments', () => {
        let task;
        before(async () => {
            task = await makeTask(ctx, project.id, 'manager', { title: 'Discussed task' });
        });

        it('lets any signed-in user comment and lists comments oldest first', async () => {
            const a = await ctx.as('user').post(`/api/tasks/${task.id}/comments`, { body: 'First comment' });
            assert.equal(a.status, 201);
            assert.equal(a.body.data.userName, 'Test User');
            await ctx.as('manager').post(`/api/tasks/${task.id}/comments`, { body: 'Second comment' });

            const list = await ctx.as('user2').get(`/api/tasks/${task.id}/comments`);
            assert.deepEqual(list.body.data.map(c => c.body), ['First comment', 'Second comment']);

            const detail = await ctx.as('user2').get(`/api/tasks/${task.id}`);
            assert.equal(detail.body.data.comments.length, 2);
            assert.equal(detail.body.data.commentCount, 2);
        });

        it('validates comment bodies and task existence', async () => {
            assert.equal((await ctx.as('user').post(`/api/tasks/${task.id}/comments`, { body: '   ' })).status, 400);
            assert.equal((await ctx.as('user').post(`/api/tasks/${task.id}/comments`, { body: 'x'.repeat(2001) })).status, 400);
            assert.equal((await ctx.as('user').post('/api/tasks/999999/comments', { body: 'Hello' })).status, 404);
        });

        it('lets authors and admins delete comments, nobody else', async () => {
            const own = await ctx.as('user').post(`/api/tasks/${task.id}/comments`, { body: 'Mine to delete' });
            assert.equal((await ctx.as('user2').delete(`/api/comments/${own.body.data.id}`)).status, 403);
            assert.equal((await ctx.as('manager').delete(`/api/comments/${own.body.data.id}`)).status, 403);
            assert.equal((await ctx.as('user').delete(`/api/comments/${own.body.data.id}`)).status, 204);

            const other = await ctx.as('user').post(`/api/tasks/${task.id}/comments`, { body: 'Admin will remove' });
            assert.equal((await ctx.as('admin').delete(`/api/comments/${other.body.data.id}`)).status, 204);
            assert.equal((await ctx.as('admin').delete(`/api/comments/${other.body.data.id}`)).status, 404);
        });
    });

    describe('activity feed', () => {
        it('logs status changes, assignments and comments globally', async () => {
            const t = await makeTask(ctx, project.id, 'manager', { title: 'Feed subject' });
            await ctx.as('manager').patch(`/api/tasks/${t.id}`, { status: 'In progress' });
            await ctx.as('manager').patch(`/api/tasks/${t.id}`, { assigneeId: ctx.users.user.id });
            await ctx.as('user').post(`/api/tasks/${t.id}/comments`, { body: 'On it' });
            await ctx.as('user').patch(`/api/tasks/${t.id}`, { status: 'Done' });

            const res = await ctx.as('user2').get('/api/activity?pageSize=10');
            assert.equal(res.status, 200);
            const messages = res.body.data.map(a => a.message);
            assert.ok(messages.includes('completed task "Feed subject"'));
            assert.ok(messages.includes('commented on "Feed subject"'));
            assert.ok(messages.includes('assigned task "Feed subject" to Test User'));
            assert.ok(messages.includes('moved task "Feed subject" from To do to In progress'));
            assert.ok(res.body.meta.total >= 5);
        });
    });
});
