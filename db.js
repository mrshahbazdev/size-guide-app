require('dotenv').config();
const fs = require('fs');
const path = require('path');

let mysql;
let pool;
let jsonDb;

const useMysql = process.env.DB_HOST && process.env.DB_DATABASE;

if (useMysql) {
  try {
    mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  } catch (e) {
    console.warn('mysql2 not installed, falling back to JSON file storage:', e.message);
  }
}

const dbDir = path.join(__dirname, 'data');
const chartsPath = path.join(dbDir, 'size_charts.json');
const fittersPath = path.join(dbDir, 'fit_finders.json');
const analyticsPath = path.join(dbDir, 'analytics.json');
const profilesPath = path.join(dbDir, 'customer_profiles.json');
const historyPath = path.join(dbDir, 'customer_measurement_history.json');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(chartsPath)) fs.writeFileSync(chartsPath, JSON.stringify([]));
if (!fs.existsSync(fittersPath)) fs.writeFileSync(fittersPath, JSON.stringify([]));
if (!fs.existsSync(analyticsPath)) fs.writeFileSync(analyticsPath, JSON.stringify([]));
if (!fs.existsSync(profilesPath)) fs.writeFileSync(profilesPath, JSON.stringify([]));
if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify([]));

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));

jsonDb = {
  readCharts: () => read(chartsPath),
  writeCharts: (data) => write(chartsPath, data),
  readFitters: () => read(fittersPath),
  writeFitters: (data) => write(fittersPath, data),
  readAnalytics: () => read(analyticsPath),
  writeAnalytics: (data) => write(analyticsPath, data),
  readProfiles: () => read(profilesPath),
  writeProfiles: (data) => write(profilesPath, data),
  readHistory: () => read(historyPath),
  writeHistory: (data) => write(historyPath, data),
};

