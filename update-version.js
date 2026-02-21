/**
 * Actualiza la versión de caché en todo el proyecto.
 * Uso:
 *   node update-version.js           → usa la versión en version.txt (ej. 1.0.8)
 *   node update-version.js 1.0.9    → escribe 1.0.9 en version.txt y actualiza todos los archivos
 * Antes de hacer deploy, ejecuta esto para que los usuarios vean los cambios sin hard reload.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const VERSION_FILE = path.join(ROOT, 'version.txt');
const FILES = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'dm-dashboard.html'),
  path.join(ROOT, 'player-app.html'),
  path.join(ROOT, 'sw.js')
];

function getVersion() {
  if (!fs.existsSync(VERSION_FILE)) {
    console.error('No existe version.txt. Créalo con una versión (ej. 1.0.8) o ejecuta: node update-version.js 1.0.8');
    process.exit(1);
  }
  return fs.readFileSync(VERSION_FILE, 'utf8').trim();
}

function setVersion(v) {
  var ver = String(v).trim();
  fs.writeFileSync(VERSION_FILE, ver + '\n', 'utf8');
  console.log('Versión escrita en version.txt:', ver);
}

function updateFile(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.warn('No encontrado:', filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const base = path.basename(filePath);

  if (base === 'sw.js') {
    content = content.replace(/dragonkeep-v[\d.]+/, 'dragonkeep-v' + version);
  } else {
    content = content.replace(/\?v=[\d.]+/g, '?v=' + version);
    content = content.replace(/(<div class="app-version"[^>]*>)v[\d.]+(<\/div>)/, '$1v' + version + '$2');
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Actualizado:', base);
}

const newVersionArg = process.argv[2];
let version;

if (newVersionArg !== undefined && newVersionArg !== '') {
  version = String(newVersionArg).trim();
  if (!version) {
    console.error('Indica una versión, ej: node update-version.js 1.0.9');
    process.exit(1);
  }
  setVersion(version);
} else {
  version = getVersion();
  console.log('Usando versión en version.txt:', version);
}

FILES.forEach(function (p) { updateFile(p, version); });
console.log('Listo. Versión', version, 'aplicada en index, dm-dashboard, player-app y sw.js.');
