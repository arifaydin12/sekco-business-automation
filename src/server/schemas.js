'use strict';

const { z } = require('zod');

const ROLES = ['Admin', 'Manager', 'User'];
const USER_STATUSES = ['Active', 'Inactive'];
const PROJECT_STATUSES = ['Planning', 'Active', 'On hold', 'Completed'];
const TASK_STATUSES = ['To do', 'In progress', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

// ---------- building blocks ----------

const id = z.coerce
    .number({ error: () => 'A valid id is required' })
    .int('A valid id is required')
    .positive('A valid id is required');
const idParam = z.object({ id });

const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = (max) =>
    z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalDate = z.preprocess(emptyToNull, z.iso.date('Use the format YYYY-MM-DD').nullable().optional());
const optionalId = z.preprocess(emptyToNull, id.nullable().optional());

const password = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .refine(v => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain at least one letter and one number');

const email = z.string().trim().toLowerCase().max(190).pipe(z.email('Enter a valid email address'));

const pagination = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

const boolQuery = z.enum(['true', 'false']).transform(v => v === 'true');

const atLeastOne = (schema) =>
    schema.refine(obj => Object.values(obj).some(v => v !== undefined), 'Provide at least one field to update');

// ---------- auth ----------

const login = z.object({
    email: z.string().trim().toLowerCase().min(1, 'Email is required'),
    password: z.string().min(1, 'Password is required')
});

const changePassword = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password
});

const updateProfile = atLeastOne(
    z.object({
        name: z.string().trim().min(2).max(100).optional(),
        jobTitle: optionalText(100)
    })
);

// ---------- users ----------

const listUsers = z.object({
    ...pagination,
    q: z.string().trim().max(100).optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional()
});

const createUser = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email,
    password,
    role: z.enum(ROLES).default('User'),
    jobTitle: optionalText(100)
});

const updateUser = atLeastOne(
    z.object({
        name: z.string().trim().min(2).max(100).optional(),
        email: email.optional(),
        role: z.enum(ROLES).optional(),
        status: z.enum(USER_STATUSES).optional(),
        jobTitle: optionalText(100)
    })
);

const resetPassword = z.object({ password: password.optional() });

// ---------- projects ----------

const listProjects = z.object({
    ...pagination,
    q: z.string().trim().max(100).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    managerId: id.optional(),
    sort: z.enum(['newest', 'name', 'deadline', 'progress']).default('newest')
});

const dateOrder = (obj) => !obj.startDate || !obj.endDate || obj.endDate >= obj.startDate;
const dateOrderMessage = { message: 'End date must not be before the start date', path: ['endDate'] };

const projectFields = {
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    description: optionalText(5000),
    managerId: optionalId,
    status: z.enum(PROJECT_STATUSES),
    startDate: optionalDate,
    endDate: optionalDate
};

const createProject = z
    .object({ ...projectFields, status: projectFields.status.default('Planning') })
    .refine(dateOrder, dateOrderMessage);

const updateProject = atLeastOne(z.object(projectFields).partial()).refine(dateOrder, dateOrderMessage);

// ---------- tasks ----------

const listTasks = z.object({
    ...pagination,
    q: z.string().trim().max(100).optional(),
    projectId: id.optional(),
    assigneeId: id.optional(),
    mine: boolQuery.optional(),
    unassigned: boolQuery.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    overdue: boolQuery.optional(),
    open: boolQuery.optional(),
    sort: z.enum(['newest', 'due', 'priority', 'updated']).default('newest')
});

const taskFields = {
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(160),
    description: optionalText(5000),
    projectId: id,
    assigneeId: optionalId,
    priority: z.enum(PRIORITIES),
    status: z.enum(TASK_STATUSES),
    dueDate: optionalDate
};

const createTask = z.object({
    ...taskFields,
    priority: taskFields.priority.default('Medium'),
    status: taskFields.status.default('To do')
});

const updateTask = atLeastOne(z.object(taskFields).partial());

const createComment = z.object({ body: z.string().trim().min(1, 'Comment cannot be empty').max(2000) });

// ---------- activity ----------

const listActivity = z.object({ ...pagination, projectId: id.optional() });

module.exports = {
    ROLES,
    USER_STATUSES,
    PROJECT_STATUSES,
    TASK_STATUSES,
    PRIORITIES,
    idParam,
    login,
    changePassword,
    updateProfile,
    listUsers,
    createUser,
    updateUser,
    resetPassword,
    listProjects,
    createProject,
    updateProject,
    listTasks,
    createTask,
    updateTask,
    createComment,
    listActivity
};
