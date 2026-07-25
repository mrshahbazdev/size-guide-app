require('dotenv').config();
const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { ApiVersion } = require('@shopify/shopify-api');
const path = require('path');
const { JsonSessionStorage } = require('./lib/sessionStorage');
const { log, error, getRecent } = require('./lib/logger');

const PORT = process.env.PORT || 3000;

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
    apiVersion: ApiVersion.July26,
    scopes: ['read_products'],
    hostScheme: process.env.NODE_ENV === 'production' ? 'https' : 'http',
    hostName: process.env.HOST || `localhost:${PORT}`,
    isCustomStoreApp: false,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
  sessionStorage: new JsonSessionStorage(),
});

const { verifyAppProxy } = require('./lib/verifyProxy');
const { verifyHmac } = require('./lib/verifyHmac');
const { adminAuth } = require('./lib/adminAuth');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  log(`${req.method} ${req.url}`);
  next();
});

function hmacCheck(req, res, next) {
  const { shop, host } = req.query;
  log('Root request ' + JSON.stringify({ shop, host, query: Object.keys(req.query) }));
  if (!shop) return res.status(400).send('Shop required');
  if (process.env.NODE_ENV !== 'development' || req.query.hmac || req.query.signature) {
    if (!verifyHmac(req.query, process.env.SHOPIFY_API_SECRET || '')) {
      error('HMAC verification failed');
      return res.status(401).send('Unauthorized');
    }
  }
  next();
}

