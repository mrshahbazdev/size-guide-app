const express = require('express');
const router = express.Router();
const db = require('../db');

// Size charts
router.get('/size-charts', (req, res) => {
  res.json({ charts: db.getCharts(req.query.shop) });
});

router.get('/size-charts/:id', (req, res) => {
  const chart = db.getChartById(req.query.shop, req.params.id);
  if (!chart) return res.status(404).json({ error: 'Not found' });
  res.json(chart);
});

router.post('/size-charts', (req, res) => {
  const chart = db.saveChart({ shop: req.query.shop, ...req.body });
  res.json(chart);
});

router.put('/size-charts/:id', (req, res) => {
  const chart = db.saveChart({ ...req.body, id: req.params.id, shop: req.query.shop });
  res.json(chart);
});

router.delete('/size-charts/:id', (req, res) => {
  db.deleteChart(req.query.shop, req.params.id);
  res.json({ success: true });
});

// Fit finder
router.get('/fit-finder', (req, res) => {
  res.json({ finder: db.getFitFinder(req.query.shop) });
});

router.post('/fit-finder', (req, res) => {
  const finder = db.saveFitFinder({ ...req.body, shop: req.query.shop });
  res.json(finder);
});

module.exports = router;
