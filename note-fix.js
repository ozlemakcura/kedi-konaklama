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

  function isActiveCat(cat) {
    const t = today();
    const alreadyArrived = !cat.checkin_date || cat.checkin_date <= t;
    const notCheckedOut = !cat.checkout_date || cat.checkout_date > t;
    return alreadyArrived && notCheckedOut;
  }

  function escapeHtml(value = '') {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async function showOnlyActiveCats() {
    const select = $('#note-cat');
    const api = client();
    if (!select || !api) return;

    const { data, error } = await api
      .from('cats')
      .select('id,name,owner_name,checkin_date,checkout_date')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return;

    const activeCats = data.filter(isActiveCat);
    const hiddenCount = data.length - activeCats.length;
    const selected = select.value;

    select.innerHTML = '<option value="">Aktif kedi seçin</option>' + activeCats.map((cat) => (
      `<option value="${cat.id}">${escapeHtml(cat.name)}${cat.owner_name ? ` — ${escapeHtml(cat.owner_name)}` : ''}</option>`
    )).join('');

    if (activeCats.some((cat) => cat.id === selected)) {
      select.value = selected;
    }

    const status = $('#status');
    if (status && !activeCatFilterApplied) {
      const suffix = hiddenCount > 0 ? ` Aktif olmayan ${hiddenCount} kedi not ekleme listesinden gizlendi.` : '';
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
      toast('Önce aktif bir kedi seçin.', true);
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
      .select('id,checkin_date,checkout_date')
      .eq('id', catId)
      .maybeSingle();

    if (catError || !selectedCat) {
      toast('Kedi kaydı bulunamadı.', true);
      return;
    }
    if (!isActiveCat(selectedCat)) {
      toast('Bu kedi şu an aktif konaklamada görünmüyor. Yeni günlük not yalnızca aktif kedilere eklenebilir.', true);
      await showOnlyActiveCats();
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
      setTimeout(showOnlyActiveCats, 100);
    });
  }

  function start() {
    const button = $('#save-note');
    if (!button || button.dataset.noteFixReady === '1') return;
    button.dataset.noteFixReady = '1';
    button.addEventListener('click', saveNote, true);
    $('#note-form')?.addEventListener('submit', saveNote, true);
    syncEditState();

    setTimeout(showOnlyActiveCats, 400);
    setTimeout(showOnlyActiveCats, 1200);
    new MutationObserver(() => {
      if ($('#note-cat') && !$('#note-cat').dataset.activeCatsFiltered) {
        $('#note-cat').dataset.activeCatsFiltered = '1';
        setTimeout(showOnlyActiveCats, 80);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
