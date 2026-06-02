(() => {
  if (!location.pathname.endsWith('/note.html')) return;

  let db;
  let activeCatFilterApplied = false;
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

  function isCurrentCat(cat) {
    return !cat.checkout_date || cat.checkout_date >= today();
  }

  function escapeHtml(value = '') {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async function showOnlyCurrentCats() {
    const select = $('#note-cat');
    const api = client();
    if (!select || !api) return;

    const { data, error } = await api
      .from('cats')
      .select('id,name,owner_name,checkout_date')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return;

    const currentCats = data.filter(isCurrentCat);
    const hiddenCount = data.length - currentCats.length;
    const selected = select.value;

    select.innerHTML = '<option value="">Güncel kedi seçin</option>' + currentCats.map((cat) => (
      `<option value="${cat.id}">${escapeHtml(cat.name)}${cat.owner_name ? ` — ${escapeHtml(cat.owner_name)}` : ''}</option>`
    )).join('');

    if (currentCats.some((cat) => cat.id === selected)) {
      select.value = selected;
    }

    const status = $('#status');
    if (status && !activeCatFilterApplied) {
      const suffix = hiddenCount > 0 ? ` Ayrılan ${hiddenCount} kedi not ekleme listesinden gizlendi.` : '';
      status.textContent = `Hazır.${suffix}`;
    }
    activeCatFilterApplied = true;
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
      toast('Önce güncel bir kedi seçin.', true);
      $('#note-cat')?.focus();
      return;
    }

    const sessionResult = await api.auth.getSession();
    const userId = sessionResult.data?.session?.user?.id || '';
    if (!userId) {
      toast('Oturum bulunamadı. Ana panele dönüp tekrar giriş yapın.', true);
      return;
    }

    const { data: selectedCat, error: catError } = await api
      .from('cats')
      .select('id,checkout_date')
      .eq('id', catId)
      .maybeSingle();

    if (catError || !selectedCat) {
      toast('Kedi kaydı bulunamadı.', true);
      return;
    }
    if (!isCurrentCat(selectedCat)) {
      toast('Bu kedi ayrılmış görünüyor. Yeni günlük not yalnızca güncel kedilere eklenebilir.', true);
      await showOnlyCurrentCats();
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
      setTimeout(showOnlyCurrentCats, 100);
    });
  }

  function start() {
    const button = $('#save-note');
    if (!button || button.dataset.noteFixReady === '1') return;
    button.dataset.noteFixReady = '1';
    button.addEventListener('click', saveNote, true);
    $('#note-form')?.addEventListener('submit', saveNote, true);
    syncEditState();

    setTimeout(showOnlyCurrentCats, 400);
    setTimeout(showOnlyCurrentCats, 1200);
    new MutationObserver(() => {
      if ($('#note-cat') && !$('#note-cat').dataset.activeCatsFiltered) {
        $('#note-cat').dataset.activeCatsFiltered = '1';
        setTimeout(showOnlyCurrentCats, 80);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
