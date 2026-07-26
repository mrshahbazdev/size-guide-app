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
  priority: 0,
  image_url: '',
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
  if (!chart) return '{% layout none %}<p>No size chart is available for this product.</p>';
  const headers = ['Size'].concat(chart.headers || []);
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = (chart.rows || []).map(row => `<tr><td>${row.size}</td>${(row.values || []).map(v => `<td class="size-cell">${v}</td>`).join('')}</tr>`).join('');
  const imageHtml = chart.image_url ? `<img src="${chart.image_url}" alt="Size chart" class="size-guide__image">` : '';
  const defaultUnit = (chart.unit || 'cm').toLowerCase() === 'inch' ? 'inch' : 'cm';
  return `
{% layout none %}
<style>
.size-guide { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; }
.size-guide__header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.size-guide__title { margin:0; font-size:20px; }
.size-guide__unit-row { display:flex; align-items:center; gap:8px; font-size:13px; color:#6b7280; }
.size-guide__unit-row select { border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:13px; }
.size-guide__image { max-width:100%; height:auto; border-radius:6px; margin-bottom:16px; display:block; }
.size-guide__table { width:100%; border-collapse:collapse; margin-top:8px; font-size:14px; }
.size-guide__table th, .size-guide__table td { border:1px solid #e5e7eb; padding:10px 8px; text-align:center; }
.size-guide__table th { background:#f9fafb; font-weight:600; }
.size-guide__table tr:nth-child(even) { background:#fafafa; }
</style>
<div class="size-guide" data-size-guide>
  <div class="size-guide__header">
    <h3 class="size-guide__title">Size Guide</h3>
    <label class="size-guide__unit-row">
      Unit:
      <select data-unit-toggle data-default="${defaultUnit}">
        <option value="cm" ${defaultUnit === 'cm' ? 'selected' : ''}>cm</option>
        <option value="inch" ${defaultUnit === 'inch' ? 'selected' : ''}>inch</option>
      </select>
    </label>
  </div>
  ${imageHtml}
  <table class="size-guide__table">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</div>
<script>
(function(){
  var widget = document.querySelector('[data-size-guide]');
  if (!widget) return;
  var toggle = widget.querySelector('[data-unit-toggle]');
  var table = widget.querySelector('.size-guide__table');
  var cells = table.querySelectorAll('.size-cell');
  var originals = [];
  cells.forEach(function(cell){ originals.push(cell.textContent); cell.dataset.orig = cell.textContent; });
  function convert(unit){
    var factor = unit === 'inch' ? 0.393700787 : 1;
    cells.forEach(function(cell, i){
      cell.textContent = originals[i].replace(/[0-9]+(?:\.[0-9]+)?/g, function(n){ return (Math.round(parseFloat(n) * factor * 10) / 10).toString(); });
    });
  }
  toggle.addEventListener('change', function(){ convert(toggle.value); });
  convert(toggle.value);
})();
</script>`;
}

function getProductFromQuery(q) {
  return {
    product_type: q.product_type || '',
    tags: (q.tags || '').split(',').filter(Boolean),
    handle: q.handle || ''
  };
}

function renderFitFinder(finder) {
  if (!finder) return '{% layout none %}<p>Fit finder is not configured.</p>';
  const questions = (finder.questions || []).map((q, i) => {
    const options = (q.options || []).map((opt, j) => `
      <label class="fit-option">
        <input type="radio" name="q${i}" value="${j}" required>
        <span class="fit-option__box">${opt}</span>
      </label>
    `).join('');
    return `
      <div class="fit-question" data-question-index="${i}">
        <div class="fit-question__number">Question ${i + 1}</div>
        <h4 class="fit-question__text">${q.text}</h4>
        <div class="fit-options">${options}</div>
      </div>
    `;
  }).join('');
  return `
{% layout none %}
<style>
.fit-finder-card {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #1f2937;
  background: #ffffff;
  border-radius: 12px;
}
.fit-finder-card__header {
  text-align: center;
  margin-bottom: 28px;
}
.fit-finder-card__title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px;
}
.fit-finder-card__subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}
.fit-question {
  margin-bottom: 24px;
}
.fit-question__number {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #008060;
  margin-bottom: 6px;
}
.fit-question__text {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 14px;
}
.fit-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.fit-option {
  cursor: pointer;
  display: flex;
}
.fit-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.fit-option__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 18px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
  color: #374151;
}
.fit-option:hover .fit-option__box {
  border-color: #008060;
  background: #f0fdf9;
}
.fit-option input:checked + .fit-option__box {
  border-color: #008060;
  background: #008060;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 128, 96, 0.25);
}
.fit-finder__submit {
  width: 100%;
  margin-top: 8px;
  padding: 14px 20px;
  border: none;
  border-radius: 8px;
  background: #008060;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}
.fit-finder__submit:hover { background: #006e52; }
.fit-finder__submit:disabled { background: #9ca3af; cursor: not-allowed; }
.fit-result {
  display: none;
  margin-top: 24px;
  text-align: center;
  padding: 28px 20px;
  border-radius: 10px;
  background: #f0fdf9;
  border: 1px solid #a7f3d0;
}
.fit-result--visible { display: block; }
.fit-result__label {
  font-size: 13px;
  color: #047857;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.fit-result__size {
  font-size: 42px;
  font-weight: 800;
  color: #008060;
  line-height: 1;
}
.fit-result__note {
  margin-top: 10px;
  font-size: 13px;
  color: #065f46;
}
</style>
<div class="fit-finder-card" data-fit-finder data-results='${JSON.stringify(finder.results || [])}'>
  <div class="fit-finder-card__header">
    <h3 class="fit-finder-card__title">Find your perfect fit</h3>
    <p class="fit-finder-card__subtitle">Answer a couple of quick questions and we'll recommend the best size.</p>
  </div>
  <form class="fit-finder__form" data-fit-finder-form>
    ${questions}
    <button type="submit" class="fit-finder__submit">Find my size</button>
  </form>
  <div class="fit-result" data-fit-finder-result>
    <div class="fit-result__label">Recommended size</div>
    <div class="fit-result__size" data-fit-finder-size></div>
    <p class="fit-result__note">Based on your answers, this size should fit best.</p>
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
    var valid = true;
    var scores = [];
    form.querySelectorAll('[data-question-index]').forEach(function(q){
      var selected = q.querySelector('input[type="radio"]:checked');
      if (!selected) valid = false;
      scores.push(selected ? parseInt(selected.value, 10) : 0);
    });
    if (!valid) { alert('Please answer all questions.'); return; }
    var best = null, bestDiff = Infinity;
    results.forEach(function(r){
      var diff = r.scores.reduce(function(sum, s, i){ return sum + Math.abs(s - (scores[i] || 0)); }, 0);
      if (diff < bestDiff) { bestDiff = diff; best = r.size; }
    });
    sizeEl.textContent = best || '—';
    result.classList.add('fit-result--visible');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
