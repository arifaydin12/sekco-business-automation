// Browser-side storage for the demo: a tiny "database" persisted in localStorage and seeded from
// data/seed.json (the same file scripts/seed.js uses for MySQL).

const STORAGE_KEY = 'sekco-demo-db-v1';
const VERSION = 1;
const DAY = 24 * 3600 * 1000;

export let db = null;

export async function hashPassword(password) {
    const text = `sekco-demo:${password}`;
    if (globalThis.crypto && crypto.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return `plain:${text}`;
}

export function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
        // storage full or unavailable: the demo keeps working in memory
    }
}

export async function ready() {
    if (db) return db;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === VERSION) {
                db = parsed;
                return db;
            }
        }
    } catch {
        // corrupted storage: fall through and reseed
    }
    db = await seed();
    save();
    return db;
}

export async function resetData() {
    db = await seed();
    save();
    return db;
}

const iso = (ms) => new Date(ms).toISOString();
const dateOnly = (ms) => new Date(ms).toISOString().slice(0, 10);
const quote = (text) => `"${text.length > 60 ? `${text.slice(0, 59)}…` : text}"`;

/** Mirrors buildPlan() / the inserts of scripts/seed.js so both back ends start with identical data. */
async function seed() {
    const response = await fetch('data/seed.json');
    if (!response.ok) throw new Error('Could not load the demo data');
    const seedData = await response.json();

    const now = new Date();
    const nowMs = now.getTime();
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const stamp = (days, i, extraHours = 0) => {
        const t = todayMs + days * DAY + (9 + (i % 8)) * 3600000 + ((i * 13) % 60) * 60000 + extraHours * 3600000;
        return Math.min(t, nowMs - ((i % 25) + 1) * 60000);
    };

    const passwordHash = await hashPassword(seedData.defaultPassword);
    const data = {
        version: VERSION,
        seededAt: nowMs,
        defaultPassword: seedData.defaultPassword,
        demoAccounts: seedData.demoAccounts,
        seq: { users: 0, projects: 0, tasks: 0, comments: 0, activity: 0 },
        users: [],
        projects: [],
        tasks: [],
        comments: [],
        activity: []
    };

    const userId = {};
    seedData.users.forEach((u, i) => {
        const id = ++data.seq.users;
        userId[u.key] = id;
        data.users.push({
            id,
            name: u.name,
            email: u.email,
            passwordHash,
            role: u.role,
            status: 'Active',
            jobTitle: u.jobTitle,
            lastLoginAt: iso(todayMs - i * 3 * 3600000 - 2 * 3600000),
            createdAt: iso(todayMs - 120 * DAY)
        });
    });

    const projectId = {};
    const managerOf = {};
    const events = [];
    seedData.projects.forEach((p, i) => {
        const id = ++data.seq.projects;
        projectId[p.key] = id;
        managerOf[p.key] = p.manager;
        const createdAt = stamp(Math.min(p.start, -1) - 2, i);
        data.projects.push({
            id,
            name: p.name,
            description: p.description,
            managerId: userId[p.manager],
            status: p.status,
            startDate: dateOnly(todayMs + p.start * DAY),
            endDate: dateOnly(todayMs + p.end * DAY),
            createdBy: userId[p.manager],
            createdAt: iso(createdAt),
            updatedAt: iso(createdAt)
        });
        events.push({ at: createdAt, user: p.manager, action: 'project.created', type: 'project', entityId: id, projectId: id, message: `created project ${quote(p.name)}` });
    });

    seedData.tasks.forEach((t, i) => {
        const id = ++data.seq.tasks;
        const pid = projectId[t.project];
        const createdAt = stamp(t.created, i);
        const completedAt = t.status === 'Done' ? stamp(t.completed, i + 3) : null;
        let updatedAt = completedAt || createdAt;
        const ev = (at, user, action, type, message, entityId = id) =>
            events.push({ at, user, action, type, entityId, projectId: pid, message });

        ev(createdAt, managerOf[t.project], 'task.created', 'task', `created task ${quote(t.title)}`);
        if (t.status === 'In progress') {
            const at = Math.min(createdAt + DAY, nowMs - 3600000);
            ev(at, t.assignee, 'task.moved', 'task', `moved task ${quote(t.title)} from To do to In progress`);
            updatedAt = Math.max(updatedAt, at);
        }
        if (t.status === 'Done') {
            const mid = createdAt + Math.floor((completedAt - createdAt) / 2);
            ev(mid, t.assignee, 'task.moved', 'task', `moved task ${quote(t.title)} from To do to In progress`);
            ev(completedAt, t.assignee, 'task.completed', 'task', `completed task ${quote(t.title)}`);
        }
        (t.comments || []).forEach((c, j) => {
            const at = Math.min(createdAt + c.hours * 3600000 + j * 60000, nowMs - 60000);
            const commentId = ++data.seq.comments;
            data.comments.push({ id: commentId, taskId: id, userId: userId[c.user], body: c.body, createdAt: iso(at) });
            ev(at, c.user, 'comment.created', 'comment', `commented on ${quote(t.title)}`, commentId);
            updatedAt = Math.max(updatedAt, at);
        });

        data.tasks.push({
            id,
            title: t.title,
            description: t.description,
            projectId: pid,
            assigneeId: userId[t.assignee],
            createdBy: userId[managerOf[t.project]],
            priority: t.priority,
            status: t.status,
            dueDate: dateOnly(todayMs + t.due * DAY),
            completedAt: completedAt ? iso(completedAt) : null,
            createdAt: iso(createdAt),
            updatedAt: iso(updatedAt)
        });
    });

    events.sort((a, b) => a.at - b.at);
    for (const e of events) {
        data.activity.push({
            id: ++data.seq.activity,
            userId: userId[e.user],
            action: e.action,
            entityType: e.type,
            entityId: e.entityId,
            projectId: e.projectId,
            message: e.message,
            createdAt: iso(e.at)
        });
    }
    return data;
}
