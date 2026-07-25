require('dotenv').config();
const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { ApiVersion } = require('@shopify/shopify-api');
const path = require('path');

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
});

const { verifyAppProxy } = require('./lib/verifyProxy');
const { verifyHmac } = require('./lib/verifyHmac');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const { shop, host } = req.query;
  if (!shop) return res.status(400).send('Shop required');
  if (process.env.NODE_ENV !== 'development' || req.query.hmac || req.query.signature) {
    if (!verifyHmac(req.query, process.env.SHOPIFY_API_SECRET || '')) {
      return res.status(401).send('Unauthorized');
    }
  }
  res.set('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Size Guide + Fit Finder</title>
  <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
</head>
<body style="font-family: sans-serif; padding: 20px;">
  <div id="app">
    <h1>Size Guide + Fit Finder</h1>
    <p>Connected shop: <strong id="shop-name"></strong></p>
    <p>Status: installed</p>
  </div>
  <script>
    const params = new URLSearchParams(window.location.search);
    document.getElementById('shop-name').textContent = params.get('shop');
    const host = params.get('host');
    const shop = params.get('shop');
    if (window['app-bridge'] && host && shop) {
      window['app-bridge'].createApp({ apiKey: '${process.env.SHOPIFY_API_KEY || ''}', host: host, shopOrigin: shop });
    }
  </script>
</body>
</html>`);
});

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(shopify.config.auth.callbackPath, shopify.auth.callback(), shopify.redirectToShopifyOrAppRoot());
app.post(shopify.config.webhooks.path, shopify.processWebhooks({ webhookHandlers: {} }));

app.get('/api/health', (req, res) => res.send('ok'));

// Storefront app proxy (single Shopify subpath supports /apps/size-guide and /apps/size-guide/fit-finder)
app.use('/apps/size-guide', require('./routes/proxy'));

// Direct fit-finder route kept for local/development testing
app.use('/apps/fit-finder', require('./routes/fit-finder'));

// Admin API
app.use('/api', shopify.validateAuthenticatedSession(), require('./routes/admin'));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Size Guide app listening on port ${PORT}`));
