'use strict';

/** Wraps an async route handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/** Parses page / pageSize query values (already validated) into SQL paging values. */
function paging({ page = 1, pageSize = 20 } = {}) {
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function pageMeta({ page, pageSize }, total) {
    return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escapes LIKE wildcards in user input. */
const likeTerm = (q) => `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;

/** Converts a "YYYY-MM-DD HH:MM:SS" / Date value from MySQL (UTC session) to an ISO string. */
function iso(value) {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    return new Date(String(value).replace(' ', 'T') + 'Z').toISOString();
}

/** Today's date in UTC as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

module.exports = { asyncHandler, paging, pageMeta, likeTerm, iso, today };
