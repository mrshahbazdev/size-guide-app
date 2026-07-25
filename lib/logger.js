const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'data', 'logs');
const logFile = path.join(logDir, 'app.log');

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');

function write(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {
    // ignore
  }
}

function log(msg) {
  write('INFO', msg);
  console.log(msg);
}

function error(msg) {
  write('ERROR', msg);
  console.error(msg);
}

function getRecent(lines = 200) {
  try {
    const data = fs.readFileSync(logFile, 'utf8');
    return data.split('\n').filter(Boolean).slice(-lines).join('\n');
  } catch (e) {
    return '';
  }
}

module.exports = { log, error, getRecent };
