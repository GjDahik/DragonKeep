// ==================== MENSAJES AUTOMÁTICOS (REGLAS POR COMPRA) ====================
// Reglas: al comprar un ítem en una tienda, enviar mensaje al jugador y opcionalmente quitar el ítem de la tienda.

let _editingRuleId = null;
let _editingRule = null;

function automationItemSignature(it) {
    const n = (it.name || it.title || '').trim();
    const e = (it.effect || it.desc || it.description || '').trim();
    const p = it.price != null ? Number(it.price) : '';
    return n + '|' + e + '|' + String(p);
}

const SOURCE_TRAVELING_ANALISIS = 'traveling_analisis';

/** Obtiene reglas para una tienda (o todas). */
async function automationGetRules(shopId) {
    const snap = await db.collection('automation_rules')
        .where('shopId', '==', shopId)
        .limit(50)
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(r => !r.sourceType || r.sourceType === 'shop');
}

/** Reglas de tienda ambulante tipo Análisis de objetos (por jugador + ítem al usar). */
async function getTravelingAnalisisRules(travelingShopId) {
    if (!travelingShopId) return [];
    const snap = await db.collection('automation_rules')
        .where('sourceType', '==', SOURCE_TRAVELING_ANALISIS)
        .where('travelingShopId', '==', travelingShopId)
        .limit(50)
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** playerId opcional: si es null o '__all__', la regla aplica a cualquier jugador. */
const TRAVELING_ANALISIS_ANY_PLAYER = '__all__';

/** Crea regla de Análisis de objetos (jugador usa ítem → mensaje y/o misión). */
async function createTravelingAnalisisRule(travelingShopId, playerId, item, message, missionId) {
    const payload = {
        sourceType: SOURCE_TRAVELING_ANALISIS,
        travelingShopId: String(travelingShopId),
        playerId: playerId && String(playerId).trim() && String(playerId) !== TRAVELING_ANALISIS_ANY_PLAYER ? String(playerId) : TRAVELING_ANALISIS_ANY_PLAYER,
        itemName: (item.name || item.title || '').trim(),
        itemEffect: (item.effect || item.desc || '').trim(),
        itemPrice: item.price != null ? Number(item.price) : null,
        message: (message || '').trim(),
        missionId: (missionId && String(missionId).trim()) || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('automation_rules').add(payload);
}

/** Actualiza una regla de Análisis de objetos (solo campos editables; no toca triggeredOnce). */
async function updateTravelingAnalisisRule(ruleId, travelingShopId, playerId, item, message, missionId) {
    const payload = {
        travelingShopId: String(travelingShopId),
        playerId: playerId && String(playerId).trim() && String(playerId) !== TRAVELING_ANALISIS_ANY_PLAYER ? String(playerId) : TRAVELING_ANALISIS_ANY_PLAYER,
        itemName: (item.name || item.title || '').trim(),
        itemEffect: (item.effect || item.desc || '').trim(),
        itemPrice: item.price != null ? Number(item.price) : null,
        message: (message || '').trim(),
        missionId: (missionId && String(missionId).trim()) || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('automation_rules').doc(ruleId).update(payload);
}

/** Reglas por uso de ítem (jugador): traveling_analisis para ese jugador o para cualquier jugador. */
async function automationGetRulesForPlayerUse(playerId) {
    const [snapPlayer, snapAll] = await Promise.all([
        db.collection('automation_rules')
            .where('sourceType', '==', SOURCE_TRAVELING_ANALISIS)
            .where('playerId', '==', String(playerId))
            .limit(50)
            .get(),
        db.collection('automation_rules')
            .where('sourceType', '==', SOURCE_TRAVELING_ANALISIS)
            .where('playerId', '==', TRAVELING_ANALISIS_ANY_PLAYER)
            .limit(50)
            .get()
    ]);
    const list = snapPlayer.docs.concat(snapAll.docs).map(d => ({ id: d.id, ...d.data() }));
    return list;
}

/** Ejecuta reglas cuando el jugador usa un ítem (reglas de Análisis de objetos). Cada regla solo se dispara una vez por ítem (en total).
 * @param {string} [travelingShopId] - Si se pasa, solo se aplican reglas de esta tienda ambulante.
 * @returns {Promise<boolean|string>} true si se aplicó, 'already_triggered' si ya se había disparado antes, false si no hay regla.
 */
async function runAutomationRulesForPlayerUse(playerId, item, playerName, travelingShopId) {
    if (!playerId || !item) return false;
    let rules = await automationGetRulesForPlayerUse(playerId);
    if (travelingShopId) rules = rules.filter(r => String(r.travelingShopId || '') === String(travelingShopId));
    if (!rules.length) return false;
    const sig = automationItemSignature(item);
    const rule = rules.find(r => automationItemSignature({
        name: r.itemName,
        effect: r.itemEffect,
        price: r.itemPrice
    }) === sig);
    if (!rule) return false;
    if (!rule.message && !rule.missionId) return false;
    if (rule.triggeredOnce === true) return 'already_triggered';
    if (rule.message) {
        try {
            await db.collection('notifications').add({
                mensaje: rule.message,
                enviadoPor: 'automation',
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                leida: false,
                playerId,
                playerName: playerName || 'Jugador'
            });
        } catch (e) { console.error('Automation: error enviando notificación', e); }
    }
    if (rule.missionId) {
        try {
            const missionRef = db.collection('missions').doc(rule.missionId);
            const missionSnap = await missionRef.get();
            if (missionSnap.exists) {
                const d = missionSnap.data();
                const assigned = Array.isArray(d.assignedPlayerIds) ? [...d.assignedPlayerIds] : [];
                const pid = String(playerId);
                if (assigned.indexOf(pid) === -1) assigned.push(pid);
                const updates = {
                    assignedPlayerIds: assigned,
                    visibleTo: 'player',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if ((d.status || '').toString().toLowerCase() === 'draft') updates.status = 'visible';
                await missionRef.update(updates);
            }
        } catch (e) { console.error('Automation: error haciendo visible la misión', e); }
    }
    try {
        await db.collection('automation_rules').doc(rule.id).update({
            triggeredOnce: true
        });
    } catch (e) { console.error('Automation: error guardando triggeredOnce', e); }
    return true;
}

/**
 * Ejecuta reglas tras una compra.
 * @param {string} shopId
 * @param {{ item: object, qty: number }[]} itemsBought - item con name, effect, price, etc.
 * @param {string} playerId
 * @param {string} playerName
 */
async function runAutomationRules(shopId, itemsBought, playerId, playerName) {
    if (!shopId || !itemsBought || !itemsBought.length || !playerId) return;
    const rules = await automationGetRules(shopId);
    if (!rules.length) return;

    const seen = new Set();
    let shopInv = null;
    let shopInvDirty = false;

    for (const { item, qty } of itemsBought) {
        if (!item || qty < 1) continue;
        const sig = automationItemSignature(item);
        const rule = rules.find(r => automationItemSignature({
            name: r.itemName,
            effect: r.itemEffect,
            price: r.itemPrice
        }) === sig);
        if (!rule || !rule.message) continue;

        // Una notificación por regla cumplida (aunque compren varias unidades)
        const key = rule.id;
        if (seen.has(key)) continue;
        seen.add(key);

        try {
            await db.collection('notifications').add({
                mensaje: rule.message,
                enviadoPor: 'automation',
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                leida: false,
                playerId,
                playerName: playerName || 'Jugador'
            });
        } catch (e) {
            console.error('Automation: error enviando notificación', e);
        }

        if (rule.missionId) {
            try {
                const missionRef = db.collection('missions').doc(rule.missionId);
                const missionSnap = await missionRef.get();
                if (missionSnap.exists) {
                    const d = missionSnap.data();
                    const status = (d.status || '').toString().toLowerCase();
                    const assigned = Array.isArray(d.assignedPlayerIds) ? [...d.assignedPlayerIds] : [];
                    const pid = String(playerId);
                    if (assigned.indexOf(pid) === -1) assigned.push(pid);
                    const updates = {
                        assignedPlayerIds: assigned,
                        visibleTo: 'player',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (status === 'draft') updates.status = 'visible';
                    await missionRef.update(updates);
                }
            } catch (e) {
                console.error('Automation: error haciendo visible la misión', e);
            }
        }

        if (rule.removeFromShop) {
            if (shopInv === null) {
                const shopSnap = await db.collection('shops').doc(shopId).get();
                shopInv = (shopSnap.exists && shopSnap.data().inventario) ? shopSnap.data().inventario.slice() : [];
            }
            const idx = shopInv.findIndex(x => automationItemSignature(x) === sig);
            if (idx >= 0) {
                const it = shopInv[idx];
                const qty = (it.quantity != null && it.quantity >= 1) ? it.quantity : 1;
                if (qty > 1) {
                    shopInv[idx] = { ...it, quantity: it.quantity - 1 };
                } else {
                    shopInv.splice(idx, 1);
                }
                shopInvDirty = true;
            }
        }
    }

    if (shopInvDirty && shopInv) {
        try {
            await db.collection('shops').doc(shopId).update({ inventario: shopInv });
        } catch (e) {
            console.error('Automation: error actualizando inventario tienda', e);
        }
    }
}

/** Crea una regla. item: { name, effect, price }. missionId opcional: al activarse la regla, se hace visible esa misión al jugador. */
async function createAutomationRule(shopId, item, message, removeFromShop, missionId) {
    const payload = {
        shopId,
        itemName: (item.name || item.title || '').trim(),
        itemEffect: (item.effect || item.desc || '').trim(),
        itemPrice: item.price != null ? Number(item.price) : null,
        message: (message || '').trim(),
        removeFromShop: !!removeFromShop,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (missionId && (missionId = String(missionId).trim())) payload.missionId = missionId;
    await db.collection('automation_rules').add(payload);
}

/** Actualiza una regla existente. */
async function updateAutomationRule(ruleId, shopId, item, message, removeFromShop, missionId) {
    const payload = {
        shopId,
        itemName: (item.name || item.title || '').trim(),
        itemEffect: (item.effect || item.desc || '').trim(),
        itemPrice: item.price != null ? Number(item.price) : null,
        message: (message || '').trim(),
        removeFromShop: !!removeFromShop,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    payload.missionId = (missionId && String(missionId).trim()) || null;
    await db.collection('automation_rules').doc(ruleId).update(payload);
}

/** Elimina una regla. */
async function deleteAutomationRule(ruleId) {
    await db.collection('automation_rules').doc(ruleId).delete();
}

async function deleteAutomationRuleThenReload(ruleId) {
    await deleteAutomationRule(ruleId);
    loadAutomationRulesList();
}

/** Obtiene todas las reglas. */
async function loadAllAutomationRules() {
    const snap = await db.collection('automation_rules').limit(100).get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(0);
        const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(0);
        return tb - ta;
    });
    return list;
}

/** Tiendas sin inventario ni cuartos (no aplican reglas). */
const AUTOMATION_NO_INV = ['santuario', 'banco', 'batalla'];

function getPosadaRooms(shop) {
    if (!shop) return [];
    const custom = shop.posadaCuartos && Array.isArray(shop.posadaCuartos) ? shop.posadaCuartos : [];
    if (custom.length) return custom;
    const def = (typeof window !== 'undefined' && window.POSADA_CUARTOS) ? window.POSADA_CUARTOS : [];
    return def;
}

/** Carga todas las tiendas desde Firestore si shopsData está vacío (para que los dropdowns tengan datos). */
function ensureShopsLoadedForAutomation() {
    const sh = (typeof window.shopsData !== 'undefined' ? window.shopsData : (typeof shopsData !== 'undefined' ? shopsData : [])) || [];
    if (sh.length > 0) return Promise.resolve();
    if (typeof db === 'undefined') return Promise.resolve();
    return db.collection('shops').limit(400).get().then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.shopsData = list;
        if (typeof shopsData !== 'undefined') { try { shopsData = list; } catch (e) {} }
    }).catch(() => {});
}

/** Tiendas que pueden tener reglas: con inventario (pociones, forja, etc.) o posadas (cuartos). */
function automationShopsForRules() {
    const sh = (typeof window.shopsData !== 'undefined' ? window.shopsData : (typeof shopsData !== 'undefined' ? shopsData : [])) || [];
    return sh.filter(s => {
        const t = (s.tipo || '').toLowerCase();
        if (AUTOMATION_NO_INV.includes(t)) return false;
        if (t === 'posada') return getPosadaRooms(s).length > 0;
        const inv = s.inventario || [];
        return inv.length > 0;
    });
}

function loadAutomationRulesList() {
    const el = document.getElementById('automation-rules-list');
    if (!el) return;
    el.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando reglas...</p>';
    loadAllAutomationRules().then(async rules => {
        const sh = (typeof window.shopsData !== 'undefined' ? window.shopsData : (typeof shopsData !== 'undefined' ? shopsData : [])) || [];
        const shopName = id => (sh.find(s => s.id === id) || {}).nombre || '?';
        const shopTipo = id => (sh.find(s => s.id === id) || {}).tipo || '';
        if (!rules.length) {
            el.innerHTML = '<p style="color:#8b7355; text-align:center; padding:24px;">No hay reglas. Crea una con "Nueva regla".</p>';
            return;
        }
        const missionIds = [...new Set(rules.filter(r => r.missionId).map(r => r.missionId))];
        const missionTitles = {};
        if (missionIds.length) {
            await Promise.all(missionIds.map(async mid => {
                const snap = await db.collection('missions').doc(mid).get();
                if (snap.exists) missionTitles[mid] = (snap.data().title || 'Sin título').trim();
            }));
        }
        const esc = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        el.innerHTML = rules.map(r => {
            const msg = (r.message || '').trim();
            const preview = msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
            const isPosada = (shopTipo(r.shopId) || '').toLowerCase() === 'posada';
            const priceLabel = isPosada ? (r.itemPrice != null ? ' — ' + r.itemPrice + ' GP/noche' : '') : (r.itemPrice != null ? ' — ' + r.itemPrice + ' GP' : '');
            const remove = !isPosada && r.removeFromShop ? ' <span style="color:#8b7355; font-size:0.85em;">· Quitar de tienda</span>' : '';
            const missionLabel = r.missionId ? ` <span style="color:#8fbc8f; font-size:0.85em;">→ Desbloquea misión: ${esc(missionTitles[r.missionId] || '?')}</span>` : '';
            return `<div class="mini-card" style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div style="flex:1; min-width:0;">
                    <div class="mini-card-title" style="margin-bottom:4px;">${esc(r.itemName || '?')}${priceLabel}</div>
                    <div style="color:#8b7355; font-size:0.9em; margin-bottom:6px;">${esc(shopName(r.shopId))}${isPosada ? ' <span style="color:#6b5d4a;">· Posada</span>' : ''}${remove}${missionLabel}</div>
                    <div style="color:#a89878; font-size:0.9em; white-space:pre-wrap; line-height:1.4;">${esc(preview)}</div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button type="button" class="btn btn-small" onclick="editAutomationRule('${String(r.id).replace(/'/g, "\\'")}')" title="Editar regla">✏️</button>
                    <button type="button" class="btn btn-small btn-danger" onclick="deleteAutomationRuleThenReload('${String(r.id).replace(/'/g, "\\'")}')" title="Eliminar regla">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }).catch(e => {
        if (document.getElementById('automation-rules-list')) document.getElementById('automation-rules-list').innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Error al cargar reglas.</p>';
        console.error('loadAutomationRulesList', e);
    });
}

function _populateAutomationItemsForShop(shopSel, itemSel, removeWrap, shops) {
    const id = shopSel.value;
    itemSel.innerHTML = '<option value="">— Elige un ítem o cuarto —</option>';
    if (!id) { if (removeWrap) removeWrap.style.display = 'flex'; return; }
    const s = shops.find(x => x.id === id);
    const isPosada = (s && (s.tipo || '').toLowerCase()) === 'posada';
    if (removeWrap) removeWrap.style.display = isPosada ? 'none' : 'flex';
    if (isPosada) {
        const rooms = getPosadaRooms(s);
        rooms.forEach((c, i) => {
            const name = (c.nombre || '?').replace(/"/g, '&quot;');
            const price = c.precio != null ? c.precio + ' GP/noche' : '';
            const lab = price ? `${name} — ${price}` : name;
            itemSel.appendChild(new Option(lab, String(i)));
        });
    } else {
        const inv = (s && s.inventario) || [];
        inv.forEach((it, i) => {
            const name = (it.name || it.title || '?').replace(/"/g, '&quot;');
            const price = it.price != null ? it.price + ' GP' : '';
            const lab = price ? `${name} — ${price}` : name;
            itemSel.appendChild(new Option(lab, String(i)));
        });
    }
}

function openAutomationRuleModal(ruleForEdit) {
    const shopSel = document.getElementById('automation-rule-shop');
    const itemSel = document.getElementById('automation-rule-item');
    const msgEl = document.getElementById('automation-rule-message');
    const removeEl = document.getElementById('automation-rule-remove');
    const removeWrap = document.getElementById('automation-rule-remove-wrap');
    const missionSel = document.getElementById('automation-rule-mission');
    const titleEl = document.getElementById('automation-rule-modal-title');
    if (!shopSel || !itemSel || !msgEl || !removeEl) return;

    ensureShopsLoadedForAutomation().then(() => {
        _openAutomationRuleModalInner(ruleForEdit, shopSel, itemSel, msgEl, removeEl, removeWrap, missionSel, titleEl);
    });
}

function _openAutomationRuleModalInner(ruleForEdit, shopSel, itemSel, msgEl, removeEl, removeWrap, missionSel, titleEl) {
    const shops = automationShopsForRules();
    const isEdit = !!ruleForEdit;
    _editingRuleId = isEdit ? ruleForEdit.id : null;
    _editingRule = isEdit ? ruleForEdit : null;

    if (titleEl) titleEl.textContent = isEdit ? '✏️ Editar regla' : '🤖 Nueva regla';

    shopSel.innerHTML = '<option value="">— Elige una tienda —</option>' + shops.map(s => {
        const n = (s.nombre || 'Sin nombre').replace(/"/g, '&quot;');
        const posada = (s.tipo || '').toLowerCase() === 'posada';
        return `<option value="${s.id}">${n}${posada ? ' 🏨' : ''}</option>`;
    }).join('');

    shopSel.onchange = () => _populateAutomationItemsForShop(shopSel, itemSel, removeWrap, shops);

    if (missionSel) {
        missionSel.innerHTML = '<option value="">— Ninguna —</option>';
        db.collection('missions').where('status', '==', 'draft').limit(200).get().then(snap => {
            snap.docs.forEach(d => {
                const data = d.data();
                const title = (data.title || 'Sin título').replace(/"/g, '&quot;');
                const status = (data.status || '').toString().toLowerCase();
                const label = status === 'draft' ? title + ' (borrador)' : title;
                missionSel.appendChild(new Option(label, d.id));
            });
            if (isEdit && ruleForEdit.missionId) missionSel.value = ruleForEdit.missionId;
        }).catch(() => {});
    }

    if (isEdit) {
        shopSel.value = ruleForEdit.shopId || '';
        _populateAutomationItemsForShop(shopSel, itemSel, removeWrap, shops);
        const sig = automationItemSignature({ name: ruleForEdit.itemName, effect: ruleForEdit.itemEffect, price: ruleForEdit.itemPrice });
        let found = false;
        const shop = shops.find(x => x.id === ruleForEdit.shopId);
        const isPosada = shop && (shop.tipo || '').toLowerCase() === 'posada';
        const items = isPosada ? getPosadaRooms(shop) : (shop && shop.inventario) || [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const s = isPosada ? { name: it.nombre, effect: it.efecto || '', price: it.precio } : it;
            if (automationItemSignature(s) === sig) { itemSel.value = String(i); found = true; break; }
        }
        if (!found) {
            const lab = (ruleForEdit.itemName || '?') + (ruleForEdit.itemPrice != null ? ' — ' + ruleForEdit.itemPrice + ' GP' + (isPosada ? '/noche' : '') : '') + ' (actual)';
            itemSel.appendChild(new Option(lab, 'current'));
            itemSel.value = 'current';
        }
        msgEl.value = (ruleForEdit.message || '').trim();
        removeEl.checked = !!ruleForEdit.removeFromShop;
        if (missionSel && ruleForEdit.missionId) missionSel.value = ruleForEdit.missionId;
    } else {
        itemSel.innerHTML = '<option value="">— Elige un ítem o cuarto —</option>';
        if (removeWrap) removeWrap.style.display = 'flex';
        msgEl.value = '';
        removeEl.checked = true;
    }

    openModal('automation-rule-modal');
}

async function editAutomationRule(ruleId) {
    const snap = await db.collection('automation_rules').doc(ruleId).get();
    if (!snap.exists) {
        showToast('Regla no encontrada', true);
        return;
    }
    openAutomationRuleModal({ id: snap.id, ...snap.data() });
}

function saveAutomationRule() {
    const shopSel = document.getElementById('automation-rule-shop');
    const itemSel = document.getElementById('automation-rule-item');
    const msgEl = document.getElementById('automation-rule-message');
    const removeEl = document.getElementById('automation-rule-remove');
    const missionSel = document.getElementById('automation-rule-mission');
    if (!shopSel || !itemSel || !msgEl) return;
    const shopId = (shopSel.value || '').trim();
    const message = (msgEl.value || '').trim();
    const missionId = (missionSel && missionSel.value) ? missionSel.value.trim() : '';
    if (!shopId) { showToast('Elige una tienda', true); return; }
    const rawVal = itemSel.value;
    if (rawVal === '' || rawVal === null) { showToast('Elige un ítem o cuarto', true); return; }
    if (!message) { showToast('Escribe el mensaje a enviar', true); return; }
    const shops = automationShopsForRules();
    const shop = shops.find(s => s.id === shopId);
    if (!shop) {
        showToast('Tienda no encontrada. Elige otra o elimina la regla.', true);
        return;
    }
    const isPosada = (shop.tipo || '').toLowerCase() === 'posada';
    let item;
    if (rawVal === 'current' && _editingRule) {
        item = { name: _editingRule.itemName, effect: _editingRule.itemEffect || '', price: _editingRule.itemPrice };
    } else {
        const idx = parseInt(rawVal, 10);
        if (isNaN(idx) || idx < 0) { showToast('Elige un ítem o cuarto', true); return; }
        if (isPosada) {
            const rooms = getPosadaRooms(shop);
            const c = rooms[idx];
            if (!c) { showToast('Cuarto no encontrado', true); return; }
            item = { name: c.nombre, effect: c.efecto || '', price: c.precio };
        } else {
            const inv = (shop && shop.inventario) || [];
            item = inv[idx];
            if (!item) { showToast('Ítem no encontrado', true); return; }
        }
    }
    const removeFromShop = isPosada ? false : !!removeEl.checked;
    const updating = !!_editingRuleId;
    const promise = updating
        ? updateAutomationRule(_editingRuleId, shopId, item, message, removeFromShop, missionId || null)
        : createAutomationRule(shopId, item, message, removeFromShop, missionId || null);
    promise.then(() => {
        showToast(updating ? 'Regla actualizada' : 'Regla guardada');
        _editingRuleId = null;
        _editingRule = null;
        closeModal('automation-rule-modal');
        loadAutomationRulesList();
    }).catch(e => {
        showToast('Error al guardar: ' + (e.message || ''), true);
    });
}

window.openAutomationRuleModal = openAutomationRuleModal;
window.saveAutomationRule = saveAutomationRule;
window.editAutomationRule = editAutomationRule;
window.loadAutomationRulesList = loadAutomationRulesList;
window.deleteAutomationRule = deleteAutomationRule;
window.deleteAutomationRuleThenReload = deleteAutomationRuleThenReload;
window.runAutomationRules = runAutomationRules;
window.getTravelingAnalisisRules = getTravelingAnalisisRules;
window.createTravelingAnalisisRule = createTravelingAnalisisRule;
window.updateTravelingAnalisisRule = updateTravelingAnalisisRule;
window.runAutomationRulesForPlayerUse = runAutomationRulesForPlayerUse;
window.automationItemSignature = automationItemSignature;
window.getPosadaRooms = getPosadaRooms;
