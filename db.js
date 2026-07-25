const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, 'data');
const chartsPath = path.join(dbDir, 'size_charts.json');
const fittersPath = path.join(dbDir, 'fit_finders.json');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(chartsPath)) fs.writeFileSync(chartsPath, JSON.stringify([]));
if (!fs.existsSync(fittersPath)) fs.writeFileSync(fittersPath, JSON.stringify([]));

function readCharts() { return JSON.parse(fs.readFileSync(chartsPath, 'utf8')); }
function writeCharts(data) { fs.writeFileSync(chartsPath, JSON.stringify(data, null, 2)); }
function readFitters() { return JSON.parse(fs.readFileSync(fittersPath, 'utf8')); }
function writeFitters(data) { fs.writeFileSync(fittersPath, JSON.stringify(data, null, 2)); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

module.exports = {
  getCharts(shop) { return readCharts().filter(c => c.shop === shop); },
  getChartById(shop, id) { return readCharts().find(c => c.shop === shop && c.id === id); },
  saveChart(chart) {
    const data = readCharts();
    if (!chart.id) chart.id = uid();
    const idx = data.findIndex(c => c.shop === chart.shop && c.id === chart.id);
    if (idx >= 0) data[idx] = chart; else data.push(chart);
    writeCharts(data);
    return chart;
  },
  deleteChart(shop, id) {
    const data = readCharts().filter(c => !(c.shop === shop && c.id === id));
    writeCharts(data);
  },
  findChartForProduct(shop, product) {
    const charts = readCharts().filter(c => c.shop === shop);
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
  getFitFinder(shop) { return readFitters().find(f => f.shop === shop); },
  saveFitFinder(finder) {
    const data = readFitters();
    if (!finder.id) finder.id = uid();
    const idx = data.findIndex(f => f.shop === finder.shop && f.id === finder.id);
    if (idx >= 0) data[idx] = finder; else data.push(finder);
    writeFitters(data);
    return finder;
  },
  uid
};
