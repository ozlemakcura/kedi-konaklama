(() => {
  if (!location.pathname.endsWith('/owner.html')) return;

  const cfg = window.KEDI_APP_CONFIG || {};
  const token = new URLSearchParams(location.search).get('owner') || '';
  const esc = (v = '') => String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const dateKey = (v) => String(v || '').slice(0, 10);
  const fmtDate = (v) => v ? new Date(v + (String(v).includes('T') ? '' : 'T12:00:00')).toLocaleDateString('tr-TR') : '—';
  const fmtTime = (v) => v ? new Date(v).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';

  async function run() {
    if (!token || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data } = await client.rpc('owner_portal', { p_token: token });
    const notes = data?.daily_notes || [];
    if (!notes.length) return;

    document.querySelectorAll('.day-card').forEach((dayCard) => {
      const heading = dayCard.querySelector('h2')?.textContent?.trim() || '';
      const dayNotes = notes.filter((note) => fmtDate(dateKey(note.note_date)) === heading);
      const noteItems = dayCard.querySelectorAll('.day-column:first-child .item');
      noteItems.forEach((item, index) => {
        if (item.dataset.timeAdded === '1') return;
        const note = dayNotes[index];
        if (!note?.created_at) return;
        item.dataset.timeAdded = '1';
        const div = document.createElement('div');
        div.className = 'muted';
        div.style.marginTop = '8px';
        div.textContent = `Kaydedilme saati: ${fmtTime(note.created_at)}`;
        item.appendChild(div);
      });
    });
  }

  setTimeout(run, 800);
  setTimeout(run, 1800);
})();
