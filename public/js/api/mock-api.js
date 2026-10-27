// In-browser mock of the SEKCO REST API (demo mode). It mirrors the server's response shapes,
// validation rules, permissions and progress computation, and keeps its data in localStorage.
import { ApiError } from './errors.js';
import * as store from './mock-store.js';

export const ready = () => store.ready();
export const resetData = () => store.resetData();

const ROLES = ['Admin', 'Manager', 'User'];
const USER_STATUSES = ['Active', 'Inactive'];
const PROJECT_STATUSES = ['Planning', 'Active', 'On hold', 'Completed'];
const TASK_STATUSES = ['To do', 'In progress', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const fail = (status, code, message, details) => {
    throw new ApiError(status, code, message, details);
};
const forbidden = (message = 'You do not have permission to perform this action') => fail(403, 'FORBIDDEN', message);
const notFound = (what) => fail(404, 'NOT_FOUND', `${what} not found`);
const badRequest = (message) => fail(400, 'BAD_REQUEST', message);

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const D = () => store.db;

// ---------- validation (mirrors src/server/schemas.js) ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (s) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/**
 * rule: { type, required, nullable, emptyToNull, default, min, max, values, trim, lower, minMsg }
 * With partial=true missing keys are skipped (PATCH semantics).
 */
function parse(input, schema, { partial = false } = {}) {
    const out = {};
    const details = [];
    const src = input && typeof input === 'object' ? input : {};
    for (const [key, rule] of Object.entries(schema)) {
        let v = src[key];
        if (v === undefined) {
            if (rule.default !== undefined && !partial) out[key] = rule.default;
            else if (rule.required && !partial) details.push({ path: key, message: rule.requiredMessage || 'Required' });
            continue;
        }
        if (rule.emptyToNull && typeof v === 'string' && v.trim() === '') v = null;
        if (v === null) {
            if (rule.nullable) out[key] = null;
            else details.push({ path: key, message: rule.requiredMessage || 'Required' });
            continue;
        }
        const error = (message) => details.push({ path: key, message });
        switch (rule.type) {
            case 'string': {
                if (typeof v !== 'string') {
                    error('Expected text');
                    break;
                }
                let s = rule.trim === false ? v : v.trim();
                if (rule.lower) s = s.toLowerCase();
                if (rule.min && s.length < rule.min) error(rule.minMsg || `Must be at least ${rule.min} characters`);
                else if (rule.max && s.length > rule.max) error(`Must be at most ${rule.max} characters`);
                else if (rule.email && !EMAIL_RE.test(s)) error('Enter a valid email address');
                else out[key] = s;
                break;
            }
            case 'password': {
                if (typeof v !== 'string') {
                    error('Expected text');
                    break;
                }
                if (v.length < 8) error('Password must be at least 8 characters');
                else if (v.length > 72) error('Password must be at most 72 characters');
                else if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) error('Password must contain at least one letter and one number');
                else out[key] = v;
                break;
            }
            case 'enum':
                if (!rule.values.includes(v)) error(`Must be one of: ${rule.values.join(', ')}`);
                else out[key] = v;
                break;
            case 'date':
                if (typeof v !== 'string' || !isValidDate(v)) error('Use the format YYYY-MM-DD');
                else out[key] = v;
                break;
            case 'id': {
                const n = Number(v);
                if (!Number.isInteger(n) || n <= 0) error('A valid id is required');
                else out[key] = n;
                break;
            }
            case 'int': {
                const n = Number(v);
                if (!Number.isInteger(n) || n < (rule.minValue ?? -Infinity) || n > (rule.maxValue ?? Infinity)) {
                    error(`Must be a whole number between ${rule.minValue} and ${rule.maxValue}`);
                } else out[key] = n;
                break;
            }
            case 'bool':
                if (v === true || v === 'true') out[key] = true;
                else if (v === false || v === 'false') out[key] = false;
                else error('Must be true or false');
                break;
            default:
                out[key] = v;
        }
    }
    if (details.length) fail(400, 'VALIDATION_ERROR', 'Request validation failed', details);
    return out;
}

const atLeastOne = (value) => {
    if (!Object.values(value).some(v => v !== undefined)) {
        fail(400, 'VALIDATION_ERROR', 'Request validation failed', [{ path: '', message: 'Provide at least one field to update' }]);
    }
};

