const express = require('express');
const router = express.Router();
const db = require('../db');

// Size charts
router.get('/size-charts', async (req, res, next) => {
  try {
    const charts = await db.getCharts(req.query.shop);
    res.json({ charts });
  } catch (err) { next(err); }
});

router.get('/size-charts/:id', async (req, res, next) => {
  try {
    const chart = await db.getChartById(req.query.shop, req.params.id);
    if (!chart) return res.status(404).json({ error: 'Not found' });
    res.json(chart);
  } catch (err) { next(err); }
});

router.post('/size-charts', async (req, res, next) => {
  try {
    const chart = await db.saveChart({ shop: req.query.shop, ...req.body });
    res.json(chart);
  } catch (err) { next(err); }
});

router.put('/size-charts/:id', async (req, res, next) => {
  try {
    const chart = await db.saveChart({ ...req.body, id: req.params.id, shop: req.query.shop });
    res.json(chart);
  } catch (err) { next(err); }
});

router.delete('/size-charts/:id', async (req, res, next) => {
  try {
    await db.deleteChart(req.query.shop, req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Fit finder
router.get('/fit-finder', async (req, res, next) => {
  try {
    const finder = await db.getFitFinder(req.query.shop);
    res.json({ finder });
  } catch (err) { next(err); }
});

router.post('/fit-finder', async (req, res, next) => {
  try {
    const finder = await db.saveFitFinder({ ...req.body, shop: req.query.shop });
    res.json(finder);
  } catch (err) { next(err); }
});

module.exports = router;
