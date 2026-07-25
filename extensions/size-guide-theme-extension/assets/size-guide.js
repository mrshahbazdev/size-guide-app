(() => {
  const buttons = document.querySelectorAll('[data-size-guide-open]');
  const modals = document.querySelectorAll('[data-size-guide-modal]');

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const modal = btn.parentElement.querySelector('[data-size-guide-modal]') || document.querySelector('[data-size-guide-modal]');
      if (!modal) return;
      modal.classList.remove('hidden');
      const content = modal.querySelector('[data-size-guide-content]');
      if (!content) return;

      const shop = btn.dataset.shop || window.sizeGuideShop;
      const type = encodeURIComponent(btn.dataset.productType || '');
      const tags = encodeURIComponent(btn.dataset.productTags || '');
      const handle = encodeURIComponent(btn.dataset.productHandle || '');
      const proxyUrl = btn.dataset.appProxyUrl || '/apps/size-guide';

      try {
        const res = await fetch(`${proxyUrl}?shop=${encodeURIComponent(shop)}&product_type=${type}&tags=${tags}&handle=${handle}`);
        const html = await res.text();
        content.innerHTML = html;
      } catch (e) {
        content.innerHTML = '<p>Could not load size guide.</p>';
      }
    });
  });

  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-size-guide-close') || e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
})();
