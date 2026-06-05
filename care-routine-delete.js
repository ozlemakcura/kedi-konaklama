(() => {
  if (!location.pathname.endsWith('/care.html')) return;

  let db;
  const cfg = window.KEDI_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);

  function api() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    if (!db) db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return db;
  }

  function toast(message, error = false) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = message;
    t.style.background = error ? '#be123c' : '#20183a';
    t.classList.add('show');
    clearTimeout(t._routineDeleteTimer);
    t._routineDeleteTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function addDeleteButtons() {
    document.querySelectorAll('[data-edit-routine]').forEach((editButton) => {
      const box = editButton.parentElement;
      const id = editButton.dataset.editRoutine;
      if (!box || !id || box.querySelector(`[data-delete-routine="${id}"]`)) return;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn danger';
      del.dataset.deleteRoutine = id;
      del.textContent = 'Sil';
      box.appendChild(del);
    });
  }

  async function deleteRoutine(id) {
    if (!window.confirm