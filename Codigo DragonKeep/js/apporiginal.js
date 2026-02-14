// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyAfOdbG9zqU4ccC_B-ZCUGPnfBDM2KvB-I",
    authDomain: "nueva-valdoria.firebaseapp.com",
    projectId: "nueva-valdoria",
    storageBucket: "nueva-valdoria.firebasestorage.app",
    messagingSenderId: "29742426810",
    appId: "1:29742426810:web:0cf259ba71b0e5f0d8f083"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==================== PWA - BASE PATH Y SERVICE WORKER ====================
/** Base path para GitHub Pages (ej. /dm-dashboard-modular/). Usado para manifest, SW y rutas. */
var PWA_BASE = (function () {
  try {
    var path = new URL(document.baseURI || window.location.href).pathname;
    if (path.indexOf('/') === 0) path = path.slice(1);
    var parts = path.split('/').filter(Boolean);
    var first = parts[0];
    if (first && first !== 'index.html') return '/' + first + '/';
  } catch (e) {}
  return '/';
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register(PWA_BASE + 'sw.js').then(function (reg) {
    console.log('[PWA] Service Worker registrado:', reg.scope);
  }).catch(function (err) {
    console.warn('[PWA] Error registrando Service Worker:', err);
  });
}

// ==================== UTILIDADES ====================
/** Debounce: ejecuta fn tras ms ms sin nuevas llamadas. Reduce renders en buscadores. */
function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(function () { fn.apply(this, arguments); }, ms); };
}

// ==================== GLOBAL DATA ====================
var citiesData = [], npcsData = [], shopsData = [], playersData = [];
var playerCitiesData = [], playerShopsData = [], playerNpcsData = [];
var rutasConocidasData = [];
/** Cache del documento del jugador actual (vista jugador). Evita N× players.doc(id).get() → menos reads. */
var _playerDocCache = null;
var currentRutaParaViaje = null;

/**
 * Obtiene el documento del jugador actual (vista jugador). Usa caché si está disponible para reducir reads.
 * @returns {Promise<{exists: boolean, data: function}>} Objeto tipo snapshot: .exists y .data() para compatibilidad con código existente.
 */
function getCurrentPlayerDoc() {
    var user = getCurrentUser();
    if (!user || !user.id) return Promise.resolve({ exists: false, data: function () { return null; } });
    if (isPlayer() && _playerDocCache !== undefined && _playerDocCache !== null)
        return Promise.resolve({ exists: true, data: function () { return _playerDocCache; } });
    if (isPlayer() && _playerDocCache === null)
        return Promise.resolve({ exists: false, data: function () { return null; } });
    return db.collection('players').doc(user.id).get().then(function (doc) {
        if (isPlayer() && doc.exists) _playerDocCache = doc.data();
        else if (isPlayer() && !doc.exists) _playerDocCache = null;
        return { exists: doc.exists, data: function () { return doc.exists ? doc.data() : null; } };
    });
}

function getCityInfoForShop(shop) {
    if (!shop || !shop.ciudadId) return { cityId: '', cityName: '' };
    const city = playerCitiesData.find(c => c.id === shop.ciudadId);
    return { cityId: shop.ciudadId || '', cityName: city ? (city.nombre || '') : '' };
}

let playerPotionCart = [], playerPotionShopId = null, playerPotionProducts = [], playerPotionFilter = 'all', playerPotionSearchTerm = '';
let lastPlayerViewData = null;
let playerUbicacionActual = '';
let playerTavernShopId = null, playerTavernCart = [];
let playerForgeShopId = null, playerForgeCart = [], playerForgeLevel = 1, playerForgeTab = 'forge-shop', playerForgeSearchTerm = '';
let playerArtesaniasShopId = null, playerArtesaniasCart = [], playerArtesaniasTab = 'flechas', playerArtesaniasSearchTerm = '';
let playerEmporioShopId = null, playerEmporioCart = [], playerEmporioTab = 'materiales', playerEmporioSearchTerm = '';
let playerBibliotecaShopId = null, playerBibliotecaCart = [], playerBibliotecaSearchTerm = '';
let playerBancoShopId = null;
let playerPosadaShopId = null, playerPosadaCart = [], playerPosadaSearchTerm = '';
let playerBatallaShopId = null, playerBatallaSelected = [], playerBatallaSearchTerm = '', playerBatallaOponentes = [];
let playerTavernSearchTerm = '';

/** Cuartos de la Posada de Nebula (tipos fijos, sin inventario). Usado también por posadas de otras ciudades y por mensajes automáticos. */
const POSADA_CUARTOS = [
    { id: 'guerrero', nombre: 'Cuarto del Guerrero Valiente', precio: 50, efecto: 'El aventurero recibe un aumento temporal en su salud. Al siguiente combate, su máximo de puntos de golpe aumenta en 10 durante 1 hora.' },
    { id: 'sabio', nombre: 'Cuarto del Sabio Estelar', precio: 75, efecto: 'El aventurero recibe un bono a sus tiradas de inteligencia en su próxima aventura. Al realizar un chequeo de habilidad que dependa de Inteligencia, el aventurero obtiene un +2 por 1 hora.' },
    { id: 'elementos', nombre: 'Cuarto de los Elementos', precio: 100, efecto: 'El aventurero puede elegir una resistencia elemental para su próxima aventura. Durante 1 hora, el aventurero obtiene ventaja en todas las tiradas de salvación contra un tipo de daño específico (fuego, frío, electricidad, ácido, etc.) que elija al momento de ingresar al cuarto.' },
    { id: 'viento', nombre: 'Cuarto del Enigma del Viento', precio: 120, efecto: 'Aumenta la velocidad de movimiento del aventurero. Durante 1 hora, su velocidad de movimiento se incrementa en 10 pies y obtiene ventaja en las tiradas de salvación contra efectos de control de movimiento (como estar paralizado, atado, etc.).' }
];
if (typeof window !== 'undefined') window.POSADA_CUARTOS = POSADA_CUARTOS;

/** Cantidad de un ítem: si tiene quantity >= 1 se usa; si no, 1 (compatibilidad con datos antiguos). */
function getItemQuantity(item) {
    if (!item) return 1;
    const q = item.quantity;
    if (q != null && typeof q === 'number' && q >= 1) return Math.floor(q);
    return 1;
}

/** Firma de un ítem para agrupar duplicados (ignora quantity). */
function getItemSignature(item) {
    if (!item || typeof item !== 'object') return '';
    const keys = Object.keys(item).filter(function (k) { return k !== 'quantity'; }).sort();
    const o = {};
    keys.forEach(function (k) { o[k] = item[k]; });
    return JSON.stringify(o);
}

/** Consolida ítems duplicados en una entrada con quantity. Devuelve nuevo array. */
function mergeItemsByQuantity(items) {
    if (!items || !Array.isArray(items) || items.length === 0) return items.slice();
    const map = {};
    items.forEach(function (item) {
        var sig = getItemSignature(item);
        if (!map[sig]) map[sig] = { item: item, total: 0 };
        map[sig].total += getItemQuantity(item);
    });
    return Object.keys(map).map(function (sig) {
        var g = map[sig];
        var entry = g.item && typeof g.item === 'object' ? Object.assign({}, g.item) : g.item;
        if (g.total > 1) entry.quantity = g.total;
        else if (entry && typeof entry === 'object' && entry.hasOwnProperty('quantity')) delete entry.quantity;
        return entry;
    });
}

/** Migración: consolida ítems duplicados en tiendas y jugadores (una entrada con quantity). */
async function runQuantityMigration() {
    var btn = document.getElementById('migrate-quantity-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Migrando…'; }
    if (typeof showToast === 'function') showToast('Migrando ítems a cantidad…', false);
    var shopsUpdated = 0;
    var playersUpdated = 0;
    var itemsConsolidated = 0;
    try {
        var shopsSnap = await db.collection('shops').get();
        for (var i = 0; i < shopsSnap.docs.length; i++) {
            var doc = shopsSnap.docs[i];
            var data = doc.data();
            var inv = data.inventario;
            if (!inv || !Array.isArray(inv)) continue;
            var merged = mergeItemsByQuantity(inv);
            if (merged.length < inv.length) {
                itemsConsolidated += inv.length - merged.length;
                await db.collection('shops').doc(doc.id).update({ inventario: merged });
                shopsUpdated++;
            }
        }
        var playersSnap = await db.collection('players').get();
        for (var j = 0; j < playersSnap.docs.length; j++) {
            var pDoc = playersSnap.docs[j];
            var pData = pDoc.data();
            var pInv = pData.inventario;
            if (!pInv || !Array.isArray(pInv)) continue;
            var pMerged = mergeItemsByQuantity(pInv);
            if (pMerged.length < pInv.length) {
                itemsConsolidated += pInv.length - pMerged.length;
                await db.collection('players').doc(pDoc.id).update({ inventario: pMerged });
                playersUpdated++;
            }
        }
        var msg = 'Migración lista.';
        if (shopsUpdated > 0 || playersUpdated > 0) {
            msg = 'Migrados ' + shopsUpdated + ' tienda(s), ' + playersUpdated + ' jugador(es). ' + itemsConsolidated + ' ítem(s) consolidados.';
            if (typeof loadWorld === 'function') loadWorld();
            if (window._cityDataCache && typeof window._cityDataCache === 'object') {
                Object.keys(window._cityDataCache).forEach(function (k) { delete window._cityDataCache[k]; });
            }
            if (typeof loadPlayers === 'function') loadPlayers();
        } else {
            msg = 'No había ítems duplicados que consolidar.';
        }
        if (typeof showToast === 'function') showToast(msg);
    } catch (e) {
        console.error('Error en migración quantity:', e);
        if (typeof showToast === 'function') showToast('Error: ' + (e.message || e), true);
    }
    if (btn) { btn.disabled = false; btn.textContent = '🔧 Migrar ítems a cantidad'; }
}
if (typeof window !== 'undefined') {
    window.runQuantityMigration = runQuantityMigration;
    window.mergeItemsByQuantity = mergeItemsByQuantity;
    window.getItemSignature = getItemSignature;
}

/** Devuelve el texto de descripción/efecto de un ítem (lo que sube el DM desde el dashboard) */
function getItemDesc(obj) {
    if (!obj) return '';
    const t = (obj.effect || obj.desc || obj.description || obj.descripcion || '');
    return (typeof t === 'string' ? t : String(t)).trim();
}

/** Construye HTML de recibo para cualquier tienda.
 *  opts: {
 *    shopName, logo, subtitle,
 *    items: [{name, line}],
 *    totalLabel, totalValue,
 *    extraLines: [{label, value}],
 *    footerThanks,
 *    modalId,
 *    primaryButton?: { label: string, onclick: string } // si se pasa, reemplaza el botón "Cerrar" del recibo
 *  }
 */
function buildShopReceiptHTML(opts) {
    const { shopName, logo, subtitle, items, totalLabel, totalValue, extraLines, footerThanks, modalId, primaryButton } = opts;
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const esc = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const itemRows = (items || []).map(i => `<div class="player-shop-receipt-item"><span class="player-shop-receipt-item-name">${esc(i.name)}</span><span class="player-shop-receipt-item-price">${esc(i.line)}</span></div>`).join('');
    const extraRows = (extraLines || []).map(l => `<div class="player-shop-receipt-item"><span class="player-shop-receipt-item-name">${esc(l.label)}</span><span class="player-shop-receipt-item-price">${esc(l.value)}</span></div>`).join('');
    const primaryBtnHtml = (primaryButton && primaryButton.label && primaryButton.onclick)
        ? `<button type="button" class="btn player-shop-receipt-close" onclick="${String(primaryButton.onclick)}">${esc(primaryButton.label)}</button>`
        : `<button type="button" class="btn player-shop-receipt-close" onclick="closeModal('${String(modalId || '')}')">Cerrar</button>`;
    return `<div class="player-shop-receipt">
        <div class="player-shop-receipt-header">
            <div class="player-shop-receipt-logo">${logo || '🧾'}</div>
            <div class="player-shop-receipt-title">${esc(shopName).toUpperCase()}</div>
            <div class="player-shop-receipt-subtitle">${esc(subtitle)}</div>
        </div>
        <div class="player-shop-receipt-body">${itemRows}${extraRows}</div>
        <div class="player-shop-receipt-total"><span class="player-shop-receipt-total-label">${esc(totalLabel)}</span><span class="player-shop-receipt-value">${esc(totalValue)}</span></div>
        <div class="player-shop-receipt-footer">
            <div class="player-shop-receipt-date">${dateStr} — ${timeStr}</div>
            <div class="player-shop-receipt-thanks">${esc(footerThanks)}</div>
        </div>
        ${primaryBtnHtml}
    </div>`;
}

// ==================== AUTHENTICATION HANDLERS ====================
function toggleLoginFields() {
    const userType = document.getElementById('login-user-type').value;
    const dmGroup = document.getElementById('login-dm-name-group');
    const playerGroup = document.getElementById('login-player-select-group');
    if (!dmGroup || !playerGroup) return;
    if (userType === 'dm') {
        dmGroup.style.display = 'block';
        dmGroup.classList.add('login-field-visible');
        playerGroup.style.display = 'none';
        playerGroup.classList.remove('login-field-visible');
        document.getElementById('login-nombre').value = '';
        const sel = document.getElementById('login-player-select');
        if (sel) sel.value = '';
    } else {
        dmGroup.style.display = 'none';
        dmGroup.classList.remove('login-field-visible');
        playerGroup.style.display = 'block';
        playerGroup.classList.add('login-field-visible');
        document.getElementById('login-nombre').value = '';
        loadLoginPlayers();
    }
}

async function loadLoginPlayers() {
    const sel = document.getElementById('login-player-select');
    sel.innerHTML = '<option value="">— Cargando… —</option>';
    try {
        const snap = await db.collection('players').limit(200).get();
        const list = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.visible !== false)
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        sel.innerHTML = '<option value="">— Selecciona tu aventurero —</option>';
        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.nombre || '';
            opt.textContent = p.nombre || 'Sin nombre';
            opt.dataset.id = p.id;
            sel.appendChild(opt);
        });
    } catch (e) {
        sel.innerHTML = '<option value="">— Error al cargar —</option>';
        console.error(e);
    }
}

async function handleLogin() {
    const userType = document.getElementById('login-user-type').value;
    const pin = document.getElementById('login-pin').value.trim();
    let nombre = '';

    if (userType === 'dm') {
        nombre = document.getElementById('login-nombre').value.trim();
    } else {
        const sel = document.getElementById('login-player-select');
        nombre = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].value) || '';
    }

    if (!nombre || !pin) {
        showToast('Por favor completa todos los campos', true);
        return;
    }

    let success = false;
    if (userType === 'dm') {
        success = await loginDM(nombre, pin);
    } else {
        success = await loginPlayer(nombre, pin);
    }

    if (success) {
        updateFooterTagline();
        closeModal('login-modal');
        if (userType === 'dm') {
            showDashboard();
        } else {
            showPlayerView();
        }
    }
}

async function handleCreateDM() {
    const nombre = document.getElementById('create-dm-nombre').value.trim();
    const pin = document.getElementById('create-dm-pin').value.trim();
    const pinConfirm = document.getElementById('create-dm-pin-confirm').value.trim();

    if (!nombre || !pin || !pinConfirm) {
        showToast('Por favor completa todos los campos', true);
        return;
    }

    if (pin.length < 4) {
        showToast('El PIN debe tener al menos 4 dígitos', true);
        return;
    }

    if (pin !== pinConfirm) {
        showToast('Los PINs no coinciden', true);
        return;
    }

    const success = await createDM(nombre, pin);
    if (success) {
        closeModal('create-dm-modal');
        document.getElementById('login-nombre').value = nombre;
        document.getElementById('login-pin').value = '';
        if (document.getElementById('login-user-type')) document.getElementById('login-user-type').value = 'dm';
        showToast('Cuenta creada. Ahora puedes iniciar sesión');
    }
}

function showCreateDMModal() {
    document.getElementById('create-dm-nombre').value = '';
    document.getElementById('create-dm-pin').value = '';
    document.getElementById('create-dm-pin-confirm').value = '';
    openModal('create-dm-modal');
}

function showLoginModal() {
    document.getElementById('login-nombre').value = '';
    document.getElementById('login-pin').value = '';
    const typeEl = document.getElementById('login-user-type');
    if (typeEl) typeEl.value = 'dm';
    document.getElementById('main-container').style.display = 'none';
    const pv = document.getElementById('player-view-container');
    if (pv) pv.style.display = 'none';
    document.getElementById('login-modal').classList.add('active');
    if (typeof toggleLoginFields === 'function') toggleLoginFields();
}

const DEFAULT_MAP_IMAGE_URL = 'https://i.imgur.com/ppAIykX.png';
const DEFAULT_CONTINENT_NAME = 'Nueva Valdoria';

let mapLevels = [];
let mapEditIndex = -1;
let playerMapLevelIndex = 0;
let defaultMapLevelIndex = 0;
var dmMapLevelIndex = 0;
let playerMapMarkers = [];
let playerMapCustomMarkers = [];
let playerDMMapMarkers = [];
let playerMapPlaceMode = false;
let playerMapMarkersPanelOpen = false;
let playerMapPlaceContext = null;
let playerMapZoom = 1;
const PLAYER_MAP_MIN_ZOOM = 1;
const PLAYER_MAP_MAX_ZOOM = 3;
const PLAYER_MAP_LABELS_ZOOM = 2.95;
let playerMapPanX = 0;
let playerMapPanY = 0;
let playerMapViewportEl = null;
let playerMapStageEl = null;
let playerMapPointers = new Map();
let playerMapLastPinchDist = null;
let playerMapDragLast = null;
let playerMapWasDragging = false;
let dmMapZoom = 1, dmMapPanX = 0, dmMapPanY = 0;
let dmMapViewportEl = null, dmMapStageEl = null;
let dmMapPointers = new Map();
let dmMapLastPinchDist = null, dmMapDragLast = null, dmMapWasDragging = false;
let dmMapMarkers = [];
let dmMapCustomMarkers = [];
let dmMapPlaceMode = false;
let dmMapPlaceContext = null;
let dmMapMarkersPanelOpen = false;

const FOOTER_TAGLINES = [
    'Caos a la orden del dia',
    'Caos calculado, consecuencias inevitables.',
    'El orden es opcional. El destino, no.',
    'Nada funciona… hasta que funciona demasiado bien.',
    'Donde el sistema tiembla, el caos responde.',
    'Cada decisión genera una grieta.',
    'El azar observa. El caos ejecuta.',
    'No es un error, es una señal.',
    'El equilibrio se rompió primero.',
    'Todo está bajo control. Eso es lo preocupante.',
    'Aquí comienzan las consecuencias.'
];

function updateFooterTagline() {
    const el = document.getElementById('footer-tagline');
    if (!el || !FOOTER_TAGLINES.length) return;
    const i = Math.floor(Math.random() * FOOTER_TAGLINES.length);
    el.textContent = FOOTER_TAGLINES[i];
}

async function loadMapImage() {
    try {
        const snap = await db.collection('settings').doc('map').get();
        const data = snap.exists ? snap.data() : {};
        if (Array.isArray(data.levels) && data.levels.length > 0) {
            mapLevels = data.levels.map(l => ({ ...l, visible: l.visible !== false }));
        } else {
            const url = (data.imageUrl) ? data.imageUrl.trim() : DEFAULT_MAP_IMAGE_URL;
            const name = (data.continentName) ? data.continentName.trim() : DEFAULT_CONTINENT_NAME;
            mapLevels = [{ name, imageUrl: url, visible: true }];
        }
        const visibleLevels = getVisibleMapLevels();
        let defaultIdx = data.defaultLevelIndex;
        if (defaultIdx != null && typeof defaultIdx === 'string') defaultIdx = parseInt(defaultIdx, 10);
        if (defaultIdx == null || typeof defaultIdx !== 'number' || isNaN(defaultIdx)) defaultIdx = 0;
        defaultIdx = Math.max(0, Math.min(defaultIdx, mapLevels.length - 1));
        defaultMapLevelIndex = defaultIdx;
        dmMapLevelIndex = defaultIdx;
        if (visibleLevels.length > 0) {
            if (mapLevels[defaultIdx] && mapLevels[defaultIdx].visible !== false) {
                let idxInVisible = 0;
                for (let i = 0; i < defaultIdx; i++) {
                    if (mapLevels[i].visible !== false) idxInVisible++;
                }
                playerMapLevelIndex = idxInVisible;
            } else {
                playerMapLevelIndex = 0;
            }
        } else {
            playerMapLevelIndex = 0;
        }
        if (playerMapLevelIndex >= visibleLevels.length) playerMapLevelIndex = Math.max(0, visibleLevels.length - 1);
        updateMapDMView();
        updateMapPlayerView();
        const playersContinentText = document.getElementById('players-continent-text');
        if (playersContinentText && mapLevels.length > 0) playersContinentText.textContent = 'Los héroes de ' + (mapLevels[0].name || DEFAULT_CONTINENT_NAME);
    } catch (e) {
        mapLevels = [{ name: DEFAULT_CONTINENT_NAME, imageUrl: DEFAULT_MAP_IMAGE_URL, visible: true }];
        defaultMapLevelIndex = 0;
        dmMapLevelIndex = 0;
        playerMapLevelIndex = 0;
        updateMapDMView();
        updateMapPlayerView();
        const playersContinentText = document.getElementById('players-continent-text');
        if (playersContinentText) playersContinentText.textContent = 'Los héroes de ' + DEFAULT_CONTINENT_NAME;
    }
}

function getVisibleMapLevels() {
    return mapLevels.filter(l => l.visible !== false);
}

function dmMapLevelUp() {
    if (mapLevels.length === 0 || dmMapLevelIndex >= mapLevels.length - 1) return;
    dmMapLevelIndex++;
    updateMapDMView();
}

function dmMapLevelDown() {
    if (dmMapLevelIndex <= 0) return;
    dmMapLevelIndex--;
    updateMapDMView();
}

function updateMapDMView() {
    const mapImg = document.getElementById('map-img');
    const mapTitleDM = document.getElementById('map-title-dm');
    if (mapLevels.length > 0) {
        if (dmMapLevelIndex >= mapLevels.length) dmMapLevelIndex = mapLevels.length - 1;
        if (dmMapLevelIndex < 0) dmMapLevelIndex = 0;
    }
    const idx = (mapLevels.length > 0 && dmMapLevelIndex >= 0 && dmMapLevelIndex < mapLevels.length) ? dmMapLevelIndex : 0;
    const currentLevel = mapLevels.length > 0 ? mapLevels[idx] : null;
    const url = currentLevel ? (currentLevel.imageUrl || DEFAULT_MAP_IMAGE_URL).trim() : DEFAULT_MAP_IMAGE_URL;
    const name = currentLevel ? (currentLevel.name || DEFAULT_CONTINENT_NAME).trim() : DEFAULT_CONTINENT_NAME;
    if (mapImg) { mapImg.src = url; mapImg.alt = 'Mapa de ' + name; }
    if (mapTitleDM) mapTitleDM.textContent = '🗺️ Mapa de ' + name;
    var dmNameEl = document.getElementById('dm-map-level-name');
    var dmBtnUp = document.getElementById('dm-map-level-up');
    var dmBtnDown = document.getElementById('dm-map-level-down');
    if (dmNameEl) dmNameEl.textContent = name;
    if (dmBtnUp) dmBtnUp.disabled = mapLevels.length === 0 || dmMapLevelIndex >= mapLevels.length - 1;
    if (dmBtnDown) dmBtnDown.disabled = mapLevels.length === 0 || dmMapLevelIndex <= 0;
    if (!isDM()) return;
    const listEl = document.getElementById('map-levels-list');
    const inputEl = document.getElementById('map-image-url');
    const continentInputEl = document.getElementById('map-continent-name');
    const hintEl = document.getElementById('map-edit-mode-hint');
    if (hintEl) hintEl.textContent = mapEditIndex >= 0 ? 'Editando nivel ' + (mapEditIndex + 1) + '. Guarda o cancela.' : 'Rellena nombre y URL y pulsa "Añadir nivel abajo" o "arriba".';
    const addBtns = document.getElementById('map-add-buttons');
    const editBtns = document.getElementById('map-edit-buttons');
    if (addBtns) addBtns.style.display = mapEditIndex >= 0 ? 'none' : 'inline';
    if (editBtns) editBtns.style.display = mapEditIndex >= 0 ? 'inline' : 'none';
    if (mapEditIndex >= 0 && mapEditIndex < mapLevels.length) {
        const lev = mapLevels[mapEditIndex];
        if (inputEl) inputEl.value = lev.imageUrl || '';
        if (continentInputEl) continentInputEl.value = lev.name || '';
    } else if (mapEditIndex === -1 && inputEl && continentInputEl) {
        inputEl.value = '';
        continentInputEl.value = '';
    }
    const defaultSelectEl = document.getElementById('map-default-level-select');
    if (defaultSelectEl && mapLevels.length > 0) {
        if (defaultMapLevelIndex >= mapLevels.length) defaultMapLevelIndex = mapLevels.length - 1;
        defaultSelectEl.innerHTML = mapLevels.map((lev, i) => {
            const n = (lev.name || 'Nivel ' + (i + 1)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<option value="${i}">${n}</option>`;
        }).join('');
        defaultSelectEl.value = String(defaultMapLevelIndex);
    } else if (defaultSelectEl) {
        defaultSelectEl.innerHTML = '<option value="0">—</option>';
    }
    if (!listEl) return;
    if (mapLevels.length === 0) {
        listEl.innerHTML = '<p style="color:#8b7355; font-style:italic;">No hay niveles. Añade uno abajo o arriba.</p>';
        return;
    }
    if (typeof initDMMapViewport === 'function') initDMMapViewport();
    if (typeof renderDMMapMarkers === 'function') renderDMMapMarkers();
    listEl.innerHTML = mapLevels.map((lev, i) => {
        const n = (lev.name || 'Nivel ' + (i + 1)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const imgUrl = (lev.imageUrl || '').trim() || DEFAULT_MAP_IMAGE_URL;
        const isVisible = lev.visible !== false;
        return `<div class="map-level-item ${isVisible ? '' : 'map-level-item-hidden'}" data-index="${i}">
            <img src="${imgUrl.replace(/"/g, '&quot;')}" alt="" class="map-level-thumb" onerror="this.src='${DEFAULT_MAP_IMAGE_URL.replace(/'/g, "\\'")}'">
            <span class="map-level-name">${n}</span>
            <label class="map-level-visible-label" title="${isVisible ? 'Ocultar para jugadores' : 'Mostrar a jugadores'}">
                <input type="checkbox" class="map-level-visible-cb" ${isVisible ? 'checked' : ''} onchange="toggleMapLevelVisible(${i})" aria-label="Visible para jugadores">
                <span class="map-level-visible-text">Visible</span>
            </label>
            <div class="map-level-actions">
                <button type="button" class="btn btn-small" onclick="editMapLevel(${i})" title="Editar">✏️</button>
                <button type="button" class="btn btn-small btn-danger" onclick="deleteMapLevel(${i})" title="Eliminar">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function updateMapPlayerView() {
    const visibleLevels = getVisibleMapLevels();
    const playerMapImg = document.getElementById('player-map-img');
    const mapTitlePlayer = document.getElementById('map-title-player');
    const nameEl = document.getElementById('player-map-level-name');
    const btnUp = document.getElementById('player-map-level-up');
    const btnDown = document.getElementById('player-map-level-down');
    if (visibleLevels.length === 0) {
        if (playerMapImg) playerMapImg.src = DEFAULT_MAP_IMAGE_URL;
        if (mapTitlePlayer) mapTitlePlayer.textContent = '🗺️ Mapa';
        if (nameEl) nameEl.textContent = '—';
        if (btnUp) btnUp.disabled = true;
        if (btnDown) btnDown.disabled = true;
        return;
    }
    if (playerMapLevelIndex >= visibleLevels.length) playerMapLevelIndex = visibleLevels.length - 1;
    if (playerMapLevelIndex < 0) playerMapLevelIndex = 0;
    const lev = visibleLevels[playerMapLevelIndex];
    const url = (lev.imageUrl || DEFAULT_MAP_IMAGE_URL).trim();
    const name = (lev.name || 'Nivel ' + (playerMapLevelIndex + 1)).trim();
    if (playerMapImg) {
        playerMapImg.src = url;
        playerMapImg.alt = 'Mapa de ' + name;
        playerMapImg.onload = function () { if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers(); };
    }
    if (mapTitlePlayer) mapTitlePlayer.textContent = '🗺️ Mapa de ' + name;
    if (nameEl) nameEl.textContent = name;
    if (btnUp) btnUp.disabled = playerMapLevelIndex >= visibleLevels.length - 1;
    if (btnDown) btnDown.disabled = playerMapLevelIndex <= 0;
    if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers();
}

function playerMapLevelUp() {
    const visibleLevels = getVisibleMapLevels();
    if (playerMapLevelIndex >= visibleLevels.length - 1) return;
    playerMapLevelIndex++;
    updateMapPlayerView();
}

function playerMapLevelDown() {
    if (playerMapLevelIndex <= 0) return;
    playerMapLevelIndex--;
    updateMapPlayerView();
}

function getPlayerMapLevelKey() {
    const visibleLevels = getVisibleMapLevels();
    const lev = visibleLevels[playerMapLevelIndex];
    if (!lev) return 'default';
    return String(lev.name || ('Nivel ' + (playerMapLevelIndex + 1))).trim();
}

function loadPlayerMapMarkers() {
    var user = getCurrentUser();
    if (!db || !user || !user.id || !isPlayer()) {
        playerMapMarkers = [];
        playerMapCustomMarkers = [];
        return Promise.resolve();
    }
    return db.collection('player_map_markers').doc(user.id).get().then(function (doc) {
        var data = doc.exists ? doc.data() : {};
        var markers = Array.isArray(data.markers) ? data.markers : [];
        var customs = Array.isArray(data.customMarkers) ? data.customMarkers : [];
        playerMapMarkers = markers.map(normalizePlayerMapMarker).filter(function (m) { return m && m.type === 'custom'; });
        playerMapCustomMarkers = customs.map(normalizePlayerCustomMarker).filter(Boolean);
        if (playerMapMarkers.length === 0 && playerMapCustomMarkers.length === 0) {
            migrateFromLocalStorage();
        }
        if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers();
        if (typeof renderPlayerMapFreeMarkersDropdown === 'function') renderPlayerMapFreeMarkersDropdown();
    }).catch(function (e) {
        console.error('Error loading player map markers:', e);
        migrateFromLocalStorage();
        if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers();
        if (typeof renderPlayerMapFreeMarkersDropdown === 'function') renderPlayerMapFreeMarkersDropdown();
    });
}

function migrateFromLocalStorage() {
    try {
        var raw = localStorage.getItem('playerMapMarkersV1');
        var parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length > 0) {
            playerMapMarkers = parsed.map(normalizePlayerMapMarker).filter(function (m) { return m && m.type === 'custom'; });
        }
    } catch (e) {}
    try {
        var rawCustom = localStorage.getItem('playerMapCustomMarkersV1');
        var parsedCustom = rawCustom ? JSON.parse(rawCustom) : [];
        if (Array.isArray(parsedCustom) && parsedCustom.length > 0) {
            playerMapCustomMarkers = parsedCustom.map(normalizePlayerCustomMarker).filter(Boolean);
        }
    } catch (e) {}
    if (playerMapMarkers.length > 0 || playerMapCustomMarkers.length > 0) {
        savePlayerMapMarkers();
        try {
            localStorage.removeItem('playerMapMarkersV1');
            localStorage.removeItem('playerMapCustomMarkersV1');
        } catch (e2) {}
    }
}

function savePlayerMapMarkers() {
    var user = getCurrentUser();
    if (!db || !user || !user.id || !isPlayer()) return Promise.resolve();
    var payload = {
        markers: playerMapMarkers,
        customMarkers: playerMapCustomMarkers,
        updatedAt: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date()
    };
    return db.collection('player_map_markers').doc(user.id).set(payload, { merge: true }).catch(function (e) {
        console.error('Error saving player map markers:', e);
    });
}

function normalizePlayerMapMarker(marker) {
    if (!marker) return null;
    const copy = { ...marker };
    copy.type = copy.type || (copy.cityId ? 'city' : 'custom');
    copy.levelKey = copy.levelKey || 'default';
    if (copy.type === 'custom') {
        copy.customId = copy.customId || ('custom-' + Math.random().toString(36).slice(2, 8));
        copy.label = copy.label || 'Marcador';
        copy.icon = copy.icon || '🔥';
    } else {
        copy.cityName = copy.cityName || 'Ciudad';
    }
    return copy;
}

function normalizePlayerCustomMarker(marker) {
    if (!marker || !marker.customId || !marker.label) return null;
    return {
        customId: marker.customId,
        label: marker.label,
        icon: marker.icon || '🔥'
    };
}

function renderPlayerMapFreeMarkersDropdown() {
    const sel = document.getElementById('player-map-free-existing');
    if (!sel) return;
    const currentValue = sel.value || '';
    const markers = playerMapCustomMarkers.slice();
    const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    sel.innerHTML = '<option value="">— Marcadores creados —</option>' + markers.map(m => {
        const label = `${m.icon || '🔥'} ${m.label || 'Marcador'}`;
        const selected = m.customId === currentValue ? ' selected' : '';
        return `<option value="${esc(m.customId || '')}"${selected}>${esc(label)}</option>`;
    }).join('');
    if (currentValue && !markers.find(m => m.customId === currentValue)) {
        sel.value = '';
    }
}

function loadPlayerDMMapMarkers() {
    if (!db || !isPlayer()) return Promise.resolve();
    return db.collection('map_markers').where('source', '==', 'dm').get().then(function (snap) {
        var byKey = {};
        (snap.docs || []).forEach(function (d) {
            var m = { id: d.id, ...d.data() };
            if (m.source !== 'dm') return;
            if (m.type === 'custom') {
                var key = (m.customId || m.id || '') + '::' + (m.levelKey || 'default');
                var prev = byKey[key];
                var ts = m.updatedAt && typeof m.updatedAt.toMillis === 'function' ? m.updatedAt.toMillis() : 0;
                var pts = prev && prev.updatedAt && typeof prev.updatedAt.toMillis === 'function' ? prev.updatedAt.toMillis() : 0;
                if (!prev || ts >= pts) byKey[key] = m;
            } else {
                byKey[d.id] = m;
            }
        });
        playerDMMapMarkers = Object.values(byKey);
        if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers();
    }).catch(function (e) { console.error('Error loading DM map markers for player:', e); });
}

function renderPlayerMapMarkers() {
    const layer = document.getElementById('player-map-markers-layer');
    if (!layer) return;
    const levelKey = getPlayerMapLevelKey();
    const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dmMarkers = playerDMMapMarkers.filter(m => (m.levelKey || 'default') === levelKey);
    const ownMarkers = playerMapMarkers.filter(m => (m.levelKey || 'default') === levelKey);
    const markers = dmMarkers.concat(ownMarkers);
    layer.innerHTML = markers.map(m => {
        const type = m.type || 'city';
        const left = Math.max(0, Math.min(100, Number(m.x)));
        const top = Math.max(0, Math.min(100, Number(m.y)));
        const cityAttrs = type === 'city'
            ? `data-city-id="${escAttr(m.cityId)}" data-city-name="${escAttr(m.cityName)}" role="button" tabindex="0" aria-label="${escAttr(m.cityName || 'Ir a ciudad')}"`
            : '';
        const icon = type === 'custom' ? (m.icon || '🔥') : '🏰';
        const label = type === 'custom' ? (m.label || 'Marcador') : (m.cityName || 'Ciudad');
        const customAttr = type === 'custom' ? `data-custom-id="${escAttr(m.customId || '')}"` : '';
        return `<div class="player-map-marker" ${cityAttrs} ${customAttr} style="left:${left}%; top:${top}%;">
            <span class="player-map-marker-pin">${esc(icon)}</span>
            <span class="player-map-marker-label">${esc(label)}</span>
        </div>`;
    }).join('');
}

function initPlayerMapViewport() {
    playerMapViewportEl = document.getElementById('player-map-viewport');
    playerMapStageEl = document.getElementById('player-map-stage');
    if (!playerMapViewportEl || !playerMapStageEl) return;
    if (!playerMapViewportEl.dataset.initialized) {
        const zoomInBtn = document.getElementById('player-map-zoom-in');
        const zoomOutBtn = document.getElementById('player-map-zoom-out');
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => setPlayerMapZoom(playerMapZoom + 0.25));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setPlayerMapZoom(playerMapZoom - 0.25));
        playerMapViewportEl.addEventListener('wheel', handlePlayerMapWheel, { passive: false });
        playerMapViewportEl.addEventListener('pointerdown', onPlayerMapPointerDown);
        window.addEventListener('pointermove', onPlayerMapPointerMove);
        window.addEventListener('pointerup', onPlayerMapPointerUp);
        window.addEventListener('pointercancel', onPlayerMapPointerUp);
        playerMapViewportEl.dataset.initialized = 'true';
    }
    resetPlayerMapTransform();
}

function handlePlayerMapWheel(e) {
    if (!playerMapViewportEl) return;
    e.preventDefault();
    const rect = playerMapViewportEl.getBoundingClientRect();
    const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setPlayerMapZoom(playerMapZoom + delta, center);
}

function onPlayerMapPointerDown(e) {
    if (!playerMapViewportEl) return;
    if (playerMapPlaceMode) return;
    if (e.target.closest('.player-map-marker')) return;
    playerMapViewportEl.setPointerCapture?.(e.pointerId);
    playerMapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (playerMapPointers.size === 1) {
        playerMapDragLast = { x: e.clientX, y: e.clientY };
        playerMapWasDragging = false;
    } else if (playerMapPointers.size === 2) {
        playerMapLastPinchDist = getPlayerMapPointersDistance();
    }
}

