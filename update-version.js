/**
 * Actualiza la versión de caché en todo el proyecto.
 * Uso:
 *   node update-version.js          → usa el número en version.txt y actualiza todos los archivos
 *   node update-version.js 6        → escribe 6 en version.txt y actualiza todos los archivos
 * Antes de hacer deploy a GitHub Pages, ejecuta esto (con o sin número) para que los usuarios vean los cambios sin hard reload.
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
    console.error('No existe version.txt. Créalo con un número (ej. 5) o ejecuta: node update-version.js 5');
    process.exit(1);
  }
  return fs.readFileSync(VERSION_FILE, 'utf8').trim();
}

function setVersion(v) {
  fs.writeFileSync(VERSION_FILE, String(v) + '\n', 'utf8');
  console.log('Versión escrita en version.txt:', v);
}

function updateFile(filePath, version) {
  if (!fs.existsSync(filePath)) {
    console.warn('No encontrado:', filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const base = path.basename(filePath);

  if (base === 'sw.js') {
    content = content.replace(/dragonkeep-v\d+/, 'dragonkeep-v' + version);
  } else {
    content = content.replace(/\?v=\d+/g, '?v=' + version);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Actualizado:', base);
}

const newVersionArg = process.argv[2];
let version;

if (newVersionArg !== undefined && newVersionArg !== '') {
  version = newVersionArg.replace(/\D/g, '') || newVersionArg;
  if (!version) {
    console.error('Usa un número de versión, ej: node update-version.js 6');
    process.exit(1);
  }
  setVersion(version);
} else {
  version = getVersion();
  console.log('Usando versión en version.txt:', version);
}

FILES.forEach(function (p) { updateFile(p, version); });
console.log('Listo. Versión', version, 'aplicada en index, dm-dashboard, player-app y sw.js.');
