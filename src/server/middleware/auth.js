'use strict';

const jwt = require('jsonwebtoken');
const db = require('../db');
const { unauthorized, forbidden } = require('../utils/errors');

/**
 * Verifies the Bearer token and loads the current user from the database, so role changes
 * and deactivation take effect immediately instead of when the token expires.
 */
function authenticate(config) {
    return async (req, res, next) => {
        try {
            const header = req.headers.authorization || '';
            const [scheme, token] = header.split(' ');
            if (scheme !== 'Bearer' || !token) throw unauthorized();

            let payload;
            try {
                payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
            } catch {
                throw unauthorized('Invalid or expired token');
            }

            const user = await db.one(
                'SELECT id, name, email, role, status FROM users WHERE id = ?',
                [payload.sub]
            );
            if (!user) throw unauthorized('Invalid or expired token');
            if (user.status !== 'Active') throw forbidden('This account is deactivated');

            req.user = user;
            next();
        } catch (err) {
            next(err);
        }
    };
}

/** Allows only the listed roles. */
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return next(forbidden('Your role does not allow this action'));
    }
    next();
};

module.exports = { authenticate, requireRole };