function onPlayerMapPointerMove(e) {
    if (!playerMapPointers.has(e.pointerId)) return;
    playerMapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (playerMapPointers.size === 2) {
        const newDist = getPlayerMapPointersDistance();
        if (playerMapLastPinchDist && newDist) {
            const delta = newDist - playerMapLastPinchDist;
            const center = getPlayerMapPointersCenter();
            setPlayerMapZoom(playerMapZoom + delta / 200, center);
        }
        playerMapLastPinchDist = newDist;
    } else if (playerMapPointers.size === 1 && playerMapZoom > 1) {
        const pt = playerMapPointers.get(e.pointerId);
        if (!playerMapDragLast) playerMapDragLast = { ...pt };
        const dx = pt.x - playerMapDragLast.x;
        const dy = pt.y - playerMapDragLast.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            playerMapWasDragging = true;
            playerMapDragLast = { ...pt };
            setPlayerMapPan(playerMapPanX + dx, playerMapPanY + dy);
        }
    }
}

function onPlayerMapPointerUp(e) {
    if (playerMapViewportEl) {
        playerMapViewportEl.releasePointerCapture?.(e.pointerId);
    }
    playerMapPointers.delete(e.pointerId);
    if (playerMapPointers.size < 2) playerMapLastPinchDist = null;
    if (playerMapPointers.size === 0) playerMapDragLast = null;
    applyPlayerMapTransform();
}

function getPlayerMapPointersDistance() {
    if (playerMapPointers.size < 2) return null;
    const pts = Array.from(playerMapPointers.values());
    const [a, b] = pts;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function getPlayerMapPointersCenter() {
    if (!playerMapViewportEl || playerMapPointers.size === 0) return { x: playerMapViewportEl?.clientWidth / 2 || 0, y: playerMapViewportEl?.clientHeight / 2 || 0 };
    const rect = playerMapViewportEl.getBoundingClientRect();
    const pts = Array.from(playerMapPointers.values());
    const avgX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const avgY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    return { x: avgX - rect.left, y: avgY - rect.top };
}

function setPlayerMapZoom(targetZoom, center) {
    if (!playerMapViewportEl) return;
    const newZoom = Math.min(PLAYER_MAP_MAX_ZOOM, Math.max(PLAYER_MAP_MIN_ZOOM, targetZoom));
    const prevZoom = playerMapZoom;
    if (Math.abs(newZoom - prevZoom) < 0.001) return;
    const rect = playerMapViewportEl.getBoundingClientRect();
    const focusX = center && typeof center.x === 'number' ? center.x : rect.width / 2;
    const focusY = center && typeof center.y === 'number' ? center.y : rect.height / 2;
    const stageX = (focusX - playerMapPanX) / prevZoom;
    const stageY = (focusY - playerMapPanY) / prevZoom;
    playerMapZoom = newZoom;
    if (playerMapZoom <= 1.0001) {
        playerMapPanX = 0;
        playerMapPanY = 0;
    } else {
        playerMapPanX = focusX - stageX * playerMapZoom;
        playerMapPanY = focusY - stageY * playerMapZoom;
        const clamped = clampPlayerMapPan(playerMapPanX, playerMapPanY);
        playerMapPanX = clamped.x;
        playerMapPanY = clamped.y;
    }
    applyPlayerMapTransform();
}

function setPlayerMapPan(x, y) {
    if (playerMapZoom <= 1) {
        playerMapPanX = 0;
        playerMapPanY = 0;
    } else {
        const clamped = clampPlayerMapPan(x, y);
        playerMapPanX = clamped.x;
        playerMapPanY = clamped.y;
    }
    applyPlayerMapTransform();
}

function clampPlayerMapPan(x, y) {
    if (!playerMapViewportEl || !playerMapStageEl) return { x: 0, y: 0 };
    if (playerMapZoom <= 1.0001) return { x: 0, y: 0 };
    const rect = playerMapViewportEl.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const baseWidth = playerMapStageEl.offsetWidth || vw;
    const baseHeight = playerMapStageEl.offsetHeight || vh;
    const scaledW = baseWidth * playerMapZoom;
    const scaledH = baseHeight * playerMapZoom;
    var minX = vw - scaledW;
    var minY = vh - scaledH;
    if (minX > 0) minX = 0;
    if (minY > 0) minY = 0;
    return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
    };
}

function applyPlayerMapTransform() {
    if (!playerMapStageEl) return;
    playerMapStageEl.style.transform = `translate3d(${playerMapPanX}px, ${playerMapPanY}px, 0) scale(${playerMapZoom})`;
    playerMapStageEl.classList.toggle('is-pannable', playerMapZoom > 1);
    playerMapStageEl.classList.toggle('is-panning', playerMapPointers.size === 1 && playerMapZoom > 1);
    if (playerMapViewportEl) playerMapViewportEl.classList.toggle('is-zoomed', playerMapZoom >= PLAYER_MAP_LABELS_ZOOM);
}

function resetPlayerMapTransform() {
    playerMapZoom = 1;
    playerMapPanX = 0;
    playerMapPanY = 0;
    applyPlayerMapTransform();
}

function getDMMapLevelKey() {
    if (mapLevels.length === 0) return 'default';
    var lev = mapLevels[dmMapLevelIndex];
    return lev ? String(lev.name || ('Nivel ' + (dmMapLevelIndex + 1))).trim() : 'default';
}

function initDMMapViewport() {
    dmMapViewportEl = document.getElementById('dm-map-viewport');
    dmMapStageEl = document.getElementById('dm-map-stage');
    if (!dmMapViewportEl || !dmMapStageEl) return;
    if (!dmMapViewportEl.dataset.initialized) {
        var zi = document.getElementById('dm-map-zoom-in');
        var zo = document.getElementById('dm-map-zoom-out');
        var zr = document.getElementById('dm-map-zoom-reset');
        if (zi) zi.addEventListener('click', function () { setDMMapZoom(dmMapZoom + 0.25); });
        if (zo) zo.addEventListener('click', function () { setDMMapZoom(dmMapZoom - 0.25); });
        if (zr) zr.addEventListener('click', resetDMMapTransform);
        dmMapViewportEl.addEventListener('wheel', handleDMMapWheel, { passive: false });
        dmMapViewportEl.addEventListener('pointerdown', onDMMapPointerDown);
        window.addEventListener('pointermove', onDMMapPointerMove);
        window.addEventListener('pointerup', onDMMapPointerUp);
        window.addEventListener('pointercancel', onDMMapPointerUp);
        dmMapStageEl.addEventListener('click', function (e) {
            if (dmMapWasDragging) { dmMapWasDragging = false; return; }
            if (!dmMapPlaceMode) return;
            placeDMMapMarkerFromEvent(e);
        });
        var dmLayer = document.getElementById('dm-map-markers-layer');
        if (dmLayer) {
            dmLayer.addEventListener('click', function (e) {
                if (dmMapPlaceMode) return;
                var marker = e.target.closest('.player-map-marker');
                if (!marker) return;
                e.stopPropagation();
                if (marker.dataset.cityId) openDMCityFromMap(marker.dataset.cityId);
            });
        }
        dmMapViewportEl.dataset.initialized = 'true';
    }
    resetDMMapTransform();
}

function handleDMMapWheel(e) {
    if (!dmMapViewportEl) return;
    e.preventDefault();
    var rect = dmMapViewportEl.getBoundingClientRect();
    var center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    var delta = e.deltaY < 0 ? 0.2 : -0.2;
    setDMMapZoom(dmMapZoom + delta, center);
}

function onDMMapPointerDown(e) {
    if (!dmMapViewportEl) return;
    if (dmMapPlaceMode) return;
    if (e.target.closest('.player-map-marker')) return;
    dmMapViewportEl.setPointerCapture && dmMapViewportEl.setPointerCapture(e.pointerId);
    dmMapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dmMapPointers.size === 1) {
        dmMapDragLast = { x: e.clientX, y: e.clientY };
        dmMapWasDragging = false;
    } else if (dmMapPointers.size === 2) {
        dmMapLastPinchDist = getDMMapPointersDistance();
    }
}

function onDMMapPointerMove(e) {
    if (!dmMapPointers.has(e.pointerId)) return;
    dmMapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dmMapPointers.size === 2) {
        var nd = getDMMapPointersDistance();
        if (dmMapLastPinchDist && nd) {
            var dc = nd - dmMapLastPinchDist;
            var c = getDMMapPointersCenter();
            setDMMapZoom(dmMapZoom + dc / 200, c);
        }
        dmMapLastPinchDist = nd;
    } else if (dmMapPointers.size === 1 && dmMapZoom > 1) {
        var pt = dmMapPointers.get(e.pointerId);
        if (!dmMapDragLast) dmMapDragLast = { x: pt.x, y: pt.y };
        var dx = pt.x - dmMapDragLast.x, dy = pt.y - dmMapDragLast.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            dmMapWasDragging = true;
            dmMapDragLast = { x: pt.x, y: pt.y };
            setDMMapPan(dmMapPanX + dx, dmMapPanY + dy);
        }
    }
}

function onDMMapPointerUp(e) {
    if (dmMapViewportEl) dmMapViewportEl.releasePointerCapture && dmMapViewportEl.releasePointerCapture(e.pointerId);
    dmMapPointers.delete(e.pointerId);
    if (dmMapPointers.size < 2) dmMapLastPinchDist = null;
    if (dmMapPointers.size === 0) dmMapDragLast = null;
    applyDMMapTransform();
}

