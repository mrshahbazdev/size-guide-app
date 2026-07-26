const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
const email = require('../lib/email');

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

// Duplicate chart within the same shop
router.post('/size-charts/:id/duplicate', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const original = await db.getChartById(shop, req.params.id);
    if (!original) return res.status(404).json({ error: 'Not found' });
    const { id, ...rest } = original;
    const copy = await db.saveChart({ ...rest, name: original.name + ' (Copy)', shop, priority: 0 });
    res.json(copy);
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
async function previewChart(req, res, next) {
  try {
    const shop = getShop(req, res);
    let chart;
    if (req.params.chartId) {
      chart = await db.getChartById(shop, req.params.chartId);
    } else {
      chart = (await db.getCharts(shop))[0];
    }
    if (!chart) return res.status(404).send('No chart found');
    const proxy = require('./proxy');
    const html = proxy.renderSizeChart(chart, { shop });
    res.set('Content-Type', 'text/html');
    res.send(html.replace('{% layout none %}', ''));
  } catch (err) { next(err); }
}
router.get('/preview/:chartId', previewChart);
router.get('/preview', previewChart);

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

// Customer measurement history
router.get('/customer-measurements/:customerId', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const history = await db.getMeasurementHistory(shop, req.params.customerId, { limit: parseInt(req.query.limit, 10) || 20 });
    res.json({ history });
  } catch (err) { next(err); }
});

// Analytics (POST so days can be passed in body without breaking HMAC query)
router.post('/analytics', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const days = parseInt(req.body.days, 10) || 30;
    const stats = await db.getAnalytics(shop, { days });
    res.json(stats);
  } catch (err) { next(err); }
});

// Send weekly analytics email report to the merchant
router.post('/email-report', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const { to, days = 7 } = req.body;
    if (!to) return res.status(400).json({ error: 'to email required' });
    const stats = await db.getAnalytics(shop, { days: parseInt(days, 10) || 7 });
    const result = await email.sendWeeklyReport({ to, shop, stats, period: `last ${days} days` });
    res.json(result);
  } catch (err) { next(err); }
});

// Publish selected chart to a Shopify product metafield so merchants can render it in their theme without the app block
router.post('/publish-metafield', async (req, res, next) => {
  try {
    const shop = getShop(req, res);
    const { product_handle, chart_id } = req.body;
    if (!product_handle || !chart_id) return res.status(400).json({ error: 'product_handle and chart_id required' });
    const chart = await db.getChartById(shop, chart_id);
    if (!chart) return res.status(404).json({ error: 'Chart not found' });
    const shopify = req.app.get('shopify');
    if (!shopify) return res.status(500).json({ error: 'Shopify not configured' });
    const offlineId = shopify.api.session.getOfflineId(shop);
    const session = await shopify.config.sessionStorage.loadSession(offlineId);
    if (!session || !session.accessToken) return res.status(401).json({ error: 'No offline token. Re-install the app to grant write_products.' });
    const client = new shopify.api.clients.Graphql({ session });
    const productQuery = `
      query getProduct($handle: String!) {
        productByHandle(handle: $handle) { id }
      }
    `;
    const productRes = await client.query({ data: { query: productQuery, variables: { handle: product_handle } } });
    const productId = productRes.body.data.productByHandle?.id;
    if (!productId) return res.status(404).json({ error: 'Product not found' });
    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;
    const chartJson = JSON.stringify({ name: chart.name, unit: chart.unit, headers: chart.headers, rows: chart.rows });
    const metafieldRes = await client.query({ data: { query: mutation, variables: { metafields: [{ ownerId: productId, namespace: 'size_guide', key: 'chart', type: 'json', value: chartJson }] } } });
    const userErrors = metafieldRes.body.data.metafieldsSet.userErrors;
    if (userErrors && userErrors.length) return res.status(400).json({ error: userErrors[0].message });
    res.json({ success: true, metafield_id: metafieldRes.body.data.metafieldsSet.metafields[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
