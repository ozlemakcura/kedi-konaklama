(() => {
  const bucket = 'cat-photos';
  let storageClient;

  const show = (text, error = false) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.style.background = error ? '#be123c' : '#20183a';
    el.classList.add('show');
    clearTimeout(el._photoTimer);
    el._photoTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };

  const client = () => {
    const cfg = window.KEDI_APP_CONFIG || {};
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    if (!storageClient) storageClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return storageClient;
  };

  const captureForm = (form) => {
    if (!form) return null;
    const values = {};
    Array.from(form.elements).forEach((element) => {
      if (!element.id || element.type === 'file') return;
      values[element.id] = element.type === 'checkbox' ? element.checked : element.value;
    });
    return { id: form.id, values };
  };

  const restoreForm = (snapshot, overrideId = '', overrideValue = '') => {
    if (!snapshot?.id) return;
    const form = document.getElementById(snapshot.id);
    if (!form) return;

    Object.entries(snapshot.values || {}).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (!element || !form.contains(element)) return;
      if (element.type === 'checkbox') element.checked = Boolean(value);
      else element.value = value ?? '';
    });

    if (overrideId) {
      const override = document.getElementById(overrideId);
      if (override && form.contains(override)) {
        override.value = overrideValue ?? '';
        override.dispatchEvent(new Event('input', { bubbles: true }));
        override.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };

  const restoreSoon = (snapshot, overrideId = '', overrideValue = '') => {
    [0, 120, 420].forEach((delay) => {
      setTimeout(() => restoreForm(snapshot, overrideId, overrideValue), delay);
    });
  };

  async function upload(file, target, button, hint, snapshot) {
    if (!file) return;
    if (!file.type.startsWith('image/')) throw new Error('Yalnızca fotoğraf yükleyin.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Fotoğraf en fazla 10 MB olabilir.');

    const api = client();
    if (!api) throw new Error('Bağlantı hazırlanamadı.');
    const { data } = await api.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) throw new Error('Fotoğraf yüklemek için giriş yapın.');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const name = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="ti ti-loader"></i> Yükleniyor';
    hint.textContent = 'Fotoğraf yükleniyor...';

    try {
      const result = await api.storage.from(bucket).upload(name, file, { upsert: false, contentType: file.type });
      if (result.error) throw result.error;
      const publicUrl = api.storage.from(bucket).getPublicUrl(name).data.publicUrl;
      if (!publicUrl) throw new Error('Fotoğraf bağlantısı oluşturulamadı.');

      const liveTarget = document.getElementById(target.id) || target;
      liveTarget.value = publicUrl;
      liveTarget.dispatchEvent(new Event('input', { bubbles: true }));
      liveTarget.dispatchEvent(new Event('change', { bubbles: true }));
      restoreSoon(snapshot, target.id, publicUrl);
      hint.textContent = 'Fotoğraf yüklendi. Formu kaydedin.';
      show('Fotoğraf yüklendi. Bilgiler korundu.');
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  function addControl(input) {
    if (!input || input.dataset.photoReady) return;
    input.dataset.photoReady = '1';
    const field = input.closest('.field');
    if (!field) return;

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.style.marginTop = '4px';

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.className = 'hidden';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn small soft';
    button.innerHTML = '<i class="ti ti-upload"></i> Fotoğraf yükle';

    const hint = document.createElement('span');
    hint.className = 'small-muted';
    hint.textContent = 'JPG, PNG veya WEBP · en fazla 10 MB';

    button.onclick = () => picker.click();
    picker.onchange = async () => {
      const snapshot = captureForm(input.closest('form'));
      try {
        await upload(picker.files?.[0], input, button, hint, snapshot);
      } catch (e) {
        restoreSoon(snapshot);
        hint.textContent = e.message || 'Yükleme başarısız.';
        show(e.message || 'Yükleme başarısız.', true);
      } finally {
        picker.value = '';
      }
    };

    row.append(button, picker, hint);
    field.appendChild(row);
  }

  function improveCatCreateFeedback() {
    const form = document.getElementById('cat-form');
    if (!form || form.dataset.createFeedbackReady) return;
    form.dataset.createFeedbackReady = '1';

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton?.addEventListener('click', () => {
      const name = document.getElementById('cat-name');
      if (!name?.value.trim()) {
        show('Önce kedi adını girin.', true);
        name?.focus();
      }
    });

    form.addEventListener('invalid', (event) => {
      if (event.target?.id === 'cat-name') {
        show('Kedi adı zorunlu.', true);
      }
    }, true);
  }

  const enhance = () => {
    addControl(document.getElementById('cat-photo-url'));
    addControl(document.getElementById('note-photo-url'));
    improveCatCreateFeedback();
  };

  const start = () => {
    enhance();
    new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
