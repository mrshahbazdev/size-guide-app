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

if (!pool) {
  const dbDir = path.join(__dirname, 'data');
  const chartsPath = path.join(dbDir, 'size_charts.json');
  const fittersPath = path.join(dbDir, 'fit_finders.json');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(chartsPath)) fs.writeFileSync(chartsPath, JSON.stringify([]));
  if (!fs.existsSync(fittersPath)) fs.writeFileSync(fittersPath, JSON.stringify([]));

  const readCharts = () => JSON.parse(fs.readFileSync(chartsPath, 'utf8'));
  const writeCharts = (data) => fs.writeFileSync(chartsPath, JSON.stringify(data, null, 2));
  const readFitters = () => JSON.parse(fs.readFileSync(fittersPath, 'utf8'));
  const writeFitters = (data) => fs.writeFileSync(fittersPath, JSON.stringify(data, null, 2));

  jsonDb = { readCharts, writeCharts, readFitters, writeFitters };
}

async function initTables() {
  if (!pool) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS size_charts (
      id VARCHAR(50) PRIMARY KEY,
      shop VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(20),
      headers LONGTEXT,
      \`rows\` LONGTEXT,
      apply_to VARCHAR(20),
      types LONGTEXT,
      tags LONGTEXT,
      products LONGTEXT,
      INDEX idx_shop (shop)
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS fit_finders (
      id VARCHAR(50) PRIMARY KEY,
      shop VARCHAR(255) NOT NULL,
      questions LONGTEXT,
      results LONGTEXT,
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
  };
}

function chartToRow(chart) {
  return [
    chart.id,
    chart.shop,
    chart.name,
    chart.unit,
    JSON.stringify(chart.headers || []),
    JSON.stringify(chart.rows || []),
    chart.apply_to,
    chart.types,
    chart.tags,
    chart.products,
  ];
}

const db = {
  init: async () => {
    if (pool) await initTables();
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
      `INSERT INTO size_charts (id, shop, name, unit, headers, \`rows\`, apply_to, types, tags, products)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       name=VALUES(name), unit=VALUES(unit), headers=VALUES(headers), \`rows\`=VALUES(\`rows\`),
       apply_to=VALUES(apply_to), types=VALUES(types), tags=VALUES(tags), products=VALUES(products)`,
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
    return charts.find(c => {
      if (c.apply_to === 'all') return true;
      if (c.apply_to === 'types' && (c.types || '').split(',').map(s => s.trim()).includes(type)) return true;
      if (c.apply_to === 'tags') {
        const chartTags = (c.tags || '').split(',').map(s => s.trim());
        return tags.some(t => chartTags.includes(t));
      }
      if (c.apply_to === 'products' && (c.products || '').split(',').map(s => s.trim()).includes(product.handle)) return true;
      return false;
    });
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
};

module.exports = db;
