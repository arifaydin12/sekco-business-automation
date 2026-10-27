'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const schemas = require('../schemas');
const projects = require('../services/projects');
const activity = require('../services/activity');

function projectsRouter() {
    const router = express.Router();
    const canCreate = requireRole('Admin', 'Manager');

    router.get(
        '/',
        validate({ query: schemas.listProjects }),
        asyncHandler(async (req, res) => {
            const { items, meta } = await projects.list(req.valid.query, req.user);
            res.json({ data: items, meta });
        })
    );

    router.post(
        '/',
        canCreate,
        validate({ body: schemas.createProject }),
        asyncHandler(async (req, res) => {
            res.status(201).json({ data: await projects.create(req.valid.body, req.user) });
        })
    );

    router.get(
        '/:id',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            res.json({ data: await projects.get(req.valid.params.id, req.user) });
        })
    );

    router.patch(
        '/:id',
        validate({ params: schemas.idParam, body: schemas.updateProject }),
        asyncHandler(async (req, res) => {
            res.json({ data: await projects.update(req.valid.params.id, req.valid.body, req.user) });
        })
    );

    router.delete(
        '/:id',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            await projects.remove(req.valid.params.id, req.user);
            res.status(204).end();
        })
    );

    router.get(
        '/:id/activity',
        validate({ params: schemas.idParam, query: schemas.listActivity }),
        asyncHandler(async (req, res) => {
            await projects.getRow(req.valid.params.id);
            const { items, meta } = await activity.list({ ...req.valid.query, projectId: req.valid.params.id });
            res.json({ data: items, meta });
        })
    );

    return router;
}

module.exports = projectsRouter;
