(() => {
  function buildProxyUrl(el) {
    const shop = el.dataset.shop || window.sizeGuideShop;
    const type = encodeURIComponent(el.dataset.productType || '');
    const tags = encodeURIComponent(el.dataset.productTags || '');
    const handle = encodeURIComponent(el.dataset.productHandle || '');
    const collections = encodeURIComponent(el.dataset.collectionHandles || '');
    const customerId = encodeURIComponent(el.dataset.loggedInCustomerId || '');
    const customerTags = encodeURIComponent(el.dataset.customerTags || '');
    const price = encodeURIComponent(el.dataset.productPrice || '');
    const available = encodeURIComponent(el.dataset.productAvailable || '');
    const proxyUrl = el.dataset.appProxyUrl || '/apps/size-guide';
    return `${proxyUrl}?shop=${encodeURIComponent(shop)}&product_type=${type}&tags=${tags}&handle=${handle}&collection_handles=${collections}&logged_in_customer_id=${customerId}&customer_tags=${customerTags}&price=${price}&available=${available}`;
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
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          io.unobserve(entry.target);
          fetchSizeGuide(entry.target, entry.target);
        }
      });
    }, { rootMargin: '200px' });
    inlineContainers.forEach(container => io.observe(container));
  } else {
    inlineContainers.forEach(container => fetchSizeGuide(container, container));
  }
})();
