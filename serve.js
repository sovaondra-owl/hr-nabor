/**
 * Jednoduchý statický server – spuštění aplikace na localhost.
 * Použití: node serve.js   → http://localhost:3000
 * Konfigurace Supabase z .env (config.js se generuje ze serveru).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const fs = require('fs');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const MIMES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0] || '/';
  // config.js ze serveru – klíče z .env, ne z repozitáře
  if (urlPath === '/config.js') {
    const body = [
      'window.API_BASE = window.API_BASE || ' + JSON.stringify(process.env.API_BASE || 'http://localhost:3001') + ';',
      'window.SUPABASE_URL = window.SUPABASE_URL || ' + JSON.stringify(process.env.SUPABASE_URL || '') + ';',
      'window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || ' + JSON.stringify(process.env.SUPABASE_ANON_KEY || '') + ';'
    ].join('\n');
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(body);
    return;
  }
  let file = urlPath === '/' ? '/index.html' : urlPath;
  file = path.join(__dirname, path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, ''));
  const ext = path.extname(file);
  const mime = MIMES[ext] || 'application/octet-stream';

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Aplikace běží na http://localhost:' + PORT);
});
