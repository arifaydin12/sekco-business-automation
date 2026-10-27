'use strict';

const express = require('express');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/http');
const { AppError } = require('../utils/errors');
const schemas = require('../schemas');
const auth = require('../services/auth');
const users = require('../services/users');

/** Public login plus the signed-in user's own account endpoints. */
function authRouter(config, authenticate) {
    const router = express.Router();

    router.post(
        '/login',
        loginLimiter(config.loginRateLimit),
        validate({ body: schemas.login }),
        asyncHandler(async (req, res) => {
            const { email, password } = req.valid.body;
            res.json({ data: await auth.login(config, email, password) });
        })
    );

    // Accounts are created by administrators only (POST /api/users).
    router.post('/register', (req, res, next) =>
        next(new AppError(403, 'REGISTRATION_DISABLED', 'Self-registration is disabled. Ask an administrator to create your account.'))
    );

    router.get(
        '/me',
        authenticate,
        asyncHandler(async (req, res) => {
            res.json({ data: await users.get(req.user.id) });
        })
    );

    router.patch(
        '/me',
        authenticate,
        validate({ body: schemas.updateProfile }),
        asyncHandler(async (req, res) => {
            res.json({ data: await users.updateProfile(req.user.id, req.valid.body) });
        })
    );

    router.post(
        '/change-password',
        authenticate,
        validate({ body: schemas.changePassword }),
        asyncHandler(async (req, res) => {
            const { currentPassword, newPassword } = req.valid.body;
            await users.changeOwnPassword(req.user.id, currentPassword, newPassword);
            res.json({ data: { message: 'Password updated' } });
        })
    );

    return router;
}

module.exports = authRouter;
