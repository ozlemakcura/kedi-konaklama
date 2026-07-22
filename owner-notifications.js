(() => {
  const path = location.pathname;
  const isAdminPage = path.endsWith('/index.html') || path.endsWith('/kedi-konaklama/') || path === '/';
  const isCarePage = path.endsWith('/care.html');
  if (!isAdminPage && !isCarePage) return;

  const cfg = window.KEDI_APP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const REACTIONS = { heart: '❤️', love: '😍', aww: '🥹', like: '👍' };
  let currentUserId = '';
  let interactions = [];
  let catsById = new Map();
  let checking = false;
  let initialized = false;

  const esc = (value = '') => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const fmtDateTime = (value) => value
    ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  function decodeTarget(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function parseInteraction(note) {
    const message = String(note?.message || '');
    const match = message.match(/^\[\[care:([^\]]+)\]\]\[\[(reaction|reply)(?::([^\]]+))?\]\]([\s\S]*)$/);
    if (!match) return null;
    return {
      id: note.id,
      catId: note.cat_id,
      ownerName: note.owner_name || 'Sahip',
      createdAt: note.created_at,
      target: decodeTarget(match[1]),
      type: match[2],
      reaction: match[3] || '',
      text: String(match[4] || '').trim(),
    };
  }

  function storageKey(name) {
    return `pati-owner-notifications:${currentUserId}:${name}`;
  }

  function getStoredDate(name) {
    return localStorage.getItem(storageKey(name)) || '';
  }

  function setStoredDate(name, value) {
    if (value) localStorage.setItem(storageKey(name), value);
  }

  function catName(item) {
    return catsById.get(item.catId) || 'Kedi';
  }

  function titleFor(item) {
    const name = catName(item);
    if (item.type === 'reaction') return `${name} için yeni tepki ${REACTIONS[item.reaction] || '💬'}`;
    return `${name} için yeni yanıt`;
  }

  function bodyFor(item) {
    if (item.type === 'reaction') return `${item.ownerName}, günlük bakım notuna tepki verdi.`;
    return `${item.ownerName}: ${item.text || 'Günlük bakım notuna yanıt verdi.'}`;
  }

  function injectStyles() {
    if (document.querySelector('#owner-notification-styles')) return;
    const style = document.createElement('style');
    style.id = 'owner-notification-styles';
    style.textContent = `
      .owner-notification-button{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#db2777);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 16px 38px rgba(44,22,92,.28);z-index:9998;display:grid;place-items:center}
      .owner-notification-count{position:absolute;right:-3px;top:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#be123c;color:#fff;border:2px solid #fff;font:800 11px/18px system-ui;display:none;align-items:center;justify-content:center}
      .owner-notification-count.show{display:flex}
      .owner-notification-panel{position:fixed;right:20px;bottom:86px;width:min(390px,calc(100vw - 32px));max-height:min(620px,72vh);overflow:hidden;background:#fff;border:1px solid #e8defc;border-radius:20px;box-shadow:0 22px 70px rgba(44,22,92,.22);z-index:9999;display:none;color:#20183a}
      .owner-notification-panel.open{display:block}
      .owner-notification-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 17px;border-bottom:1px solid #e8defc;background:#fcfaff}
      .owner-notification-head strong{font-size:16px}
      .owner-notification-close{border:0;background:transparent;color:#6b6480;font-size:22px;cursor:pointer;padding:2px 6px}
      .owner-notification-permission{margin:12px 14px 0;border:1px solid #d8b4fe;background:#faf5ff;color:#6d28d9;border-radius:12px;padding:10px 12px;cursor:pointer;font-weight:800;width:calc(100% - 28px)}
      .owner-notification-list{padding:12px 14px 16px;display:grid;gap:9px;overflow:auto;max-height:480px}
      .owner-notification-item{border:1px solid #e8defc;border-radius:14px;padding:12px;background:#fff}
      .owner-notification-item.unread{border-color:#c4b5fd;background:#faf5ff}
      .owner-notification-title{font-weight:800;margin-bottom:5px}
      .owner-notification-body{font-size:13px;line-height:1.45;color:#4b4560;white-space:pre-wrap;word-break:break-word}
      .owner-notification-time{font-size:11px;color:#8a829c;margin-top:7px}
      .owner-notification-empty{padding:22px;text-align:center;color:#6b6480;border:1px dashed #d8b4fe;border-radius:14px}
      @media(max-width:600px){.owner-notification-button{right:14px;bottom:14px}.owner-notification-panel{right:16px;bottom:80px}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    injectStyles();
    if (document.querySelector('#owner-notification-button')) return;

    const button = document.createElement('button');
    button.id = 'owner-notification-button';
    button.className = 'owner-notification-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Sahip bildirimleri');
    button.innerHTML = `🔔<span id="owner-notification-count" class="owner-notification-count"></span>`;

    const panel = document.createElement('section');
    panel.id = 'owner-notification-panel';
    panel.className = 'owner-notification-panel';
    panel.innerHTML = `
      <div class="owner-notification-head"><strong>Sahip bildirimleri</strong><button class="owner-notification-close" type="button" aria-label="Kapat">×</button></div>
      <button id="owner-notification-permission" class="owner-notification-permission" type="button">Tarayıcı bildirimlerini aç</button>
      <div id="owner-notification-list" class="owner-notification-list"><div class="owner-notification-empty">Bildirimler hazırlanıyor...</div></div>
    `;

    document.body.appendChild(button);
    document.body.appendChild(panel);

    button.onclick = () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) markAllRead();
    };
    panel.querySelector('.owner-notification-close').onclick = () => panel.classList.remove('open');
    panel.querySelector('#owner-notification-permission').onclick = requestNotificationPermission;
  }

  function permissionButtonText() {
    const button = document.querySelector('#owner-notification-permission');
    if (!button) return;
    if (!('Notification' in window)) {
      button.textContent = 'Bu tarayıcı bildirimleri desteklemiyor';
      button.disabled = true;
      return;
    }
    if (Notification.permission === 'granted') {
      button.textContent = 'Tarayıcı bildirimleri açık ✓';
      button.disabled = true;
    } else if (Notification.permission === 'denied') {
      button.textContent = 'Bildirim izni tarayıcıdan kapalı';
      button.disabled = true;
    } else {
      button.textContent = 'Tarayıcı bildirimlerini aç';
      button.disabled = false;
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    permissionButtonText();
  }

  function notifyBrowser(item) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(titleFor(item), {
        body: bodyFor(item),
        icon: './favicon.ico',
        tag: `owner-interaction-${item.id}`,
      });
      notification.onclick = () => {
        window.focus();
        document.querySelector('#owner-notification-panel')?.classList.add('open');
        markAllRead();
        notification.close();
      };
    } catch (error) {
      console.error('Tarayıcı bildirimi gösterilemedi:', error);
    }
  }

  function unreadItems() {
    const lastRead = getStoredDate('last-read');
    return interactions.filter((item) => !lastRead || item.createdAt > lastRead);
  }

  function renderNotifications() {
    ensureUi();
    permissionButtonText();
    const unread = unreadItems();
    const count = document.querySelector('#owner-notification-count');
    if (count) {
      count.textContent = unread.length > 99 ? '99+' : String(unread.length || '');
      count.classList.toggle('show', unread.length > 0);
    }

    const list = document.querySelector('#owner-notification-list');
    if (!list) return;
    const lastRead = getStoredDate('last-read');
    list.innerHTML = interactions.length
      ? interactions.slice(0, 30).map((item) => `
          <article class="owner-notification-item ${!lastRead || item.createdAt > lastRead ? 'unread' : ''}">
            <div class="owner-notification-title">${esc(titleFor(item))}</div>
            <div class="owner-notification-body">${esc(bodyFor(item))}</div>
            <div class="owner-notification-time">${esc(fmtDateTime(item.createdAt))}</div>
          </article>
        `).join('')
      : '<div class="owner-notification-empty">Henüz sahip tepkisi veya yanıtı yok.</div>';
  }

  function markAllRead() {
    const newest = interactions[0]?.createdAt || new Date().toISOString();
    setStoredDate('last-read', newest);
    renderNotifications();
  }

  async function loadSession() {
    const { data } = await client.auth.getSession();
    const user = data?.session?.user || null;
    if (!user) return false;
    if (currentUserId !== user.id) {
      currentUserId = user.id;
      initialized = false;
    }
    return true;
  }

  async function checkNotifications() {
    if (checking || !(await loadSession())) return;
    checking = true;
    try {
      ensureUi();
      const [{ data: cats, error: catsError }, { data: notes, error: notesError }] = await Promise.all([
        client.from('cats').select('id,name'),
        client.from('owner_notes').select('id,cat_id,owner_name,message,created_at').order('created_at', { ascending: false }).limit(100),
      ]);
      if (catsError || notesError) return;

      catsById = new Map((cats || []).map((cat) => [cat.id, cat.name]));
      interactions = (notes || []).map(parseInteraction).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const newest = interactions[0]?.createdAt || '';

      if (!initialized) {
        if (!getStoredDate('last-checked')) setStoredDate('last-checked', newest || new Date().toISOString());
        if (!getStoredDate('last-read')) setStoredDate('last-read', newest || new Date().toISOString());
        initialized = true;
        renderNotifications();
        return;
      }

      const lastChecked = getStoredDate('last-checked');
      const newItems = interactions.filter((item) => !lastChecked || item.createdAt > lastChecked).reverse();
      newItems.forEach(notifyBrowser);
      if (newest) setStoredDate('last-checked', newest);
      renderNotifications();
    } finally {
      checking = false;
    }
  }

  ensureUi();
  permissionButtonText();
  checkNotifications();
  setInterval(checkNotifications, 10000);
  window.addEventListener('focus', checkNotifications);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkNotifications();
  });
  client.auth.onAuthStateChange(() => setTimeout(checkNotifications, 300));
})();