const S = {
    id: { type: 'id' },
    paging: {
        page: { type: 'int', minValue: 1, default: 1 },
        pageSize: { type: 'int', minValue: 1, maxValue: 100, default: 20 }
    },
    text: (max, extra = {}) => ({ type: 'string', max, nullable: true, emptyToNull: true, ...extra })
};

const SCHEMAS = {
    login: {
        email: { type: 'string', lower: true, min: 1, required: true, minMsg: 'Email is required', requiredMessage: 'Email is required' },
        password: { type: 'string', trim: false, min: 1, required: true, minMsg: 'Password is required', requiredMessage: 'Password is required' }
    },
    changePassword: {
        currentPassword: { type: 'string', trim: false, min: 1, required: true, minMsg: 'Current password is required' },
        newPassword: { type: 'password', required: true }
    },
    profile: { name: { type: 'string', min: 2, max: 100 }, jobTitle: S.text(100) },
    listUsers: { ...S.paging, q: { type: 'string', max: 100 }, role: { type: 'enum', values: ROLES }, status: { type: 'enum', values: USER_STATUSES } },
    createUser: {
        name: { type: 'string', min: 2, max: 100, required: true, minMsg: 'Name must be at least 2 characters' },
        email: { type: 'string', lower: true, email: true, max: 190, required: true },
        password: { type: 'password', required: true },
        role: { type: 'enum', values: ROLES, default: 'User' },
        jobTitle: S.text(100)
    },
    updateUser: {
        name: { type: 'string', min: 2, max: 100 },
        email: { type: 'string', lower: true, email: true, max: 190 },
        role: { type: 'enum', values: ROLES },
        status: { type: 'enum', values: USER_STATUSES },
        jobTitle: S.text(100)
    },
    resetPassword: { password: { type: 'password' } },
    listProjects: {
        ...S.paging,
        q: { type: 'string', max: 100 },
        status: { type: 'enum', values: PROJECT_STATUSES },
        managerId: S.id,
        sort: { type: 'enum', values: ['newest', 'name', 'deadline', 'progress'], default: 'newest' }
    },
    project: {
        name: { type: 'string', min: 2, max: 120, required: true, minMsg: 'Name must be at least 2 characters' },
        description: S.text(5000),
        managerId: { type: 'id', nullable: true, emptyToNull: true },
        status: { type: 'enum', values: PROJECT_STATUSES, default: 'Planning' },
        startDate: { type: 'date', nullable: true, emptyToNull: true },
        endDate: { type: 'date', nullable: true, emptyToNull: true }
    },
    listTasks: {
        ...S.paging,
        q: { type: 'string', max: 100 },
        projectId: S.id,
        assigneeId: S.id,
        mine: { type: 'bool' },
        unassigned: { type: 'bool' },
        status: { type: 'enum', values: TASK_STATUSES },
        priority: { type: 'enum', values: PRIORITIES },
        overdue: { type: 'bool' },
        open: { type: 'bool' },
        sort: { type: 'enum', values: ['newest', 'due', 'priority', 'updated'], default: 'newest' }
    },
    task: {
        title: { type: 'string', min: 2, max: 160, required: true, minMsg: 'Title must be at least 2 characters' },
        description: S.text(5000),
        projectId: { type: 'id', required: true, requiredMessage: 'A valid id is required' },
        assigneeId: { type: 'id', nullable: true, emptyToNull: true },
        priority: { type: 'enum', values: PRIORITIES, default: 'Medium' },
        status: { type: 'enum', values: TASK_STATUSES, default: 'To do' },
        dueDate: { type: 'date', nullable: true, emptyToNull: true }
    },
    comment: { body: { type: 'string', min: 1, max: 2000, required: true, minMsg: 'Comment cannot be empty' } },
    listActivity: { ...S.paging, projectId: S.id }
};

const checkDateOrder = (start, end) => {
    if (start && end && end < start) {
        fail(400, 'VALIDATION_ERROR', 'Request validation failed', [{ path: 'endDate', message: 'End date must not be before the start date' }]);
    }
};

// ---------- helpers ----------

const paginate = (items, { page, pageSize }) => ({
    items: items.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) }
});

const contains = (haystack, needle) => String(haystack || '').toLowerCase().includes(needle.toLowerCase());
const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
const nextId = (table) => ++D().seq[table];

const userById = (id) => D().users.find(u => u.id === id);
const projectById = (id) => D().projects.find(p => p.id === id);
const taskById = (id) => D().tasks.find(t => t.id === id);

