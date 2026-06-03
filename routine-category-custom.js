(() => {
  if (!location.pathname.endsWith('/routine.html')) return;

  function replaceCategorySelect() {
    const current = document.getElementById('routine-category');
    if (!current || current.tagName === 'INPUT' || current.dataset.customCategoryReady === '1') return;

    const input = document.createElement('input');
    input.id = 'routine-category';
    input.type = 'text';
    input.placeholder = 'Örn: Kalp ilacı, sabah takviyesi, özel mama';
    input.value = current.value || '';
    input.dataset.customCategoryReady = '1';
    current.replaceWith(input);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceCategorySelect);
  } else {
    replaceCategorySelect();
  }

  new MutationObserver(replaceCategorySelect).observe(document.body, { childList: true, subtree: true });
})();
