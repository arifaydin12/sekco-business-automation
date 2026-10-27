'use strict';

const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../utils/errors');

function build({ max, windowMs, skipSuccessfulRequests = false, message }) {
    return rateLimit({
        windowMs,
        limit: max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests,
        handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', message))
    });
}

/** Strict limiter for login attempts: only failed attempts count towards the limit. */
const loginLimiter = (cfg) =>
    build({
        ...cfg,
        skipSuccessfulRequests: true,
        message: 'Too many failed login attempts. Please try again later.'
    });

/** Generic limiter for the whole API. */
const apiLimiter = (cfg) => build({ ...cfg, message: 'Too many requests. Please slow down.' });

module.exports = { loginLimiter, apiLimiter };
