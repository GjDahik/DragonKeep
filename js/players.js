// ==================== PLAYERS ====================
/** Jugadores visibles para transacciones, notificaciones y asignación (DM). undefined/true = visible, false = oculto */
function getVisiblePlayers() {
    const list = window.playersData || [];
    return list.filter(p => p.visible !== false);
}
if (typeof window !== 'undefined') window.getVisiblePlayers = getVisiblePlayers;

// OPTIMIZACIÓN READS: get() al mostrar dashboard, sin listener permanente
function loadPlayers() {
    db.collection('players').limit(200).get()
        .then(snap => {
            playersData = [];
            snap.forEach(doc => playersData.push({ id: doc.id, ...doc.data() }));
            window.playersData = playersData;
            renderPlayers();
        })
        .catch(err => {
            console.error('Error cargando jugadores:', err);
            playersData = [];
            renderPlayers();
        });
}

function renderPlayers() {
    const container = document.getElementById('players-list');
    document.getElementById('players-count').textContent = playersData.length + ' jugador' + (playersData.length !== 1 ? 'es' : '');
    
    if (!playersData.length) {
        container.innerHTML = '<p style="color:#a89a8c;padding:10px;">No hay jugadores. ¡Crea el primero!</p>';
        return;
    }
    container.innerHTML = '';
    const sorted = playersData.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    sorted.forEach(p => {
        const bancoBalance = (p.bancoBalance != null ? p.bancoBalance : 0);
        const nombreEsc = (p.nombre || '').replace(/'/g, "\\'");
        const isVisible = p.visible !== false;
        const visibilityTitle = isVisible ? 'Visible en listas y transacciones (clic para ocultar)' : 'Oculto en listas y transacciones (clic para mostrar)';
        const visibilityLabel = isVisible ? '👁 Visible' : '🙈 Oculto';
        const visibilityClass = isVisible ? 'player-visibility-visible' : 'player-visibility-hidden';
        container.innerHTML += `
            <div class="mini-card ${isVisible ? '' : 'mini-card-player-hidden'}">
                <div class="mini-card-header-row">
                    <div class="mini-card-title">⚔️ ${p.nombre}</div>
                    <button type="button" class="btn btn-small btn-danger mini-card-delete-btn" onclick="deletePlayer('${p.id}', '${nombreEsc}')" title="Eliminar jugador">🗑️</button>
                </div>
                <div class="mini-card-info">${p.clase} • Nivel ${p.nivel}</div>
                <div class="mini-card-info gold-value">💰 ${p.oro.toLocaleString()} GP</div>
                <div class="mini-card-info gold-value" style="color:#5a8a5a;">🏦 ${bancoBalance.toLocaleString()} GP</div>
                <div class="mini-card-info">🔐 PIN: ${p.pin}</div>
                <div class="mini-card-info">🎒 Items: ${(p.inventario || []).length}</div>
                <div style="margin-top:10px;font-size:0.85em;color:#a89a8c;">${p.notas || 'Sin notas'}</div>
                <div class="mini-card-actions" style="margin-top:10px;">
                    <button type="button" class="btn btn-small ${visibilityClass}" onclick="togglePlayerVisibility('${p.id}')" title="${visibilityTitle}">${visibilityLabel}</button>
                    <button class="btn btn-small" onclick="openGoldModal('${p.id}', '${p.nombre}', ${p.oro})">💰</button>
                    <button class="btn btn-small" onclick="openBancoModal('${p.id}', '${p.nombre}', ${bancoBalance})" style="background:linear-gradient(180deg, #5a8a5a 0%, #4a7a4a 100%);">🏦</button>
                    <button class="btn btn-small" onclick="openCartasDestinoModal('${p.id}', '${nombreEsc}')" style="background:linear-gradient(180deg, #6b4a6b 0%, #4a3a4a 100%);" title="Cartas del destino">🃏</button>
                    <button class="btn btn-small" onclick="openPlayerCasaModal('${p.id}', '${nombreEsc}')" style="background:linear-gradient(180deg, #8b5a2b 0%, #6b4a1b 100%);">🏠</button>
                    <button class="btn btn-small btn-secondary" onclick="editPlayer('${p.id}')">✏️</button>
                </div>
            </div>`;
    });
}

function openPlayerModal() {
    document.getElementById('player-id').value = '';
    document.getElementById('player-nombre').value = '';
    document.getElementById('player-clase').value = 'Guerrero';
    document.getElementById('player-nivel').value = 1;
    document.getElementById('player-oro').value = 100;
    document.getElementById('player-pin').value = '';
    document.getElementById('player-notas').value = '';
    document.getElementById('player-modal-title').textContent = '✨ Nuevo Jugador';
    openModal('player-modal');
}

function editPlayer(id) {
    db.collection('players').doc(id).get().then(doc => {
        const p = doc.data();
        document.getElementById('player-id').value = id;
        document.getElementById('player-nombre').value = p.nombre;
        document.getElementById('player-clase').value = p.clase;
        document.getElementById('player-nivel').value = p.nivel;
        document.getElementById('player-oro').value = p.oro;
        document.getElementById('player-pin').value = p.pin;
        document.getElementById('player-notas').value = p.notas || '';
        document.getElementById('player-modal-title').textContent = '✏️ Editar Jugador';
        openModal('player-modal');
    });
}

function savePlayer() {
    const id = document.getElementById('player-id').value;
    const data = {
        nombre: document.getElementById('player-nombre').value,
        clase: document.getElementById('player-clase').value,
        nivel: parseInt(document.getElementById('player-nivel').value),
        oro: parseInt(document.getElementById('player-oro').value),
        pin: document.getElementById('player-pin').value,
        notas: document.getElementById('player-notas').value
    };
    if (!id) {
        data.inventario = [];
        data.bancoBalance = 0; // Inicializar balance del banco en 0 para nuevos jugadores
        data.visible = true; // Visible en listas y transacciones por defecto
    }
    if (!data.nombre || !data.pin) { showToast('Nombre y PIN requeridos', true); return; }
    (id ? db.collection('players').doc(id).update(data) : db.collection('players').add(data))
        .then(() => { showToast(id ? 'Jugador actualizado' : 'Jugador creado'); closeModal('player-modal'); loadPlayers(); })
        .catch(e => showToast('Error: ' + e.message, true));
}

function deletePlayer(id, nombre) {
    if (confirm(`¿Eliminar a ${nombre}?`))
        db.collection('players').doc(id).delete().then(() => { showToast('Jugador eliminado'); loadPlayers(); });
}

/** Alternar visibilidad del jugador en listas/transacciones/notificaciones (solo DM). */
function togglePlayerVisibility(playerId) {
    const p = playersData.find(x => x.id === playerId);
    if (!p) return;
    const nextVisible = p.visible === false;
    db.collection('players').doc(playerId).update({ visible: nextVisible })
        .then(() => {
            showToast(nextVisible ? 'Jugador visible en listas y transacciones' : 'Jugador oculto de listas y transacciones');
            loadPlayers();
            if (typeof loadNotificationRecipients === 'function') loadNotificationRecipients();
        })
        .catch(e => showToast('Error: ' + e.message, true));
}

function openGoldModal(id, nombre, oro) {
    document.getElementById('gold-player-id').value = id;
    document.getElementById('gold-player-name').textContent = nombre;
    document.getElementById('gold-current').textContent = oro.toLocaleString() + ' GP';
    document.getElementById('gold-amount').value = 0;
    const player = playersData.find(p => p.id === id);
    document.getElementById('gold-modal-items-count').textContent = (player?.inventario || []).length;
    openModal('gold-modal');
}

function adjustGold() {
    const id = document.getElementById('gold-player-id').value;
    const op = document.getElementById('gold-operation').value;
    const amt = parseInt(document.getElementById('gold-amount').value);
    db.collection('players').doc(id).get().then(doc => {
        let g = doc.data().oro;
        if (op === 'add') g += amt;
        else if (op === 'subtract') g = Math.max(0, g - amt);
        else g = amt;
        return db.collection('players').doc(id).update({ oro: g });
    }).then(() => { showToast('Oro actualizado'); closeModal('gold-modal'); });
}

function openBancoModal(id, nombre, bancoBalance) {
    document.getElementById('banco-player-id').value = id;
    document.getElementById('banco-player-name').textContent = nombre;
    document.getElementById('banco-current').textContent = bancoBalance.toLocaleString() + ' GP';
    document.getElementById('banco-amount').value = 0;
    openModal('banco-modal');
}

function adjustBanco() {
    const id = document.getElementById('banco-player-id').value;
    const op = document.getElementById('banco-operation').value;
    const amt = parseInt(document.getElementById('banco-amount').value);
    db.collection('players').doc(id).get().then(doc => {
        const data = doc.data();
        let b = (data.bancoBalance != null ? data.bancoBalance : 0);
        if (op === 'add') b += amt;
        else if (op === 'subtract') b = Math.max(0, b - amt);
        else b = amt;
        return db.collection('players').doc(id).update({ bancoBalance: b });
    }).then(() => { showToast('Balance del banco actualizado'); closeModal('banco-modal'); });
}

// ==================== CARTAS DEL DESTINO (DM asigna a cada jugador) ====================
function openCartasDestinoModal(playerId, playerNombre) {
    document.getElementById('cartas-destino-player-id').value = playerId;
    document.getElementById('cartas-destino-player-name').textContent = playerNombre || 'Jugador';
    document.getElementById('cartas-destino-edit-index').value = '-1';
    document.getElementById('cartas-destino-imagen-url').value = '';
    document.getElementById('cartas-destino-titulo').value = '';
    setCartasDestinoFormMode(false);
    db.collection('players').doc(playerId).get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        const cartas = Array.isArray(data.cartasDestino) ? data.cartasDestino : [];
        const mensaje = data.mensajeGeneralCartasDestino || '';
        document.getElementById('cartas-destino-mensaje-general').value = mensaje;
        renderCartasDestinoListModal(playerId, cartas);
    });
    openModal('cartas-destino-modal');
}