function log(actor, action, entityType, entityId, projectId, message) {
    D().activity.push({
        id: nextId('activity'),
        userId: actor ? actor.id : null,
        action,
        entityType,
        entityId: entityId ?? null,
        projectId: projectId ?? null,
        message: message.length > 255 ? `${message.slice(0, 254)}…` : message,
        createdAt: nowIso()
    });
}
const label = (text, max = 60) => `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;

const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    jobTitle: u.jobTitle ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt
});

// ---------- projects ----------

const canManageProject = (actor, p) => actor.role === 'Admin' || (actor.role === 'Manager' && p.managerId === actor.id);
const computeProgress = (done, total) => (total > 0 ? Math.round((done * 100) / total) : 0);

function projectView(p, actor) {
    const tasks = D().tasks.filter(t => t.projectId === p.id);
    const done = tasks.filter(t => t.status === 'Done').length;
    const overdue = tasks.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate < today()).length;
    const manager = p.managerId ? userById(p.managerId) : null;
    return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        managerId: p.managerId ?? null,
        managerName: manager ? manager.name : null,
        status: p.status,
        startDate: p.startDate ?? null,
        endDate: p.endDate ?? null,
        taskCount: tasks.length,
        doneCount: done,
        overdueCount: overdue,
        progress: computeProgress(done, tasks.length),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        permissions: { edit: canManageProject(actor, p), delete: canManageProject(actor, p) }
    };
}

function assertValidManager(managerId) {
    const user = userById(managerId);
    if (!user) badRequest('The selected manager does not exist');
    if (user.status !== 'Active') badRequest('The selected manager is deactivated');
    if (user.role === 'User') badRequest('Only users with the Manager or Admin role can lead a project');
}

function listProjects(q, actor) {
    let items = D().projects.filter(p => {
        if (q.q && !(contains(p.name, q.q) || contains(p.description, q.q))) return false;
        if (q.status && p.status !== q.status) return false;
        if (q.managerId && p.managerId !== q.managerId) return false;
        return true;
    });
    const views = new Map(items.map(p => [p.id, projectView(p, actor)]));
    const sorters = {
        newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
        name: (a, b) => byName(a.name, b.name),
        deadline: (a, b) => (a.endDate ? 0 : 1) - (b.endDate ? 0 : 1) || (a.endDate || '').localeCompare(b.endDate || '') || byName(a.name, b.name),
        progress: (a, b) => views.get(b.id).progress - views.get(a.id).progress || byName(a.name, b.name)
    };
    items = [...items].sort(sorters[q.sort]);
    const page = paginate(items, q);
    return { items: page.items.map(p => views.get(p.id)), meta: page.meta };
}

function projectDetail(p, actor) {
    const view = projectView(p, actor);
    view.tasksByStatus = { 'To do': 0, 'In progress': 0, Done: 0 };
    for (const t of D().tasks) if (t.projectId === p.id) view.tasksByStatus[t.status] += 1;
    return view;
}

// ---------- tasks ----------

function taskPermissions(actor, t) {
    const project = projectById(t.projectId);
    const full = actor.role === 'Admin' || (actor.role === 'Manager' && project && project.managerId === actor.id);
    return { edit: full, status: full || t.assigneeId === actor.id, delete: full };
}

function taskView(t, actor) {
    const project = projectById(t.projectId);
    const assignee = t.assigneeId ? userById(t.assigneeId) : null;
    return {
        id: t.id,
        title: t.title,
        description: t.description ?? null,
        projectId: t.projectId,
        projectName: project ? project.name : null,
        assigneeId: t.assigneeId ?? null,
        assigneeName: assignee ? assignee.name : null,
        createdBy: t.createdBy ?? null,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate ?? null,
        overdue: t.status !== 'Done' && !!t.dueDate && t.dueDate < today(),
        completedAt: t.completedAt ?? null,
        commentCount: D().comments.filter(c => c.taskId === t.id).length,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        permissions: taskPermissions(actor, t)
    };
}

const commentView = (c) => {
    const author = c.userId ? userById(c.userId) : null;
    return { id: c.id, taskId: c.taskId, userId: c.userId, userName: author ? author.name : null, userRole: author ? author.role : null, body: c.body, createdAt: c.createdAt };
};

const taskDetail = (t, actor) => ({
    ...taskView(t, actor),
    comments: D().comments.filter(c => c.taskId === t.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id).map(commentView)
});

function listTasks(q, actor) {
    const now = today();
    const isOverdue = (t) => t.status !== 'Done' && !!t.dueDate && t.dueDate < now;
    const rank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    let items = D().tasks.filter(t => {
        if (q.q && !(contains(t.title, q.q) || contains(t.description, q.q))) return false;
        if (q.projectId && t.projectId !== q.projectId) return false;
        if (q.mine) {
            if (t.assigneeId !== actor.id) return false;
        } else if (q.assigneeId && t.assigneeId !== q.assigneeId) return false;
        if (q.unassigned && t.assigneeId) return false;
        if (q.status && t.status !== q.status) return false;
        if (q.priority && t.priority !== q.priority) return false;
        if (q.open && t.status === 'Done') return false;
        if (q.overdue === true && !isOverdue(t)) return false;
        if (q.overdue === false && isOverdue(t)) return false;
        return true;
    });
    const dueSort = (a, b) => (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) || (a.dueDate || '').localeCompare(b.dueDate || '') || a.id - b.id;
    const sorters = {
        newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
        due: dueSort,
        priority: (a, b) => rank[a.priority] - rank[b.priority] || dueSort(a, b),
        updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id
    };
    items = [...items].sort(sorters[q.sort]);
    const page = paginate(items, q);
    return { items: page.items.map(t => taskView(t, actor)), meta: page.meta };
}

function assertValidAssignee(userId) {
    const user = userById(userId);
    if (!user) badRequest('The selected assignee does not exist');
    if (user.status !== 'Active') badRequest('The selected assignee is deactivated');
}

// ---------- route table ----------

const routes = [];
const route = (method, pattern, options, handler) => {
    if (typeof options === 'function') [handler, options] = [options, {}];
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, regex, keys, handler, public: !!options.public, roles: options.roles });
};

const ok = (data, meta, status = 200) => ({ status, data, meta });
const adminOnly = { roles: ['Admin'] };

// health & auth
route('GET', '/health', { public: true }, () => ok({ status: 'ok', database: 'browser' }));

route('POST', '/auth/login', { public: true }, async ({ body }) => {
    const { email, password } = parse(body, SCHEMAS.login);
    const user = D().users.find(u => u.email === email);
    const matches = user && user.passwordHash === (await store.hashPassword(password));
    if (!user || !matches) fail(401, 'UNAUTHORIZED', 'Invalid email or password');
    if (user.status !== 'Active') forbidden('This account is deactivated. Contact an administrator.');
    user.lastLoginAt = nowIso();
    return ok({ token: `demo-token-${user.id}`, user: publicUser(user) });
});

route('POST', '/auth/register', { public: true }, () =>
    fail(403, 'REGISTRATION_DISABLED', 'Self-registration is disabled. Ask an administrator to create your account.')
);

route('GET', '/auth/me', ({ user }) => ok(publicUser(user)));

route('PATCH', '/auth/me', ({ user, body }) => {
    const patch = parse(body, SCHEMAS.profile, { partial: true });
    atLeastOne(patch);
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.jobTitle !== undefined) user.jobTitle = patch.jobTitle;
    return ok(publicUser(user));
});

route('POST', '/auth/change-password', async ({ user, body }) => {
    const { currentPassword, newPassword } = parse(body, SCHEMAS.changePassword);
    if (user.passwordHash !== (await store.hashPassword(currentPassword))) badRequest('Current password is incorrect');
    if (currentPassword === newPassword) badRequest('The new password must be different from the current one');
    user.passwordHash = await store.hashPassword(newPassword);
    return ok({ message: 'Password updated' });
});

// users
route('GET', '/users', ({ query }) => {
    const q = parse(query, SCHEMAS.listUsers);
    const items = D().users
        .filter(u => (!q.q || contains(u.name, q.q) || contains(u.email, q.q)) && (!q.role || u.role === q.role) && (!q.status || u.status === q.status))
        .sort((a, b) => byName(a.name, b.name) || a.id - b.id);
    const page = paginate(items, q);
    return ok(page.items.map(publicUser), page.meta);
});

route('GET', '/users/directory', () =>
    ok(D().users.filter(u => u.status === 'Active').sort((a, b) => byName(a.name, b.name)).map(u => ({ id: u.id, name: u.name, role: u.role, jobTitle: u.jobTitle ?? null })))
);

route('POST', '/users', adminOnly, async ({ user, body }) => {
    const input = parse(body, SCHEMAS.createUser);
    if (D().users.some(u => u.email === input.email)) fail(409, 'CONFLICT', 'A user with this email already exists');
    const created = {
        id: nextId('users'),
        name: input.name,
        email: input.email,
        passwordHash: await store.hashPassword(input.password),
        role: input.role,
        status: 'Active',
        jobTitle: input.jobTitle ?? null,
        lastLoginAt: null,
        createdAt: nowIso()
    };
    D().users.push(created);
    log(user, 'user.created', 'user', created.id, null, `created the account for ${input.name} (${input.role})`);
    return ok(publicUser(created), undefined, 201);
});

route('GET', '/users/:id', ({ params }) => {
    const target = userById(parse(params, { id: S.id }).id);
    if (!target) notFound('User');
    return ok(publicUser(target));
});

function updateUser(actor, id, patch) {
    const target = userById(id);
    if (!target) notFound('User');
    if (id === actor.id) {
        if (patch.role !== undefined && patch.role !== target.role) forbidden('You cannot change your own role');
        if (patch.status !== undefined && patch.status !== 'Active') forbidden('You cannot deactivate your own account');
    }
    if (patch.email !== undefined && D().users.some(u => u.email === patch.email && u.id !== id)) {
        fail(409, 'CONFLICT', 'A user with this email already exists');
    }
    const changes = [];
    if (patch.role !== undefined && patch.role !== target.role) changes.push(`role ${target.role} → ${patch.role}`);
    if (patch.status !== undefined && patch.status !== target.status) changes.push(patch.status === 'Active' ? 'activated' : 'deactivated');
    for (const key of ['name', 'email', 'role', 'status', 'jobTitle']) if (patch[key] !== undefined) target[key] = patch[key];
    log(actor, 'user.updated', 'user', id, null, `updated ${target.name}${changes.length ? ` (${changes.join(', ')})` : ''}`);
    return ok(publicUser(target));
}

route('PATCH', '/users/:id', adminOnly, ({ user, params, body }) => {
    const { id } = parse(params, { id: S.id });
    const patch = parse(body, SCHEMAS.updateUser, { partial: true });
    atLeastOne(patch);
    return updateUser(user, id, patch);
});
route('POST', '/users/:id/deactivate', adminOnly, ({ user, params }) => updateUser(user, parse(params, { id: S.id }).id, { status: 'Inactive' }));
route('POST', '/users/:id/activate', adminOnly, ({ user, params }) => updateUser(user, parse(params, { id: S.id }).id, { status: 'Active' }));

route('POST', '/users/:id/reset-password', adminOnly, async ({ user, params, body }) => {
    const { id } = parse(params, { id: S.id });
    const { password } = parse(body, SCHEMAS.resetPassword);
    const target = userById(id);
    if (!target) notFound('User');
    let temporaryPassword = password;
    if (!temporaryPassword) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        temporaryPassword = `${[...bytes].map(b => alphabet[b % alphabet.length]).join('')}7`;
    }
    target.passwordHash = await store.hashPassword(temporaryPassword);
    log(user, 'user.password_reset', 'user', id, null, `reset the password of ${target.name}`);
    return ok({ temporaryPassword: password ? undefined : temporaryPassword });
});

// projects
route('GET', '/projects', ({ user, query }) => {
    const { items, meta } = listProjects(parse(query, SCHEMAS.listProjects), user);
    return ok(items, meta);
});

route('POST', '/projects', { roles: ['Admin', 'Manager'] }, ({ user, body }) => {
    const input = parse(body, SCHEMAS.project);
    checkDateOrder(input.startDate, input.endDate);
    let managerId = input.managerId;
    if (managerId === undefined || (managerId === null && user.role !== 'Admin')) managerId = user.id;
    if (managerId !== null) assertValidManager(managerId);
    const stamp = nowIso();
    const project = {
        id: nextId('projects'),
        name: input.name,
        description: input.description ?? null,
        managerId,
        status: input.status,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdBy: user.id,
        createdAt: stamp,
        updatedAt: stamp
    };
    D().projects.push(project);
    log(user, 'project.created', 'project', project.id, project.id, `created project ${label(project.name)}`);
    return ok(projectDetail(project, user), undefined, 201);
});

route('GET', '/projects/:id', ({ user, params }) => {
    const project = projectById(parse(params, { id: S.id }).id);
    if (!project) notFound('Project');
    return ok(projectDetail(project, user));
});

route('PATCH', '/projects/:id', ({ user, params, body }) => {
    const { id } = parse(params, { id: S.id });
    const patch = parse(body, SCHEMAS.project, { partial: true });
    atLeastOne(patch);
    const project = projectById(id);
    if (!project) notFound('Project');
    if (!canManageProject(user, project)) forbidden('Only an administrator or the project manager can edit this project');
    checkDateOrder(patch.startDate !== undefined ? patch.startDate : project.startDate, patch.endDate !== undefined ? patch.endDate : project.endDate);
    if (patch.managerId) assertValidManager(patch.managerId);
    if (patch.managerId === null && user.role !== 'Admin') forbidden('Only an administrator can leave a project without a manager');
    const statusChanged = patch.status !== undefined && patch.status !== project.status;
    for (const key of ['name', 'description', 'managerId', 'status', 'startDate', 'endDate']) if (patch[key] !== undefined) project[key] = patch[key];
    project.updatedAt = nowIso();
    log(
        user,
        statusChanged ? 'project.status_changed' : 'project.updated',
        'project',
        id,
        id,
        statusChanged ? `changed the status of project ${label(project.name)} to ${patch.status}` : `updated project ${label(project.name)}`
    );
    return ok(projectDetail(project, user));
});

route('DELETE', '/projects/:id', ({ user, params }) => {
    const { id } = parse(params, { id: S.id });
    const project = projectById(id);
    if (!project) notFound('Project');
    if (!canManageProject(user, project)) forbidden('Only an administrator or the project manager can delete this project');
    log(user, 'project.deleted', 'project', id, null, `deleted project ${label(project.name)}`);
    const taskIds = new Set(D().tasks.filter(t => t.projectId === id).map(t => t.id));
    D().tasks = D().tasks.filter(t => t.projectId !== id);
    D().comments = D().comments.filter(c => !taskIds.has(c.taskId));
    D().projects = D().projects.filter(p => p.id !== id);
    for (const a of D().activity) if (a.projectId === id) a.projectId = null;
    return { status: 204, data: null };
});

function activityView(a) {
    const author = a.userId ? userById(a.userId) : null;
    const project = a.projectId ? projectById(a.projectId) : null;
    return {
        id: a.id,
        userId: a.userId,
        userName: author ? author.name : null,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        projectId: a.projectId,
        projectName: project ? project.name : null,
        message: a.message,
        createdAt: a.createdAt
    };
}

const sortedActivity = (projectId) =>
    D().activity
        .filter(a => !projectId || a.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

route('GET', '/projects/:id/activity', ({ params, query }) => {
    const { id } = parse(params, { id: S.id });
    const q = parse(query, SCHEMAS.listActivity);
    if (!projectById(id)) notFound('Project');
    const page = paginate(sortedActivity(id), q);
    return ok(page.items.map(activityView), page.meta);
});

// tasks
route('GET', '/tasks', ({ user, query }) => {
    const { items, meta } = listTasks(parse(query, SCHEMAS.listTasks), user);
    return ok(items, meta);
});

route('POST', '/tasks', ({ user, body }) => {
    const input = parse(body, SCHEMAS.task);
    const project = projectById(input.projectId);
    if (!project) badRequest('The selected project does not exist');
    if (!canManageProject(user, project)) forbidden('Only an administrator or the project manager can add tasks to this project');
    if (input.assigneeId) assertValidAssignee(input.assigneeId);
    const stamp = nowIso();
    const task = {
        id: nextId('tasks'),
        title: input.title,
        description: input.description ?? null,
        projectId: input.projectId,
        assigneeId: input.assigneeId ?? null,
        createdBy: user.id,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate ?? null,
        completedAt: input.status === 'Done' ? stamp : null,
        createdAt: stamp,
        updatedAt: stamp
    };
    D().tasks.push(task);
    log(user, 'task.created', 'task', task.id, task.projectId, `created task ${label(task.title)}`);
    return ok(taskDetail(task, user), undefined, 201);
});

route('GET', '/tasks/:id', ({ user, params }) => {
    const task = taskById(parse(params, { id: S.id }).id);
    if (!task) notFound('Task');
    return ok(taskDetail(task, user));
});

route('PATCH', '/tasks/:id', ({ user, params, body }) => {
    const { id } = parse(params, { id: S.id });
    const patch = parse(body, SCHEMAS.task, { partial: true });
    atLeastOne(patch);
    const task = taskById(id);
    if (!task) notFound('Task');
    const perms = taskPermissions(user, task);
    const touched = Object.keys(patch).filter(k => patch[k] !== undefined);
    if (!perms.edit) {
        if (!perms.status) forbidden('You can only change tasks assigned to you');
        if (touched.some(k => k !== 'status')) forbidden('You can only change the status of tasks assigned to you');
    }
    if (patch.projectId !== undefined && patch.projectId !== task.projectId) {
        const target = projectById(patch.projectId);
        if (!target) badRequest('The selected project does not exist');
        if (!canManageProject(user, target)) forbidden('You cannot move tasks into a project you do not manage');
    }
    if (patch.assigneeId) assertValidAssignee(patch.assigneeId);

    const before = { ...task };
    for (const key of ['title', 'description', 'projectId', 'assigneeId', 'priority', 'status', 'dueDate']) if (patch[key] !== undefined) task[key] = patch[key];
    const statusChanged = patch.status !== undefined && patch.status !== before.status;
    if (statusChanged) task.completedAt = patch.status === 'Done' ? nowIso() : null;
    task.updatedAt = nowIso();

    if (statusChanged) {
        const message =
            patch.status === 'Done'
                ? `completed task ${label(task.title)}`
                : before.status === 'Done'
                  ? `reopened task ${label(task.title)} (${patch.status})`
                  : `moved task ${label(task.title)} from ${before.status} to ${patch.status}`;
        log(user, patch.status === 'Done' ? 'task.completed' : 'task.moved', 'task', id, task.projectId, message);
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId) {
        const message = patch.assigneeId ? `assigned task ${label(task.title)} to ${userById(patch.assigneeId).name}` : `unassigned task ${label(task.title)}`;
        log(user, 'task.assigned', 'task', id, task.projectId, message);
    }
    if (touched.some(k => !['status', 'assigneeId'].includes(k))) {
        log(user, 'task.updated', 'task', id, task.projectId, `updated task ${label(task.title)}`);
    }
    return ok(taskDetail(task, user));
});

route('DELETE', '/tasks/:id', ({ user, params }) => {
    const { id } = parse(params, { id: S.id });
    const task = taskById(id);
    if (!task) notFound('Task');
    if (!taskPermissions(user, task).delete) forbidden('Only an administrator or the project manager can delete this task');
    D().tasks = D().tasks.filter(t => t.id !== id);
    D().comments = D().comments.filter(c => c.taskId !== id);
    log(user, 'task.deleted', 'task', id, task.projectId, `deleted task ${label(task.title)}`);
    return { status: 204, data: null };
});

route('GET', '/tasks/:id/comments', ({ params }) => {
    const { id } = parse(params, { id: S.id });
    if (!taskById(id)) notFound('Task');
    return ok(D().comments.filter(c => c.taskId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id).map(commentView));
});

route('POST', '/tasks/:id/comments', ({ user, params, body }) => {
    const { id } = parse(params, { id: S.id });
    const input = parse(body, SCHEMAS.comment);
    const task = taskById(id);
    if (!task) notFound('Task');
    const comment = { id: nextId('comments'), taskId: id, userId: user.id, body: input.body, createdAt: nowIso() };
    D().comments.push(comment);
    log(user, 'comment.created', 'comment', comment.id, task.projectId, `commented on ${label(task.title)}`);
    return ok(commentView(comment), undefined, 201);
});

route('DELETE', '/comments/:id', ({ user, params }) => {
    const { id } = parse(params, { id: S.id });
    const comment = D().comments.find(c => c.id === id);
    if (!comment) notFound('Comment');
    if (user.role !== 'Admin' && comment.userId !== user.id) forbidden('You can only delete your own comments');
    D().comments = D().comments.filter(c => c.id !== id);
    return { status: 204, data: null };
});

// activity & stats
route('GET', '/activity', ({ query }) => {
    const q = parse(query, SCHEMAS.listActivity);
    const page = paginate(sortedActivity(q.projectId), q);
    return ok(page.items.map(activityView), page.meta);
});

const DAYS = 14;
const shiftDay = (base, offset) => {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
};

route('GET', '/stats/dashboard', ({ user }) => {
    const now = today();
    const tasks = D().tasks;
    const weekStart = `${shiftDay(now, -6)}T00:00:00.000Z`;
    const firstDay = shiftDay(now, -(DAYS - 1));
    const open = tasks.filter(t => t.status !== 'Done');
    const isOverdue = (t) => t.status !== 'Done' && t.dueDate && t.dueDate < now;
    const mine = tasks.filter(t => t.assigneeId === user.id);

    const tasksByStatus = { 'To do': 0, 'In progress': 0, Done: 0 };
    const openTasksByPriority = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
    for (const t of tasks) {
        tasksByStatus[t.status] += 1;
        if (t.status !== 'Done') openTasksByPriority[t.priority] += 1;
    }

    const activityOverTime = [];
    for (let i = 0; i < DAYS; i++) {
        const date = shiftDay(firstDay, i);
        activityOverTime.push({
            date,
            created: tasks.filter(t => t.createdAt.slice(0, 10) === date).length,
            completed: tasks.filter(t => t.completedAt && t.completedAt.slice(0, 10) === date).length
        });
    }

    const workload = D().users
        .filter(u => u.status === 'Active')
        .map(u => {
            const own = tasks.filter(t => t.assigneeId === u.id);
            return { userId: u.id, name: u.name, open: own.filter(t => t.status !== 'Done').length, done: own.filter(t => t.status === 'Done').length, overdue: own.filter(isOverdue).length, total: own.length };
        })
        .filter(w => w.total > 0)
        .sort((a, b) => b.open - a.open || b.done - a.done || byName(a.name, b.name))
        .slice(0, 8)
        .map(({ total, ...rest }) => rest);

    const projects = listProjects({ page: 1, pageSize: 8, sort: 'deadline' }, user).items;
    const myTasks = listTasks({ page: 1, pageSize: 6, mine: true, open: true, sort: 'due' }, user).items;

    return ok({
        kpis: {
            totalProjects: D().projects.length,
            activeProjects: D().projects.filter(p => p.status === 'Active').length,
            totalTasks: tasks.length,
            openTasks: open.length,
            doneTasks: tasks.length - open.length,
            overdueTasks: tasks.filter(isOverdue).length,
            completedThisWeek: tasks.filter(t => t.status === 'Done' && t.completedAt && t.completedAt >= weekStart).length,
            activeUsers: D().users.filter(u => u.status === 'Active').length,
            myOpenTasks: mine.filter(t => t.status !== 'Done').length,
            myOverdueTasks: mine.filter(isOverdue).length
        },
        tasksByStatus,
        openTasksByPriority,
        projectProgress: projects.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            progress: p.progress,
            taskCount: p.taskCount,
            doneCount: p.doneCount,
            overdueCount: p.overdueCount,
            endDate: p.endDate
        })),
        workload,
        activityOverTime,
        recentActivity: sortedActivity().slice(0, 8).map(activityView),
        myTasks
    });
});

// ---------- dispatcher ----------

// Tests can shorten the artificial latency with globalThis.__SEKCO_MOCK_LATENCY__
const LATENCY_MS = Number.isFinite(globalThis.__SEKCO_MOCK_LATENCY__) ? globalThis.__SEKCO_MOCK_LATENCY__ : 90;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

function authenticate(token) {
    const match = /^demo-token-(\d+)$/.exec(token || '');
    const user = match ? userById(Number(match[1])) : null;
    if (!user) fail(401, 'UNAUTHORIZED', token ? 'Invalid or expired token' : 'Authentication required');
    if (user.status !== 'Active') forbidden('This account is deactivated');
    return user;
}

/** Same signature as the HTTP transport: resolves with { data, meta } or throws ApiError. */
export async function mockRequest(method, path, { query = {}, body, token } = {}) {
    await store.ready();
    await sleep(LATENCY_MS);

    let match = null;
    for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.regex.exec(path);
        if (m) {
            match = { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
            break;
        }
    }
    if (!match) fail(404, 'NOT_FOUND', 'Endpoint not found');

    const user = match.route.public ? null : authenticate(token);
    if (match.route.roles && !match.route.roles.includes(user.role)) forbidden('Your role does not allow this action');

    // Work on a copy of the payload so callers cannot mutate stored data by accident
    const cleanQuery = {};
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') cleanQuery[k] = String(v);
    const result = await match.route.handler({ user, params: match.params, query: cleanQuery, body: clone(body) });
    store.save();
    return { data: clone(result.data) ?? null, ...(result.meta ? { meta: result.meta } : {}) };
}
