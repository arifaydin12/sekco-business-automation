'use strict';

/** An error that is safe to show to API clients. */
class AppError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message);
const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
const conflict = (message) => new AppError(409, 'CONFLICT', message);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
