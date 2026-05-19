(() => {
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

  document.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-cat]');
    if (!editButton) return;
    event.preventDefault();
    event.stopPropagation();
    location.href = `./edit.html?id=${encodeURIComponent(editButton.dataset.editCat || '')}`;
  }, true);
})();