function getDMMapPointersDistance() {
    if (dmMapPointers.size < 2) return null;
    var pts = Array.from(dmMapPointers.values());
    var a = pts[0], b = pts[1];
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function getDMMapPointersCenter() {
    if (!dmMapViewportEl || dmMapPointers.size === 0) return { x: dmMapViewportEl ? dmMapViewportEl.clientWidth / 2 : 0, y: dmMapViewportEl ? dmMapViewportEl.clientHeight / 2 : 0 };
    var rect = dmMapViewportEl.getBoundingClientRect();
    var pts = Array.from(dmMapPointers.values());
    var ax = pts.reduce(function (s, p) { return s + p.x; }, 0) / pts.length;
    var ay = pts.reduce(function (s, p) { return s + p.y; }, 0) / pts.length;
    return { x: ax - rect.left, y: ay - rect.top };
}

function setDMMapZoom(targetZoom, center) {
    if (!dmMapViewportEl) return;
    var nz = Math.min(PLAYER_MAP_MAX_ZOOM, Math.max(PLAYER_MAP_MIN_ZOOM, targetZoom));
    var pz = dmMapZoom;
    if (Math.abs(nz - pz) < 0.001) return;
    var rect = dmMapViewportEl.getBoundingClientRect();
    var fx = (center && typeof center.x === 'number') ? center.x : rect.width / 2;
    var fy = (center && typeof center.y === 'number') ? center.y : rect.height / 2;
    var sx = (fx - dmMapPanX) / pz, sy = (fy - dmMapPanY) / pz;
    dmMapZoom = nz;
    if (dmMapZoom <= 1.0001) { dmMapPanX = 0; dmMapPanY = 0; }
    else {
        dmMapPanX = fx - sx * dmMapZoom;
        dmMapPanY = fy - sy * dmMapZoom;
        var cl = clampDMMapPan(dmMapPanX, dmMapPanY);
        dmMapPanX = cl.x;
        dmMapPanY = cl.y;
    }
    applyDMMapTransform();
}

function setDMMapPan(x, y) {
    if (dmMapZoom <= 1) { dmMapPanX = 0; dmMapPanY = 0; }
    else {
        var cl = clampDMMapPan(x, y);
        dmMapPanX = cl.x;
        dmMapPanY = cl.y;
    }
    applyDMMapTransform();
}

function clampDMMapPan(x, y) {
    if (!dmMapViewportEl || !dmMapStageEl || dmMapZoom <= 1.0001) return { x: 0, y: 0 };
    var rect = dmMapViewportEl.getBoundingClientRect();
    var vw = rect.width, vh = rect.height;
    var bw = dmMapStageEl.offsetWidth || vw, bh = dmMapStageEl.offsetHeight || vh;
    var sw = bw * dmMapZoom, sh = bh * dmMapZoom;
    var minX = vw - sw; if (minX > 0) minX = 0;
    var minY = vh - sh; if (minY > 0) minY = 0;
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
}

function applyDMMapTransform() {
    if (!dmMapStageEl) return;
    dmMapStageEl.style.transform = 'translate3d(' + dmMapPanX + 'px, ' + dmMapPanY + 'px, 0) scale(' + dmMapZoom + ')';
    dmMapStageEl.classList.toggle('is-pannable', dmMapZoom > 1);
    dmMapStageEl.classList.toggle('is-panning', dmMapPointers && dmMapPointers.size === 1 && dmMapZoom > 1);
    if (dmMapViewportEl) dmMapViewportEl.classList.toggle('is-zoomed', dmMapZoom >= PLAYER_MAP_LABELS_ZOOM);
}

function resetDMMapTransform() {
    dmMapZoom = 1;
    dmMapPanX = 0;
    dmMapPanY = 0;
    applyDMMapTransform();
}

function loadDMMapMarkers() {
    if (!db || !isDM()) return Promise.resolve();
    return db.collection('map_markers').where('source', '==', 'dm').get().then(function (snap) {
        dmMapMarkers = [];
        dmMapCustomMarkers = [];
        var customByKey = {};
        (snap.docs || []).forEach(function (d) {
            var m = { id: d.id, ...d.data() };
            if (m.source !== 'dm') return;
            if (m.type === 'custom') {
                var key = (m.customId || m.id || '') + '::' + (m.levelKey || 'default');
                var prev = customByKey[key];
                var ts = m.updatedAt && typeof m.updatedAt.toMillis === 'function' ? m.updatedAt.toMillis() : 0;
                var pts = prev && prev.updatedAt && typeof prev.updatedAt.toMillis === 'function' ? prev.updatedAt.toMillis() : 0;
                if (!prev || ts >= pts) customByKey[key] = m;
            } else {
                dmMapMarkers.push(m);
            }
        });
        dmMapCustomMarkers = Object.values(customByKey);
        if (typeof renderDMMapMarkers === 'function') renderDMMapMarkers();
        if (typeof renderDMMapMarkersDropdown === 'function') renderDMMapMarkersDropdown();
    }).catch(function (e) { console.error('Error loading DM map markers:', e); });
}

function saveDMMapMarkerToFirestore(marker) {
    if (!db) return Promise.resolve();
    var data = {
        levelKey: marker.levelKey,
        type: marker.type,
        x: marker.x,
        y: marker.y,
        source: 'dm',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (marker.type === 'city') {
        data.cityId = marker.cityId;
        data.cityName = marker.cityName;
    } else {
        data.customId = marker.customId;
        data.label = marker.label;
        data.icon = marker.icon || '🔥';
    }
    if (marker.id) return db.collection('map_markers').doc(marker.id).set(data, { merge: true });
    return db.collection('map_markers').add(data);
}

function deleteDMMapMarkerFromFirestore(markerId) {
    if (!db || !markerId) return Promise.resolve();
    return db.collection('map_markers').doc(markerId).delete();
}

function renderDMMapMarkersDropdown() {
    var sel = document.getElementById('dm-map-marker-city');
    if (!sel) return;
    var cities = citiesData || [];
    var cur = sel.value || '';
    sel.innerHTML = '<option value="">— Selecciona ciudad —</option>' + cities.filter(function (c) { return c.visibleToPlayers !== false; }).map(function (c) {
        var n = (c.nombre || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        var sel = c.id === cur ? ' selected' : '';
        return '<option value="' + (c.id || '').replace(/"/g, '&quot;') + '"' + sel + '>' + n + '</option>';
    }).join('');
    var fs = document.getElementById('dm-map-free-existing');
    if (fs) {
        var cv = fs.value || '';
        fs.innerHTML = '<option value="">— Marcadores creados —</option>' + dmMapCustomMarkers.map(function (m) {
            var lb = (m.icon || '🔥') + ' ' + (m.label || 'Marcador');
            var val = m.id || m.customId || '';
            var sel = val === cv ? ' selected' : '';
            return '<option value="' + String(val).replace(/"/g, '&quot;') + '"' + sel + '>' + lb.replace(/</g, '&lt;') + '</option>';
        }).join('');
    }
}

function renderDMMapMarkers() {
    var layer = document.getElementById('dm-map-markers-layer');
    if (!layer) return;
    var lk = getDMMapLevelKey();
    var markers = dmMapMarkers.concat(dmMapCustomMarkers).filter(function (m) { return (m.levelKey || 'default') === lk; });
    var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var escA = function (s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    layer.innerHTML = markers.map(function (m) {
        var type = m.type || 'city';
        var left = Math.max(0, Math.min(100, Number(m.x)));
        var top = Math.max(0, Math.min(100, Number(m.y)));
        var cityA = type === 'city' ? ' data-city-id="' + escA(m.cityId) + '" data-city-name="' + escA(m.cityName) + '"' : '';
        var icon = type === 'custom' ? (m.icon || '🔥') : '🏰';
        var label = type === 'custom' ? (m.label || 'Marcador') : (m.cityName || 'Ciudad');
        var customA = type === 'custom' ? ' data-custom-id="' + escA(m.customId || m.id) + '"' : '';
        return '<div class="player-map-marker"' + cityA + customA + ' style="left:' + left + '%; top:' + top + '%;"><span class="player-map-marker-pin">' + esc(icon) + '</span><span class="player-map-marker-label">' + esc(label) + '</span></div>';
    }).join('');
}

function toggleDMMapMarkersPanel() {
    dmMapMarkersPanelOpen = !dmMapMarkersPanelOpen;
    var panel = document.getElementById('dm-map-markers-panel');
    var btn = document.getElementById('dm-map-markers-toggle-btn');
    if (panel) panel.style.display = dmMapMarkersPanelOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('open', dmMapMarkersPanelOpen);
    if (!dmMapMarkersPanelOpen && dmMapPlaceMode) { dmMapPlaceMode = false; dmMapPlaceContext = null; }
}

function updateDMMapPlaceModeUI() {
    var cityBtn = document.getElementById('dm-map-marker-toggle');
    var citySave = document.getElementById('dm-map-marker-save');
    var freeBtn = document.getElementById('dm-map-free-toggle');
    var freeSave = document.getElementById('dm-map-free-save');
    var isCity = dmMapPlaceMode && dmMapPlaceContext && dmMapPlaceContext.type === 'city';
    var isFree = dmMapPlaceMode && dmMapPlaceContext && dmMapPlaceContext.type === 'custom';
    if (cityBtn) { cityBtn.classList.toggle('open', isCity); cityBtn.textContent = isCity ? '✅ Toca el mapa' : '🧭 Colocar'; }
    if (citySave) citySave.disabled = !isCity;
    if (freeBtn) { freeBtn.classList.toggle('open', isFree); freeBtn.textContent = isFree ? '✅ Toca el mapa' : '🧭 Colocar libre'; }
    if (freeSave) freeSave.disabled = !isFree;
}

function toggleDMMapPlaceMode() {
    var sel = document.getElementById('dm-map-marker-city');
    if (!sel) return;
    var cid = sel.value;
    if (!cid) { showToast('Selecciona una ciudad primero', true); return; }
    var city = (citiesData || []).find(function (c) { return c.id === cid; });
    var cname = city ? (city.nombre || 'Ciudad') : 'Ciudad';
    dmMapPlaceMode = true;
    dmMapPlaceContext = { type: 'city', cityId: cid, cityName: cname };
    updateDMMapPlaceModeUI();
}

function startDMMapFreeMode() {
    var sel = document.getElementById('dm-map-free-existing');
    if (!sel) return;
    var markerId = sel.value;
    if (!markerId) { showToast('Selecciona un marcador libre existente', true); return; }
    var marker = dmMapCustomMarkers.find(function (m) { return (m.id || m.customId) === markerId; });
    if (!marker) { showToast('Marcador no encontrado', true); return; }
    dmMapPlaceMode = true;
    dmMapPlaceContext = {
        type: 'custom',
        customId: marker.customId || marker.id,
        markerId: marker.id || '',
        label: marker.label || 'Marcador',
        icon: marker.icon || '🔥'
    };
    updateDMMapPlaceModeUI();
    showToast('Modo colocar libre activo. Toca el mapa y luego pulsa Guardar libre.');
}

function placeDMMapMarkerFromEvent(e) {
    if (!dmMapPlaceMode || !dmMapPlaceContext) return;
    var vp = dmMapViewportEl || document.getElementById('dm-map-viewport');
    var st = dmMapStageEl || document.getElementById('dm-map-stage');
    if (!vp || !st) return;
    var rect = vp.getBoundingClientRect();
    var bw = st.offsetWidth || rect.width || 1, bh = st.offsetHeight || rect.height || 1;
    var lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    var sx = (lx - dmMapPanX) / dmMapZoom, sy = (ly - dmMapPanY) / dmMapZoom;
    sx = Math.max(0, Math.min(bw, sx)); sy = Math.max(0, Math.min(bh, sy));
    var x = (sx / bw) * 100, y = (sy / bh) * 100;
    var lk = getDMMapLevelKey();
    var ctx = dmMapPlaceContext;
    if (ctx.type === 'city') {
        var city = (citiesData || []).find(function (c) { return c.id === ctx.cityId; });
        var cname = city ? (city.nombre || ctx.cityName || 'Ciudad') : (ctx.cityName || 'Ciudad');
        var ex = dmMapMarkers.find(function (m) { return m.cityId === ctx.cityId && (m.levelKey || 'default') === lk; });
        if (ex) {
            ex.x = x; ex.y = y; ex.cityName = cname;
            saveDMMapMarkerToFirestore(ex).then(function () { renderDMMapMarkers(); });
        } else {
            var nm = { type: 'city', cityId: ctx.cityId, cityName: cname, x: x, y: y, levelKey: lk };
            saveDMMapMarkerToFirestore(nm).then(function (ref) {
                nm.id = ref.id;
                dmMapMarkers.push(nm);
                renderDMMapMarkers();
                renderDMMapMarkersDropdown();
            });
        }
    } else if (ctx.type === 'custom') {
        var existing = dmMapCustomMarkers.find(function (m) {
            return (m.id && ctx.markerId && m.id === ctx.markerId) ||
                (m.customId === ctx.customId && (m.levelKey || 'default') === lk);
        });
        var nm = {
            id: existing && existing.id ? existing.id : (ctx.markerId || ''),
            type: 'custom',
            customId: ctx.customId,
            label: ctx.label,
            icon: ctx.icon || '🔥',
            x: x,
            y: y,
            levelKey: lk
        };
        var save = nm.id ? saveDMMapMarkerToFirestore(nm) : saveDMMapMarkerToFirestore(nm);
        save.then(function (ref) {
            if (!nm.id && ref && ref.id) nm.id = ref.id;
            dmMapCustomMarkers = dmMapCustomMarkers.filter(function (m) {
                return !(m.customId === nm.customId && (m.levelKey || 'default') === (nm.levelKey || 'default'));
            });
            dmMapCustomMarkers.push(nm);
            var li = document.getElementById('dm-map-free-label');
            if (li) li.value = '';
            renderDMMapMarkers();
            renderDMMapMarkersDropdown();
        });
    }
}

function finishDMMapCityPlacement() {
    if (!dmMapPlaceMode || !dmMapPlaceContext || dmMapPlaceContext.type !== 'city') return;
    dmMapPlaceMode = false;
    dmMapPlaceContext = null;
    updateDMMapPlaceModeUI();
}

function finishDMMapFreePlacement() {
    if (!dmMapPlaceMode || !dmMapPlaceContext || dmMapPlaceContext.type !== 'custom') return;
    dmMapPlaceMode = false;
    dmMapPlaceContext = null;
    var li = document.getElementById('dm-map-free-label');
    if (li) li.value = '';
    updateDMMapPlaceModeUI();
}

function removeDMMapMarker() {
    var sel = document.getElementById('dm-map-marker-city');
    if (!sel) return;
    var cid = sel.value;
    if (!cid) { showToast('Selecciona una ciudad', true); return; }
    var lk = getDMMapLevelKey();
    var m = dmMapMarkers.find(function (x) { return x.cityId === cid && (x.levelKey || 'default') === lk; });
    if (!m) { showToast('No hay marcador para esa ciudad', true); return; }
    deleteDMMapMarkerFromFirestore(m.id).then(function () {
        dmMapMarkers = dmMapMarkers.filter(function (x) { return x.id !== m.id; });
        renderDMMapMarkers();
        renderDMMapMarkersDropdown();
        showToast('Marcador eliminado');
    }).catch(function (err) {
        console.error('Error borrando marcador de ciudad:', err);
        showToast('Error al eliminar', true);
    });
}

function removeDMMapFreeMarker() {
    var sel = document.getElementById('dm-map-free-existing');
    if (!sel) return;
    var cid = sel.value;
    if (!cid) { showToast('Selecciona un marcador', true); return; }
    var m = dmMapCustomMarkers.find(function (x) { return (x.id || x.customId) === cid; });
    if (!m) { showToast('No encontrado', true); return; }
    function done() {
        dmMapCustomMarkers = dmMapCustomMarkers.filter(function (x) { return (x.id || x.customId) !== cid; });
        renderDMMapMarkers();
        renderDMMapMarkersDropdown();
        showToast('Marcador eliminado');
    }
    if (m.id) {
        deleteDMMapMarkerFromFirestore(m.id).then(done).catch(function (err) {
            console.error('Error borrando marcador de Firestore:', err);
            showToast('Error al eliminar', true);
        });
    } else {
        done();
    }
}

function createDMMapFreeMarker() {
    var iconSel = document.getElementById('dm-map-free-icon');
    var labelIn = document.getElementById('dm-map-free-label');
    if (!iconSel || !labelIn) return;
    var label = (labelIn.value || '').trim();
    if (!label) { showToast('Escribe un nombre', true); return; }
    var icon = iconSel.value || '🔥';
    var cid = 'dm-custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    dmMapCustomMarkers.push({ customId: cid, label: label, icon: icon });
    if (typeof renderDMMapMarkersDropdown === 'function') renderDMMapMarkersDropdown();
    var fs = document.getElementById('dm-map-free-existing');
    if (fs) fs.value = cid;
    labelIn.value = '';
    showToast('Marcador creado. Selecciónalo y pulsa Colocar libre.');
}

function createPlayerMapFreeMarker() {
    const iconSel = document.getElementById('player-map-free-icon');
    const labelInput = document.getElementById('player-map-free-label');
    if (!iconSel || !labelInput) return;
    const label = (labelInput.value || '').trim();
    if (!label) {
        showToast('Escribe un nombre para el marcador', true);
        return;
    }
    const icon = iconSel.value || '🔥';
    const customId = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    playerMapCustomMarkers.push({ customId, label, icon });
    savePlayerMapMarkers();
    renderPlayerMapFreeMarkersDropdown();
    const existingSelect = document.getElementById('player-map-free-existing');
    if (existingSelect) existingSelect.value = customId;
    labelInput.value = '';
    showToast('Marcador creado. Ahora selecciónalo y pulsa “Colocar libre”.');
}

function startPlayerMapFreeMode() {
    if (!playerMapMarkersPanelOpen) {
        setPlayerMapMarkersPanel(true);
    }
    const sel = document.getElementById('player-map-free-existing');
    if (!sel) return;
    const markerId = sel.value;
    if (!markerId) {
        showToast('Selecciona un marcador libre de la lista', true);
        return;
    }
    const marker = playerMapCustomMarkers.find(m => m.customId === markerId);
    if (!marker) {
        showToast('Marcador no encontrado', true);
        return;
    }
    playerMapPlaceMode = true;
    playerMapPlaceContext = { type: 'custom', customId: marker.customId, label: marker.label, icon: marker.icon || '🔥' };
    updatePlayerMapPlaceModeUI();
    showToast('Modo colocar libre activo. Toca el mapa y luego pulsa Guardar libre.');
}

function placePlayerMapMarkerFromEvent(e) {
    if (!playerMapPlaceMode || !playerMapPlaceContext) return;
    const viewport = playerMapViewportEl || document.getElementById('player-map-viewport');
    const stage = playerMapStageEl || document.getElementById('player-map-stage');
    if (!viewport || !stage) return;
    const rect = viewport.getBoundingClientRect();
    const baseWidth = stage.offsetWidth || rect.width || 1;
    const baseHeight = stage.offsetHeight || rect.height || 1;
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    let stageX = (localX - playerMapPanX) / playerMapZoom;
    let stageY = (localY - playerMapPanY) / playerMapZoom;
    stageX = Math.max(0, Math.min(baseWidth, stageX));
    stageY = Math.max(0, Math.min(baseHeight, stageY));
    const x = (stageX / baseWidth) * 100;
    const y = (stageY / baseHeight) * 100;
    const levelKey = getPlayerMapLevelKey();
    const ctx = playerMapPlaceContext;
    if (ctx.type !== 'custom') return;
    playerMapMarkers = playerMapMarkers.filter(m => !(m.type === 'custom' && m.customId === ctx.customId));
    playerMapMarkers.push({
        type: 'custom',
        customId: ctx.customId,
        label: ctx.label,
        icon: ctx.icon || '🔥',
        x,
        y,
        levelKey
    });
    savePlayerMapMarkers();
    renderPlayerMapMarkers();
    updatePlayerMapPlaceModeUI();
    // Se mantiene en modo colocar hasta que se pulse Guardar; sin toast para evitar spam
}

function removePlayerMapFreeMarker() {
    const sel = document.getElementById('player-map-free-existing');
    if (!sel) return;
    const markerId = sel.value;
    if (!markerId) {
        showToast('Selecciona un marcador libre', true);
        return;
    }
    const beforeMarkers = playerMapMarkers.length;
    const beforeCustoms = playerMapCustomMarkers.length;
    playerMapMarkers = playerMapMarkers.filter(m => !(m.type === 'custom' && m.customId === markerId));
    playerMapCustomMarkers = playerMapCustomMarkers.filter(m => m.customId !== markerId);
    if (playerMapPlaceMode && playerMapPlaceContext && playerMapPlaceContext.type === 'custom' && playerMapPlaceContext.customId === markerId) {
        playerMapPlaceMode = false;
        playerMapPlaceContext = null;
    }
    if (playerMapMarkers.length !== beforeMarkers || playerMapCustomMarkers.length !== beforeCustoms) {
        savePlayerMapMarkers();
        renderPlayerMapMarkers();
        renderPlayerMapFreeMarkersDropdown();
        showToast('Marcador libre eliminado');
    } else {
        showToast('Marcador no encontrado', true);
    }
}

function finishPlayerMapFreePlacement() {
    if (!playerMapPlaceMode || !playerMapPlaceContext || playerMapPlaceContext.type !== 'custom') {
        showToast('No hay marcador libre en modo colocar.');
        return;
    }
    const ctxId = playerMapPlaceContext.customId;
    playerMapPlaceMode = false;
    playerMapPlaceContext = null;
    const existingSelect = document.getElementById('player-map-free-existing');
    if (existingSelect && existingSelect.value !== ctxId) {
        existingSelect.value = ctxId || '';
    }
    updatePlayerMapPlaceModeUI();
    showToast('Marcador libre guardado');
}

function openPlayerCityFromMap(cityId, cityName) {
    if (!cityId) return;
    const container = document.getElementById('player-view-container');
    const tab = container && container.querySelector('.nav-tab[data-tab="player-ciudades"]');
    if (tab) tab.click();
    setTimeout(() => {
        if (typeof openPlayerCityShops === 'function') openPlayerCityShops(cityId, cityName || 'Ciudad');
    }, 60);
}

function openDMCityFromMap(cityId) {
    if (!cityId || !isDM()) return;
    var container = document.getElementById('main-container');
    var tab = container && container.querySelector('.nav-tab[data-tab="cities"]');
    if (tab) tab.click();
    setTimeout(function () {
        var el = document.getElementById('city-' + cityId);
        if (!el) return;
        if (!el.classList.contains('expanded')) {
            if (typeof ensureCityDataLoaded === 'function') {
                ensureCityDataLoaded(cityId).then(function () {
                    el.classList.add('expanded');
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            } else {
                el.classList.add('expanded');
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 80);
}

function initPlayerMapMarkers() {
    if (!window._playerMapMarkersInit) {
        window._playerMapMarkersInit = true;
        loadPlayerMapMarkers().then(function () {
            renderPlayerMapFreeMarkersDropdown();
            renderPlayerMapMarkers();
        var markersBtn = document.getElementById('player-map-markers-toggle-btn');
        if (markersBtn) markersBtn.addEventListener('click', function () { setPlayerMapMarkersPanel(!playerMapMarkersPanelOpen); });
        var rutasBtn = document.getElementById('player-map-rutas-toggle-btn');
        if (rutasBtn) rutasBtn.addEventListener('click', function () { if (typeof togglePlayerRutasPanel === 'function') togglePlayerRutasPanel(); });
        var bitacoraBtn = document.getElementById('player-map-bitacora-toggle-btn');
        if (bitacoraBtn) bitacoraBtn.addEventListener('click', function () { if (typeof togglePlayerBitacoraPanel === 'function') togglePlayerBitacoraPanel(); });
        const stage = document.getElementById('player-map-stage');
        if (stage) {
            stage.addEventListener('click', function (e) {
                if (playerMapWasDragging) {
                    playerMapWasDragging = false;
                    return;
                }
                if (!playerMapPlaceMode) {
                    var isTouch = (typeof window.matchMedia !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 1024px)').matches) || window.innerWidth <= 1024;
                    if (isTouch && !e.target.closest('.player-map-marker')) {
                        var ly = document.getElementById('player-map-markers-layer');
                        if (ly) ly.querySelectorAll('.player-map-marker.label-visible').forEach(function (m) { m.classList.remove('label-visible'); });
                    }
                    return;
                }
                placePlayerMapMarkerFromEvent(e);
            });
        }
        const layer = document.getElementById('player-map-markers-layer');
        if (layer) {
            function handleMarkerTap(marker) {
                if (!marker) return;
                var isMobile = (typeof window.matchMedia !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 1024px)').matches) || window.innerWidth <= 1024;
                if (marker.dataset.cityId) {
                    if (isMobile) {
                        const labelAlreadyVisible = marker.classList.contains('label-visible');
                        if (labelAlreadyVisible) {
                            marker.classList.remove('label-visible');
                            openPlayerCityFromMap(marker.dataset.cityId, marker.dataset.cityName);
                        } else {
                            layer.querySelectorAll('.player-map-marker.label-visible').forEach(function (m) { m.classList.remove('label-visible'); });
                            marker.classList.add('label-visible');
                        }
                    } else {
                        openPlayerCityFromMap(marker.dataset.cityId, marker.dataset.cityName);
                    }
                } else if (isMobile) {
                    layer.querySelectorAll('.player-map-marker.label-visible').forEach(function (m) { m.classList.remove('label-visible'); });
                    marker.classList.toggle('label-visible');
                }
            }
            var lastMarkerTapTime = 0;
            var touchStartMarker = null;
            var pointerStartMarker = null;
            function isTouchOrSmallScreen() {
                return (typeof window.matchMedia !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 1024px)').matches) || window.innerWidth <= 1024;
            }
            layer.addEventListener('touchstart', function (e) {
                if (playerMapPlaceMode) return;
                touchStartMarker = e.target.closest('.player-map-marker') || null;
            }, { passive: true });
            layer.addEventListener('touchend', function (e) {
                if (playerMapPlaceMode) return;
                var marker = touchStartMarker || e.target.closest('.player-map-marker');
                touchStartMarker = null;
                if (!marker) return;
                e.preventDefault();
                if (Date.now() - lastMarkerTapTime < 350) return;
                lastMarkerTapTime = Date.now();
                handleMarkerTap(marker);
            }, { passive: false });
            layer.addEventListener('pointerdown', function (e) {
                if (playerMapPlaceMode) return;
                if (e.pointerType === 'touch' || e.pointerType === 'pen') pointerStartMarker = e.target.closest('.player-map-marker') || null;
            }, { passive: true });
            layer.addEventListener('pointerup', function (e) {
                if (playerMapPlaceMode) return;
                var marker = pointerStartMarker || e.target.closest('.player-map-marker');
                pointerStartMarker = null;
                if (!marker) return;
                if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                    if (Date.now() - lastMarkerTapTime < 350) return;
                    lastMarkerTapTime = Date.now();
                    e.preventDefault();
                    handleMarkerTap(marker);
                }
            }, { passive: false });
            layer.addEventListener('click', function (e) {
                if (playerMapPlaceMode) return;
                if (Date.now() - lastMarkerTapTime < 350) return;
                var marker = e.target.closest('.player-map-marker');
                if (!marker) return;
                e.stopPropagation();
                lastMarkerTapTime = Date.now();
                handleMarkerTap(marker);
            });
            layer.addEventListener('keydown', function (e) {
                if (playerMapPlaceMode) return;
                const marker = e.target.closest('.player-map-marker');
                if (!marker || !marker.dataset.cityId) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    var isMob = (typeof window.matchMedia !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 1024px)').matches) || window.innerWidth <= 1024;
                    if (isMob && marker.classList.contains('label-visible')) {
                        marker.classList.remove('label-visible');
                    }
                    openPlayerCityFromMap(marker.dataset.cityId, marker.dataset.cityName);
                }
            });
        }
        setPlayerMapMarkersPanel(false);
        var resizeTimeout;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers();
            }, 100);
        });
        setTimeout(function () {
            if (typeof renderPlayerMapMarkers === 'function') renderPlayerMapMarkers();
        }, 300);
        initPlayerMapViewport();
        if (typeof initPlayerMapTouch === 'function') initPlayerMapTouch();
        });
    }
}

function updatePlayerMapPlaceModeUI() {
    const freeBtn = document.getElementById('player-map-free-toggle');
    const freeSaveBtn = document.getElementById('player-map-free-save');
    const freeHint = document.getElementById('player-map-free-hint');
    const generalHint = document.getElementById('player-map-markers-hint');
    const panelActive = playerMapMarkersPanelOpen;
    const isFreeMode = playerMapPlaceMode && playerMapPlaceContext && playerMapPlaceContext.type === 'custom';
    if (freeBtn) {
        freeBtn.classList.toggle('active', isFreeMode);
        freeBtn.textContent = isFreeMode ? '✅ Toca el mapa' : '🧭 Colocar libre';
        freeBtn.title = isFreeMode ? 'Toca el mapa para colocar' : 'Activar modo colocar libre';
        freeBtn.disabled = !panelActive;
    }
    if (freeSaveBtn) {
        freeSaveBtn.disabled = !(panelActive && isFreeMode);
    }
    if (freeHint) {
        if (!panelActive) {
            freeHint.textContent = 'Pulsa “Marcadores” para gestionar tus iconos libres.';
        } else if (isFreeMode && playerMapPlaceContext && playerMapPlaceContext.label) {
            freeHint.textContent = 'Toca el mapa para colocar “' + playerMapPlaceContext.label + '” y pulsa Guardar libre.';
        } else {
            freeHint.textContent = 'Crea un marcador, selecciónalo y pulsa “Colocar libre”. Luego toca el mapa.';
        }
    }
    if (generalHint) {
        generalHint.textContent = panelActive
            ? 'Los marcadores de ciudad los coloca el DM. Gestiona aquí tus marcadores libres.'
            : 'Pulsa “Marcadores” para gestionar tus iconos libres.';
    }
}

function togglePlayerMapMarkersPanel() {
    setPlayerMapMarkersPanel(!playerMapMarkersPanelOpen);
}
window.togglePlayerMapMarkersPanel = togglePlayerMapMarkersPanel;

function setPlayerMapMarkersPanel(isOpen) {
    if (isOpen) closeOtherPlayerMapPanels('markers');
    playerMapMarkersPanelOpen = !!isOpen;
    const panel = document.getElementById('player-map-markers-panel');
    const btn = document.getElementById('player-map-markers-toggle-btn');
    if (panel) panel.style.display = playerMapMarkersPanelOpen ? 'flex' : 'none';
    if (btn) {
        btn.classList.toggle('open', playerMapMarkersPanelOpen);
        btn.setAttribute('aria-expanded', playerMapMarkersPanelOpen ? 'true' : 'false');
    }
    if (!playerMapMarkersPanelOpen && playerMapPlaceMode) {
        playerMapPlaceMode = false;
        playerMapPlaceContext = null;
    }
    updatePlayerMapPlaceModeUI();
}

function toggleMapLevelVisible(index) {
    if (index < 0 || index >= mapLevels.length) return;
    mapLevels[index].visible = mapLevels[index].visible === false;
    saveMapLevels().then(() => {
        const visibleLevels = getVisibleMapLevels();
        if (playerMapLevelIndex >= visibleLevels.length) playerMapLevelIndex = Math.max(0, visibleLevels.length - 1);
        updateMapDMView();
        updateMapPlayerView();
        showToast(mapLevels[index].visible ? 'Nivel visible para jugadores' : 'Nivel oculto para jugadores');
    });
}

function editMapLevel(index) {
    mapEditIndex = index;
    updateMapDMView();
}

function cancelMapLevelEdit() {
    mapEditIndex = -1;
    updateMapDMView();
}

async function saveMapLevelEdit() {
    if (mapEditIndex < 0 || mapEditIndex >= mapLevels.length) return;
    const inputEl = document.getElementById('map-image-url');
    const continentInputEl = document.getElementById('map-continent-name');
    const url = (inputEl && inputEl.value) ? inputEl.value.trim() : '';
    const name = (continentInputEl && continentInputEl.value) ? continentInputEl.value.trim() : 'Nivel ' + (mapEditIndex + 1);
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        showToast('URL de imagen no válida', true);
        return;
    }
    const prev = mapLevels[mapEditIndex];
    mapLevels[mapEditIndex] = { name, imageUrl: url, visible: prev && prev.visible !== false };
    await saveMapLevels();
    mapEditIndex = -1;
    updateMapDMView();
    updateMapPlayerView();
    showToast('Nivel actualizado');
}

async function addMapLevel(above) {
    const inputEl = document.getElementById('map-image-url');
    const continentInputEl = document.getElementById('map-continent-name');
    const url = (inputEl && inputEl.value) ? inputEl.value.trim() : '';
    const name = (continentInputEl && continentInputEl.value) ? continentInputEl.value.trim() : 'Nuevo nivel';
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        showToast('Escribe una URL de imagen válida (https://...) antes de añadir', true);
        return;
    }
    const newLevel = { name: name || 'Nuevo nivel', imageUrl: url, visible: true };
    if (above) mapLevels.push(newLevel);
    else mapLevels.unshift(newLevel);
    await saveMapLevels();
    if (inputEl) inputEl.value = '';
    if (continentInputEl) continentInputEl.value = '';
    updateMapDMView();
    updateMapPlayerView();
    showToast('Nivel añadido');
}

async function deleteMapLevel(index) {
    if (index < 0 || index >= mapLevels.length) return;
    if (!confirm('¿Eliminar este nivel del mapa?')) return;
    mapLevels.splice(index, 1);
    if (mapEditIndex === index) mapEditIndex = -1;
    else if (mapEditIndex > index) mapEditIndex--;
    if (playerMapLevelIndex >= mapLevels.length) playerMapLevelIndex = Math.max(0, mapLevels.length - 1);
    await saveMapLevels();
    updateMapDMView();
    updateMapPlayerView();
    showToast('Nivel eliminado');
}

async function saveMapLevels() {
    await db.collection('settings').doc('map').set({ levels: mapLevels }, { merge: true });
}

async function setDefaultMapLevel(index) {
    const idx = typeof index === 'string' ? parseInt(index, 10) : index;
    if (isNaN(idx) || idx < 0 || idx >= mapLevels.length) return;
    defaultMapLevelIndex = idx;
    updateMapDMView();
    await db.collection('settings').doc('map').set({ defaultLevelIndex: idx }, { merge: true });
    const visibleLevels = getVisibleMapLevels();
    if (mapLevels[idx] && mapLevels[idx].visible !== false) {
        let pos = 0;
        for (let i = 0; i < idx; i++) { if (mapLevels[i].visible !== false) pos++; }
        playerMapLevelIndex = pos;
        updateMapPlayerView();
    }
    showToast('Mapa inicial para aventureros actualizado');
}

function toggleMapEditMode() {
    if (!isDM()) return;
    const row = document.getElementById('map-config-row');
    const optionsRow = document.getElementById('map-edit-options');
    const btn = document.getElementById('map-edit-toggle-btn');
    if (!row || !btn) return;
    const isEditing = row.style.display === 'flex';
    if (isEditing) {
        row.style.display = 'none';
        if (optionsRow) optionsRow.style.display = 'none';
        btn.textContent = '✏️ Editar mapa';
        btn.title = 'Mostrar configuración del mapa';
    } else {
        if (optionsRow) optionsRow.style.display = 'block';
        row.style.display = 'flex';
        btn.textContent = '✔️ Ocultar configuración';
        btn.title = 'Volver al modo solo ver';
    }
}

function getTipoLabel(item) {
    const v = (item.tipo || item.type || item.section || item.categoria || item.tier || '').toString().trim().toLowerCase();
    const map = { libro: 'Libro', libros: 'Libro', poción: 'Poción', pocion: 'Poción', pociones: 'Poción', arma: 'Arma', armas: 'Arma', armadura: 'Armadura', armaduras: 'Armadura', bebida: 'Bebida', bebidas: 'Bebida', servir: 'Bebida', drink: 'Bebida', grimorio: 'Libro', grimorios: 'Libro', herrería: 'Arma/Armadura', forja: 'Arma/Armadura', objeto: 'Objeto' };
    if (map[v]) return map[v];
    if (v) return v.charAt(0).toUpperCase() + v.slice(1);
    if ((item.name || '').toLowerCase().includes('poción')) return 'Poción';
    if ((item.name || '').toLowerCase().match(/\b(espada|daga|arco|arma)\b/)) return 'Arma';
    if ((item.name || '').toLowerCase().match(/\b(armadura|capa|anillo|escudo)\b/)) return 'Armadura';
    if ((item.name || '').toLowerCase().includes('libro')) return 'Libro';
    return 'Objeto';
}

function groupInventoryItems(items) {
    const map = {};
    (items || []).forEach((item, i) => {
        const key = (item.name || '') + '|' + (item.effect || '') + '|' + (item.price ?? '') + '|' + (item.rarity || '');
        const qty = getItemQuantity(item);
        if (!map[key]) map[key] = { item, indices: [], count: 0 };
        map[key].indices.push(i);
        map[key].count += qty;
    });
    return Object.values(map).map(g => ({ item: g.item, count: g.count, indices: g.indices }));
}

var _playerInvSortBy = 'name';
var _playerInvSortDir = 'asc';

function setPlayerInventorySort(column) {
    if (_playerInvSortBy === column) {
        _playerInvSortDir = _playerInvSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        _playerInvSortBy = column;
        _playerInvSortDir = 'asc';
    }
    syncPlayerInventorySortSelect();
    if (lastPlayerViewData) renderPlayerView(lastPlayerViewData);
}

function setPlayerInventorySortFromSelect(value) {
    if (!value || value.indexOf('_') === -1) return;
    var parts = value.split('_');
    _playerInvSortBy = parts[0];
    _playerInvSortDir = parts[1] === 'desc' ? 'desc' : 'asc';
    if (lastPlayerViewData) renderPlayerView(lastPlayerViewData);
}

function syncPlayerInventorySortSelect() {
    var sel = document.getElementById('player-inventory-sort');
    if (sel) sel.value = _playerInvSortBy + '_' + _playerInvSortDir;
}

function sortPlayerInventoryGroups(groups) {
    var by = _playerInvSortBy;
    var dir = _playerInvSortDir === 'asc' ? 1 : -1;
    var rarityOrder = { común: 0, inusual: 1, infrecuente: 2, rara: 3, legendaria: 4 };
    return groups.slice().sort(function (a, b) {
        var itA = a.item;
        var itB = b.item;
        var cmp = 0;
        if (by === 'name') {
            var na = (itA.name || '').toLowerCase();
            var nb = (itB.name || '').toLowerCase();
            cmp = na < nb ? -1 : (na > nb ? 1 : 0);
        } else if (by === 'tipo') {
            var ta = getTipoLabel(itA).toLowerCase();
            var tb = getTipoLabel(itB).toLowerCase();
            cmp = ta < tb ? -1 : (ta > tb ? 1 : 0);
        } else if (by === 'effect') {
            var ea = (itA.effect || '').toLowerCase();
            var eb = (itB.effect || '').toLowerCase();
            cmp = ea < eb ? -1 : (ea > eb ? 1 : 0);
        } else if (by === 'price') {
            var pa = Number(itA.price) || 0;
            var pb = Number(itB.price) || 0;
            cmp = pa - pb;
        } else if (by === 'rarity') {
            var ra = rarityOrder[(itA.rarity || 'común').toLowerCase()] ?? 0;
            var rb = rarityOrder[(itB.rarity || 'común').toLowerCase()] ?? 0;
            cmp = ra - rb;
        } else if (by === 'count') {
            cmp = a.count - b.count;
        }
        return cmp * dir;
    });
}

function renderPlayerView(data) {
    lastPlayerViewData = data;
    playerUbicacionActual = data.ubicacionActual || '';
    const nombre = data.nombre || '—';
    const classLevel = (data.clase || '—') + ' • Nivel ' + (data.nivel || 1);
    const oro = (data.oro != null ? data.oro : 0).toLocaleString() + ' GP';
    const banco = (data.bancoBalance != null ? data.bancoBalance : 0).toLocaleString() + ' GP';
    const items = data.inventario || [];
    const totalInventarioValue = items.reduce((sum, it) => sum + (Number(it.price) || 0) * getItemQuantity(it), 0);
    document.getElementById('player-header-name').textContent = nombre;
    document.getElementById('player-header-class-level').textContent = classLevel;
    document.getElementById('player-header-oro').textContent = '💰 ' + oro;
    const bancoEl = document.getElementById('player-header-banco');
    if (bancoEl) bancoEl.textContent = '🏦 ' + banco;
    const list = document.getElementById('player-view-inventory');
    const toolbar = document.getElementById('player-inventory-toolbar');
    const rarityColors = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
    if (items.length === 0) {
        if (toolbar) toolbar.style.display = 'none';
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Sin items</p>';
        return;
    }
    if (toolbar) toolbar.style.display = 'flex';
    syncPlayerInventorySortSelect();
    const searchEl = document.getElementById('player-inventory-search');
    const filterEl = document.getElementById('player-inventory-filter-shop');
    const searchTerm = (searchEl && searchEl.value || '').trim().toLowerCase();
    const filterShop = (filterEl && filterEl.value || '').trim();
    const groups = groupInventoryItems(items);
    const filtered = groups.filter(g => {
        const it = g.item;
        const matchText = !searchTerm ||
            (it.name || '').toLowerCase().includes(searchTerm) ||
            (getItemDesc(it) || '').toLowerCase().includes(searchTerm);
        const st = (it.shopTipo || '').toLowerCase();
        const matchShop = !filterShop ||
            (filterShop === 'dm' ? !st : st === filterShop);
        return matchText && matchShop;
    });
    const sorted = sortPlayerInventoryGroups(filtered);
    const esc = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var th = function (col, label) {
        var active = _playerInvSortBy === col;
        var arrow = active ? (_playerInvSortDir === 'asc' ? ' ↑' : ' ↓') : '';
        return '<th class="inv-sortable-th' + (active ? ' inv-sort-active' : '') + '" data-sort="' + col + '" role="button" tabindex="0" title="Ordenar por ' + label + '" onclick="setPlayerInventorySort(\'' + col + '\')">' + label + arrow + '</th>';
    };
    var theadRow = '<tr>' + th('name', 'Item') + th('tipo', 'Tipo') + th('effect', 'Efecto') + th('price', 'Precio') + th('rarity', 'Rareza') + th('count', 'Cantidad') + '<th class="inv-th-actions">Acciones</th></tr>';
    let tableHtml = '';
    let cardsHtml = '';
    const totalValueHtml = '<p class="player-inventory-total-value" style="margin-bottom:12px; color:#a89878; font-size:1em;">Valor total pertenencias: <strong style="color:#f1c40f;">' + totalInventarioValue.toLocaleString() + ' GP</strong></p>';
    if (sorted.length === 0) {
        const msg = searchTerm || filterShop
            ? 'No hay items que coincidan con los filtros.'
            : 'Sin items';
        tableHtml = '<div class="inventory-desktop inventory-table-wrap"><table class="inventory-table"><thead>' + theadRow + '</thead><tbody><tr><td colspan="7" style="color:#8b7355;text-align:center;padding:20px;">' + esc(msg) + '</td></tr></tbody></table></div>';
        cardsHtml = '<div class="inventory-cards-wrap"><div class="inventory-card" style="text-align:center;color:#8b7355;padding:24px;">' + esc(msg) + '</div></div>';
    } else {
        const rows = sorted.map(g => {
            const it = g.item;
            const idxUse = g.indices[0];
            const idxStr = g.indices.join(',');
            const r = rarityColors[it.rarity] || '#555';
            const tipoLabel = getTipoLabel(it);
            const idxStrEsc = (idxStr || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const actionsCell = `
                <div class="inv-actions-wrap">
                    <button type="button" class="btn btn-small btn-secondary inv-actions-menu-btn" onclick="toggleInvActionsMenu(event, this)" data-first-index="${idxUse}" data-count="${g.count}" data-indices-str="${idxStrEsc}" title="Acciones">⋮</button>
                    <div class="inv-actions-dropdown">
                        <button type="button" onclick="invActionUse(this)">✨ Utilizar</button>
                        <button type="button" onclick="invActionSell(this)">💰 Vender</button>
                        <button type="button" onclick="invActionTransfer(this)">📤 Transferir</button>
                    </div>
                </div>`;
            return `<tr class="player-inventory-row">
                <td><span class="player-inventory-item-name" style="color:#d4c4a8; font-weight:600; cursor:pointer; text-decoration:underline; text-underline-offset:3px;" onclick="openPlayerInventoryItemDetail(${idxUse}, ${g.count})" role="button" tabindex="0" title="Ver detalle del ítem">${esc(it.name || 'Item')}</span></td>
                <td><span class="inv-tipo">${esc(tipoLabel)}</span></td>
                <td><span style="color:#8b7355; font-size:0.9em;">${esc(it.effect || '—')}</span></td>
                <td><span style="color:#f1c40f;">${it.price != null ? esc(it.price + ' GP') : '—'}</span></td>
                <td><span class="rarity-badge" style="background:${r}; color:#fff;">${esc(it.rarity || 'común')}</span></td>
                <td class="inv-qty">${g.count}</td>
                <td class="inv-actions">${actionsCell}</td>
            </tr>`;
        }).join('');
        tableHtml = '<div class="inventory-desktop inventory-table-wrap"><table class="inventory-table"><thead>' + theadRow + '</thead><tbody>' + rows + '</tbody></table></div>';
        cardsHtml = sorted.map(g => {
            const it = g.item;
            const idxUse = g.indices[0];
            const idxStr = g.indices.join(',');
            const r = rarityColors[it.rarity] || '#555';
            const tipoLabel = getTipoLabel(it);
            const idxStrEscCard = (idxStr || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const actionsCard = `
                <div class="inv-actions-wrap">
                    <button type="button" class="btn btn-small btn-secondary inv-actions-menu-btn" onclick="toggleInvActionsMenu(event, this)" data-first-index="${idxUse}" data-count="${g.count}" data-indices-str="${idxStrEscCard}" title="Acciones">⋮</button>
                    <div class="inv-actions-dropdown">
                        <button type="button" onclick="invActionUse(this)">✨ Utilizar</button>
                        <button type="button" onclick="invActionSell(this)">💰 Vender</button>
                        <button type="button" onclick="invActionTransfer(this)">📤 Transferir</button>
                    </div>
                </div>`;
            return `<div class="inventory-card">
                <div class="inventory-card-header">
                    <span class="inventory-card-name player-inventory-item-name" style="cursor:pointer; text-decoration:underline; text-underline-offset:3px;" onclick="openPlayerInventoryItemDetail(${idxUse}, ${g.count})" role="button" tabindex="0" title="Ver detalle del ítem">${esc(it.name || 'Item')}</span>
                    <span class="rarity-badge" style="background:${r};color:#fff;">${esc(it.rarity || 'común')}</span>
                </div>
                <div class="inventory-card-meta">
                    <span class="inv-tipo">${esc(tipoLabel)}</span>
                    <span style="color:#f1c40f;">${it.price != null ? esc(it.price + ' GP') : '—'}</span>
                    <span>× ${g.count}</span>
                </div>
                <div class="inventory-card-effect">${esc(it.effect || '—')}</div>
                <div class="inventory-card-actions">${actionsCard}</div>
            </div>`;
        }).join('');
        cardsHtml = `<div class="inventory-cards-wrap">${cardsHtml}</div>`;
    }
    list.innerHTML = totalValueHtml + tableHtml + cardsHtml;
    renderPlayerMapUbicacionDropdown();
}

var _pendingUseAction = null;

function closeAllInvActionsMenus() {
    document.querySelectorAll('.inv-actions-dropdown.is-open').forEach(function (el) { el.classList.remove('is-open'); });
}

function toggleInvActionsMenu(event, btn) {
    if (event) event.stopPropagation();
    var dropdown = btn.nextElementSibling;
    if (!dropdown || !dropdown.classList.contains('inv-actions-dropdown')) return;
    var isOpen = dropdown.classList.contains('is-open');
    closeAllInvActionsMenus();
    if (!isOpen) dropdown.classList.add('is-open');
}

function invActionGetMenuBtn(actionBtn) {
    var wrap = actionBtn.closest('.inv-actions-wrap');
    return wrap ? wrap.querySelector('.inv-actions-menu-btn') : null;
}

function invActionUse(actionBtn) {
    var menuBtn = invActionGetMenuBtn(actionBtn);
    if (!menuBtn) return;
    closeAllInvActionsMenus();
    var firstIndex = parseInt(menuBtn.getAttribute('data-first-index'), 10);
    var count = parseInt(menuBtn.getAttribute('data-count'), 10) || 1;
    var indicesStr = (menuBtn.getAttribute('data-indices-str') || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (count > 1 && indicesStr) {
        openUseItemConfirmStack(indicesStr);
    } else {
        openUseItemConfirm(firstIndex);
    }
}

function invActionSell(actionBtn) {
    var menuBtn = invActionGetMenuBtn(actionBtn);
    if (!menuBtn) return;
    closeAllInvActionsMenus();
    var firstIndex = parseInt(menuBtn.getAttribute('data-first-index'), 10);
    var count = parseInt(menuBtn.getAttribute('data-count'), 10) || 1;
    var indicesStr = (menuBtn.getAttribute('data-indices-str') || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (count > 1 && indicesStr) {
        openSellConfirmStack(indicesStr);
    } else {
        openSellConfirm(firstIndex);
    }
}

function invActionTransfer(actionBtn) {
    var menuBtn = invActionGetMenuBtn(actionBtn);
    if (!menuBtn) return;
    closeAllInvActionsMenus();
    var firstIndex = parseInt(menuBtn.getAttribute('data-first-index'), 10);
    var count = parseInt(menuBtn.getAttribute('data-count'), 10) || 1;
    var indicesStr = (menuBtn.getAttribute('data-indices-str') || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    openTransferItemModal(firstIndex, count, indicesStr);
}

function openPlayerInventoryItemDetail(inventoryIndex, count) {
    if (!lastPlayerViewData || !lastPlayerViewData.inventario) return;
    var item = lastPlayerViewData.inventario[inventoryIndex];
    if (!item) return;
    var esc = function(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var name = esc(item.name || 'Item');
    var effectRaw = getItemDesc(item) || item.effect || '—';
    var effect = esc(effectRaw).replace(/\n/g, '<br>');
    var tipoLabel = getTipoLabel(item);
    var price = item.price != null ? item.price + ' GP' : '—';
    var rarity = item.rarity || 'común';
    var r = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' }[rarity] || '#555';
    var shopTipo = (item.shopTipo || '').trim();
    document.getElementById('player-inventory-detail-title').textContent = '📦 ' + (item.name || 'Item');
    document.getElementById('player-inventory-detail-name').innerHTML = name;
    document.getElementById('player-inventory-detail-tipo').textContent = 'Tipo: ' + tipoLabel;
    document.getElementById('player-inventory-detail-precio').innerHTML = '<span style="color:#f1c40f;">' + esc(price) + '</span>';
    document.getElementById('player-inventory-detail-rareza').innerHTML = '<span class="rarity-badge" style="background:' + r + ';color:#fff;padding:2px 8px;border-radius:4px;">' + esc(rarity === 'infrecuente' ? 'inusual' : rarity) + '</span>';
    document.getElementById('player-inventory-detail-cantidad').textContent = 'Cantidad: ' + (count != null ? count : 1);
    document.getElementById('player-inventory-detail-effect').innerHTML = effect;
    var damageEl = document.getElementById('player-inventory-detail-damage');
    var damageText = '';
    if (item.ac != null && item.ac !== '') {
        damageText = '🛡️ CA: ' + esc(item.ac);
    } else if (item.damage) {
        damageText = '⚡ ' + esc(item.damage) + (item.damageType ? ' ' + esc(item.damageType) : '');
    } else if (item.avg && String(item.avg).trim()) {
        damageText = '⚡ ' + esc(String(item.avg).trim());
    }
    if (damageText) {
        damageEl.innerHTML = damageText;
        damageEl.style.display = 'block';
    } else {
        damageEl.style.display = 'none';
    }
    var shopEl = document.getElementById('player-inventory-detail-shop');
    if (shopTipo) {
        shopEl.style.display = 'block';
        var shopLabel = shopTipo === 'encontrado banco' ? 'Encontrado / Banco' : shopTipo;
        shopEl.textContent = 'Procedencia: ' + shopLabel;
    } else {
        shopEl.style.display = 'none';
    }
    openModal('player-inventory-item-detail-modal');
}

function openUseItemConfirm(index) {
    if (!lastPlayerViewData || !lastPlayerViewData.inventario) return;
    var item = lastPlayerViewData.inventario[index];
    if (!item) return;
    var maxQty = getItemQuantity(item);
    var name = (item.name || 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var msgEl = document.getElementById('player-use-confirm-message');
    if (msgEl) msgEl.innerHTML = '¿Usar <strong>' + name + '</strong>?';
    var qtyInput = document.getElementById('player-use-qty');
    if (qtyInput) {
        qtyInput.min = 1;
        qtyInput.max = maxQty;
        qtyInput.value = Math.min(1, maxQty);
        qtyInput.style.display = maxQty <= 1 ? 'none' : '';
    }
    var qtyRow = document.getElementById('player-use-qty-row');
    if (qtyRow) qtyRow.style.display = maxQty <= 1 ? 'none' : 'block';
    _pendingUseAction = { type: 'single', index: index };
    openModal('player-use-item-confirm-modal');
}

function openUseItemConfirmStack(indicesStr) {
    if (!lastPlayerViewData || !lastPlayerViewData.inventario) return;
    var indices = indicesStr.split(',').map(function(s) { return parseInt(s, 10); }).filter(function(n) { return !isNaN(n); });
    if (indices.length === 0) return;
    var inv = lastPlayerViewData.inventario;
    var totalAvailable = indices.reduce(function(s, i) { return s + (i >= 0 && i < inv.length ? getItemQuantity(inv[i]) : 0); }, 0);
    var item = lastPlayerViewData.inventario[indices[0]];
    var name = (item && item.name ? item.name : 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var msgEl = document.getElementById('player-use-confirm-message');
    if (msgEl) msgEl.innerHTML = '¿Usar <strong>' + name + '</strong>?';
    var qtyInput = document.getElementById('player-use-qty');
    if (qtyInput) {
        qtyInput.min = 1;
        qtyInput.max = totalAvailable;
        qtyInput.value = 1;
        qtyInput.style.display = 'block';
    }
    var qtyRow = document.getElementById('player-use-qty-row');
    if (qtyRow) qtyRow.style.display = 'block';
    _pendingUseAction = { type: 'stack', indicesStr: indicesStr };
    openModal('player-use-item-confirm-modal');
}

function doConfirmedUseItem() {
    if (!_pendingUseAction) { closeModal('player-use-item-confirm-modal'); return; }
    var a = _pendingUseAction;
    var qtyInput = document.getElementById('player-use-qty');
    var qty = (qtyInput && qtyInput.value !== '') ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
    var maxVal = qtyInput ? (parseInt(qtyInput.getAttribute('max'), 10) || qty) : qty;
    qty = Math.min(qty, maxVal);
    _pendingUseAction = null;
    closeModal('player-use-item-confirm-modal');
    if (a.type === 'single') {
        playerUseItemStack(String(a.index), qty);
    } else {
        playerUseItemStack(a.indicesStr, qty);
    }
}

var _pendingSellAction = null;

function openSellConfirm(index) {
    if (!lastPlayerViewData || !lastPlayerViewData.inventario) return;
    var item = lastPlayerViewData.inventario[index];
    if (!item) return;
    var maxQty = getItemQuantity(item);
    var valorVenta = Math.floor((item.price || 0) * 0.75);
    var name = (item.name || 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var msgEl = document.getElementById('player-sell-confirm-message');
    var hintEl = document.getElementById('player-sell-confirm-hint');
    if (msgEl) msgEl.innerHTML = '¿Vender <strong>' + name + '</strong> por <strong>' + valorVenta.toLocaleString() + ' GP</strong> (por unidad)?';
    if (hintEl) hintEl.textContent = '75% del valor de compra por unidad.';
    var qtyInput = document.getElementById('player-sell-qty');
    if (qtyInput) {
        qtyInput.min = 1;
        qtyInput.max = maxQty;
        qtyInput.value = Math.min(1, maxQty);
        qtyInput.style.display = maxQty <= 1 ? 'none' : '';
    }
    var qtyRow = document.getElementById('player-sell-qty-row');
    if (qtyRow) qtyRow.style.display = maxQty <= 1 ? 'none' : 'block';
    _pendingSellAction = { type: 'single', index: index };
    openModal('player-sell-item-confirm-modal');
}

function openSellConfirmStack(indicesStr) {
    if (!lastPlayerViewData || !lastPlayerViewData.inventario) return;
    var indices = indicesStr.split(',').map(function(s) { return parseInt(s, 10); }).filter(function(n) { return !isNaN(n); });
    if (indices.length === 0) return;
    var inv = lastPlayerViewData.inventario;
    var totalAvailable = indices.reduce(function(s, i) { return s + (i >= 0 && i < inv.length ? getItemQuantity(inv[i]) : 0); }, 0);
    var itemName = (inv[indices[0]] || {}).name || 'Item';
    var name = itemName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var msgEl = document.getElementById('player-sell-confirm-message');
    var hintEl = document.getElementById('player-sell-confirm-hint');
    if (msgEl) msgEl.innerHTML = '¿Vender <strong>' + name + '</strong>?';
    if (hintEl) hintEl.textContent = '75% del valor de compra por unidad. Total según cantidad.';
    var qtyInput = document.getElementById('player-sell-qty');
    if (qtyInput) {
        qtyInput.min = 1;
        qtyInput.max = totalAvailable;
        qtyInput.value = 1;
        qtyInput.style.display = 'block';
    }
    var qtyRow = document.getElementById('player-sell-qty-row');
    if (qtyRow) qtyRow.style.display = 'block';
    _pendingSellAction = { type: 'stack', indicesStr: indicesStr };
    openModal('player-sell-item-confirm-modal');
}

function doConfirmedSellItem() {
    if (!_pendingSellAction) { closeModal('player-sell-item-confirm-modal'); return; }
    var a = _pendingSellAction;
    var qtyInput = document.getElementById('player-sell-qty');
    var qty = (qtyInput && qtyInput.value !== '') ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
    var maxVal = qtyInput ? (parseInt(qtyInput.getAttribute('max'), 10) || qty) : qty;
    qty = Math.min(qty, maxVal);
    _pendingSellAction = null;
    closeModal('player-sell-item-confirm-modal');
    if (a.type === 'single') {
        playerSellItemStack(String(a.index), qty);
    } else {
        playerSellItemStack(a.indicesStr, qty);
    }
}

async function playerUseItem(index) {
    const user = getCurrentUser();
    if (!user || !isPlayer() || index == null) return;
    try {
        const ref = db.collection('players').doc(user.id);
        const snap = await getCurrentPlayerDoc();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        if (index < 0 || index >= inventario.length) { showToast('Ítem no válido', true); return; }
        const item = inventario[index];
        const qty = getItemQuantity(item);
        if (qty > 1 && item.quantity != null && item.quantity >= 1) {
            inventario[index] = { ...item, quantity: item.quantity - 1 };
        } else {
            inventario.splice(index, 1);
        }
        await ref.update({ inventario });
        await db.collection('transactions').add({
            tipo: 'uso',
            itemName: item.name || 'Item',
            playerName: data.nombre || 'Desconocido',
            playerId: user.id,
            shopName: '—',
            precio: 0,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Item usado y eliminado del inventario');
        if (lastPlayerViewData) {
            lastPlayerViewData.inventario = inventario;
            renderPlayerView(lastPlayerViewData);
        } else {
            getCurrentPlayerDoc().then(doc => { if (doc.exists) renderPlayerView(doc.data()); });
        }
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

async function playerUseItemStack(indicesStr, qtyOrButton) {
    const user = getCurrentUser();
    if (!user || !isPlayer() || !indicesStr) return;
    let indices = indicesStr.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (indices.length === 0) return;
    let qty = indices.length;
    if (typeof qtyOrButton === 'object' && qtyOrButton && qtyOrButton.nodeType === 1) {
        const container = qtyOrButton.closest('td') || qtyOrButton.closest('.inventory-card-actions');
        const input = container ? container.querySelector('.inv-sell-qty') : null;
        if (input) {
            const max = parseInt(input.getAttribute('data-max'), 10) || indices.length;
            qty = Math.min(Math.max(1, parseInt(input.value, 10) || 1), max);
        }
        indices = indices.slice(0, qty);
    } else if (typeof qtyOrButton === 'number' && qtyOrButton > 0) {
        qty = Math.min(qtyOrButton, indices.length);
        indices = indices.slice(0, qty);
    }
    if (indices.length === 0) return;
    try {
        const ref = db.collection('players').doc(user.id);
        const snap = await getCurrentPlayerDoc();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        let removed = 0;
        const qtyToUse = Math.min(qty, indices.reduce((s, i) => s + (i >= 0 && i < inventario.length ? getItemQuantity(inventario[i]) : 0), 0));
        let remaining = qtyToUse;
        for (const i of indices) {
            if (remaining <= 0 || i < 0 || i >= inventario.length) continue;
            const it = inventario[i];
            const itemQty = getItemQuantity(it);
            const take = Math.min(remaining, itemQty);
            remaining -= take;
            if (take >= itemQty) {
                inventario[i] = null;
            } else {
                inventario[i] = { ...it, quantity: (it.quantity != null ? it.quantity : 1) - take };
            }
        }
        const nuevoInv = inventario.filter(it => it != null);
        await ref.update({ inventario: nuevoInv });
        const itemName = (data.inventario[indices[0]] || {}).name || 'Item';
        for (let i = 0; i < qtyToUse; i++) {
            await db.collection('transactions').add({
                tipo: 'uso',
                itemName: itemName,
                playerName: data.nombre || 'Desconocido',
                playerId: user.id,
                shopName: '—',
                precio: 0,
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        showToast(qtyToUse === 1 ? 'Item usado' : qtyToUse + ' items usados');
        if (lastPlayerViewData) {
            lastPlayerViewData.inventario = nuevoInv;
            renderPlayerView(lastPlayerViewData);
        } else {
            getCurrentPlayerDoc().then(doc => { if (doc.exists) renderPlayerView(doc.data()); });
        }
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

async function playerSellItem(index) {
    const user = getCurrentUser();
    if (!user || !isPlayer() || index == null) return;
    try {
        const ref = db.collection('players').doc(user.id);
        const snap = await getCurrentPlayerDoc();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        if (index < 0 || index >= inventario.length) { showToast('Ítem no válido', true); return; }
        const item = inventario[index];
        const qty = getItemQuantity(item);
        const valorVenta = Math.floor((item.price || 0) * 0.75);
        const nuevoOro = (data.oro != null ? data.oro : 0) + valorVenta;
        if (qty > 1 && item.quantity != null && item.quantity >= 1) {
            inventario[index] = { ...item, quantity: item.quantity - 1 };
        } else {
            inventario.splice(index, 1);
        }
        await ref.update({ oro: nuevoOro, inventario });
        await db.collection('transactions').add({
            tipo: 'venta',
            itemName: (item.name || 'Item'),
            playerName: data.nombre || 'Desconocido',
            playerId: user.id,
            shopName: 'Venta',
            precio: valorVenta,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Vendido por ' + valorVenta + ' GP');
        if (lastPlayerViewData) {
            lastPlayerViewData.oro = nuevoOro;
            lastPlayerViewData.inventario = inventario;
            renderPlayerView(lastPlayerViewData);
        } else {
            getCurrentPlayerDoc().then(doc => { if (doc.exists) renderPlayerView(doc.data()); });
        }
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

async function playerSellItemStack(indicesStr, qtyOrButton) {
    const user = getCurrentUser();
    if (!user || !isPlayer() || !indicesStr) return;
    let indices = indicesStr.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (indices.length === 0) return;
    let qty = indices.length;
    if (typeof qtyOrButton === 'object' && qtyOrButton && qtyOrButton.nodeType === 1) {
        const cell = qtyOrButton.closest('td');
        const input = cell ? cell.querySelector('.inv-sell-qty') : null;
        if (input) {
            const max = parseInt(input.getAttribute('data-max'), 10) || indices.length;
            qty = Math.min(Math.max(1, parseInt(input.value, 10) || 1), max);
        }
        indices = indices.slice(0, qty);
    } else if (typeof qtyOrButton === 'number' && qtyOrButton > 0) {
        qty = Math.min(qtyOrButton, indices.length);
        indices = indices.slice(0, qty);
    }
    if (indices.length === 0) return;
    try {
        const ref = db.collection('players').doc(user.id);
        const snap = await getCurrentPlayerDoc();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        const totalAvailable = indices.reduce((s, i) => s + (i >= 0 && i < inventario.length ? getItemQuantity(inventario[i]) : 0), 0);
        const qtyToSell = Math.min(qty, totalAvailable);
        let remaining = qtyToSell;
        let totalVenta = 0;
        const firstName = (inventario[indices[0]] || {}).name || 'Item';
        for (const i of indices) {
            if (remaining <= 0 || i < 0 || i >= inventario.length) continue;
            const it = inventario[i];
            const itemQty = getItemQuantity(it);
            const take = Math.min(remaining, itemQty);
            remaining -= take;
            totalVenta += Math.floor((it.price || 0) * 0.75 * take);
            if (take >= itemQty) {
                inventario[i] = null;
            } else {
                inventario[i] = { ...it, quantity: (it.quantity != null ? it.quantity : 1) - take };
            }
        }
        const nuevoInv = inventario.filter(it => it != null);
        const nuevoOro = (data.oro != null ? data.oro : 0) + totalVenta;
        await ref.update({ oro: nuevoOro, inventario: nuevoInv });
        await db.collection('transactions').add({
            tipo: 'venta',
            itemName: qtyToSell > 1 ? qtyToSell + '× ' + firstName : firstName,
            playerName: data.nombre || 'Desconocido',
            playerId: user.id,
            shopName: 'Venta',
            precio: totalVenta,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Vendido por ' + totalVenta + ' GP');
        if (lastPlayerViewData) {
            lastPlayerViewData.oro = nuevoOro;
            lastPlayerViewData.inventario = nuevoInv;
            renderPlayerView(lastPlayerViewData);
        } else {
            getCurrentPlayerDoc().then(doc => { if (doc.exists) renderPlayerView(doc.data()); });
        }
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

var _pendingTransfer = null;

function openTransferItemModal(firstIndex, count, indicesStr) {
    const user = getCurrentUser();
    if (!user || !isPlayer()) return;
    if (!lastPlayerViewData || !lastPlayerViewData.inventario) return;
    const item = lastPlayerViewData.inventario[firstIndex];
    if (!item) return;
    _pendingTransfer = { firstIndex, count, indicesStr };
    const nameEl = document.getElementById('player-transfer-item-name');
    const qtyEl = document.getElementById('player-transfer-qty');
    const selectEl = document.getElementById('player-transfer-to-select');
    if (nameEl) nameEl.textContent = 'Transferir: ' + (item.name || 'Item') + (count > 1 ? ' (máx. ' + count + ')' : '');
    if (qtyEl) {
        qtyEl.min = 1;
        qtyEl.max = count;
        qtyEl.value = count > 1 ? 1 : 1;
    }
    if (selectEl) {
        selectEl.innerHTML = '<option value="">— Cargando —</option>';
        db.collection('players').limit(200).get().then(snap => {
            const others = (snap.docs || [])
                .map(d => ({ id: d.id, nombre: (d.data().nombre || '').trim() || 'Sin nombre', visible: d.data().visible }))
                .filter(p => p.id !== user.id && p.visible !== false)
                .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
            selectEl.innerHTML = '<option value="">— Elige jugador —</option>' +
                others.map(p => '<option value="' + p.id + '">' + (p.nombre || p.id).replace(/</g, '&lt;') + '</option>').join('');
        }).catch(() => {
            selectEl.innerHTML = '<option value="">— Error al cargar —</option>';
        });
    }
    if (typeof openModal === 'function') openModal('player-transfer-item-modal');
}

async function confirmTransferItem() {
    const user = getCurrentUser();
    if (!user || !isPlayer() || !_pendingTransfer) return;
    const toId = document.getElementById('player-transfer-to-select') && document.getElementById('player-transfer-to-select').value;
    if (!toId) {
        showToast('Elige un jugador para enviar el ítem', true);
        return;
    }
    if (toId === user.id) {
        showToast('No puedes enviarte a ti mismo', true);
        return;
    }
    const qtyEl = document.getElementById('player-transfer-qty');
    const qty = Math.min(Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1), _pendingTransfer.count);
    const indicesStr = _pendingTransfer.indicesStr;
    const indices = indicesStr.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (indices.length === 0) return;
    const btn = document.getElementById('player-transfer-do-btn');
    if (btn) btn.disabled = true;
    try {
        const senderRef = db.collection('players').doc(user.id);
        const senderSnap = await getCurrentPlayerDoc();
        if (!senderSnap.exists) { showToast('Error al leer tu inventario', true); return; }
        const senderData = senderSnap.data();
        const inventario = (senderData.inventario || []).slice();
        const totalAvailable = indices.reduce((s, i) => s + (i >= 0 && i < inventario.length ? getItemQuantity(inventario[i]) : 0), 0);
        const qtyToTransfer = Math.min(qty, totalAvailable);
        if (qtyToTransfer <= 0) { showToast('No hay unidades para transferir', true); return; }
        let remaining = qtyToTransfer;
        let entryToAdd = null;
        for (const i of indices) {
            if (remaining <= 0 || i < 0 || i >= inventario.length) continue;
            const it = inventario[i];
            const itemQty = getItemQuantity(it);
            const take = Math.min(remaining, itemQty);
            remaining -= take;
            if (!entryToAdd) {
                entryToAdd = Object.assign({}, it);
                if (take > 1) entryToAdd.quantity = take;
                else if (entryToAdd.quantity != null) delete entryToAdd.quantity;
            } else if (entryToAdd.quantity != null) {
                entryToAdd.quantity += take;
            } else {
                entryToAdd.quantity = take;
            }
            if (take >= itemQty) {
                inventario[i] = null;
            } else {
                inventario[i] = { ...it, quantity: (it.quantity != null ? it.quantity : 1) - take };
            }
        }
        const nuevoInvSender = inventario.filter(it => it != null);
        const receiverSnap = await db.collection('players').doc(toId).get();
        if (!receiverSnap.exists) {
            showToast('Jugador destino no encontrado', true);
            return;
        }
        const receiverData = receiverSnap.data();
        const receiverInv = (receiverData.inventario || []).slice();
        receiverInv.push(entryToAdd);
        await senderRef.update({ inventario: nuevoInvSender });
        await db.collection('players').doc(toId).update({ inventario: receiverInv });

        if (typeof closeModal === 'function') closeModal('player-transfer-item-modal');
        showToast('Transferido: ' + qtyToTransfer + '× ' + (entryToAdd.name || 'Item') + ' a ' + (receiverData.nombre || 'jugador'));
        _pendingTransfer = null;
        if (lastPlayerViewData) {
            lastPlayerViewData.inventario = nuevoInvSender;
            renderPlayerView(lastPlayerViewData);
        } else {
            getCurrentPlayerDoc().then(doc => { if (doc.exists) renderPlayerView(doc.data()); });
        }
    } catch (e) {
        console.error(e);
        showToast('Error al transferir: ' + (e.message || e), true);
    }
    if (btn) btn.disabled = false;
}

function openRegistrarEncontradoModal() {
    const user = getCurrentUser();
    if (!user || !isPlayer()) {
        showToast('Solo el jugador puede registrar objetos encontrados', true);
        return;
    }
    document.getElementById('registrar-encontrado-name').value = '';
    document.getElementById('registrar-encontrado-price').value = 0;
    document.getElementById('registrar-encontrado-quantity').value = 1;
    document.getElementById('registrar-encontrado-rarity').value = 'común';
    document.getElementById('registrar-encontrado-effect').value = '';
    openModal('registrar-encontrado-modal');
}

async function confirmRegistrarEncontrado() {
    const user = getCurrentUser();
    if (!user || !isPlayer()) return;
    const name = (document.getElementById('registrar-encontrado-name').value || '').trim();
    if (!name) {
        showToast('Escribe el nombre del objeto', true);
        return;
    }
    const price = parseInt(document.getElementById('registrar-encontrado-price').value, 10) || 0;
    const quantity = Math.max(1, parseInt(document.getElementById('registrar-encontrado-quantity').value, 10) || 1);
    const rarity = (document.getElementById('registrar-encontrado-rarity').value || 'común').trim();
    const effect = (document.getElementById('registrar-encontrado-effect').value || '').trim();
    var totalValor = price * quantity;
    var fee = Math.max(0, Math.floor(totalValor * 0.02));
    const item = {
        name: name,
        price: price,
        effect: effect,
        rarity: rarity,
        shopTipo: 'encontrado banco'
    };
    if (quantity > 1) item.quantity = quantity;
    try {
        const ref = db.collection('players').doc(user.id);
        const snap = await getCurrentPlayerDoc();
        if (!snap.exists) { showToast('Error al cargar tu personaje', true); return; }
        const data = snap.data();
        const oroActual = data.oro != null ? data.oro : 0;
        if (oroActual < fee) {
            showToast('No tienes suficiente oro. La comisión de notaría es ' + fee + ' GP (2% del valor declarado).', true);
            return;
        }
        const inventario = (data.inventario || []).slice();
        inventario.push(item);
        const nuevoOro = oroActual - fee;
        await ref.update({ inventario: inventario, oro: nuevoOro });
        await db.collection('transactions').add({
            tipo: 'registro',
            itemName: name,
            playerName: data.nombre || 'Jugador',
            playerId: user.id,
            shopName: 'Encontrado / Banco',
            precio: fee,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('registrar-encontrado-modal');
        if (lastPlayerViewData) {
            lastPlayerViewData.inventario = inventario;
            lastPlayerViewData.oro = nuevoOro;
            renderPlayerView(lastPlayerViewData);
        } else {
            getCurrentPlayerDoc().then(doc => { if (doc.exists) renderPlayerView(doc.data()); });
        }
        var reciboBody = document.getElementById('registrar-encontrado-recibo-body');
        if (reciboBody) {
            reciboBody.innerHTML = buildShopReceiptHTML({
                shopName: 'Notaría del Banco',
                logo: '📋',
                subtitle: 'Registro de objeto encontrado',
                items: [{ name: name + (quantity > 1 ? ' × ' + quantity : ''), line: 'Registrado' }],
                extraLines: [
                    { label: 'Valor declarado (total)', value: totalValor.toLocaleString() + ' GP' },
                    { label: 'Comisión notaría (2%)', value: fee.toLocaleString() + ' GP' }
                ],
                totalLabel: 'Oro descontado:',
                totalValue: fee.toLocaleString() + ' GP',
                footerThanks: 'Objeto registrado en tu inventario. Procedencia: Encontrado / Banco.',
                modalId: 'registrar-encontrado-recibo-modal'
            });
        }
        openModal('registrar-encontrado-recibo-modal');
    } catch (e) {
        showToast('Error al registrar: ' + (e.message || e), true);
    }
}

function showPlayerView() {
    const user = getCurrentUser();
    if (!user || !isPlayer()) {
        showLoginModal();
        return;
    }
    // FIRESTORE LISTENER FIX: cerrar player y tab; DM solo si realmente se abandona la vista DM
    if (typeof closeAll === 'function') {
        closeAll('player');
        closeAll('tab', 'transactions');
        if (window.__currentMode === 'dm') closeAll('dm');
    }
    window.__currentMode = 'player';
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('player-view-container').style.display = 'block';
    document.getElementById('login-modal').classList.remove('active');
    loadMapImage();
    if (typeof initPlayerMapMarkers === 'function') initPlayerMapMarkers();
    _playerDocCache = undefined;
    if (typeof invalidatePlayerLegendCache === 'function') invalidatePlayerLegendCache();
    var unsubPlayerDoc = db.collection('players').doc(user.id).onSnapshot(function (doc) {
        if (doc.exists) {
            _playerDocCache = doc.data();
            renderPlayerView(doc.data());
        } else {
            _playerDocCache = null;
        }
    });
    // FIRESTORE LISTENER FIX
    if (typeof registerUnsub === 'function') registerUnsub('player', null, unsubPlayerDoc);
    if (!window._playerInventorySearchListeners) {
        window._playerInventorySearchListeners = true;
        const onInvFilter = () => { if (lastPlayerViewData) renderPlayerView(lastPlayerViewData); };
        const si = document.getElementById('player-inventory-search');
        const sf = document.getElementById('player-inventory-filter-shop');
        if (si) si.addEventListener('input', onInvFilter);
        if (sf) sf.addEventListener('change', onInvFilter);
    }
    loadPlayerWorld();
    // Cargar notificaciones y badge de correos sin leer
    setTimeout(() => {
        if (typeof loadPlayerNotifications === 'function') loadPlayerNotifications();
        if (typeof startUnreadMailBadge === 'function') startUnreadMailBadge();
        if (typeof startMissionsPendingBadge === 'function') startMissionsPendingBadge();
        if (typeof loadPlayerMissions === 'function') loadPlayerMissions('activas');
    }, 500);
}

// FIRESTORE REALTIME REMOVED: replaced with manual refresh (getDocs)
function fetchPlayerCities() {
    if (!db) return Promise.resolve();
    return db.collection('cities').limit(300).get()
        .then(snap => {
            playerCitiesData = snap && snap.docs ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            if (typeof renderPlayerCities === 'function') renderPlayerCities();
        })
        .catch(err => { console.error('Error cargando ciudades (player):', err); });
}

// FIRESTORE REALTIME REMOVED: replaced with manual refresh (getDocs)
function fetchPlayerShops() {
    if (!db) return Promise.resolve();
    return db.collection('shops').limit(300).get()
        .then(snap => {
            playerShopsData = snap && snap.docs ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            if (typeof renderPlayerCities === 'function') renderPlayerCities();
        })
        .catch(err => { console.error('Error cargando tiendas (player):', err); });
}

// FIRESTORE REALTIME REMOVED: replaced with manual refresh (getDocs)
function fetchPlayerNpcs() {
    if (!db) return Promise.resolve();
    return db.collection('npcs').limit(300).get()
        .then(snap => {
            playerNpcsData = snap && snap.docs ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            if (typeof renderPlayerCities === 'function') renderPlayerCities();
            var wrap = document.getElementById('player-directorio-wrap');
            if (playerDirectorioCityId && wrap && wrap.style.display !== 'none') {
                openPlayerCityShops(playerDirectorioCityId, playerDirectorioCityNombre);
            }
        })
        .catch(err => { console.error('Error cargando NPCs (player):', err); });
}

/** Refresca cities/shops/npcs del jugador (getDocs). Llamar al entrar, al cambiar de ciudad o desde botón "Refrescar mundo". */
function refreshPlayerWorld() {
    Promise.all([fetchPlayerCities(), fetchPlayerShops(), fetchPlayerNpcs()]).then(function () {
        if (typeof renderPlayerCities === 'function') renderPlayerCities();
    });
}

function loadPlayerWorld() {
    refreshPlayerWorld();
    if (typeof loadRutasConocidas === 'function') loadRutasConocidas();
    if (typeof loadPlayerDMMapMarkers === 'function') loadPlayerDMMapMarkers();
}

function renderPlayerCities() {
    const el = document.getElementById('player-cities-container');
    if (!el) return;
    const visibleCities = playerCitiesData.filter(c => c.visibleToPlayers !== false);
    if (!visibleCities.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏘️</div><p>No hay ciudades visibles. El DM puede activarlas desde el dashboard.</p></div>';
        return;
    }
    el.innerHTML = visibleCities.map(city => {
        const shops = playerShopsData.filter(s => s.ciudadId === city.id);
        const npcs = playerNpcsData.filter(n => n.ciudadId === city.id);
        const cityId = city.id;
        const cityNombre = (city.nombre || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return `
            <div class="card" id="player-city-card-${esc(cityId)}">
                ${city.imagenUrl ? `<div style="width:100%; height:200px; overflow:hidden; border-radius:8px 8px 0 0; background:#2a231c; display:flex; align-items:center; justify-content:center;"><img src="${esc(city.imagenUrl)}" alt="${cityNombre}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:40px; color:#8b7355;\\'>🖼️</div>';"></div>` : ''}
                <div class="card-header">
                    <h3 class="card-title">🏰 ${esc(city.nombre || 'Sin nombre')}</h3>
                </div>
                <div class="card-body">
                    <p style="color:#8b7355; font-size:0.95em; margin-bottom:12px;">${esc(city.descripcion || 'Sin descripción')}</p>
                    <p style="color:#a89878; font-size:0.9em; margin-bottom:12px;">🛒 ${shops.length} tienda${shops.length !== 1 ? 's' : ''} · 🎭 ${npcs.length} personaje${npcs.length !== 1 ? 's' : ''}</p>
                    <button class="btn" onclick="openPlayerCityShops('${cityId}', '${cityNombre}')">Ver directorio</button>
                </div>
            </div>`;
    }).join('');
    renderPlayerMapUbicacionDropdown();
    renderPlayerMapFreeMarkersDropdown();
}

function renderPlayerMapUbicacionDropdown() {
    const sel = document.getElementById('player-map-ubicacion-select');
    if (!sel) return;
    const visibleCities = playerCitiesData.filter(c => c.visibleToPlayers !== false);
    const currentValue = playerUbicacionActual || '';
    sel.innerHTML = '<option value="">— Selecciona tu ciudad —</option>' + visibleCities.map(c => {
        const n = (c.nombre || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const selected = c.id === currentValue ? ' selected' : '';
        return `<option value="${(c.id || '').replace(/"/g, '&quot;')}"${selected}>${n}</option>`;
    }).join('');
    if (typeof renderPlayerRutas === 'function') renderPlayerRutas();
}

async function setPlayerUbicacion(cityId) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    playerUbicacionActual = cityId || '';
    try {
        await db.collection('players').doc(user.id).update({ ubicacionActual: playerUbicacionActual || null });
        showToast('Ubicación actualizada');
    } catch (e) {
        showToast('No se pudo guardar la ubicación', true);
    }
    renderPlayerRutas();
}

// ==================== RUTAS CONOCIDAS ====================
function loadRutasConocidas() {
    if (!db) return;
    if (window._rutasSubscribed) return;
    window._rutasSubscribed = true;
    var unsub = db.collection('rutas_conocidas').limit(200).onSnapshot(snap => {
        rutasConocidasData = (snap.docs || []).map(d => ({ id: d.id, ...d.data() }));
        if (isDM()) renderDMRutas();
        if (isPlayer()) renderPlayerRutas();
    });
    window._rutasUnsubscribe = function () { unsub(); window._rutasSubscribed = false; window._rutasUnsubscribe = null; };
    // FIRESTORE LISTENER FIX
    if (typeof registerUnsub === 'function') registerUnsub('dm', 'rutas', function () { unsub(); window._rutasSubscribed = false; window._rutasUnsubscribe = null; });
}

function toggleDMRutasSection() {
    const content = document.getElementById('dm-rutas-content');
    const btn = document.getElementById('dm-rutas-toggle-btn');
    if (!content || !btn) return;
    const isVisible = content.style.display !== 'none';
    if (isVisible) {
        content.style.display = 'none';
        btn.textContent = '▶ Mostrar rutas';
        btn.title = 'Mostrar la sección Rutas conocidas';
    } else {
        content.style.display = 'block';
        btn.textContent = '▼ Ocultar rutas';
        btn.title = 'Ocultar la sección Rutas conocidas';
    }
}

function renderDMRutas() {
    const listEl = document.getElementById('dm-rutas-list');
    if (!listEl) return;
    const cities = (typeof citiesData !== 'undefined' && Array.isArray(citiesData)) ? citiesData : [];
    const getName = (id) => (cities.find(c => c.id === id) || {}).nombre || id || '—';
    if (rutasConocidasData.length === 0) {
        listEl.innerHTML = '<p style="color:#8b7355; font-style:italic; padding:20px;">No hay rutas. Pulsa "➕ Añadir ruta" para crear una.</p>';
        return;
    }
    listEl.innerHTML = rutasConocidasData.map(r => {
        const salida = getName(r.ciudadSalidaId);
        const llegada = getName(r.ciudadLlegadaId);
        const medio = (r.medioTransporte || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const duracion = (r.duracion || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const hasNoches = r.noches != null && r.noches !== '' && !isNaN(Number(r.noches));
        const nochesStr = hasNoches ? (Number(r.noches) + (Number(r.noches) === 1 ? ' noche' : ' noches')) : '—';
        return `<div class="dm-ruta-item">
            <span class="dm-ruta-route">${salida} → ${llegada}</span>
            <span class="dm-ruta-medio">${medio}</span>
            <span class="dm-ruta-duracion">${duracion}</span>
            <span class="dm-ruta-noches">${nochesStr}</span>
            <div class="dm-ruta-actions">
                <button type="button" class="btn btn-small" onclick="editRuta('${r.id}')" title="Editar">✏️</button>
                <button type="button" class="btn btn-small btn-danger" onclick="deleteRuta('${r.id}')" title="Eliminar">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function openRutaModal(rutaId) {
    document.getElementById('ruta-edit-id').value = rutaId || '';
    document.getElementById('ruta-modal-title').textContent = rutaId ? '🛤️ Editar ruta' : '🛤️ Añadir ruta';
    document.getElementById('ruta-save-btn').textContent = rutaId ? '💾 Guardar cambios' : '💾 Guardar ruta';
    document.getElementById('ruta-ciudad-salida').value = '';
    document.getElementById('ruta-ciudad-llegada').value = '';
    document.getElementById('ruta-medio').value = '';
    document.getElementById('ruta-duracion').value = '';
    const nochesEl = document.getElementById('ruta-noches');
    if (nochesEl) nochesEl.value = '';
    const cities = (typeof citiesData !== 'undefined' && Array.isArray(citiesData)) ? citiesData : [];
    const opt = (id, name) => `<option value="${(id || '').replace(/"/g, '&quot;')}">${(name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`;
    document.getElementById('ruta-ciudad-salida').innerHTML = '<option value="">— Selecciona —</option>' + cities.map(c => opt(c.id, c.nombre)).join('');
    document.getElementById('ruta-ciudad-llegada').innerHTML = '<option value="">— Selecciona —</option>' + cities.map(c => opt(c.id, c.nombre)).join('');
    if (rutaId) {
        const r = rutasConocidasData.find(x => x.id === rutaId);
        if (r) {
            document.getElementById('ruta-ciudad-salida').value = r.ciudadSalidaId || '';
            document.getElementById('ruta-ciudad-llegada').value = r.ciudadLlegadaId || '';
            document.getElementById('ruta-medio').value = r.medioTransporte || '';
            document.getElementById('ruta-duracion').value = r.duracion || '';
            if (nochesEl) nochesEl.value = r.noches != null && r.noches !== '' ? r.noches : '';
        }
    }
    openModal('ruta-modal');
}

async function saveRuta() {
    const id = document.getElementById('ruta-edit-id').value.trim();
    const ciudadSalidaId = document.getElementById('ruta-ciudad-salida').value.trim();
    const ciudadLlegadaId = document.getElementById('ruta-ciudad-llegada').value.trim();
    const medioTransporte = (document.getElementById('ruta-medio').value || '').trim();
    const duracion = (document.getElementById('ruta-duracion').value || '').trim();
    const nochesRaw = document.getElementById('ruta-noches');
    const noches = nochesRaw && nochesRaw.value !== '' ? parseInt(nochesRaw.value, 10) : null;
    if (!ciudadSalidaId || !ciudadLlegadaId) {
        showToast('Elige ciudad de salida y de llegada', true);
        return;
    }
    const data = { ciudadSalidaId, ciudadLlegadaId, medioTransporte, duracion };
    if (noches != null && !isNaN(noches) && noches >= 0) data.noches = noches;
    try {
        if (id) {
            await db.collection('rutas_conocidas').doc(id).update(data);
            showToast('Ruta actualizada');
        } else {
            await db.collection('rutas_conocidas').add(data);
            showToast('Ruta creada');
        }
        closeModal('ruta-modal');
    } catch (e) {
        showToast('Error al guardar: ' + (e.message || e), true);
    }
}

function editRuta(id) {
    openRutaModal(id);
}

async function deleteRuta(id) {
    if (!id || !confirm('¿Eliminar esta ruta?')) return;
    try {
        await db.collection('rutas_conocidas').doc(id).delete();
        showToast('Ruta eliminada');
    } catch (e) {
        showToast('Error al eliminar', true);
    }
}

function renderPlayerRutas() {
    const salidaEl = document.getElementById('player-ruta-salida');
    const llegadaEl = document.getElementById('player-ruta-llegada');
    const medioEl = document.getElementById('player-ruta-medio');
    if (!salidaEl || !llegadaEl || !medioEl) return;
    const visibleCities = (playerCitiesData || []).filter(c => c.visibleToPlayers !== false);
    const opt = (id, name) => `<option value="${(id || '').replace(/"/g, '&quot;')}">${(name || 'Sin nombre').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`;
    salidaEl.innerHTML = '<option value="">— Selecciona —</option>' + visibleCities.map(c => opt(c.id, c.nombre)).join('');
    llegadaEl.innerHTML = '<option value="">— Selecciona —</option>' + visibleCities.map(c => opt(c.id, c.nombre)).join('');
    const medios = [...new Set((rutasConocidasData || []).map(r => (r.medioTransporte || '').trim()).filter(Boolean))].sort();
    medioEl.innerHTML = '<option value="">— Selecciona —</option>' + medios.map(m => `<option value="${m.replace(/"/g, '&quot;')}">${m.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`).join('');
    if (playerUbicacionActual) salidaEl.value = playerUbicacionActual;
    playerRutaCalcular();
}

function closeOtherPlayerMapPanels(exclude) {
    if (exclude !== 'rutas') {
        var rw = document.getElementById('player-map-rutas-wrap');
        var rb = document.getElementById('player-map-rutas-toggle-btn');
        if (rw) rw.style.display = 'none';
        if (rb) { rb.classList.remove('open'); rb.setAttribute('aria-expanded', 'false'); }
    }
    if (exclude !== 'bitacora') {
        var bw = document.getElementById('player-map-bitacora-wrap');
        var bb = document.getElementById('player-map-bitacora-toggle-btn');
        if (bw) bw.style.display = 'none';
        if (bb) { bb.classList.remove('open'); bb.setAttribute('aria-expanded', 'false'); }
    }
    if (exclude !== 'markers') {
        playerMapMarkersPanelOpen = false;
        var mp = document.getElementById('player-map-markers-panel');
        var mb = document.getElementById('player-map-markers-toggle-btn');
        if (mp) mp.style.display = 'none';
        if (mb) { mb.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); }
        if (playerMapPlaceMode) { playerMapPlaceMode = false; playerMapPlaceContext = null; updatePlayerMapPlaceModeUI(); }
    }
}

function togglePlayerRutasPanel() {
    const wrap = document.getElementById('player-map-rutas-wrap');
    const btn = document.getElementById('player-map-rutas-toggle-btn');
    if (!wrap || !btn) return;
    const isOpen = wrap.style.display !== 'none';
    if (!isOpen) closeOtherPlayerMapPanels('rutas');
    wrap.style.display = isOpen ? 'none' : 'block';
    btn.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
}

function playerRutaCalcular() {
    const resultEl = document.getElementById('player-map-rutas-result');
    if (!resultEl) return;
    const salidaId = (document.getElementById('player-ruta-salida') || {}).value || '';
    const llegadaId = (document.getElementById('player-ruta-llegada') || {}).value || '';
    const medio = ((document.getElementById('player-ruta-medio') || {}).value || '').trim();
    currentRutaParaViaje = null;
    if (!salidaId || !llegadaId || !medio) {
        resultEl.innerHTML = '<p class="player-map-rutas-msg">Elige ciudad de salida, ciudad de llegada y medio de transporte.</p>';
        resultEl.className = 'player-map-rutas-result';
        return;
    }
    const r = (rutasConocidasData || []).find(x =>
        (x.medioTransporte || '').trim() === medio &&
        ((x.ciudadSalidaId === salidaId && x.ciudadLlegadaId === llegadaId) ||
         (x.ciudadSalidaId === llegadaId && x.ciudadLlegadaId === salidaId))
    );
    if (!r) {
        currentRutaParaViaje = null;
        resultEl.innerHTML = '<p class="player-map-rutas-msg">No hay una ruta conocida con esa combinación.</p>';
        resultEl.className = 'player-map-rutas-result';
        return;
    }
    const noches = r.noches != null && r.noches !== '' && !isNaN(Number(r.noches)) ? Number(r.noches) : null;
    currentRutaParaViaje = { r, salidaId, llegadaId };
    const cities = (typeof playerCitiesData !== 'undefined' && Array.isArray(playerCitiesData)) ? playerCitiesData : [];
    const getName = (cid) => (cities.find(c => c.id === cid) || {}).nombre || cid || '—';
    const salidaNombre = getName(salidaId);
    const llegadaNombre = getName(llegadaId);
    let html = '';
    if (noches != null && noches >= 0) {
        html = '<p class="player-map-rutas-noches">🌙 <strong>Noches de viaje:</strong> ' + noches + (noches === 1 ? ' noche' : ' noches') + '</p>';
    } else {
        const duracion = (r.duracion || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = '<p class="player-map-rutas-noches">⏱️ <strong>Duración:</strong> ' + duracion + '</p>';
    }
    html += '<button type="button" class="btn btn-small player-empezar-viaje-btn" onclick="startViaje()">🚀 Empezar viaje</button>';
    resultEl.innerHTML = html;
    resultEl.className = 'player-map-rutas-result player-map-rutas-result-ok';
}

function clearCurrentRutaParaViaje() {
    currentRutaParaViaje = null;
}

function togglePlayerBitacoraPanel() {
    const wrap = document.getElementById('player-map-bitacora-wrap');
    const btn = document.getElementById('player-map-bitacora-toggle-btn');
    if (!wrap || !btn) return;
    const isOpen = wrap.style.display !== 'none';
    if (!isOpen) closeOtherPlayerMapPanels('bitacora');
    wrap.style.display = isOpen ? 'none' : 'block';
    btn.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    if (!isOpen && typeof loadBitacora === 'function') loadBitacora();
}

async function startViaje() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    if (!currentRutaParaViaje) {
        showToast('Consulta una ruta primero y pulsa Empezar viaje', true);
        return;
    }
    const { r, salidaId, llegadaId } = currentRutaParaViaje;
    const cities = (typeof playerCitiesData !== 'undefined' && Array.isArray(playerCitiesData)) ? playerCitiesData : [];
    const getName = (cid) => (cities.find(c => c.id === cid) || {}).nombre || cid || '—';
    const noches = r.noches != null && r.noches !== '' && !isNaN(Number(r.noches)) ? Math.max(1, Number(r.noches)) : 1;
    const data = {
        playerId: user.id,
        ciudadSalidaId: salidaId,
        ciudadLlegadaId: llegadaId,
        ciudadSalidaNombre: getName(salidaId),
        ciudadLlegadaNombre: getName(llegadaId),
        medioTransporte: (r.medioTransporte || '').trim(),
        noches,
        duracion: (r.duracion || '').trim() || null,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
        notasNoches: Array(noches).fill('')
    };
    try {
        await db.collection('bitacora_viajes').add(data);
        showToast('Viaje añadido a la bitácora');
        currentRutaParaViaje = null;
        if (typeof loadBitacora === 'function') loadBitacora();
        const bitacoraWrap = document.getElementById('player-map-bitacora-wrap');
        const bitacoraBtn = document.getElementById('player-map-bitacora-toggle-btn');
        if (bitacoraWrap) bitacoraWrap.style.display = 'block';
        if (bitacoraBtn) bitacoraBtn.classList.add('open');
        const rutasWrap = document.getElementById('player-map-rutas-wrap');
        const rutasBtn = document.getElementById('player-map-rutas-toggle-btn');
        if (rutasWrap) rutasWrap.style.display = 'none';
        if (rutasBtn) { rutasBtn.classList.remove('open'); rutasBtn.setAttribute('aria-expanded', 'false'); }
    } catch (e) {
        showToast('Error al crear viaje: ' + (e.message || e), true);
    }
}

async function deleteBitacoraViaje(viajeId) {
    if (!viajeId) return;
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    if (!confirm('¿Borrar esta entrada de la bitácora? No se puede deshacer.')) return;
    try {
        await db.collection('bitacora_viajes').doc(viajeId).delete();
        showToast('Entrada borrada');
        if (typeof loadBitacora === 'function') loadBitacora();
    } catch (e) {
        showToast('Error al borrar', true);
    }
}

function toggleBitacoraViajeNoches(viajeId) {
    const card = document.querySelector('.player-bitacora-viaje[data-viaje-id="' + viajeId + '"]');
    if (!card) return;
    const header = card.querySelector('.player-bitacora-header-toggle');
    const chevron = card.querySelector('.player-bitacora-viaje-chevron');
    const isCollapsed = card.classList.contains('player-bitacora-viaje-collapsed');
    card.classList.toggle('player-bitacora-viaje-collapsed', !isCollapsed);
    if (header) header.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
    if (chevron) chevron.textContent = isCollapsed ? '▼' : '▶';
}

function loadBitacora() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    const listEl = document.getElementById('player-bitacora-list');
    if (!listEl) return;
    listEl.innerHTML = '<p style="color:#8b7355; padding:16px;">Cargando bitácora...</p>';
    db.collection('bitacora_viajes').where('playerId', '==', user.id).limit(200).get().then(snap => {
        const viajes = (snap.docs || []).map(d => ({ id: d.id, ...d.data() }));
        viajes.sort((a, b) => {
            const ta = a.fecha && typeof a.fecha.toDate === 'function' ? a.fecha.toDate().getTime() : 0;
            const tb = b.fecha && typeof b.fecha.toDate === 'function' ? b.fecha.toDate().getTime() : 0;
            return tb - ta;
        });
        renderBitacora(viajes);
    }).catch(() => {
        listEl.innerHTML = '<p style="color:#8b7355; padding:16px;">Error al cargar la bitácora.</p>';
    });
}

function renderBitacora(viajes) {
    const listEl = document.getElementById('player-bitacora-list');
    if (!listEl) return;
    if (!viajes || viajes.length === 0) {
        listEl.innerHTML = '<p class="player-map-rutas-msg">Aún no tienes viajes. Consulta una ruta y pulsa "Empezar viaje".</p>';
        return;
    }
    listEl.innerHTML = viajes.map(v => {
        const headerRuta = (v.ciudadSalidaNombre || '—') + ' → ' + (v.ciudadLlegadaNombre || '—');
        const duracionStr = v.noches != null && v.noches > 0 ? (v.noches === 1 ? '1 noche' : v.noches + ' noches') : (v.duracion || '—');
        let fechaDisplay = '—';
        if (v.fecha) {
            if (typeof v.fecha.toDate === 'function') fechaDisplay = v.fecha.toDate().toLocaleDateString();
            else if (v.fecha instanceof Date) fechaDisplay = v.fecha.toLocaleDateString();
            else fechaDisplay = String(v.fecha);
        }
        const noches = Math.max(1, Number(v.noches) || 1);
        const notas = Array.isArray(v.notasNoches) ? v.notasNoches : Array(noches).fill('');
        while (notas.length < noches) notas.push('');
        const notasHtml = Array.from({ length: noches }, (_, i) => {
            const raw = (notas[i] || '').trim();
            const valEsc = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            return `<div class="player-bitacora-noche">
                <label class="player-bitacora-noche-label">Noche ${i + 1}</label>
                <div class="player-bitacora-note-row">
                    <div class="player-bitacora-note-preview" data-viaje-id="${v.id}" data-night="${i}">${valEsc || ''}</div>
                    <button type="button" class="btn btn-small" onclick="openBitacoraNoteModal('${v.id}', ${i})" title="Editar notas">📝</button>
                </div>
            </div>`;
        }).join('');
        return `<div class="player-bitacora-viaje player-bitacora-viaje-collapsed" data-viaje-id="${v.id}">
            <div class="player-bitacora-header player-bitacora-header-toggle" onclick="toggleBitacoraViajeNoches('${v.id}')" onkeydown="if(event.key==='Enter'){event.preventDefault();toggleBitacoraViajeNoches('${v.id}');}" role="button" tabindex="0" aria-expanded="false" title="Desplegar / plegar noches">
                <span class="player-bitacora-viaje-chevron" aria-hidden="true">▶</span>
                <span class="player-bitacora-ruta">${(headerRuta).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                <span class="player-bitacora-duracion">${(duracionStr).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                <span class="player-bitacora-fecha">${(fechaDisplay).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                <button type="button" class="btn btn-small player-bitacora-delete-btn" onclick="event.stopPropagation(); deleteBitacoraViaje('${v.id}');" title="Borrar esta entrada">🗑️</button>
            </div>
            <div class="player-bitacora-notas">${notasHtml}</div>
        </div>`;
    }).join('');
}

async function saveBitacoraNota(viajeId, nightIndex, text) {
    if (!viajeId || nightIndex < 0) return;
    try {
        const ref = db.collection('bitacora_viajes').doc(viajeId);
        const snap = await ref.get();
        if (!snap.exists) return;
        const data = snap.data();
        const notas = Array.isArray(data.notasNoches) ? data.notasNoches.slice() : [];
        const noches = Math.max(notas.length, nightIndex + 1);
        while (notas.length < noches) notas.push('');
        notas[nightIndex] = text;
        await ref.update({ notasNoches: notas });
    } catch (e) {
        showToast('Error al guardar nota', true);
        throw e;
    }
}

function openBitacoraNoteModal(viajeId, nightIndex) {
    const modal = document.getElementById('player-bitacora-note-modal');
    const titleEl = document.getElementById('player-bitacora-note-modal-title');
    const inputEl = document.getElementById('player-bitacora-note-modal-input');
    if (!modal || !titleEl || !inputEl) return;
    const preview = document.querySelector('.player-bitacora-note-preview[data-viaje-id="' + viajeId + '"][data-night="' + nightIndex + '"]');
    const currentText = preview ? (preview.textContent || '').trim() : '';
    modal.dataset.viajeId = viajeId;
    modal.dataset.night = String(nightIndex);
    titleEl.textContent = '📝 Noche ' + (Number(nightIndex) + 1);
    inputEl.value = currentText;
    openModal('player-bitacora-note-modal');
}

async function saveBitacoraNoteFromModal() {
    const modal = document.getElementById('player-bitacora-note-modal');
    const viajeId = modal && modal.dataset.viajeId;
    const nightStr = modal && modal.dataset.night;
    const inputEl = document.getElementById('player-bitacora-note-modal-input');
    if (!viajeId || nightStr === undefined) return;
    const nightIndex = parseInt(nightStr, 10);
    if (isNaN(nightIndex) || nightIndex < 0) return;
    const text = inputEl ? (inputEl.value || '').trim() : '';
    try {
        await saveBitacoraNota(viajeId, nightIndex, text);
        showToast('Notas guardadas');
        closeModal('player-bitacora-note-modal');
        const preview = document.querySelector('.player-bitacora-note-preview[data-viaje-id="' + viajeId + '"][data-night="' + nightIndex + '"]');
        if (preview) preview.textContent = text;
    } catch (e) {
        // saveBitacoraNota ya muestra toast de error
    }
}

function loadPlayerCityNotesPreviews() {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const visibleCities = playerCitiesData.filter(c => c.visibleToPlayers !== false);
    if (!visibleCities.length) return;
    Promise.all(visibleCities.map(city =>
        db.collection('cities').doc(city.id).collection('playerNotes').doc(user.id).get()
            .then(snap => {
                const data = snap.exists ? snap.data() : null;
                const text = (data && (data.notes !== undefined || data.notas !== undefined))
                    ? String(data.notes ?? data.notas ?? '').trim()
                    : '';
                return { cityId: city.id, text };
            })
            .catch(() => ({ cityId: city.id, text: '' }))
    )).then(results => {
        results.forEach(({ cityId, text }) => {
            const el = document.querySelector('.player-city-note-preview[data-city-id="' + cityId + '"]');
            if (el) el.textContent = text ? text : '';
        });
    });
}

function openCityNotesModalFromDirectorio() {
    if (playerDirectorioCityId && playerDirectorioCityNombre) {
        openCityNotesModal(playerDirectorioCityId, playerDirectorioCityNombre);
    }
}

function openCityNotesModal(cityId, cityName) {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const modal = document.getElementById('player-city-notes-modal');
    const titleEl = document.getElementById('player-city-notes-modal-title');
    const inputEl = document.getElementById('player-city-notes-modal-input');
    if (!modal || !titleEl || !inputEl) return;
    modal.dataset.cityId = cityId;
    titleEl.textContent = '📝 Mis notas — ' + (cityName || 'Ciudad');
    inputEl.value = '';
    db.collection('cities').doc(cityId).collection('playerNotes').doc(user.id).get()
        .then(snap => {
            const data = snap.exists ? snap.data() : null;
            const text = (data && (data.notes !== undefined || data.notas !== undefined))
                ? String(data.notes ?? data.notas ?? '')
                : '';
            inputEl.value = text;
        })
        .catch(() => {})
        .finally(() => openModal('player-city-notes-modal'));
}

function saveCityNotesFromModal() {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const modal = document.getElementById('player-city-notes-modal');
    const cityId = modal && modal.dataset.cityId;
    const inputEl = document.getElementById('player-city-notes-modal-input');
    if (!cityId || !inputEl) return;
    const notes = inputEl.value.trim();
    db.collection('cities').doc(cityId).collection('playerNotes').doc(user.id).set({
        notes: notes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
        .then(() => {
            showToast('Notas guardadas');
            closeModal('player-city-notes-modal');
            if (playerDirectorioCityId === cityId) {
                const preview = document.getElementById('player-directorio-note-preview');
                if (preview) preview.textContent = notes;
            }
        })
        .catch(err => {
            console.error('Error guardando notas:', err);
            showToast('Error al guardar notas', true);
        });
}

let playerDirectorioCityId = null, playerDirectorioCityNombre = null;

function openPlayerCityShops(cityId, cityNombre) {
    if (cityId !== playerDirectorioCityId && typeof refreshPlayerWorld === 'function') refreshPlayerWorld();
    const shops = playerShopsData.filter(s => s.ciudadId === cityId);
    const city = playerCitiesData.find(c => c.id === cityId);
    const recomendadoId = city && city.establecimientoRecomendadoId;
    playerDirectorioCityId = cityId;
    playerDirectorioCityNombre = cityNombre || 'esta ciudad';
    document.getElementById('player-cities-list-wrap').style.display = 'none';
    document.getElementById('player-directorio-wrap').style.display = 'block';
    document.getElementById('player-directorio-city-name').textContent = (cityNombre || 'Ciudad').toUpperCase();
    
    var container = document.getElementById('player-view-container');
    if (container) container.classList.add('player-in-city-view');
    
    switchDirectorioTab('comercios');
    
    var historiaImage = document.getElementById('player-directorio-historia-image');
    var historiaLore = document.getElementById('player-directorio-historia-lore');
    if (historiaImage) {
        if (city && city.imagenUrl) {
            historiaImage.innerHTML = '<div style="width:100%; border-radius:8px; background:#2a231c; display:flex; align-items:center; justify-content:center; padding:10px;"><img src="' + (city.imagenUrl.replace(/"/g, '&quot;')) + '" alt="' + (cityNombre || '').replace(/"/g, '&quot;') + '" style="width:100%; height:auto; max-width:100%; border-radius:8px;" onerror="this.style.display=\'none\'; this.parentElement.innerHTML=\'\';"></div>';
        } else {
            historiaImage.innerHTML = '';
        }
    }
    if (historiaLore) {
        var loreText = (city && city.lore) ? String(city.lore).trim() : '';
        historiaLore.textContent = loreText || 'El DM aún no ha añadido la historia de esta ciudad.';
        if (!loreText) historiaLore.style.color = '#8b7355';
        else historiaLore.style.color = '#a89878';
    }

    const notesPreview = document.getElementById('player-directorio-note-preview');
    const isPlayer = currentUser && (currentUser.type === 'player' || currentUser.tipo === 'player');
    if (notesPreview && isPlayer && currentUser && currentUser.id) {
        notesPreview.textContent = '';
        db.collection('cities').doc(cityId).collection('playerNotes').doc(currentUser.id).get()
            .then(snap => {
                const data = snap.exists ? snap.data() : null;
                const text = (data && (data.notes !== undefined || data.notas !== undefined))
                    ? String(data.notes ?? data.notas ?? '').trim()
                    : '';
                const el = document.getElementById('player-directorio-note-preview');
                if (el) el.textContent = text;
            })
            .catch(() => {});
    }

    const tipoEmoji = { herreria: '⚔️', pociones: '🧪', taberna: '🍺', biblioteca: '📚', arqueria: '🏹', emporio: '🛒', batalla: '🥊', arena: '🥊', santuario: '🪞', banco: '🏦', posada: '🏨', prision: '🔒', prisión: '🔒', 'encontrado banco': '📋' };
    const tipoClass = { herreria: 'herreria', pociones: 'pociones', taberna: 'taberna', biblioteca: 'biblioteca', arqueria: 'arqueria', emporio: 'emporio', batalla: 'batalla', arena: 'batalla', santuario: 'santuario', banco: 'banco', posada: 'posada', prision: 'prision', prisión: 'prision', 'encontrado banco': 'encontrado' };

    const orderedShops = recomendadoId && shops.some(s => s.id === recomendadoId)
        ? [shops.find(s => s.id === recomendadoId), ...shops.filter(s => s.id !== recomendadoId)].filter(Boolean)
        : shops;

    const shopsGrid = document.getElementById('player-directorio-shops-grid');
    
    // Tarjeta "Mi Casa" para el aventurero
    const miCasaCard = currentUser && currentUser.type === 'player' ? `
        <div class="player-mistfall-shop-card player-mistfall-shop-habitantes" style="border:2px solid rgba(139,90,43,0.6);" onclick="openMiCasaModal()" role="button" tabindex="0">
            <span class="player-mistfall-shop-icon">🏠</span>
            <div class="player-mistfall-shop-info">
                <h3 class="player-mistfall-shop-name">Hogar</h3>
                <p class="player-mistfall-shop-desc">Tu fortaleza personal</p>
                <p class="player-mistfall-shop-enter">— Entrar a Hogar →</p>
            </div>
        </div>` : '';
    
    const shopCards = miCasaCard + orderedShops.map(s => {
        const t = (s.tipo || '').toLowerCase();
        const isRecomendado = s.id === recomendadoId;
        const cls = 'player-mistfall-shop-card player-mistfall-shop-' + (tipoClass[t] || '') + (isRecomendado ? ' player-mistfall-shop-recomendado' : '');
        const placa = isRecomendado ? '<div class="player-mistfall-recomendado-placa">Establecimiento recomendado</div>' : '';
        const safeId = (s.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <div class="${cls}" onclick="openPlayerShop('${safeId}')" role="button" tabindex="0">
            ${placa}
            <span class="player-mistfall-shop-icon">${tipoEmoji[t] || tipoEmoji[s.tipo] || '🏪'}</span>
            <div class="player-mistfall-shop-info">
                <h3 class="player-mistfall-shop-name">${s.nombre || 'Tienda'}</h3>
                <p class="player-mistfall-shop-desc">${s.tipo ? (s.tipo.charAt(0).toUpperCase() + s.tipo.slice(1)) : 'Establecimiento'}</p>
                <p class="player-mistfall-shop-enter">— Entrar al establecimiento →</p>
            </div>
        </div>`;
    }).join('');

    shopsGrid.innerHTML = shopCards;
}

function switchDirectorioTab(tabId) {
    document.querySelectorAll('.player-directorio-tab').forEach(function (btn) {
        if (btn.classList.contains('player-directorio-volver-btn')) return;
        var dataTab = btn.getAttribute('data-tab');
        btn.classList.toggle('active', dataTab === tabId);
        btn.classList.toggle('btn-secondary', dataTab !== tabId);
    });
    document.querySelectorAll('.player-directorio-panel').forEach(function (panel) {
        var id = panel.id;
        var panelTab = id.replace('player-directorio-panel-', '');
        panel.style.display = panelTab === tabId ? 'block' : 'none';
    });
    if (tabId === 'habitantes') {
        renderPlayerDirectorioHabitantes(playerDirectorioCityId, playerDirectorioCityNombre);
    }
}

function playerDirectorioVolver() {
    var container = document.getElementById('player-view-container');
    if (container) container.classList.remove('player-in-city-view');
    document.getElementById('player-directorio-wrap').style.display = 'none';
    document.getElementById('player-cities-list-wrap').style.display = 'block';
}

/** En móvil: mostrar/ocultar la barra de tabs del directorio (Comercios, Historia, Mis notas, Habitantes). Solo afecta en pantallas pequeñas. */
function toggleDirectorioTabsMobile() {
    var bar = document.getElementById('player-directorio-top-bar');
    var btn = document.getElementById('player-directorio-tabs-toggle');
    if (!bar || !btn) return;
    var collapsed = bar.classList.toggle('directorio-tabs-collapsed');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

// Colores para las cards de NPCs (estilo medieval/fantástico oscuro)
const NPC_CARD_COLORS = [
    { bg: 'linear-gradient(135deg, rgba(42,35,28,0.95), rgba(30,25,20,0.98))', border: '#4a3c31' },
    { bg: 'linear-gradient(135deg, rgba(52,42,32,0.95), rgba(40,32,24,0.98))', border: '#5a4a3a' },
    { bg: 'linear-gradient(135deg, rgba(45,38,30,0.95), rgba(35,28,22,0.98))', border: '#4a3c31' },
    { bg: 'linear-gradient(135deg, rgba(38,32,26,0.95), rgba(28,24,18,0.98))', border: '#3a2e24' },
    { bg: 'linear-gradient(135deg, rgba(50,40,30,0.95), rgba(38,30,22,0.98))', border: '#5a4634' },
    { bg: 'linear-gradient(135deg, rgba(42,36,28,0.95), rgba(32,28,20,0.98))', border: '#4a3e30' },
    { bg: 'linear-gradient(135deg, rgba(46,38,30,0.95), rgba(36,30,22,0.98))', border: '#4a3c2e' },
    { bg: 'linear-gradient(135deg, rgba(40,34,28,0.95), rgba(30,26,20,0.98))', border: '#3a3028' }
];

function getNpcCardColor(index) {
    return NPC_CARD_COLORS[index % NPC_CARD_COLORS.length];
}

async function openPlayerHabitantesModal(cityId, cityNombre) {
    const user = getCurrentUser();
    if (!user || !user.id) return;
    
    const npcs = playerNpcsData.filter(n => n.ciudadId === cityId);
    document.getElementById('player-habitantes-modal-title').textContent = '🎭 Habitantes' + (cityNombre ? ' — ' + cityNombre : '');
    const list = document.getElementById('player-habitantes-modal-list');
    
    // Cargar notas del jugador
    let playerNpcNotes = {};
    try {
        const playerDoc = await getCurrentPlayerDoc();
        if (playerDoc.exists) {
            playerNpcNotes = playerDoc.data().npcNotes || {};
        }
    } catch (e) {
        console.error('Error cargando notas:', e);
    }
    
    if (!npcs.length) {
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:40px;">No hay habitantes registrados en esta ciudad.</p>';
    } else {
        const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        list.innerHTML = npcs.map((n, idx) => {
            const color = getNpcCardColor(idx);
            const notes = (playerNpcNotes[n.id] || '').trim();
            const npcId = esc(n.id);
            const npcNombre = (n.nombre || 'NPC').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
            <div class="player-mistfall-npc-card-colored" style="background: ${color.bg}; border-color: ${color.border};">
                <div class="player-mistfall-npc-info">
                    <h3 class="player-mistfall-npc-name">${esc(n.nombre || 'NPC')}</h3>
                    <p class="player-mistfall-npc-rol">${esc(n.rol || '')}</p>
                    <div class="player-mistfall-npc-notes-section" style="margin-top: 12px;">
                        <label style="color: #a89878; font-size: 0.85em; display: block; margin-bottom: 6px;">Mis notas:</label>
                        <div class="player-npc-note-preview" data-npc-id="${npcId}" style="color:#a89878; font-size:0.9em; min-height:1.5em; white-space:pre-wrap; word-break:break-word; margin-bottom:8px;">${esc(notes)}</div>
                        <button type="button" class="btn btn-small" onclick="openNpcNotesModal('${npcId}', '${npcNombre}')" title="Editar notas">📝</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    openModal('player-habitantes-modal');
}

function openNpcNotesModal(npcId, npcName) {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const modal = document.getElementById('player-npc-notes-modal');
    const titleEl = document.getElementById('player-npc-notes-modal-title');
    const inputEl = document.getElementById('player-npc-notes-modal-input');
    if (!modal || !titleEl || !inputEl) return;
    modal.dataset.npcId = npcId;
    titleEl.textContent = '📝 Mis notas — ' + (npcName || 'Personaje');
    inputEl.value = '';
    getCurrentPlayerDoc()
        .then(doc => {
            const data = doc.exists ? doc.data() : {};
            const npcNotes = data.npcNotes || {};
            const text = (npcNotes[npcId] || '').trim();
            inputEl.value = text;
        })
        .catch(() => {})
        .finally(() => openModal('player-npc-notes-modal'));
}

function saveNpcNotesFromModal() {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const modal = document.getElementById('player-npc-notes-modal');
    const npcId = modal && modal.dataset.npcId;
    const inputEl = document.getElementById('player-npc-notes-modal-input');
    if (!npcId || !inputEl) return;
    const notes = inputEl.value.trim();
    getCurrentPlayerDoc()
        .then(doc => {
            const currentData = doc.exists ? doc.data() : {};
            const npcNotes = currentData.npcNotes || {};
            npcNotes[npcId] = notes;
            return db.collection('players').doc(user.id).update({ npcNotes });
        })
        .then(() => {
            showToast('Notas guardadas');
            closeModal('player-npc-notes-modal');
            document.querySelectorAll('.player-npc-note-preview[data-npc-id="' + npcId + '"]').forEach(el => { el.textContent = notes; });
        })
        .catch(e => {
            console.error('Error guardando nota:', e);
            showToast('Error al guardar nota', true);
        });
}

async function savePlayerNpcNote(npcId, notes) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    
    try {
        const playerRef = db.collection('players').doc(user.id);
        const playerDoc = await getCurrentPlayerDoc();
        const currentData = playerDoc.exists ? playerDoc.data() : {};
        const npcNotes = currentData.npcNotes || {};
        npcNotes[npcId] = notes.trim();
        
        await playerRef.update({ npcNotes });
        showToast('Nota guardada');
    } catch (e) {
        console.error('Error guardando nota:', e);
        showToast('Error al guardar nota', true);
    }
}

async function renderPlayerDirectorioHabitantes(cityId, cityNombre) {
    const user = getCurrentUser();
    if (!user || !user.id) return;
    
    const npcs = playerNpcsData.filter(n => n.ciudadId === cityId);
    const grid = document.getElementById('player-directorio-habitantes-npcs-grid');
    
    // Cargar notas del jugador
    let playerNpcNotes = {};
    try {
        const playerDoc = await getCurrentPlayerDoc();
        if (playerDoc.exists) {
            playerNpcNotes = playerDoc.data().npcNotes || {};
        }
    } catch (e) {
        console.error('Error cargando notas:', e);
    }
    
    if (!npcs.length) {
        grid.innerHTML = '<p style="color:#8b7355; text-align:center; padding:40px; grid-column: 1 / -1;">No hay habitantes registrados en esta ciudad.</p>';
    } else {
        const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        grid.innerHTML = npcs.map((n, idx) => {
            const color = getNpcCardColor(idx);
            const notes = (playerNpcNotes[n.id] || '').trim();
            const npcId = esc(n.id);
            const npcNombre = (n.nombre || 'NPC').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
            <div class="player-mistfall-npc-card-colored" style="background: ${color.bg}; border-color: ${color.border};">
                <div class="player-mistfall-npc-info">
                    <h3 class="player-mistfall-npc-name">${esc(n.nombre || 'NPC')}</h3>
                    <p class="player-mistfall-npc-rol">${esc(n.rol || '')}</p>
                    <div class="player-mistfall-npc-notes-section">
                        <label style="color: #a89878; font-size: 0.85em; display: block; margin-bottom: 6px;">Mis notas:</label>
                        <div class="player-npc-note-preview" data-npc-id="${npcId}" style="color:#a89878; font-size:0.9em; min-height:1.5em; white-space:pre-wrap; word-break:break-word; margin-bottom:8px;">${esc(notes)}</div>
                        <button type="button" class="btn btn-small" onclick="openNpcNotesModal('${npcId}', '${npcNombre}')" title="Editar notas">📝</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

function playerDirectorioHabitantesVolver() {
    switchDirectorioTab('comercios');
}

// ==================== SANTUARIO (todos son iguales; no se suben items) ====================
const SANCTUARY_STORAGE_KEY = 'shrineAttemptUsed';
const SANCTUARY_DEITIES = {
    tyr: { name: 'Tyr', reflections: ['La justicia no conoce piedad. ¿Estás dispuesto a pagar el precio?', 'El equilibrio exige sacrificio. ¿Qué ofreces a cambio de la verdad?', 'La ley es inmutable. Tu ofrenda será juzgada.', 'Solo los justos encuentran favor. El espejo ve tu alma.'], failures: ['Juicio pendiente: sientes el peso de una falta que no cometiste.', 'Balanza rota: tu próxima decisión moral será más difícil.', 'Cicatriz del justo: una marca de cadenas aparece en tu muñeca.', 'Veredicto sellado: alguien te juzgará injustamente pronto.', 'Ley olvidada: olvidas una regla importante en el peor momento.'] },
    tymora: { name: 'Tymora', reflections: ['¡La fortuna sonríe a los audaces! ¿O no?', 'Tira los dados, querido. El caos es la mejor diversión.', 'La suerte es una amante caprichosa. ¿Te atreves a cortejarla?', '¡Aventura! ¡Riesgo! ¡Gloria! ...o un desastre espectacular.'], failures: ['Mala racha: tu próximo 1 natural será un fracaso espectacular.', 'Moneda trucada: la próxima vez que apuestes, pierdes.', 'Tropiezo cómico: caes en el momento menos oportuno.', 'Suerte invertida: algo bueno se convierte en algo incómodo.', 'Caos menor: un objeto tuyo desaparece y aparece en otro lugar.'] },
    oghma: { name: 'Oghma', reflections: ['El conocimiento tiene un precio. ¿Qué secreto buscas?', 'En el reflejo yace la verdad... o su sombra.', 'Las respuestas existen. La pregunta es: ¿estás listo para ellas?', 'Todo lo escrito perdura. ¿Qué escribirás hoy?'], failures: ['Página en blanco: olvidas un dato importante temporalmente.', 'Tinta corrida: un mensaje que envíes será malinterpretado.', 'Secreto revelado: algo que ocultabas sale a la luz.', 'Conocimiento prohibido: aprendes algo que preferirías no saber.', 'Lengua trabada: no puedes explicar algo que sabes bien.'] },
    kelemvor: { name: 'Kelemvor', reflections: ['La muerte llega para todos. Hoy... quizás no.', 'El juicio final es inevitable. Esta moneda solo lo retrasa.', 'Ni clemencia ni crueldad. Solo el fin, cuando corresponda.', 'El umbral entre la vida y la muerte es delgado. Camínalo con cuidado.'], failures: ['Sombra del más allá: un espíritu te observa con interés.', 'Frío mortal: sientes un escalofrío que no se va por una hora.', 'Visión fúnebre: ves brevemente a alguien cercano como cadáver.', 'Deuda con la muerte: la próxima vez que caigas a 0 HP, fallas una tirada de muerte automáticamente.', 'Eco del vacío: escuchas el silencio absoluto por un instante aterrador.'] }
};
const SANCTUARY_FAIL_EFFECTS = ['Marca: un símbolo aparece en tu piel (narrativo).', 'Vela apagada: -1 a tu próxima interacción social.', 'Eco: escuchás tu voz diciendo algo que no dijiste.', 'Moneda doblada: perdés 1 oro extra.', 'Pista torcida: una frase suena cierta, pero puede ser falsa.', 'Silencio inquietante: no pasa nada… y eso es peor.', 'Sombra errante: tu sombra se mueve sola por un instante.', 'Escalofrío: sentís una mano helada en el hombro, pero no hay nadie.', 'Reflejo tardío: el espejo muestra tu imagen con un segundo de retraso.', 'Olor a ceniza: un aroma a quemado te persigue por una hora.'];
let playerSanctuaryShopId = null;

function getSanctuaryChance(gp) { if (gp >= 75) return 75; if (gp >= 50) return 50; return 30; }
function pickArr(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function openPlayerSanctuaryModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerSanctuaryShopId = shopId;
    document.getElementById('player-santuario-title').textContent = '🪞 ' + (shop.nombre || 'Santuario');
    document.getElementById('player-santuario-mirror-text').textContent = 'El espejo aguarda tu ofrenda...';
    document.getElementById('player-santuario-mirror-text').classList.remove('active');
    document.getElementById('player-santuario-results').style.display = 'none';
    document.getElementById('player-santuario-results').style.flexDirection = 'column';
    document.getElementById('player-santuario-dice').className = 'player-santuario-dice';
    document.getElementById('player-santuario-dice-face').textContent = '?';
    const locked = localStorage.getItem(SANCTUARY_STORAGE_KEY) === 'true';
    document.getElementById('player-santuario-offer-btn').disabled = locked;
    document.getElementById('player-santuario-locked').style.display = locked ? 'block' : 'none';
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            document.getElementById('player-santuario-oro-display').textContent = oro.toLocaleString();
        });
    }
    const offerBtn = document.getElementById('player-santuario-offer-btn');
    offerBtn.onclick = performPlayerSanctuaryOffering;
    document.getElementById('player-santuario-reset-btn').onclick = resetPlayerSanctuarySession;
    openModal('player-santuario-modal');
}

function resetPlayerSanctuarySession() {
    localStorage.removeItem(SANCTUARY_STORAGE_KEY);
    document.getElementById('player-santuario-offer-btn').disabled = false;
    document.getElementById('player-santuario-locked').style.display = 'none';
    document.getElementById('player-santuario-results').style.display = 'none';
    document.getElementById('player-santuario-mirror-text').textContent = 'El espejo aguarda tu ofrenda...';
    document.getElementById('player-santuario-mirror-text').classList.remove('active');
    document.getElementById('player-santuario-dice').className = 'player-santuario-dice';
    document.getElementById('player-santuario-dice-face').textContent = '?';
    showToast('Sesión de santuario reiniciada. Puedes ofrecer de nuevo.');
}

async function performPlayerSanctuaryOffering() {
    if (localStorage.getItem(SANCTUARY_STORAGE_KEY) === 'true') return;
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const gp = parseInt(document.getElementById('player-santuario-donation').value, 10);
    const deityKey = document.getElementById('player-santuario-deity').value;
    const deityData = SANCTUARY_DEITIES[deityKey];
    if (!deityData) return;
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < gp) { showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true); return; }
    const chance = getSanctuaryChance(gp);
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    document.getElementById('player-santuario-offer-btn').disabled = true;
    const diceEl = document.getElementById('player-santuario-dice');
    const diceFace = document.getElementById('player-santuario-dice-face');
    diceEl.classList.add('rolling');
    diceFace.textContent = '?';
    const DICE_FACES = ['😰', '😟', '😐', '🙂', '😊', '😁'];
    let count = 0;
    const rollInterval = setInterval(() => { diceFace.textContent = pickArr(DICE_FACES); count++; }, 80);
    setTimeout(async () => {
        clearInterval(rollInterval);
        localStorage.setItem(SANCTUARY_STORAGE_KEY, 'true');
        diceFace.textContent = success ? '😊' : '😢';
        diceEl.classList.remove('rolling');
        diceEl.classList.add(success ? 'success' : 'fail');
        document.getElementById('player-santuario-mirror-text').textContent = pickArr(deityData.reflections);
        document.getElementById('player-santuario-mirror-text').classList.add('active');
        document.getElementById('player-santuario-res-donation').textContent = gp + ' GP';
        document.getElementById('player-santuario-res-roll').textContent = roll;
        const outcomeEl = document.getElementById('player-santuario-outcome');
        const effectEl = document.getElementById('player-santuario-effect');
        if (success) {
            outcomeEl.textContent = '✦ Moneda obtenida ✦';
            outcomeEl.style.background = 'rgba(74, 156, 93, 0.2)';
            outcomeEl.style.border = '1px solid #4a9c5d';
            outcomeEl.style.color = '#4a9c5d';
            effectEl.textContent = 'Obtienes una moneda de Héroe. Puedes usarla para repetir una tirada o estabilizarte si estás a 0 HP.';
        } else {
            outcomeEl.textContent = '✧ Fallo del espejo ✧';
            outcomeEl.style.background = 'rgba(156, 74, 74, 0.2)';
            outcomeEl.style.border = '1px solid #9c4a4a';
            outcomeEl.style.color = '#9c4a4a';
            effectEl.textContent = pickArr(deityData.failures);
        }
        document.getElementById('player-santuario-results').style.display = 'flex';
        document.getElementById('player-santuario-locked').style.display = 'block';
        const newOro = oro - gp;
        const inventario = Array.isArray(data.inventario) ? data.inventario.slice() : [];
        if (success) inventario.push({ name: 'Moneda de Héroe', effect: 'Puedes usarla para repetir una tirada o estabilizarte si estás a 0 HP.', rarity: 'legendaria', shopTipo: 'santuario' });
        await db.collection('players').doc(user.id).update({ oro: newOro, inventario });
        
        // Guardar transacción
        const shop = playerShopsData.find(s => s.id === playerSanctuaryShopId);
        const shopName = shop ? (shop.nombre || 'Santuario') : 'Santuario';
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: success ? 'Donación al Santuario (Moneda de Héroe obtenida)' : 'Donación al Santuario',
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shopName,
            precio: gp,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
        
        document.getElementById('player-santuario-oro-display').textContent = newOro.toLocaleString();
        showToast(success ? '✦ Moneda de Héroe obtenida' : 'Donación ofrecida. ' + (success ? '' : 'Fallo del espejo.'));
    }, 1500);
}

const BANCO_RETIRO_COMISION_PORCENTAJE = 2;

function openPlayerBancoModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerBancoShopId = shopId;
    document.getElementById('player-banco-title').textContent = '🏦 Banco';
    document.getElementById('player-banco-amount').value = '';
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const oro = (data.oro != null ? data.oro : 0);
            // Balance global del banco (mismo en todas las ciudades)
            const bal = (data.bancoBalance != null ? data.bancoBalance : 0);
            document.getElementById('player-banco-oro').textContent = oro.toLocaleString() + ' GP';
            document.getElementById('player-banco-balance').textContent = bal.toLocaleString() + ' GP';
        });
    }
    openModal('player-banco-modal');
}

async function doPlayerBancoDeposit() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const shopId = playerBancoShopId;
    if (!shopId) return;
    const amount = parseInt(document.getElementById('player-banco-amount').value, 10);
    if (!amount || amount < 1) { showToast('Indica una cantidad válida (≥ 1 GP)', true); return; }
    const docRef = db.collection('players').doc(user.id);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < amount) { showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true); return; }
    // Balance global del banco (mismo en todas las ciudades)
    const bal = (data.bancoBalance != null ? data.bancoBalance : 0);
    const newOro = oro - amount;
    const newBal = bal + amount;
    await docRef.update({ oro: newOro, bancoBalance: newBal });
    await db.collection('transactions').add({
        tipo: 'deposito',
        itemName: 'Depósito en banco',
        playerId: user.id,
        playerName: user.nombre || 'Jugador',
        shopName: 'Banco',
        precio: amount,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('player-banco-oro').textContent = newOro.toLocaleString() + ' GP';
    document.getElementById('player-banco-balance').textContent = newBal.toLocaleString() + ' GP';
    document.getElementById('player-banco-amount').value = '';
    showToast('Depositados ' + amount.toLocaleString() + ' GP en el banco');
    if (lastPlayerViewData) {
        lastPlayerViewData.oro = newOro;
        lastPlayerViewData.bancoBalance = newBal;
        renderPlayerView(lastPlayerViewData);
    }
}

async function doPlayerBancoWithdraw() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const shopId = playerBancoShopId;
    if (!shopId) return;
    const amount = parseInt(document.getElementById('player-banco-amount').value, 10);
    if (!amount || amount < 1) { showToast('Indica una cantidad válida (≥ 1 GP)', true); return; }
    const fee = Math.ceil(amount * (BANCO_RETIRO_COMISION_PORCENTAJE / 100));
    const totalDeducir = amount + fee;
    const docRef = db.collection('players').doc(user.id);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    // Balance global del banco (mismo en todas las ciudades)
    const bal = (data.bancoBalance != null ? data.bancoBalance : 0);
    if (bal < totalDeducir) {
        showToast('Saldo insuficiente. Necesitas ' + totalDeducir.toLocaleString() + ' GP (incl. ' + fee + ' GP de comisión 2%). Tienes ' + bal.toLocaleString() + ' GP.', true);
        return;
    }
    const oro = (data.oro != null ? data.oro : 0);
    const newOro = oro + amount;
    const newBal = bal - totalDeducir;
    await docRef.update({ oro: newOro, bancoBalance: newBal });
    await db.collection('transactions').add({
        tipo: 'retiro',
        itemName: 'Retiro de banco',
        playerId: user.id,
        playerName: user.nombre || 'Jugador',
        shopName: 'Banco',
        precio: amount,
        comision: fee,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('player-banco-oro').textContent = newOro.toLocaleString() + ' GP';
    document.getElementById('player-banco-balance').textContent = newBal.toLocaleString() + ' GP';
    document.getElementById('player-banco-amount').value = '';
    showToast('Retirados ' + amount.toLocaleString() + ' GP (comisión ' + fee + ' GP).');
    if (lastPlayerViewData) {
        lastPlayerViewData.oro = newOro;
        lastPlayerViewData.bancoBalance = newBal;
        renderPlayerView(lastPlayerViewData);
    }
}

function openPlayerPosadaModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerPosadaShopId = shopId;
    playerPosadaCart = []; // Limpiar carrito al abrir
    playerPosadaSearchTerm = '';
    document.getElementById('player-posada-title').textContent = '🏨 ' + (shop.nombre || 'Posada');
    const bodyEl = document.getElementById('player-posada-body');
    const recEl = document.getElementById('player-posada-receipt');
    const listEl = document.getElementById('player-posada-cuartos-list');
    if (!bodyEl || !recEl || !listEl) return;
    bodyEl.style.display = 'block';
    recEl.style.display = 'none';
    recEl.innerHTML = '';
    const posadaSearchEl = document.getElementById('player-posada-search');
    if (posadaSearchEl) posadaSearchEl.value = '';
    updatePosadaCart(); // Inicializar carrito
    renderPlayerPosadaCuartos();
    const user = getCurrentUser();
    const renderOro = (oro) => {
        const el = document.getElementById('player-posada-oro');
        if (el) el.innerHTML = '<strong>' + (oro != null ? oro : 0).toLocaleString() + '</strong> GP';
    };
    if (posadaSearchEl && !window._playerPosadaSearchListener) {
        window._playerPosadaSearchListener = true;
        posadaSearchEl.addEventListener('input', debounce(function () { playerPosadaSearchTerm = (posadaSearchEl.value || '').toLowerCase().trim(); renderPlayerPosadaCuartos(); }, 250));
    }
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            renderOro(oro);
        });
    } else {
        renderOro(0);
    }
    openModal('player-posada-modal');
}

function renderPlayerPosadaCuartos() {
    const shop = playerShopsData.find(s => s.id === playerPosadaShopId);
    if (!shop) return;
    const listEl = document.getElementById('player-posada-cuartos-list');
    if (!listEl) return;
    const cuartos = (shop.posadaCuartos && shop.posadaCuartos.length > 0) ? shop.posadaCuartos : POSADA_CUARTOS;
    const q = playerPosadaSearchTerm;
    const filtered = q ? cuartos.filter(c => (c.nombre || '').toLowerCase().includes(q) || (c.efecto || '').toLowerCase().includes(q)) : cuartos;
    listEl.innerHTML = filtered.map((c, idx) => `
        <div class="player-posada-cuarto" data-room-id="${c.id || idx}" style="background:rgba(0,0,0,0.25); border:1px solid #4a3c31; border-radius:10px; padding:16px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div style="flex:1; min-width:180px;">
                    <h4 style="color:#d4af37; font-family:'Cinzel',serif; margin-bottom:6px;">${c.nombre}</h4>
                    <p style="color:#8b7355; font-size:0.9em; line-height:1.4;">${c.efecto}</p>
                </div>
                <div style="flex-shrink:0; text-align:right;">
                    <div class="gold-value" style="margin-bottom:8px;">${c.precio} GP / noche</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <label style="color:#8b7355; font-size:0.85em;">Noches:</label>
                        <input type="number" id="posada-nights-${c.id || idx}" min="1" value="1" style="width:60px; background:#1a1a1a; border:1px solid #4a3c31; color:#d4c4a8; padding:4px 8px; border-radius:4px; text-align:center;">
                    </div>
                    <button type="button" class="btn btn-small" onclick="addToPosadaCart('${c.id || idx}', '${(c.nombre || '').replace(/'/g, "\\'")}', ${c.precio}, '${(c.efecto || '').replace(/'/g, "\\'")}')">+ Añadir</button>
                </div>
            </div>
        </div>
    `).join('');
}

window.addToPosadaCart = function(roomId, roomNombre, roomPrecio, roomEfecto) {
    const nightsInput = document.getElementById(`posada-nights-${roomId}`);
    const nights = parseInt(nightsInput ? nightsInput.value : 1) || 1;
    
    if (nights < 1) {
        showToast('Debes seleccionar al menos 1 noche', true);
        return;
    }
    
    // Buscar si ya existe en el carrito
    const existingIndex = playerPosadaCart.findIndex(item => item.roomId === roomId);
    
    if (existingIndex >= 0) {
        // Actualizar cantidad
        playerPosadaCart[existingIndex].nights = nights;
    } else {
        // Agregar nuevo item (sin toast: en posada no tiene sentido)
        playerPosadaCart.push({
            roomId: roomId,
            nombre: roomNombre,
            precio: roomPrecio,
            efecto: roomEfecto || '',
            nights: nights
        });
    }
    
    updatePosadaCart();
}

window.removeFromPosadaCart = function(roomId) {
    playerPosadaCart = playerPosadaCart.filter(item => item.roomId !== roomId);
    updatePosadaCart();
    showToast('Eliminado del carrito');
}

window.clearPosadaCart = function() {
    playerPosadaCart = [];
    updatePosadaCart();
    showToast('Carrito vaciado');
}

function updatePosadaCart() {
    const cartEl = document.getElementById('player-posada-cart');
    const cartItemsEl = document.getElementById('player-posada-cart-items');
    const subtotalEl = document.getElementById('player-posada-cart-subtotal');
    const discountEl = document.getElementById('player-posada-cart-discount');
    const discountAmountEl = document.getElementById('player-posada-cart-discount-amount');
    const totalEl = document.getElementById('player-posada-cart-total');
    
    if (!cartEl || !cartItemsEl) return;
    
    if (playerPosadaCart.length === 0) {
        cartEl.style.display = 'none';
        updateShopCartBadge('player-posada-cart-badge', 0);
        return;
    }
    
    updateShopCartBadge('player-posada-cart-badge', playerPosadaCart.length);
    
    // Calcular subtotal
    let subtotal = 0;
    const totalNights = playerPosadaCart.reduce((sum, item) => sum + item.nights, 0);
    
    cartItemsEl.innerHTML = playerPosadaCart.map(item => {
        const itemTotal = item.precio * item.nights;
        subtotal += itemTotal;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #4a3c31;">
                <div style="flex:1;">
                    <div style="color:#d4c4a8; font-weight:bold;">${item.nombre}</div>
                    <div style="color:#8b7355; font-size:0.85em;">${item.nights} noche${item.nights !== 1 ? 's' : ''} × ${item.precio} GP</div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="gold-value">${itemTotal.toLocaleString()} GP</span>
                    <button class="btn btn-small btn-danger" onclick="removeFromPosadaCart('${item.roomId}')" style="padding:4px 8px; font-size:0.8em;">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Calcular descuento (25% si 3+ noches)
    let discount = 0;
    if (totalNights >= 3) {
        discount = subtotal * 0.25;
    }
    
    const total = subtotal - discount;
    
    subtotalEl.textContent = subtotal.toLocaleString() + ' GP';
    
    if (discount > 0) {
        discountEl.style.display = 'flex';
        discountAmountEl.textContent = '-' + discount.toLocaleString() + ' GP';
    } else {
        discountEl.style.display = 'none';
    }
    
    totalEl.textContent = total.toLocaleString() + ' GP';
}

function openPlayerBatallaModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerBatallaShopId = shopId;
    playerBatallaSelected = [];
    playerBatallaSearchTerm = '';
    const batallaSearchEl = document.getElementById('player-batalla-search');
    if (batallaSearchEl) batallaSearchEl.value = '';
    const titleEl = document.getElementById('player-batalla-title');
    if (titleEl) titleEl.textContent = '🥊 ' + (shop.nombre || 'Arena de Batalla');
    const bodyEl = document.getElementById('player-batalla-body');
    const recEl = document.getElementById('player-batalla-receipt');
    const npcsListEl = document.getElementById('player-batalla-npcs-list');
    const selectedEl = document.getElementById('player-batalla-selected');
    if (!bodyEl || !recEl || !npcsListEl || !selectedEl) {
        openModal('player-batalla-modal');
        showToast('Error al cargar la arena. Recarga la página.', true);
        return;
    }
    bodyEl.style.display = 'block';
    recEl.style.display = 'none';
    recEl.innerHTML = '';
    selectedEl.style.display = 'none';
    
    const user = getCurrentUser();
    const renderOro = (oro) => {
        const el = document.getElementById('player-batalla-oro');
        if (el) el.innerHTML = '<strong>' + (oro != null ? oro : 0).toLocaleString() + '</strong> GP';
    };
    
    // Solo usar oponentes configurados por el DM
    let oponentes = [];
    
    if (shop.batallaOponentes && Array.isArray(shop.batallaOponentes) && shop.batallaOponentes.length > 0) {
        // Usar oponentes configurados por el DM (sin precio individual). Asegurar id siempre string (p. ej. ref Firestore → .id)
        oponentes = shop.batallaOponentes.map((op, idx) => {
            let id = op.npcId != null ? op.npcId : ('custom-' + idx);
            if (typeof id === 'object' && id && typeof id.id === 'string') id = id.id;
            else if (typeof id !== 'string') id = String(id);
            return { id: id, nombre: op.nombre || '', isCustom: op.isCustom || !op.npcId };
        });
    }
    
    // Si no hay oponentes configurados, mostrar mensaje
    if (oponentes.length === 0) {
        npcsListEl.innerHTML = '<div style="text-align:center; padding:40px; background:rgba(0,0,0,0.3); border-radius:8px; border:2px dashed #4a3c31;"><p style="color:#8b7355; font-size:1.1em; margin-bottom:8px;">🥊</p><p style="color:#8b7355; font-size:1em; margin-bottom:4px;">No hay oponentes disponibles</p><p style="color:#6b5d4a; font-size:0.9em; font-style:italic;">El DM debe configurar los oponentes de batalla desde el dashboard.</p></div>';
        if (user && user.id) {
            getCurrentPlayerDoc().then(doc => {
                const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
                renderOro(oro);
            });
        } else {
            renderOro(0);
        }
        openModal('player-batalla-modal');
        return;
    }
    
    const precioFijo = (shop.batallaPrecioFijo != null ? shop.batallaPrecioFijo : 0);
    playerBatallaOponentes = oponentes;
    openModal('player-batalla-modal');
    if (batallaSearchEl && !window._playerBatallaSearchListener) {
        window._playerBatallaSearchListener = true;
        batallaSearchEl.addEventListener('input', debounce(function () { playerBatallaSearchTerm = (batallaSearchEl.value || '').toLowerCase().trim(); renderBatallaOponentes(); }, 250));
    }
    try {
        renderBatallaOponentes();
        updateBatallaSelected();
    } catch (err) {
        console.error('Error al renderizar oponentes de batalla:', err);
        if (npcsListEl) npcsListEl.innerHTML = '<div style="color:#9c4a4a; padding:16px;">Error al cargar oponentes. Revisa la consola.</div>';
    }
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            renderOro(oro);
        });
    } else {
        renderOro(0);
    }
}

function escapeForOnclick(str) {
    if (str == null) return '';
    const s = String(str);
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function renderBatallaOponentes() {
    const npcsListEl = document.getElementById('player-batalla-npcs-list');
    if (!npcsListEl || !playerBatallaOponentes.length) return;
    const shop = playerShopsData.find(s => s.id === playerBatallaShopId);
    const precioFijo = (shop && shop.batallaPrecioFijo != null) ? shop.batallaPrecioFijo : 0;
    const q = playerBatallaSearchTerm;
    const oponentes = q ? playerBatallaOponentes.filter(op => (op.nombre || '').toLowerCase().includes(q)) : playerBatallaOponentes;
    npcsListEl.innerHTML = oponentes.map((op, idx) => {
        const opId = (op.id != null && typeof op.id === 'object' && op.id && op.id.id) ? op.id.id : String(op.id != null ? op.id : ('op-' + idx));
        const isSelected = playerBatallaSelected.some(s => String(s.opId) === String(opId));
        const safeOpId = escapeForOnclick(opId);
        const safeNombre = escapeForOnclick(op.nombre || '');
        const safeDataOpId = String(opId).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        return `
            <div class="player-batalla-npc-card" data-op-id="${safeDataOpId}" style="background:rgba(0,0,0,0.25); border:2px solid ${isSelected ? '#8b5a2b' : '#4a3c31'}; border-radius:10px; padding:16px; cursor:pointer; transition:all 0.3s ease;" onclick="toggleBatallaOponente('${safeOpId}', '${safeNombre}')">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:180px;">
                        <h4 style="color:#d4af37; font-family:'Cinzel',serif; margin-bottom:6px;">${op.nombre || 'Sin nombre'}</h4>
                        <p style="color:#8b7355; font-size:0.9em; line-height:1.4;">${op.isCustom ? 'Bestia/Oponente' : 'NPC'}</p>
                    </div>
                    <div style="flex-shrink:0; text-align:right;">
                        <div class="gold-value" style="margin-bottom:8px;">${precioFijo > 0 ? (precioFijo.toLocaleString() + ' GP / combate') : 'Precio no configurado'}</div>
                        <div style="color:${isSelected ? '#d4af37' : '#8b7355'}; font-size:0.85em;">${isSelected ? '✓ Seleccionado' : 'Clic para seleccionar'}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleBatallaOponente(opId, opNombre) {
    const index = playerBatallaSelected.findIndex(s => s.opId === opId);
    
    if (index >= 0) {
        // Deseleccionar
        playerBatallaSelected.splice(index, 1);
    } else {
        // Seleccionar
        playerBatallaSelected.push({
            opId: opId,
            nombre: opNombre,
            precio: 0
        });
    }
    
    updateBatallaSelected();
    // Actualizar visualmente la tarjeta
    const card = document.querySelector(`[data-op-id="${opId}"]`);
    if (card) {
        const isSelected = playerBatallaSelected.some(s => s.opId === opId);
        card.style.borderColor = isSelected ? '#8b5a2b' : '#4a3c31';
        const statusEl = card.querySelector('div[style*="text-align:right"] div:last-child');
        if (statusEl) {
            statusEl.textContent = isSelected ? '✓ Seleccionado' : 'Clic para seleccionar';
            statusEl.style.color = isSelected ? '#d4af37' : '#8b7355';
        }
    }
}

// Mantener compatibilidad con el nombre anterior
window.toggleBatallaNpc = toggleBatallaOponente;

function updateBatallaSelected() {
    const selectedEl = document.getElementById('player-batalla-selected');
    const selectedListEl = document.getElementById('player-batalla-selected-list');
    const totalEl = document.getElementById('player-batalla-total');
    
    if (!selectedEl || !selectedListEl || !totalEl) return;
    
    updateShopCartBadge('player-batalla-cart-badge', playerBatallaSelected.length);
    
    if (playerBatallaSelected.length === 0) {
        selectedListEl.innerHTML = '<div style="text-align:center; color:#8b7355; padding:20px;">Selecciona oponentes para continuar</div>';
        totalEl.textContent = '0 GP';
        return;
    }
    
    const shop = playerShopsData.find(s => s.id === playerBatallaShopId);
    const precioFijo = shop && shop.batallaPrecioFijo != null ? shop.batallaPrecioFijo : 0;

    selectedListEl.innerHTML = playerBatallaSelected.map(item => {
        const oid = item.opId != null ? (typeof item.opId === 'object' && item.opId && item.opId.id ? item.opId.id : String(item.opId)) : String(item.npcId || '');
        const safeOid = escapeForOnclick(oid);
        const safeNombre = escapeForOnclick(item.nombre || '');
        const escNombre = (item.nombre || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #4a3c31;">
                <div style="flex:1;">
                    <div style="color:#d4c4a8; font-weight:bold;">${escNombre}</div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <button class="btn btn-small btn-danger" onclick="toggleBatallaOponente('${safeOid}', '${safeNombre}')" style="padding:4px 8px; font-size:0.8em;">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Calcular total: precio fijo por cada oponente seleccionado
    const total = precioFijo > 0 ? precioFijo * playerBatallaSelected.length : 0;
    totalEl.textContent = total.toLocaleString() + ' GP';
}

async function processBatallaPayment() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como personaje', true);
        return;
    }
    
    if (playerBatallaSelected.length === 0) {
        showToast('Debes seleccionar al menos un oponente', true);
        return;
    }
    
    const shopId = playerBatallaShopId;
    if (!shopId) return;
    
    const shop = playerShopsData.find(s => s.id === shopId);
    const shopName = shop ? (shop.nombre || 'Arena de Batalla') : 'Arena de Batalla';
    
    // Calcular total: precio fijo por cada oponente seleccionado
    const precioFijo = (shop && shop.batallaPrecioFijo != null) ? shop.batallaPrecioFijo : 0;
    const total = precioFijo > 0 ? precioFijo * playerBatallaSelected.length : 0;

    if (total <= 0) {
        showToast('El DM aún no configuró el precio fijo del combate para esta tienda.', true);
        return;
    }
    
    // Verificar oro
    const docRef = db.collection('players').doc(user.id);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) {
        showToast('No se encontró el personaje', true);
        return;
    }
    
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    
    if (oro < total) {
        showToast('No tienes suficiente oro. Necesitas ' + total.toLocaleString() + ' GP. Tienes ' + oro.toLocaleString() + ' GP.', true);
        return;
    }
    
    // Procesar pago
    const newOro = oro - total;
    await docRef.update({ oro: newOro });
    
    // Crear transacción
    const items = playerBatallaSelected.map(item => ({
        name: 'Batalla vs ' + item.nombre,
        line: 'Incluido'
    }));
    
    const cityInfo = getCityInfoForShop(shop);
    await db.collection('transactions').add({
        tipo: 'batalla',
        itemName: 'Batalla contra ' + playerBatallaSelected.map(i => i.nombre).join(', '),
        playerId: user.id,
        playerName: user.nombre || 'Jugador',
        shopName,
        precio: total,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
        ...cityInfo
    });
    
    // Mostrar recibo
    const bodyEl = document.getElementById('player-batalla-body');
    const recEl = document.getElementById('player-batalla-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: shopName,
            logo: '🥊',
            subtitle: 'Recibo de batalla',
            items: items,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: '¡Que la fortuna te acompañe en la batalla!',
            modalId: 'player-batalla-modal',
            primaryButton: {
                label: 'Ir a Battle Tracker',
                onclick: "window.open('battle-tracker.html','_blank')"
            }
        });
        recEl.style.display = 'block';
    }
    
    // Limpiar selección
    playerBatallaSelected = [];
    updateBatallaSelected();
    
    // Actualizar oro mostrado
    const renderOro = (oro) => {
        const el = document.getElementById('player-batalla-oro');
        if (el) el.innerHTML = '<strong>' + (oro != null ? oro : 0).toLocaleString() + '</strong> GP';
    };
    renderOro(newOro);
    
    showToast('Has pagado ' + total.toLocaleString() + ' GP para la batalla. ¡Buena suerte!');
}

window.openPlayerBatallaModal = openPlayerBatallaModal;
// compatibilidad: antes se llamaba toggleBatallaNpc
window.toggleBatallaNpc = toggleBatallaOponente;
window.toggleBatallaOponente = toggleBatallaOponente;
window.processBatallaPayment = processBatallaPayment;

window.checkoutPosada = async function() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como personaje', true);
        return;
    }
    
    if (playerPosadaCart.length === 0) {
        showToast('Añade algo a tu carrito para continuar', true);
        return;
    }
    
    const shopId = playerPosadaShopId;
    if (!shopId) return;
    
    const shop = playerShopsData.find(s => s.id === shopId);
    const shopName = shop ? (shop.nombre || 'Posada') : 'Posada';
    
    // Calcular total
    let subtotal = 0;
    const totalNights = playerPosadaCart.reduce((sum, item) => sum + item.nights, 0);
    playerPosadaCart.forEach(item => {
        subtotal += item.precio * item.nights;
    });
    
    let discount = 0;
    if (totalNights >= 3) {
        discount = subtotal * 0.25;
    }
    
    const total = subtotal - discount;
    
    // Verificar oro
    const docRef = db.collection('players').doc(user.id);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) {
        showToast('No se encontró el personaje', true);
        return;
    }
    
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    
    if (oro < total) {
        showToast('No tienes suficiente oro. Necesitas ' + total.toLocaleString() + ' GP. Tienes ' + oro.toLocaleString() + ' GP.', true);
        return;
    }
    
    // Procesar reservas
    const newOro = oro - total;
    await docRef.update({ oro: newOro });
    
    // Crear transacciones
    const items = [];
    for (const item of playerPosadaCart) {
        const itemTotal = item.precio * item.nights;
        items.push({
            name: item.nombre + (item.nights > 1 ? ` (${item.nights} noches)` : ''),
            line: itemTotal.toLocaleString() + ' GP'
        });
        
        // Crear transacción individual por cada noche
        const cityInfo = getCityInfoForShop(shop);
        for (let i = 0; i < item.nights; i++) {
            await db.collection('transactions').add({
                tipo: 'hospedaje',
                itemName: item.nombre,
                playerId: user.id,
                playerName: user.nombre || 'Jugador',
                shopName,
                precio: item.precio,
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                ...cityInfo
            });
        }
    }
    const itemsBoughtPosada = playerPosadaCart.map(item => ({
        item: { name: item.nombre, effect: item.efecto || '', price: item.precio },
        qty: item.nights || 1
    }));
    if (itemsBoughtPosada.length && typeof runAutomationRules === 'function') {
        await runAutomationRules(shopId, itemsBoughtPosada, user.id, user.nombre || 'Jugador');
    }
    
    // Agregar descuento si aplica
    if (discount > 0) {
        items.push({
            name: 'Descuento (25% por 3+ noches)',
            line: '-' + discount.toLocaleString() + ' GP'
        });
    }
    
    // Mostrar recibo
    const bodyEl = document.getElementById('player-posada-body');
    const recEl = document.getElementById('player-posada-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: shopName,
            logo: '🏨',
            subtitle: 'Recibo de hospedaje',
            items: items,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: '¡Descansa bien, aventurero!',
            modalId: 'player-posada-modal'
        });
        recEl.style.display = 'block';
    }
    
    // Limpiar carrito
    playerPosadaCart = [];
    updatePosadaCart();
    
    // Actualizar oro mostrado
    const renderOro = (oro) => {
        const el = document.getElementById('player-posada-oro');
        if (el) el.innerHTML = '<strong>' + (oro != null ? oro : 0).toLocaleString() + '</strong> GP';
    };
    renderOro(newOro);
    
    showToast('Has reservado ' + totalNights + ' noche' + (totalNights !== 1 ? 's' : '') + ' por ' + total.toLocaleString() + ' GP.');
}

function openPlayerShop(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    const t = (shop.tipo || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // normalizar y quitar espacios
    if (t === 'pociones') {
        openPlayerPotionShop(shopId);
    } else if (t === 'taberna') {
        openPlayerTavernShop(shopId);
    } else if (t === 'santuario') {
        openPlayerSanctuaryModal(shopId);
    } else if (t === 'herreria') {
        openPlayerForgeModal(shopId);
    } else if (t === 'arqueria') {
        openPlayerArtesaniasModal(shopId);
    } else if (t === 'biblioteca') {
        openPlayerBibliotecaModal(shopId);
    } else if (t === 'emporio') {
        openPlayerEmporioModal(shopId);
    } else if (t === 'banco') {
        openPlayerBancoModal(shopId);
    } else if (t === 'posada') {
        openPlayerPosadaModal(shopId);
    } else if (t === 'batalla' || t === 'arena' || t.indexOf('batalla') !== -1) {
        openPlayerBatallaModal(shopId);
    } else {
        openPlayerShopCatalog(shopId);
    }
}

// ==================== ARTESANÍAS (estilo Klicklac: Flechas, Ropa, Servicios) ====================
const ARTESANIAS_TYPE_LABELS = { common: 'Común', magic: 'Mágico ✨', elemental: 'Elemental 🔮', gear: 'Equipo', service: 'Servicio' };

function openPlayerArtesaniasModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerArtesaniasShopId = shopId;
    playerArtesaniasCart = [];
    playerArtesaniasTab = 'flechas';
    const bodyEl = document.getElementById('player-artesanias-body');
    const recEl = document.getElementById('player-artesanias-receipt');
    if (bodyEl) bodyEl.style.display = 'block';
    if (recEl) { recEl.style.display = 'none'; recEl.innerHTML = ''; }
    document.getElementById('player-artesanias-title').textContent = '🏹 ' + (shop.nombre || 'Artesanías');
    playerArtesaniasSearchTerm = '';
    const artSearchEl = document.getElementById('player-artesanias-search');
    if (artSearchEl) artSearchEl.value = '';
    document.querySelectorAll('.player-artesanias-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'flechas');
        b.classList.toggle('btn-secondary', b.dataset.tab !== 'flechas');
    });
    document.getElementById('player-artesanias-flechas-grid').style.display = 'block';
    document.getElementById('player-artesanias-ropa-grid').style.display = 'none';
    document.getElementById('player-artesanias-servicios-grid').style.display = 'none';
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            document.getElementById('player-artesanias-oro-display').textContent = oro.toLocaleString();
        });
    }
    renderPlayerArtesaniasGrids();
    renderPlayerArtesaniasCart();
    if (!window._playerArtesaniasListeners) {
        window._playerArtesaniasListeners = true;
        document.querySelectorAll('.player-artesanias-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                playerArtesaniasTab = btn.dataset.tab;
                document.querySelectorAll('.player-artesanias-tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === playerArtesaniasTab); b.classList.toggle('btn-secondary', b.dataset.tab !== playerArtesaniasTab); });
                document.getElementById('player-artesanias-flechas-grid').style.display = playerArtesaniasTab === 'flechas' ? 'block' : 'none';
                document.getElementById('player-artesanias-ropa-grid').style.display = playerArtesaniasTab === 'ropa' ? 'block' : 'none';
                document.getElementById('player-artesanias-servicios-grid').style.display = playerArtesaniasTab === 'servicios' ? 'block' : 'none';
            });
        });
        if (artSearchEl) artSearchEl.addEventListener('input', debounce(function () { playerArtesaniasSearchTerm = (artSearchEl.value || '').toLowerCase().trim(); renderPlayerArtesaniasGrids(); }, 250));
    }
    openModal('player-artesanias-modal');
}

function renderPlayerArtesaniasGrids() {
    const shop = playerShopsData.find(s => s.id === playerArtesaniasShopId);
    if (!shop) return;
    const inv = shop.inventario || [];
    const q = playerArtesaniasSearchTerm;
    const match = (it) => !q || (it.name || '').toLowerCase().includes(q) || (getItemDesc(it) || '').toLowerCase().includes(q);
    let flechas = inv.filter(it => (it.tab || 'flechas').toLowerCase() === 'flechas');
    let ropa = inv.filter(it => (it.tab || '').toLowerCase() === 'ropa');
    let servicios = inv.filter(it => (it.tab || '').toLowerCase() === 'servicios');
    if (q) { flechas = flechas.filter(match); ropa = ropa.filter(match); servicios = servicios.filter(match); }
    const typeLabel = (t) => ARTESANIAS_TYPE_LABELS[(t || 'common').toLowerCase()] || t || 'Común';
    const renderCard = (it, invIdx) => {
        const t = (it.type || 'common').toLowerCase();
        const desc = getItemDesc(it) || '—';
        return `<div class="player-artesanias-card player-artesanias-${t}">
            <div class="player-artesanias-card-name">${it.name || 'Item'}</div>
            <span class="player-artesanias-type">${typeLabel(it.type)}</span>
            <div class="player-artesanias-effect-box"><span>✨</span><span>${desc}</span></div>
            <div class="player-artesanias-footer"><span class="player-artesanias-price">${(it.price||0).toLocaleString()} GP</span>
            <button type="button" class="btn btn-small player-artesanias-add-btn" onclick="playerArtesaniasAddToCart(${invIdx})">+ Añadir</button></div>
        </div>`;
    };
    document.getElementById('player-artesanias-flechas-grid').innerHTML = flechas.length ? '<div class="player-artesanias-cat-title">🏹 Flechas</div>' + flechas.map(it => renderCard(it, inv.indexOf(it))).join('') : '<p class="player-artesanias-no-results">No hay flechas en esta tienda</p>';
    document.getElementById('player-artesanias-ropa-grid').innerHTML = ropa.length ? '<div class="player-artesanias-cat-title">👕 Ropa y Equipo</div>' + ropa.map(it => renderCard(it, inv.indexOf(it))).join('') : '<p class="player-artesanias-no-results">No hay ropa ni equipo</p>';
    document.getElementById('player-artesanias-servicios-grid').innerHTML = servicios.length ? '<div class="player-artesanias-cat-title">🔧 Servicios</div>' + servicios.map(it => renderCard(it, inv.indexOf(it))).join('') : '<p class="player-artesanias-no-results">No hay servicios</p>';
}

function playerArtesaniasAddToCart(inventarioIndex) {
    const shop = playerShopsData.find(s => s.id === playerArtesaniasShopId);
    if (!shop || !shop.inventario || inventarioIndex < 0 || inventarioIndex >= shop.inventario.length) return;
    const it = shop.inventario[inventarioIndex];
    const entry = playerArtesaniasCart.find(e => e.inventarioIndex === inventarioIndex);
    if (entry) entry.qty++;
    else playerArtesaniasCart.push({ inventarioIndex, qty: 1, name: it.name, price: it.price || 0 });
    renderPlayerArtesaniasCart();
}

function playerArtesaniasUpdateQty(inventarioIndex, delta) {
    const entry = playerArtesaniasCart.find(e => e.inventarioIndex === inventarioIndex);
    if (!entry) return;
    entry.qty += delta;
    if (entry.qty <= 0) playerArtesaniasCart = playerArtesaniasCart.filter(e => e.inventarioIndex !== inventarioIndex);
    renderPlayerArtesaniasCart();
}

function renderPlayerArtesaniasCart() {
    const el = document.getElementById('player-artesanias-cart-items');
    const totEl = document.getElementById('player-artesanias-cart-total');
    if (!el) return;
    if (!playerArtesaniasCart.length) {
        el.innerHTML = '<div style="text-align:center; color:#81c784; padding:24px;">Añade algo a tu carrito para continuar</div>';
        if (totEl) totEl.innerHTML = '';
        updateShopCartBadge('player-artesanias-cart-badge', 0);
        return;
    }
    const shop = playerShopsData.find(s => s.id === playerArtesaniasShopId);
    const inventario = shop && shop.inventario ? shop.inventario : [];
    el.innerHTML = playerArtesaniasCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const price = it ? (it.price || 0) : e.price;
        return `<div class="player-artesanias-cart-item">
            <div><div class="player-artesanias-cart-name">${e.name}</div><div class="player-artesanias-cart-price">${price} GP c/u</div></div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn btn-small" style="width:28px; height:28px; padding:0;" onclick="playerArtesaniasUpdateQty(${e.inventarioIndex}, -1)">−</button>
                <span>${e.qty}</span>
                <button type="button" class="btn btn-small" style="width:28px; height:28px; padding:0;" onclick="playerArtesaniasUpdateQty(${e.inventarioIndex}, 1)">+</button>
            </div>
        </div>`;
    }).join('');
    const total = playerArtesaniasCart.reduce((sum, e) => sum + ((inventario[e.inventarioIndex] ? inventario[e.inventarioIndex].price : e.price) || 0) * e.qty, 0);
    totEl.innerHTML = '<div style="margin-top:16px; padding-top:12px; border-top:2px solid #4a7c4a;"><div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.2em;"><span style="color:#81c784;">Total:</span><span style="color:#aed581; font-weight:bold;">' + total.toLocaleString() + ' GP</span></div><button type="button" class="btn" style="width:100%; margin-top:12px; background:linear-gradient(135deg,#7cb342,#558b2f); color:#fff;" onclick="playerArtesaniasCheckout()">Confirmar compra</button></div>';
    updateShopCartBadge('player-artesanias-cart-badge', playerArtesaniasCart.length);
}

async function playerArtesaniasCheckout() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const shop = playerShopsData.find(s => s.id === playerArtesaniasShopId);
    if (!shop || !playerArtesaniasCart.length) { showToast('Añade algo a tu carrito para continuar', true); return; }
    const inventario = shop.inventario || [];
    const total = playerArtesaniasCart.reduce((sum, e) => sum + (inventario[e.inventarioIndex] ? (inventario[e.inventarioIndex].price || 0) : 0) * e.qty, 0);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < total) { showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true); return; }
    const newOro = oro - total;
    const receiptItems = playerArtesaniasCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const name = it ? (it.name || 'Item') : 'Item';
        const price = it ? (it.price != null ? it.price : 0) : 0;
        const qty = e.qty || 1;
        const line = qty > 1 ? (price * qty) + ' GP (' + qty + ' × ' + price + ')' : price + ' GP';
        return { name, line };
    });
    const playerInv = Array.isArray(data.inventario) ? data.inventario.slice() : [];
    playerArtesaniasCart.forEach(e => {
        const it = inventario[e.inventarioIndex];
        if (!it) return;
        const qty = e.qty || 1;
        const entry = { name: it.name, price: it.price, effect: it.effect || it.desc || '', rarity: 'común' };
        if (it.type) entry.type = it.type;
        if (it.tab) entry.tab = it.tab;
        entry.shopTipo = (shop.tipo || 'arqueria').toString().toLowerCase();
        if (qty > 1) entry.quantity = qty;
        playerInv.push(entry);
    });
    await db.collection('players').doc(user.id).update({ oro: newOro, inventario: playerInv });
    
    // Guardar transacción para cada item comprado
    for (const e of playerArtesaniasCart) {
        const it = inventario[e.inventarioIndex];
        if (!it) continue;
        const itemName = it.name || 'Item';
        const itemPrice = (it.price != null ? it.price : 0) * (e.qty || 1);
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: (e.qty > 1 ? e.qty + '× ' : '') + itemName,
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shop.nombre || 'Artesanías',
            precio: itemPrice,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
    }
    const itemsBoughtArte = playerArtesaniasCart.map(e => {
        const it = inventario[e.inventarioIndex];
        return it ? { item: { name: it.name, effect: it.effect || it.desc, price: it.price }, qty: e.qty || 1 } : null;
    }).filter(Boolean);
    if (itemsBoughtArte.length && typeof runAutomationRules === 'function') {
        await runAutomationRules(playerArtesaniasShopId, itemsBoughtArte, user.id, user.nombre || 'Jugador');
    }
    playerArtesaniasCart = [];
    renderPlayerArtesaniasCart();
    document.getElementById('player-artesanias-oro-display').textContent = newOro.toLocaleString();
    const bodyEl = document.getElementById('player-artesanias-body');
    const recEl = document.getElementById('player-artesanias-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: shop.nombre || 'Artesanías',
            logo: '🏹',
            subtitle: 'Recibo de pedido',
            items: receiptItems,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: 'Buena caza. — Artesanías.',
            modalId: 'player-artesanias-modal'
        });
        recEl.style.display = 'block';
    }
    showToast('Pedido confirmado. ' + total.toLocaleString() + ' GP descontados.');
}

// ==================== EMPORIO (materiales hechizos, objetos raros/importados, mapas, otros) ====================
const EMPORIO_SECTIONS = ['materiales', 'raros', 'mapas', 'otros'];
const EMPORIO_SECTION_LABELS = { materiales: '🧪 Materiales para hechizos', raros: '💎 Objetos raros e importados', mapas: '🗺️ Mapas', otros: '📦 Otros' };

function openPlayerEmporioModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerEmporioShopId = shopId;
    playerEmporioCart = [];
    playerEmporioTab = 'materiales';
    const bodyEl = document.getElementById('player-emporio-body');
    const recEl = document.getElementById('player-emporio-receipt');
    if (bodyEl) bodyEl.style.display = 'block';
    if (recEl) { recEl.style.display = 'none'; recEl.innerHTML = ''; }
    document.getElementById('player-emporio-title').textContent = '🛒 ' + (shop.nombre || 'Emporio');
    playerEmporioSearchTerm = '';
    const empSearchEl = document.getElementById('player-emporio-search');
    if (empSearchEl) empSearchEl.value = '';
    document.querySelectorAll('.player-emporio-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.section === 'materiales');
        b.classList.toggle('btn-secondary', b.dataset.section !== 'materiales');
    });
    ['materiales', 'raros', 'mapas', 'otros'].forEach(sec => {
        const grid = document.getElementById('player-emporio-grid-' + sec);
        if (grid) grid.style.display = sec === 'materiales' ? 'block' : 'none';
    });
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            document.getElementById('player-emporio-oro-display').textContent = oro.toLocaleString();
        });
    }
    renderPlayerEmporioGrids();
    renderPlayerEmporioCart();
    if (!window._playerEmporioListeners) {
        window._playerEmporioListeners = true;
        document.querySelectorAll('.player-emporio-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                playerEmporioTab = btn.dataset.section;
                document.querySelectorAll('.player-emporio-tab').forEach(b => { b.classList.toggle('active', b.dataset.section === playerEmporioTab); b.classList.toggle('btn-secondary', b.dataset.section !== playerEmporioTab); });
                ['materiales', 'raros', 'mapas', 'otros'].forEach(sec => {
                    const grid = document.getElementById('player-emporio-grid-' + sec);
                    if (grid) grid.style.display = sec === playerEmporioTab ? 'block' : 'none';
                });
            });
        });
        if (empSearchEl) empSearchEl.addEventListener('input', debounce(function () { playerEmporioSearchTerm = (empSearchEl.value || '').toLowerCase().trim(); renderPlayerEmporioGrids(); }, 250));
    }
    openModal('player-emporio-modal');
}

function renderPlayerEmporioGrids() {
    const shop = playerShopsData.find(s => s.id === playerEmporioShopId);
    if (!shop) return;
    const inv = shop.inventario || [];
    const q = playerEmporioSearchTerm;
    const match = (it) => !q || (it.name || '').toLowerCase().includes(q) || (getItemDesc(it) || '').toLowerCase().includes(q) || ((it.rarity || '').toLowerCase().includes(q));
    const sectionItems = (sec) => {
        const items = inv.filter(it => (it.section || 'otros').toLowerCase() === sec);
        return q ? items.filter(match) : items;
    };
    const renderCard = (it, invIdx) => {
        const desc = getItemDesc(it) || '—';
        const rarity = normalizeRarity(it.rarity);
        const rarityColors = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
        return `<div class="player-emporio-card">
            <div class="player-emporio-card-name">${it.name || 'Item'}</div>
            ${rarity ? `<span class="player-emporio-rarity" style="background:${rarityColors[rarity] || '#888'}; padding:2px 8px; border-radius:10px; font-size:0.75em;">${rarity}</span>` : ''}
            <div class="player-emporio-effect-box"><span>✨</span><span>${desc}</span></div>
            <div class="player-emporio-footer"><span class="player-emporio-price">${(it.price || 0).toLocaleString()} GP</span>
            <button type="button" class="btn btn-small player-emporio-add-btn" onclick="playerEmporioAddToCart(${invIdx})">+ Añadir</button></div>
        </div>`;
    };
    EMPORIO_SECTIONS.forEach(sec => {
        const grid = document.getElementById('player-emporio-grid-' + sec);
        if (!grid) return;
        const items = sectionItems(sec);
        const title = EMPORIO_SECTION_LABELS[sec] || sec;
        grid.innerHTML = items.length ? '<div class="player-emporio-cat-title">' + title + '</div>' + items.map(it => renderCard(it, inv.indexOf(it))).join('') : '<p class="player-emporio-no-results">No hay items en esta sección</p>';
    });
}

function playerEmporioAddToCart(inventarioIndex) {
    const shop = playerShopsData.find(s => s.id === playerEmporioShopId);
    if (!shop || !shop.inventario || inventarioIndex < 0 || inventarioIndex >= shop.inventario.length) return;
    const it = shop.inventario[inventarioIndex];
    const entry = playerEmporioCart.find(e => e.inventarioIndex === inventarioIndex);
    if (entry) entry.qty++;
    else playerEmporioCart.push({ inventarioIndex, qty: 1, name: it.name, price: it.price || 0 });
    renderPlayerEmporioCart();
}

function playerEmporioUpdateQty(inventarioIndex, delta) {
    const entry = playerEmporioCart.find(e => e.inventarioIndex === inventarioIndex);
    if (!entry) return;
    entry.qty += delta;
    if (entry.qty <= 0) playerEmporioCart = playerEmporioCart.filter(e => e.inventarioIndex !== inventarioIndex);
    renderPlayerEmporioCart();
}

function renderPlayerEmporioCart() {
    const el = document.getElementById('player-emporio-cart-items');
    const totEl = document.getElementById('player-emporio-cart-total');
    if (!el) return;
    if (!playerEmporioCart.length) {
        el.innerHTML = '<div style="text-align:center; color:#8a9aa8; padding:24px;">Añade algo a tu carrito para continuar</div>';
        if (totEl) totEl.innerHTML = '';
        updateShopCartBadge('player-emporio-cart-badge', 0);
        return;
    }
    const shop = playerShopsData.find(s => s.id === playerEmporioShopId);
    const inventario = shop && shop.inventario ? shop.inventario : [];
    el.innerHTML = playerEmporioCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const price = it ? (it.price || 0) : e.price;
        return `<div class="player-emporio-cart-item">
            <div><div class="player-emporio-cart-name">${e.name}</div><div class="player-emporio-cart-price">${price} GP c/u</div></div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn btn-small" style="width:28px; height:28px; padding:0;" onclick="playerEmporioUpdateQty(${e.inventarioIndex}, -1)">−</button>
                <span>${e.qty}</span>
                <button type="button" class="btn btn-small" style="width:28px; height:28px; padding:0;" onclick="playerEmporioUpdateQty(${e.inventarioIndex}, 1)">+</button>
            </div>
        </div>`;
    }).join('');
    const total = playerEmporioCart.reduce((sum, e) => sum + ((inventario[e.inventarioIndex] ? inventario[e.inventarioIndex].price : e.price) || 0) * e.qty, 0);
    totEl.innerHTML = '<div style="margin-top:16px; padding-top:12px; border-top:2px solid #6a7a8a;"><div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.2em;"><span style="color:#9ca8b8;">Total:</span><span style="color:#b8c8d8; font-weight:bold;">' + total.toLocaleString() + ' GP</span></div><button type="button" class="btn" style="width:100%; margin-top:12px; background:linear-gradient(135deg,#6a7a8a,#4a5a6a); color:#e8eef4;" onclick="playerEmporioCheckout()">Confirmar compra</button></div>';
    updateShopCartBadge('player-emporio-cart-badge', playerEmporioCart.length);
}

async function playerEmporioCheckout() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const shop = playerShopsData.find(s => s.id === playerEmporioShopId);
    if (!shop || !playerEmporioCart.length) { showToast('Añade algo a tu carrito para continuar', true); return; }
    const inventario = shop.inventario || [];
    const total = playerEmporioCart.reduce((sum, e) => sum + (inventario[e.inventarioIndex] ? (inventario[e.inventarioIndex].price || 0) : 0) * e.qty, 0);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < total) { showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true); return; }
    const newOro = oro - total;
    const receiptItems = playerEmporioCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const name = it ? (it.name || 'Item') : 'Item';
        const price = it ? (it.price != null ? it.price : 0) : 0;
        const qty = e.qty || 1;
        const line = qty > 1 ? (price * qty) + ' GP (' + qty + ' × ' + price + ')' : price + ' GP';
        return { name, line };
    });
    const playerInv = Array.isArray(data.inventario) ? data.inventario.slice() : [];
    playerEmporioCart.forEach(e => {
        const it = inventario[e.inventarioIndex];
        if (!it) return;
        const qty = e.qty || 1;
        const entry = { name: it.name, price: it.price, effect: it.effect || it.desc || '', rarity: (it.rarity || 'común') };
        if (it.section) entry.section = it.section;
        entry.shopTipo = (shop.tipo || 'emporio').toString().toLowerCase();
        if (qty > 1) entry.quantity = qty;
        playerInv.push(entry);
    });
    await db.collection('players').doc(user.id).update({ oro: newOro, inventario: playerInv });
    
    // Guardar transacción para cada item comprado
    for (const e of playerEmporioCart) {
        const it = inventario[e.inventarioIndex];
        if (!it) continue;
        const itemName = it.name || 'Item';
        const itemPrice = (it.price != null ? it.price : 0) * (e.qty || 1);
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: (e.qty > 1 ? e.qty + '× ' : '') + itemName,
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shop.nombre || 'Emporio',
            precio: itemPrice,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
    }
    const itemsBoughtEmporio = playerEmporioCart.map(e => {
        const it = inventario[e.inventarioIndex];
        return it ? { item: { name: it.name, effect: it.effect || it.desc, price: it.price }, qty: e.qty || 1 } : null;
    }).filter(Boolean);
    if (itemsBoughtEmporio.length && typeof runAutomationRules === 'function') {
        await runAutomationRules(playerEmporioShopId, itemsBoughtEmporio, user.id, user.nombre || 'Jugador');
    }
    playerEmporioCart = [];
    renderPlayerEmporioCart();
    document.getElementById('player-emporio-oro-display').textContent = newOro.toLocaleString();
    const bodyEl = document.getElementById('player-emporio-body');
    const recEl = document.getElementById('player-emporio-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: shop.nombre || 'Emporio',
            logo: '🛒',
            subtitle: 'Recibo de compra',
            items: receiptItems,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: 'Gracias por tu compra. Que encuentres lo que buscas.',
            modalId: 'player-emporio-modal'
        });
        recEl.style.display = 'block';
    }
    showToast('Compra confirmada. ' + total.toLocaleString() + ' GP descontados.');
}

