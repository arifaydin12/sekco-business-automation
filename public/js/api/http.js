import { config } from '../config.js';
import { ApiError } from './errors.js';

/** Real HTTP implementation of the API transport (talks to the Express server). */
export async function httpRequest(method, path, { query, body, token } = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
        if (value !== undefined && value !== null && value !== '') params.set(key, value);
    }
    const qs = params.toString();
    const url = `${config.apiBase}${path}${qs ? `?${qs}` : ''}`;

    let response;
    try {
        response = await fetch(url, {
            method,
            headers: {
                Accept: 'application/json',
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch {
        throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
    }

    if (response.status === 204) return { data: null };
    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // non-JSON response
    }
    if (!response.ok) {
        const error = (payload && payload.error) || {};
        throw new ApiError(response.status, error.code || 'HTTP_ERROR', error.message || `Request failed (${response.status})`, error.details);
    }
    return payload || { data: null };
}
