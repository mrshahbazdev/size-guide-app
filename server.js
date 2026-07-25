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

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(shopify.config.auth.callbackPath, shopify.auth.callback(), shopify.redirectToShopifyOrAppRoot());
app.post(shopify.config.webhooks.path, shopify.processWebhooks({ webhookHandlers: {} }));

app.get('/api/health', (req, res) => res.send('ok'));

// Storefront app proxy
app.use('/apps/size-guide', require('./routes/size-guide'));
app.use('/apps/fit-finder', require('./routes/fit-finder'));

// Admin API
app.use('/api', shopify.validateAuthenticatedSession(), require('./routes/admin'));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Size Guide app listening on port ${PORT}`));