// ==================== BIBLIOTECA (tabs por sección, carrito, recibo, inventario) ====================
const BIBLIOTECA_SECTIONS = ['magia', 'fabricacion', 'cocina', 'trampas', 'alquimia', 'mapas', 'restringida'];
const BIBLIOTECA_SECTION_LABELS = { magia: '✨ Magia', fabricacion: '⚔️ Fabricación', cocina: '🍲 Cocina', trampas: '⚙️ Trampas', alquimia: '🧪 Alquimia', mapas: '🗺️ Mapas', restringida: '🔒 Restringida' };

function openPlayerBibliotecaModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerBibliotecaShopId = shopId;
    playerBibliotecaCart = [];
    playerBibliotecaSearchTerm = '';
    const biblioSearchEl = document.getElementById('player-biblioteca-search');
    if (biblioSearchEl) biblioSearchEl.value = '';
    document.getElementById('player-biblioteca-title').textContent = '📚 ' + (shop.nombre || 'Biblioteca');
    const body = document.getElementById('player-biblioteca-body');
    const receipt = document.getElementById('player-biblioteca-receipt');
    if (body) body.style.display = 'block';
    if (receipt) receipt.style.display = 'none';
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            const el = document.getElementById('player-biblioteca-oro-display');
            if (el) el.textContent = oro.toLocaleString();
        });
    }
    renderPlayerBibliotecaTabsAndGrids();
    renderPlayerBibliotecaCart();
    if (!window._playerBibliotecaListeners) {
        window._playerBibliotecaListeners = true;
        document.querySelectorAll('.player-biblioteca-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const sec = btn.dataset.section;
                document.querySelectorAll('.player-biblioteca-tab').forEach(b => { b.classList.toggle('active', b.dataset.section === sec); b.classList.toggle('btn-secondary', b.dataset.section !== sec); });
                document.querySelectorAll('.player-biblioteca-section').forEach(s => { s.style.display = s.id === 'player-biblio-grid-' + sec ? 'block' : 'none'; });
            });
        });
        if (biblioSearchEl) biblioSearchEl.addEventListener('input', debounce(function () { playerBibliotecaSearchTerm = (biblioSearchEl.value || '').toLowerCase().trim(); renderPlayerBibliotecaTabsAndGrids(); }, 250));
    }
    openModal('player-biblioteca-modal');
}

