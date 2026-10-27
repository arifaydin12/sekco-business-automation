'use strict';

const express = require('express');
const db = require('../db');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const schemas = require('../schemas');
const comments = require('../services/comments');
const activity = require('../services/activity');
const stats = require('../services/stats');
const authRouter = require('./auth');
const usersRouter = require('./users');
const projectsRouter = require('./projects');
const tasksRouter = require('./tasks');
const pkg = require('../../../package.json');

/** Builds the /api router. Everything except health and login requires a valid token. */
function buildApiRouter(config) {
    const router = express.Router();
    const requireAuth = authenticate(config);

    router.get(
        '/health',
        asyncHandler(async (req, res) => {
            try {
                await db.query('SELECT 1');
                res.json({ status: 'ok', database: 'up', uptime: Math.round(process.uptime()), version: pkg.version });
            } catch {
                res.status(503).json({ status: 'degraded', database: 'down', uptime: Math.round(process.uptime()), version: pkg.version });
            }
        })
    );

    router.use('/auth', authRouter(config, requireAuth));

    router.use(requireAuth);
    router.use('/users', usersRouter());
    router.use('/projects', projectsRouter());
    router.use('/tasks', tasksRouter());

    router.delete(
        '/comments/:id',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            await comments.remove(req.valid.params.id, req.user);
            res.status(204).end();
        })
    );

    router.get(
        '/activity',
        validate({ query: schemas.listActivity }),
        asyncHandler(async (req, res) => {
            const { items, meta } = await activity.list(req.valid.query);
            res.json({ data: items, meta });
        })
    );

    router.get(
        '/stats/dashboard',
        asyncHandler(async (req, res) => {
            res.json({ data: await stats.dashboard(req.user) });
        })
    );

    return router;
}

module.exports = buildApiRouter;
