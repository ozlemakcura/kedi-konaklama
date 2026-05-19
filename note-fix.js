(() => {
  if (!location.pathname.endsWith('/note.html')) return;

  let db;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const config = window.KEDI_APP_CONFIG || {};

  function client() {
    if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) return null;
    if (!db) db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return db;
  }

  function toast(message, error = false) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.style.background = error ? '#be123c' : '#20183a';
    el.classList.add('show');
    clearTimeout(el._noteFixTimer);
    el._noteFixTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function readFlags() {
    const flags = {};
    $$('[data-flag]').forEach((input) => {
      flags[input.dataset.flag] = !!input.checked;
    });
    return flags;
  }

  async function saveNote(event) {
    event.preventDefault();
    event.stopPropagation();

    const api = client();
    const button = $('#save-note');
    const catId = $('#note-cat')?.value || '';
    const noteDate = $('#note-date')?.value || today();

    if (!api) {
      toast('Bağlantı hazırlanamadı.', true);
      return;
    }
    if (!catId) {
      toast('Önce kedi seçin.', true);
      $('#note-cat')?.focus();
      return;
    }

    const sessionResult = await api.auth.getSession();
    const userId = sessionResult.data?.session?.user?.id || '';
    if (!userId) {
      toast('Oturum bulunamadı. Ana panele dönüp tekrar giriş yapın.', true);
      return;
    }

    const editingId = window.__editingDailyNoteId || '';
    const payload = {
      user_id: userId,
      cat_id: catId,
      note_date: noteDate,
      mood: $('#note-mood')?.value.trim() || null,
      appetite: $('#note-appetite')?.value.trim() || null,
      photo_url: $('#note-photo-url')?.value.trim() || null,
      body: $('#note-body')?.value.trim() || null,
      flags: readFlags()
    };

    if (button) {
      button.disabled = true;
      button.dataset.oldLabel = button.innerHTML;
      button.innerHTML = '<i class="ti ti-loader"></i> Kaydediliyor';
    }

    try {
      const result = editingId
        ? await api.from('daily_notes').update(payload).eq('id', editingId).select().single()
        : await api.from('daily_notes').insert(payload).select().single();

      if (result.error) throw result.error;
      toast(editingId ? 'Not güncellendi.' : 'Günlük not kaydedildi.');
      setTimeout(() => location.reload(), 650);
    } catch (error) {
      toast(error?.message || 'Not kaydedilemedi.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = button.dataset.oldLabel || '<i class="ti ti-device-floppy"></i> Notu kaydet';
      }
    }
  }

  function syncEditState() {
    document.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-note]');
      if (!edit) return;
      window.__editingDailyNoteId = edit.dataset.editNote || '';
    }, true);

    $('#cancel-edit')?.addEventListener('click', () => {
      window.__editingDailyNoteId = '';
    });
  }

  function start() {
    const button = $('#save-note');
    if (!button || button.dataset.noteFixReady === '1') return;
    button.dataset.noteFixReady = '1';
    button.addEventListener('click', saveNote, true);
    $('#note-form')?.addEventListener('submit', saveNote, true);
    syncEditState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