app.get('/', hmacCheck, shopify.ensureInstalledOnShop(), async (req, res) => {
  const { shop, host } = req.query;

  // Ensure default data for the shop on first load
  try {
    const [charts, finder] = await Promise.all([db.getCharts(shop), db.getFitFinder(shop)]);
    if (!charts.length && !finder) {
      await db.saveChart({
        shop,
        name: 'Standard Apparel',
        unit: 'cm',
        headers: ['Chest', 'Waist', 'Hips'],
        rows: [
          { size: 'S', values: ['88-92', '72-76', '92-96'] },
          { size: 'M', values: ['96-100', '80-84', '100-104'] },
          { size: 'L', values: ['104-108', '88-92', '108-112'] }
        ],
        apply_to: 'types',
        types: 'Shirt,T-Shirt',
        tags: '',
        products: ''
      });
      await db.saveFitFinder({
        shop,
        questions: [
          { text: 'How do you prefer your fit?', options: ['Tight', 'Regular', 'Loose'] },
          { text: 'What is your chest measurement?', options: ['< 90 cm', '90-100 cm', '> 100 cm'] }
        ],
        results: [
          { size: 'S', scores: [0, 0] },
          { size: 'M', scores: [1, 1] },
          { size: 'L', scores: [2, 2] }
        ]
      });
      log('Default size chart and fit finder created for ' + shop);
    }
  } catch (e) {
    error('Default data error: ' + e.message);
  }

  res.set('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="shopify-api-key" content="${process.env.SHOPIFY_API_KEY || ''}">
  <title>Size Guide + Fit Finder</title>
  <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
  <script src="https://unpkg.com/@shopify/app-bridge-utils@3"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #202223; }
    h1 { font-size: 20px; }
    .tabs button { padding: 10px 20px; border: none; background: #f0f0f0; cursor: pointer; margin-right: 4px; }
    .tabs button.active { background: #008060; color: white; }
    .panel { display: none; margin-top: 16px; }
    .panel.active { display: block; }
    label { display: block; margin: 10px 0 4px; font-weight: 600; }
    input, select, textarea { width: 100%; padding: 8px; margin-bottom: 10px; box-sizing: border-box; }
    textarea { min-height: 80px; font-family: monospace; }
    button.save { background: #008060; color: white; padding: 10px 20px; border: none; cursor: pointer; }
    .item { border: 1px solid #ddd; padding: 10px; margin: 8px 0; border-radius: 4px; }
    .item pre { background: #f6f6f7; padding: 8px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Size Guide + Fit Finder</h1>
  <p>Connected shop: <strong>${shop}</strong></p>

  <div class="tabs">
    <button class="active" onclick="showTab('charts')">Size Charts</button>
    <button onclick="showTab('fitfinder')">Fit Finder</button>
  </div>

  <div id="charts" class="panel active">
    <h2>Size Charts</h2>
    <form id="chartForm">
      <input type="hidden" id="chartId">
      <label>Name</label><input id="chartName" required>
      <label>Unit</label><input id="chartUnit" value="cm">
      <label>Headers (comma separated)</label><input id="chartHeaders" placeholder="Chest,Waist,Hips">
      <label>Rows (JSON array)</label><textarea id="chartRows" placeholder='[{\"size\":\"S\",\"values\":[\"88-92\",\"72-76\",\"92-96\"]}]'></textarea>
      <label>Apply to</label>
      <select id="chartApplyTo">
        <option value="all">All products</option>
        <option value="types">Product types</option>
        <option value="tags">Tags</option>
        <option value="products">Specific products</option>
      </select>
      <label>Match values (comma separated)</label><input id="chartMatch" placeholder="Shirt,T-Shirt">
      <button type="submit" class="save">Save Chart</button>
    </form>
    <div id="chartList"></div>
  </div>

  <div id="fitfinder" class="panel">
    <h2>Fit Finder</h2>
    <form id="fitForm">
      <label>Questions (JSON array)</label>
      <textarea id="fitQuestions" placeholder='[{\"text\":\"How do you prefer your fit?\",\"options\":[\"Tight\",\"Regular\",\"Loose\"]}]'></textarea>
      <label>Results (JSON array)</label>
      <textarea id="fitResults" placeholder='[{\"size\":\"S\",\"scores\":[0,0]},{\"size\":\"M\",\"scores\":[1,1]},{\"size\":\"L\",\"scores\":[2,2]}]'></textarea>
      <button type="submit" class="save">Save Fit Finder</button>
    </form>
    <div id="fitDisplay"></div>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop');
    const host = params.get('host');

    const AppBridge = window['app-bridge'];
    let app;
    let authenticatedFetch;
    if (AppBridge && host && shop) {
      const createApp = AppBridge.default || AppBridge.createApp;
      app = createApp({ apiKey: '${process.env.SHOPIFY_API_KEY || ''}', host: host, shopOrigin: shop });
      console.log('App Bridge app created', app);
      authenticatedFetch = AppBridge.utilities && AppBridge.utilities.authenticatedFetch ? AppBridge.utilities.authenticatedFetch(app) : null;
      console.log('authenticatedFetch available', !!authenticatedFetch);
    }

    async function api(path, opts = {}) {
      const url = path + window.location.search;
      const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      const res = await fetch(url, { ...opts, headers });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    async function loadCharts() {
      const { charts } = await api('/api/size-charts');
      const list = document.getElementById('chartList');
      list.innerHTML = charts.length ? '<h3>Saved charts</h3>' : '<p>No charts yet.</p>';
      charts.forEach(c => {
        const el = document.createElement('div');
        el.className = 'item';
        el.innerHTML = '<b>' + (c.name || 'Untitled') + '</b> (' + (c.apply_to || 'all') + ') <button onclick="editChart(' + JSON.stringify(c).replace(/"/g, '&quot;') + ')">Edit</button> <button onclick="deleteChart(' + JSON.stringify(c.id).replace(/"/g, '&quot;') + ')">Delete</button><pre>' + JSON.stringify(c, null, 2) + '</pre>';
        list.appendChild(el);
      });
    }

    window.editChart = function(c) {
      document.getElementById('chartId').value = c.id || '';
      document.getElementById('chartName').value = c.name || '';
      document.getElementById('chartUnit').value = c.unit || '';
      document.getElementById('chartHeaders').value = (c.headers || []).join(',');
      document.getElementById('chartRows').value = JSON.stringify(c.rows || [], null, 2);
      document.getElementById('chartApplyTo').value = c.apply_to || 'all';
      const match = c.apply_to === 'types' ? c.types : c.apply_to === 'tags' ? c.tags : c.products;
      document.getElementById('chartMatch').value = match || '';
    };

    window.deleteChart = async function(id) {
      if (!confirm('Delete?')) return;
      await api('/api/size-charts/' + id, { method: 'DELETE' });
      loadCharts();
    };

    document.getElementById('chartForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('chartId').value;
      const applyTo = document.getElementById('chartApplyTo').value;
      const body = {
        id,
        name: document.getElementById('chartName').value,
        unit: document.getElementById('chartUnit').value,
        headers: document.getElementById('chartHeaders').value.split(',').map(s => s.trim()).filter(Boolean),
        rows: JSON.parse(document.getElementById('chartRows').value || '[]'),
        apply_to: applyTo,
        types: applyTo === 'types' ? document.getElementById('chartMatch').value : '',
        tags: applyTo === 'tags' ? document.getElementById('chartMatch').value : '',
        products: applyTo === 'products' ? document.getElementById('chartMatch').value : ''
      };
      await api(id ? '/api/size-charts/' + id : '/api/size-charts', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(body)
      });
      e.target.reset();
      loadCharts();
    });

    async function loadFitFinder() {
      const { finder } = await api('/api/fit-finder');
      const display = document.getElementById('fitDisplay');
      if (finder) {
        document.getElementById('fitQuestions').value = JSON.stringify(finder.questions || [], null, 2);
        document.getElementById('fitResults').value = JSON.stringify(finder.results || [], null, 2);
        display.innerHTML = '<div class="item"><pre>' + JSON.stringify(finder, null, 2) + '</pre></div>';
      } else {
        display.innerHTML = '<p>No fit finder configured.</p>';
      }
    }

    document.getElementById('fitForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        questions: JSON.parse(document.getElementById('fitQuestions').value || '[]'),
        results: JSON.parse(document.getElementById('fitResults').value || '[]')
      };
      await api('/api/fit-finder', { method: 'POST', body: JSON.stringify(body) });
      loadFitFinder();
    });

    loadCharts();
    loadFitFinder();
  </script>
</body>
</html>`);
});

app.get(shopify.config.auth.path, (req, res, next) => {
  log('OAuth begin ' + JSON.stringify({ shop: req.query.shop }));
  shopify.auth.begin()(req, res, next);
});
app.get(shopify.config.auth.callbackPath, (req, res, next) => {
  log('OAuth callback ' + JSON.stringify({ shop: req.query.shop, code: req.query.code ? 'present' : 'missing' }));
  shopify.auth.callback()(req, res, (err) => {
    if (err) {
      error('OAuth callback error: ' + (err.message || err));
      return res.status(500).send('OAuth callback failed: ' + (err.message || err));
    }
    next();
  });
}, (req, res, next) => {
  log('OAuth callback completed, redirecting');
  next();
}, shopify.redirectToShopifyOrAppRoot());
app.post(shopify.config.webhooks.path, shopify.processWebhooks({ webhookHandlers: {} }));

app.get('/api/health', (req, res) => res.send('ok'));

// Storefront app proxy (single Shopify subpath supports /apps/size-guide and /apps/size-guide/fit-finder)
app.use('/apps/size-guide', require('./routes/proxy'));

// Direct fit-finder route kept for local/development testing
app.use('/apps/fit-finder', require('./routes/fit-finder'));

// Admin API (HMAC or session token)
app.use('/api', adminAuth(shopify), require('./routes/admin'));

app.get('/logs', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(getRecent(req.query.lines ? parseInt(req.query.lines, 10) : 200));
});

app.use(express.static(path.join(__dirname, 'public')));

// Global error handler
app.use((err, req, res, next) => {
  error('Unhandled error: ' + (err.stack || err.message || err));
  res.status(500).send('Internal server error');
});

db.init().then(() => {
  app.listen(PORT, () => log(`Size Guide app listening on port ${PORT}`));
}).catch(err => {
  error('Database init failed, continuing with JSON file storage: ' + (err.message || err));
  app.listen(PORT, () => log(`Size Guide app listening on port ${PORT}`));
});
