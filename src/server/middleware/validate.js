'use strict';

/**
 * Validates request parts with zod schemas. Parsed (and coerced) values are
 * exposed as req.valid.{body,query,params}; the raw request is left untouched.
 */
function validate(schemas) {
    return (req, res, next) => {
        try {
            req.valid = req.valid || {};
            for (const part of ['params', 'query', 'body']) {
                if (schemas[part]) {
                    req.valid[part] = schemas[part].parse(req[part] === undefined ? {} : req[part]);
                }
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { validate };
