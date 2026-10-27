// Small shared application state: the signed-in user and the colour theme.

export const state = {
    user: null,
    demo: false
};

const THEME_KEY = 'sekco.theme';
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const theme = {
    /** 'light' | 'dark' | 'system' */
    get mode() {
        const stored = localStorage.getItem(THEME_KEY);
        return stored === 'light' || stored === 'dark' ? stored : 'system';
    },
    get resolved() {
        const mode = this.mode;
        if (mode === 'system') return media && media.matches ? 'dark' : 'light';
        return mode;
    },
    set(mode) {
        if (mode === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, mode);
        this.apply();
    },
    toggle() {
        this.set(this.resolved === 'dark' ? 'light' : 'dark');
    },
    apply() {
        document.documentElement.setAttribute('data-theme', this.resolved);
        window.dispatchEvent(new CustomEvent('sekco:theme'));
    }
};

if (media && media.addEventListener) {
    media.addEventListener('change', () => {
        if (theme.mode === 'system') theme.apply();
    });
}

export const isAdmin = () => state.user && state.user.role === 'Admin';
export const canCreateProjects = () => state.user && (state.user.role === 'Admin' || state.user.role === 'Manager');
