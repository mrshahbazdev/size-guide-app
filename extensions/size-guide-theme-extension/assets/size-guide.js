(() => {
  function buildProxyUrl(el) {
    const shop = el.dataset.shop || window.sizeGuideShop;
    const type = encodeURIComponent(el.dataset.productType || '');
    const tags = encodeURIComponent(el.dataset.productTags || '');
    const handle = encodeURIComponent(el.dataset.productHandle || '');
    const proxyUrl = el.dataset.appProxyUrl || '/apps/size-guide';
    return `${proxyUrl}?shop=${encodeURIComponent(shop)}&product_type=${type}&tags=${tags}&handle=${handle}`;
  }

  async function fetchSizeGuide(el, target) {
    try {
      const res = await fetch(buildProxyUrl(el));
      const html = await res.text();
      target.innerHTML = html;
    } catch (e) {
      target.innerHTML = '<p>Could not load size guide.</p>';
    }
  }

  const buttons = document.querySelectorAll('[data-size-guide-open]');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const wrapper = btn.closest('.size-guide-button-wrapper');
      const modal = wrapper ? wrapper.parentElement.querySelector('[data-size-guide-modal]') : document.querySelector('[data-size-guide-modal]');
      if (!modal) return;
      modal.classList.remove('hidden');
      const content = modal.querySelector('[data-size-guide-content]');
      if (content) await fetchSizeGuide(btn, content);
    });
  });

  document.querySelectorAll('[data-size-guide-modal]').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-size-guide-close') || e.target === modal || e.target.closest('[data-size-guide-close]')) {
        modal.classList.add('hidden');
      }
    });
  });

  const inlineContainers = document.querySelectorAll('[data-size-guide-inline]');
  inlineContainers.forEach(container => {
    fetchSizeGuide(container, container);
  });
})();
