'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, TEST_PASSWORD } = require('./helpers');

describe('user administration', () => {
    let ctx;
    before(async () => {
        ctx = await setup();
    });
    after(teardown);

    const newUser = (over = {}) => ({
        name: 'Jamie Rivers',
        email: 'jamie@test.example',
        password: 'Welcome-123',
        role: 'User',
        ...over
    });

    describe('creating users', () => {
        it('lets an admin create a user who can then sign in', async () => {
            const res = await ctx.as('admin').post('/api/users', newUser({ jobTitle: 'Designer' }));
            assert.equal(res.status, 201);
            assert.equal(res.body.data.email, 'jamie@test.example');
            assert.equal(res.body.data.role, 'User');
            assert.equal(res.body.data.status, 'Active');
            assert.equal(res.body.data.jobTitle, 'Designer');
            assert.equal(res.body.data.password, undefined);

            const login = await ctx.anon().post('/api/auth/login').send({ email: 'jamie@test.example', password: 'Welcome-123' });
            assert.equal(login.status, 200);
        });

        it('forbids managers and regular users from creating users', async () => {
            for (const who of ['manager', 'user']) {
                const res = await ctx.as(who).post('/api/users', newUser({ email: `${who}-made@test.example` }));
                assert.equal(res.status, 403, who);
                assert.equal(res.body.error.code, 'FORBIDDEN');
            }
        });

        it('rejects duplicate emails (case-insensitive) with 409', async () => {
            const res = await ctx.as('admin').post('/api/users', newUser({ email: 'JAMIE@test.example' }));
            assert.equal(res.status, 409);
            assert.equal(res.body.error.code, 'CONFLICT');
        });

        it('validates name, email, password and role', async () => {
            const res = await ctx.as('admin').post('/api/users', { name: 'x', email: 'not-an-email', password: 'short', role: 'Superuser' });
            assert.equal(res.status, 400);
            const paths = res.body.error.details.map(d => d.path);
            for (const field of ['name', 'email', 'password', 'role']) assert.ok(paths.includes(field), field);
        });

        it('defaults the role to User', async () => {
            const res = await ctx.as('admin').post('/api/users', { name: 'No Role', email: 'norole@test.example', password: 'Welcome-123' });
            assert.equal(res.status, 201);
            assert.equal(res.body.data.role, 'User');
        });
    });

    describe('listing users', () => {
        before(async () => {
            for (let i = 0; i < 6; i++) {
                await ctx.as('admin').post('/api/users', newUser({ name: `Bulk Person ${i}`, email: `bulk${i}@test.example`, role: i % 2 ? 'Manager' : 'User' }));
            }
        });

        it('paginates and reports metadata', async () => {
            const page1 = await ctx.as('user').get('/api/users?page=1&pageSize=5');
            assert.equal(page1.status, 200);
            assert.equal(page1.body.data.length, 5);
            assert.equal(page1.body.meta.page, 1);
            assert.equal(page1.body.meta.pageSize, 5);
            assert.ok(page1.body.meta.total >= 12);
            assert.equal(page1.body.meta.totalPages, Math.ceil(page1.body.meta.total / 5));

            const page2 = await ctx.as('user').get('/api/users?page=2&pageSize=5');
            const ids1 = page1.body.data.map(u => u.id);
            assert.ok(page2.body.data.every(u => !ids1.includes(u.id)));
        });

        it('filters by search text, role and status', async () => {
            const search = await ctx.as('admin').get('/api/users?q=Bulk%20Person');
            assert.equal(search.body.meta.total, 6);

            const managers = await ctx.as('admin').get('/api/users?q=Bulk&role=Manager');
            assert.equal(managers.body.meta.total, 3);
            assert.ok(managers.body.data.every(u => u.role === 'Manager'));

            const inactive = await ctx.as('admin').get('/api/users?status=Inactive');
            assert.equal(inactive.body.meta.total, 0);
        });

        it('rejects invalid paging values', async () => {
            const res = await ctx.as('admin').get('/api/users?pageSize=1000');
            assert.equal(res.status, 400);
        });

        it('provides a compact directory of active users for pickers', async () => {
            const res = await ctx.as('user').get('/api/users/directory');
            assert.equal(res.status, 200);
            assert.ok(res.body.data.length >= 12);
            assert.deepEqual(Object.keys(res.body.data[0]).sort(), ['id', 'jobTitle', 'name', 'role']);
        });

        it('never leaks password hashes', async () => {
            const res = await ctx.as('admin').get('/api/users?pageSize=100');
            assert.ok(!JSON.stringify(res.body).includes('$2'));
        });
    });

    describe('updating users', () => {
        it('lets an admin edit name, email, role and job title', async () => {
            const created = await ctx.as('admin').post('/api/users', newUser({ name: 'Edit Me', email: 'editme@test.example' }));
            const id = created.body.data.id;
            const res = await ctx.as('admin').patch(`/api/users/${id}`, { name: 'Edited', role: 'Manager', jobTitle: 'Lead', email: 'edited@test.example' });
            assert.equal(res.status, 200);
            assert.equal(res.body.data.name, 'Edited');
            assert.equal(res.body.data.role, 'Manager');
            assert.equal(res.body.data.email, 'edited@test.example');
            const one = await ctx.as('user').get(`/api/users/${id}`);
            assert.equal(one.body.data.name, 'Edited');
        });

        it('forbids non-admins and rejects empty or duplicate updates', async () => {
            const forbidden = await ctx.as('manager').patch(`/api/users/${ctx.users.user.id}`, { name: 'Hacked' });
            assert.equal(forbidden.status, 403);
            const empty = await ctx.as('admin').patch(`/api/users/${ctx.users.user.id}`, {});
            assert.equal(empty.status, 400);
            const dup = await ctx.as('admin').patch(`/api/users/${ctx.users.user.id}`, { email: ctx.users.admin.email });
            assert.equal(dup.status, 409);
        });

        it('returns 404 for unknown users and 400 for invalid ids', async () => {
            assert.equal((await ctx.as('admin').patch('/api/users/999999', { name: 'Nobody' })).status, 404);
            assert.equal((await ctx.as('admin').get('/api/users/abc')).status, 400);
        });

        it('stops admins from demoting or deactivating themselves', async () => {
            const demote = await ctx.as('admin').patch(`/api/users/${ctx.users.admin.id}`, { role: 'User' });
            assert.equal(demote.status, 403);
            const deactivate = await ctx.as('admin').post(`/api/users/${ctx.users.admin.id}/deactivate`);
            assert.equal(deactivate.status, 403);
        });

        it('deactivates and reactivates accounts', async () => {
            const off = await ctx.as('admin').post(`/api/users/${ctx.users.user2.id}/deactivate`);
            assert.equal(off.status, 200);
            assert.equal(off.body.data.status, 'Inactive');
            const blocked = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user2.email, password: TEST_PASSWORD });
            assert.equal(blocked.status, 403);

            const directory = await ctx.as('user').get('/api/users/directory');
            assert.ok(!directory.body.data.some(u => u.id === ctx.users.user2.id));

            const on = await ctx.as('admin').post(`/api/users/${ctx.users.user2.id}/activate`);
            assert.equal(on.body.data.status, 'Active');
            const ok = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user2.email, password: TEST_PASSWORD });
            assert.equal(ok.status, 200);
        });
    });

    describe('resetting passwords', () => {
        it('generates a temporary password that works', async () => {
            const res = await ctx.as('admin').post(`/api/users/${ctx.users.user.id}/reset-password`, {});
            assert.equal(res.status, 200);
            const temp = res.body.data.temporaryPassword;
            assert.ok(temp && temp.length >= 12);
            const oldLogin = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user.email, password: TEST_PASSWORD });
            assert.equal(oldLogin.status, 401);
            const login = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user.email, password: temp });
            assert.equal(login.status, 200);
        });

        it('accepts an explicit password that follows the policy', async () => {
            const weak = await ctx.as('admin').post(`/api/users/${ctx.users.user.id}/reset-password`, { password: 'weak' });
            assert.equal(weak.status, 400);
            const res = await ctx.as('admin').post(`/api/users/${ctx.users.user.id}/reset-password`, { password: 'Chosen-pass-9' });
            assert.equal(res.status, 200);
            assert.equal(res.body.data.temporaryPassword, undefined);
            const login = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user.email, password: 'Chosen-pass-9' });
            assert.equal(login.status, 200);
        });

        it('is admin-only', async () => {
            const res = await ctx.as('manager').post(`/api/users/${ctx.users.user.id}/reset-password`, {});
            assert.equal(res.status, 403);
        });
    });
});
