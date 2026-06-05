(() => {
  if (!location.pathname.endsWith('/care.html')) return;

  let db;
  const cfg = window.KEDI_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);

  function client() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    if (!db) db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return db;
  }

  function toast(message, error = false) {
    const t = $('#toast');
    if (!t) return;
    t.textContent