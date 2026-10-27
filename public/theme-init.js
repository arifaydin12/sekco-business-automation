// Applies the saved colour theme before the first paint to avoid a flash of the wrong theme.
(function () {
    try {
        var stored = localStorage.getItem('sekco.theme');
        var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } catch (e) {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();
