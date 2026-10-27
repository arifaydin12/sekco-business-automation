'use strict';

/**
 * Loads fictional demo data (users, projects, tasks, comments, activity) into MySQL.
 * Development / demo only: all accounts share the password from SEED_PASSWORD (default in data/seed.json).
 *
 *   npm run db:seed              seeds an empty database (creates the schema if needed)
 *   npm run db:seed -- --reset   drops and recreates the database first
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/server/config');
const { migrate } = require('../src/server/db/migrate');

const DAY = 24 * 3600 * 1000;

const sqlDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const quote = (text) => `"${text.length > 60 ? `${text.slice(0, 59)}…` : text}"`;

/** Turns data/seed.json into concrete rows with timestamps relative to `now` (kept in sync with the browser demo). */
function buildPlan(seed, now) {
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const nowMs = now.getTime();
    const stamp = (days, i, extraHours = 0) => {
        const t = todayMs + days * DAY + (9 + (i % 8)) * 3600 * 1000 + ((i * 13) % 60) * 60000 + extraHours * 3600000;
        return Math.min(t, nowMs - ((i % 25) + 1) * 60000);
    };

    const userName = Object.fromEntries(seed.users.map(u => [u.key, u.name]));
    const projectByKey = Object.fromEntries(seed.projects.map(p => [p.key, p]));

    const projects = seed.projects.map((p, i) => ({
        ...p,
        createdAt: stamp(Math.min(p.start, -1) - 2, i)
    }));

    const events = [];
    const tasks = seed.tasks.map((t, i) => {
        const project = projectByKey[t.project];
        const createdAt = stamp(t.created, i);
        const completedAt = t.status === 'Done' ? stamp(t.completed, i + 3) : null;
        const task = { ...t, index: i, createdAt, completedAt, updatedAt: completedAt || createdAt };

        events.push({
            at: createdAt, user: project.manager, action: 'task.created', type: 'task', task: i, project: t.project,
            message: `created task ${quote(t.title)}`
        });
        if (t.status === 'In progress') {
            const at = Math.min(createdAt + DAY, nowMs - 3600000);
            events.push({
                at, user: t.assignee, action: 'task.moved', type: 'task', task: i, project: t.project,
                message: `moved task ${quote(t.title)} from To do to In progress`
            });
            task.updatedAt = Math.max(task.updatedAt, at);
        }
        if (t.status === 'Done') {
            const mid = createdAt + Math.floor((completedAt - createdAt) / 2);
            events.push({
                at: mid, user: t.assignee, action: 'task.moved', type: 'task', task: i, project: t.project,
                message: `moved task ${quote(t.title)} from To do to In progress`
            });
            events.push({
                at: completedAt, user: t.assignee, action: 'task.completed', type: 'task', task: i, project: t.project,
                message: `completed task ${quote(t.title)}`
            });
        }
        task.comments = (t.comments || []).map((c, j) => {
            const at = Math.min(createdAt + c.hours * 3600000 + j * 60000, nowMs - 60000);
            events.push({
                at, user: c.user, action: 'comment.created', type: 'comment', task: i, project: t.project,
                message: `commented on ${quote(t.title)}`
            });
            task.updatedAt = Math.max(task.updatedAt, at);
            return { ...c, createdAt: at };
        });
        return task;
    });

    for (const p of projects) {
        events.push({
            at: p.createdAt, user: p.manager, action: 'project.created', type: 'project', project: p.key,
            message: `created project ${quote(p.name)}`
        });
    }
    events.sort((a, b) => a.at - b.at);
    return { projects, tasks, events, userName, todayMs };
}

async function main() {
    const reset = process.argv.includes('--reset');
    const config = loadConfig();
    if (config.env === 'production' && !process.argv.includes('--force')) {
        console.error('Refusing to load demo data with NODE_ENV=production (use --force to override).');
        process.exit(1);
    }

    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8'));
    const password = process.env.SEED_PASSWORD || seed.defaultPassword;

    await migrate(config.db, { reset });
    const db = await mysql.createConnection({ ...config.db, timezone: 'Z', dateStrings: ['DATE'] });
    await db.query("SET time_zone = '+00:00'");

    try {
        const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM users');
        if (n > 0) {
            console.error(`Database "${config.db.database}" already contains data. Re-run with --reset to wipe it first.`);
            process.exit(1);
        }

        const plan = buildPlan(seed, new Date());
        const hash = await bcrypt.hash(password, config.bcryptRounds);
        const userId = {};
        const projectId = {};
        const taskId = {};

        await db.beginTransaction();

        for (const [i, u] of seed.users.entries()) {
            const [r] = await db.query(
                `INSERT INTO users (name, email, password_hash, role, status, job_title, last_login_at, created_at)
                 VALUES (?, ?, ?, ?, 'Active', ?, ?, ?)`,
                [u.name, u.email, hash, u.role, u.jobTitle, sqlTime(plan.todayMs - i * 3 * 3600000 - 2 * 3600000), sqlTime(plan.todayMs - 120 * DAY)]
            );
            userId[u.key] = r.insertId;
        }

        for (const p of plan.projects) {
            const [r] = await db.query(
                `INSERT INTO projects (name, description, manager_id, status, start_date, end_date, created_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [p.name, p.description, userId[p.manager], p.status, sqlDate(plan.todayMs + p.start * DAY),
                    sqlDate(plan.todayMs + p.end * DAY), userId[p.manager], sqlTime(p.createdAt), sqlTime(p.createdAt)]
            );
            projectId[p.key] = r.insertId;
        }

        for (const t of plan.tasks) {
            const [r] = await db.query(
                `INSERT INTO tasks (title, description, project_id, assignee_id, created_by, priority, status, due_date,
                                    completed_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [t.title, t.description, projectId[t.project], userId[t.assignee], userId[projectByKey(seed, t.project).manager],
                    t.priority, t.status, sqlDate(plan.todayMs + t.due * DAY),
                    t.completedAt ? sqlTime(t.completedAt) : null, sqlTime(t.createdAt), sqlTime(t.updatedAt)]
            );
            taskId[t.index] = r.insertId;
            for (const c of t.comments) {
                await db.query('INSERT INTO comments (task_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [
                    r.insertId, userId[c.user], c.body, sqlTime(c.createdAt)
                ]);
            }
        }

        for (const e of plan.events) {
            const entityId = e.type === 'project' ? projectId[e.project] : taskId[e.task];
            await db.query(
                `INSERT INTO activity (user_id, action, entity_type, entity_id, project_id, message, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId[e.user], e.action, e.type, entityId, projectId[e.project], e.message, sqlTime(e.at)]
            );
        }

        await db.commit();
        console.log(
            `Seeded ${seed.users.length} users, ${plan.projects.length} projects, ${plan.tasks.length} tasks ` +
            `into "${config.db.database}".`
        );
        console.log(`Demo accounts (password: ${password}):`);
        for (const a of seed.demoAccounts) console.log(`  ${a.label.padEnd(8)} ${a.email}`);
    } catch (err) {
        await db.rollback().catch(() => {});
        throw err;
    } finally {
        await db.end();
    }
}

function projectByKey(seed, key) {
    return seed.projects.find(p => p.key === key);
}

if (require.main === module) {
    main().catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}

module.exports = { buildPlan };
