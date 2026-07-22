(() => {
  const path = location.pathname;
  const isOwnerPage = path.endsWith('/owner.html');
  const isAdminPage = path.endsWith('/index.html') || path.endsWith('/kedi-konaklama/') || path === '/';
  if (!isOwnerPage && !isAdminPage) return;

  const cfg = window.KEDI_APP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const ownerToken = new URLSearchParams(location.search).get('owner') || '';
  const REACTIONS = { heart: '❤️', love: '😍', aww: '🥹', like: '👍' };
  let adminLoading = false;
  let ownerLoading = false;
  let adminCache = { cats: [], notes: [] };

  const esc = (value = '') => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const fmtDateTime = (value) => value
    ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  const encodeValue = (value) => encodeURIComponent(String(value || ''));
  const decodeValue = (value) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };

  function parseOwnerInteraction(note) {
    const match = String(note?.message || '').match(/^\[\[care:([^\]]+)\]\]\[\[(reaction|reply)(?::([^\]]+))?\]\]([\s\S]*)$/);
    if (!match) return null;
    return {
      ...note,
      kind: 'owner-interaction',
      target: decodeValue(match[1]),
      type: match[2],
      reaction: match[3] || '',
      text: String(match[4] || '').trim(),
    };
  }

  function parseAdminReply(note) {
    const match = String(note?.message || '').match(/^\[\[admin-reply:([^\]]+)\]\]\[\[care:([^\]]*)\]\]([\s\S]*)$/);
    if (!match) return null;
    return {
      ...note,
      kind: 'admin-reply',
      parentId: decodeValue(match[1]),
      target: decodeValue(match[2]),
      text: String(match[3] || '').trim(),
    };
  }

  function isTechnical(note) {
    return !!parseOwnerInteraction(note) || !!parseAdminReply(note);
  }

  function groupAdminReplies(notes) {
    const map = new Map();
    notes.map(parseAdminReply).filter(Boolean).forEach((reply) => {
      if (!map.has(reply.parentId)) map.set(reply.parentId, []);
      map.get(reply.parentId).push(reply);
    });
    map.forEach((items) => items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
    return map;
  }

  function injectStyles() {
    if (document.querySelector('#owner-conversation-styles')) return;
    const style = document.createElement('style');
    style.id = 'owner-conversation-styles';
    style.textContent = `
      .conversation-list{display:grid;gap:12px}
      .conversation-card{border:1px solid var(--line,#e8defc);background:#fff;border-radius:16px;padding:16px}
      .conversation-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .conversation-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .conversation-meta{font-size:12px;color:var(--muted,#6b6480);margin-top:5px}
      .conversation-message{white-space:pre-wrap;line-height:1.55;margin-top:12px}
      .conversation-replies{display:grid;gap:8px;margin-top:12px;padding-left:12px;border-left:3px solid #e9d5ff}
      .conversation-admin-reply{border:1px solid #d8b4fe;background:#faf5ff;border-radius:12px;padding:10px 11px}
      .conversation-admin-reply strong{color:var(--purple,#6d28d9);font-size:12px}
      .conversation-admin-text{white-space:pre-wrap;line-height:1.5;margin-top:4px}
      .conversation-form{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:12px}
      .conversation-form textarea{width:100%;min-height:58px;border:1px solid var(--line,#e8defc);border-radius:12px;padding:10px 11px;resize:vertical;background:#fff;color:var(--text,#20183a)}
      .conversation-send{border:0;border-radius:12px;padding:10px 13px;background:linear-gradient(135deg,#6d28d9,#db2777);color:#fff;font-weight:800;cursor:pointer;align-self:end}
      .conversation-delete{border:1px solid #fecdd3;background:#fff1f2;color:#be123c;border-radius:10px;padding:7px 9px;cursor:pointer;font-weight:700}
      .owner-admin-replies{display:grid;gap:7px;margin-top:9px}
      .owner-admin-reply{border:1px solid #d8b4fe;background:#faf5ff;border-radius:11px;padding:9px 10px}
      .owner-admin-reply-meta{font-size:11px;color:#6d28d9;font-weight:800;margin-bottom:4px}
      .owner-admin-reply-text{white-space:pre-wrap;line-height:1.45}
      .owner-reaction-admin-replies{margin-top:10px}
      @media(max-width:640px){.conversation-form{grid-template-columns:1fr}.conversation-head{flex-direction:column}.conversation-send{justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  function adminRepliesMarkup(replies) {
    if (!replies?.length) return '';
    return `<div class="conversation-replies">${replies.map((reply) => `<div class="conversation-admin-reply"><strong>Özlem · ${esc(fmtDateTime(reply.created_at))}</strong><div class="conversation-admin-text">${esc(reply.text)}</div></div>`).join('')}</div>`;
  }

  function adminConversationCard(note, cat, replies) {
    const interaction = parseOwnerInteraction(note);
    const general = !interaction;
    const typeLabel = general ? 'Genel not' : interaction.type === 'reaction' ? `${REACTIONS[interaction.reaction] || '💬'} Tepki` : 'Yanıt';
    const message = general
      ? note.message
      : interaction.type === 'reaction'
        ? 'Günlük bakım notuna tepki verdi.'
        : interaction.text;
    const targetLabel = interaction?.target ? `<div class="conversation-meta">İlgili günlük not: ${esc(fmtDateTime(interaction.target))}</div>` : '';

    return `
      <article class="conversation-card" data-conversation-note="${esc(note.id)}">
        <div class="conversation-head">
          <div>
            <div class="conversation-title"><strong>${esc(note.owner_name || 'Sahip')}</strong><span class="badge pink">${esc(cat?.name || 'Kedi')}</span><span class="badge">${typeLabel}</span></div>
            <div class="conversation-meta">${esc(fmtDateTime(note.created_at))}</div>${targetLabel}
          </div>
          <button type="button" class="conversation-delete" data-delete-conversation="${esc(note.id)}">Sil</button>
        </div>
        ${message ? `<div class="conversation-message">${esc(message)}</div>` : ''}
        ${adminRepliesMarkup(replies)}
        <form class="conversation-form" data-admin-reply-form="${esc(note.id)}">
          <textarea maxlength="1500" placeholder="Sahibe yanıtınızı yazın..."></textarea>
          <button class="conversation-send" type="submit">Yanıtla</button>
        </form>
      </article>
    `;
  }

  async function loadAdminConversations(force = false) {
    if (!isAdminPage || adminLoading) return;
    const heading = [...document.querySelectorAll('h2')].find((item) => item.textContent.trim() === 'Sahip notları');
    const panel = heading?.closest('.panel');
    const list = panel?.querySelector('.list');
    if (!panel || !list) return;
    if (!force && list.dataset.conversationReady === '1') return;

    const sessionResult = await client.auth.getSession();
    if (!sessionResult.data.session) return;
    adminLoading = true;
    try {
      const [catsRes, notesRes] = await Promise.all([
        client.from('cats').select('id,name,public_token'),
        client.from('owner_notes').select('id,cat_id,owner_name,message,created_at').order('created_at', { ascending: false }),
      ]);
      if (catsRes.error || notesRes.error) return;
      adminCache = { cats: catsRes.data || [], notes: notesRes.data || [] };
      const catMap = new Map(adminCache.cats.map((cat) => [cat.id, cat]));
      const repliesByParent = groupAdminReplies(adminCache.notes);
      const baseNotes = adminCache.notes.filter((note) => !parseAdminReply(note));
      list.dataset.conversationReady = '1';
      list.classList.add('conversation-list');
      list.innerHTML = baseNotes.length
        ? baseNotes.map((note) => adminConversationCard(note, catMap.get(note.cat_id), repliesByParent.get(note.id) || [])).join('')
        : '<div class="empty">Henüz sahip notu, tepki veya yanıtı yok.</div>';
      const description = panel.querySelector('.panel-head .muted');
      if (description) description.textContent = 'Sahiplerin mesajlarını görün ve aynı konuşmanın içinden yanıtlayın.';
    } finally {
      adminLoading = false;
    }
  }

  async function submitAdminReply(form) {
    const parentId = form.dataset.adminReplyForm;
    const textarea = form.querySelector('textarea');
    const button = form.querySelector('button');
    const text = textarea.value.trim();
    if (!text || !parentId) return;

    const parent = adminCache.notes.find((note) => note.id === parentId);
    const cat = adminCache.cats.find((item) => item.id === parent?.cat_id);
    if (!parent || !cat?.public_token) {
      alert('Kedi veya sahip bağlantısı bulunamadı.');
      return;
    }
    const interaction = parseOwnerInteraction(parent);
    const target = interaction?.target || '';
    const message = `[[admin-reply:${encodeValue(parent.id)}]][[care:${encodeValue(target)}]]${text}`;
    button.disabled = true;
    const result = await client.rpc('submit_owner_note', {
      p_token: cat.public_token,
      p_owner_name: 'Özlem',
      p_message: message,
    });
    button.disabled = false;
    if (result.error) {
      alert(result.error.message || 'Yanıt gönderilemedi.');
      return;
    }
    textarea.value = '';
    const list = form.closest('.list');
    if (list) list.dataset.conversationReady = '0';
    await loadAdminConversations(true);
  }

  async function deleteConversation(id) {
    if (!confirm('Bu kayıt silinsin mi?')) return;
    const result = await client.from('owner_notes').delete().eq('id', id);
    if (result.error) {
      alert(result.error.message || 'Kayıt silinemedi.');
      return;
    }
    await loadAdminConversations(true);
  }

  function ownerReplyMarkup(replies) {
    if (!replies?.length) return '';
    return `<div class="owner-admin-replies">${replies.map((reply) => `<div class="owner-admin-reply"><div class="owner-admin-reply-meta">Özlem · ${esc(fmtDateTime(reply.created_at))}</div><div class="owner-admin-reply-text">${esc(reply.text)}</div></div>`).join('')}</div>`;
  }

  async function decorateOwnerConversations() {
    if (!isOwnerPage || ownerLoading || !ownerToken) return;
    const app = document.querySelector('#owner-app');
    if (!app?.querySelector('.day-card')) return;
    ownerLoading = true;
    try {
      const { data, error } = await client.rpc('owner_portal', { p_token: ownerToken });
      if (error || !data) return;
      const allNotes = data.owner_notes || [];
      const repliesByParent = groupAdminReplies(allNotes);
      const ownerInteractions = allNotes.map(parseOwnerInteraction).filter(Boolean);

      document.querySelectorAll('.day-column:first-child .item').forEach((card) => {
        const target = card.dataset.careTarget;
        if (!target) return;
        const interactions = ownerInteractions.filter((item) => item.target === target);
        const ownerTextReplies = interactions.filter((item) => item.type === 'reply' && item.text);
        const responseNodes = card.querySelectorAll('.owner-response');
        responseNodes.forEach((node, index) => {
          node.querySelector('.owner-admin-replies')?.remove();
          const parent = ownerTextReplies[index];
          if (!parent) return;
          node.insertAdjacentHTML('beforeend', ownerReplyMarkup(repliesByParent.get(parent.id) || []));
        });

        const reactionReplies = interactions
          .filter((item) => item.type === 'reaction')
          .flatMap((item) => repliesByParent.get(item.id) || []);
        const box = card.querySelector('.owner-interaction-box');
        box?.querySelector('.owner-reaction-admin-replies')?.remove();
        if (box && reactionReplies.length) {
          const wrapper = document.createElement('div');
          wrapper.className = 'owner-reaction-admin-replies';
          wrapper.innerHTML = ownerReplyMarkup(reactionReplies);
          box.appendChild(wrapper);
        }
      });

      const sentHeading = [...document.querySelectorAll('#owner-app h2')].find((heading) => heading.textContent.trim() === 'Gönderilen notlar');
      const sentList = sentHeading?.closest('.card')?.querySelector('.list');
      if (sentList) {
        const generalNotes = allNotes.filter((note) => !isTechnical(note));
        sentList.innerHTML = generalNotes.length
          ? generalNotes.map((note) => `<div class="item"><div class="muted">${esc(fmtDateTime(note.created_at))} · ${esc(note.owner_name || 'Sahip')}</div><div class="divider"></div><div class="note">${esc(note.message)}</div>${ownerReplyMarkup(repliesByParent.get(note.id) || [])}</div>`).join('')
          : '<div class="empty">Henüz genel not gönderilmedi.</div>';
      }
    } finally {
      ownerLoading = false;
    }
  }

  injectStyles();

  if (isAdminPage) {
    document.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-admin-reply-form]');
      if (!form) return;
      event.preventDefault();
      submitAdminReply(form);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-conversation]');
      if (button) deleteConversation(button.dataset.deleteConversation);
    });
    new MutationObserver(() => setTimeout(() => loadAdminConversations(false), 80)).observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => loadAdminConversations(false), 900);
    setInterval(() => loadAdminConversations(false), 2500);
  }

  if (isOwnerPage) {
    setTimeout(decorateOwnerConversations, 900);
    setTimeout(decorateOwnerConversations, 1800);
    setInterval(decorateOwnerConversations, 1800);
  }
})();
