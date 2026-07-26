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
  if (!chart) return '{% layout none %}<p class="sg-empty">No size chart is available for this product.</p>';
  const headers = ['Size'].concat(chart.headers || []);
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = (chart.rows || []).map(row => `<tr><td class="sg-col-size">${row.size}</td>${(row.values || []).map(v => `<td class="size-cell">${v}</td>`).join('')}</tr>`).join('');
  const imageHtml = chart.image_url ? `<div class="sg-image-wrap"><img src="${chart.image_url}" alt="Size chart" class="sg-image"></div>` : '';
  const defaultUnit = (chart.unit || 'cm').toLowerCase() === 'inch' ? 'inch' : 'cm';
  return `
{% layout none %}
<style>
.sg-card { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; animation: sgFadeIn .25s ease; }
@keyframes sgFadeIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
.sg-header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.sg-title { margin:0; font-size:22px; font-weight:700; letter-spacing:-0.02em; }
.sg-unit { display:inline-flex; background:#f3f4f6; border-radius:999px; padding:3px; }
.sg-unit button { border:none; background:transparent; color:#6b7280; font-size:13px; font-weight:600; padding:6px 14px; border-radius:999px; cursor:pointer; }
.sg-unit button[aria-pressed="true"] { background:#008060; color:#fff; box-shadow:0 2px 6px rgba(0,128,96,.25); }
.sg-image-wrap { margin-bottom:18px; border-radius:10px; overflow:hidden; border:1px solid #e5e7eb; }
.sg-image { width:100%; height:auto; display:block; }
.sg-table-wrap { border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
.sg-table { width:100%; border-collapse:collapse; font-size:14px; }
.sg-table th, .sg-table td { padding:12px 10px; text-align:center; }
.sg-table thead { background:#f9fafb; }
.sg-table th { font-weight:700; color:#374151; border-bottom:1px solid #e5e7eb; }
.sg-table tbody tr:not(:last-child) { border-bottom:1px solid #f3f4f6; }
.sg-table tbody tr:hover { background:#f9fafb; }
.sg-col-size { font-weight:700; color:#111827; background:#f9fafb; }
.sg-empty { color:#6b7280; font-size:14px; padding:12px; }
</style>
<div class="sg-card" data-size-guide>
  <div class="sg-header">
    <h3 class="sg-title">Size Guide</h3>
    <div class="sg-unit" role="group" aria-label="Unit">
      <button type="button" data-unit="cm" aria-pressed="${defaultUnit === 'cm'}">cm</button>
      <button type="button" data-unit="inch" aria-pressed="${defaultUnit === 'inch'}">inch</button>
    </div>
  </div>
  ${imageHtml}
  <div class="sg-table-wrap">
    <table class="sg-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>
</div>
<script>
(function(){
  var widget = document.querySelector('[data-size-guide]');
  if (!widget) return;
  var buttons = widget.querySelectorAll('[data-unit]');
  var cells = widget.querySelectorAll('.size-cell');
  var originals = Array.prototype.map.call(cells, function(c){ return c.textContent; });
  function setUnit(unit){
    buttons.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.unit === unit); });
    var factor = unit === 'inch' ? 0.393700787 : 1;
    cells.forEach(function(cell, i){
      cell.textContent = originals[i].replace(/[0-9]+(?:\.[0-9]+)?/g, function(n){ return (Math.round(parseFloat(n) * factor * 10) / 10).toString(); });
    });
  }
  buttons.forEach(function(btn){ btn.addEventListener('click', function(){ setUnit(btn.dataset.unit); }); });
  setUnit('${defaultUnit}');
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
  if (!finder) return '{% layout none %}<p class="ff-empty">Fit finder is not configured.</p>';
  const total = (finder.questions || []).length;
  const slides = (finder.questions || []).map((q, i) => {
    const options = (q.options || []).map((opt, j) => `
      <label class="ff-option" data-opt-index="${j}">
        <input type="radio" name="q${i}" value="${j}">
        <span class="ff-option__box">${opt}</span>
      </label>
    `).join('');
    return `
      <div class="ff-slide" data-question-index="${i}" style="display:none">
        <div class="ff-slide__counter">Question ${i + 1} of ${total}</div>
        <h4 class="ff-slide__text">${q.text}</h4>
        <div class="ff-options">${options}</div>
      </div>
    `;
  }).join('');
  return `
{% layout none %}
<style>
.ff-card { max-width: 560px; margin: 0 auto; padding: 32px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #fff; border-radius: 16px; animation: ffFade .3s ease; }
@keyframes ffFade { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
.ff-header { text-align: center; margin-bottom: 22px; }
.ff-title { font-size: 26px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.02em; }
.ff-subtitle { font-size: 14px; color: #6b7280; margin: 0; }
.ff-progress { height: 6px; background: #e5e7eb; border-radius: 999px; margin-bottom: 24px; overflow: hidden; }
.ff-progress__bar { height: 100%; width: 0%; background: #008060; border-radius: 999px; transition: width .3s ease; }
.ff-slide { animation: ffSlideIn .25s ease; }
@keyframes ffSlideIn { from { opacity:0; transform: translateX(12px); } to { opacity:1; transform: translateX(0); } }
.ff-slide__counter { font-size: 12px; font-weight: 700; color: #008060; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.ff-slide__text { font-size: 18px; font-weight: 700; margin: 0 0 18px; line-height: 1.35; }
.ff-options { display: grid; gap: 10px; }
.ff-option { cursor: pointer; }
.ff-option input { position: absolute; opacity: 0; pointer-events: none; }
.ff-option__box { display: flex; align-items: center; padding: 14px 16px; border: 1.5px solid #e5e7eb; border-radius: 10px; background: #fff; font-size: 15px; font-weight: 500; transition: all .15s ease; color: #374151; }
.ff-option__box:hover { border-color: #008060; background: #f0fdf9; }
.ff-option input:checked + .ff-option__box { border-color: #008060; background: #008060; color: #fff; box-shadow: 0 4px 14px rgba(0,128,96,.22); }
.ff-option__box::before { content: ''; width: 18px; height: 18px; border: 2px solid #d1d5db; border-radius: 50%; margin-right: 12px; transition: all .15s ease; flex-shrink: 0; }
.ff-option input:checked + .ff-option__box::before { border-color: #fff; background: #fff; box-shadow: inset 0 0 0 4px #008060; }
.ff-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; }
.ff-btn { flex: 1; padding: 13px 16px; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; transition: all .15s ease; }
.ff-btn--primary { background: #008060; color: #fff; }
.ff-btn--primary:hover { background: #006e52; }
.ff-btn--secondary { background: #f3f4f6; color: #374151; }
.ff-btn--secondary:hover { background: #e5e7eb; }
.ff-btn:disabled { opacity: .5; cursor: not-allowed; }
.ff-result { display: none; text-align: center; padding: 36px 20px; border-radius: 12px; background: #f0fdf9; border: 1px solid #a7f3d0; animation: ffFade .4s ease; }
.ff-result--visible { display: block; }
.ff-result__label { font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px; }
.ff-result__size { font-size: 56px; font-weight: 900; color: #008060; line-height: 1; }
.ff-result__note { margin-top: 12px; font-size: 14px; color: #065f46; }
.ff-empty { color: #6b7280; font-size: 14px; padding: 12px; }
</style>
<div class="ff-card" data-fit-finder data-results='${JSON.stringify(finder.results || [])}' data-total="${total}">
  <div class="ff-header">
    <h3 class="ff-title">Find your perfect fit</h3>
    <p class="ff-subtitle">Answer ${total} quick question${total === 1 ? '' : 's'} and we'll recommend the best size.</p>
  </div>
  <div class="ff-progress"><div class="ff-progress__bar" data-progress-bar></div></div>
  <form class="ff-form" data-fit-finder-form>
    ${slides}
    <div class="ff-nav" data-nav>
      <button type="button" class="ff-btn ff-btn--secondary" data-prev disabled>Back</button>
      <button type="button" class="ff-btn ff-btn--primary" data-next disabled>Next</button>
    </div>
  </form>
  <div class="ff-result" data-fit-finder-result>
    <div class="ff-result__label">Recommended size</div>
    <div class="ff-result__size" data-fit-finder-size></div>
    <p class="ff-result__note">Based on your answers, this size should fit best.</p>
    <button type="button" class="ff-btn ff-btn--secondary" style="margin-top:18px" data-restart>Start over</button>
  </div>
</div>
<script>
(function(){
  var card = document.querySelector('[data-fit-finder]');
  if (!card) return;
  var form = card.querySelector('[data-fit-finder-form]');
  var slides = Array.prototype.slice.call(form.querySelectorAll('[data-question-index]'));
  var prevBtn = form.querySelector('[data-prev]');
  var nextBtn = form.querySelector('[data-next]');
  var progressBar = card.querySelector('[data-progress-bar]');
  var result = card.querySelector('[data-fit-finder-result]');
  var sizeEl = card.querySelector('[data-fit-finder-size]');
  var restart = card.querySelector('[data-restart]');
  var results = JSON.parse(card.dataset.results || '[]');
  var total = parseInt(card.dataset.total, 10) || slides.length;
  var current = 0;
  var answers = {};

  function show(i){
    slides.forEach(function(s, idx){ s.style.display = idx === i ? 'block' : 'none'; });
    current = i;
    prevBtn.disabled = i === 0;
    nextBtn.textContent = i === total - 1 ? 'Find my size' : 'Next';
    updateNext();
    progressBar.style.width = ((i + (answers[current] != null ? 1 : 0)) / total) * 100 + '%';
  }
  function updateNext(){
    nextBtn.disabled = answers[current] == null;
  }
  function compute(){
    var scores = [];
    for (var k = 0; k < total; k++) scores.push(parseInt(answers[k], 10) || 0);
    var best = null, bestDiff = Infinity;
    results.forEach(function(r){
      var diff = r.scores.reduce(function(sum, s, i){ return sum + Math.abs(s - (scores[i] || 0)); }, 0);
      if (diff < bestDiff) { bestDiff = diff; best = r.size; }
    });
    sizeEl.textContent = best || '—';
    result.classList.add('ff-result--visible');
    form.style.display = 'none';
  }
  form.addEventListener('change', function(e){
    if (e.target.type === 'radio') {
      answers[parseInt(e.target.name.slice(1), 10)] = e.target.value;
      updateNext();
      progressBar.style.width = ((current + 1) / total) * 100 + '%';
      if (current < total - 1) {
        setTimeout(function(){ show(current + 1); }, 180);
      }
    }
  });
  nextBtn.addEventListener('click', function(){
    if (answers[current] == null) return;
    if (current === total - 1) { compute(); return; }
    show(current + 1);
  });
  prevBtn.addEventListener('click', function(){ if (current > 0) show(current - 1); });
  restart.addEventListener('click', function(){
    answers = {};
    form.reset();
    result.classList.remove('ff-result--visible');
    form.style.display = 'block';
    show(0);
  });
  if (slides.length) show(0); else { form.style.display = 'none'; result.classList.add('ff-result--visible'); sizeEl.textContent = '—'; }
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
