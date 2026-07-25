const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAppProxy } = require('../lib/verifyProxy');

const apiSecret = process.env.SHOPIFY_API_SECRET || '';

function proxyAuth(req, res, next) {
  if (process.env.NODE_ENV === 'development' && !req.query.signature) return next();
  if (!verifyAppProxy(req.query, apiSecret)) return res.status(401).json({ error: 'Invalid signature' });
  next();
}

function renderSizeChart(chart) {
  if (!chart) return '<p>{{ "size_guide.no_chart" | t }}</p>';
  const headers = ['Size'].concat(chart.headers || []);
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = (chart.rows || []).map(row => `<tr><td>${row.size}</td>${(row.values || []).map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
  return `
<div class="size-guide" data-size-guide>
  <h3 class="size-guide__title">{{ 'size_guide.title' | t }}</h3>
  <p class="size-guide__unit">{{ 'size_guide.unit' | t }}: ${chart.unit}</p>
  <table class="size-guide__table">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</div>`;
}

function getProductFromQuery(q) {
  return {
    product_type: q.product_type || '',
    tags: (q.tags || '').split(',').filter(Boolean),
    handle: q.handle || ''
  };
}

function renderFitFinder(finder) {
  if (!finder) return '<p>{{ "fit_finder.not_configured" | t }}</p>';
  const questions = (finder.questions || []).map((q, i) => `
    <div class="fit-finder__question" data-question-index="${i}">
      <p class="fit-finder__question-text">${q.text}</p>
      <div class="fit-finder__options">
        ${(q.options || []).map((opt, j) => `<label><input type="radio" name="q${i}" value="${j}" required> ${opt}</label>`).join('')}
      </div>
    </div>
  `).join('');
  return `
<div class="fit-finder" data-fit-finder data-results='${JSON.stringify(finder.results || [])}'>
  <h3 class="fit-finder__title">{{ 'fit_finder.title' | t }}</h3>
  <form class="fit-finder__form" data-fit-finder-form>
    ${questions}
    <button type="submit" class="button button--primary">{{ 'fit_finder.find_size' | t }}</button>
  </form>
  <div class="fit-finder__result hidden" data-fit-finder-result>
    <p>{{ 'fit_finder.recommended' | t }}: <strong data-fit-finder-size></strong></p>
  </div>
</div>
<script src="{{ 'fit-finder.js' | asset_url }}" defer></script>`;
}

router.get('/', proxyAuth, (req, res) => {
  const shop = req.query.shop;
  const extraPath = (req.query.extra_path || '').replace(/^\//, '');
  if (!shop) return res.status(400).send('Shop required');

  if (extraPath === 'fit-finder') {
    const finder = db.getFitFinder(shop);
    res.set('Content-Type', 'application/liquid');
    return res.send(renderFitFinder(finder));
  }

  const product = getProductFromQuery(req.query);
  const chart = db.findChartForProduct(shop, product);
  res.set('Content-Type', 'application/liquid');
  res.send(renderSizeChart(chart));
});

module.exports = router;