function renderPlayerBibliotecaTabsAndGrids() {
    const shop = playerShopsData.find(s => s.id === playerBibliotecaShopId);
    if (!shop) return;
    const inv = shop.inventario || [];
    const q = playerBibliotecaSearchTerm;
    const match = (it) => !q || (it.name || '').toLowerCase().includes(q) || (it.title || '').toLowerCase().includes(q) || (getItemDesc(it) || '').toLowerCase().includes(q);
    BIBLIOTECA_SECTIONS.forEach(sec => {
        const grid = document.getElementById('player-biblio-grid-' + sec);
        if (!grid) return;
        let items = inv.filter(it => (it.section || '').toLowerCase() === sec);
        if (q) items = items.filter(match);
        const cssMap = { magia: 'magic', fabricacion: 'craft', cocina: 'cooking', trampas: 'traps', alquimia: 'alchemy', mapas: 'maps', restringida: 'restricted' };
        const bookCss = cssMap[sec] || 'magic';
        const inCart = (idx) => playerBibliotecaCart.some(e => e.inventarioIndex === idx);
        grid.innerHTML = items.length ? items.map((it, i) => {
            const invIdx = inv.indexOf(it);
            const added = inCart(invIdx);
            const price = it.price != null ? it.price : 0;
            const biblioDesc = getItemDesc(it) || '—';
            return `<div class="player-biblio-card player-biblio-${bookCss}">
                <div class="player-biblio-title">${it.name || it.title || 'Libro'}</div>
                <div class="player-biblio-details">
                    ${it.nivel != null ? `<div class="player-biblio-row"><span class="player-biblio-label">Nivel</span><span class="player-biblio-value">${it.nivel}</span></div>` : ''}
                    ${price ? `<div class="player-biblio-row"><span class="player-biblio-label">Depósito</span><span class="player-biblio-value">${price} GP</span></div>` : ''}
                    ${it.tiempo ? `<div class="player-biblio-row"><span class="player-biblio-label">Tiempo</span><span class="player-biblio-value">${it.tiempo}</span></div>` : ''}
                </div>
                <div class="player-biblio-effect"><div class="player-biblio-ef-label">${it.efLabel || 'Efecto'}</div><div class="player-biblio-ef-text">${biblioDesc}</div></div>
                ${price ? `<button type="button" class="btn btn-small player-biblio-add-btn ${added ? 'added' : ''}" onclick="playerBibliotecaToggleCart(${invIdx})">${added ? '✓ En el carrito' : '+ Añadir'}</button>` : ''}
            </div>`;
        }).join('') : '<p class="player-biblio-no-results">No hay libros en esta sección</p>';
    });
}

