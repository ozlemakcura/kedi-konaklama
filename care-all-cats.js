(() => {
  if (!location.pathname.endsWith('/care.html')) return;

  let db;
  let cats = [];
  const cfg = window.KEDI_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  function client() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    if (!db) db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return db;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(dateText, days) {
    const date = new Date(`${dateText}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isActiveOrPrep(cat) {
    const t = today();
    const start = cat.checkin_date ? addDays(cat.checkin_date, -2) : '';
    return (!cat.checkin_date || start <= t) && (!cat.checkout_date || cat.checkout_date > t);
  }

  function statusText(cat) {
    const t = today();
    if (!cat.checkin_date && !cat.checkout_date) return 'Tarih yok';
    if (cat.checkout_date && cat.checkout_date <= t) return 'Ayrıldı';
    if (isActiveOrPrep(cat)) return 'Aktif / hazırlık';
    return 'Gelecek kayıt';
  }

  function ensureSearchUi() {
    const select = $('#cat-select');
    if (!select || $('#cat-search')) return;
    const field = select.closest('.field');
    if (!field) return;
    const label = field.querySelector('label');
    if (label) label.textContent = 'Kedi ara / seç';

    const wrap = document.createElement('div');
    wrap.className = 'buttons';
    wrap.style.marginBottom = '10px';
    wrap.innerHTML = '<input id="cat-search" placeholder="Kedi veya sahip adı ara" style="flex:1;min-width:180px"><button class="btn soft" id="cat-search-btn" type="button">Ara</button><button class="btn soft" id="cat-clear-btn" type="button">Temizle</button>';
    field.insertBefore(wrap, select);

    $('#cat-search-btn').onclick = () => renderOptions($('#cat-search').value.trim());
    $('#cat-clear-btn').onclick = () => { $('#cat-search').value = ''; renderOptions(''); };
    $('#cat-search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        renderOptions($('#cat-search').value.trim());
      }
    });
  }

  function renderOptions(query = '') {
    const select = $('#cat-select');
    if (!select || !cats.length) return;
    const current = select.value;
    const q = query.toLocaleLowerCase('tr-TR');
    const filtered = cats.filter((cat) => {
      const text = `${cat.name || ''} ${cat.owner_name || ''}`.toLocaleLowerCase('tr-TR');
      return !q || text.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      const aActive = isActiveOrPrep(a) ? 0 : 1;
      const bActive = isActiveOrPrep(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return String(a.checkin_date || '').localeCompare(String(b.checkin_date || ''));
    });

    select.innerHTML = '<option value="">Kedi seçin</option>' + sorted.map((cat) => {
      const label = `${cat.name || 'Kedi'}${cat.owner_name ? ` — ${cat.owner_name}` : ''} (${statusText(cat)})`;
      return `<option value="${cat.id}">${esc(label)}</option>`;
    }).join('');

    if (sorted.some((cat) => cat.id === current)) {
      select.value = current;
    }
  }

  async function loadCats() {
    const api = client();
    if (!api) return;
    const { data, error } = await api.from('cats').select('id,name,owner_name,checkin_date,checkout_date').order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) return;
    cats = data;
    ensureSearchUi();
    renderOptions($('#cat-search')?.value.trim() || '');
  }

  function start() {
    setTimeout(loadCats, 700);
    setTimeout(loadCats, 1600);
    setInterval(() => {
      if ($('#cat-select') && !$('#cat-search')) loadCats();
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
