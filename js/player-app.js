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

// ==================== GLOBAL ====================
let currentPlayerId = null;

// ==================== UTILITIES ====================
function showToast(msg, err = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' error' : '');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ==================== PLAYER LOGIN ====================
async function playerLogin() {
    const nombre = document.getElementById('player-login-nombre').value.trim();
    const pin = document.getElementById('player-login-pin').value.trim();

    if (!nombre || !pin) {
        showToast('Nombre y PIN requeridos', true);
        return;
    }

    try {
        const snap = await db.collection('players')
            .where('nombre', '==', nombre)
            .where('pin', '==', pin)
            .limit(1)
            .get();

        if (snap.empty) {
            showToast('Nombre o PIN incorrecto', true);
            return;
        }

        const doc = snap.docs[0];
        currentPlayerId = doc.id;
        sessionStorage.setItem('playerId', currentPlayerId);

        showToast('¡Bienvenido, ' + nombre + '!');
        document.getElementById('player-app').style.display = 'block';
        document.getElementById('player-login-modal').classList.remove('active');
        document.getElementById('player-login-nombre').value = '';
        document.getElementById('player-login-pin').value = '';

        loadPlayerData();
        subscribeToPlayer();
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

// ==================== PLAYER LOGOUT ====================
// FIRESTORE LISTENER FIX: close player doc listener on logout
function playerLogout() {
    if (typeof _playerDocUnsubscribe === 'function') {
        _playerDocUnsubscribe();
        _playerDocUnsubscribe = null;
    }
    currentPlayerId = null;
    sessionStorage.removeItem('playerId');
    showToast('Sesión cerrada');
    document.getElementById('player-app').style.display = 'none';
    document.getElementById('player-login-modal').classList.add('active');
}

// ==================== LOAD & DISPLAY PLAYER ====================
function loadPlayerData() {
    if (!currentPlayerId) return;
    db.collection('players').doc(currentPlayerId).get().then(doc => {
        if (doc.exists) renderPlayer(doc.data());
    });
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
        if (!map[key]) map[key] = { item, indices: [] };
        map[key].indices.push(i);
    });
    return Object.values(map).map(g => ({ item: g.item, count: g.indices.length, indices: g.indices }));
}

