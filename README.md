# Size Guide + Fit Finder — Shopify App

A self-contained Shopify app that adds a **size guide modal** and **fit finder widget** to product pages without relying on any third-party service.

## Features

- **Size guide app block** on product pages — opens a modal with a table
- **Fit finder page** — customers answer questions and get a recommended size
- **Admin API** — manage size charts and fit finder questions per shop
- **Smart matching** — size charts can target all products, product types, tags, or specific product handles
- **No third-party APIs** — uses Shopify Admin API and local JSON storage

## Tech stack

- Node.js + Express
- `@shopify/shopify-api` + `@shopify/shopify-app-express`
- JSON file storage (replace with PostgreSQL/MySQL for production)
- Theme app extension blocks

## Setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in `.env` with your Shopify Partner app credentials:
   ```
   SHOPIFY_API_KEY=your_api_key
   SHOPIFY_API_SECRET=your_api_secret
   HOST=your-ngrok-or-cloud-url
   ```

3. Update `shopify.app.toml` with your app URL and redirect URLs.

4. Install and run:
   ```bash
   npm install
   npm start
   ```

## Admin API

- `GET /api/size-charts?shop=...` — list size charts
- `POST /api/size-charts` — create/update size chart
- `DELETE /api/size-charts/:id` — delete size chart
- `GET /api/fit-finder?shop=...` — get fit finder
- `POST /api/fit-finder` — save fit finder

### Size chart payload example

```json
{
  "name": "Standard Apparel",
  "unit": "cm",
  "headers": ["Chest", "Waist", "Hips"],
  "rows": [
    {"size": "S", "values": ["88-92", "72-76", "92-96"]},
    {"size": "M", "values": ["96-100", "80-84", "100-104"]}
  ],
  "apply_to": "types",
  "types": "Shirt,T-Shirt",
  "tags": "",
  "products": ""
}
```

## Storefront app proxy

- `/apps/size-guide?shop=...&product_type=...&tags=...&handle=...` — returns Liquid size chart table
- `/apps/fit-finder?shop=...` — returns fit finder widget

## Theme setup

1. Deploy the theme app extension:
   ```bash
   npx shopify app deploy
   ```

2. In the theme editor, add the **Size guide button** app block to the product template.

3. Create a page linked to `/apps/fit-finder` for the fit finder, or add the **Fit finder** app block to a section.

## Production notes

- Replace JSON file storage with a real database for multi-tenant scale.
- Add webhook handlers for `APP_UNINSTALLED` and GDPR.
- Add billing config if selling on the Shopify App Store.
