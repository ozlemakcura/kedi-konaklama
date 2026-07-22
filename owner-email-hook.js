(() => {
  if (!location.pathname.endsWith('/owner.html')) return;

  const cfg = window.KEDI_APP_CONFIG || {};
  const token = new URLSearchParams(location.search).get('owner') || '';
  if (!token || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const pending = new Set();

  async function sendEmailNotification(target, type, value) {
    const key = `${target}:${type}:${value}`;
    if (!target || pending.has(key)) return;
    pending.add(key);

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const { error } = await client.functions.invoke('notify-owner-interaction', {
        body: { token, target, type, value },
      });
      if (error) console.warn('E-posta bildirimi gönderilemedi:', error.message || error);
    } catch (error) {
      console.warn('E-posta bildirimi gönderilemedi:', error);
    } finally {
      setTimeout(() => pending.delete(key), 3000);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-owner-reaction]');
    if (!button) return;
    const card = button.closest('[data-care-target]');
    const target = card?.dataset.careTarget || '';
    const reaction = button.dataset.ownerReaction || '';
    sendEmailNotification(target, 'reaction', reaction);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('.owner-reply-form');
    if (!form) return;
    const card = form.closest('[data-care-target]');
    const target = card?.dataset.careTarget || '';
    const text = form.querySelector('textarea')?.value?.trim() || '';
    if (text) sendEmailNotification(target, 'reply', text);
  });
})();
