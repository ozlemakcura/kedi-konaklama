(() => {
  setInterval(() => {
    const button = document.querySelector('#cat-form button[type="submit"]');
    if (button) button.removeAttribute('disabled');
  }, 250);
})();
