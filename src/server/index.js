'use strict';

const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createShutdown } = require('./shutdown');
const db = require('./db');

async function main() {
    const config = loadConfig();
    if (!config.jwtSecret) {
        console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
        process.exit(1);
    }
    if (config.env === 'production' && config.jwtSecret.length < 32) {
        console.error('JWT_SECRET must be at least 32 characters in production.');
        process.exit(1);
    }

    const app = createApp(config);
    try {
        await db.query('SELECT 1');
    } catch (err) {
        console.error(`Cannot connect to MySQL at ${config.db.host}:${config.db.port} (${err.code || err.message}).`);
        console.error('Check the DB_* settings in .env and run "npm run db:init" to create the schema.');
        process.exit(1);
    }

    const server = app.listen(config.port, () => {
        console.log(`SEKCO listening on http://localhost:${config.port} (${config.env})`);
    });

    const shutdown = createShutdown(server, { closeResources: db.close });
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});
