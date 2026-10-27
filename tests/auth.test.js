'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { setup, teardown, TEST_PASSWORD, request } = require('./helpers');
const { createApp } = require('../src/server/app');

describe('authentication', () => {
    let ctx;
    before(async () => {
        ctx = await setup();
    });
    after(teardown);

    it('logs in with valid credentials and returns a token and the user profile', async () => {
        const res = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.admin.email, password: TEST_PASSWORD });
        assert.equal(res.status, 200);
        assert.ok(res.body.data.token);
        assert.equal(res.body.data.user.role, 'Admin');
        assert.equal(res.body.data.user.email, ctx.users.admin.email);
        assert.equal(res.body.data.user.passwordHash, undefined);
        assert.equal(res.body.data.user.password_hash, undefined);
    });

    it('treats the email case-insensitively', async () => {
        const res = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.admin.email.toUpperCase(), password: TEST_PASSWORD });
        assert.equal(res.status, 200);
    });

    it('rejects a wrong password and an unknown email with the same message', async () => {
        const wrong = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.admin.email, password: 'nope-nope-1' });
        const unknown = await ctx.anon().post('/api/auth/login').send({ email: 'ghost@test.example', password: 'nope-nope-1' });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.error.message, unknown.body.error.message);
        assert.equal(wrong.body.error.code, 'UNAUTHORIZED');
    });

    it('validates the login payload', async () => {
        const res = await ctx.anon().post('/api/auth/login').send({});
        assert.equal(res.status, 400);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(res.body.error.details.some(d => d.path === 'email'));
    });

    it('refuses deactivated accounts', async () => {
        await ctx.createUser('sleepy', { status: 'Inactive' });
        const res = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.sleepy.email, password: TEST_PASSWORD });
        assert.equal(res.status, 403);
    });

    it('has self-registration disabled', async () => {
        const res = await ctx.anon().post('/api/auth/register').send({ name: 'Mallory', email: 'mallory@test.example', password: 'Secret123' });
        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, 'REGISTRATION_DISABLED');
    });

    it('requires a token for protected routes', async () => {
        const res = await ctx.anon().get('/api/projects');
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    it('rejects malformed, forged and expired tokens', async () => {
        const bad = await ctx.anon().get('/api/auth/me').set('Authorization', 'Bearer not-a-token');
        assert.equal(bad.status, 401);

        const forged = jwt.sign({ sub: ctx.users.admin.id }, 'another-secret');
        const forgedRes = await ctx.anon().get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
        assert.equal(forgedRes.status, 401);

        const expired = jwt.sign({ sub: ctx.users.admin.id }, ctx.config.jwtSecret, { expiresIn: -10 });
        const expiredRes = await ctx.anon().get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
        assert.equal(expiredRes.status, 401);
    });

    it('returns the current user for GET /api/auth/me', async () => {
        const res = await ctx.as('manager').get('/api/auth/me');
        assert.equal(res.status, 200);
        assert.equal(res.body.data.id, ctx.users.manager.id);
        assert.equal(res.body.data.role, 'Manager');
    });

    it('lets users update their own profile', async () => {
        const res = await ctx.as('user').patch('/api/auth/me', { name: 'Renamed User', jobTitle: 'Analyst' });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.name, 'Renamed User');
        assert.equal(res.body.data.jobTitle, 'Analyst');
        const empty = await ctx.as('user').patch('/api/auth/me', {});
        assert.equal(empty.status, 400);
    });

    it('stops honouring tokens of deactivated users immediately', async () => {
        await ctx.createUser('temp');
        const token = await ctx.login('temp');
        const ok = await ctx.as('temp').get('/api/projects');
        assert.equal(ok.status, 200);
        const off = await ctx.as('admin').post(`/api/users/${ctx.users.temp.id}/deactivate`);
        assert.equal(off.status, 200);
        const res = await ctx.anon().get('/api/projects').set('Authorization', `Bearer ${token}`);
        assert.equal(res.status, 403);
    });

    describe('change password', () => {
        it('requires the correct current password', async () => {
            const res = await ctx.as('user2').post('/api/auth/change-password', { currentPassword: 'wrong-pass-1', newPassword: 'Brand-new-2' });
            assert.equal(res.status, 400);
            assert.match(res.body.error.message, /current password/i);
        });

        it('enforces the password policy', async () => {
            const short = await ctx.as('user2').post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'a1' });
            assert.equal(short.status, 400);
            const noDigit = await ctx.as('user2').post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'onlyletters' });
            assert.equal(noDigit.status, 400);
            assert.equal(noDigit.body.error.code, 'VALIDATION_ERROR');
        });

        it('changes the password and the old one stops working', async () => {
            const res = await ctx.as('user2').post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'Brand-new-2' });
            assert.equal(res.status, 200);
            const oldLogin = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user2.email, password: TEST_PASSWORD });
            assert.equal(oldLogin.status, 401);
            const newLogin = await ctx.anon().post('/api/auth/login').send({ email: ctx.users.user2.email, password: 'Brand-new-2' });
            assert.equal(newLogin.status, 200);
        });
    });
});

describe('platform behaviour', () => {
    let ctx;
    before(async () => {
        ctx = await setup();
    });
    after(teardown);

    it('exposes a health endpoint without authentication', async () => {
        const res = await ctx.anon().get('/api/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.equal(res.body.database, 'up');
    });

    it('sets security headers (helmet)', async () => {
        const res = await ctx.anon().get('/api/health');
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
        assert.ok(res.headers['content-security-policy'].includes("default-src 'self'"));
        assert.equal(res.headers['x-powered-by'], undefined);
    });

    it('returns consistent JSON errors for unknown endpoints and invalid JSON', async () => {
        const notFound = await ctx.as('admin').get('/api/does-not-exist');
        assert.equal(notFound.status, 404);
        assert.equal(notFound.body.error.code, 'NOT_FOUND');

        const invalid = await request(ctx.app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"email": ');
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.error.code, 'INVALID_JSON');
    });

    it('does not serve the project root (source files, .env)', async () => {
        for (const url of ['/.env', '/package.json', '/src/server/app.js', '/database.sql']) {
            const res = await ctx.anon().get(url);
            assert.equal(res.status, 404, url);
        }
    });

    it('serves the front end', async () => {
        const res = await ctx.anon().get('/');
        assert.equal(res.status, 200);
        assert.match(res.text, /SEKCO/);
    });
});

describe('login rate limiting', () => {
    let ctx;
    before(async () => {
        ctx = await setup({ loginRateLimit: { max: 3, windowMs: 60000 } });
    });
    after(teardown);

    it('blocks an address after repeated failed logins with HTTP 429', async () => {
        const attempt = () => ctx.anon().post('/api/auth/login').send({ email: ctx.users.admin.email, password: 'wrong-pass-1' });
        for (let i = 0; i < 3; i++) assert.equal((await attempt()).status, 401);
        const blocked = await attempt();
        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    });

    it('refuses to start without a JWT secret', () => {
        assert.throws(() => createApp({ ...ctx.config, jwtSecret: '' }), /JWT_SECRET/);
    });
});
