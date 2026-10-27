'use strict';

/**
 * Creates the database and applies database.sql (idempotent).
 *   npm run db:init
 *   npm run db:reset    drops the database first - destroys all data
 */
const { loadConfig } = require('../src/server/config');
const { migrate } = require('../src/server/db/migrate');

const reset = process.argv.includes('--reset');
const config = loadConfig();

if (reset && config.env === 'production') {
    console.error('Refusing to reset the database with NODE_ENV=production.');
    process.exit(1);
}

migrate(config.db, { reset })
    .then(() => console.log(`Database "${config.db.database}" is ready${reset ? ' (reset)' : ''}.`))
    .catch(err => {
        console.error(`Database setup failed: ${err.code || err.message}`);
        process.exit(1);
    });
