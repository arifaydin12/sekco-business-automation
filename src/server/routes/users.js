'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const schemas = require('../schemas');
const users = require('../services/users');

/** User directory for everyone; account administration for admins only. */
function usersRouter() {
    const router = express.Router();
    const adminOnly = requireRole('Admin');

    router.get(
        '/',
        validate({ query: schemas.listUsers }),
        asyncHandler(async (req, res) => {
            const { items, meta } = await users.list(req.valid.query);
            res.json({ data: items, meta });
        })
    );

    router.get(
        '/directory',
        asyncHandler(async (req, res) => {
            res.json({ data: await users.directory() });
        })
    );

    router.post(
        '/',
        adminOnly,
        validate({ body: schemas.createUser }),
        asyncHandler(async (req, res) => {
            res.status(201).json({ data: await users.create(req.valid.body, req.user) });
        })
    );

    router.get(
        '/:id',
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            res.json({ data: await users.get(req.valid.params.id) });
        })
    );

    router.patch(
        '/:id',
        adminOnly,
        validate({ params: schemas.idParam, body: schemas.updateUser }),
        asyncHandler(async (req, res) => {
            res.json({ data: await users.update(req.valid.params.id, req.valid.body, req.user) });
        })
    );

    router.post(
        '/:id/deactivate',
        adminOnly,
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            res.json({ data: await users.update(req.valid.params.id, { status: 'Inactive' }, req.user) });
        })
    );

    router.post(
        '/:id/activate',
        adminOnly,
        validate({ params: schemas.idParam }),
        asyncHandler(async (req, res) => {
            res.json({ data: await users.update(req.valid.params.id, { status: 'Active' }, req.user) });
        })
    );

    router.post(
        '/:id/reset-password',
        adminOnly,
        validate({ params: schemas.idParam, body: schemas.resetPassword }),
        asyncHandler(async (req, res) => {
            const result = await users.resetPassword(req.valid.params.id, req.valid.body.password, req.user);
            res.json({ data: result });
        })
    );

    return router;
}

module.exports = usersRouter;
