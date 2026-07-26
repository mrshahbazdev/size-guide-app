const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');

function getShop(req, res) {
  const sessionShop = res && res.locals && res.locals.shopify && res.locals.shopify.session && res.locals.shopify.session.shop;
  return req.query.shop || req.headers['x-shopify-shop-domain'] || (req.session && req.session.shop) || sessionShop;
}

// Size charts
router.get('/size-charts', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const charts = await db.getCharts(shop);
    res.json({ charts });
  } catch (err) { next(err); }
});

router.get('/size-charts/:id', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const chart = await db.getChartById(shop, req.params.id);
    if (!chart) return res.status(404).json({ error: 'Not found' });
    res.json(chart);
  } catch (err) { next(err); }
});

router.post('/size-charts', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const chart = await db.saveChart({ shop, ...req.body });
    res.json(chart);
  } catch (err) { next(err); }
});

router.put('/size-charts/:id', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const chart = await db.saveChart({ ...req.body, id: req.params.id, shop });
    res.json(chart);
  } catch (err) { next(err); }
});

router.delete('/size-charts/:id', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    await db.deleteChart(shop, req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// CSV export
router.get('/size-charts/export', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const csv = await db.exportChartsCsv(shop);
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="size-charts.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// CSV import
router.post('/size-charts/import', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const csvText = req.body.csv;
    if (!csvText) return res.status(400).json({ error: 'CSV data required' });
    const imported = await db.importChartsCsv(shop, csvText);
    res.json({ success: true, count: imported.length });
  } catch (err) { next(err); }
});

// Preview chart as rendered storefront HTML
router.get('/preview', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    let chart;
    if (req.query.chart_id) {
      chart = await db.getChartById(shop, req.query.chart_id);
    } else {
      chart = (await db.getCharts(shop))[0];
    }
    if (!chart) return res.status(404).send('No chart found');
    // Reuse proxy render but with admin context
    const proxy = require('./proxy');
    const html = proxy.renderSizeChart(chart, { shop });
    res.set('Content-Type', 'text/html');
    res.send(html.replace('{% layout none %}', ''));
  } catch (err) { next(err); }
});

// Fit finder
router.get('/fit-finder', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const finder = await db.getFitFinder(shop);
    res.json({ finder });
  } catch (err) { next(err); }
});

router.post('/fit-finder', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const finder = await db.saveFitFinder({ ...req.body, shop });
    res.json(finder);
  } catch (err) { next(err); }
});

// Analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const days = parseInt(req.query.days, 10) || 30;
    const stats = await db.getAnalytics(shop, { days });
    res.json(stats);
  } catch (err) { next(err); }
});

module.exports = router;
