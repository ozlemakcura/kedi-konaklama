(() => {
  if (!location.pathname.endsWith('/care.html')) return;

  let db;
  let session;
  let notes = [];
  let editingNoteId = '';
  let lastCatId = '';

  const cfg = window.KEDI_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const FLAG_LABELS = [
    ['food', '🍽️ Mama yedi'],
    ['water', '💧 Su içti'],
    ['toilet', '✨ Tuvalet normal'],
    ['play', '🎾 Oyun / aktif'],
    ['medicine', '💊 İlaç verildi'],
    ['care', '✂️ Bakım yapıldı']
  ];

  function client() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    if (!db) db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return db;
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function fmtDate(value) { return value ? new Date(value + (String(value).includes('T') ? '' : 'T12:00:00')).toLocaleDateString('tr-TR') : '—'; }
  function fmtTime(value) { return value ? new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'; }

  function flagBadges(flags = {}) {
    const active = FLAG_LABELS.filter(([key]) => !!flags?.[key]);
    return active.length ? `<div class="divider"></div><div class="title">${active.map(([, label]) => `<span class="badge green">${esc(label)}</span>`).join('')}</div>` : '';
  }

  function toast(message, error = false) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = message;
    t.style.background = error ? '#be123c' : '#20183a';
    t.classList.add('show');
    clearTimeout(t._careNoteTimer);
    t._careNoteTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function selectedCatId() { return $('#cat-select')?.value || ''; }

  function readFlags() {
    const out = {};
    $$('[data-flag]').forEach((input) => { out[input.dataset.flag] = !!input.checked; });
    return out;
  }

  function applyFlags(flags = {}) {
    $$('[data-flag]').forEach((input) => { input.checked = !!flags[input.dataset.flag]; });
  }

  function ensureCancelButton() {
    if ($('#cancel-note-edit')) { $('#cancel-note-edit').hidden = false; return; }
    const submit = $('#note-form button[type="submit"]');
    if (!submit) return;
    const cancel = document.createElement('button');
    cancel.className = 'btn soft';
    cancel.type = 'button';
    cancel.id = 'cancel-note-edit';
    cancel.textContent = 'Düzenlemeyi bırak';
    cancel.style.marginLeft = '10px';
    cancel.onclick = clearEditMode;
    submit.insertAdjacentElement('afterend', cancel);
  }

  function setNoteForm(note) {
    editingNoteId = note.id;
    $('#note-date').value = note.note_date || today();
    $('#note-mood').value = note.mood || '';
    $('#note-appetite').value = note.appetite || '';
    $('#note-photo-url').value = note.photo_url || '';
    $('#note-body').value = note.body || '';
    applyFlags(note.flags || {});
    const button = $('#note-form button[type="submit"]');
    if (button) button.innerHTML = '<i class="ti ti-device-floppy"></i> Günlük notu güncelle';
    ensureCancelButton();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearEditMode() {
    editingNoteId = '';
    $('#note-form')?.reset();
    if ($('#note-date')) $('#note-date').value = today();
    applyFlags({});
    const button = $('#note-form button[type="submit"]');
    if (button) button.innerHTML = '<i class="ti ti-device-floppy"></i> Günlük notu kaydet';
    const cancel = $('#cancel-note-edit');
    if (cancel) cancel.hidden = true;
  }

  function ensureHeader(count) {
    const container = $('#recent-notes');
    const card = container?.closest('.card');
    const h2 = card?.querySelector('h2');
    if (h2) h2.textContent = `Tüm notlar (${count})`;
  }

  function renderNotes() {
    const container = $('#recent-notes');
    if (!container) return;
    const catId = selectedCatId();
    const list = notes.filter((note) => note.cat_id === catId);
    ensureHeader(list.length);
    container.innerHTML = list.length ? list.map((note) => `
      <article class="item">
        <div class="title"><strong>${fmtDate(note.note_date)}</strong><span class="badge blue">${fmtTime(note.created_at)}</span></div>
        ${note.mood || note.appetite ? `<div class="divider"></div><div class="title">${note.mood ? `<span class="badge">${esc(note.mood)}</span>` : ''}${note.appetite ? `<span class="badge amber">${esc(note.appetite)}</span>` : ''}</div>` : ''}
        ${flagBadges(note.flags)}
        ${note.body ? `<div class="divider"></div><div class="note">${esc(note.body)}</div>` : ''}
        ${note.photo_url ? `<div class="divider"></div><a href="${esc(note.photo_url)}" target="_blank" rel="noreferrer">Fotoğrafı aç</a>` : ''}
        <div class="divider"></div>
        <div class="buttons">
          <button class="btn soft" type="button" data-edit-daily-note="${note.id}">Düzenle</button>
          <button class="btn danger" type="button" data-delete-daily-note="${note.id}">Sil</button>
        </div>
      </article>
    `).join('') : '<div class="empty">Bu kedi için henüz not yok.</div>';
  }

  async function loadNotes() {
    const api = client();
    if (!api) return;
    const catId = selectedCatId();
    if (!catId) { notes = []; renderNotes(); return; }
    const sessionResult = await api.auth.getSession();
    session = sessionResult.data?.session;
    if (!session) return;
    const { data, error } = await api
      .from('daily_notes')
      .select('*')
      .eq('cat_id', catId)
      .order('note_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, 4999);
    if (error) return;
    notes = data || [];
    renderNotes();
  }

  async function saveNote(event) {
    if (!editingNoteId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const api = client();
    const catId = selectedCatId();
    if (!api || !session?.user?.id || !catId) return;
    const payload = {
      user_id: session.user.id,
      cat_id: catId,
      note_date: $('#note-date')?.value || today(),
      mood: $('#note-mood')?.value.trim() || null,
      appetite: $('#note-appetite')?.value.trim() || null,
      photo_url: $('#note-photo-url')?.value.trim() || null,
      body: $('#note-body')?.value.trim() || null,
      flags: readFlags()
    };
    const result = await api.from('daily_notes').update(payload).eq('id', editingNoteId).select().single();
    if (result.error) { toast(result.error.message || 'Not güncellenemedi.', true); return; }
    toast('Günlük not güncellendi.');
    clearEditMode();
    await loadNotes();
  }

  async function deleteNote(id) {
    const ok = window.confirm('Bu günlük not silinsin mi?');
    if (!ok) return;
    const api = client();
    if (!api) return;
    const result = await api.from('daily_notes').delete().eq('id', id);
    if (result.error) { toast(result.error.message || 'Not silinemedi.', true); return; }
    toast('Günlük not silindi.');
    if (editingNoteId === id) clearEditMode();
    await loadNotes();
  }

  function start() {
    $('#note-form')?.addEventListener('submit', saveNote, true);
    document.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-daily-note]');
      if (edit) {
        const note = notes.find((item) => item.id === edit.dataset.editDailyNote);
        if (note) setNoteForm(note);
        return;
      }
      const del = event.target.closest('[data-delete-daily-note]');
      if (del) deleteNote(del.dataset.deleteDailyNote);
    }, true);
    $('#cat-select')?.addEventListener('change', () => { clearEditMode(); setTimeout(loadNotes, 300); });
    setInterval(() => { const catId = selectedCatId(); if (catId && catId !== lastCatId) { lastCatId = catId; clearEditMode(); loadNotes(); } }, 900);
    setTimeout(loadNotes, 900);
    setTimeout(loadNotes, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
