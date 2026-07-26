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

const defaultFitFinder = {
  questions: [
    { text: 'How do you prefer your fit?', options: ['Tight', 'Regular', 'Loose'] },
    { text: 'What is your chest measurement?', options: ['< 90 cm', '90-100 cm', '> 100 cm'] }
  ],
  results: [
    { size: 'S', scores: [0, 0] },
    { size: 'M', scores: [1, 1] },
    { size: 'L', scores: [2, 2] }
  ]
};

async function ensureFitFinderForShop(shop) {
  let finder = await db.getFitFinder(shop);
  if (finder) return finder;
  finder = { ...defaultFitFinder, shop };
  return db.saveFitFinder(finder);
}

const defaultChart = {
  name: 'Standard Apparel',
  unit: 'cm',
  headers: ['Chest', 'Waist', 'Hips'],
  rows: [
    { size: 'S', values: ['88-92', '72-76', '92-96'] },
    { size: 'M', values: ['96-100', '80-84', '100-104'] },
    { size: 'L', values: ['104-108', '88-92', '108-112'] }
  ],
  apply_to: 'all',
  types: '',
  tags: '',
  products: ''
};

async function ensureChartForShop(shop) {
  const charts = await db.getCharts(shop);
  if (charts.length) return charts[0];
  const chart = { ...defaultChart, shop };
  return db.saveChart(chart);
}

function renderSizeChart(chart) {
  if (!chart) return '<p>No size chart is available for this product.</p>';
  const headers = ['Size'].concat(chart.headers || []);
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = (chart.rows || []).map(row => `<tr><td>${row.size}</td>${(row.values || []).map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
  return `
<div class="size-guide" data-size-guide>
  <h3 class="size-guide__title">Size Guide</h3>
  <p class="size-guide__unit">Unit: ${chart.unit}</p>
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
  if (!finder) return '<p>Fit finder is not configured.</p>';
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
  <h3 class="fit-finder__title">Find your fit</h3>
  <form class="fit-finder__form" data-fit-finder-form>
    ${questions}
    <button type="submit" class="button button--primary">Find my size</button>
  </form>
  <div class="fit-finder__result hidden" data-fit-finder-result>
    <p>Recommended size: <strong data-fit-finder-size></strong></p>
  </div>
</div>
<script>
(function(){
  var form = document.querySelector('[data-fit-finder-form]');
  var result = document.querySelector('[data-fit-finder-result]');
  var sizeEl = document.querySelector('[data-fit-finder-size]');
  var results = JSON.parse(document.querySelector('[data-fit-finder]').dataset.results || '[]');
  if (!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var scores = [];
    form.querySelectorAll('[data-question-index]').forEach(function(q){
      var selected = q.querySelector('input[type="radio"]:checked');
      scores.push(selected ? parseInt(selected.value, 10) : 0);
    });
    var best = null, bestDiff = Infinity;
    results.forEach(function(r){
      var diff = r.scores.reduce(function(sum, s, i){ return sum + Math.abs(s - (scores[i] || 0)); }, 0);
      if (diff < bestDiff) { bestDiff = diff; best = r.size; }
    });
    sizeEl.textContent = best || '—';
    result.classList.remove('hidden');
  });
})();
</script>`;
}

// Default size guide
router.get('/', proxyAuth, async (req, res, next) => {
  try {
    const shop = req.query.shop;
    if (!shop) return res.status(400).send('Shop required');
    const product = getProductFromQuery(req.query);
    let chart = await db.findChartForProduct(shop, product);
    if (!chart) chart = await ensureChartForShop(shop);
    res.set('Content-Type', 'application/liquid');
    res.send(renderSizeChart(chart));
  } catch (err) { next(err); }
});

// Fit finder at child path
router.get('/fit-finder', proxyAuth, async (req, res, next) => {
  try {
    const shop = req.query.shop;
    if (!shop) return res.status(400).send('Shop required');
    const finder = await ensureFitFinderForShop(shop);
    res.set('Content-Type', 'application/liquid');
    res.send(renderFitFinder(finder));
  } catch (err) { next(err); }
});

module.exports = router;
