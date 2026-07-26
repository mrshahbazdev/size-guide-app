(() => {
  const buttons = document.querySelectorAll('[data-fit-finder-open]');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const wrapper = btn.closest('.fit-finder-button-wrapper');
      const modal = wrapper ? wrapper.querySelector('[data-fit-finder-modal]') : document.querySelector('[data-fit-finder-modal]');
      if (!modal) return;
      const content = modal.querySelector('[data-fit-finder-content]');
      if (content) {
        try {
          const res = await fetch(btn.dataset.fitFinderUrl);
          const html = await res.text();
          content.innerHTML = html;
        } catch (e) {
          content.innerHTML = '<p>Could not load fit finder.</p>';
        }
      }
      modal.classList.remove('hidden');
    });
  });

  document.querySelectorAll('[data-fit-finder-modal]').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-fit-finder-close') || e.target === modal || e.target.closest('[data-fit-finder-close]')) {
        modal.classList.add('hidden');
      }
    });
  });
})();
