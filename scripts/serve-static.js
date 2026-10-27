'use strict';

/**
 * Tiny static file server used to preview the demo build exactly as GitHub Pages serves it.
 *   node scripts/serve-static.js <dir> <port> [mount-path]
 * Example: node scripts/serve-static.js docs 4173 /sekco-business-automation/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const [dir = 'docs', portArg = '4173', mountArg = '/'] = process.argv.slice(2);
const root = path.resolve(dir);
const port = Number(portArg);
const mount = mountArg.endsWith('/') ? mountArg : `${mountArg}/`;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

http
    .createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === mount.slice(0, -1)) {
            res.writeHead(301, { Location: mount });
            return res.end();
        }
        if (!pathname.startsWith(mount)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not found (the site is mounted at ' + mount + ')');
        }
        pathname = pathname.slice(mount.length) || 'index.html';
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = path.join(root, pathname);
        if (!file.startsWith(root)) {
            res.writeHead(403);
            return res.end();
        }
        fs.readFile(file, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Not found');
            }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            res.end(data);
        });
    })
    .listen(port, () => console.log(`Serving ${root} at http://localhost:${port}${mount}`));