function setCartasDestinoFormMode(editing) {
    const titleEl = document.getElementById('cartas-destino-form-title');
    const btnEl = document.getElementById('cartas-destino-save-btn');
    if (titleEl) titleEl.textContent = editing ? '✏️ Editar carta' : '➕ Asignar nueva carta';
    if (btnEl) btnEl.textContent = editing ? '💾 Guardar cambios' : '🃏 Asignar carta';
}

function editCartasDestinoCard(playerId, index) {
    db.collection('players').doc(playerId).get().then(doc => {
        const cartas = (doc.exists && doc.data().cartasDestino) ? doc.data().cartasDestino : [];
        const c = cartas[index];
        if (!c) return;
        document.getElementById('cartas-destino-edit-index').value = String(index);
        document.getElementById('cartas-destino-imagen-url').value = c.imagenUrl || '';
        document.getElementById('cartas-destino-titulo').value = c.titulo || '';
        setCartasDestinoFormMode(true);
    }).catch(e => showToast('Error: ' + e.message, true));
}

function renderCartasDestinoListModal(playerId, cartas) {
    const list = document.getElementById('cartas-destino-list');
    if (!list) return;
    if (!cartas || cartas.length === 0) {
        list.innerHTML = '<p style="color:#8b7355; font-style:italic; padding:10px 0;">Sin cartas asignadas.</p>';
        return;
    }
    list.innerHTML = cartas.map((c, i) => {
        const titulo = (c.titulo || 'Carta ' + (i + 1)).replace(/"/g, '&quot;');
        const img = c.imagenUrl ? `<img src="${c.imagenUrl.replace(/"/g, '&quot;')}" alt="${titulo}" style="width:100%; height:120px; object-fit:cover; border-radius:6px;" onerror="this.style.display='none'">` : '<div style="height:80px; background:#2a2522; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#8b7355;">🃏</div>';
        return `<div class="cartas-destino-item-modal" style="display:flex; gap:12px; align-items:flex-start; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:8px; border:1px solid #4a3c31;">
            <div style="width:100px; flex-shrink:0;">${img}</div>
            <div style="flex:1; min-width:0;">
                <div style="color:#d4af37; font-weight:600; margin-bottom:4px;">${titulo}</div>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
                <button type="button" class="btn btn-small" onclick="editCartasDestinoCard('${playerId}', ${i})" title="Editar carta">✏️</button>
                <button type="button" class="btn btn-small btn-danger" onclick="deleteCartasDestinoCard('${playerId}', ${i})" title="Quitar carta">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function saveCartasDestinoCard() {
    const playerId = document.getElementById('cartas-destino-player-id').value;
    const editIndex = parseInt(document.getElementById('cartas-destino-edit-index').value, 10);
    const imagenUrl = document.getElementById('cartas-destino-imagen-url').value.trim();
    const titulo = document.getElementById('cartas-destino-titulo').value.trim();
    if (!imagenUrl) {
        showToast('La URL de la imagen es obligatoria', true);
        return;
    }
    db.collection('players').doc(playerId).get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        const cartas = Array.isArray(data.cartasDestino) ? data.cartasDestino.slice() : [];
        const carta = { imagenUrl };
        if (titulo) carta.titulo = titulo;
        if (editIndex >= 0 && editIndex < cartas.length) {
            cartas[editIndex] = carta;
        } else {
            cartas.push(carta);
        }
        return db.collection('players').doc(playerId).update({ cartasDestino: cartas });
    }).then(() => {
        showToast(editIndex >= 0 ? 'Carta actualizada' : 'Carta asignada');
        document.getElementById('cartas-destino-edit-index').value = '-1';
        document.getElementById('cartas-destino-imagen-url').value = '';
        document.getElementById('cartas-destino-titulo').value = '';
        setCartasDestinoFormMode(false);
        db.collection('players').doc(playerId).get().then(doc => {
            const cartas = (doc.exists && doc.data().cartasDestino) ? doc.data().cartasDestino : [];
            renderCartasDestinoListModal(playerId, cartas);
        });
    }).catch(e => showToast('Error: ' + e.message, true));
}

function saveMensajeGeneralCartasDestino() {
    const playerId = document.getElementById('cartas-destino-player-id').value;
    const mensaje = document.getElementById('cartas-destino-mensaje-general').value.trim();
    db.collection('players').doc(playerId).update({ mensajeGeneralCartasDestino: mensaje }).then(() => {
        showToast('Mensaje guardado');
    }).catch(e => showToast('Error: ' + e.message, true));
}

function deleteCartasDestinoCard(playerId, index) {
    db.collection('players').doc(playerId).get().then(doc => {
        const data = doc.data();
        const cartas = Array.isArray(data.cartasDestino) ? data.cartasDestino.slice() : [];
        cartas.splice(index, 1);
        return db.collection('players').doc(playerId).update({ cartasDestino: cartas });
    }).then(() => {
        showToast('Carta quitada');
        db.collection('players').doc(playerId).get().then(doc => {
            const cartas = (doc.exists && doc.data().cartasDestino) ? doc.data().cartasDestino : [];
            renderCartasDestinoListModal(playerId, cartas);
        });
    }).catch(e => showToast('Error: ' + e.message, true));
}

// ==================== PLAYER INVENTORY ====================
function openPlayerInventory(playerId) {
    const player = playersData.find(p => p.id === playerId);
    if (!player) return;

    document.getElementById('player-inventory-id').value = playerId;
    document.getElementById('player-inventory-name').textContent = player.nombre;
    document.getElementById('player-inventory-gold').textContent = '💰 ' + (player.oro != null ? player.oro : 0).toLocaleString() + ' GP';
    var items = player.inventario || [];
    var totalValue = items.reduce(function(sum, it) {
        var qty = (it.quantity != null && it.quantity >= 1) ? it.quantity : 1;
        return sum + (Number(it.price) || 0) * qty;
    }, 0);
    var totalValEl = document.getElementById('player-inventory-total-value');
    if (totalValEl) totalValEl.textContent = 'Valor total pertenencias: ' + totalValue.toLocaleString() + ' GP';
    document.getElementById('player-inventory-title').textContent = '🎒 Inventario - ' + player.nombre;

    renderPlayerInventory(player);
    openModal('player-inventory-modal');
}

function groupPlayerInventoryItems(items) {
    var map = {};
    (items || []).forEach(function(item, i) {
        var key = (item.name || '') + '|' + (item.effect || '') + '|' + (item.price != null ? item.price : '') + '|' + (item.rarity || '');
        var qty = (item.quantity != null && item.quantity >= 1) ? item.quantity : 1;
        if (!map[key]) map[key] = { item: item, indices: [], count: 0 };
        map[key].indices.push(i);
        map[key].count += qty;
    });
    return Object.keys(map).map(function(k) { var g = map[k]; return { item: g.item, count: g.count, indices: g.indices }; });
}

function renderPlayerInventory(player) {
    const list = document.getElementById('player-inventory-list');
    const items = player.inventario || [];
    var totalValue = items.reduce(function(sum, it) {
        var qty = (it.quantity != null && it.quantity >= 1) ? it.quantity : 1;
        return sum + (Number(it.price) || 0) * qty;
    }, 0);
    var totalValEl = document.getElementById('player-inventory-total-value');
    if (totalValEl) totalValEl.textContent = 'Valor total pertenencias: ' + totalValue.toLocaleString() + ' GP';

    if (items.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#8b7355;">
                <div style="font-size:3em; margin-bottom:12px;">🎒</div>
                <p style="font-size:1.1em; margin-bottom:8px;">El inventario está vacío</p>
                <p style="font-size:0.9em; color:#6b5a4a;">Usa "Dar Item" o "Importar CSV" para agregar items</p>
            </div>
        `;
        return;
    }

    const rarityColors = {
        'común': '#2ecc71',
        'inusual': '#3498db',
        'infrecuente': '#3498db',
        'rara': '#9b59b6',
        'legendaria': '#e74c3c'
    };

    const rarityLabels = {
        'común': '🟢 Común',
        'inusual': '🔵 Inusual',
        'infrecuente': '🔵 Inusual',
        'rara': '🟣 Rara',
        'legendaria': '🔥 Legendaria'
    };

    var groups = groupPlayerInventoryItems(items);
    var esc = function(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

    list.innerHTML = groups.map(function(g) {
        var it = g.item;
        var firstIndex = g.indices[0];
        var countLabel = g.count > 1 ? ' <span style="color:#a89878; font-weight:700;">× ' + g.count + '</span>' : '';
        return '<div class="mini-card" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; padding:16px; transition:all 0.2s ease;">' +
            '<div style="flex:1; min-width:0;">' +
                '<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">' +
                    '<div class="mini-card-title" style="font-size:1.05em; font-weight:600;">' + esc(it.name) + countLabel + '</div>' +
                    '<span style="background:' + (rarityColors[it.rarity] || '#888') + '; color:#fff; padding:3px 10px; border-radius:12px; font-size:0.75em; font-weight:600; text-transform:uppercase; white-space:nowrap;">' +
                        (rarityLabels[it.rarity] || 'Común') +
                    '</span>' +
                '</div>' +
                (it.effect ? '<div class="mini-card-info" style="color:#d4c4a8; margin-bottom:6px; line-height:1.4;">' + esc(it.effect) + '</div>' : '') +
                (it.price ? '<div style="color:#f1c40f; font-size:0.9em; font-weight:500; margin-top:4px;">💰 Valor: ' + (it.price).toLocaleString() + ' GP</div>' : '') +
            '</div>' +
            '<div class="mini-card-actions" style="margin-left:12px; flex-shrink:0;">' +
                '<button class="btn btn-small btn-danger" onclick="removeItemFromPlayer(' + firstIndex + ')" title="' + (g.count > 1 ? 'Quitar 1 unidad' : 'Quitar ítem') + '" style="padding:8px 12px;">🗑️</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function openGiveItemModal() {
    document.getElementById('give-item-name').value = '';
    document.getElementById('give-item-price').value = 0;
    var giveQtyEl = document.getElementById('give-item-quantity');
    if (giveQtyEl) giveQtyEl.value = 1;
    document.getElementById('give-item-effect').value = '';
    document.getElementById('give-item-rarity').value = 'común';
    openModal('give-item-modal');
}

async function giveItemToPlayer() {
    const playerId = document.getElementById('player-inventory-id').value;
    const quantity = Math.max(1, parseInt(document.getElementById('give-item-quantity').value, 10) || 1);
    const item = {
        name: document.getElementById('give-item-name').value,
        price: parseInt(document.getElementById('give-item-price').value) || 0,
        effect: document.getElementById('give-item-effect').value,
        rarity: document.getElementById('give-item-rarity').value
    };
    if (quantity > 1) item.quantity = quantity;

    if (!item.name) {
        showToast('El nombre es requerido', true);
        return;
    }

    const player = playersData.find(p => p.id === playerId);
    let inventario = player.inventario || [];
    inventario.push(item);

    await db.collection('players').doc(playerId).update({ inventario });
    
    // Guardar transacción
    await db.collection('transactions').add({
        tipo: 'compra',
        itemName: item.name,
        playerId: playerId,
        playerName: player.nombre || 'Jugador',
        shopName: 'DM - Entrega Directa',
        precio: 0, // Items dados por DM no tienen costo
        fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Item entregado a ' + player.nombre);
    closeModal('give-item-modal');
    player.inventario = inventario;
    renderPlayerInventory(player);
}

function clearPlayerInventory() {
    const playerId = document.getElementById('player-inventory-id').value;
    if (!playerId) {
        showToast('Error: ID de jugador no encontrado', true);
        return;
    }
    const player = playersData.find(p => p.id === playerId);
    if (!player) {
        showToast('Jugador no encontrado', true);
        return;
    }
    const count = (player.inventario || []).length;
    if (count === 0) {
        showToast('El inventario ya está vacío');
        return;
    }
    if (!confirm('¿Borrar todo el inventario de ' + (player.nombre || 'este jugador') + '? Se eliminarán ' + count + ' ítem(s). No se puede deshacer.')) return;

    db.collection('players').doc(playerId).update({ inventario: [] })
        .then(() => {
            showToast('Inventario vaciado');
            player.inventario = [];
            renderPlayerInventory(player);
        })
        .catch(e => showToast('Error: ' + e.message, true));
}

function removeItemFromPlayer(index) {
    if (!confirm('¿Quitar este item del inventario?')) return;

    const playerId = document.getElementById('player-inventory-id').value;
    const player = playersData.find(p => p.id === playerId);
    let inventario = player.inventario || [];
    const item = inventario[index];
    const qty = (item && item.quantity != null && item.quantity >= 1) ? item.quantity : 1;
    if (qty > 1) {
        inventario[index] = { ...item, quantity: item.quantity - 1 };
    } else {
        inventario.splice(index, 1);
    }

    db.collection('players').doc(playerId).update({ inventario })
        .then(() => {
            showToast('Item removido');
            player.inventario = inventario;
            renderPlayerInventory(player);
        })
        .catch(e => showToast('Error: ' + e.message, true));
}

// ==================== IMPORTAR ITEMS DESDE CSV/EXCEL ====================
function importPlayerItemsCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const playerId = document.getElementById('player-inventory-id').value;
    if (!playerId) {
        showToast('Error: ID de jugador no encontrado', true);
        return;
    }

    const player = playersData.find(p => p.id === playerId);
    if (!player) {
        showToast('Jugador no encontrado', true);
        return;
    }

    // Usar la función readFileAsText de cities.js
    if (typeof readFileAsText !== 'function') {
        showToast('Error: función readFileAsText no disponible', true);
        return;
    }
    
    readFileAsText(file, function(text) {
        try {
            const lines = text.split('\n').filter(function(line) { return line.trim(); });
            
            if (lines.length < 2) {
                showToast('El archivo está vacío o solo tiene encabezados', true);
                return;
            }

            var separator = lines[0].indexOf(';') !== -1 ? ';' : ',';
            var header = lines[0].split(separator).map(function(h) { return h.trim().toLowerCase(); });
            var nameIdx = header.indexOf('name');
            var priceIdx = header.indexOf('price');
            var effectIdx = header.indexOf('effect');
            var rarityIdx = header.indexOf('rarity');
            var qtyIdx = header.indexOf('quantity') !== -1 ? header.indexOf('quantity') : (header.indexOf('cantidad') !== -1 ? header.indexOf('cantidad') : header.indexOf('qty'));

            if (nameIdx === -1) {
                showToast('El CSV debe tener al menos la columna "name"', true);
                return;
            }

            const validRarities = ['común', 'inusual', 'rara', 'legendaria'];
            let inventario = Array.isArray(player.inventario) ? player.inventario.slice() : [];
            let count = 0;
            let errors = [];

            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(separator).map(function(v) { return v.trim().replace(/^"|"$/g, ''); });
                
                var name = values[nameIdx];
                if (!name || name.length === 0) {
                    errors.push('Línea ' + (i + 1) + ': nombre vacío');
                    continue;
                }

                var price = priceIdx !== -1 ? (parseInt(values[priceIdx], 10) || 0) : 0;
                var effect = effectIdx !== -1 ? (values[effectIdx] || '') : '';
                var rarity = rarityIdx !== -1 ? (values[rarityIdx] || 'común').toLowerCase().trim() : 'común';
                var quantity = qtyIdx !== -1 && values[qtyIdx] !== '' ? Math.max(1, parseInt(values[qtyIdx], 10) || 1) : 1;
                if (rarity === 'infrecuente') rarity = 'inusual';
                if (validRarities.indexOf(rarity) === -1) rarity = 'común';

                var item = {
                    name: name,
                    price: price,
                    effect: effect,
                    rarity: rarity
                };
                if (quantity > 1) item.quantity = quantity;
                inventario.push(item);
                count++;
            }

            if (count === 0) {
                showToast('No se encontraron items válidos en el archivo', true);
                if (errors.length > 0) {
                    console.error('Errores:', errors);
                }
                return;
            }

            // Guardar en Firestore
            db.collection('players').doc(playerId).update({ inventario })
                .then(async function() {
                    // Guardar transacciones para cada item agregado
                    const batch = db.batch();
                    for (let j = inventario.length - count; j < inventario.length; j++) {
                        const item = inventario[j];
                        const transactionRef = db.collection('transactions').doc();
                        batch.set(transactionRef, {
                            tipo: 'compra',
                            itemName: item.name,
                            playerId: playerId,
                            playerName: player.nombre || 'Jugador',
                            shopName: 'DM - Importación CSV',
                            precio: 0, // Items dados por DM no tienen costo
                            fecha: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                    await batch.commit();
                    
                    showToast(count + ' items importados exitosamente' + (errors.length > 0 ? ' (con ' + errors.length + ' errores)' : ''));
                    player.inventario = inventario;
                    renderPlayerInventory(player);
                    
                    // Resetear el input
                    document.getElementById('player-inventory-csv-input').value = '';
                    
                    if (errors.length > 0) {
                        console.warn('Errores durante la importación:', errors);
                    }
                })
                .catch(function(e) {
                    showToast('Error al guardar: ' + e.message, true);
                    console.error(e);
                });

        } catch (error) {
            showToast('Error al procesar el archivo: ' + error.message, true);
            console.error(error);
        }
    });
    
    event.target.value = '';
}

// Exponer funciones globalmente
window.giveItemToPlayer = giveItemToPlayer;
window.importPlayerItemsCSV = importPlayerItemsCSV;

function openPlayerCasaModal(playerId, playerNombre) {
    document.getElementById('dm-casa-player-id').value = playerId;
    document.getElementById('dm-casa-player-name').textContent = playerNombre;
    
    db.collection('players').doc(playerId).get().then(doc => {
        const playerData = doc.exists ? doc.data() : {};
        const casaInfo = playerData.casa || {};
        
        document.getElementById('dm-casa-nombre').value = casaInfo.nombre || '';
        document.getElementById('dm-casa-descripcion').value = casaInfo.descripcion || '';
        document.getElementById('dm-casa-ubicacion').value = casaInfo.ubicacion || '';
        document.getElementById('dm-casa-imagen-url').value = casaInfo.imagenUrl || '';
        document.getElementById('dm-casa-notas').value = casaInfo.notas || '';
        
        openModal('dm-casa-modal');
    }).catch(err => {
        console.error('Error cargando información de la casa:', err);
        showToast('Error al cargar información de la casa', true);
    });
}

function savePlayerCasa() {
    const playerId = document.getElementById('dm-casa-player-id').value;
    if (!playerId) return;
    
    // Obtener datos existentes para preservar las notas personales del jugador
    db.collection('players').doc(playerId).get().then(doc => {
        const playerData = doc.exists ? doc.data() : {};
        const casaExistente = playerData.casa || {};
        
        const casaData = {
            nombre: document.getElementById('dm-casa-nombre').value.trim(),
            descripcion: document.getElementById('dm-casa-descripcion').value.trim(),
            ubicacion: document.getElementById('dm-casa-ubicacion').value.trim(),
            imagenUrl: document.getElementById('dm-casa-imagen-url').value.trim(),
            notas: document.getElementById('dm-casa-notas').value.trim(),
            notasPersonales: casaExistente.notasPersonales || '' // Preservar notas personales del jugador
        };
        
        return db.collection('players').doc(playerId).update({
            casa: casaData,
            casaUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).then(() => {
        showToast('Información de la casa guardada');
        closeModal('dm-casa-modal');
    }).catch(err => {
        console.error('Error guardando casa:', err);
        showToast('Error al guardar información de la casa', true);
    });
}

/**
 * Migración: actualiza todos los inventarios de jugadores cambiando rareza "infrecuente" → "inusual".
 * Solo actualiza jugadores que tengan al menos un ítem con rarity === 'infrecuente'.
 */
window.migratePlayerInventoriesInfrecuenteToInusual = async function() {
    if (typeof db === 'undefined') {
        showToast('Error: base de datos no disponible', true);
        return;
    }
    try {
        const snap = await db.collection('players').limit(500).get();
        let updated = 0;
        let totalItemsChanged = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            const inventario = data.inventario;
            if (!Array.isArray(inventario) || inventario.length === 0) continue;
            let changed = false;
            const newInv = inventario.map(item => {
                const r = (item.rarity || '').toLowerCase();
                if (r === 'infrecuente') {
                    changed = true;
                    totalItemsChanged++;
                    return { ...item, rarity: 'inusual' };
                }
                return item;
            });
            if (changed) {
                await db.collection('players').doc(doc.id).update({ inventario: newInv });
                updated++;
            }
        }
        showToast(updated === 0
            ? 'No había jugadores con ítems "infrecuente". Nada que actualizar.'
            : 'Migración lista: ' + updated + ' jugador(es) actualizado(s), ' + totalItemsChanged + ' ítem(s) cambiado(s) a "inusual".');
    } catch (err) {
        console.error('Error en migración inventarios:', err);
        showToast('Error en la migración: ' + (err.message || err), true);
    }
};

// OPTIMIZACIÓN: loadPlayers() se llama solo desde showDashboard() en app.js (una get() al entrar como DM)
