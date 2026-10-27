'use strict';

require('dotenv').config({ quiet: true });

function toInt(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds the runtime configuration from environment variables.
 * Kept as a function so tests can build isolated configurations.
 */
function loadConfig(env = process.env) {
    return {
        env: env.NODE_ENV || 'development',
        port: toInt(env.PORT, 3000),
        jwtSecret: env.JWT_SECRET || '',
        jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
        trustProxy: toInt(env.TRUST_PROXY, 0),
        corsOrigins: (env.CORS_ORIGIN || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        bcryptRounds: toInt(env.BCRYPT_ROUNDS, 10),
        loginRateLimit: {
            max: toInt(env.LOGIN_RATE_LIMIT_MAX, 10),
            windowMs: toInt(env.LOGIN_RATE_LIMIT_WINDOW_MIN, 15) * 60 * 1000
        },
        apiRateLimit: {
            max: toInt(env.API_RATE_LIMIT_MAX, 600),
            windowMs: 60 * 1000
        },
        db: {
            host: env.DB_HOST || 'localhost',
            port: toInt(env.DB_PORT, 3306),
            user: env.DB_USER || 'root',
            password: env.DB_PASSWORD || '',
            database: env.DB_NAME || 'sekco_db'
        }
    };
}

module.exports = { loadConfig };
