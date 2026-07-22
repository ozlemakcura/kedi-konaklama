(() => {
  const path = location.pathname;
  const isAdminPage = path.endsWith('/index.html') || path.endsWith('/kedi-konaklama/') || path === '/';
  if (!isAdminPage) return;

  const cfg = window.KEDI_APP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const today = () => new Date().toISOString().slice(0, 10);
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const esc = (value = '') => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const fmtTime = (value) => String(value || '').slice(0, 5);
  const fmtDateTime = (value) => value
    ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  let opening = false;
  let observerBusy = false;
  let autoOpened = false;

  function isInteraction(message) {
    return /^\[\[care:[^\]]+\]\]\[\[(reaction|reply)/.test(String(message || ''));
  }

  function isAdminReply(message) {
    return /^\[\[admin-reply:[^\]]+\]\]/.test(String(message || ''));
  }

  function parseInteraction(note) {
    const match = String(note?.message || '').match(/^\[\[care:([^\]]+)\]\]\[\[(reaction|reply)(?::([^\]]+))?\]\]([\s\S]*)$/);
    if (!match) return null;
    return {
      ...note,
      type: match[2],
      reaction: match[3] || '',
      text: String(match[4] || '').trim(),
    };
  }

  function isActive(cat, date) {
    return (!cat.checkin_date || cat.checkin_date <= date) && (!cat.checkout_date || cat.checkout_date >= date);
  }

  function injectStyles() {
    if (document.querySelector('#today-dashboard-styles')) return;
    const style = document.createElement('style');
    style.id = 'today-dashboard-styles';
    style.textContent = `
      .today-dashboard{display:grid;gap:18px}
      .today-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
      .today-metric{border:1px solid var(--line,#e8defc);background:#fff;border-radius:16px;padding:16px}
      .today-metric strong{display:block;font-size:30px;line-height:1.1;color:var(--purple,#6d28d9)}
      .today-metric span{color:var(--muted,#6b6480);font-size:13px}
      .today-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}
      .today-cat-list{display:grid;gap:12px}
      .today-cat{border:1px solid var(--line,#e8defc);border-radius:16px;padding:15px;background:#fff}
      .today-cat-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .today-cat-name{display:flex;gap:11px;align-items:center}
      .today-avatar{width:48px;height:48px;border-radius:14px;object-fit:cover;background:#f5f3ff;display:grid;place-items:center;font-size:25px;border:1px solid var(--line,#e8defc)}
      .today-progress{height:9px;border-radius:999px;background:#ede9fe;overflow:hidden;margin:12px 0 8px}
      .today-progress > span{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#db2777);border-radius:inherit}
      .today-status-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
      .today-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800;background:#f5f3ff;color:#6d28d9}
      .today-chip.ok{background:#f0fdf4;color:#15803d}.today-chip.warn{background:#fff7ed;color:#b45309}.today-chip.danger{background:#fff1f2;color:#be123c}.today-chip.blue{background:#eff6ff;color:#2563eb}
      .today-list{display:grid;gap:9px}
      .today-row{border:1px solid var(--line,#e8defc);border-radius:14px;padding:12px;background:#fff}
      .today-row-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .today-empty{border:1px dashed #d8b4fe;border-radius:14px;padding:20px;text-align:center;color:var(--muted,#6b6480);background:#fcfaff}
      .today-refresh{border:1px solid var(--line,#e8defc);background:#fff;border-radius:12px;padding:9px 12px;cursor:pointer;font-weight:800;color:var(--text,#20183a)}
      @media(max-width:900px){.today-summary{grid-template-columns:1fr 1fr}.today-grid{grid-template-columns:1fr}}
      @media(max-width:560px){.today-summary{grid-template-columns:1fr}.today-cat-head{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function ensureNav() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-today-dashboard]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.todayDashboard = '1';
    button.innerHTML = '<i class="ti ti-sun"></i> Bugün';
    nav.prepend(button);
  }

  async function fetchData() {
    const date = today();
    const [catsRes, notesRes, templatesRes, logsRes, ownerNotesRes] = await Promise.all([
      client.from('cats').select('id,name,owner_name,photo_url,checkin_date,checkout_date,public_token').order('name'),
      client.from('daily_notes').select('id,cat_id,note_date,created_at').eq('note_date', date),
      client.from('routine_templates').select('id,cat_id,title,routine_time,category,is_active').eq('is_active', true).order('routine_time'),
      client.from('routine_logs').select('id,cat_id,routine_template_id,routine_date,completed_at').eq('routine_date', date),
      client.from('owner_notes').select('id,cat_id,owner_name,message,created_at').gte('created_at', `${date}T00:00:00`).order('created_at', { ascending: false }),
    ]);

    const firstError = [catsRes, notesRes, templatesRes, logsRes, ownerNotesRes].find((result) => result.error)?.error;
    if (firstError) throw firstError;
    return {
      cats: catsRes.data || [],
      notes: notesRes.data || [],
      templates: templatesRes.data || [],
      logs: logsRes.data || [],
      ownerNotes: ownerNotesRes.data || [],
    };
  }

  function catCard(cat, data) {
    const noteDone = data.notes.some((note) => note.cat_id === cat.id);
    const templates = data.templates.filter((item) => item.cat_id === cat.id);
    const completed = templates.filter((item) => data.logs.some((log) => log.routine_template_id === item.id)).length;
    const totalSteps = 1 + templates.length;
    const doneSteps = (noteDone ? 1 : 0) + completed;
    const percent = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
    const missingRoutines = templates.length - completed;
    const photo = cat.photo_url
      ? `<img class="today-avatar" src="${esc(cat.photo_url)}" alt="">`
      : '<div class="today-avatar">🐱</div>';

    return `
      <article class="today-cat">
        <div class="today-cat-head">
          <div class="today-cat-name">${photo}<div><strong>${esc(cat.name)}</strong><div class="small-muted">${esc(cat.owner_name || 'Sahip bilgisi yok')}</div></div></div>
          <a class="btn small primary" href="./care.html?id=${encodeURIComponent(cat.id)}"><i class="ti ti-heart-handshake"></i> Bakım ekranı</a>
        </div>
        <div class="today-progress"><span style="width:${percent}%"></span></div>
        <div class="today-status-row">
          <span class="today-chip ${noteDone ? 'ok' : 'warn'}">${noteDone ? '✓ Günlük not girildi' : 'Günlük not bekliyor'}</span>
          <span class="today-chip ${missingRoutines ? 'blue' : 'ok'}">${templates.length ? `${completed}/${templates.length} rutin` : 'Rutin tanımlı değil'}</span>
          <span class="today-chip">%${percent} tamamlandı</span>
        </div>
      </article>
    `;
  }

  function pendingRoutineRows(activeCats, data) {
    const catMap = new Map(activeCats.map((cat) => [cat.id, cat]));
    const pending = data.templates
      .filter((item) => catMap.has(item.cat_id))
      .filter((item) => !data.logs.some((log) => log.routine_template_id === item.id))
      .sort((a, b) => String(a.routine_time).localeCompare(String(b.routine_time)));

    if (!pending.length) return '<div class="today-empty">Bugünün bütün rutinleri tamamlandı 🎉</div>';
    return pending.map((item) => {
      const cat = catMap.get(item.cat_id);
      const late = fmtTime(item.routine_time) < nowTime();
      return `<div class="today-row"><div class="today-row-head"><div><strong>${fmtTime(item.routine_time)} · ${esc(item.title)}</strong><div class="small-muted">${esc(cat?.name || 'Kedi')} · ${esc(item.category || 'Rutin')}</div></div><span class="today-chip ${late ? 'danger' : 'blue'}">${late ? 'Gecikti' : 'Bekliyor'}</span></div></div>`;
    }).join('');
  }

  function ownerInteractionRows(data) {
    const catMap = new Map(data.cats.map((cat) => [cat.id, cat.name]));
    const rows = data.ownerNotes
      .filter((note) => isInteraction(note.message) && !isAdminReply(note.message))
      .map(parseInteraction)
      .filter(Boolean);
    if (!rows.length) return '<div class="today-empty">Bugün yeni sahip tepkisi veya yanıtı yok.</div>';
    const emoji = { heart: '❤️', love: '😍', aww: '🥹', like: '👍' };
    return rows.map((item) => `<div class="today-row"><div class="today-row-head"><div><strong>${esc(catMap.get(item.cat_id) || 'Kedi')} · ${esc(item.owner_name || 'Sahip')}</strong><div class="small-muted">${item.type === 'reaction' ? `${emoji[item.reaction] || '💬'} tepki verdi` : esc(item.text || 'Yanıt verdi')}</div></div><span class="today-chip">${esc(fmtDateTime(item.created_at))}</span></div></div>`).join('');
  }

  async function openDashboard() {
    if (opening) return;
    const content = document.querySelector('.content');
    if (!content) return;
    opening = true;
    try {
      document.querySelectorAll('.nav button').forEach((button) => button.classList.remove('active'));
      document.querySelector('[data-today-dashboard]')?.classList.add('active');
      content.innerHTML = '<section class="panel"><div class="empty">Bugün hazırlanıyor...</div></section>';
      const data = await fetchData();
      const date = today();
      const activeCats = data.cats.filter((cat) => isActive(cat, date));
      const missingNotes = activeCats.filter((cat) => !data.notes.some((note) => note.cat_id === cat.id));
      const activeTemplateIds = new Set(data.templates.filter((item) => activeCats.some((cat) => cat.id === item.cat_id)).map((item) => item.id));
      const completedIds = new Set(data.logs.map((item) => item.routine_template_id));
      const pendingCount = [...activeTemplateIds].filter((id) => !completedIds.has(id)).length;
      const ownerInteractionCount = data.ownerNotes.filter((note) => isInteraction(note.message) && !isAdminReply(note.message)).length;
      const arrivals = data.cats.filter((cat) => cat.checkin_date === date);
      const exits = data.cats.filter((cat) => cat.checkout_date === date);

      content.innerHTML = `
        <div class="today-dashboard">
          <section class="panel">
            <div class="panel-head"><div><h2>Bugün</h2><p class="muted">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} için bakım özeti</p></div><button id="today-dashboard-refresh" class="today-refresh"><i class="ti ti-refresh"></i> Yenile</button></div>
            <div class="today-summary">
              <div class="today-metric"><strong>${activeCats.length}</strong><span>konaklayan kedi</span></div>
              <div class="today-metric"><strong>${missingNotes.length}</strong><span>not bekleyen kedi</span></div>
              <div class="today-metric"><strong>${pendingCount}</strong><span>bekleyen rutin</span></div>
              <div class="today-metric"><strong>${ownerInteractionCount}</strong><span>bugünkü sahip yanıtı</span></div>
            </div>
          </section>

          <section class="today-grid">
            <article class="panel"><div class="panel-head"><div><h2>Konaklayan kediler</h2><p class="muted">Günlük not ve rutin tamamlama durumu</p></div></div><div class="today-cat-list">${activeCats.length ? activeCats.map((cat) => catCard(cat, data)).join('') : '<div class="today-empty">Bugün konaklayan kedi yok.</div>'}</div></article>
            <article class="panel"><div class="panel-head"><div><h2>Giriş / çıkış</h2><p class="muted">Bugünün hareketleri</p></div></div><div class="today-list">
              ${arrivals.length ? arrivals.map((cat) => `<div class="today-row"><strong>Giriş · ${esc(cat.name)}</strong><div class="small-muted">${esc(cat.owner_name || '')}</div></div>`).join('') : '<div class="today-empty">Bugün giriş yok.</div>'}
              ${exits.length ? exits.map((cat) => `<div class="today-row"><strong>Çıkış · ${esc(cat.name)}</strong><div class="small-muted">${esc(cat.owner_name || '')}</div></div>`).join('') : '<div class="today-empty">Bugün çıkış yok.</div>'}
            </div></article>
          </section>

          <section class="today-grid">
            <article class="panel"><div class="panel-head"><div><h2>Bekleyen rutinler</h2><p class="muted">Saate göre sıralandı</p></div></div><div class="today-list">${pendingRoutineRows(activeCats, data)}</div></article>
            <article class="panel"><div class="panel-head"><div><h2>Yeni sahip hareketleri</h2><p class="muted">Bugün gelen tepki ve yanıtlar</p></div></div><div class="today-list">${ownerInteractionRows(data)}</div></article>
          </section>
        </div>
      `;
      document.querySelector('#today-dashboard-refresh')?.addEventListener('click', openDashboard);
    } catch (error) {
      content.innerHTML = `<section class="panel"><div class="notice warn">Bugün ekranı yüklenemedi: ${esc(error.message || 'Bilinmeyen hata')}</div></section>`;
    } finally {
      opening = false;
    }
  }

  injectStyles();
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-today-dashboard]')) openDashboard();
  });

  const observer = new MutationObserver(() => {
    if (observerBusy) return;
    observerBusy = true;
    requestAnimationFrame(() => {
      observerBusy = false;
      ensureNav();
      if (!autoOpened && document.querySelector('.nav') && document.querySelector('.content')) {
        autoOpened = true;
        setTimeout(openDashboard, 180);
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureNav();
  setTimeout(() => {
    ensureNav();
    if (!autoOpened && document.querySelector('.content')) {
      autoOpened = true;
      openDashboard();
    }
  }, 1000);
})();
