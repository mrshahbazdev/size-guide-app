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
</div>
  `;
}

router.get('/', proxyAuth, (req, res) => {
  const { shop, product_type, tags, handle } = req.query;
  if (!shop) return res.status(400).send('Shop required');
  const product = {
    product_type: product_type || '',
    tags: (tags || '').split(',').filter(Boolean),
    handle: handle || ''
  };
  const chart = db.findChartForProduct(shop, product);
  res.set('Content-Type', 'application/liquid');
  res.send(renderSizeChart(chart));
});

module.exports = router;
