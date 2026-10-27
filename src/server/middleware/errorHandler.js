'use strict';

const { ZodError } = require('zod');
const { AppError, notFound } = require('../utils/errors');

/** Responds to unknown /api routes with a JSON 404. */
function apiNotFound(req, res, next) {
    next(notFound('Endpoint'));
}

function send(res, status, code, message, details) {
    const error = { code, message };
    if (details) error.details = details;
    res.status(status).json({ error });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
        return send(res, err.status, err.code, err.message, err.details);
    }
    if (err instanceof ZodError) {
        const details = err.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message
        }));
        return send(res, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
    }
    if (err.type === 'entity.parse.failed') {
        return send(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    }
    if (err.type === 'entity.too.large') {
        return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    if (err.code === 'ER_DUP_ENTRY') {
        return send(res, 409, 'CONFLICT', 'A record with the same unique value already exists');
    }

    if (process.env.NODE_ENV !== 'test') console.error('[error]', err);
    return send(res, 500, 'INTERNAL_ERROR', 'Something went wrong on the server');
}

module.exports = { errorHandler, apiNotFound };
