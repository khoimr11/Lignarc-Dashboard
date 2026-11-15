/* LF Command Center — public configuration (no secrets here). */
window.CC_CONFIG = {
  // Google Apps Script web-app URL (…/exec) of the task backend. Filled in after deploying command/backend/Code.gs.
  API_URL: '',
  // Encrypted data of the two source dashboards (same GitHub Pages origin → no CORS).
  SRC_GLOBAL: '../data/lignarc.enc.json',
  SRC_LOCAL: '/LF---B2C-Local/data/data.enc.json',
  DASH_GLOBAL: '../',
  DASH_LOCAL: '/LF---B2C-Local/',
  FX: 26300 // USD → VND for the combined view (editable in Cài đặt)
};
