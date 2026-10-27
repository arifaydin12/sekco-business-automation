// Minimal hash router: "#/projects/3?tab=tasks" -> { path: '/projects/3', query: { tab: 'tasks' } }.
// Hash routing keeps the app working from any static host or sub-path (e.g. GitHub Pages).

let routes = [];
let handler = null;

export function defineRoutes(list) {
    routes = list.map(r => {
        const keys = [];
        const regex = new RegExp(`^${r.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
        return { ...r, keys, regex };
    });
}

export function parseHash(hash = window.location.hash) {
    const raw = hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart = ''] = raw.split('?');
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    return { path: path.length > 1 ? path.replace(/\/+$/, '') : path, query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

export function match(location = parseHash()) {
    for (const route of routes) {
        const m = route.regex.exec(location.path);
        if (m) {
            const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
            return { route, params, ...location };
        }
    }
    return { route: routes.find(r => r.notFound), params: {}, ...location };
}

export function buildHash(path, query = {}) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
    return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path, query, { replace = false } = {}) {
    const hash = buildHash(path, query);
    if (replace) {
        history.replaceState(null, '', hash);
        handler && handler(match());
    } else if (window.location.hash === hash) {
        handler && handler(match());
    } else {
        window.location.hash = hash;
    }
}

/** Updates the query string in the address bar without re-rendering the current view. */
export function updateQuery(patch) {
    const { path, query } = parseHash();
    const next = { ...query, ...patch };
    history.replaceState(null, '', buildHash(path, next));
    return next;
}

export function startRouter(onRoute) {
    handler = onRoute;
    window.addEventListener('hashchange', () => handler(match()));
    handler(match());
}
