(() => {
  const path = location.pathname;
  const isOwnerPage = path.endsWith('/owner.html');
  const isCarePage = path.endsWith('/care.html');
  const isAdminPage = path.endsWith('/index.html') || path.endsWith('/kedi-konaklama/') || path === '/';
  if (!isOwnerPage && !isCarePage && !isAdminPage) return;

  const cfg = window.KEDI_APP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const ownerToken = new URLSearchParams(location.search).get('owner') || '';
  const REACTIONS = {
    heart: '❤️',
    love: '😍',
    aww: '🥹',
    like: '👍',
  };

  const esc = (value = '') => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const fmtDateTime = (value) => value
    ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  const encodeTarget = (value) => encodeURIComponent(String(value || ''));
  const decodeTarget = (value) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };

  function parseInteraction(note) {
    const message = String(note?.message || '');
    const match = message.match(/^\[\[care:([^\]]+)\]\]\[\[(reaction|reply)(?::([^\]]+))?\]\]([\s\S]*)$/);
    if (!match) return null;
    return {
      target: decodeTarget(match[1]),
      type: match[2],
      reaction: match[3] || '',
      text: String(match[4] || '').trim(),
      ownerName: note.owner_name || 'Sahip',
      createdAt: note.created_at || '',
      id: note.id || '',
    };
  }

  function interactionMessage(target, type, value = '') {
    if (type === 'reaction') return `[[care:${encodeTarget(target)}]][[reaction:${value}]]`;
    return `[[care:${encodeTarget(target)}]][[reply]]${value}`;
  }

  function injectStyles() {
    if (document.querySelector('#owner-interaction-styles')) return;
    const style = document.createElement('style');
    style.id = 'owner-interaction-styles';
    style.textContent = `
      .owner-interaction-box{margin-top:14px;padding-top:14px;border-top:1px solid var(--line,#e8defc)}
      .owner-interaction-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
      .owner-interaction-title{font-size:13px;font-weight:800;color:var(--purple,#6d28d9)}
      .owner-reaction-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .owner-reaction-btn,.owner-reply-toggle,.owner-reply-send{border:1px solid var(--line,#e8defc);background:#fff;color:var(--text,#20183a);border-radius:999px;padding:8px 11px;cursor:pointer;font-weight:800}
      .owner-reaction-btn:hover,.owner-reply-toggle:hover{background:#faf5ff;border-color:#c4b5fd}
      .owner-reaction-count{font-size:12px;color:var(--muted,#6b6480);margin-left:3px}
      .owner-reply-form{display:none;margin-top:10px;gap:8px}
      .owner-reply-form.open{display:grid}
      .owner-reply-form textarea{width:100%;min-height:78px;border:1px solid var(--line,#e8defc);border-radius:13px;padding:11px 12px;resize:vertical;background:#fff;color:var(--text,#20183a)}
      .owner-reply-send{justify-self:start;background:linear-gradient(135deg,var(--pink,#db2777),#ec4899);color:#fff;border:0;border-radius:13px}
      .owner-response-list{display:grid;gap:8px;margin-top:10px}
      .owner-response{border-radius:12px;padding:10px 11px;background:#fcfaff;border:1px solid var(--line,#e8defc)}
      .owner-response-meta{font-size:11px;color:var(--muted,#6b6480);margin-bottom:5px}
      .owner-response-reactions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      .owner-response-chip{display:inline-flex;gap:5px;align-items:center;padding:5px 8px;border-radius:999px;background:#f5f3ff;color:var(--purple,#6d28d9);font-size:12px;font-weight:800}
      .owner-technical-note{background:#fcfaff}
    `;
    document.head.appendChild(style);
  }

  function groupedInteractions(ownerNotes) {
    const grouped = new Map();
    (ownerNotes || []).forEach((note) => {
      const parsed = parseInteraction(note);
      if (!parsed?.target) return;
      if (!grouped.has(parsed.target)) grouped.set(parsed.target, []);
      grouped.get(parsed.target).push(parsed);
    });
    return grouped;
  }

  function sortedPortalNotes(notes) {
    return [...(notes || [])].sort((a, b) => {
      const dateCompare = String(b.note_date || '').localeCompare(String(a.note_date || ''));
      if (dateCompare) return dateCompare;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }

  function responseMarkup(interactions) {
    const reactions = {};
    const replies = [];
    interactions.forEach((item) => {
      if (item.type === 'reaction' && REACTIONS[item.reaction]) {
        reactions[item.reaction] = (reactions[item.reaction] || 0) + 1;
      } else if (item.type === 'reply' && item.text) {
        replies.push(item);
      }
    });

    return `
      ${Object.keys(reactions).length ? `<div class="owner-response-reactions">${Object.entries(reactions).map(([key, count]) => `<span class="owner-response-chip">${REACTIONS[key]} ${count}</span>`).join('')}</div>` : ''}
      ${replies.length ? `<div class="owner-response-list">${replies.map((reply) => `<div class="owner-response"><div class="owner-response-meta">${esc(reply.ownerName)} · ${esc(fmtDateTime(reply.createdAt))}</div><div>${esc(reply.text)}</div></div>`).join('')}</div>` : ''}
    `;
  }

  async function submitOwnerInteraction(target, type, value, ownerName) {
    const message = interactionMessage(target, type, value);
    return client.rpc('submit_owner_note', {
      p_token: ownerToken,
      p_owner_name: ownerName || null,
      p_message: message,
    });
  }

  let ownerDecorating = false;
  async function decorateOwnerPage(force = false) {
    if (!isOwnerPage || ownerDecorating || !ownerToken) return;
    const app = document.querySelector('#owner-app');
    if (!app || !app.querySelector('.day-card')) return;
    const currentCards = [...document.querySelectorAll('.day-column:first-child .item')];
    if (!force && currentCards.length && currentCards.every((card) => card.querySelector('.owner-interaction-box'))) return;
    ownerDecorating = true;

    try {
      const { data, error } = await client.rpc('owner_portal', { p_token: ownerToken });
      if (error || !data) return;

      const notes = sortedPortalNotes(data.daily_notes || []);
      const ownerNotes = data.owner_notes || [];
      const grouped = groupedInteractions(ownerNotes);
      const cards = [...document.querySelectorAll('.day-column:first-child .item')];
      const ownerName = data.cat?.owner_name || 'Sahip';

      cards.forEach((card, index) => {
        const note = notes[index];
        if (!note?.created_at) return;
        const target = note.created_at;
        card.dataset.careTarget = target;
        card.querySelector('.owner-interaction-box')?.remove();
        const interactions = grouped.get(target) || [];
        const counts = interactions.reduce((acc, item) => {
          if (item.type === 'reaction' && REACTIONS[item.reaction]) acc[item.reaction] = (acc[item.reaction] || 0) + 1;
          return acc;
        }, {});

        const box = document.createElement('div');
        box.className = 'owner-interaction-box';
        box.innerHTML = `
          <div class="owner-interaction-head">
            <span class="owner-interaction-title">Bu nota tepki ver veya yanıtla</span>
            <button type="button" class="owner-reply-toggle">Yanıt yaz</button>
          </div>
          <div class="owner-reaction-row">
            ${Object.entries(REACTIONS).map(([key, emoji]) => `<button type="button" class="owner-reaction-btn" data-owner-reaction="${key}">${emoji}<span class="owner-reaction-count">${counts[key] || ''}</span></button>`).join('')}
          </div>
          <form class="owner-reply-form">
            <textarea maxlength="1200" placeholder="Bu günlük nota yanıtınızı yazın..."></textarea>
            <button type="submit" class="owner-reply-send">Yanıtı gönder</button>
          </form>
          <div class="owner-interaction-responses">${responseMarkup(interactions)}</div>
        `;

        box.querySelector('.owner-reply-toggle').onclick = () => {
          box.querySelector('.owner-reply-form').classList.toggle('open');
        };

        box.querySelectorAll('[data-owner-reaction]').forEach((button) => {
          button.onclick = async () => {
            button.disabled = true;
            const result = await submitOwnerInteraction(target, 'reaction', button.dataset.ownerReaction, ownerName);
            button.disabled = false;
            if (result.error) {
              alert(result.error.message || 'Tepki gönderilemedi.');
              return;
            }
            await decorateOwnerPage(true);
          };
        });

        box.querySelector('.owner-reply-form').onsubmit = async (event) => {
          event.preventDefault();
          const textarea = event.currentTarget.querySelector('textarea');
          const text = textarea.value.trim();
          if (!text) return;
          const send = event.currentTarget.querySelector('button');
          send.disabled = true;
          const result = await submitOwnerInteraction(target, 'reply', text, ownerName);
          send.disabled = false;
          if (result.error) {
            alert(result.error.message || 'Yanıt gönderilemedi.');
            return;
          }
          textarea.value = '';
          await decorateOwnerPage(true);
        };

        card.appendChild(box);
      });

      const sentNotesHeading = [...document.querySelectorAll('#owner-app h2')].find((heading) => heading.textContent.trim() === 'Gönderilen notlar');
      const sentNotesList = sentNotesHeading?.closest('.card')?.querySelector('.list');
      if (sentNotesList) {
        const generalNotes = ownerNotes.filter((note) => !parseInteraction(note));
        sentNotesList.innerHTML = generalNotes.length
          ? generalNotes.map((note) => `<div class="item"><div class="muted">${esc(fmtDateTime(note.created_at))} · ${esc(note.owner_name || 'Sahip')}</div><div class="divider"></div><div class="note">${esc(note.message)}</div></div>`).join('')
          : '<div class="empty">Henüz genel not gönderilmedi.</div>';
      }
    } finally {
      ownerDecorating = false;
    }
  }

  let careDecorating = false;
  async function decorateCarePage(force = false) {
    if (!isCarePage || careDecorating) return;
    const catId = document.querySelector('#cat-select')?.value || '';
    const recent = document.querySelector('#recent-notes');
    if (!catId || !recent || !recent.querySelector('.item')) return;
    const currentCards = [...recent.querySelectorAll('.item')];
    if (!force && currentCards.length && currentCards.every((card) => card.dataset.interactionsChecked === '1')) return;
    careDecorating = true;

    try {
      const [{ data: notes }, { data: ownerNotes }] = await Promise.all([
        client.from('daily_notes').select('id,cat_id,note_date,created_at').eq('cat_id', catId).order('created_at', { ascending: false }).limit(8),
        client.from('owner_notes').select('id,cat_id,owner_name,message,created_at').eq('cat_id', catId).order('created_at', { ascending: false }),
      ]);
      const grouped = groupedInteractions(ownerNotes || []);
      const cards = [...recent.querySelectorAll('.item')];
      cards.forEach((card, index) => {
        card.dataset.interactionsChecked = '1';
        card.querySelector('.owner-interaction-box')?.remove();
        const note = notes?.[index];
        if (!note?.created_at) return;
        const interactions = grouped.get(note.created_at) || [];
        if (!interactions.length) return;
        const box = document.createElement('div');
        box.className = 'owner-interaction-box';
        box.innerHTML = `<div class="owner-interaction-title">Sahip tepkileri ve yanıtları</div>${responseMarkup(interactions)}`;
        card.appendChild(box);
      });
    } finally {
      careDecorating = false;
    }
  }

  function decorateAdminOwnerNotes() {
    if (!isAdminPage) return;
    const heading = [...document.querySelectorAll('h2')].find((item) => item.textContent.trim() === 'Sahip notları');
    const panel = heading?.closest('.panel');
    if (!panel) return;

    panel.querySelectorAll('.note-text').forEach((node) => {
      if (node.dataset.interactionFormatted === '1') return;
      const parsed = parseInteraction({ message: node.textContent });
      if (!parsed) return;
      node.dataset.interactionFormatted = '1';
      node.closest('.card')?.classList.add('owner-technical-note');
      if (parsed.type === 'reaction') {
        node.innerHTML = `<strong>${REACTIONS[parsed.reaction] || '💬'} Günlük nota tepki verdi</strong><div class="small-muted" style="margin-top:6px">İlgili not: ${esc(fmtDateTime(parsed.target))}</div>`;
      } else {
        node.innerHTML = `<strong>Günlük nota yanıt verdi</strong><div class="small-muted" style="margin-top:6px">İlgili not: ${esc(fmtDateTime(parsed.target))}</div><div class="divider"></div><div>${esc(parsed.text)}</div>`;
      }
    });
  }

  injectStyles();

  if (isOwnerPage) {
    setTimeout(() => decorateOwnerPage(false), 500);
    setTimeout(() => decorateOwnerPage(false), 1400);
    setInterval(() => decorateOwnerPage(false), 1200);
  }

  if (isCarePage) {
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'cat-select') setTimeout(() => decorateCarePage(true), 180);
    });
    setTimeout(() => decorateCarePage(false), 800);
    setInterval(() => decorateCarePage(false), 1500);
    setInterval(() => decorateCarePage(true), 12000);
  }

  if (isAdminPage) {
    new MutationObserver(() => setTimeout(decorateAdminOwnerNotes, 80)).observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(decorateAdminOwnerNotes, 800);
  }
})();
