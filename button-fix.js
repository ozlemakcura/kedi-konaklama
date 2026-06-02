(() => {
  let metricClient;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function isActiveCat(cat) {
    const t = today();
    const alreadyArrived = !cat.checkin_date || cat.checkin_date <= t;
    const notCheckedOut = !cat.checkout_date || cat.checkout_date > t;
    return alreadyArrived && notCheckedOut;
  }

  function client() {
    const config = window.KEDI_APP_CONFIG || {};
    if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) return null;
    if (!metricClient) metricClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return metricClient;
  }

  async function updateActiveCatMetric() {
    const metric = Array.from(document.querySelectorAll('.metric')).find((el) =>
      el.textContent.toLowerCase().includes('aktif kedi')
    );
    const strong = metric?.querySelector('strong');
    if (!strong) return;

    const api = client();
    if (!api) return;

    const { data, error } = await api
      .from('cats')
      .select('id,checkin_date,checkout_date');

    if (error || !Array.isArray(data)) return;
    const activeCount = data.filter(isActiveCat).length;
    strong.textContent = String(activeCount);
  }

  setInterval(() => {
    document.querySelectorAll('#cat-form button[type="submit"], #note-form button[type="submit"], #item-form button[type="submit"]').forEach((button) => {
      button.removeAttribute('disabled');
    });

    document.querySelectorAll('input.link-input').forEach((input) => {
      if (!input.value || input.value.includes('/owner.html?')) return;
      input.value = input.value.replace('/kedi-konaklama/?owner=', '/kedi-konaklama/owner.html?owner=');
    });

    document.querySelectorAll('[data-copy-link]').forEach((copyButton) => {
      const value = copyButton.dataset.copyLink || '';
      if (!value || value.includes('/owner.html?')) return;
      copyButton.dataset.copyLink = value.replace('/kedi-konaklama/?owner=', '/kedi-konaklama/owner.html?owner=');
    });
  }, 200);

  setInterval(updateActiveCatMetric, 1500);
  window.addEventListener('DOMContentLoaded', () => setTimeout(updateActiveCatMetric, 800));

  document.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-cat]');
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      location.href = `./edit.html?id=${encodeURIComponent(editButton.dataset.editCat || '')}`;
      return;
    }

    const notesButton = event.target.closest('[data-nav="notes"]');
    if (notesButton) {
      event.preventDefault();
      event.stopPropagation();
      location.href = './note.html';
      return;
    }

    const catsNav = event.target.closest('[data-nav="cats"]');
    if (catsNav) {
      setTimeout(() => {
        const form = document.querySelector('#cat-form');
        const heading = form?.closest('.panel')?.querySelector('h2')?.textContent || '';
        if (form && /Yeni kedi/i.test(heading)) {
          const existing = form.parentElement?.querySelector('a[href="./add-cat.html"]');
          if (existing) return;
          const redirect = document.createElement('a');
          redirect.href = './add-cat.html';
          redirect.className = 'btn primary';
          redirect.textContent = 'Yeni kedi ekleme sayfasını aç';
          redirect.style.marginBottom = '14px';
          form.parentElement?.insertBefore(redirect, form);
        }
      }, 120);
    }
  }, true);
})();
