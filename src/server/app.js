'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { loadConfig } = require('./config');
const db = require('./db');
const users = require('./services/users');
const buildApiRouter = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const { errorHandler, apiNotFound } = require('./middleware/errorHandler');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

/**
 * Builds the Express application. Configuration can be overridden (used by the tests).
 * The database pool is created here; call db.close() to release it.
 */
function createApp(overrides = {}) {
    const config = { ...loadConfig(), ...overrides };
    if (!config.jwtSecret) {
        throw new Error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
    }

    db.init(config.db);
    users.setBcryptRounds(config.bcryptRounds);

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    app.locals.config = config;

    app.use(
        helmet({
            contentSecurityPolicy: {
                useDefaults: false,
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    formAction: ["'self'"],
                    frameAncestors: ["'none'"]
                }
            }
        })
    );

    if (config.corsOrigins.length) {
        app.use('/api', cors({ origin: config.corsOrigins }));
    }

    if (config.env !== 'test') {
        app.use((req, res, next) => {
            const started = process.hrtime.bigint();
            res.on('finish', () => {
                if (!req.path.startsWith('/api')) return;
                const ms = Number(process.hrtime.bigint() - started) / 1e6;
                console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`);
            });
            next();
        });
    }

    app.use('/api', express.json({ limit: '100kb' }));
    app.use('/api', apiLimiter(config.apiRateLimit));
    app.use('/api', buildApiRouter(config));
    app.use('/api', apiNotFound);

    // Only the public/ folder is served - never the project root, which holds server code and .env
    app.use(express.static(PUBLIC_DIR));

    app.use(errorHandler);
    return app;
}

module.exports = { createApp };
