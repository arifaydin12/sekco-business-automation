// Data layer. The UI only talks to `api`; the transport is either the real HTTP API or the
// in-browser mock API (demo mode), selected once at start-up.
import { config } from '../config.js';
import { httpRequest } from './http.js';

const TOKEN_KEY = 'sekco.token';

export const session = {
    get token() {
        return localStorage.getItem(TOKEN_KEY);
    },
    set token(value) {
        if (value) localStorage.setItem(TOKEN_KEY, value);
        else localStorage.removeItem(TOKEN_KEY);
    }
};

let transport = httpRequest;
let mock = null;

/** Must be awaited once before any request (loads the mock backend in demo mode). */
export async function initApi() {
    if (config.demo) {
        mock = await import('./mock-api.js');
        await mock.ready();
        transport = mock.mockRequest;
    }
    return { demo: config.demo };
}

export const resetDemoData = async () => {
    if (!mock) return;
    await mock.resetData();
    session.token = null;
};

async function request(method, path, options = {}) {
    try {
        return await transport(method, path, { ...options, token: session.token });
    } catch (error) {
        if (error.status === 401 && !path.startsWith('/auth/login')) {
            session.token = null;
            window.dispatchEvent(new CustomEvent('sekco:unauthorized'));
        }
        throw error;
    }
}

const get = (path, query) => request('GET', path, { query });
const post = (path, body = {}) => request('POST', path, { body });
const patch = (path, body) => request('PATCH', path, { body });
const del = (path) => request('DELETE', path);

export const api = {
    login: (email, password) => post('/auth/login', { email, password }),
    me: () => get('/auth/me'),
    updateProfile: (body) => patch('/auth/me', body),
    changePassword: (body) => post('/auth/change-password', body),

    users: {
        list: (query) => get('/users', query),
        directory: () => get('/users/directory'),
        create: (body) => post('/users', body),
        update: (id, body) => patch(`/users/${id}`, body),
        deactivate: (id) => post(`/users/${id}/deactivate`),
        activate: (id) => post(`/users/${id}/activate`),
        resetPassword: (id, body = {}) => post(`/users/${id}/reset-password`, body)
    },

    projects: {
        list: (query) => get('/projects', query),
        get: (id) => get(`/projects/${id}`),
        create: (body) => post('/projects', body),
        update: (id, body) => patch(`/projects/${id}`, body),
        remove: (id) => del(`/projects/${id}`),
        activity: (id, query) => get(`/projects/${id}/activity`, query)
    },

    tasks: {
        list: (query) => get('/tasks', query),
        get: (id) => get(`/tasks/${id}`),
        create: (body) => post('/tasks', body),
        update: (id, body) => patch(`/tasks/${id}`, body),
        remove: (id) => del(`/tasks/${id}`),
        addComment: (id, body) => post(`/tasks/${id}/comments`, { body })
    },

    deleteComment: (id) => del(`/comments/${id}`),
    activity: (query) => get('/activity', query),
    dashboard: () => get('/stats/dashboard')
};
