// ==================== ITEMS ESPECIALES ====================
// Subcolección: players/{playerId}/special_items/{itemId}
// Campos: name, imageUrl (link Imgur), precio (GP, opcional), rarity (común|inusual|rara|legendaria), resumen, description (opcional), updatedAt

function getSpecialItemsRef(playerId) {
    if (typeof db === 'undefined') return null;
    return db.collection('players').doc(playerId).collection('special_items');
}

function loadSpecialItems(playerId, containerId, options) {
    options = options || {};
    var isDM = options.isDM === true;
    var container = document.getElementById(containerId);
    if (!container || !playerId) return;
    var ref = getSpecialItemsRef(playerId);
    if (!ref) return;
    container.innerHTML = '<p style="color:#8b7355; padding:16px;">Cargando...</p>';
    ref.orderBy('updatedAt', 'desc').get().then(function (snap) {
        var items = [];
        snap.forEach(function (d) { items.push({ id: d.id, ...d.data() }); });
        renderSpecialItemsList(items, container, playerId, isDM, containerId);
    }).catch(function (e) {
        container.innerHTML = '<p style="color:#9c4a4a; padding:16px;">Error al cargar: ' + (e.message || e) + '</p>';
    });
}

function renderSpecialItemsList(items, container, playerId, isDM, containerId) {
    if (!container) return;
    containerId = containerId || (container.id || 'player-special-items-list');
    function esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    if (!items.length) {
        container.innerHTML = '<p style="color:#8b7355; padding:16px;">No hay items especiales. Añade uno con imagen (link de Imgur).</p>';
        return;
    }
    var PREVIEW_LEN = 200;
    var totalValue = 0;
    items.forEach(function (it) {
        var p = it.precio != null && it.precio !== '' ? (typeof it.precio === 'number' ? it.precio : parseInt(it.precio, 10)) : 0;
        if (p != null && !isNaN(p) && p >= 0) totalValue += p;
    });
    var totalValueEl = document.getElementById(containerId === 'dm-special-items-list' ? 'dm-special-items-total-value' : 'player-special-items-total-value');
    if (totalValueEl) totalValueEl.innerHTML = 'Valor total items especiales: <strong style="color:#f1c40f;">' + totalValue.toLocaleString() + ' GP</strong>';
    var html = '<div class="player-special-items-grid">';
    items.forEach(function (it) {
        var img = (it.imageUrl && it.imageUrl.trim()) ? '<img src="' + esc(it.imageUrl.trim()) + '" alt="" class="player-special-item-img" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'block\';"><span class="player-special-item-img-placeholder" style="display:none;">🖼️</span>' : '<span class="player-special-item-img-placeholder">🖼️</span>';
        html += '<div class="player-special-item-card">';
        html += '<div class="player-special-item-image">' + img + '</div>';
        html += '<div class="player-special-item-body">';
        html += '<div class="player-special-item-name">' + esc(it.name || 'Sin nombre') + '</div>';
        var rarityVal = (it.rarity && String(it.rarity).trim()) ? String(it.rarity).toLowerCase() : 'común';
        var rarityColors = { común: '#2ecc71', inusual: '#3498db', infrecuente: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
        var rarityColor = rarityColors[rarityVal] || '#888';
        var rarityLabel = rarityVal === 'infrecuente' ? 'inusual' : rarityVal;
        var precioNum = it.precio != null && it.precio !== '' ? (typeof it.precio === 'number' ? it.precio : parseInt(it.precio, 10)) : null;
        var precioStr = (precioNum != null && !isNaN(precioNum)) ? esc(String(precioNum)) + ' GP' : '';
        html += '<div class="player-special-item-meta"><span class="rarity-badge player-special-item-rareza" style="background:' + rarityColor + ';color:#fff;">' + esc(rarityLabel) + '</span>' + (precioStr ? '<span class="player-special-item-precio">' + precioStr + '</span>' : '') + '</div>';
        var resumen = (it.resumen && it.resumen.trim()) ? it.resumen.trim() : '';
        var desc = (it.description && it.description.trim()) ? it.description.trim() : '';
        var textoResumen = resumen || (desc ? (desc.length <= PREVIEW_LEN ? desc : desc.slice(0, PREVIEW_LEN) + '…') : '');
        if (textoResumen) html += '<div class="player-special-item-desc">' + esc(textoResumen) + '</div>';
        html += '<div class="player-special-item-actions">';
        if (desc) html += '<button type="button" class="btn btn-small btn-secondary" onclick="openSpecialItemDescriptionModal(\'' + esc(playerId) + '\', \'' + esc(it.id) + '\')" title="Ver texto completo">📜 Ver descripción completa</button>';
        html += '<button type="button" class="btn btn-small btn-secondary" onclick="typeof openSpecialItemActionsModalFromBtn === \'function\' && openSpecialItemActionsModalFromBtn(this)" data-special-player-id="' + esc(playerId) + '" data-special-item-id="' + esc(it.id) + '" data-special-item-name="' + esc(it.name || 'Item especial') + '" data-special-container-id="' + esc(containerId) + '" data-special-is-dm="' + (isDM ? '1' : '0') + '" title="Usar, vender o transferir">⚡ Acciones</button>';
        html += '<button type="button" class="btn btn-small btn-secondary" onclick="openSpecialItemFormModal(\'' + esc(playerId) + '\', \'' + esc(it.id) + '\')">✏️ Editar</button>';
        html += ' <button type="button" class="btn btn-small btn-danger" onclick="deleteSpecialItemConfirm(\'' + esc(playerId) + '\', \'' + esc(it.id) + '\', \'' + esc((it.name || '')) + '\', \'' + esc(containerId) + '\', ' + (isDM ? 'true' : 'false') + ')">🗑️</button>';
        html += '</div></div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

function openSpecialItemFormModal(playerId, itemId) {
    var isNew = !itemId;
    document.getElementById('special-item-player-id').value = playerId;
    document.getElementById('special-item-id').value = itemId || '';
    document.getElementById('special-item-name').value = '';
    document.getElementById('special-item-image-url').value = '';
    var precioEl = document.getElementById('special-item-precio');
    if (precioEl) precioEl.value = '';
    var rarityEl = document.getElementById('special-item-rareza');
    if (rarityEl) rarityEl.value = 'común';
    var resumenEl = document.getElementById('special-item-resumen');
    if (resumenEl) resumenEl.value = '';
    document.getElementById('special-item-description').value = '';
    document.getElementById('special-item-modal-title').textContent = isNew ? '✨ Añadir item especial' : '✏️ Editar item especial';
    if (!isNew) {
        getSpecialItemsRef(playerId).doc(itemId).get().then(function (doc) {
            if (doc.exists) {
                var data = doc.data();
                document.getElementById('special-item-name').value = data.name || '';
                document.getElementById('special-item-image-url').value = data.imageUrl || '';
                if (precioEl) precioEl.value = (data.precio != null && data.precio !== '') ? String(data.precio) : '';
                var r = (data.rarity && String(data.rarity).trim()) ? String(data.rarity).toLowerCase() : 'común';
                if (rarityEl && (r === 'común' || r === 'inusual' || r === 'infrecuente' || r === 'rara' || r === 'legendaria')) rarityEl.value = (r === 'infrecuente' ? 'inusual' : r);
                if (resumenEl) resumenEl.value = data.resumen || '';
                document.getElementById('special-item-description').value = data.description || '';
            }
        });
    }
    openModal('special-item-form-modal');
}

function saveSpecialItem() {
    var playerId = document.getElementById('special-item-player-id').value;
    var itemId = document.getElementById('special-item-id').value;
    var name = (document.getElementById('special-item-name').value || '').trim();
    var imageUrl = (document.getElementById('special-item-image-url').value || '').trim();
    var precioEl = document.getElementById('special-item-precio');
    var precioVal = precioEl ? (precioEl.value != null && precioEl.value.trim() !== '' ? parseInt(precioEl.value.trim(), 10) : null) : null;
    var precio = (precioVal != null && !isNaN(precioVal) && precioVal >= 0) ? precioVal : null;
    var resumenEl = document.getElementById('special-item-resumen');
    var resumen = resumenEl ? (resumenEl.value || '').trim() : '';
    var description = (document.getElementById('special-item-description').value || '').trim();
    if (!name) {
        if (typeof showToast === 'function') showToast('Nombre requerido', true);
        return;
    }
    var ref = getSpecialItemsRef(playerId);
    if (!ref) return;
    var rarityEl = document.getElementById('special-item-rareza');
    var rarityRaw = rarityEl ? (rarityEl.value || 'común').trim().toLowerCase() : 'común';
    var rarity = (rarityRaw === 'común' || rarityRaw === 'inusual' || rarityRaw === 'rara' || rarityRaw === 'legendaria') ? rarityRaw : 'común';
    var data = { name: name, imageUrl: imageUrl, rarity: rarity, resumen: resumen, description: description, updatedAt: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date() };
    if (precio != null) data.precio = precio;
    var containerId = document.getElementById('special-item-form-modal').dataset.containerId || 'player-special-items-list';
    var isDM = document.getElementById('special-item-form-modal').dataset.isDm === 'true';
    if (itemId) {
        ref.doc(itemId).update(data).then(function () {
            if (typeof showToast === 'function') showToast('Item actualizado');
            closeModal('special-item-form-modal');
            loadSpecialItems(playerId, containerId, { isDM: isDM });
        }).catch(function (e) { if (typeof showToast === 'function') showToast('Error: ' + e.message, true); });
    } else {
        ref.add(data).then(function () {
            if (typeof showToast === 'function') showToast('Item añadido');
            closeModal('special-item-form-modal');
            loadSpecialItems(playerId, containerId, { isDM: isDM });
        }).catch(function (e) { if (typeof showToast === 'function') showToast('Error: ' + e.message, true); });
    }
}

function deleteSpecialItemConfirm(playerId, itemId, name, containerId, isDM) {
    if (!confirm('¿Eliminar el item especial "' + (name || '') + '"?')) return;
    var ref = getSpecialItemsRef(playerId);
    if (!ref) return;
    containerId = containerId || (document.getElementById('special-items-modal') ? 'dm-special-items-list' : 'player-special-items-list');
    isDM = isDM === true;
    ref.doc(itemId).delete().then(function () {
        if (typeof showToast === 'function') showToast('Item eliminado');
        loadSpecialItems(playerId, containerId, { isDM: isDM });
    }).catch(function (e) { if (typeof showToast === 'function') showToast('Error: ' + e.message, true); });
}

function openPlayerSpecialItemsModal(playerId) {
    var player = typeof playersData !== 'undefined' && playersData ? playersData.find(function (p) { return p.id === playerId; }) : null;
    var name = player ? player.nombre : 'Jugador';
    document.getElementById('dm-special-items-player-id').value = playerId;
    document.getElementById('dm-special-items-title').textContent = '⭐ Items especiales - ' + name;
    document.getElementById('special-item-form-modal').dataset.containerId = 'dm-special-items-list';
    document.getElementById('special-item-form-modal').dataset.isDm = 'true';
    loadSpecialItems(playerId, 'dm-special-items-list', { isDM: true });
    openModal('special-items-modal');
}

function addSpecialItemFromDMModal() {
    var playerId = document.getElementById('dm-special-items-player-id').value;
    openSpecialItemFormModal(playerId, null);
    document.getElementById('special-item-form-modal').dataset.containerId = 'dm-special-items-list';
    document.getElementById('special-item-form-modal').dataset.isDm = 'true';
}

function loadPlayerSpecialItemsForCurrentUser() {
    var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user || !user.id) return;
    var formModal = document.getElementById('special-item-form-modal');
    if (formModal) { formModal.dataset.containerId = 'player-special-items-list'; formModal.dataset.isDm = 'false'; }
    loadSpecialItems(user.id, 'player-special-items-list', { isDM: false });
}

function openAddSpecialItemPlayer() {
    var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user || !user.id) { if (typeof showToast === 'function') showToast('No hay sesión', true); return; }
    var formModal = document.getElementById('special-item-form-modal');
    if (formModal) { formModal.dataset.containerId = 'player-special-items-list'; formModal.dataset.isDm = 'false'; }
    openSpecialItemFormModal(user.id, null);
}

function openSpecialItemDescriptionModal(playerId, itemId) {
    var titleEl = document.getElementById('special-item-description-title');
    var contentEl = document.getElementById('special-item-description-content');
    var resumenWrap = document.getElementById('special-item-description-resumen-wrap');
    var resumenEl = document.getElementById('special-item-description-resumen');
    var descLabel = document.getElementById('special-item-description-desc-label');
    if (!titleEl || !contentEl) return;
    titleEl.textContent = '⭐ Cargando…';
    contentEl.textContent = '';
    if (resumenWrap) resumenWrap.style.display = 'none';
    if (resumenEl) resumenEl.textContent = '';
    if (descLabel) descLabel.style.display = 'none';
    openModal('special-item-description-modal');
    var ref = getSpecialItemsRef(playerId);
    if (!ref) { titleEl.textContent = '⭐ Descripción'; contentEl.textContent = 'Error al cargar.'; return; }
    ref.doc(itemId).get().then(function (doc) {
        var data = doc && doc.exists ? doc.data() : {};
        var name = data.name || 'Sin nombre';
        var resumen = (data.resumen && data.resumen.trim()) ? data.resumen.trim() : '';
        var desc = (data.description && data.description.trim()) ? data.description.trim() : '';
        titleEl.textContent = name;
        var esMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
        if (esMobile && resumen) {
            if (resumenWrap) resumenWrap.style.display = 'block';
            if (resumenEl) resumenEl.textContent = resumen;
            if (descLabel) descLabel.style.display = desc ? 'block' : 'none';
            contentEl.textContent = desc || '';
        } else {
            if (resumenWrap) resumenWrap.style.display = 'none';
            if (descLabel) descLabel.style.display = 'none';
            contentEl.textContent = desc || 'Sin descripción.';
        }
    }).catch(function () {
        titleEl.textContent = '⭐ Descripción';
        contentEl.textContent = 'Error al cargar la descripción.';
    });
}

function useSpecialItem(playerId, itemId, options) {
    options = options || {};
    var containerId = options.containerId || 'player-special-items-list';
    var isDM = options.isDM === true;
    var ref = getSpecialItemsRef(playerId);
    if (!ref) return Promise.reject(new Error('No Firestore'));
    return ref.doc(itemId).get().then(function (doc) {
        var data = doc.exists ? doc.data() : {};
        var name = data.name || 'Item especial';
        return ref.doc(itemId).delete().then(function () {
            if (typeof db !== 'undefined' && db.collection('transactions').add) {
                var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
                return db.collection('transactions').add({
                    tipo: 'uso',
                    itemName: name,
                    playerName: (user && user.nombre) ? user.nombre : (options.playerName || '—'),
                    playerId: playerId,
                    shopName: '—',
                    precio: 0,
                    fecha: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date()
                }).then(function () { return name; });
            }
            return name;
        });
    }).then(function (itemName) {
        if (typeof showToast === 'function') showToast('Item usado: ' + itemName);
        loadSpecialItems(playerId, containerId, { isDM: isDM });
    }).catch(function (e) {
        if (typeof showToast === 'function') showToast('Error: ' + (e.message || e), true);
    });
}

function sellSpecialItem(playerId, itemId, valorEnGp, options) {
    options = options || {};
    var containerId = options.containerId || 'player-special-items-list';
    var isDM = options.isDM === true;
    var ref = getSpecialItemsRef(playerId);
    if (!ref) return Promise.reject(new Error('No Firestore'));
    var valorVenta = Math.floor((Number(valorEnGp) || 0) * 0.75);
    return ref.doc(itemId).get().then(function (doc) {
        var data = doc.exists ? doc.data() : {};
        var name = data.name || 'Item especial';
        return ref.doc(itemId).delete().then(function () {
            if (valorVenta <= 0) return name;
            return (typeof db !== 'undefined' ? db.collection('players').doc(playerId).get() : Promise.reject(new Error('No db'))).then(function (snap) {
                var d = snap.exists ? snap.data() : {};
                var nuevoOro = (d.oro != null ? d.oro : 0) + valorVenta;
                return db.collection('players').doc(playerId).update({ oro: nuevoOro }).then(function () {
                    if (db.collection('transactions').add) {
                        var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
                        return db.collection('transactions').add({
                            tipo: 'venta',
                            itemName: name,
                            playerName: (user && user.nombre) ? user.nombre : (options.playerName || '—'),
                            playerId: playerId,
                            shopName: '—',
                            precio: valorVenta,
                            fecha: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date()
                        }).then(function () { return name; });
                    }
                    return name;
                });
            });
        });
    }).then(function (itemName) {
        if (typeof showToast === 'function') showToast('Vendido. +' + valorVenta + ' GP');
        loadSpecialItems(playerId, containerId, { isDM: isDM });
        if (typeof lastPlayerViewData !== 'undefined' && lastPlayerViewData && lastPlayerViewData.id === playerId) lastPlayerViewData.oro = (lastPlayerViewData.oro || 0) + valorVenta;
    }).catch(function (e) {
        if (typeof showToast === 'function') showToast('Error: ' + (e.message || e), true);
    });
}

function transferSpecialItem(fromPlayerId, itemId, toPlayerId, options) {
    options = options || {};
    var containerId = options.containerId || 'player-special-items-list';
    var isDM = options.isDM === true;
    var refFrom = getSpecialItemsRef(fromPlayerId);
    var refTo = getSpecialItemsRef(toPlayerId);
    if (!refFrom || !refTo) return Promise.reject(new Error('No Firestore'));
    return refFrom.doc(itemId).get().then(function (doc) {
        if (!doc.exists) return Promise.reject(new Error('Item no encontrado'));
        var data = doc.data();
        var name = data.name || 'Item especial';
        return refFrom.doc(itemId).delete().then(function () {
            var newData = { name: data.name || '', imageUrl: (data.imageUrl || '').trim(), resumen: (data.resumen || '').trim(), description: (data.description || '').trim(), updatedAt: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date() };
            if (data.precio != null && !isNaN(data.precio)) newData.precio = data.precio;
            if (data.rarity && (data.rarity === 'común' || data.rarity === 'inusual' || data.rarity === 'rara' || data.rarity === 'legendaria')) newData.rarity = data.rarity;
            return refTo.add(newData);
        }).then(function () {
            if (typeof showToast === 'function') showToast('Transferido: ' + name);
            loadSpecialItems(fromPlayerId, containerId, { isDM: isDM });
            if (toPlayerId !== fromPlayerId && typeof loadSpecialItems === 'function') loadSpecialItems(toPlayerId, 'dm-special-items-list', { isDM: true });
        });
    }).catch(function (e) {
        if (typeof showToast === 'function') showToast('Error: ' + (e.message || e), true);
    });
}