function playerBibliotecaToggleCart(inventarioIndex) {
    const shop = playerShopsData.find(s => s.id === playerBibliotecaShopId);
    if (!shop || !shop.inventario || inventarioIndex < 0 || inventarioIndex >= shop.inventario.length) return;
    const it = shop.inventario[inventarioIndex];
    const price = it.price != null ? it.price : 0;
    if (!price) return;
    const idx = playerBibliotecaCart.findIndex(e => e.inventarioIndex === inventarioIndex);
    if (idx >= 0) playerBibliotecaCart.splice(idx, 1);
    else playerBibliotecaCart.push({ inventarioIndex, name: it.name || it.title || 'Libro', price });
    renderPlayerBibliotecaCart();
    renderPlayerBibliotecaTabsAndGrids();
}

function renderPlayerBibliotecaCart() {
    const el = document.getElementById('player-biblioteca-cart-items');
    const totEl = document.getElementById('player-biblioteca-cart-total');
    if (!el) return;
    if (!playerBibliotecaCart.length) {
        el.innerHTML = '<div style="text-align:center; color:#8a7a9a; padding:24px;">Añade algo a tu carrito para continuar</div>';
        if (totEl) totEl.innerHTML = '';
        updateShopCartBadge('player-biblioteca-cart-badge', 0);
        return;
    }
    const shop = playerShopsData.find(s => s.id === playerBibliotecaShopId);
    const inventario = shop && shop.inventario ? shop.inventario : [];
    el.innerHTML = playerBibliotecaCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const price = it ? (it.price != null ? it.price : 0) : e.price;
        return `<div class="player-biblio-cart-item">
            <div><div class="player-biblio-cart-name">${e.name}</div><div class="player-biblio-cart-price">${price} GP</div></div>
            <button type="button" class="btn btn-small btn-danger" style="width:28px; height:28px; padding:0;" onclick="playerBibliotecaToggleCart(${e.inventarioIndex})">✕</button>
        </div>`;
    }).join('');
    const total = playerBibliotecaCart.reduce((sum, e) => sum + (inventario[e.inventarioIndex] ? (inventario[e.inventarioIndex].price != null ? inventario[e.inventarioIndex].price : 0) : e.price), 0);
    totEl.innerHTML = '<div style="margin-top:16px; padding-top:12px; border-top:2px solid #5a4a6a;"><div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.2em;"><span style="color:#a090b0;">Total:</span><span style="color:#daa520; font-weight:bold;">' + total.toLocaleString() + ' GP</span></div><button type="button" class="btn" style="width:100%; margin-top:12px; background:linear-gradient(135deg,#6a4a8a,#4a2a6a); color:#e0d0f0; border:2px solid #8a6aaa;" onclick="playerBibliotecaCheckout()">📜 Confirmar alquiler</button></div>';
    updateShopCartBadge('player-biblioteca-cart-badge', playerBibliotecaCart.length);
}

