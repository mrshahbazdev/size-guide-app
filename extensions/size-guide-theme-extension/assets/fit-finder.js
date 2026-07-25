(() => {
  const widget = document.querySelector('[data-fit-finder]');
  if (!widget) return;

  const results = JSON.parse(widget.dataset.results || '[]');
  const form = widget.querySelector('[data-fit-finder-form]');
  const resultBox = widget.querySelector('[data-fit-finder-result]');
  const sizeEl = widget.querySelector('[data-fit-finder-size]');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const answers = [];
      let i = 0;
      while (data.has(`q${i}`)) {
        answers.push(parseInt(data.get(`q${i}`), 10));
        i++;
      }

      let best = null;
      for (const r of results) {
        const score = answers.reduce((sum, a, idx) => sum + (r.scores[idx] === a ? 1 : 0), 0);
        if (!best || score > best.score) best = { ...r, score };
      }

      if (best && resultBox && sizeEl) {
        sizeEl.textContent = best.size;
        resultBox.classList.remove('hidden');
      }
    });
  }
})();
