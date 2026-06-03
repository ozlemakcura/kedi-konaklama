(() => {
  if (!location.pathname.endsWith('/note.html')) return;

  let db;
  const config = window.KEDI_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (v = '') => String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function client() {
    if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) return null;
    if (!db) db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return db;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function nowTime() {
    return new Date().toTimeString().slice(0, 5);
  }

  function addDays(dateText, days) {
    const date = new Date(`${dateText}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isActiveCat(cat) {
    const t = today();
    const activeStart = cat.checkin_date ? addDays(cat.checkin_date, -2) : '';
    const readyForPreparation = !cat.checkin_date || activeStart <= t;
    const notCheckedOut = !cat.checkout_date || cat.checkout_date > t;
    return readyForPreparation && notCheckedOut;
  }

  function fmtTime(value) {
    return String(value || '').slice(0, 5);
  }

  function toast(message, error = false) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.style.background = error ? '#be123c' : '#20183a';
    el.classList.add('show');
    clearTimeout(el._routineEmbedTimer);
    el._routineEmbedTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  let session = null;
  let cats = [];
  let templates = [];
  let logs = [];

  function catName(id) {
    return cats.find((cat) => cat.id === id)?.name || 'Kedi';
  }

  function ensureSection() {
    if ($('#routine-embed-card')) return;
    const layout = document.querySelector('.layout');
    if (!layout) return;

    const card = document.createElement('article');
    card.className = 'card';
    card.id = 'routine-embed-card';
    card.style.marginTop = '18px';
    card.innerHTML = `
      <div class="title">
        <h2 style="margin:0">Bugünün rutinleri</h2>
        <a class="btn soft" href="./routine.html"><i class="ti ti-settings"></i> Rutinleri düzenle</a>
      </div>
      <div class="divider"></div>
      <div id="embedded-routine-list" class="list"><div class="empty">Rutinler yükleniyor...</div></div>
    `;
    layout.insertAdjacentElement('afterend', card);
  }

  function renderRoutines() {
    ensureSection();
    const list = $('#embedded-routine-list');
    if (!list) return;

    const activeCats = cats.filter(isActiveCat);
    const todayLogs = logs.filter((log) => log.routine_date === today());
    const activeTemplates = templates
      .filter((template) => template.is_active !== false && activeCats.some((cat) => cat.id === template.cat_id))
      .sort((a, b) => `${a.routine_time}`.localeCompare(`${b.routine_time}`));

    if (!activeTemplates.length) {
      list.innerHTML = '<div class="empty">Bugün için rutin yok. Rutinleri düzenle sayfasından kediye rutin ekleyebilirsin.</div>';
      return;
    }

    list.innerHTML = activeTemplates.map((template) => {
      const log = todayLogs.find((item) => item.routine_template_id === template.id);
      const late = !log && fmtTime(template.routine_time) < nowTime();
      return `
        <article class="item ${log ? 'done' : late ? 'late' : ''}" style="${late ? 'border-color:#fecdd3;background:#fff1f2' : log ? 'border-color:#bbf7d0;background:#f0fdf4' : ''}">
          <div class="title">
            <div>
              <h3 style="margin:0">${esc(catName(template.cat_id))}</h3>
              <div class="small">${fmtTime(template.routine_time)} · ${esc(template.category || 'Rutin')}</div>
            </div>
            <div>${log ? '<span class="badge green">Yapıldı</span>' : late ? '<span class="badge red" style="background:#fee2e2;color:#be123c">Gecikti</span>' : '<span class="badge blue">Bekliyor</span>'}</div>
          </div>
          <div class="divider"></div>
          <strong>${esc(template.title)}</strong>
          <div class="small">${template.show_to_owner ? 'Sahibe gösterilir' : 'Sadece admin'}</div>
          <div class="buttons" style="margin-top:12px">
            ${log ? `<button class="btn soft" data-routine-undo="${log.id}">Geri al</button>` : `<button class="btn green" data-routine-done="${template.id}" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0">Yapıldı</button>`}
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadRoutines() {
    ensureSection();
    const api = client();
    if (!api) return;

    const sessionResult = await api.auth.getSession();
    session = sessionResult.data?.session;
    if (!session) return;

    const [catsRes, templatesRes, logsRes] = await Promise.all([
      api.from('cats').select('id,name,owner_name,checkin_date,checkout_date').order('created_at', { ascending: false }),
      api.from('routine_templates').select('*').order('routine_time', { ascending: true }),
      api.from('routine_logs').select('*').eq('routine_date', today()).order('completed_at', { ascending: false })
    ]);

    if (catsRes.error || templatesRes.error || logsRes.error) {
      const error = catsRes.error || templatesRes.error || logsRes.error;
      $('#embedded-routine-list').innerHTML = `<div class="empty">Rutinler yüklenemedi: ${esc(error.message || '')}</div>`;
      return;
    }

    cats = catsRes.data || [];
    templates = templatesRes.data || [];
    logs = logsRes.data || [];
    renderRoutines();
  }

  document.addEventListener('click', async (event) => {
    const done = event.target.closest('[data-routine-done]');
    const undo = event.target.closest('[data-routine-undo]');
    const api = client();
    if (!api) return;

    if (done) {
      const template = templates.find((item) => item.id === done.dataset.routineDone);
      if (!template || !session?.user?.id) return;
      const result = await api.from('routine_logs').insert({
        user_id: session.user.id,
        cat_id: template.cat_id,
        routine_template_id: template.id,
        routine_date: today(),
        title: template.title,
        routine_time: template.routine_time,
        category: template.category,
        show_to_owner: template.show_to_owner
      });
      if (result.error) {
        toast(result.error.message || 'Rutin kaydedilemedi.', true);
        return;
      }
      toast('Rutin yapıldı olarak kaydedildi.');
      await loadRoutines();
    }

    if (undo) {
      const result = await api.from('routine_logs').delete().eq('id', undo.dataset.routineUndo);
      if (result.error) {
        toast(result.error.message || 'Rutin geri alınamadı.', true);
        return;
      }
      toast('Rutin geri alındı.');
      await loadRoutines();
    }
  });

  const start = () => {
    ensureSection();
    setTimeout(loadRoutines, 700);
    setTimeout(loadRoutines, 1600);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
