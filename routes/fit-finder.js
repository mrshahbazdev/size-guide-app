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

router.get('/', proxyAuth, (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Shop required');
  const finder = db.getFitFinder(shop);
  if (!finder) return res.set('Content-Type', 'application/liquid').send('<p>{{ "fit_finder.not_configured" | t }}</p>');

  const questions = (finder.questions || []).map((q, i) => `
    <div class="fit-finder__question" data-question-index="${i}">
      <p class="fit-finder__question-text">${q.text}</p>
      <div class="fit-finder__options">
        ${(q.options || []).map((opt, j) => `<label><input type="radio" name="q${i}" value="${j}" required> ${opt}</label>`).join('')}
      </div>
    </div>
  `).join('');

  const results = (finder.results || []).map((r, i) => `<option value="${i}">${r.size}</option>`).join('');

  res.set('Content-Type', 'application/liquid');
  res.send(`
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
<script src="{{ 'fit-finder.js' | asset_url }}" defer></script>
  `);
});

module.exports = router;
