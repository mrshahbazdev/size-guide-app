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

    const template = fs.readFileSync(path.join(__dirname, 'views', 'admin.html'), 'utf8');
  res.set('Content-Type', 'text/html');
  res.send(template
    .replace(/{{SHOP}}/g, shop || '')
    .replace(/{{API_KEY}}/g, process.env.SHOPIFY_API_KEY || ''));
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