function renderPlayer(data) {
    document.getElementById('player-name').textContent = data.nombre || '—';
    document.getElementById('player-class-level').textContent = (data.clase || '—') + ' • Nivel ' + (data.nivel || 1);
    document.getElementById('player-oro').textContent = (data.oro != null ? data.oro : 0).toLocaleString() + ' GP';

    const list = document.getElementById('player-inventory-list');
    const items = data.inventario || [];
    const rarityColors = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
    if (items.length === 0) {
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Sin items</p>';
        return;
    }
    const groups = groupInventoryItems(items);
    const rows = groups.map(g => {
        const it = g.item;
        const idxUse = g.indices[0];
        const idxStr = g.indices.join(',');
        const r = rarityColors[it.rarity] || '#555';
        const tipoLabel = getTipoLabel(it);
        const isMultiple = g.count > 1;
        const sellControl = isMultiple
            ? `<input type="number" min="1" max="${g.count}" value="1" class="inv-sell-qty" data-indices="${idxStr}" data-max="${g.count}" aria-label="Unidades a vender" title="Unidades a vender">`
            : '';
        const sellBtn = isMultiple
            ? `<button type="button" class="btn btn-secondary btn-small" onclick="playerSellItemStack('${idxStr}', this)" title="Vender las unidades indicadas (75% c/u)">Vender</button>`
            : `<button type="button" class="btn btn-secondary btn-small" onclick="playerSellItemStack('${idxStr}', this)" title="Vender (75% del valor)">Vender</button>`;
        return `<tr class="inventory-row">
            <td><span style="color:#d4c4a8; font-weight:600;">${it.name || 'Item'}</span></td>
            <td><span class="inv-tipo">${tipoLabel}</span></td>
            <td><span style="color:#8b7355; font-size:0.9em;">${it.effect || '—'}</span></td>
            <td><span style="color:#f1c40f;">${it.price != null ? it.price + ' GP' : '—'}</span></td>
            <td><span class="rarity-badge" style="background:${r}; color:#fff;">${it.rarity || 'común'}</span></td>
            <td class="inv-qty">${g.count}</td>
            <td class="inv-actions">
                <button type="button" class="btn btn-small" onclick="playerUseItem(${idxUse})" title="Usar 1">Utilizar</button>
                ${sellControl}
                ${sellBtn}
            </td>
        </tr>`;
    }).join('');
    list.innerHTML = `
        <div class="inventory-table-wrap">
            <table class="inventory-table">
                <thead><tr>
                    <th>Item</th><th>Tipo</th><th>Efecto</th><th>Precio</th><th>Rareza</th><th>Cantidad</th><th>Acciones</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ==================== USE & SELL (inventario) ====================
async function playerUseItem(index) {
    if (!currentPlayerId || index == null) return;
    try {
        const ref = db.collection('players').doc(currentPlayerId);
        const snap = await ref.get();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        if (index < 0 || index >= inventario.length) { showToast('Ítem no válido', true); return; }
        const item = inventario[index];
        inventario.splice(index, 1);
        await ref.update({ inventario });
        await db.collection('transactions').add({
            tipo: 'uso',
            itemName: item.name || 'Item',
            playerName: data.nombre || 'Desconocido',
            playerId: currentPlayerId,
            shopName: '—',
            precio: 0,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Item usado y eliminado del inventario');
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

async function playerSellItem(index) {
    if (!currentPlayerId || index == null) return;
    try {
        const ref = db.collection('players').doc(currentPlayerId);
        const snap = await ref.get();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        if (index < 0 || index >= inventario.length) { showToast('Ítem no válido', true); return; }
        const item = inventario[index];
        const precioCompra = item.price || 0;
        const valorVenta = Math.floor(precioCompra * 0.75);
        const msg = '¿Vender «' + (item.name || 'Item') + '» por ' + valorVenta + ' GP? (75% del valor de compra)';
        if (!confirm(msg)) return;
        const nuevoOro = (data.oro != null ? data.oro : 0) + valorVenta;
        inventario.splice(index, 1);
        await ref.update({ oro: nuevoOro, inventario });
        await db.collection('transactions').add({
            tipo: 'venta',
            itemName: item.name || 'Item',
            playerName: data.nombre || 'Desconocido',
            playerId: currentPlayerId,
            shopName: 'Venta',
            precio: valorVenta,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Vendido por ' + valorVenta + ' GP');
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

async function playerSellItemStack(indicesStr, qtyOrButton) {
    if (!currentPlayerId || !indicesStr) return;
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
        const ref = db.collection('players').doc(currentPlayerId);
        const snap = await ref.get();
        if (!snap.exists) { showToast('Personaje no encontrado', true); return; }
        const data = snap.data();
        const inventario = (data.inventario || []).slice();
        const set = new Set(indices);
        let totalVenta = 0;
        const firstName = (inventario[indices[0]] || {}).name || 'Item';
        indices.forEach(i => {
            if (i >= 0 && i < inventario.length) totalVenta += Math.floor((inventario[i].price || 0) * 0.75);
        });
        const label = indices.length > 1 ? indices.length + '× ' + firstName : firstName;
        const msg = '¿Vender ' + label + ' por ' + totalVenta + ' GP en total? (75% del valor de compra por unidad)';
        if (!confirm(msg)) return;
        const nuevoInv = inventario.filter((_, i) => !set.has(i));
        const nuevoOro = (data.oro != null ? data.oro : 0) + totalVenta;
        await ref.update({ oro: nuevoOro, inventario: nuevoInv });
        await db.collection('transactions').add({
            tipo: 'venta',
            itemName: indices.length > 1 ? indices.length + '× ' + firstName : firstName,
            playerName: data.nombre || 'Desconocido',
            playerId: currentPlayerId,
            shopName: 'Venta',
            precio: totalVenta,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Vendido por ' + totalVenta + ' GP');
    } catch (e) {
        showToast('Error: ' + e.message, true);
    }
}

// ==================== LIVE UPDATES ====================
// FIRESTORE LISTENER FIX
var _playerDocUnsubscribe = null;
function subscribeToPlayer() {
    if (!currentPlayerId) return;
    if (typeof _playerDocUnsubscribe === 'function') {
        _playerDocUnsubscribe();
        _playerDocUnsubscribe = null;
    }
    _playerDocUnsubscribe = db.collection('players').doc(currentPlayerId).onSnapshot(doc => {
        if (doc.exists) renderPlayer(doc.data());
    });
}

// ==================== INIT ====================
(function() {
    const saved = sessionStorage.getItem('playerId');
    if (saved) {
        currentPlayerId = saved;
        document.getElementById('player-app').style.display = 'block';
        document.getElementById('player-login-modal').classList.remove('active');
        loadPlayerData();
        subscribeToPlayer();
    }
})();
