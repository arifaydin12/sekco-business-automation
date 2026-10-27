'use strict';

/**
 * Creates a graceful-shutdown function for an HTTP server: stop accepting connections, let in-flight
 * requests finish, release the database pool, then exit. A timer forces the exit if that takes too long.
 *
 * `closeResources` and `exit` are injectable so the behaviour can be tested without killing the process.
 */
function createShutdown(server, { closeResources, exit = process.exit, timeoutMs = 10000, logger = console } = {}) {
    let shuttingDown = false;

    return function shutdown(signal) {
        if (shuttingDown) return Promise.resolve();
        shuttingDown = true;
        logger.log(`${signal} received: closing HTTP server and database pool...`);

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                logger.error('Shutdown timed out, forcing exit.');
                exit(1);
                resolve();
            }, timeoutMs);
            timer.unref();

            // Keep-alive sockets become idle once their last response is sent; close them as they do,
            // otherwise server.close() would wait for the keep-alive timeout.
            const sweeper = setInterval(() => server.closeIdleConnections && server.closeIdleConnections(), 50);
            sweeper.unref();

            server.close(async (closeError) => {
                clearInterval(sweeper);
                let code = closeError ? 1 : 0;
                try {
                    if (closeResources) await closeResources();
                } catch (err) {
                    logger.error('Error while releasing resources:', err);
                    code = 1;
                }
                clearTimeout(timer);
                logger.log('Shutdown complete.');
                exit(code);
                resolve();
            });
            // Idle keep-alive sockets would otherwise delay server.close()
            if (server.closeIdleConnections) server.closeIdleConnections();
        });
    };
}

module.exports = { createShutdown };
