(() => {
  setInterval(() => {
    const button = document.querySelector('#cat-form button[type="submit"]');
    if (button) button.removeAttribute('disabled');

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
})();
