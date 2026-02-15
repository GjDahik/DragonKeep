/**
 * Tiendas ambulantes: el DM crea tiendas que los jugadores ven.
 * - Locación "Locación desconocida" → no pueden entrar.
 * - Locación "Cerca de ti" → pueden entrar y ver catálogo.
 */
(function () {
    'use strict';
    if (typeof db === 'undefined') return;

    var COLLECTION = 'travelingShops';
    var LOCACION_DESCONOCIDA = 'Locación desconocida';
    var CERCA_DE_TI = 'Cerca de ti';
    var TIPO_CATALOGO = 'catalogo';
    var TIPO_ANALISIS_OBJETOS = 'analisis_objetos';
    var TIPOS_LABEL = { catalogo: 'Tienda de mapas', analisis_objetos: 'Análisis de objetos' };

    window.travelingShopsData = [];
    window.playerTravelingShopsData = [];

    function getTravelingShopsContainer() { return document.getElementById('traveling-shops-container'); }
    function getPlayerTravelingShopsContainer() { return document.getElementById('player-traveling-shops-container'); }

    /** DM: cargar todas las tiendas ambulantes */
    function fetchTravelingShopsDM() {
        return db.collection(COLLECTION).orderBy('nombre').get()
            .then(function (snap) {
                window.travelingShopsData = snap && snap.docs ? snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }) : [];
                renderTravelingShopsDM();
            })
            .catch(function (err) {
                console.error('Error cargando tiendas ambulantes:', err);
                if (typeof showToast === 'function') showToast('Error al cargar tiendas ambulantes', true);
            });
    }

    /** Jugador: cargar tiendas visibles (activa !== false; si no existe el campo, se considera visible) */
    function fetchTravelingShopsPlayer() {
        return db.collection(COLLECTION).get()
            .then(function (snap) {
                var all = snap && snap.docs ? snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }) : [];
                window.playerTravelingShopsData = all.filter(function (s) { return s.activa !== false; });
                window.playerTravelingShopsData.sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
                renderPlayerTravelingShops();
            })
            .catch(function (err) {
                console.error('Error cargando tiendas ambulantes (jugador):', err);
                if (typeof showToast === 'function') showToast('Error al cargar tiendas ambulantes', true);
            });
    }

    function renderTravelingShopsDM() {
        var container = getTravelingShopsContainer();
        if (!container) return;
        var list = window.travelingShopsData || [];
        if (!list.length) {
            container.innerHTML = '<p style="color:#8b7355; padding:24px; text-align:center;">No hay tiendas ambulantes. Crea una con el botón de arriba.</p>';
            return;
        }
        container.innerHTML = list.map(function (s) {
            var visible = s.activa !== false;
            var loc = s.locacionMensaje || LOCACION_DESCONOCIDA;
            var isCerca = loc === CERCA_DE_TI;
            var id = (s.id || '').replace(/'/g, "\\'");
            var tipoLabel = TIPOS_LABEL[s.tipo] || TIPOS_LABEL[TIPO_CATALOGO];
            var imgUrl = (s.imagenUrl || '').trim();
            var imgHtml = imgUrl ? '<div style="width:100%; height:140px; overflow:hidden; border-radius:8px 8px 0 0; background:#1e1b18;"><img src="' + imgUrl.replace(/"/g, '&quot;') + '" alt="" style="width:100%; height:100%; object-fit:cover;"></div>' : '';
            var verReglasBtn = (s.tipo === TIPO_ANALISIS_OBJETOS) ? '<button type="button" class="btn btn-small btn-secondary" onclick="openTravelingShopVerReglasModal(\'' + id + '\')">🤖 Ver reglas</button>' : '';
            var addItemBtn = (s.tipo === TIPO_CATALOGO) ? '<button type="button" class="btn btn-small" onclick="openTravelingShopAddItemModal(\'' + id + '\')">➕ Añadir ítem</button>' : '';
            return '<div class="city-card" style="max-width:360px;">' + imgHtml +
                '<div class="city-header" style="cursor:default;">' +
                '<div class="city-info" style="flex:1;"><h3>🛒 ' + (s.nombre || 'Tienda') + '</h3>' +
                '<p style="color:#8b7355; font-size:0.9em;">' + tipoLabel + ' · ' + (visible ? 'Visible' : 'Invisible') + '</p></div></div>' +
                '<div class="city-actions" style="flex-wrap:wrap; gap:8px;">' +
                addItemBtn +
                '<button type="button" class="btn btn-small ' + (isCerca ? 'btn-success' : 'btn-secondary') + '" onclick="toggleTravelingShopLocacion(\'' + id + '\')">📍 ' + (isCerca ? CERCA_DE_TI : LOCACION_DESCONOCIDA) + '</button>' +
                verReglasBtn +
                '<button type="button" class="btn btn-small btn-secondary" onclick="editTravelingShop(\'' + id + '\')">✏️ Editar</button>' +
                '<button type="button" class="btn btn-small btn-danger" onclick="deleteTravelingShop(\'' + id + '\')">🗑️ Eliminar</button>' +
                '</div></div>';
        }).join('');
    }

    function renderPlayerTravelingShops() {
        var container = getPlayerTravelingShopsContainer();
        if (!container) return;
        var list = window.playerTravelingShopsData || [];
        if (!list.length) {
            container.innerHTML = '<p style="color:#8b7355; padding:24px; text-align:center;">No hay tiendas ambulantes visibles ahora.</p>';
            return;
        }
        var puedeEntrar = function (s) { return (s.locacionMensaje || LOCACION_DESCONOCIDA) === CERCA_DE_TI; };
        container.innerHTML = list.map(function (s) {
            var id = (s.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            var loc = s.locacionMensaje || LOCACION_DESCONOCIDA;
            var entra = puedeEntrar(s);
            var isCerca = loc === CERCA_DE_TI;
            var onclick = entra ? 'openTravelingShop(\'' + id + '\')' : 'if(typeof showToast===\'function\')showToast(\'Aún no puedes entrar; ubicación desconocida.\', true)';
            var cardClass = 'player-mistfall-shop-card' + (entra ? '' : ' player-traveling-shop-blocked');
            var esAnalisis = s.tipo === TIPO_ANALISIS_OBJETOS;
            var tipoDesc = esAnalisis ? 'Análisis de objetos' : 'Tienda de mapas';
            var enterText = entra ? (esAnalisis ? '— Analizar mi inventario →' : '— Entrar a la tienda →') : '— Ubicación desconocida (no puedes entrar)';
            var icon = esAnalisis ? '🔍' : '🛒';
            var locBtnClass = 'btn btn-small ' + (isCerca ? 'btn-success' : 'btn-secondary');
            var imgUrl = (s.imagenUrl || '').trim();
            var imgHtml = imgUrl ? '<div style="width:100%; height:120px; overflow:hidden; border-radius:8px 8px 0 0; background:#1e1b18;"><img src="' + imgUrl.replace(/"/g, '&quot;') + '" alt="" style="width:100%; height:100%; object-fit:cover;"></div>' : '';
            var inner = '<span class="player-mistfall-shop-icon">' + icon + '</span>' +
                '<div class="player-mistfall-shop-info">' +
                '<h3 class="player-mistfall-shop-name">' + (s.nombre || 'Tienda ambulante') + '</h3>' +
                '<p class="player-mistfall-shop-desc">' + tipoDesc + '</p>' +
                '<span class="' + locBtnClass + '" style="display:inline-block; margin-top:6px; pointer-events:none;">📍 ' + loc + '</span>' +
                '<p class="player-mistfall-shop-enter">' + enterText + '</p>' +
                '</div>';
            return '<div class="' + cardClass + '" onclick="' + onclick + '" role="button" tabindex="0" style="' + (imgUrl ? 'display:flex; flex-direction:column;' : '') + '">' + imgHtml +
                (imgUrl ? '<div style="display:flex; flex:1; align-items:flex-start; padding:12px;">' + inner + '</div>' : inner) +
                '</div>';
        }).join('');
    }

    function openTravelingShopModal(id) {
        var titleEl = document.getElementById('traveling-shop-modal-title');
        var idEl = document.getElementById('traveling-shop-modal-id');
        var nombreEl = document.getElementById('traveling-shop-modal-nombre');
        var tipoEl = document.getElementById('traveling-shop-modal-tipo');
        var imagenEl = document.getElementById('traveling-shop-modal-imagen');
        var visibleEl = document.getElementById('traveling-shop-modal-visible');
        var locacionEl = document.getElementById('traveling-shop-modal-locacion');
        var listEl = document.getElementById('traveling-shop-modal-inventario-list');
        var catalogoWrap = document.getElementById('traveling-shop-modal-catalogo-wrap');
        if (!titleEl || !idEl || !nombreEl || !visibleEl || !listEl) return;
        idEl.value = id || '';
        titleEl.textContent = id ? '🛒 Editar tienda ambulante' : '🛒 Nueva tienda ambulante';
        if (id) {
            var s = (window.travelingShopsData || []).find(function (x) { return x.id === id; });
            if (s) {
                nombreEl.value = s.nombre || '';
                if (tipoEl) tipoEl.value = s.tipo || TIPO_CATALOGO;
                if (imagenEl) imagenEl.value = (s.imagenUrl || '').trim();
                visibleEl.checked = s.activa !== false;
                if (locacionEl) locacionEl.value = s.locacionMensaje || LOCACION_DESCONOCIDA;
                renderTravelingShopModalInventario(s.inventario || []);
            }
        } else {
            nombreEl.value = '';
            if (tipoEl) tipoEl.value = TIPO_CATALOGO;
            if (imagenEl) imagenEl.value = '';
            visibleEl.checked = true;
            if (locacionEl) locacionEl.value = LOCACION_DESCONOCIDA;
            renderTravelingShopModalInventario([]);
        }
        travelingShopModalToggleTipo();
        if (typeof openModal === 'function') openModal('traveling-shop-modal');
    }

    window.travelingShopModalToggleTipo = function () {
        var tipoEl = document.getElementById('traveling-shop-modal-tipo');
        var catalogoWrap = document.getElementById('traveling-shop-modal-catalogo-wrap');
        var isAnalisis = tipoEl && tipoEl.value === TIPO_ANALISIS_OBJETOS;
        if (catalogoWrap) catalogoWrap.style.display = isAnalisis ? 'none' : 'block';
    };

    function getVerReglasFilterAndSearch() {
        var activeTab = document.querySelector('.ver-reglas-tab.active');
        var filter = (activeTab && activeTab.getAttribute('data-filter')) || 'all';
        var searchEl = document.getElementById('traveling-shop-ver-reglas-search');
        var search = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
        return { filter: filter, search: search };
    }

    function filterRulesByTabAndSearch(rules, filter, search) {
        var out = rules.filter(function (r) {
            if (filter === 'pending' && r.triggeredOnce === true) return false;
            if (filter === 'triggered' && r.triggeredOnce !== true) return false;
            if (search) {
                var name = String(r.itemName || '').toLowerCase();
                var msg = String(r.message || '').toLowerCase();
                if (name.indexOf(search) === -1 && msg.indexOf(search) === -1) return false;
            }
            return true;
        });
        return out;
    }

    function renderTravelingShopRulesList(shopId, listEl, opts) {
        if (!listEl) return;
        var useCache = opts && opts.useCache === true;
        var cache = window._travelingShopVerReglasCache;
        if (useCache && cache && cache.shopId === shopId && cache.rules) {
            var state = getVerReglasFilterAndSearch();
            var rules = filterRulesByTabAndSearch(cache.rules, state.filter, state.search);
            paintVerReglasList(shopId, listEl, rules);
            return;
        }
        listEl.innerHTML = '<p style="color:#8b7355; font-size:0.9em;">Cargando reglas…</p>';
        if (typeof getTravelingAnalisisRules !== 'function') { listEl.innerHTML = '<p style="color:#8b7355;">Error: getTravelingAnalisisRules no disponible.</p>'; return; }
        getTravelingAnalisisRules(shopId).then(function (rules) {
            window._travelingShopVerReglasCache = { shopId: shopId, rules: rules };
            var state = getVerReglasFilterAndSearch();
            var filtered = filterRulesByTabAndSearch(rules, state.filter, state.search);
            paintVerReglasList(shopId, listEl, filtered);
        }).catch(function () {
            if (listEl) listEl.innerHTML = '<p style="color:#8b7355;">Error al cargar reglas.</p>';
        });
    }

    function paintVerReglasList(shopId, listEl, rules) {
        var players = (typeof window.playersData !== 'undefined' ? window.playersData : []) || [];
        var getPlayerName = function (id) {
            if (!id || id === '__all__') return 'Cualquier jugador';
            var p = players.find(function (x) { return x.id === id; });
            return p ? (p.nombre || id) : id;
        };
        if (!rules.length) {
            listEl.innerHTML = '<p style="color:#8b7355; font-size:0.9em;">No hay reglas que coincidan con el filtro.</p>';
            return;
        }
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var shopIdEsc = String(shopId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        listEl.innerHTML = rules.map(function (r) {
            var msg = (r.message || '').trim();
            var preview = msg.length > 40 ? msg.slice(0, 40) + '…' : msg;
            var ruleIdEsc = String(r.id).replace(/'/g, "\\'");
            var triggeredBadge = (r.triggeredOnce === true)
                ? '<span class="rule-triggered-badge" title="Esta regla ya se disparó una vez">Disparada</span>'
                : '';
            return '<div class="mini-card" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">' +
                '<div style="flex:1; min-width:0;">' +
                '<div class="mini-card-title" style="font-size:0.95em; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                esc(r.itemName || '?') + triggeredBadge + '</div>' +
                '<div style="color:#8b7355; font-size:0.85em;">Jugador: ' + esc(getPlayerName(r.playerId)) + (preview ? ' · ' + esc(preview) : '') + '</div>' +
                '</div>' +
                '<span style="display:flex; gap:6px;">' +
                '<button type="button" class="btn btn-small btn-secondary" onclick="typeof openTravelingShopEditRule===\'function\'&&openTravelingShopEditRule(\'' + ruleIdEsc + '\', \'' + shopIdEsc + '\')" title="Editar regla">✏️</button>' +
                '<button type="button" class="btn btn-small btn-danger" onclick="travelingShopModalDeleteRule(\'' + ruleIdEsc + '\')" title="Eliminar regla">🗑️</button>' +
                '</span></div>';
        }).join('');
    }

    window.setVerReglasFilter = function (filter) {
        var tabs = document.querySelectorAll('.ver-reglas-tab');
        tabs.forEach(function (t) {
            var isActive = (t.getAttribute('data-filter') || '') === filter;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        applyVerReglasFilter();
    };

    window.applyVerReglasFilter = function () {
        var shopIdEl = document.getElementById('traveling-shop-ver-reglas-shop-id');
        var listEl = document.getElementById('traveling-shop-ver-reglas-list');
        var shopId = shopIdEl && shopIdEl.value ? shopIdEl.value.trim() : '';
        if (shopId && listEl) renderTravelingShopRulesList(shopId, listEl, { useCache: true });
    };

    window.openTravelingShopVerReglasModal = function (shopId) {
        if (!shopId) return;
        window._travelingShopVerReglasShopId = shopId;
        var shopIdIn = document.getElementById('traveling-shop-ver-reglas-shop-id');
        var listEl = document.getElementById('traveling-shop-ver-reglas-list');
        var titleEl = document.getElementById('traveling-shop-ver-reglas-title');
        if (shopIdIn) shopIdIn.value = shopId;
        var shop = (window.travelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (titleEl) titleEl.textContent = '🤖 Reglas · ' + (shop && shop.nombre ? shop.nombre : 'Tienda');
        window._travelingShopVerReglasCache = null;
        var searchIn = document.getElementById('traveling-shop-ver-reglas-search');
        if (searchIn) searchIn.value = '';
        var tabs = document.querySelectorAll('.ver-reglas-tab');
        tabs.forEach(function (t) {
            var isAll = (t.getAttribute('data-filter') || '') === 'all';
            t.classList.toggle('active', isAll);
            t.setAttribute('aria-selected', isAll ? 'true' : 'false');
        });
        if (listEl) renderTravelingShopRulesList(shopId, listEl);
        if (typeof openModal === 'function') openModal('traveling-shop-ver-reglas-modal');
    };

    window.openAddRuleFromVerReglas = function () {
        var shopIdIn = document.getElementById('traveling-shop-ver-reglas-shop-id');
        var shopId = (shopIdIn && shopIdIn.value) ? shopIdIn.value.trim() : '';
        if (!shopId) return;
        if (typeof closeModal === 'function') closeModal('traveling-shop-ver-reglas-modal');
        travelingShopModalOpenAddRule(shopId);
        if (typeof openModal === 'function') openModal('traveling-analisis-rule-modal');
    };

    window.openTravelingShopEditRule = function (ruleId, shopId) {
        if (!ruleId || !shopId) return;
        var editIdEl = document.getElementById('traveling-analisis-rule-edit-id');
        var shopIdIn = document.getElementById('traveling-analisis-rule-shop-id');
        var titleEl = document.getElementById('traveling-analisis-rule-modal-title');
        var sourceSel = document.getElementById('traveling-analisis-rule-source');
        var playerSel = document.getElementById('traveling-analisis-rule-player');
        var itemSel = document.getElementById('traveling-analisis-rule-item');
        var msgEl = document.getElementById('traveling-analisis-rule-message');
        var missionSel = document.getElementById('traveling-analisis-rule-mission');
        if (!editIdEl || !shopIdIn || !sourceSel || !playerSel || !itemSel || !msgEl) return;
        editIdEl.value = ruleId;
        shopIdIn.value = shopId;
        if (titleEl) titleEl.textContent = '🤖 Editar regla';
        sourceSel.value = 'player';
        travelingAnalisisRuleSwitchSource('player');
        sourceSel.onchange = function () { travelingAnalisisRuleSwitchSource(sourceSel.value); };
        var players = (typeof getVisiblePlayers === 'function' ? getVisiblePlayers() : (window.playersData || [])) || [];
        playerSel.innerHTML = '<option value="__all__">Cualquier jugador</option>' + players.map(function (p) {
            var n = (p.nombre || 'Sin nombre').replace(/"/g, '&quot;');
            return '<option value="' + p.id + '">' + n + '</option>';
        }).join('');
        itemSel.innerHTML = '<option value="">— Cargando… —</option>';
        if (typeof openModal === 'function') openModal('traveling-analisis-rule-modal');
        db.collection('automation_rules').doc(ruleId).get().then(function (doc) {
            if (!doc.exists) {
                if (typeof showToast === 'function') showToast('Regla no encontrada', true);
                return;
            }
            var rule = doc.data();
            rule.id = doc.id;
            window._editingTravelingRule = rule;
            if (msgEl) msgEl.value = (rule.message || '').trim();
            var pid = (rule.playerId || '').toString();
            playerSel.value = pid || '__all__';
            if (pid && pid !== '__all__') {
                db.collection('players').doc(pid).get().then(function (pDoc) {
                    var inv = (pDoc.exists && pDoc.data().inventario) ? pDoc.data().inventario : [];
                    var sig = typeof automationItemSignature === 'function' ? automationItemSignature({ name: rule.itemName, effect: rule.itemEffect, price: rule.itemPrice }) : '';
                    itemSel.innerHTML = '<option value="">— Elige un ítem —</option>';
                    var foundIdx = -1;
                    inv.forEach(function (it, i) {
                        var s = typeof automationItemSignature === 'function' ? automationItemSignature(it) : '';
                        if (s === sig) foundIdx = i;
                        var name = (it.name || it.nombre || '?').replace(/"/g, '&quot;');
                        var price = it.price != null ? it.price + ' GP' : '';
                        itemSel.appendChild(new Option(price ? name + ' — ' + price : name, String(i)));
                    });
                    if (foundIdx >= 0) itemSel.value = String(foundIdx);
                    else {
                        itemSel.appendChild(new Option('Objeto actual: ' + (rule.itemName || '?') + ' (sin cambiar)', 'edit_keep'));
                        itemSel.value = 'edit_keep';
                    }
                }).catch(function () { itemSel.innerHTML = '<option value="">— Error —</option>'; });
            } else {
                itemSel.innerHTML = '<option value="edit_keep">Objeto actual: ' + (rule.itemName || '?') + '</option>';
                itemSel.value = 'edit_keep';
            }
            if (missionSel) {
                missionSel.innerHTML = '<option value="">— Ninguna —</option>';
                db.collection('missions').where('status', '==', 'draft').limit(50).get().then(function (snap) {
                    snap.docs.forEach(function (d) {
                        var data = d.data();
                        var title = (data.title || data.nombre || d.id).trim();
                        missionSel.appendChild(new Option(title + ' (borrador)', d.id));
                    });
                    missionSel.value = (rule.missionId || '').trim();
                });
            }
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Error al cargar la regla', true);
        });
    };

    window.travelingShopModalDeleteRule = function (ruleId) {
        if (!ruleId || !confirm('¿Eliminar esta regla?')) return;
        if (typeof deleteAutomationRule !== 'function') return;
        deleteAutomationRule(ruleId).then(function () {
            if (typeof showToast === 'function') showToast('Regla eliminada');
            if (window._travelingShopVerReglasShopId) {
                var listEl = document.getElementById('traveling-shop-ver-reglas-list');
                if (listEl) renderTravelingShopRulesList(window._travelingShopVerReglasShopId, listEl);
            }
        });
    };

    function travelingAnalisisRuleSwitchSource(sourceVal) {
        ['player', 'city_shop', 'traveling_shop'].forEach(function (block) {
            var el = document.getElementById('traveling-analisis-rule-block-' + block);
            if (el) el.style.display = block === sourceVal ? 'block' : 'none';
        });
    }

    window.travelingShopModalOpenAddRule = function (shopIdFromCard) {
        var idEl = document.getElementById('traveling-shop-modal-id');
        var shopId = (shopIdFromCard && shopIdFromCard.trim()) ? shopIdFromCard.trim() : ((idEl && idEl.value) || '');
        if (!shopId) {
            if (typeof showToast === 'function') showToast('Guarda la tienda primero para añadir reglas', true);
            return;
        }
        var editIdEl = document.getElementById('traveling-analisis-rule-edit-id');
        var titleEl = document.getElementById('traveling-analisis-rule-modal-title');
        if (editIdEl) editIdEl.value = '';
        if (titleEl) titleEl.textContent = '🤖 Añadir regla';
        var shopIdIn = document.getElementById('traveling-analisis-rule-shop-id');
        var sourceSel = document.getElementById('traveling-analisis-rule-source');
        var playerSel = document.getElementById('traveling-analisis-rule-player');
        var itemSel = document.getElementById('traveling-analisis-rule-item');
        var cityShopSel = document.getElementById('traveling-analisis-rule-city-shop');
        var cityShopItemSel = document.getElementById('traveling-analisis-rule-city-shop-item');
        var travelingShopSel = document.getElementById('traveling-analisis-rule-traveling-shop');
        var travelingShopItemSel = document.getElementById('traveling-analisis-rule-traveling-shop-item');
        var msgEl = document.getElementById('traveling-analisis-rule-message');
        var missionSel = document.getElementById('traveling-analisis-rule-mission');
        if (shopIdIn) shopIdIn.value = shopId;
        if (msgEl) msgEl.value = '';
        if (sourceSel) sourceSel.value = 'player';
        travelingAnalisisRuleSwitchSource('player');

        sourceSel.onchange = function () { travelingAnalisisRuleSwitchSource(sourceSel.value); };

        var players = (typeof getVisiblePlayers === 'function' ? getVisiblePlayers() : (window.playersData || [])) || [];
        if (playerSel) {
            playerSel.innerHTML = '<option value="">— Elige un jugador —</option>' + players.map(function (p) {
                var n = (p.nombre || 'Sin nombre').replace(/"/g, '&quot;');
                return '<option value="' + p.id + '">' + n + '</option>';
            }).join('');
            playerSel.value = '';
        }
        if (itemSel) itemSel.innerHTML = '<option value="">— Elige primero un jugador —</option>';
        playerSel.onchange = function () {
            var pid = playerSel.value;
            if (!pid) { itemSel.innerHTML = '<option value="">— Elige un jugador —</option>'; return; }
            itemSel.innerHTML = '<option value="">— Cargando… —</option>';
            db.collection('players').doc(pid).get().then(function (doc) {
                var inv = (doc.exists && doc.data().inventario) ? doc.data().inventario : [];
                itemSel.innerHTML = '<option value="">— Elige un ítem —</option>';
                var seen = {};
                inv.forEach(function (it, i) {
                    var sig = typeof automationItemSignature === 'function' ? automationItemSignature(it) : ((it.name || '') + '|' + (it.effect || '') + '|' + (it.price != null ? it.price : ''));
                    if (seen[sig]) return;
                    seen[sig] = true;
                    var name = (it.name || '?').replace(/"/g, '&quot;');
                    var price = it.price != null ? it.price + ' GP' : '';
                    itemSel.appendChild(new Option(price ? name + ' — ' + price : name, String(i)));
                });
            }).catch(function () { itemSel.innerHTML = '<option value="">— Error —</option>'; });
        };

        var citySel = document.getElementById('traveling-analisis-rule-city');
        var ensureCitiesAndShops = Promise.all([
            typeof ensureShopsLoadedForAutomation === 'function' ? ensureShopsLoadedForAutomation() : Promise.resolve(),
            (window.citiesData && window.citiesData.length) ? Promise.resolve() : (typeof fetchCitiesDM === 'function' ? fetchCitiesDM() : Promise.resolve())
        ]);
        ensureCitiesAndShops.then(function () {
            var sh = (typeof window.shopsData !== 'undefined' ? window.shopsData : []) || [];
            var cities = (typeof window.citiesData !== 'undefined' ? window.citiesData : []) || [];
            var cityIdsWithShops = {};
            sh.forEach(function (s) {
                if (s.ciudadId) cityIdsWithShops[s.ciudadId] = true;
            });
            var citiesWithShops = cities.filter(function (c) { return cityIdsWithShops[c.id]; });
            if (citySel) {
                citySel.innerHTML = '<option value="">— Elige una ciudad —</option>' + citiesWithShops.map(function (c) {
                    var n = (c.nombre || '?').replace(/"/g, '&quot;');
                    return '<option value="' + c.id + '">' + n + '</option>';
                }).join('');
                citySel.value = '';
                citySel.onchange = function () {
                    var cid = citySel.value;
                    if (cityShopSel) {
                        cityShopSel.innerHTML = '<option value="">— Elige una tienda —</option>';
                        cityShopItemSel.innerHTML = '<option value="">— Elige primero una tienda —</option>';
                    }
                    if (!cid) return;
                    var shopsInCity = sh.filter(function (s) {
                        if (s.ciudadId !== cid) return false;
                        var t = (s.tipo || '').toLowerCase();
                        if (['santuario', 'banco', 'batalla'].indexOf(t) >= 0) return false;
                        if (t === 'posada') return (s.posadaCuartos && s.posadaCuartos.length) || (typeof window.getPosadaRooms === 'function' && window.getPosadaRooms(s).length);
                        return (s.inventario && s.inventario.length);
                    });
                    if (cityShopSel) {
                        cityShopSel.innerHTML = '<option value="">— Elige una tienda —</option>' + shopsInCity.map(function (s) {
                            var n = (s.nombre || '?').replace(/"/g, '&quot;');
                            return '<option value="' + s.id + '">' + n + '</option>';
                        }).join('');
                    }
                };
            }
            if (cityShopSel) {
                cityShopSel.onchange = function () {
                    var sid = cityShopSel.value;
                    cityShopItemSel.innerHTML = '<option value="">— Elige un ítem —</option>';
                    if (!sid) return;
                    var s = sh.find(function (x) { return x.id === sid; });
                    if (!s) return;
                    var isPosada = (s.tipo || '').toLowerCase() === 'posada';
                    var items = isPosada && typeof window.getPosadaRooms === 'function' ? window.getPosadaRooms(s) : (s.inventario || []);
                    items.forEach(function (it, i) {
                        var name = (isPosada ? (it.nombre || '?') : (it.name || it.title || '?')).replace(/"/g, '&quot;');
                        var price = isPosada ? (it.precio != null ? it.precio + ' GP/noche' : '') : (it.price != null ? it.price + ' GP' : '');
                        cityShopItemSel.appendChild(new Option(price ? name + ' — ' + price : name, String(i)));
                    });
                };
            }
        });

        var travelingShops = (typeof window.travelingShopsData !== 'undefined' ? window.travelingShopsData : []) || [];
        var withCatalog = travelingShops.filter(function (s) { return ((s.tipo || '').toLowerCase() === 'catalogo') && (s.inventario && s.inventario.length); });
        if (travelingShopSel) {
            travelingShopSel.innerHTML = '<option value="">— Elige una tienda ambulante —</option>' + withCatalog.map(function (s) {
                var n = (s.nombre || '?').replace(/"/g, '&quot;');
                return '<option value="' + s.id + '">' + n + '</option>';
            }).join('');
            travelingShopSel.onchange = function () {
                var tid = travelingShopSel.value;
                travelingShopItemSel.innerHTML = '<option value="">— Elige un ítem —</option>';
                if (!tid) return;
                var s = withCatalog.find(function (x) { return x.id === tid; });
                if (!s || !s.inventario) return;
                s.inventario.forEach(function (it, i) {
                    var name = (it.name || it.title || '?').replace(/"/g, '&quot;');
                    var price = it.price != null ? it.price + ' GP' : '';
                    travelingShopItemSel.appendChild(new Option(price ? name + ' — ' + price : name, String(i)));
                });
            };
        }

        if (missionSel) {
            missionSel.innerHTML = '<option value="">— Ninguna —</option>';
            db.collection('missions').where('status', '==', 'draft').limit(100).get().then(function (snap) {
                snap.docs.forEach(function (d) {
                    var data = d.data();
                    var title = (data.title || data.nombre || 'Sin título').replace(/"/g, '&quot;');
                    missionSel.appendChild(new Option(title + ' (borrador)', d.id));
                });
            }).catch(function (err) {
                console.error('Error cargando misiones para regla:', err);
                if (typeof showToast === 'function') showToast('No se pudieron cargar las misiones', true);
            });
        }
        if (typeof openModal === 'function') openModal('traveling-analisis-rule-modal');
    };

    window.travelingShopModalSaveRule = function () {
        var editIdEl = document.getElementById('traveling-analisis-rule-edit-id');
        var shopIdEl = document.getElementById('traveling-analisis-rule-shop-id');
        var sourceSel = document.getElementById('traveling-analisis-rule-source');
        var playerSel = document.getElementById('traveling-analisis-rule-player');
        var itemSel = document.getElementById('traveling-analisis-rule-item');
        var cityShopSel = document.getElementById('traveling-analisis-rule-city-shop');
        var cityShopItemSel = document.getElementById('traveling-analisis-rule-city-shop-item');
        var travelingShopSel = document.getElementById('traveling-analisis-rule-traveling-shop');
        var travelingShopItemSel = document.getElementById('traveling-analisis-rule-traveling-shop-item');
        var msgEl = document.getElementById('traveling-analisis-rule-message');
        var missionSel = document.getElementById('traveling-analisis-rule-mission');
        var shopId = (shopIdEl && shopIdEl.value) || '';
        var ruleId = (editIdEl && editIdEl.value) ? editIdEl.value.trim() : '';
        var message = (msgEl && msgEl.value) ? msgEl.value.trim() : '';
        var missionId = (missionSel && missionSel.value) ? missionSel.value.trim() : '';
        if (!shopId) {
            if (typeof showToast === 'function') showToast('Error: tienda no indicada', true);
            return;
        }
        if (!message && !missionId) {
            if (typeof showToast === 'function') showToast('Indica al menos mensaje o misión', true);
            return;
        }
        var source = (sourceSel && sourceSel.value) || 'player';
        var playerId = null;
        var item = null;

        function saveRule() {
            if (ruleId) {
                if (typeof updateTravelingAnalisisRule !== 'function') {
                    if (typeof showToast === 'function') showToast('Error: updateTravelingAnalisisRule no disponible', true);
                    return Promise.reject();
                }
                return updateTravelingAnalisisRule(ruleId, shopId, playerId || '__all__', item, message, missionId || null);
            }
            if (typeof createTravelingAnalisisRule !== 'function') {
                if (typeof showToast === 'function') showToast('Error: createTravelingAnalisisRule no disponible', true);
                return Promise.reject();
            }
            return createTravelingAnalisisRule(shopId, playerId || '__all__', item, message, missionId || null);
        }

        function onSaveSuccess() {
            if (typeof showToast === 'function') showToast(ruleId ? 'Regla actualizada' : 'Regla guardada');
            if (editIdEl) editIdEl.value = '';
            window._editingTravelingRule = null;
            if (typeof closeModal === 'function') closeModal('traveling-analisis-rule-modal');
            if (window._travelingShopVerReglasShopId === shopId) {
                var listEl = document.getElementById('traveling-shop-ver-reglas-list');
                if (listEl) renderTravelingShopRulesList(shopId, listEl);
            }
        }

        if (source === 'player') {
            playerId = (playerSel && playerSel.value) || '';
            var rawVal = (itemSel && itemSel.value) || '';
            if (!playerId || !rawVal) {
                if (typeof showToast === 'function') showToast('Elige jugador e ítem', true);
                return;
            }
            if (rawVal === 'edit_keep' && window._editingTravelingRule) {
                item = { name: window._editingTravelingRule.itemName, effect: window._editingTravelingRule.itemEffect, price: window._editingTravelingRule.itemPrice };
                saveRule().then(onSaveSuccess).catch(function (err) {
                    if (typeof showToast === 'function') showToast('Error: ' + (err.message || err), true);
                });
                return;
            }
            var idx = parseInt(rawVal, 10);
            if (isNaN(idx) || idx < 0) {
                if (typeof showToast === 'function') showToast('Elige un ítem', true);
                return;
            }
            db.collection('players').doc(playerId).get().then(function (doc) {
                var inv = (doc.exists && doc.data().inventario) ? doc.data().inventario : [];
                item = inv[idx];
                if (!item) {
                    if (typeof showToast === 'function') showToast('Ítem no encontrado. Elige de nuevo.', true);
                    return Promise.reject(new Error('item not found'));
                }
                return saveRule();
            }).then(onSaveSuccess).catch(function (err) {
                if (err && err.message !== 'item not found' && typeof showToast === 'function') showToast('Error: ' + (err.message || err), true);
            });
            return;
        }

        if (source === 'city_shop') {
            var cid = (cityShopSel && cityShopSel.value) || '';
            var cRaw = (cityShopItemSel && cityShopItemSel.value) || '';
            if (!cid || !cRaw) {
                if (typeof showToast === 'function') showToast('Elige tienda e ítem', true);
                return;
            }
            var sh = (typeof window.shopsData !== 'undefined' ? window.shopsData : []) || [];
            var cityShop = sh.find(function (x) { return x.id === cid; });
            if (!cityShop) {
                if (typeof showToast === 'function') showToast('Tienda no encontrada', true);
                return;
            }
            var cIdx = parseInt(cRaw, 10);
            var isPosada = (cityShop.tipo || '').toLowerCase() === 'posada';
            var cityItems = isPosada && typeof window.getPosadaRooms === 'function' ? window.getPosadaRooms(cityShop) : (cityShop.inventario || []);
            item = cityItems[cIdx];
            if (!item) {
                if (typeof showToast === 'function') showToast('Ítem no encontrado', true);
                return;
            }
            if (isPosada) item = { name: item.nombre, effect: item.efecto || '', price: item.precio };
            saveRule().then(onSaveSuccess).catch(function (err) {
                if (typeof showToast === 'function') showToast('Error: ' + (err.message || err), true);
            });
            return;
        }

        if (source === 'traveling_shop') {
            var tid = (travelingShopSel && travelingShopSel.value) || '';
            var tRaw = (travelingShopItemSel && travelingShopItemSel.value) || '';
            if (!tid || !tRaw) {
                if (typeof showToast === 'function') showToast('Elige tienda ambulante e ítem', true);
                return;
            }
            var tShops = (typeof window.travelingShopsData !== 'undefined' ? window.travelingShopsData : []) || [];
            var tShop = tShops.find(function (x) { return x.id === tid; });
            if (!tShop || !tShop.inventario) {
                if (typeof showToast === 'function') showToast('Tienda o ítem no encontrado', true);
                return;
            }
            var tIdx = parseInt(tRaw, 10);
            item = tShop.inventario[tIdx];
            if (!item) {
                if (typeof showToast === 'function') showToast('Ítem no encontrado', true);
                return;
            }
            saveRule().then(onSaveSuccess).catch(function (err) {
                if (typeof showToast === 'function') showToast('Error: ' + (err.message || err), true);
            });
        }
    };

    var _travelingShopModalItems = [];

    function renderTravelingShopModalInventario(items) {
        _travelingShopModalItems = (items || []).map(function (it) {
            return {
                name: it.name || '',
                price: it.price != null ? it.price : 0,
                desc: it.desc || it.description || '',
                visible: it.visible !== false
            };
        });
        var listEl = document.getElementById('traveling-shop-modal-inventario-list');
        if (!listEl) return;
        if (!_travelingShopModalItems.length) {
            listEl.innerHTML = '<p style="color:#8b7355; font-size:0.9em;">Sin ítems. Añade con el botón de abajo.</p>';
            return;
        }
        listEl.innerHTML = _travelingShopModalItems.map(function (item, i) {
            var nameEsc = (item.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            var descEsc = (item.desc || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            var visibleChecked = item.visible ? ' checked' : '';
            return '<div class="form-group" style="margin-bottom:16px; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid #4a3c31;">' +
                '<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">' +
                '<input type="text" class="searchbar" placeholder="Nombre del mapa" data-ts-item-name="' + i + '" value="' + nameEsc + '" style="flex:1; min-width:120px;">' +
                '<input type="number" class="searchbar" placeholder="GP" data-ts-item-price="' + i + '" value="' + (item.price || 0) + '" min="0" style="width:80px;">' +
                '<button type="button" class="btn btn-small btn-danger" onclick="travelingShopModalRemoveItem(' + i + ')">Quitar</button></div>' +
                '<label style="color:#8b7355; font-size:0.85em; display:block; margin-bottom:4px;">Descripción del mapa (el jugador la verá en la tienda)</label>' +
                '<textarea class="searchbar" placeholder="Ej: Señala la cueva del dragón dormido..." data-ts-item-desc="' + i + '" rows="2" style="width:100%; resize:vertical; min-height:50px;">' + descEsc + '</textarea>' +
                '<label style="display:flex; align-items:center; gap:8px; margin-top:8px; color:#a89878; font-size:0.9em;"><input type="checkbox" data-ts-item-visible="' + i + '"' + visibleChecked + '> Visible para jugadores (si no está marcado, el ítem no aparece en la app del jugador)</label></div>';
        }).join('');
    }

    /** Abre el modal para añadir un ítem a una tienda (fuera del modal Editar). Solo para tiendas tipo catálogo. */
    window.openTravelingShopAddItemModal = function (shopId) {
        var shop = (window.travelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (!shop) return;
        var titleEl = document.getElementById('traveling-shop-add-item-title');
        var shopIdEl = document.getElementById('traveling-shop-add-item-shop-id');
        var nameEl = document.getElementById('traveling-shop-add-item-name');
        var priceEl = document.getElementById('traveling-shop-add-item-price');
        var descEl = document.getElementById('traveling-shop-add-item-desc');
        var visibleEl = document.getElementById('traveling-shop-add-item-visible');
        if (!titleEl || !shopIdEl || !nameEl || !priceEl) return;
        shopIdEl.value = shopId;
        titleEl.textContent = '➕ Añadir ítem a ' + (shop.nombre || 'Tienda de mapas');
        nameEl.value = '';
        priceEl.value = '0';
        if (descEl) descEl.value = '';
        if (visibleEl) visibleEl.checked = true;
        if (typeof openModal === 'function') openModal('traveling-shop-add-item-modal');
    };

    /** Guarda el nuevo ítem en la tienda y cierra el modal. */
    window.saveTravelingShopAddItem = function () {
        var shopIdEl = document.getElementById('traveling-shop-add-item-shop-id');
        var nameEl = document.getElementById('traveling-shop-add-item-name');
        var priceEl = document.getElementById('traveling-shop-add-item-price');
        var descEl = document.getElementById('traveling-shop-add-item-desc');
        var shopId = shopIdEl && shopIdEl.value ? shopIdEl.value.trim() : '';
        if (!shopId) {
            if (typeof showToast === 'function') showToast('Error: tienda no indicada', true);
            return;
        }
        var name = nameEl && nameEl.value ? nameEl.value.trim() : '';
        if (!name) {
            if (typeof showToast === 'function') showToast('Escribe el nombre del mapa', true);
            return;
        }
        var price = priceEl ? (parseInt(priceEl.value, 10) || 0) : 0;
        var desc = descEl && descEl.value ? descEl.value.trim() : '';
        var visibleEl = document.getElementById('traveling-shop-add-item-visible');
        var visible = visibleEl ? visibleEl.checked : true;
        var shop = (window.travelingShopsData || []).find(function (s) { return s.id === shopId; });
        var inventario = Array.isArray(shop && shop.inventario) ? shop.inventario.slice() : [];
        inventario.push({ name: name, price: price, desc: desc || undefined, visible: visible });
        db.collection(COLLECTION).doc(shopId).update({ inventario: inventario })
            .then(function () {
                if (typeof closeModal === 'function') closeModal('traveling-shop-add-item-modal');
                if (typeof showToast === 'function') showToast('Ítem añadido');
                fetchTravelingShopsDM();
            })
            .catch(function (err) {
                console.error(err);
                if (typeof showToast === 'function') showToast('Error al guardar: ' + (err.message || err), true);
            });
    };

    window.travelingShopModalRemoveItem = function (index) {
        _travelingShopModalItems.splice(index, 1);
        renderTravelingShopModalInventario(_travelingShopModalItems);
    };

    function collectTravelingShopFormInventario() {
        var listEl = document.getElementById('traveling-shop-modal-inventario-list');
        if (!listEl) return [];
        var nameInputs = listEl.querySelectorAll('[data-ts-item-name]');
        var out = [];
        for (var i = 0; i < nameInputs.length; i++) {
            var nameIn = nameInputs[i];
            var priceIn = listEl.querySelector('[data-ts-item-price="' + i + '"]');
            var descIn = listEl.querySelector('[data-ts-item-desc="' + i + '"]');
            var visibleIn = listEl.querySelector('[data-ts-item-visible="' + i + '"]');
            var name = nameIn ? nameIn.value.trim() : '';
            var price = priceIn ? (parseInt(priceIn.value, 10) || 0) : 0;
            var desc = descIn ? descIn.value.trim() : '';
            var visible = visibleIn ? visibleIn.checked : true;
            if (name) out.push({ name: name, price: price, desc: desc || undefined, visible: visible });
        }
        return out;
    }

    function saveTravelingShopModal() {
        var idEl = document.getElementById('traveling-shop-modal-id');
        var nombreEl = document.getElementById('traveling-shop-modal-nombre');
        var visibleEl = document.getElementById('traveling-shop-modal-visible');
        var locacionEl = document.getElementById('traveling-shop-modal-locacion');
        if (!nombreEl || !visibleEl) return;
        var id = (idEl && idEl.value) || '';
        var nombre = nombreEl.value.trim();
        if (!nombre) {
            if (typeof showToast === 'function') showToast('Escribe un nombre para la tienda', true);
            return;
        }
        var tipoEl = document.getElementById('traveling-shop-modal-tipo');
        var tipo = (tipoEl && tipoEl.value) || TIPO_CATALOGO;
        var activa = visibleEl.checked;
        var locacionMensaje = (locacionEl && locacionEl.value) ? locacionEl.value : LOCACION_DESCONOCIDA;
        var imagenEl = document.getElementById('traveling-shop-modal-imagen');
        var imagenUrl = (imagenEl && imagenEl.value) ? imagenEl.value.trim() : '';
        var payload = {
            nombre: nombre,
            tipo: tipo,
            imagenUrl: imagenUrl,
            activa: activa,
            locacionMensaje: locacionMensaje,
            inventario: tipo === TIPO_ANALISIS_OBJETOS ? [] : collectTravelingShopFormInventario()
        };
        var p = id
            ? db.collection(COLLECTION).doc(id).update(payload)
            : db.collection(COLLECTION).add(payload);
        p.then(function () {
            if (typeof closeModal === 'function') closeModal('traveling-shop-modal');
            if (typeof showToast === 'function') showToast('Tienda ambulante guardada');
            fetchTravelingShopsDM();
        }).catch(function (err) {
            console.error(err);
            if (typeof showToast === 'function') showToast('Error al guardar: ' + (err.message || err), true);
        });
    }

    window.editTravelingShop = function (id) {
        openTravelingShopModal(id);
    };

    window.openTravelingShopModal = function () {
        openTravelingShopModal(null);
    };

    window.saveTravelingShopModal = saveTravelingShopModal;

    function toggleTravelingShopActiva(id) {
        var s = (window.travelingShopsData || []).find(function (x) { return x.id === id; });
        if (!s) return;
        db.collection(COLLECTION).doc(id).update({ activa: !s.activa })
            .then(function () { fetchTravelingShopsDM(); if (typeof showToast === 'function') showToast(s.activa ? 'Tienda desactivada' : 'Tienda activada'); })
            .catch(function (err) { if (typeof showToast === 'function') showToast('Error: ' + (err.message || err), true); });
    }
    window.toggleTravelingShopActiva = toggleTravelingShopActiva;

    /** Cambia la ubicación entre "Cerca de ti" (pueden entrar) y "Locación desconocida" (no pueden entrar). */
    function toggleTravelingShopLocacion(id) {
        var s = (window.travelingShopsData || []).find(function (x) { return x.id === id; });
        if (!s) return;
        var actual = s.locacionMensaje || LOCACION_DESCONOCIDA;
        var nueva = actual === CERCA_DE_TI ? LOCACION_DESCONOCIDA : CERCA_DE_TI;
        db.collection(COLLECTION).doc(id).update({ locacionMensaje: nueva })
            .then(function () {
                fetchTravelingShopsDM();
                if (typeof showToast === 'function') showToast(nueva === CERCA_DE_TI ? 'Ubicación: Cerca de ti' : 'Ubicación: Locación desconocida');
            })
            .catch(function (err) { if (typeof showToast === 'function') showToast('Error: ' + (err.message || err), true); });
    }
    window.toggleTravelingShopLocacion = toggleTravelingShopLocacion;

    function deleteTravelingShop(id) {
        var s = (window.travelingShopsData || []).find(function (x) { return x.id === id; });
        if (!confirm('¿Eliminar la tienda ambulante "' + (s && s.nombre ? s.nombre : '') + '"?')) return;
        db.collection(COLLECTION).doc(id).delete()
            .then(function () { fetchTravelingShopsDM(); if (typeof showToast === 'function') showToast('Tienda eliminada'); })
            .catch(function (err) { if (typeof showToast === 'function') showToast('Error: ' + (err.message || err), true); });
    }
    window.deleteTravelingShop = deleteTravelingShop;

    /** Jugador: abre la tienda ambulante (catálogo o análisis según el tipo). */
    window.openTravelingShop = function (shopId) {
        var shop = (window.playerTravelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (!shop) return;
        if ((shop.locacionMensaje || LOCACION_DESCONOCIDA) !== CERCA_DE_TI) {
            if (typeof showToast === 'function') showToast('No puedes entrar; ubicación desconocida.', true);
            return;
        }
        if (shop.tipo === TIPO_ANALISIS_OBJETOS) {
            openTravelingShopAnalisis(shopId);
        } else {
            openTravelingShopCatalog(shopId);
        }
    };

    /** Carrito tienda de mapas: [{ itemIndex, item: { name, price, effect, rarity, ... }, qty }] */
    var travelingShopCatalogCart = [];
    window._travelingShopCatalogShopId = null;

    function itemToCartCopy(item) {
        var copy = { name: item.name || 'Item', price: item.price != null ? item.price : 0, effect: item.effect || '', rarity: (item.rarity || 'común') };
        if (item.desc) copy.desc = item.desc;
        if (item.quantity != null) copy.quantity = item.quantity;
        return copy;
    }

    function updateTravelingShopCatalogCart() {
        var cartEl = document.getElementById('player-shop-catalog-cart');
        var cartItemsEl = document.getElementById('player-shop-catalog-cart-items');
        var subtotalEl = document.getElementById('player-shop-catalog-cart-subtotal');
        var totalEl = document.getElementById('player-shop-catalog-cart-total');
        var badgeEl = document.getElementById('player-shop-catalog-cart-badge');
        if (!cartEl || !cartItemsEl) return;
        if (travelingShopCatalogCart.length === 0) {
            cartEl.style.display = 'none';
            if (typeof updateShopCartBadge === 'function') updateShopCartBadge('player-shop-catalog-cart-badge', 0);
            return;
        }
        var totalCount = travelingShopCatalogCart.reduce(function (sum, entry) { return sum + (entry.qty || 1); }, 0);
        if (typeof updateShopCartBadge === 'function') updateShopCartBadge('player-shop-catalog-cart-badge', totalCount);
        var subtotal = 0;
        cartItemsEl.innerHTML = travelingShopCatalogCart.map(function (entry, cartIdx) {
            var it = entry.item;
            var qty = entry.qty || 1;
            var lineTotal = (it.price != null ? it.price : 0) * qty;
            subtotal += lineTotal;
            var nameEsc = String(it.name || 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            var cartIdxEsc = String(cartIdx).replace(/'/g, "\\'");
            return '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #4a3c31;">' +
                '<div style="flex:1;"><div style="color:#d4c4a8; font-weight:bold;">' + nameEsc + '</div>' +
                '<div style="color:#8b7355; font-size:0.85em;">' + qty + ' × ' + (it.price != null ? it.price : 0) + ' GP</div></div>' +
                '<div style="display:flex; align-items:center; gap:12px;"><span class="gold-value">' + lineTotal.toLocaleString() + ' GP</span>' +
                '<button class="btn btn-small btn-danger" onclick="typeof removeFromTravelingShopCatalogCart===\'function\'&&removeFromTravelingShopCatalogCart(' + cartIdx + ')" style="padding:4px 8px; font-size:0.8em;">🗑️</button></div></div>';
        }).join('');
        if (subtotalEl) subtotalEl.textContent = subtotal.toLocaleString() + ' GP';
        if (totalEl) totalEl.textContent = subtotal.toLocaleString() + ' GP';
        /* No mostrar el panel aquí: solo se ve al pulsar "Ir al carrito" (view-cart), como en la posada */
    }

    window.addToTravelingShopCatalogCart = function (shopId, itemIndex) {
        var shop = (window.playerTravelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (!shop || !shop.inventario || !shop.inventario[itemIndex]) return;
        var item = shop.inventario[itemIndex];
        var existing = travelingShopCatalogCart.find(function (e) { return e.itemIndex === itemIndex; });
        if (existing) {
            existing.qty = (existing.qty || 1) + 1;
        } else {
            travelingShopCatalogCart.push({ itemIndex: itemIndex, item: itemToCartCopy(item), qty: 1 });
        }
        updateTravelingShopCatalogCart();
    };

    window.removeFromTravelingShopCatalogCart = function (cartIndex) {
        if (cartIndex < 0 || cartIndex >= travelingShopCatalogCart.length) return;
        travelingShopCatalogCart.splice(cartIndex, 1);
        updateTravelingShopCatalogCart();
        if (typeof showToast === 'function') showToast('Eliminado del carrito');
    };

    window.clearTravelingShopCatalogCart = function () {
        travelingShopCatalogCart = [];
        updateTravelingShopCatalogCart();
        if (typeof showToast === 'function') showToast('Carrito vaciado');
    };

    /** Jugador: tienda de mapas — listado con Añadir al carrito, carrito y recibo (estilo posada). */
    function openTravelingShopCatalog(shopId) {
        var shop = (window.playerTravelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (!shop) return;
        window._travelingShopCatalogShopId = shopId;
        travelingShopCatalogCart = [];
        var bodyEl = document.getElementById('player-shop-catalog-body');
        var recEl = document.getElementById('player-shop-catalog-receipt');
        var titleEl = document.getElementById('player-shop-catalog-title');
        var listEl = document.getElementById('player-shop-catalog-list');
        var oroEl = document.getElementById('player-shop-catalog-oro');
        if (!titleEl || !listEl) return;
        if (bodyEl) { bodyEl.style.display = 'block'; bodyEl.classList.remove('view-cart'); }
        if (recEl) { recEl.style.display = 'none'; recEl.innerHTML = ''; }
        titleEl.textContent = '🗺️ ' + (shop.nombre || 'Tienda de mapas');
        var fullInventario = shop.inventario || [];
        var visibleWithIndex = [];
        fullInventario.forEach(function (item, idx) {
            if (item.visible !== false) visibleWithIndex.push({ item: item, realIndex: idx });
        });
        var rarityColors = { común: '#2ecc71', inusual: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };
        if (!visibleWithIndex.length) {
            listEl.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No hay ítems visibles en esta tienda.</p>';
        } else {
            var shopIdEsc = (shopId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            listEl.innerHTML = visibleWithIndex.map(function (entry) {
                var item = entry.item;
                var realIdx = entry.realIndex;
                var desc = (typeof getItemDesc === 'function' ? getItemDesc(item) : null) || (item.desc || '—');
                var r = (item.rarity || 'común').toLowerCase();
                if (r === 'infrecuente') r = 'inusual';
                var price = item.price != null ? item.price : 0;
                return '<div class="player-posada-cuarto" style="background:rgba(0,0,0,0.25); border:1px solid #4a3c31; border-radius:10px; padding:16px; margin-bottom:12px;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">' +
                    '<div style="flex:1; min-width:180px;">' +
                    '<h4 style="color:#d4af37; font-family:\'Cinzel\',serif; margin-bottom:6px;">' + (item.name || 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</h4>' +
                    '<p style="color:#8b7355; font-size:0.9em; line-height:1.4;">' + (desc || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' +
                    (item.rarity ? '<span style="background:' + (rarityColors[r] || '#555') + '; padding:2px 8px; border-radius:10px; font-size:0.75em;">' + (r.charAt(0).toUpperCase() + r.slice(1)) + '</span>' : '') +
                    '</div>' +
                    '<div style="flex-shrink:0; text-align:right;"><div class="gold-value" style="margin-bottom:8px;">' + (price > 0 ? price + ' GP' : '—') + '</div>' +
                    '<button type="button" class="btn btn-small" onclick="typeof addToTravelingShopCatalogCart===\'function\'&&addToTravelingShopCatalogCart(\'' + shopIdEsc + '\', ' + realIdx + ')">+ Añadir</button></div></div></div>';
            }).join('');
        }
        updateTravelingShopCatalogCart();
        if (oroEl) {
            var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            if (user && typeof getCurrentPlayerDoc === 'function') {
                getCurrentPlayerDoc().then(function (doc) {
                    var oro = (doc.exists && doc.data().oro != null) ? doc.data().oro : 0;
                    oroEl.innerHTML = '<strong>' + oro.toLocaleString() + '</strong> GP';
                }).catch(function () { oroEl.innerHTML = '<strong>0</strong> GP'; });
            } else {
                oroEl.innerHTML = '<strong>0</strong> GP';
            }
        }
        if (typeof openModal === 'function') openModal('player-shop-catalog-modal');
    }

    /** Mensajes aleatorios al final del recibo tipo mapa del tesoro. */
    var TREASURE_MAP_MESSAGES = [
        'El lugar existe. Lo improbable es que regresen.',
        'El mapa no miente. El camino sí.',
        'Donde termina el mapa empieza la aventura.',
        'Guardad este papel. Algún día os dirá por qué.',
        'Lo que compraste hoy ya estaba escrito en otro mapa.',
        'El tesoro era el viaje. El viaje es este recibo.',
        'Quien sigue la brújula no se pierde. Quien la ignora, tampoco.',
        'No todos los que buscan encuentran. Tú ya encontraste esto.'
    ];

    function buildTreasureMapReceiptHTML(opts) {
        var shopName = opts.shopName || 'Tienda de mapas';
        var items = opts.items || [];
        var totalValue = opts.totalValue || '0 GP';
        var modalId = (opts.modalId || 'player-shop-catalog-modal').replace(/"/g, '&quot;');
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var now = new Date();
        var dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        var msg = TREASURE_MAP_MESSAGES[Math.floor(Math.random() * TREASURE_MAP_MESSAGES.length)];
        var rows = items.map(function (i) {
            return '<div class="player-treasure-map-row"><span class="player-treasure-map-item-name">' + esc(i.name) + '</span><span class="player-treasure-map-item-price">' + esc(i.line) + '</span></div>';
        }).join('');
        var closeOnclick = 'closeModal(&quot;' + modalId + '&quot;)';
        return '<div class="player-treasure-map-receipt">' +
            '<div class="player-treasure-map-header">' +
            '<div class="player-treasure-map-logo">🗺️</div>' +
            '<div class="player-treasure-map-title">MAPA DEL TESORO</div>' +
            '<div class="player-treasure-map-subtitle">' + esc(shopName) + '</div>' +
            '</div>' +
            '<div class="player-treasure-map-body">' + rows + '</div>' +
            '<div class="player-treasure-map-total"><span>Oro entregado</span><span class="player-treasure-map-total-value">' + esc(totalValue) + '</span></div>' +
            '<div class="player-treasure-map-date">' + esc(dateStr) + '</div>' +
            '<div class="player-treasure-map-message">' + esc(msg) + '</div>' +
            '<button type="button" class="btn player-treasure-map-close" onclick="' + closeOnclick + '">Cerrar</button>' +
            '</div>';
    }

    /** Confirmar compra: descuenta oro, añade ítems al inventario y muestra recibo. */
    window.checkoutTravelingShopCatalog = function () {
        var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!user || !user.id) {
            if (typeof showToast === 'function') showToast('Debes estar logueado como personaje', true);
            return;
        }
        if (travelingShopCatalogCart.length === 0) {
            if (typeof showToast === 'function') showToast('Añade algo al carrito para continuar', true);
            return;
        }
        var shopId = window._travelingShopCatalogShopId;
        var shop = (window.playerTravelingShopsData || []).find(function (s) { return s.id === shopId; });
        var shopName = (shop && shop.nombre) ? shop.nombre : 'Tienda de mapas';
        var total = travelingShopCatalogCart.reduce(function (sum, entry) {
            return sum + (entry.item.price != null ? entry.item.price : 0) * (entry.qty || 1);
        }, 0);
        var docRef = db.collection('players').doc(user.id);
        getCurrentPlayerDoc().then(function (doc) {
            if (!doc.exists) {
                if (typeof showToast === 'function') showToast('No se encontró el personaje', true);
                return Promise.reject(new Error('no doc'));
            }
            var data = doc.data();
            var oro = (data.oro != null ? data.oro : 0);
            if (oro < total) {
                if (typeof showToast === 'function') showToast('No tienes suficiente oro. Necesitas ' + total.toLocaleString() + ' GP. Tienes ' + oro.toLocaleString() + ' GP.', true);
                return Promise.reject(new Error('no oro'));
            }
            var newOro = oro - total;
            var inventario = Array.isArray(data.inventario) ? data.inventario.slice() : [];
            travelingShopCatalogCart.forEach(function (entry) {
                var qty = entry.qty || 1;
                var it = entry.item;
                for (var i = 0; i < qty; i++) {
                    var copy = { name: it.name || 'Item', price: it.price, effect: it.effect || '', rarity: it.rarity || 'común' };
                    if (it.desc) copy.desc = it.desc;
                    inventario.push(copy);
                }
            });
            return docRef.update({ oro: newOro, inventario: inventario }).then(function () { return { newOro: newOro, total: total }; });
        }).then(function (result) {
            if (!result) return;
            var itemsBought = travelingShopCatalogCart.map(function (entry) {
                var it = entry.item;
                return { item: { name: it.name, effect: it.effect || it.desc || '', price: it.price }, qty: entry.qty || 1 };
            });
            if (itemsBought.length && typeof runAutomationRules === 'function') {
                runAutomationRules('traveling_' + shopId, itemsBought, user.id, user.nombre || 'Jugador');
            }
            var receiptItems = travelingShopCatalogCart.map(function (entry) {
                var it = entry.item;
                var qty = entry.qty || 1;
                var lineTotal = (it.price != null ? it.price : 0) * qty;
                return { name: (qty > 1 ? qty + '× ' : '') + (it.name || 'Item'), line: lineTotal.toLocaleString() + ' GP' };
            });
            var bodyEl = document.getElementById('player-shop-catalog-body');
            var recEl = document.getElementById('player-shop-catalog-receipt');
            if (bodyEl) bodyEl.style.display = 'none';
            if (recEl) {
                recEl.innerHTML = buildTreasureMapReceiptHTML({
                    shopName: shopName,
                    items: receiptItems,
                    totalValue: result.total.toLocaleString() + ' GP',
                    modalId: 'player-shop-catalog-modal'
                });
                recEl.style.display = 'block';
            }
            travelingShopCatalogCart = [];
            updateTravelingShopCatalogCart();
            if (typeof lastPlayerViewData !== 'undefined' && lastPlayerViewData) {
                lastPlayerViewData.oro = result.newOro;
                if (typeof renderPlayerView === 'function') renderPlayerView(lastPlayerViewData);
            }
            var oroEl = document.getElementById('player-shop-catalog-oro');
            if (oroEl) oroEl.innerHTML = '<strong>' + result.newOro.toLocaleString() + '</strong> GP';
            if (typeof showToast === 'function') showToast('Compra realizada. ' + result.total.toLocaleString() + ' GP descontados.');
        }).catch(function (err) {
            if (err && err.message !== 'no doc' && err.message !== 'no oro') console.error(err);
        });
    };

    /** Jugador: análisis de objetos del inventario del personaje (no vende). Incluye buscador por nombre y filtro por rareza. */
    var RARITY_COLORS_ANALISIS = { común: '#2ecc71', inusual: '#3498db', rara: '#9b59b6', legendaria: '#e74c3c' };

    /** Normaliza texto para búsqueda: minúsculas y sin acentos (ej. "mágico" -> "magico"). */
    function normalizeForSearch(s) {
        if (typeof s !== 'string') return '';
        return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    }

    function renderAnalisisObjetosFiltered() {
        var listEl = document.getElementById('player-analisis-objetos-list');
        if (!listEl) return;
        var inv = window._analisisObjetosFullInventario || [];
        var searchEl = document.getElementById('player-analisis-objetos-search');
        var rarityEl = document.getElementById('player-analisis-objetos-rarity');
        var search = (searchEl && searchEl.value) ? normalizeForSearch(searchEl.value.trim()) : '';
        var rarityFilter = (rarityEl && rarityEl.value) ? (rarityEl.value.trim().toLowerCase()) : '';
        var getDesc = typeof getItemDesc === 'function' ? getItemDesc : function (it) { return it.effect || it.desc || it.description || it.descripcion || ''; };
        var withIndex = inv.map(function (item, i) { return { item: item, index: i }; });
        var filtered = withIndex.filter(function (entry) {
            var item = entry.item;
            var name = (item.name || item.nombre || '').toString();
            var desc = (getDesc(item) || '').toString();
            var nameNorm = normalizeForSearch(name);
            var descNorm = normalizeForSearch(desc);
            var rarity = (item.rarity || 'común').toString().toLowerCase().trim();
            if (rarity === 'infrecuente') rarity = 'inusual';
            if (search && nameNorm.indexOf(search) === -1 && descNorm.indexOf(search) === -1) return false;
            if (rarityFilter && rarity !== rarityFilter) return false;
            return true;
        });
        var selectedIdx = window._analisisObjetosSelectedIndex;
        var searchWrapEl = document.getElementById('player-analisis-objetos-search-wrap');
        if (searchWrapEl) {
            if (selectedIdx != null) {
                searchWrapEl.classList.remove('expanded');
                var toggleBtn = searchWrapEl.querySelector('.player-shop-search-toggle');
                if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
            }
        }
        if (!filtered.length) {
            listEl.innerHTML = '<p style="color:#8b7355; text-align:center; padding:24px;">' + (inv.length ? 'Ningún objeto coincide con el filtro.' : 'No tienes objetos en el inventario para analizar.') + '</p>';
            var btn = document.getElementById('player-analisis-objetos-btn');
            if (btn) btn.disabled = true;
            return;
        }
        listEl.innerHTML = filtered.map(function (entry) {
            var item = entry.item;
            var idx = entry.index;
            var isSelected = selectedIdx === idx;
            var desc = getDesc(item) || '—';
            var name = item.name || item.nombre || 'Objeto';
            var rarity = (item.rarity || 'común').toLowerCase();
            if (rarity === 'infrecuente') rarity = 'inusual';
            var price = item.price != null ? item.price + ' GP' : '—';
            var qty = item.quantity != null && item.quantity > 1 ? ' ×' + item.quantity : '';
            var cardStyle = 'margin-bottom:12px; cursor:pointer;' + (isSelected ? ' border-left:3px solid #c9a227;' : '');
            return '<div class="mini-card" style="' + cardStyle + '" onclick="typeof playerAnalisisObjetoSeleccionar===\'function\'&&playerAnalisisObjetoSeleccionar(' + idx + ')" role="button" tabindex="0">' +
                '<div class="mini-card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
                '<span>' + name + qty + '</span>' +
                '<span style="background:' + (RARITY_COLORS_ANALISIS[rarity] || '#555') + '; padding:2px 8px; border-radius:10px; font-size:0.75em;">' + (rarity.charAt(0).toUpperCase() + rarity.slice(1)) + '</span>' +
                '</div>' +
                '<div class="mini-card-info" style="min-height:1.2em; color:#d4c4a8;">' + desc + '</div>' +
                '<div style="color:#8b7355; font-size:0.9em;">Valor estimado: ' + price + '</div>' +
                '</div>';
        }).join('');
        var btn = document.getElementById('player-analisis-objetos-btn');
        if (btn) btn.disabled = selectedIdx == null;
    }

    /** Jugador: selecciona un objeto de la lista para analizar (solo uno a la vez). */
    window.playerAnalisisObjetoSeleccionar = function (index) {
        var inv = window._analisisObjetosFullInventario || [];
        var idx = typeof index === 'number' ? index : parseInt(index, 10);
        if (isNaN(idx) || idx < 0 || !inv[idx]) return;
        window._analisisObjetosSelectedIndex = window._analisisObjetosSelectedIndex === idx ? null : idx;
        renderAnalisisObjetosFiltered();
    }

    function openTravelingShopAnalisis(shopId) {
        var shop = (window.playerTravelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (!shop) return;
        var titleEl = document.getElementById('player-analisis-objetos-title');
        var listEl = document.getElementById('player-analisis-objetos-list');
        var searchEl = document.getElementById('player-analisis-objetos-search');
        var rarityEl = document.getElementById('player-analisis-objetos-rarity');
        if (!titleEl || !listEl) return;
        titleEl.textContent = '🔍 ' + (shop.nombre || 'Análisis de objetos');
        if (searchEl) searchEl.value = '';
        if (rarityEl) rarityEl.value = '';
        listEl.innerHTML = '<p style="color:#8b7355; text-align:center;">Cargando inventario…</p>';
        if (typeof openModal === 'function') openModal('player-analisis-objetos-modal');

        if (!window._analisisObjetosListeners) {
            window._analisisObjetosListeners = true;
            if (searchEl) searchEl.addEventListener('input', renderAnalisisObjetosFiltered);
            if (rarityEl) rarityEl.addEventListener('change', renderAnalisisObjetosFiltered);
        }

        function onLoaded(inventario) {
            window._analisisObjetosFullInventario = inventario || [];
            window._analisisObjetosTravelingShopId = shopId;
            window._analisisObjetosSelectedIndex = null;
            var inventarioWrapEl = document.getElementById('player-analisis-objetos-inventario-wrap');
            if (inventarioWrapEl) inventarioWrapEl.style.display = '';
            renderAnalisisObjetosFiltered();
            var resultEl = document.getElementById('player-analisis-objetos-result');
            if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
            var btn = document.getElementById('player-analisis-objetos-btn');
            if (btn) btn.disabled = true;
        }

        if (typeof getCurrentPlayerDoc === 'function') {
            getCurrentPlayerDoc().then(function (doc) {
                var inv = (doc && doc.data && doc.data()) ? (doc.data().inventario || []) : [];
                onLoaded(inv);
            }).catch(function () { onLoaded([]); });
        } else {
            var data = typeof lastPlayerViewData !== 'undefined' ? lastPlayerViewData : null;
            onLoaded(data && data.inventario ? data.inventario : []);
        }
    }

    /** Jugador: dentro del modal Análisis de objetos, analiza el objeto seleccionado o el índice pasado (dispara reglas y muestra resultado). */
    window.playerAnalisisObjetoAnalizar = function (index) {
        var resultEl = document.getElementById('player-analisis-objetos-result');
        var inv = window._analisisObjetosFullInventario || [];
        var idx = typeof index === 'number' ? index : (index !== undefined && index !== null ? parseInt(index, 10) : window._analisisObjetosSelectedIndex);
        if (idx == null || isNaN(idx) || idx < 0 || !inv[idx]) {
            if (typeof showToast === 'function') showToast('Selecciona un objeto de la lista', true);
            return;
        }
        var item = inv[idx];
        var getDesc = typeof getItemDesc === 'function' ? getItemDesc : function (it) { return it.effect || it.desc || it.description || it.descripcion || ''; };
        var name = item.name || item.nombre || 'Objeto';
        var rarity = (item.rarity || 'común').toString().toLowerCase();
        if (rarity === 'infrecuente') rarity = 'inusual';
        var desc = getDesc(item) || '—';
        var price = item.price != null ? item.price + ' GP' : '—';
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

        var inventarioWrapEl = document.getElementById('player-analisis-objetos-inventario-wrap');
        if (inventarioWrapEl) inventarioWrapEl.style.display = 'none';
        if (resultEl) {
            resultEl.innerHTML = '<p style="color:#8b7355; font-size:0.9em; margin-bottom:8px;">Resultado del análisis:</p>' +
                '<div class="analisis-progress-wrap"><div class="analisis-progress-bar"></div></div>' +
                '<p style="color:#d4c4a8; font-size:0.95em;">Analizando…</p>';
            resultEl.style.display = 'block';
        }

        var mensajesEspeciales = [
            'Algo se agita en las profundidades del objeto… El destino tiene algo que decirte.',
            'El experto enmudece un instante. Sus ojos brillan. "Este no es un hallazgo cualquiera."',
            'Una corriente extraña recorre el objeto. El experto asiente en silencio. Algo te espera.',
            'El análisis se detiene. "Esto… esto no debería estar aquí."',
            'El objeto pulsa con una luz tenue. El experto te mira con respeto. "Ahora."',
            'Un susurro antiguo parece salir del objeto. El experto anota algo y guarda silencio.',
            'El experto retrocede un paso. "¿Dónde conseguiste esto?" No dice nada más.',
            'Algo en el objeto responde al tacto del experto. Su expresión cambia por completo.',
            'La rareza de este objeto no es del mundo que crees.',
            'El análisis revela más de lo que muestra. El experto guarda silencio.'
        ];
        var mensajesComunes = [
            'Tu objeto es común. El mundo no gira alrededor tuyo.',
            'Nada especial. Siguiente.',
            'Común y corriente. El experto bosteza.',
            'Tu objeto es tan común que ni el experto se molesta en mirarlo dos veces.',
            'Común. Muy común. ¿Tienes algo que no sea de la tienda del pueblo?',
            'El experto suspira. "Otro más del montón." Tu objeto es común.',
            'Tu objeto es común. La emoción no está en este análisis.',
            'Común como el pan. El mundo no gira alrededor tuyo, por si acaso.',
            'Nada que ver aquí. Objeto común. Siguiente cliente.',
            'Tu objeto es común. El experto ya está pensando en la cena.'
        ];
        var done = function (result) {
            var isAlreadyTriggered = result === 'already_triggered';
            var msg, msgStyle;
            if (result === true) {
                msg = mensajesEspeciales[Math.floor(Math.random() * mensajesEspeciales.length)];
                msgStyle = 'color:#2ecc71; font-size:1.15em; font-weight:700; margin-bottom:0; text-shadow:0 0 12px rgba(46,204,113,0.5); line-height:1.35;';
            } else if (isAlreadyTriggered) {
                msg = 'Esto ya se ha visto. El experto se aburre.';
                msgStyle = 'color:#c9a227; font-size:1.15em; font-weight:700; margin-bottom:0; text-shadow:0 0 12px rgba(201,162,39,0.5); line-height:1.35;';
            } else {
                msg = mensajesComunes[Math.floor(Math.random() * mensajesComunes.length)];
                msgStyle = 'color:#e74c3c; font-size:1.15em; font-weight:700; margin-bottom:0; text-shadow:0 0 12px rgba(231,76,60,0.4); line-height:1.35;';
            }
            if (typeof showToast === 'function') {
                if (result === true) showToast('Tu objeto es especial.');
                else if (isAlreadyTriggered) showToast('Esto ya se ha visto. El experto se aburre.');
                else showToast('Objeto analizado.');
            }
            if (resultEl) {
                resultEl.innerHTML = '<p style="color:#8b7355; font-size:0.9em; margin-bottom:8px;">Resultado del análisis:</p>' +
                    '<p style="' + msgStyle + '">' + esc(msg) + '</p>';
            }
        };

        var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        var minDelay = new Promise(function (r) { setTimeout(r, 1200); });
        if (user && typeof runAutomationRulesForPlayerUse === 'function') {
            var shopIdForRules = window._analisisObjetosTravelingShopId || null;
            Promise.all([minDelay, runAutomationRulesForPlayerUse(user.id, item, user.nombre || 'Jugador', shopIdForRules)])
                .then(function (arr) { done(arr[1]); })
                .catch(function () { done(false); });
        } else {
            minDelay.then(function () { done(false); });
        }
    };

    window.fetchTravelingShopsDM = fetchTravelingShopsDM;
    window.fetchTravelingShopsPlayer = fetchTravelingShopsPlayer;
    window.renderTravelingShopsDM = renderTravelingShopsDM;
    window.renderPlayerTravelingShops = renderPlayerTravelingShops;
    window.renderAnalisisObjetosFiltered = renderAnalisisObjetosFiltered;

    function initTravelingShopsTabs() {
        var dmSection = document.getElementById('traveling-shops');
        var playerSection = document.getElementById('player-traveling-shops');
        if (dmSection) {
            if (dmSection.classList.contains('active')) fetchTravelingShopsDM();
            var observer = new MutationObserver(function () {
                if (dmSection.classList.contains('active')) fetchTravelingShopsDM();
            });
            observer.observe(dmSection, { attributes: true, attributeFilter: ['class'] });
        }
        if (playerSection) {
            if (playerSection.classList.contains('active')) fetchTravelingShopsPlayer();
            var obsPlayer = new MutationObserver(function () {
                if (playerSection.classList.contains('active')) fetchTravelingShopsPlayer();
            });
            obsPlayer.observe(playerSection, { attributes: true, attributeFilter: ['class'] });
        }
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initTravelingShopsTabs);
        } else {
            initTravelingShopsTabs();
        }
    }
})();
