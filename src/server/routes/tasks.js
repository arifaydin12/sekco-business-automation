'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/http');
const schemas = require('../schemas');
const tasks = require('../services/tasks');
const comments = require('../services/comments');

function tasksRouter() {
    const router = express.Router();

    router.get(
        '/',
        validate({ query: schemas.listTasks }),
        asyncHandler(async (req, res) => {
            const { items, meta } = await tasks.list(req.valid.query, req.user);
            res.json({ data: items, meta });
        })
    );

    router.post(
        '/',
        validate({ body: schemas.createTask }),
        asyncHandler(async (req, res) => {
            res.status(201).json({ data: await tasks.create(req.valid.body, req.user) });
        })
    );

    router.get(
        '/:id',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            res.json({ data: await tasks.get(req.valid.params.id, req.user, { withComments: true }) });
        })
    );

    router.patch(
        '/:id',
        validate({ params: schemas.idParam, body: schemas.updateTask }),
        asyncHandler(async (req, res) => {
            res.json({ data: await tasks.update(req.valid.params.id, req.valid.body, req.user) });
        })
    );

    router.delete(
        '/:id',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            await tasks.remove(req.valid.params.id, req.user);
            res.status(204).end();
        })
    );

    router.get(
        '/:id/comments',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            await tasks.getRow(req.valid.params.id);
            res.json({ data: await comments.listForTask(req.valid.params.id) });
        })
    );

    router.post(
        '/:id/comments',
        validate({ params: schemas.idParam, body: schemas.createComment }),
        asyncHandler(async (req, res) => {
            const comment = await comments.add(req.valid.params.id, req.valid.body.body, req.user);
            res.status(201).json({ data: comment });
        })
    );

    return router;
}

module.exports = tasksRouter;