async function playerBibliotecaCheckout() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const shop = playerShopsData.find(s => s.id === playerBibliotecaShopId);
    if (!shop || !playerBibliotecaCart.length) { showToast('Añade algo a tu carrito para continuar', true); return; }
    const inventario = shop.inventario || [];
    const total = playerBibliotecaCart.reduce((sum, e) => sum + (inventario[e.inventarioIndex] ? (inventario[e.inventarioIndex].price != null ? inventario[e.inventarioIndex].price : 0) : e.price), 0);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < total) { showToast('No tienes suficiente oro. Total: ' + total.toLocaleString() + ' GP. Tienes ' + oro.toLocaleString() + ' GP.', true); return; }
    const newOro = oro - total;
    const playerInv = Array.isArray(data.inventario) ? data.inventario.slice() : [];
    playerBibliotecaCart.forEach(e => {
        const it = inventario[e.inventarioIndex];
        if (!it) return;
        const entry = { name: it.name || it.title || 'Libro', price: it.price, effect: it.effect || '', rarity: 'común' };
        if (it.section) entry.section = it.section;
        if (it.tiempo) entry.tiempo = it.tiempo;
        if (it.nivel != null) entry.nivel = it.nivel;
        if (it.efLabel) entry.efLabel = it.efLabel;
        entry.shopTipo = (shop.tipo || 'biblioteca').toString().toLowerCase();
        playerInv.push(entry);
    });
    await db.collection('players').doc(user.id).update({ oro: newOro, inventario: playerInv });
    
    // Guardar transacción para cada libro alquilado
    for (const e of playerBibliotecaCart) {
        const it = inventario[e.inventarioIndex];
        if (!it) continue;
        const itemName = it.name || it.title || 'Libro';
        const itemPrice = it.price != null ? it.price : 0;
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: itemName,
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shop.nombre || 'Biblioteca',
            precio: itemPrice,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
    }
    const itemsBoughtBiblio = playerBibliotecaCart.map(e => {
        const it = inventario[e.inventarioIndex];
        return it ? { item: { name: it.name || it.title, effect: it.effect || it.desc, price: it.price }, qty: 1 } : null;
    }).filter(Boolean);
    if (itemsBoughtBiblio.length && typeof runAutomationRules === 'function') {
        await runAutomationRules(playerBibliotecaShopId, itemsBoughtBiblio, user.id, user.nombre || 'Jugador');
    }
    const receiptItems = playerBibliotecaCart.map(e => {
        const it = inventario[e.inventarioIndex];
        return { title: it.name || it.title || 'Libro', deposito: it.price != null ? it.price : 0 };
    });
    const receiptTotal = total;
    playerBibliotecaCart = [];
    const body = document.getElementById('player-biblioteca-body');
    const receipt = document.getElementById('player-biblioteca-receipt');
    if (body) body.style.display = 'none';
    if (receipt) {
        const shopName = (shop && shop.nombre) ? shop.nombre.toUpperCase() : 'BIBLIOTECA';
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        receipt.innerHTML = `
            <div class="player-biblio-receipt">
                <div class="player-biblio-receipt-header">
                    <div class="player-biblio-receipt-logo">📚</div>
                    <div class="player-biblio-receipt-title">${shopName}</div>
                    <div class="player-biblio-receipt-subtitle">Recibo de Depósito</div>
                </div>
                <div class="player-biblio-receipt-body">
                    ${receiptItems.map(item => `<div class="player-biblio-receipt-item"><span class="player-biblio-receipt-item-name">${item.title}</span><span class="player-biblio-receipt-item-price">${item.deposito} GP</span></div>`).join('')}
                </div>
                <div class="player-biblio-receipt-total"><span class="player-biblio-receipt-total-label">TOTAL:</span><span class="player-biblio-receipt-total-value">${receiptTotal} GP</span></div>
                <div class="player-biblio-receipt-footer">
                    <div class="player-biblio-receipt-warning"><span class="player-biblio-receipt-warning-icon">⚠️</span><span class="player-biblio-receipt-warning-text">CONSERVE ESTE RECIBO. Preséntelo para recuperar su depósito cuando devuelva los libros en buen estado.</span></div>
                    <div class="player-biblio-receipt-date">${dateStr} — ${timeStr}</div>
                    <div class="player-biblio-receipt-thanks">¡Que el conocimiento ilumine tu camino!</div>
                </div>
                <button type="button" class="btn player-biblio-receipt-close" onclick="closeModal('player-biblioteca-modal')">Cerrar</button>
            </div>`;
        receipt.style.display = 'block';
    }
    const oroEl = document.getElementById('player-biblioteca-oro-display');
    if (oroEl) oroEl.textContent = newOro.toLocaleString();
    showToast('Alquiler confirmado. ' + receiptTotal + ' GP descontados. Los libros se han añadido a tu inventario.');
}

// ==================== FORJA (estilo Grimm) ====================
const FORGE_TIER_NAMES = { 1: 'Nv. 1-5', 6: 'Nv. 6-10', 11: 'Nv. 11-15', 16: 'Nv. 16-20' };
const FORGE_TIER_CLASS = { 1: 'tier-1', 6: 'tier-6', 11: 'tier-11', 16: 'tier-16' };

function openPlayerForgeModal(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerForgeShopId = shopId;
    playerForgeCart = [];
    playerForgeLevel = 1;
    playerForgeTab = 'forge-shop';
    playerForgeSearchTerm = '';
    const bodyEl = document.getElementById('player-forge-body');
    const recEl = document.getElementById('player-forge-receipt');
    if (bodyEl) bodyEl.style.display = 'block';
    if (recEl) { recEl.style.display = 'none'; recEl.innerHTML = ''; }
    document.getElementById('player-forge-title').textContent = '⚔️ ' + (shop.nombre || 'Forja');
    const forgeSearchEl = document.getElementById('player-forge-search');
    if (forgeSearchEl) { forgeSearchEl.value = ''; }
    document.querySelectorAll('.player-forge-level').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.level) === 1);
        b.classList.toggle('btn-secondary', parseInt(b.dataset.level) !== 1);
    });
    document.querySelectorAll('.player-forge-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'forge-shop');
        b.classList.toggle('btn-secondary', b.dataset.tab !== 'forge-shop');
    });
    document.getElementById('player-forge-shop-grid').style.display = 'block';
    document.getElementById('player-forge-services-grid').style.display = 'none';
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            document.getElementById('player-forge-oro-display').textContent = oro.toLocaleString();
        });
    }
    renderPlayerForgeGrids();
    renderPlayerForgeCart();
    if (!window._playerForgeListeners) {
        window._playerForgeListeners = true;
        document.querySelectorAll('.player-forge-level').forEach(btn => {
            btn.addEventListener('click', () => {
                playerForgeLevel = parseInt(btn.dataset.level);
                document.querySelectorAll('.player-forge-level').forEach(b => { b.classList.remove('active'); b.classList.add('btn-secondary'); if (parseInt(b.dataset.level) === playerForgeLevel) { b.classList.add('active'); b.classList.remove('btn-secondary'); } });
                renderPlayerForgeGrids();
            });
        });
        document.querySelectorAll('.player-forge-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                playerForgeTab = btn.dataset.tab;
                document.querySelectorAll('.player-forge-tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === playerForgeTab); b.classList.toggle('btn-secondary', b.dataset.tab !== playerForgeTab); });
                document.getElementById('player-forge-shop-grid').style.display = playerForgeTab === 'forge-shop' ? 'block' : 'none';
                document.getElementById('player-forge-services-grid').style.display = playerForgeTab === 'forge-services' ? 'block' : 'none';
            });
        });
        if (forgeSearchEl) forgeSearchEl.addEventListener('input', debounce(function () { playerForgeSearchTerm = (forgeSearchEl.value || '').toLowerCase().trim(); renderPlayerForgeGrids(); }, 250));
    }
    openModal('player-forge-modal');
}

function renderPlayerForgeGrids() {
    const shop = playerShopsData.find(s => s.id === playerForgeShopId);
    if (!shop) return;
    const inv = shop.inventario || [];
    const tier = playerForgeLevel;
    const q = playerForgeSearchTerm;
    const match = (it) => !q || (it.name || '').toLowerCase().includes(q) || (getItemDesc(it) || '').toLowerCase().includes(q);
    let allTienda = inv.filter(it => (it.tipo || 'arma').toLowerCase() !== 'servicio' && (it.tier === tier || it.tier === parseInt(tier, 10)));
    let allServ = inv.filter(it => (it.tipo || '').toLowerCase() === 'servicio' && (it.tier === tier || it.tier === parseInt(tier, 10)));
    if (q) { allTienda = allTienda.filter(match); allServ = allServ.filter(match); }
    const shopGrid = document.getElementById('player-forge-shop-grid');
    const servGrid = document.getElementById('player-forge-services-grid');
    const tierClass = FORGE_TIER_CLASS[tier] || '';
    const tierName = FORGE_TIER_NAMES[tier] || '';
    const tipoLabel = (t) => {
        const tipo = (t || 'arma').toLowerCase();
        return tipo === 'armadura' ? '🛡️ Armadura' : (tipo === 'servicio' ? '🔧 Servicio' : '⚔️ Arma');
    };
    const renderCard = (it, invIdx) => {
        const isArmor = (it.tipo || '').toLowerCase() === 'armadura' || it.isArmor;
        const dmgHtml = isArmor && it.ac ? `<div class="player-forge-damage-info">🛡️ CA: ${it.ac}</div>` : (it.damage ? `<div class="player-forge-damage-info">⚔️ ${it.damage} ${it.damageType ? it.damageType : ''}</div>` : '');
        return `<div class="player-forge-card ${tierClass}">
            <div class="player-forge-card-name">${it.name || 'Item'}</div>
            <div class="player-forge-tipo-tier">${tipoLabel(it.tipo)} · ${tierName}</div>
            ${dmgHtml}
            <div class="player-forge-desc">${getItemDesc(it) || '—'}</div>
            <div class="player-forge-footer"><span class="player-forge-price">${(it.price||0).toLocaleString()} GP</span>
            <button type="button" class="btn btn-small" onclick="playerForgeAddToCart(${invIdx})">+ Añadir</button></div>
        </div>`;
    };
    const renderServiceCard = (it, invIdx) => {
        return `<div class="player-forge-card ${tierClass}">
            <div class="player-forge-card-name">${it.name || 'Item'}</div>
            <div class="player-forge-tipo-tier">${tipoLabel(it.tipo)} · ${tierName}</div>
            <div class="player-forge-desc">${getItemDesc(it) || '—'}</div>
            <div class="player-forge-footer"><span class="player-forge-price">${(it.price||0).toLocaleString()} GP</span>
            <button type="button" class="btn btn-small" onclick="playerForgeAddToCart(${invIdx})">+ Añadir</button></div>
        </div>`;
    };
    shopGrid.innerHTML = allTienda.length ? '<div class="player-forge-cat-title">⚔️ Armas / Armaduras</div>' + allTienda.map(it => renderCard(it, inv.indexOf(it))).join('') : '<p class="player-forge-no-results">No hay items de tienda para este nivel</p>';
    servGrid.innerHTML = allServ.length ? '<div class="player-forge-cat-title">🔧 Servicios</div>' + allServ.map(it => renderServiceCard(it, inv.indexOf(it))).join('') : '<p class="player-forge-no-results">No hay servicios para este nivel</p>';
}

function playerForgeAddToCart(inventarioIndex) {
    const shop = playerShopsData.find(s => s.id === playerForgeShopId);
    if (!shop || !shop.inventario || inventarioIndex < 0 || inventarioIndex >= shop.inventario.length) return;
    const it = shop.inventario[inventarioIndex];
    const entry = playerForgeCart.find(e => e.inventarioIndex === inventarioIndex);
    if (entry) entry.qty++;
    else playerForgeCart.push({ inventarioIndex, qty: 1, name: it.name, price: it.price || 0 });
    renderPlayerForgeCart();
}

function playerForgeUpdateQty(inventarioIndex, delta) {
    const entry = playerForgeCart.find(e => e.inventarioIndex === inventarioIndex);
    if (!entry) return;
    entry.qty += delta;
    if (entry.qty <= 0) playerForgeCart = playerForgeCart.filter(e => e.inventarioIndex !== inventarioIndex);
    renderPlayerForgeCart();
}

function renderPlayerForgeCart() {
    const el = document.getElementById('player-forge-cart-items');
    const totEl = document.getElementById('player-forge-cart-total');
    if (!el) return;
    if (!playerForgeCart.length) {
        el.innerHTML = '<div style="text-align:center; color:#8b7355; padding:24px;">Añade algo a tu carrito para continuar</div>';
        if (totEl) totEl.innerHTML = '';
        updateShopCartBadge('player-forge-cart-badge', 0);
        return;
    }
    const shop = playerShopsData.find(s => s.id === playerForgeShopId);
    const inventario = shop && shop.inventario ? shop.inventario : [];
    el.innerHTML = playerForgeCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const price = it ? (it.price || 0) : e.price;
        return `<div class="player-forge-cart-item">
            <div><div class="player-forge-cart-name">${e.name}</div><div class="player-forge-cart-price">${price} GP c/u</div></div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn btn-small" style="width:28px; height:28px; padding:0;" onclick="playerForgeUpdateQty(${e.inventarioIndex}, -1)">−</button>
                <span>${e.qty}</span>
                <button type="button" class="btn btn-small" style="width:28px; height:28px; padding:0;" onclick="playerForgeUpdateQty(${e.inventarioIndex}, 1)">+</button>
            </div>
        </div>`;
    }).join('');
    const subtotal = playerForgeCart.reduce((sum, e) => {
        const it = inventario[e.inventarioIndex];
        return sum + (it ? (it.price || 0) : e.price) * e.qty;
    }, 0);
    const totalItems = playerForgeCart.reduce((s, e) => s + e.qty, 0);
    const discount = totalItems >= 4 ? Math.floor(subtotal * 0.1) : 0;
    const total = subtotal - discount;
    totEl.innerHTML = '<div style="margin-top:16px; padding-top:12px; border-top:2px solid #8b4513;">' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span style="color:#8b7355;">Subtotal:</span><span style="color:#ffcc00;">' + subtotal.toLocaleString() + ' GP</span></div>' +
        (discount ? '<div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span style="color:#8b7355;">Desc. Grupo (4+):</span><span style="color:#2ecc71;">-' + discount.toLocaleString() + ' GP</span></div>' : '') +
        '<div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:1.2em;"><span style="color:#8b7355;">Total:</span><span style="color:#ffcc00; font-weight:bold;">' + total.toLocaleString() + ' GP</span></div>' +
        '<button type="button" class="btn" style="width:100%; margin-top:12px; background:linear-gradient(135deg,#ff6b35,#f7931e); color:#1a0a0a;" onclick="playerForgeCheckout()">Confirmar compra</button></div>';
    updateShopCartBadge('player-forge-cart-badge', playerForgeCart.length);
}

async function playerForgeCheckout() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) { showToast('Debes estar logueado como personaje', true); return; }
    const shop = playerShopsData.find(s => s.id === playerForgeShopId);
    if (!shop || !playerForgeCart.length) { showToast('Añade algo a tu carrito para continuar', true); return; }
    const inventario = shop.inventario || [];
    const subtotal = playerForgeCart.reduce((sum, e) => sum + (inventario[e.inventarioIndex] ? (inventario[e.inventarioIndex].price || 0) * e.qty : 0), 0);
    const totalItems = playerForgeCart.reduce((s, e) => s + e.qty, 0);
    const discount = totalItems >= 4 ? Math.floor(subtotal * 0.1) : 0;
    const total = subtotal - discount;
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) { showToast('No se encontró el personaje', true); return; }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < total) { showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP. Total: ' + total.toLocaleString() + ' GP.', true); return; }
    const newOro = oro - total;
    const receiptItems = playerForgeCart.map(e => {
        const it = inventario[e.inventarioIndex];
        const name = it ? (it.name || 'Item') : 'Item';
        const price = it ? (it.price != null ? it.price : 0) : 0;
        const qty = e.qty || 1;
        const line = qty > 1 ? (price * qty) + ' GP (' + qty + ' × ' + price + ')' : price + ' GP';
        return { name, line };
    });
    const extraLines = [];
    if (subtotal !== total) extraLines.push({ label: 'Subtotal:', value: subtotal.toLocaleString() + ' GP' });
    if (discount > 0) extraLines.push({ label: 'Descuento grupo (4+ ítems):', value: '-' + discount.toLocaleString() + ' GP' });
    const playerInv = Array.isArray(data.inventario) ? data.inventario.slice() : [];
    playerForgeCart.forEach(e => {
        const it = inventario[e.inventarioIndex];
        if (!it) return;
        const qty = e.qty || 1;
        const entry = { name: it.name, price: it.price, effect: it.effect || it.desc || '', rarity: 'común' };
        if (it.tier) entry.tier = it.tier;
        if (it.damage) entry.damage = it.damage;
        if (it.damageType) entry.damageType = it.damageType;
        if (it.ac) entry.ac = it.ac;
        if (it.tipo) entry.tipo = it.tipo;
        entry.shopTipo = (shop.tipo || 'herreria').toString().toLowerCase();
        if (qty > 1) entry.quantity = qty;
        playerInv.push(entry);
    });
    await db.collection('players').doc(user.id).update({ oro: newOro, inventario: playerInv });
    
    // Guardar transacción para cada item comprado
    for (const e of playerForgeCart) {
        const it = inventario[e.inventarioIndex];
        if (!it) continue;
        const itemName = it.name || 'Item';
        const itemPrice = (it.price != null ? it.price : 0) * (e.qty || 1);
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: (e.qty > 1 ? e.qty + '× ' : '') + itemName,
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shop.nombre || 'Forja',
            precio: itemPrice,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
    }
    const itemsBoughtForge = playerForgeCart.map(e => {
        const it = inventario[e.inventarioIndex];
        return it ? { item: { name: it.name, effect: it.effect || it.desc, price: it.price }, qty: e.qty || 1 } : null;
    }).filter(Boolean);
    if (itemsBoughtForge.length && typeof runAutomationRules === 'function') {
        await runAutomationRules(playerForgeShopId, itemsBoughtForge, user.id, user.nombre || 'Jugador');
    }
    playerForgeCart = [];
    renderPlayerForgeCart();
    document.getElementById('player-forge-oro-display').textContent = newOro.toLocaleString();
    const bodyEl = document.getElementById('player-forge-body');
    const recEl = document.getElementById('player-forge-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: shop.nombre || 'Forja',
            logo: '⚔️',
            subtitle: 'Recibo de pedido',
            items: receiptItems,
            extraLines,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: 'Que el metal sirva a tu causa.',
            modalId: 'player-forge-modal'
        });
        recEl.style.display = 'block';
    }
    showToast('Pedido confirmado. ' + total.toLocaleString() + ' GP descontados.');
}

function openPlayerShopCatalog(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    document.getElementById('player-shop-catalog-title').textContent = '📦 ' + (shop.nombre || 'Catálogo');
    const list = document.getElementById('player-shop-catalog-list');
    const items = shop.inventario || [];
    const rarityColors = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
    if (!items.length) {
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No hay items en esta tienda.</p>';
    } else {
        list.innerHTML = items.map(item => {
            const desc = getItemDesc(item) || '—';
            return `
            <div class="mini-card" style="margin-bottom:12px;">
                <div class="mini-card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span>${item.name || 'Item'}</span>
                    <span style="background:${rarityColors[item.rarity] || '#555'}; padding:2px 8px; border-radius:10px; font-size:0.75em; text-transform:uppercase;">${item.rarity || 'común'}</span>
                </div>
                <div class="mini-card-info" style="min-height:1.2em; color:#d4c4a8;">${desc}</div>
                <div style="color:#f1c40f; font-weight:600;">${item.price != null ? item.price + ' GP' : '—'}</div>
            </div>`;
        }).join('');
    }
    openModal('player-shop-catalog-modal');
}

function openPlayerPotionShop(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerPotionShopId = shopId;
    playerPotionProducts = (shop.inventario || []).map((it, i) => ({ ...it, index: i }));
    playerPotionCart = [];
    playerPotionFilter = 'all';
    playerPotionSearchTerm = '';
    const bodyEl = document.getElementById('player-potion-body');
    const recEl = document.getElementById('player-potion-receipt');
    if (bodyEl) bodyEl.style.display = 'block';
    if (recEl) { recEl.style.display = 'none'; recEl.innerHTML = ''; }
    document.getElementById('player-potion-shop-title').textContent = '🧪 ' + (shop.nombre || 'Tienda de Pociones');
    document.getElementById('player-potion-search').value = '';
    document.querySelectorAll('.player-potion-filter').forEach(b => { b.classList.toggle('active', b.dataset.rarity === 'all'); });
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            document.getElementById('player-potion-shop-oro-display').textContent = oro.toLocaleString();
        });
    }
    renderPlayerPotionProducts();
    renderPlayerPotionCart();
    if (!window._playerPotionListeners) {
        window._playerPotionListeners = true;
        document.getElementById('player-potion-search').addEventListener('input', debounce(function () {
            playerPotionSearchTerm = (document.getElementById('player-potion-search').value || '').toLowerCase();
            renderPlayerPotionProducts();
        }, 250));
        document.querySelectorAll('.player-potion-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                playerPotionFilter = btn.dataset.rarity;
                document.querySelectorAll('.player-potion-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPlayerPotionProducts();
            });
        });
    }
    openModal('player-potion-shop-modal');
}

function normalizeRarity(r) {
    const x = (r || 'común').toLowerCase();
    return x === 'infrecuente' ? 'inusual' : x;
}
function renderPlayerPotionProducts() {
    const el = document.getElementById('player-potion-products');
    if (!el) return;
    const filtered = playerPotionProducts.filter(p => {
        const r = normalizeRarity(p.rarity);
        const matchR = playerPotionFilter === 'all' || r === playerPotionFilter;
        const matchSearch = !playerPotionSearchTerm || (p.name || '').toLowerCase().includes(playerPotionSearchTerm) || (getItemDesc(p) || '').toLowerCase().includes(playerPotionSearchTerm);
        return matchR && matchSearch;
    });
    const rarityColors = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
    if (!filtered.length) {
        el.innerHTML = '<p style="color:#8b7355; text-align:center; padding:24px;">No hay pociones con esos filtros.</p>';
        return;
    }
    el.innerHTML = filtered.map(p => {
        const r = normalizeRarity(p.rarity);
        return `
        <div class="player-potion-product-card ${r}">
            <div class="player-potion-product-name">${p.name || 'Item'}</div>
            <span class="player-potion-product-rarity" style="background:${rarityColors[r] || '#555'}">${r}</span>
            <div class="player-potion-product-effect">${getItemDesc(p) || '—'}</div>
            ${(p.avg && p.avg.trim()) ? '<div style="color:#f1c40f; font-size:0.85em; margin-bottom:8px;">⚡ ' + p.avg + '</div>' : ''}
            <div class="player-potion-product-footer">
                <span style="color:#f1c40f; font-weight:bold;">${(p.price != null ? p.price : 0).toLocaleString()} GP</span>
                <button type="button" class="btn btn-small" onclick="addToPotionCart(${p.index})">+ Añadir</button>
            </div>
        </div>`;
    }).join('');
}

function addToPotionCart(index) {
    const existing = playerPotionCart.find(i => i.index === index);
    if (existing) existing.qty++; else playerPotionCart.push({ index, qty: 1 });
    renderPlayerPotionCart();
}

function updatePotionQty(index, delta) {
    const item = playerPotionCart.find(i => i.index === index);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) playerPotionCart = playerPotionCart.filter(i => i.index !== index);
    renderPlayerPotionCart();
}

function renderPlayerPotionCart() {
    const itemsEl = document.getElementById('player-potion-cart-items');
    const totalEl = document.getElementById('player-potion-cart-total');
    if (!itemsEl || !totalEl) return;
    if (!playerPotionCart.length) {
        itemsEl.innerHTML = '<div style="color:#8b7355; text-align:center; padding:20px;">Añade algo a tu carrito para continuar</div>';
        totalEl.innerHTML = '';
        updateShopCartBadge('player-potion-cart-badge', 0);
        return;
    }
    const products = (playerShopsData.find(s => s.id === playerPotionShopId) || {}).inventario || [];
    itemsEl.innerHTML = playerPotionCart.map(item => {
        const p = products[item.index];
        const name = (p && p.name) ? p.name : 'Item';
        const price = (p && p.price != null) ? p.price : 0;
        return `
        <div class="player-potion-cart-item">
            <div>
                <div class="player-potion-cart-item-name">${name}</div>
                <div class="player-potion-cart-item-price">${price} GP c/u</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn btn-small btn-secondary" style="width:28px; height:28px; padding:0; line-height:26px;" onclick="updatePotionQty(${item.index}, -1)">−</button>
                <span style="min-width:22px; text-align:center;">${item.qty}</span>
                <button type="button" class="btn btn-small btn-secondary" style="width:28px; height:28px; padding:0; line-height:26px;" onclick="updatePotionQty(${item.index}, 1)">+</button>
            </div>
        </div>`;
    }).join('');
    const subtotal = playerPotionCart.reduce((sum, item) => {
        const p = products[item.index];
        return sum + (p && p.price != null ? p.price : 0) * item.qty;
    }, 0);
    const commonQty = playerPotionCart.reduce((s, item) => {
        const p = products[item.index];
        return s + ((p && (p.rarity || '').toLowerCase() === 'común') ? item.qty : 0);
    }, 0);
    const discount = commonQty >= 3 ? Math.floor(subtotal * 0.1) : 0;
    const total = subtotal - discount;
    totalEl.innerHTML = `
        <div class="player-potion-cart-total-row">
            <span style="color:#a89878;">Subtotal:</span>
            <span style="color:#f1c40f;">${subtotal.toLocaleString()} GP</span>
        </div>
        ${discount > 0 ? `<div class="player-potion-cart-total-row"><span style="color:#a89878;">Descuento (3+ comunes):</span><span style="color:#2ecc71;">-${discount.toLocaleString()} GP</span></div>` : ''}
        <div class="player-potion-cart-total-row" style="font-weight:bold; margin-top:8px;">
            <span style="color:#d4af37;">Total:</span>
            <span style="color:#f1c40f;">${total.toLocaleString()} GP</span>
        </div>
        <button type="button" class="btn player-potion-checkout-btn" onclick="playerPotionCheckout()">Confirmar compra</button>
    `;
    const totalItems = playerPotionCart.reduce((s, item) => s + item.qty, 0);
    updateShopCartBadge('player-potion-cart-badge', totalItems);
}

async function playerPotionCheckout() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como personaje', true);
        return;
    }
    const shop = playerShopsData.find(s => s.id === playerPotionShopId);
    const products = (shop && shop.inventario) ? shop.inventario : [];
    const subtotal = playerPotionCart.reduce((sum, item) => {
        const p = products[item.index];
        return sum + (p && p.price != null ? p.price : 0) * item.qty;
    }, 0);
    const commonQty = playerPotionCart.reduce((s, item) => {
        const p = products[item.index];
        return s + ((p && (p.rarity || '').toLowerCase() === 'común') ? item.qty : 0);
    }, 0);
    const discount = commonQty >= 3 ? Math.floor(subtotal * 0.1) : 0;
    const total = subtotal - discount;
    if (!playerPotionCart.length || total <= 0) {
        showToast('Añade algo a tu carrito para continuar', true);
        return;
    }
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) {
        showToast('No se encontró el personaje', true);
        return;
    }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < total) {
        showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true);
        return;
    }
    const newOro = oro - total;
    const receiptItems = playerPotionCart.map(item => {
        const p = products[item.index];
        const name = p ? (p.name || 'Item') : 'Item';
        const price = p && p.price != null ? p.price : 0;
        const qty = item.qty || 1;
        const line = qty > 1 ? (price * qty) + ' GP (' + qty + ' × ' + price + ')' : price + ' GP';
        return { name, line };
    });
    const extraLines = [];
    if (subtotal !== total) extraLines.push({ label: 'Subtotal:', value: subtotal.toLocaleString() + ' GP' });
    if (discount > 0) extraLines.push({ label: 'Descuento (3+ comunes):', value: '-' + discount.toLocaleString() + ' GP' });
    const inventario = Array.isArray(data.inventario) ? data.inventario.slice() : [];
    for (const item of playerPotionCart) {
        const p = products[item.index];
        if (!p) continue;
        const qty = item.qty || 1;
        const entry = { name: p.name || 'Item', price: p.price, effect: p.effect || '', rarity: (p.rarity || 'común') };
        entry.shopTipo = (shop && shop.tipo ? shop.tipo : 'pociones').toString().toLowerCase();
        if (p.avg) entry.avg = p.avg;
        if (p.damage) entry.damage = p.damage;
        if (p.damageType) entry.damageType = p.damageType;
        if (qty > 1) entry.quantity = qty;
        inventario.push(entry);
    }
    await db.collection('players').doc(user.id).update({ oro: newOro, inventario });
    
    // Guardar transacción para cada poción comprada
    for (const item of playerPotionCart) {
        const p = products[item.index];
        if (!p) continue;
        const itemName = p.name || 'Item';
        const itemPrice = (p.price != null ? p.price : 0) * (item.qty || 1);
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: (item.qty > 1 ? item.qty + '× ' : '') + itemName,
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shop.nombre || 'Tienda de Pociones',
            precio: itemPrice,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
    }
    const itemsBoughtPotion = playerPotionCart.map(item => {
        const p = products[item.index];
        return p ? { item: { name: p.name, effect: p.effect, price: p.price }, qty: item.qty || 1 } : null;
    }).filter(Boolean);
    if (itemsBoughtPotion.length && typeof runAutomationRules === 'function') {
        await runAutomationRules(playerPotionShopId, itemsBoughtPotion, user.id, user.nombre || 'Jugador');
    }
    playerPotionCart = [];
    renderPlayerPotionCart();
    document.getElementById('player-potion-shop-oro-display').textContent = newOro.toLocaleString();
    const bodyEl = document.getElementById('player-potion-body');
    const recEl = document.getElementById('player-potion-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: (shop && shop.nombre) ? shop.nombre : 'Tienda de Pociones',
            logo: '🧪',
            subtitle: 'Recibo de compra',
            items: receiptItems,
            extraLines,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: '¡Gracias por tu compra! Que los elixires te protejan.',
            modalId: 'player-potion-shop-modal'
        });
        recEl.style.display = 'block';
    }
    showToast('Compra realizada. ' + total.toLocaleString() + ' GP descontados.');
}