async function initTables() {
  if (!pool) return;

  // Tables that may have been created with long VARCHAR keys are recreated with safe lengths.
  await pool.execute('DROP TABLE IF EXISTS customer_profiles, customer_measurement_history');

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS size_charts (
      id VARCHAR(50) PRIMARY KEY,
      shop VARCHAR(80) NOT NULL,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(20),
      headers LONGTEXT,
      \`rows\` LONGTEXT,
      apply_to VARCHAR(20),
      types LONGTEXT,
      tags LONGTEXT,
      products LONGTEXT,
      collections LONGTEXT,
      priority INT DEFAULT 0,
      image_url LONGTEXT,
      min_price INT DEFAULT NULL,
      max_price INT DEFAULT NULL,
      in_stock_only TINYINT DEFAULT 0,
      customer_tags LONGTEXT,
      INDEX idx_shop (shop)
    )
  `);
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN priority INT DEFAULT 0'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN image_url LONGTEXT'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN collections LONGTEXT'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN min_price INT DEFAULT NULL'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN max_price INT DEFAULT NULL'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN in_stock_only TINYINT DEFAULT 0'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts ADD COLUMN customer_tags LONGTEXT'); } catch (e) {}
  try { await pool.execute('ALTER TABLE size_charts MODIFY COLUMN shop VARCHAR(80) NOT NULL'); } catch (e) {}

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS fit_finders (
      id VARCHAR(50) PRIMARY KEY,
      shop VARCHAR(80) NOT NULL,
      questions LONGTEXT,
      results LONGTEXT,
      INDEX idx_shop (shop)
    )
  `);
  try { await pool.execute('ALTER TABLE fit_finders MODIFY COLUMN shop VARCHAR(80) NOT NULL'); } catch (e) {}

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop VARCHAR(80) NOT NULL,
      event VARCHAR(50) NOT NULL,
      product_handle VARCHAR(255),
      size VARCHAR(50),
      metadata LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_shop (shop),
      INDEX idx_event (event),
      INDEX idx_created (created_at)
    )
  `);
  try { await pool.execute('ALTER TABLE analytics MODIFY COLUMN shop VARCHAR(80) NOT NULL'); } catch (e) {}

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS customer_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop VARCHAR(80) NOT NULL,
      customer_id VARCHAR(80) NOT NULL,
      measurements LONGTEXT,
      unit VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_customer (shop, customer_id),
      INDEX idx_shop (shop)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS customer_measurement_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop VARCHAR(80) NOT NULL,
      customer_id VARCHAR(80) NOT NULL,
      measurements LONGTEXT,
      unit VARCHAR(20),
      product_handle VARCHAR(255),
      recommended_size VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_shop_customer (shop, customer_id),
      INDEX idx_shop (shop)
    )
  `);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function chartFromRow(row) {
  return {
    id: row.id,
    shop: row.shop,
    name: row.name,
    unit: row.unit,
    headers: JSON.parse(row.headers || '[]'),
    rows: JSON.parse(row['rows'] || '[]'),
    apply_to: row.apply_to,
    types: row.types,
    tags: row.tags,
    products: row.products,
    collections: row.collections || '',
    priority: row.priority == null ? 0 : Number(row.priority),
    image_url: row.image_url || '',
    min_price: row.min_price == null ? null : Number(row.min_price),
    max_price: row.max_price == null ? null : Number(row.max_price),
    in_stock_only: row.in_stock_only ? true : false,
    customer_tags: row.customer_tags || '',
  };
}

function chartToRow(chart) {
  return [
    chart.id, chart.shop, chart.name, chart.unit,
    JSON.stringify(chart.headers || []),
    JSON.stringify(chart.rows || []),
    chart.apply_to, chart.types, chart.tags, chart.products,
    chart.collections || '',
    chart.priority == null ? 0 : Number(chart.priority),
    chart.image_url || '',
    chart.min_price == null ? null : Number(chart.min_price),
    chart.max_price == null ? null : Number(chart.max_price),
    chart.in_stock_only ? 1 : 0,
    chart.customer_tags || '',
  ];
}

function parseCsvLine(line) {
  const vals = [];
  let v = '', inside = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inside = !inside; continue; }
    if (c === ',' && !inside) { vals.push(v.trim()); v = ''; continue; }
    v += c;
  }
  vals.push(v.trim());
  return vals;
}

function parseNumberOrRange(str) {
  const s = String(str || '').replace(/[^0-9.\-–]/g, '').replace(/–/g, '-');
  if (!s) return null;
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(x => parseFloat(x));
    if (!isNaN(a) && !isNaN(b)) return (a + b) / 2;
    if (!isNaN(a)) return a;
    return null;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalizeKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const db = {
  init: async () => {
    if (!pool) return;
    try {
      await initTables();
    } catch (err) {
      console.error('[DB INIT ERROR] MySQL init failed, falling back to JSON file storage:', err.message || err);
      pool = null;
    }
  },

  getCharts: async (shop) => {
    if (!pool) return jsonDb.readCharts().filter(c => c.shop === shop);
    const [rows] = await pool.execute('SELECT * FROM size_charts WHERE shop = ?', [shop]);
    return rows.map(chartFromRow);
  },

  getChartById: async (shop, id) => {
    if (!pool) return jsonDb.readCharts().find(c => c.shop === shop && c.id === id);
    const [rows] = await pool.execute('SELECT * FROM size_charts WHERE shop = ? AND id = ?', [shop, id]);
    return rows[0] ? chartFromRow(rows[0]) : undefined;
  },

  saveChart: async (chart) => {
    if (!chart.id) chart.id = uid();
    if (!pool) {
      const data = jsonDb.readCharts();
      const idx = data.findIndex(c => c.shop === chart.shop && c.id === chart.id);
      if (idx >= 0) data[idx] = chart; else data.push(chart);
      jsonDb.writeCharts(data);
      return chart;
    }
    await pool.execute(
      `INSERT INTO size_charts (id, shop, name, unit, headers, \`rows\`, apply_to, types, tags, products, collections, priority, image_url, min_price, max_price, in_stock_only, customer_tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       name=VALUES(name), unit=VALUES(unit), headers=VALUES(headers), \`rows\`=VALUES(\`rows\`),
       apply_to=VALUES(apply_to), types=VALUES(types), tags=VALUES(tags), products=VALUES(products),
       collections=VALUES(collections), priority=VALUES(priority), image_url=VALUES(image_url),
       min_price=VALUES(min_price), max_price=VALUES(max_price), in_stock_only=VALUES(in_stock_only), customer_tags=VALUES(customer_tags)`,
      chartToRow(chart)
    );
    return chart;
  },

  deleteChart: async (shop, id) => {
    if (!pool) {
      const data = jsonDb.readCharts().filter(c => !(c.shop === shop && c.id === id));
      jsonDb.writeCharts(data);
      return;
    }
    await pool.execute('DELETE FROM size_charts WHERE shop = ? AND id = ?', [shop, id]);
  },

  findChartForProduct: async (shop, product) => {
    const charts = await db.getCharts(shop);
    const type = product.product_type || '';
    const tags = Array.isArray(product.tags) ? product.tags : String(product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const collectionHandles = Array.isArray(product.collection_handles) ? product.collection_handles : String(product.collection_handles || '').split(',').map(t => t.trim()).filter(Boolean);
    const customerTags = Array.isArray(product.customer_tags) ? product.customer_tags : String(product.customer_tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const price = Number(product.price) || 0;
    const available = product.available !== false;
    const matched = [];
    charts.forEach(c => {
      let ok = false;
      if (c.apply_to === 'all') ok = true;
      else if (c.apply_to === 'types' && (c.types || '').split(',').map(s => s.trim()).filter(Boolean).includes(type)) ok = true;
      else if (c.apply_to === 'tags') {
        const chartTags = (c.tags || '').split(',').map(s => s.trim()).filter(Boolean);
        if (tags.some(t => chartTags.includes(t))) ok = true;
      } else if (c.apply_to === 'products' && (c.products || '').split(',').map(s => s.trim()).filter(Boolean).includes(product.handle)) ok = true;
      else if (c.apply_to === 'collections') {
        const chartCollections = (c.collections || '').split(',').map(s => s.trim()).filter(Boolean);
        if (collectionHandles.some(h => chartCollections.includes(h))) ok = true;
      }
      if (!ok) return;
      if (c.min_price != null && price < Number(c.min_price)) return;
      if (c.max_price != null && price > Number(c.max_price)) return;
      if (c.in_stock_only && !available) return;
      const chartCustomerTags = (c.customer_tags || '').split(',').map(s => s.trim()).filter(Boolean);
      if (chartCustomerTags.length && !customerTags.some(t => chartCustomerTags.includes(t))) return;
      matched.push(c);
    });
    matched.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    return matched[0];
  },

  exportChartsCsv: async (shop) => {
    const charts = await db.getCharts(shop);
    const lines = [];
    lines.push('id,name,unit,priority,apply_to,types,tags,products,collections,headers,rows,image_url,min_price,max_price,in_stock_only,customer_tags');
    charts.forEach(c => {
      const headers = (c.headers || []).map(h => `"${String(h).replace(/"/g, '""')}"`).join('|');
      const rows = JSON.stringify(c.rows || []).replace(/"/g, '""');
      lines.push([c.id, `"${(c.name || '').replace(/"/g, '""')}"`, c.unit || '', c.priority || 0, c.apply_to || 'all', `"${(c.types || '').replace(/"/g, '""')}"`, `"${(c.tags || '').replace(/"/g, '""')}"`, `"${(c.products || '').replace(/"/g, '""')}"`, `"${(c.collections || '').replace(/"/g, '""')}"`, `"${headers}"`, `"${rows}"`, `"${(c.image_url || '').replace(/"/g, '""')}"`, c.min_price == null ? '' : c.min_price, c.max_price == null ? '' : c.max_price, c.in_stock_only ? 1 : 0, `"${(c.customer_tags || '').replace(/"/g, '""')}"`].join(','));
    });
    return lines.join('\n');
  },

  importChartsCsv: async (shop, csvText) => {
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (!lines.length) throw new Error('CSV is empty');
    const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
    const get = (row, key) => row[header.indexOf(key)] || '';
    const imported = [];
    for (const line of lines) {
      const row = parseCsvLine(line);
      const id = get(row, 'id') || uid();
      const name = get(row, 'name').replace(/^"|"$/g, '').replace(/""/g, '"');
      const headers = get(row, 'headers').replace(/^"|"$/g, '').split('|').filter(Boolean);
      const rowsStr = get(row, 'rows').replace(/^"|"$/g, '').replace(/""/g, '"');
      const rows = JSON.parse(rowsStr || '[]');
      const chart = {
        id,
        shop,
        name,
        unit: get(row, 'unit'),
        priority: parseInt(get(row, 'priority'), 10) || 0,
        apply_to: get(row, 'apply_to') || 'all',
        types: get(row, 'types').replace(/^"|"$/g, '').replace(/""/g, '"'),
        tags: get(row, 'tags').replace(/^"|"$/g, '').replace(/""/g, '"'),
        products: get(row, 'products').replace(/^"|"$/g, '').replace(/""/g, '"'),
        collections: get(row, 'collections').replace(/^"|"$/g, '').replace(/""/g, '"'),
        headers,
        rows,
        image_url: get(row, 'image_url').replace(/^"|"$/g, '').replace(/""/g, '"'),
        min_price: get(row, 'min_price') ? parseInt(get(row, 'min_price'), 10) : null,
        max_price: get(row, 'max_price') ? parseInt(get(row, 'max_price'), 10) : null,
        in_stock_only: parseInt(get(row, 'in_stock_only') || '0', 10) ? true : false,
        customer_tags: get(row, 'customer_tags').replace(/^"|"$/g, '').replace(/""/g, '"'),
      };
      await db.saveChart(chart);
      imported.push(chart);
    }
    return imported;
  },

  getFitFinder: async (shop) => {
    if (!pool) return jsonDb.readFitters().find(f => f.shop === shop);
    const [rows] = await pool.execute('SELECT * FROM fit_finders WHERE shop = ?', [shop]);
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      shop: rows[0].shop,
      questions: JSON.parse(rows[0].questions || '[]'),
      results: JSON.parse(rows[0].results || '[]'),
    };
  },

  saveFitFinder: async (finder) => {
    if (!finder.id) finder.id = uid();
    if (!pool) {
      const data = jsonDb.readFitters();
      const idx = data.findIndex(f => f.shop === finder.shop && f.id === finder.id);
      if (idx >= 0) data[idx] = finder; else data.push(finder);
      jsonDb.writeFitters(data);
      return finder;
    }
    await pool.execute(
      `INSERT INTO fit_finders (id, shop, questions, results)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE questions=VALUES(questions), results=VALUES(results)`,
      [finder.id, finder.shop, JSON.stringify(finder.questions || []), JSON.stringify(finder.results || [])]
    );
    return finder;
  },

  trackEvent: async (shop, event, data = {}) => {
    const { product_handle, size, metadata } = data;
    if (!pool) {
      const list = jsonDb.readAnalytics();
      list.push({ id: uid(), shop, event, product_handle, size, metadata, created_at: new Date().toISOString() });
      jsonDb.writeAnalytics(list);
      return;
    }
    await pool.execute(
      'INSERT INTO analytics (shop, event, product_handle, size, metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [shop, event, product_handle || '', size || '', JSON.stringify(metadata || {})]
    );
  },

  getAnalytics: async (shop, { days = 30 } = {}) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (!pool) {
      const list = jsonDb.readAnalytics().filter(a => a.shop === shop && new Date(a.created_at) >= since);
      return aggregateAnalytics(list);
    }
    const [rows] = await pool.execute(
      'SELECT * FROM analytics WHERE shop = ? AND created_at >= ? ORDER BY created_at DESC',
      [shop, since]
    );
    return aggregateAnalytics(rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}'), created_at: r.created_at })));
  },

  getMeasurementProfile: async (shop, customerId) => {
    if (!pool) return jsonDb.readProfiles().find(p => p.shop === shop && p.customer_id === customerId);
    const [rows] = await pool.execute('SELECT * FROM customer_profiles WHERE shop = ? AND customer_id = ?', [shop, customerId]);
    if (!rows[0]) return undefined;
    return {
      shop: rows[0].shop,
      customer_id: rows[0].customer_id,
      unit: rows[0].unit,
      measurements: JSON.parse(rows[0].measurements || '{}'),
      updated_at: rows[0].updated_at,
    };
  },

  saveMeasurementProfile: async (shop, customerId, measurements, unit = 'cm') => {
    if (!pool) {
      const data = jsonDb.readProfiles();
      const idx = data.findIndex(p => p.shop === shop && p.customer_id === customerId);
      const profile = { shop, customer_id: customerId, measurements, unit, updated_at: new Date().toISOString() };
      if (idx >= 0) data[idx] = profile; else data.push(profile);
      jsonDb.writeProfiles(data);
      return profile;
    }
    await pool.execute(
      `INSERT INTO customer_profiles (shop, customer_id, measurements, unit)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE measurements=VALUES(measurements), unit=VALUES(unit)`,
      [shop, customerId, JSON.stringify(measurements), unit]
    );
    return { shop, customer_id: customerId, measurements, unit };
  },

  addMeasurementHistory: async (shop, customerId, measurements, unit, productHandle, recommendedSize) => {
    if (!pool) {
      const list = jsonDb.readHistory ? jsonDb.readHistory() : [];
      list.push({ id: uid(), shop, customer_id: customerId, measurements, unit, product_handle: productHandle, recommended_size: recommendedSize, created_at: new Date().toISOString() });
      if (jsonDb.writeHistory) jsonDb.writeHistory(list);
      return;
    }
    await pool.execute(
      'INSERT INTO customer_measurement_history (shop, customer_id, measurements, unit, product_handle, recommended_size) VALUES (?, ?, ?, ?, ?, ?)',
      [shop, customerId, JSON.stringify(measurements), unit, productHandle || '', recommendedSize || '']
    );
  },

  getMeasurementHistory: async (shop, customerId, { limit = 20 } = {}) => {
    if (!pool) return [];
    const [rows] = await pool.execute(
      'SELECT * FROM customer_measurement_history WHERE shop = ? AND customer_id = ? ORDER BY created_at DESC LIMIT ?',
      [shop, customerId, limit]
    );
    return rows.map(r => ({ id: r.id, customer_id: r.customer_id, measurements: JSON.parse(r.measurements || '{}'), unit: r.unit, product_handle: r.product_handle, recommended_size: r.recommended_size, created_at: r.created_at }));
  },

  recommendSizeFromMeasurements: async (shop, product, measurements) => {
    const chart = await db.findChartForProduct(shop, product);
    if (!chart || !chart.rows || !chart.rows.length) return null;
    const headers = (chart.headers || []).map(normalizeKey);
    const input = {};
    Object.keys(measurements || {}).forEach(k => { input[normalizeKey(k)] = parseNumberOrRange(measurements[k]); });
    let best = null;
    let bestScore = -Infinity;
    const scored = [];
    chart.rows.forEach(row => {
      let totalPenalty = 0;
      let count = 0;
      let matched = 0;
      (row.values || []).forEach((val, i) => {
        const headerKey = headers[i];
        if (!headerKey) return;
        const measured = input[headerKey];
        if (measured == null) return;
        const chartVal = parseNumberOrRange(val);
        if (chartVal == null) return;
        count++;
        const diff = Math.abs(chartVal - measured);
        totalPenalty += diff;
        if (diff <= chartVal * 0.04) matched++;
      });
      if (!count) return;
      const avgPenalty = totalPenalty / count;
      const matchRate = matched / count;
      const score = matchRate * 100 - avgPenalty;
      scored.push({ size: row.size, score, avgPenalty, matchRate });
      if (score > bestScore) { bestScore = score; best = row.size; }
    });
    const confidence = scored.length ? Math.round(Math.max(0, Math.min(100, bestScore))) : 0;
    return { size: best, chart, confidence, scored };
  },
};

function aggregateAnalytics(rows) {
  const stats = {
    total_events: rows.length,
    size_guide_opens: 0,
    fit_finder_submits: 0,
    measurements_saved: 0,
    top_sizes: {},
    recent: rows.slice(0, 50),
  };
  rows.forEach(r => {
    if (r.event === 'size_guide_open') stats.size_guide_opens++;
    if (r.event === 'fit_finder_submit') stats.fit_finder_submits++;
    if (r.event === 'measurement_save') stats.measurements_saved++;
    if (r.size) stats.top_sizes[r.size] = (stats.top_sizes[r.size] || 0) + 1;
  });
  stats.top_sizes = Object.entries(stats.top_sizes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([size, count]) => ({ size, count }));
  return stats;
}

module.exports = db;
