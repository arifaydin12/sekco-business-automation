'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createShutdown } = require('../src/server/shutdown');

const silent = { log() {}, error() {} };

function listen(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

describe('graceful shutdown', () => {
    it('stops accepting connections, releases resources and exits with code 0', async () => {
        const server = await listen((req, res) => res.end('ok'));
        const { port } = server.address();
        const events = [];
        const shutdown = createShutdown(server, {
            closeResources: async () => events.push('resources closed'),
            exit: (code) => events.push(`exit ${code}`),
            logger: silent
        });

        assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
        await shutdown('SIGTERM');
        assert.deepEqual(events, ['resources closed', 'exit 0']);
        await assert.rejects(fetch(`http://127.0.0.1:${port}/`), 'the port is closed after shutdown');
    });

    it('lets an in-flight request finish before exiting', async () => {
        const server = await listen((req, res) => setTimeout(() => res.end('slow'), 150));
        const { port } = server.address();
        const events = [];
        const shutdown = createShutdown(server, { exit: (code) => events.push(`exit ${code}`), logger: silent });

        const inFlight = fetch(`http://127.0.0.1:${port}/`).then(r => r.text());
        await new Promise(r => setTimeout(r, 30));
        const done = shutdown('SIGINT');
        assert.equal(await inFlight, 'slow');
        await done;
        assert.deepEqual(events, ['exit 0']);
    });

    it('is idempotent and exits with code 1 when releasing resources fails', async () => {
        const server = await listen((req, res) => res.end('ok'));
        const events = [];
        const shutdown = createShutdown(server, {
            closeResources: async () => { throw new Error('pool failure'); },
            exit: (code) => events.push(`exit ${code}`),
            logger: silent
        });
        await Promise.all([shutdown('SIGTERM'), shutdown('SIGTERM')]);
        assert.deepEqual(events, ['exit 1']);
    });

    it('forces the exit when connections never drain', async () => {
        const server = await listen((req) => { req.socket.setTimeout(0); /* never respond */ });
        const { port } = server.address();
        const events = [];
        const shutdown = createShutdown(server, { timeoutMs: 100, exit: (code) => events.push(`exit ${code}`), logger: silent });

        const hanging = fetch(`http://127.0.0.1:${port}/`).catch(() => 'aborted');
        await new Promise(r => setTimeout(r, 30));
        await shutdown('SIGTERM');
        assert.deepEqual(events, ['exit 1']);
        server.closeAllConnections();
        await hanging;
    });
});
