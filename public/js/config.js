// Runtime configuration. The demo build (npm run build:demo) overwrites ../config.js with demo: true.
export const config = Object.assign({ demo: false, apiBase: 'api' }, window.SEKCO_CONFIG || {});