// ==================== TABERNA (estilo Búho Sabio) ====================
function openPlayerTavernShop(shopId) {
    const shop = playerShopsData.find(s => s.id === shopId);
    if (!shop) return;
    playerTavernShopId = shopId;
    playerTavernCart = [];
    playerTavernSearchTerm = '';
    const bodyEl = document.getElementById('player-tavern-body');
    const recEl = document.getElementById('player-tavern-receipt');
    if (bodyEl) bodyEl.style.display = 'block';
    if (recEl) { recEl.style.display = 'none'; recEl.innerHTML = ''; }
    const vipPrice = (shop.entradaVipPrecio != null ? shop.entradaVipPrecio : 10);
    document.getElementById('player-tavern-title').textContent = '🍺 ' + (shop.nombre || 'Taberna');
    document.getElementById('player-tavern-vip-price').textContent = vipPrice + ' GP';
    const tavernSearchTop = document.getElementById('player-tavern-search');
    const tavernBebidasSearch = document.getElementById('player-tavern-bebidas-search');
    const tavernCocinaSearch = document.getElementById('player-tavern-cocina-search');
    if (tavernSearchTop) tavernSearchTop.value = '';
    if (tavernBebidasSearch) tavernBebidasSearch.value = '';
    if (tavernCocinaSearch) tavernCocinaSearch.value = '';
    document.querySelectorAll('.player-tavern-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'tavern-entrada');
        b.classList.toggle('btn-secondary', b.dataset.tab !== 'tavern-entrada');
    });
    document.querySelectorAll('.player-tavern-tab-content').forEach(el => { el.style.display = 'none'; });
    document.getElementById('tavern-entrada').style.display = 'block';
    if (bodyEl) bodyEl.classList.add('tavern-showing-entrada');
    const user = getCurrentUser();
    if (user && user.id) {
        getCurrentPlayerDoc().then(doc => {
            const oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
            document.getElementById('player-tavern-oro-display').textContent = oro.toLocaleString();
        });
    }
    renderTavernBebidas();
    renderTavernCocina();
    renderTavernCart();
    if (!window._playerTavernTabListeners) {
        window._playerTavernTabListeners = true;
        document.querySelectorAll('.player-tavern-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                document.querySelectorAll('.player-tavern-tab').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === tabId);
                    b.classList.toggle('btn-secondary', b.dataset.tab !== tabId);
                });
                document.querySelectorAll('.player-tavern-tab-content').forEach(el => { el.style.display = 'none'; });
                const content = document.getElementById(tabId);
                if (content) content.style.display = 'block';
                var tb = document.getElementById('player-tavern-body');
                if (tb) tb.classList.toggle('tavern-showing-entrada', tabId === 'tavern-entrada');
            });
        });
        /* Una sola búsqueda: la de arriba (#player-tavern-search). Las de Bebidas/Cocina están ocultas. */
        if (!window._playerTavernSearchListeners) {
            window._playerTavernSearchListeners = true;
            if (tavernSearchTop) {
                tavernSearchTop.addEventListener('input', debounce(function () {
                    playerTavernSearchTerm = (tavernSearchTop.value || '').toLowerCase().trim();
                    if (tavernBebidasSearch) tavernBebidasSearch.value = tavernSearchTop.value;
                    if (tavernCocinaSearch) tavernCocinaSearch.value = tavernSearchTop.value;
                    renderTavernBebidas();
                    renderTavernCocina();
                }, 250));
            }
        }
    }
    openModal('player-tavern-modal');
}

function playerTavernEnter(kind) {
    const shop = playerShopsData.find(s => s.id === playerTavernShopId);
    const vipPrice = (shop && shop.entradaVipPrecio != null) ? shop.entradaVipPrecio : 10;
    const name = kind === 'vip' ? 'Entrada VIP' : 'Entrada Normal';
    const price = kind === 'vip' ? vipPrice : 0;
    const id = kind === 'vip' ? 'entry-vip' : 'entry-free';
    const existing = playerTavernCart.find(i => i.id === id || (i.type === 'entry' && (kind === 'vip' ? i.price > 0 : i.price === 0)));
    if (existing) return;
    playerTavernCart = playerTavernCart.filter(i => i.type !== 'entry');
    playerTavernCart.unshift({ id, name, price, qty: 1, type: 'entry' });
    renderTavernCart();
    document.querySelectorAll('.player-tavern-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'tavern-bebidas');
        b.classList.toggle('btn-secondary', b.dataset.tab !== 'tavern-bebidas');
    });
    document.querySelectorAll('.player-tavern-tab-content').forEach(el => { el.style.display = 'none'; });
    document.getElementById('tavern-bebidas').style.display = 'block';
    var tb = document.getElementById('player-tavern-body');
    if (tb) tb.classList.remove('tavern-showing-entrada');
}

function getTavernItems() {
    const shop = playerShopsData.find(s => s.id === playerTavernShopId);
    const inv = (shop && shop.inventario) ? shop.inventario : [];
    const items = inv.map((it, i) => ({
        id: String(i), name: it.name || 'Item', price: it.price != null ? it.price : 0,
        type: (it.type || 'drink').toLowerCase(), categoria: (it.categoria || 'servir').toLowerCase(),
        effect: it.effect || '', desc: it.desc || it.effect || ''
    }));
    return items;
}

function renderTavernBebidas() {
    let items = getTavernItems().filter(it => it.type === 'drink');
    const q = playerTavernSearchTerm;
    if (q) items = items.filter(it => (it.name || '').toLowerCase().includes(q) || (it.effect || it.desc || '').toLowerCase().includes(q));
    const serve = items.filter(it => it.categoria !== 'llevar');
    const takeaway = items.filter(it => it.categoria === 'llevar');
    const grid = document.getElementById('player-tavern-bebidas-grid');
    const card = (it) => {
        const isLlevar = (it.categoria || 'servir').toLowerCase() === 'llevar';
        const typeLabel = isLlevar ? 'Para Llevar ✨' : 'Para Servir';
        const texto = getItemDesc(it) || '—';
        return `<div class="player-tavern-product-card ${isLlevar ? 'special' : 'drink'}">
            <div class="player-tavern-product-name">${it.name}</div>
            <span class="player-tavern-product-type">${typeLabel}</span>
            <div class="player-tavern-effect"><span>✨</span><span>${texto}</span></div>
            <div class="player-tavern-product-footer">
                <span class="player-tavern-product-price">${it.price} GP</span>
                <button type="button" class="btn btn-small" onclick="addToTavernCart('${it.id}')">+ Añadir</button>
            </div>
        </div>`;
    };
    let html = '<div class="player-tavern-category-title">🍺 Bebidas para Servir</div>';
    html += (serve.length ? serve.map(card).join('') : '<p style="color:#8b7355; padding:10px;">Sin bebidas para servir.</p>');
    html += '<div class="player-tavern-category-title">📦 Bebidas para Llevar (Con Efectos)</div>';
    html += (takeaway.length ? takeaway.map(card).join('') : '<p style="color:#8b7355; padding:10px;">Sin bebidas para llevar.</p>');
    grid.innerHTML = html;
}

function renderTavernCocina() {
    let items = getTavernItems().filter(it => it.type === 'food');
    const q = playerTavernSearchTerm;
    if (q) items = items.filter(it => (it.name || '').toLowerCase().includes(q) || (it.effect || it.desc || '').toLowerCase().includes(q));
    const serve = items.filter(it => it.categoria !== 'llevar');
    const takeaway = items.filter(it => it.categoria === 'llevar');
    const grid = document.getElementById('player-tavern-cocina-grid');
    const card = (it) => {
        const isLlevar = (it.categoria || 'servir').toLowerCase() === 'llevar';
        const typeLabel = isLlevar ? 'Para Llevar ✨' : 'Para Servir';
        const texto = getItemDesc(it) || '—';
        return `<div class="player-tavern-product-card ${isLlevar ? 'special' : 'food'}">
            <div class="player-tavern-product-name">${it.name}</div>
            <span class="player-tavern-product-type">${typeLabel}</span>
            <div class="player-tavern-effect"><span>✨</span><span>${texto}</span></div>
            <div class="player-tavern-product-footer">
                <span class="player-tavern-product-price">${it.price} GP</span>
                <button type="button" class="btn btn-small" onclick="addToTavernCart('${it.id}')">+ Añadir</button>
            </div>
        </div>`;
    };
    let html = '<div class="player-tavern-category-title">🍖 Comidas para Servir</div>';
    html += (serve.length ? serve.map(card).join('') : '<p style="color:#8b7355; padding:10px;">Sin comidas para servir.</p>');
    html += '<div class="player-tavern-category-title">📦 Comidas para Llevar (Con Efectos)</div>';
    html += (takeaway.length ? takeaway.map(card).join('') : '<p style="color:#8b7355; padding:10px;">Sin comidas para llevar.</p>');
    grid.innerHTML = html;
}

function addToTavernCart(id) {
    if (id === 'entry-free' || id === 'entry-vip') return;
    const items = getTavernItems();
    const it = items.find(i => i.id === id);
    if (!it) return;
    const existing = playerTavernCart.find(i => i.id === id);
    if (existing) existing.qty++; else playerTavernCart.push({ id, name: it.name, price: it.price, qty: 1 });
    renderTavernCart();
}

function updateTavernQty(id, delta) {
    const item = playerTavernCart.find(i => i.id === id);
    if (!item) return;
    if (item.type === 'entry') {
        if (delta < 0) playerTavernCart = playerTavernCart.filter(i => i.id !== id);
    } else {
        item.qty += delta;
        if (item.qty <= 0) playerTavernCart = playerTavernCart.filter(i => i.id !== id);
    }
    renderTavernCart();
}

function renderTavernCart() {
    const html = playerTavernCart.length ? playerTavernCart.map(item => {
        const isEntry = item.type === 'entry';
        const priceStr = item.price === 0 ? 'GRATIS' : item.price + ' GP';
        return `<div class="player-tavern-cart-item" ${isEntry ? 'style="background:rgba(244,208,63,0.15);border-color:#f4d03f;"' : ''}>
            <div><div class="player-tavern-cart-name">${item.name}</div><div class="player-tavern-cart-price">${priceStr}${item.qty > 1 ? ' × ' + item.qty : ''}</div></div>
            <div style="display:flex;align-items:center;gap:8px;">
                ${isEntry ? `<button type="button" class="btn btn-small btn-secondary" style="width:28px;height:28px;padding:0;" onclick="updateTavernQty('${item.id}', -1)">✕</button>` :
                `<button type="button" class="btn btn-small btn-secondary" style="width:28px;height:28px;padding:0;" onclick="updateTavernQty('${item.id}', -1)">−</button><span style="min-width:22px;text-align:center;">${item.qty}</span><button type="button" class="btn btn-small btn-secondary" style="width:28px;height:28px;padding:0;" onclick="updateTavernQty('${item.id}', 1)">+</button>`}
            </div>
        </div>`;
    }).join('') : '<div style="color:#8b7355;text-align:center;padding:24px;">Añade algo a tu carrito para continuar</div>';
    document.getElementById('player-tavern-cart-items').innerHTML = html;
    const cocinaEl = document.getElementById('player-tavern-cart-items-cocina');
    if (cocinaEl) cocinaEl.innerHTML = html;
    const total = playerTavernCart.reduce((s, i) => s + i.price * i.qty, 0);
    const totalHtml = playerTavernCart.length ? `
        <div class="player-tavern-cart-total">
            <div class="player-tavern-cart-total-row"><span style="color:#a89878;">Total:</span><span style="color:#f4d03f;font-weight:bold;">${total} GP</span></div>
            <button type="button" class="btn" style="width:100%;margin-top:12px;background:linear-gradient(135deg,#f4d03f,#d4a574);color:#1a1a1a;" onclick="playerTavernCheckout()">🍺 Pagar Cuenta</button>
        </div>` : '';
    document.getElementById('player-tavern-cart-total').innerHTML = totalHtml;
    if (document.getElementById('player-tavern-cart-total-cocina')) document.getElementById('player-tavern-cart-total-cocina').innerHTML = totalHtml;
    const totalQty = playerTavernCart.reduce((s, i) => s + i.qty, 0);
    updateShopCartBadge('player-tavern-bebidas-cart-badge', totalQty);
    updateShopCartBadge('player-tavern-cocina-cart-badge', totalQty);
}

async function playerTavernCheckout() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como personaje', true);
        return;
    }
    const total = playerTavernCart.reduce((s, i) => s + i.price * i.qty, 0);
    if (!playerTavernCart.length) {
        showToast('Añade algo a tu carrito para continuar', true);
        return;
    }
    const shop = playerShopsData.find(s => s.id === playerTavernShopId);
    const doc = await getCurrentPlayerDoc();
    if (!doc.exists) {
        showToast('No se encontró el personaje', true);
        return;
    }
    const data = doc.data();
    const oro = (data.oro != null ? data.oro : 0);
    if (oro < total) {
        showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true);
        return;
    }
    const receiptItems = playerTavernCart.map(row => {
        const name = row.name || 'Item';
        const line = row.qty > 1 ? (row.price * row.qty) + ' GP (' + row.qty + ' × ' + row.price + ')' : row.price + ' GP';
        return { name, line };
    });
    const inventario = Array.isArray(data.inventario) ? data.inventario.slice() : [];
    const items = getTavernItems();
    const shopTipo = (shop && shop.tipo ? shop.tipo : 'taberna').toString().toLowerCase();
    for (const row of playerTavernCart) {
        if (row.type === 'entry') {
            // Las entradas no se agregan al inventario
            continue;
        }
        const it = items.find(i => i.id === row.id);
        if (!it) continue;
        // Solo "Para Llevar" va al inventario; "Para Servir" se consume en la taberna
        const paraLlevar = (it.categoria || 'servir').toLowerCase() === 'llevar';
        if (!paraLlevar) continue;
        const qty = row.qty || 1;
        const entry = { name: it.name, price: it.price, effect: it.effect || '', rarity: 'común', shopTipo };
        if (qty > 1) entry.quantity = qty;
        inventario.push(entry);
    }
    const newOro = oro - total;
    await db.collection('players').doc(user.id).update({ oro: newOro, inventario });
    
    // Guardar transacción para cada item comprado en la taberna
    for (const row of playerTavernCart) {
        const it = items.find(i => i.id === row.id);
        if (!it) continue;
        const itemName = it.name || 'Item';
        const itemPrice = (it.price != null ? it.price : 0) * (row.qty || 1);
        const cityInfo = getCityInfoForShop(shop);
        await db.collection('transactions').add({
            tipo: 'compra',
            itemName: (row.qty > 1 ? row.qty + '× ' : '') + itemName,
            playerId: user.id,
            playerName: user.nombre || 'Jugador',
            shopName: shop.nombre || 'Taberna',
            precio: itemPrice,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            ...cityInfo
        });
    }
    
    playerTavernCart = [];
    renderTavernCart();
    document.getElementById('player-tavern-oro-display').textContent = newOro.toLocaleString();
    const bodyEl = document.getElementById('player-tavern-body');
    const recEl = document.getElementById('player-tavern-receipt');
    if (bodyEl) bodyEl.style.display = 'none';
    if (recEl) {
        recEl.innerHTML = buildShopReceiptHTML({
            shopName: (shop && shop.nombre) ? shop.nombre : 'Taberna',
            logo: '🍺',
            subtitle: 'Recibo de cuenta',
            items: receiptItems,
            totalLabel: 'TOTAL:',
            totalValue: total.toLocaleString() + ' GP',
            footerThanks: '¡Gracias! Que la taberna te acoja de nuevo.',
            modalId: 'player-tavern-modal'
        });
        recEl.style.display = 'block';
    }
    showToast('Cuenta pagada. ' + total + ' GP descontados.');
}

async function showDashboard() {
    const user = getCurrentUser();
    if (user && isDM()) {
        // FIRESTORE LISTENER FIX: al entrar DM solo cerrar player y tabs; no cerrar dm ni doble-cerrar
        if (typeof closeAll === 'function') {
            closeAll('player');
            closeAll('tab', 'transactions');
        }
        document.getElementById('player-view-container').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        document.getElementById('login-modal').classList.remove('active');
        window.__currentMode = 'dm';
        _playerDocCache = null;
        const dmNameEl = document.getElementById('dm-header-name');
        if (dmNameEl) dmNameEl.textContent = user.nombre || '—';
        if (typeof loadPlayers === 'function') loadPlayers();
        if (typeof loadWorld === 'function') {
            console.log('Llamando loadWorld desde showDashboard');
            loadWorld();
            // También intentar renderizar después de un delay por si acaso
            setTimeout(function() {
                if (typeof renderCities === 'function') {
                    console.log('Renderizando ciudades después del delay');
                    renderCities();
                }
            }, 1000);
        } else {
            console.error('loadWorld no está definido');
        }
        // loadTransactions() se llama solo al abrir la pestaña Historial (evita listener constante)
        if (typeof loadNotificationRecipients === 'function') loadNotificationRecipients();
        if (typeof loadDMNotifications === 'function') loadDMNotifications();
        if (typeof loadDMMissions === 'function') loadDMMissions();
        loadMapImage();
        if (typeof loadDMMapMarkers === 'function') loadDMMapMarkers();
        if (typeof loadRutasConocidas === 'function') loadRutasConocidas();
    } else {
        showLoginModal();
    }
}

/** Actualiza todas las listas del DM (ciudades, tiendas, NPCs, jugadores, misiones, notificaciones) con un clic. Solo tiene efecto si estás logueado como DM. */
function refreshDMData() {
    if (!isDM()) return;
    if (typeof showToast === 'function') showToast('Actualizando datos…', false);
    if (typeof loadWorld === 'function') loadWorld();
    if (typeof loadPlayers === 'function') loadPlayers();
    if (typeof loadDMMissions === 'function') loadDMMissions();
    if (typeof loadDMNotifications === 'function') loadDMNotifications();
    if (typeof renderCities === 'function') setTimeout(function () { renderCities(); }, 300);
    if (typeof showToast === 'function') setTimeout(function () { showToast('Datos del dashboard actualizados'); }, 800);
}


// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', function() {
    updateFooterTagline();
    document.addEventListener('click', function() {
        if (typeof closeAllInvActionsMenus === 'function') closeAllInvActionsMenus();
    });
    document.addEventListener('keydown', function (e) {
        var th = e.target && e.target.closest && e.target.closest('.inv-sortable-th');
        if (th && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            var col = th.getAttribute('data-sort');
            if (col && typeof setPlayerInventorySort === 'function') setPlayerInventorySort(col);
        }
    });
    if (checkAuth()) {
        if (isDM()) showDashboard();
        else if (isPlayer()) showPlayerView();
        else showLoginModal();
    } else {
        showLoginModal();
    }
});

// ==================== MENÚ HAMBURGUESA (MÓVIL) ====================
function toggleMobileNav(view) {
    const prefix = view === 'dm' ? 'dm' : 'player';
    const overlay = document.getElementById(prefix + '-nav-overlay');
    const wrapper = document.getElementById(prefix + '-nav-wrapper');
    if (!overlay || !wrapper) return;
    const isOpen = wrapper.classList.contains('open');
    if (isOpen) {
        closeMobileNav(view);
    } else {
        overlay.classList.add('open');
        wrapper.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        if (window.innerWidth <= 768) document.body.style.overflow = 'hidden';
    }
}

function closeMobileNav(view) {
    const prefix = view === 'dm' ? 'dm' : 'player';
    const overlay = document.getElementById(prefix + '-nav-overlay');
    const wrapper = document.getElementById(prefix + '-nav-wrapper');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
    }
    if (wrapper) wrapper.classList.remove('open');
    document.body.style.overflow = '';
}

// ==================== SUB-TABS CARTAS (JUGADOR) ====================
function switchPlayerNotificationsSubtab(subtabId) {
    const section = document.getElementById('player-notifications');
    if (!section) return;
    const subtabs = section.querySelectorAll('.player-notifications-subtab');
    const cartasDestinoPanel = document.getElementById('player-notifications-cartas-destino-panel');
    const cartasPanel = document.getElementById('player-notifications-cartas-panel');
    const historialPanel = document.getElementById('player-notifications-historial-panel');
    if (!subtabs.length) return;
    subtabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-subtab') === subtabId);
    });
    if (cartasDestinoPanel) cartasDestinoPanel.style.display = subtabId === 'cartas-destino' ? 'block' : 'none';
    if (cartasPanel) cartasPanel.style.display = subtabId === 'cartas' ? 'block' : 'none';
    if (historialPanel) historialPanel.style.display = subtabId === 'historial' ? 'block' : 'none';
    if (subtabId === 'cartas-destino' && typeof loadPlayerCartasDestino === 'function') loadPlayerCartasDestino();
    if (subtabId === 'cartas' && typeof loadPlayerNotifications === 'function') loadPlayerNotifications();
}

// Sub-tabs de Notificaciones (DM): Enviar | Historial | Mensajes automáticos
function switchDMNotificationsSubtab(subtabId) {
    const section = document.getElementById('notifications');
    if (!section) return;
    const subtabs = section.querySelectorAll('.dm-notifications-subtab');
    const enviarPanel = document.getElementById('dm-notifications-enviar-panel');
    const historialPanel = document.getElementById('dm-notifications-historial-panel');
    const automationPanel = document.getElementById('dm-notifications-automation-panel');
    if (!subtabs.length || !enviarPanel || !historialPanel || !automationPanel) return;
    subtabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-dm-subtab') === subtabId);
    });
    enviarPanel.style.display = subtabId === 'enviar' ? 'block' : 'none';
    historialPanel.style.display = subtabId === 'historial' ? 'block' : 'none';
    automationPanel.style.display = subtabId === 'automation' ? 'block' : 'none';
    if (subtabId === 'automation' && typeof loadAutomationRulesList === 'function') loadAutomationRulesList();
}

// ==================== NAVIGATION ====================
// Tabs por contenedor: solo se activan los del mismo panel (DM o Personaje)
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const container = tab.closest('#main-container') || tab.closest('#player-view-container');
        // En móvil, cerrar menú hamburguesa al tocar cualquier opción
        if (window.innerWidth <= 768 && container) {
            closeMobileNav(container.id === 'main-container' ? 'dm' : 'player');
        }
        // Si se hace clic en el tab de ciudades, forzar renderizado
        const tabName = tab.getAttribute('data-tab');
        if (tabName === 'cities' && typeof renderCities === 'function') {
            console.log('Tab de ciudades clickeado, forzando renderizado...');
            setTimeout(function() {
                renderCities();
            }, 100);
        }
        if (!tab.dataset.tab) return; // ej. botón "+ DM", Home, Battle Tracker
        if (!container) return;
        const nav = container.querySelector('.nav-tabs');
        const targetSection = document.getElementById(tab.dataset.tab);
        if (!nav || !targetSection || !container.contains(targetSection)) return;
        nav.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        targetSection.classList.add('active');
        
        // Historial: suscribir solo cuando la pestaña está visible; desuscribir al salir
        if (tab.dataset.tab === 'transactions') {
            if (typeof loadTransactions === 'function') loadTransactions();
        } else {
            if (typeof closeAll === 'function') closeAll('tab', 'transactions');
        }
        
        // Si se hace clic en el tab de ciudades, forzar renderizado
        if (tab.dataset.tab === 'cities' && typeof renderCities === 'function') {
            console.log('Tab de ciudades activado, forzando renderizado...');
            setTimeout(function() {
                renderCities();
            }, 200);
        }
        
        // Si se hace clic en el tab CDD & Correo, cargar Cartas del destino (panel por defecto) y notificaciones
        if (tab.dataset.tab === 'player-notifications') {
            if (typeof loadPlayerCartasDestino === 'function') loadPlayerCartasDestino();
            if (typeof loadPlayerNotifications === 'function') loadPlayerNotifications();
        }
        // Si se hace clic en el tab Home, cargar contenido de Mi Casa
        if (tab.dataset.tab === 'player-home' && typeof loadMiCasaContent === 'function') {
            loadMiCasaContent();
        }
        
        // Si se hace clic en el tab de notificaciones del DM, cargar destinatarios y historial
        if (tab.dataset.tab === 'notifications') {
            if (typeof loadNotificationRecipients === 'function') loadNotificationRecipients();
            if (typeof loadDMNotifications === 'function') loadDMNotifications();
        }
        // Si se hace clic en el tab de misiones del DM, cargar misiones
        if (tab.dataset.tab === 'missions') {
            if (typeof loadDMMissions === 'function') loadDMMissions();
        }
        // Si se hace clic en el tab de misiones del jugador, cargar misiones
        if (tab.dataset.tab === 'player-missions') {
            if (typeof loadPlayerMissions === 'function') loadPlayerMissions('activas');
        }
        // Si se hace clic en el tab Ciudades del jugador, siempre mostrar el listado (volver del directorio si estaba dentro de una ciudad)
        if (tab.dataset.tab === 'player-ciudades' && typeof playerDirectorioVolver === 'function') {
            playerDirectorioVolver();
        }
    });
});

// ==================== UTILITIES ====================
function showToast(msg, err = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' error' : '');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function openModal(id) { 
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        // Área de búsqueda colapsada al entrar
        el.querySelectorAll('.player-shop-search-wrap').forEach(function (wrap) {
            wrap.classList.remove('expanded');
            var btn = wrap.querySelector('.player-shop-search-toggle');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        // Carrito oculto al entrar (solo se muestra al pulsar "Ir al carrito")
        el.querySelectorAll('.player-shop-layout').forEach(function (layout) {
            layout.classList.remove('player-shop-cart-visible');
        });
        var posadaCart = document.getElementById('player-posada-cart');
        if (posadaCart) posadaCart.style.display = 'none';
        var posadaBody = document.getElementById('player-posada-body');
        if (posadaBody) posadaBody.classList.remove('view-cart');
    }
    document.body.style.overflow = 'hidden';
}

function toggleShopCart(btn) {
    var cartId = btn.getAttribute('data-cart-id');
    if (cartId === 'player-posada-cart') {
        var body = document.getElementById('player-posada-body');
        if (body) body.classList.toggle('view-cart');
        return;
    }
    var layout = btn.closest('.player-shop-layout');
    if (layout) layout.classList.toggle('player-shop-cart-visible');
}

function backToShop(btn) {
    if (btn.getAttribute('data-posada-back')) {
        var body = document.getElementById('player-posada-body');
        if (body) body.classList.remove('view-cart');
        var cartEl = document.getElementById('player-posada-cart');
        if (cartEl) cartEl.style.display = 'none';
        return;
    }
    var layout = btn.closest('.player-shop-layout');
    if (layout) layout.classList.remove('player-shop-cart-visible');
}

function updateShopCartBadge(badgeId, count) {
    var badge = document.getElementById(badgeId);
    if (!badge) return;
    badge.textContent = count;
    badge.setAttribute('data-count', String(count));
}

function closeModal(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
    // Restaurar scroll del body solo cuando no quede ningún modal abierto
    if (!document.querySelector('.modal-overlay.active')) {
        document.body.style.overflow = '';
    }
    
    // Limpiar campos específicos del modal de importación de tiendas
    if (id === 'import-shops-modal') {
        var cityIdEl = document.getElementById('import-shops-city-id');
        var fileInput = document.querySelector('#import-shops-modal input[type="file"]');
        if (cityIdEl) cityIdEl.value = '';
        if (fileInput) fileInput.value = '';
    }
}

// Cargar Cartas del destino del jugador (cartas que el DM le asignó) y mensaje general
function loadPlayerCartasDestino() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    const list = document.getElementById('player-cartas-destino-list');
    const mensajeEl = document.getElementById('player-cartas-destino-mensaje');
    const victoryEl = document.getElementById('player-cartas-destino-victory');
    if (!list) return;
    list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando cartas...</p>';
    if (mensajeEl) mensajeEl.innerHTML = '';
    if (victoryEl) victoryEl.style.display = 'none';
    getCurrentPlayerDoc().then(doc => {
        const data = doc.exists ? doc.data() : {};
        const cartas = Array.isArray(data.cartasDestino) ? data.cartasDestino : [];
        const completadas = Array.isArray(data.cartasDestinoCompletadas) ? data.cartasDestinoCompletadas : [];
        const mensaje = (data.mensajeGeneralCartasDestino || '').trim();
        if (mensajeEl) {
            if (mensaje) {
                const escaped = mensaje.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                mensajeEl.innerHTML = '<h3 class="player-cartas-destino-mensaje-title">La profecía de las cartas del destino</h3><div class="player-cartas-destino-mensaje-general-content">' + escaped.replace(/\n/g, '<br>') + '</div>';
                mensajeEl.style.display = 'block';
            } else {
                mensajeEl.innerHTML = '';
                mensajeEl.style.display = 'none';
            }
        }
        if (!cartas.length) {
            list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:40px 20px; font-style:italic;">El DM aún no te ha asignado cartas del destino.</p>';
            return;
        }
        const firstFourChecked = cartas.length >= 4 && [0, 1, 2, 3].every(idx => completadas.indexOf(idx) !== -1);
        if (victoryEl) victoryEl.style.display = firstFourChecked ? 'block' : 'none';

        list.innerHTML = cartas.map((c, i) => {
            const titulo = c.titulo || ('Carta ' + (i + 1));
            const checked = completadas.indexOf(i) !== -1;
            let imgHtml;
            if (c.imagenUrl) {
                const q = c.imagenUrl.replace(/"/g, '&quot;');
                imgHtml = `<img src="${q}" alt="" class="player-carta-destino-img" onerror="this.style.display='none'; var ph=this.parentElement.querySelector('.player-carta-destino-placeholder'); if(ph) ph.style.display='flex';"><div class="player-carta-destino-placeholder" style="display:none;">🃏</div>`;
            } else {
                imgHtml = '<div class="player-carta-destino-placeholder">🃏</div>';
            }
            return `<div class="player-carta-destino-card" data-index="${i}" role="button" tabindex="0" aria-pressed="${checked}" aria-label="Carta: ${titulo.replace(/"/g, '&quot;')}. ${checked ? 'Cumplida' : 'Pendiente'}. Clic para marcar o desmarcar." onclick="handleCartasDestinoCardClick(event, ${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleCartasDestinoCardClick(event, ${i});}">
                <div class="player-carta-destino-img-wrap">${imgHtml}</div>
                <div class="player-carta-destino-info">
                    <h4 class="player-carta-destino-titulo">${titulo.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h4>
                    <label class="player-carta-destino-check-wrap" title="Cumplida" onclick="event.stopPropagation();">
                        <input type="checkbox" class="player-carta-destino-check" data-index="${i}" ${checked ? 'checked' : ''} onchange="toggleCartasDestinoCompletada(${i})" aria-label="Cumplida">
                    </label>
                </div>
            </div>`;
        }).join('');
    }).catch(() => {
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Error al cargar cartas.</p>';
        if (mensajeEl) mensajeEl.innerHTML = '';
        if (victoryEl) victoryEl.style.display = 'none';
    });
}

// Clic en la carta (no en el checkbox): toggle cumplida. Evita doble toggle si se hace clic en el checkbox.
window.handleCartasDestinoCardClick = function (event, index) {
    if (event.target.closest('.player-carta-destino-check-wrap') || event.target.closest('input[type=checkbox]')) return;
    event.preventDefault();
    toggleCartasDestinoCompletada(index);
};

// Toggle "cumplida" en una carta del destino y persistir; si las 4 primeras están chequeadas, se muestra el mensaje de victoria
function toggleCartasDestinoCompletada(index) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    const ref = db.collection('players').doc(user.id);
    getCurrentPlayerDoc().then(doc => {
        const data = doc.exists ? doc.data() : {};
        const completadas = Array.isArray(data.cartasDestinoCompletadas) ? data.cartasDestinoCompletadas.slice() : [];
        const pos = completadas.indexOf(index);
        if (pos === -1) completadas.push(index);
        else completadas.splice(pos, 1);
        completadas.sort((a, b) => a - b);
        return ref.update({ cartasDestinoCompletadas: completadas });
    }).then(() => {
        loadPlayerCartasDestino();
    }).catch(() => {
        showToast('No se pudo guardar el estado de la carta', true);
    });
}

// Carga el contenido de Mi Casa (usado al abrir la pestaña Home o desde el directorio)
function loadMiCasaContent() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como aventurero', true);
        return Promise.reject();
    }
    return getCurrentPlayerDoc().then(doc => {
        const playerData = doc.exists ? doc.data() : {};
        const casaInfo = playerData.casa || {};
        const imagenContainer = document.getElementById('mi-casa-imagen-container');
        if (!imagenContainer) return;
        if (casaInfo.imagenUrl) {
            imagenContainer.innerHTML = `<img src="${casaInfo.imagenUrl.replace(/"/g, '&quot;')}" alt="${(casaInfo.nombre || 'Hogar').replace(/"/g, '&quot;')}" style="width:100%; height:auto; max-height:600px; object-fit:cover; display:block;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div id=\\'mi-casa-imagen-placeholder\\' style=\\'padding:80px; color:#8b7355; font-size:4em; text-align:center;\\'><div style=\\'font-size:0.3em; margin-top:20px; color:#6b5d4a;\\'>Error al cargar la imagen</div></div>';"><div id="mi-casa-imagen-placeholder" style="display:none;"></div>`;
        } else {
            imagenContainer.innerHTML = '<div id="mi-casa-imagen-placeholder" style="padding:80px; color:#8b7355; font-size:4em; text-align:center;"><div style="font-size:0.3em; margin-top:20px; color:#6b5d4a;">El DM aún no ha agregado una imagen</div></div>';
        }
        const nombreEl = document.getElementById('mi-casa-nombre-display');
        if (nombreEl) nombreEl.textContent = casaInfo.nombre || 'Hogar';
        const descEl = document.getElementById('mi-casa-descripcion-display');
        if (descEl) descEl.textContent = casaInfo.descripcion || 'El DM aún no ha agregado una descripción para tu casa.';
        const ubicacionEl = document.getElementById('mi-casa-ubicacion-display');
        if (ubicacionEl) ubicacionEl.textContent = casaInfo.ubicacion || 'No especificada';
        const notasDmEl = document.getElementById('mi-casa-notas-dm-display');
        if (notasDmEl) notasDmEl.textContent = casaInfo.notas || 'No hay notas del DM.';
        const notasPreviewEl = document.getElementById('mi-casa-notas-preview');
        if (notasPreviewEl) notasPreviewEl.textContent = casaInfo.notasPersonales || '';
    }).catch(err => {
        console.error('Error cargando información de la casa:', err);
        showToast('Error al cargar información de tu casa', true);
    });
}

// Ir a la pestaña Home y cargar contenido (desde directorio u otro lugar)
window.openMiCasaModal = function() {
    if (!getCurrentUser() || !isPlayer()) {
        showToast('Debes estar logueado como aventurero', true);
        return;
    }
    const container = document.getElementById('player-view-container');
    if (!container) return;
    const nav = container.querySelector('.nav-tabs');
    const homeTab = container.querySelector('.nav-tab[data-tab="player-home"]');
    const homeSection = document.getElementById('player-home');
    if (nav && homeTab && homeSection) {
        nav.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        homeTab.classList.add('active');
        homeSection.classList.add('active');
        loadMiCasaContent();
    }
}

window.openMiCasaNotesModal = function() {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const inputEl = document.getElementById('player-mi-casa-notes-modal-input');
    if (!inputEl) return;
    inputEl.value = '';
    getCurrentPlayerDoc()
        .then(doc => {
            const data = doc.exists ? doc.data() : {};
            const casa = data.casa || {};
            const text = (casa.notasPersonales || '').trim();
            inputEl.value = text;
        })
        .catch(() => {})
        .finally(() => openModal('player-mi-casa-notes-modal'));
}

window.saveMiCasaNotesFromModal = function() {
    const user = getCurrentUser();
    if (!user || !user.id || (user.type !== 'player' && user.tipo !== 'player')) return;
    const inputEl = document.getElementById('player-mi-casa-notes-modal-input');
    if (!inputEl) return;
    const notasPersonales = inputEl.value.trim();
    getCurrentPlayerDoc().then(doc => {
        const playerData = doc.exists ? doc.data() : {};
        const casaExistente = playerData.casa || {};
        const casaData = {
            ...casaExistente,
            notasPersonales: notasPersonales
        };
        return db.collection('players').doc(user.id).update({
            casa: casaData,
            casaUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).then(() => {
        showToast('Notas guardadas');
        closeModal('player-mi-casa-notes-modal');
        const previewEl = document.getElementById('mi-casa-notas-preview');
        if (previewEl) previewEl.textContent = notasPersonales;
    }).catch(err => {
        console.error('Error guardando notas:', err);
        showToast('Error al guardar tus notas', true);
    });
}

function togglePlayersCard() {
    document.getElementById('players-card').classList.toggle('expanded');
}

// FIXED: DM not closed routinely on player entry
// FIXED: showDashboard cleanup order and no double-close
