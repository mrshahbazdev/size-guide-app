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

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  log(`${req.method} ${req.url}`);
  next();
});

app.get('/', async (req, res) => {
  const { shop, host } = req.query;
  log('Root request ' + JSON.stringify({ shop, host, query: Object.keys(req.query) }));
  if (!shop) return res.status(400).send('Shop required');
  if (process.env.NODE_ENV !== 'development' || req.query.hmac || req.query.signature) {
    if (!verifyHmac(req.query, process.env.SHOPIFY_API_SECRET || '')) {
      error('HMAC verification failed');
      return res.status(401).send('Unauthorized');
    }
  }

  // If no active session for this shop, start OAuth
  try {
    const sessions = await shopify.config.sessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      log('No session found, redirecting to OAuth ' + shop);
      return res.redirect(`/api/auth?shop=${encodeURIComponent(shop)}`);
    }
  } catch (e) {
    error('Session lookup error: ' + e.message);
  }

  res.set('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Size Guide + Fit Finder</title>
</head>
<body style="font-family: sans-serif; padding: 20px;">
  <div id="app">
    <h1>Size Guide + Fit Finder</h1>
    <p>Connected shop: <strong>${shop}</strong></p>
    <p>Status: installed</p>
    <p>Go to Online Store > Themes > Customize and add the <strong>Size guide button</strong> app block to your product page.</p>
  </div>
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

// Admin API
app.use('/api', shopify.validateAuthenticatedSession(), require('./routes/admin'));

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

app.listen(PORT, () => log(`Size Guide app listening on port ${PORT}`));
