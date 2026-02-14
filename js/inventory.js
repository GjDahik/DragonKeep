// ==================== SHOP INVENTORY ====================
function manageInventory(shopId) {
    const shop = shopsData.find(s => s.id === shopId);
    if (!shop) return;

    // Las tiendas de batalla NO venden ítems
    const tipo = (shop.tipo || '').toLowerCase();
    if (tipo === 'batalla') {
        showToast('Las tiendas de batalla no tienen inventario. Configura enemigos con el botón 🥊.', true);
        return;
    }
    
    document.getElementById('inventory-shop-id').value = shopId;
    document.getElementById('inventory-shop-name').textContent = shop.nombre;
    document.getElementById('inventory-modal-title').textContent = '📦 Inventario - ' + shop.nombre;

    const searchEl = document.getElementById('inventory-search');
    if (searchEl) searchEl.value = '';
    const wrap = document.querySelector('#inventory-modal .player-shop-search-wrap');
    if (wrap) wrap.classList.remove('expanded');
    _populateInventoryFilterButtons(shop);
    
    // Reset CSV import section
    document.getElementById('csv-import-section').style.display = 'none';
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-file-preview').style.display = 'none';
    document.getElementById('csv-upload-btn').style.display = 'none';
    
    // Initialize file input listener if not already initialized
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput && !fileInput.hasAttribute('data-listener-attached')) {
        fileInput.setAttribute('data-listener-attached', 'true');
        fileInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                document.getElementById('csv-file-name').textContent = file.name;
                document.getElementById('csv-file-preview').style.display = 'block';
                document.getElementById('csv-upload-btn').style.display = 'block';
            }
        });
    }
    
    renderInventoryList(shop);
    openModal('inventory-modal');
}

function downloadShopInventoryExcel() {
    if (typeof XLSX === 'undefined') {
        showToast('Exportación Excel no disponible', true);
        return;
    }
    var shopId = document.getElementById('inventory-shop-id').value;
    if (!shopId) {
        showToast('Error: no hay tienda seleccionada', true);
        return;
    }
    var shop = shopsData.find(function(s) { return s.id === shopId; });
    if (!shop) {
        showToast('Tienda no encontrada', true);
        return;
    }
    var items = shop.inventario || [];
    if (items.length === 0) {
        showToast('El inventario de esta tienda está vacío');
        return;
    }
    var allKeys = {};
    var priorityKeys = ['name', 'price', 'effect', 'rarity', 'type', 'categoria', 'tier', 'tipo', 'section', 'tab', 'desc', 'damage', 'damageType', 'ac', 'tiempo', 'nivel', 'efLabel', 'avg'];
    priorityKeys.forEach(function(k) { allKeys[k] = true; });
    items.forEach(function(item) {
        Object.keys(item).forEach(function(k) { allKeys[k] = true; });
    });
    var headers = priorityKeys.filter(function(k) { return allKeys[k]; });
    var rest = Object.keys(allKeys).filter(function(k) { return headers.indexOf(k) === -1; }).sort();
    headers = headers.concat(rest);
    var rows = [headers];
    items.forEach(function(item) {
        rows.push(headers.map(function(h) {
            var v = item[h];
            if (v === undefined || v === null) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
        }));
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(rows);
    var sheetName = (shop.nombre || 'inventario').replace(/[\\/*?:\[\]]/g, '').trim().slice(0, 31) || 'Inventario';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    var filename = 'inventario_' + (shop.nombre || shopId).replace(/[\\/*?:\[\]\s]/g, '_').trim() + '.xlsx';
    XLSX.writeFile(wb, filename);
    if (typeof showToast === 'function') showToast('Descargado: ' + filename);
}

function _inventoryItemMatchesSearch(item, searchText) {
    if (!searchText) return true;
    const name = (item.name || '').toLowerCase();
    const effect = (item.effect || item.desc || '').toLowerCase();
    const priceStr = String(item.price != null ? item.price : '');
    return name.includes(searchText) || effect.includes(searchText) || priceStr.includes(searchText);
}

function _inventoryItemMatchesFilter(item, filterValue, shop) {
    if (!filterValue) return true;
    const tipo = (shop.tipo || '').toLowerCase();
    const isTaberna = tipo === 'taberna';
    const isHerreria = tipo === 'herreria';
    const isArqueria = tipo === 'arqueria';
    const [key, val] = filterValue.indexOf(':') >= 0 ? filterValue.split(':') : ['', ''];
    if (key === 'rarity') return (item.rarity || 'común').toLowerCase() === val;
    if (key === 'type' && isTaberna) return (item.type || 'drink').toLowerCase() === val;
    if (key === 'categoria') return (item.categoria || 'servir').toLowerCase() === val;
    if (key === 'tier') return Number(item.tier) === Number(val) || (item.tier == null && Number(val) === 1);
    if (key === 'tipo' && isHerreria) return (item.tipo || 'arma').toLowerCase() === val;
    if (key === 'tab') return (item.tab || 'flechas').toLowerCase() === val;
    if (key === 'type' && isArqueria) return (item.type || 'common').toLowerCase() === val;
    if (key === 'section') return (item.section || '').toLowerCase() === val;
    return true;
}

function _populateInventoryFilterButtons(shop) {
    const container = document.getElementById('inventory-filter-buttons');
    if (!container) return;
    container.innerHTML = '';
    const items = shop.inventario || [];
    const tipo = (shop.tipo || '').toLowerCase();
    const isTaberna = tipo === 'taberna';
    const isHerreria = tipo === 'herreria';
    const isArqueria = tipo === 'arqueria';
    const isBiblioteca = tipo === 'biblioteca';
    const isEmporio = tipo === 'emporio';
    const tierNames = { 1: 'Nv. 1-5', 6: 'Nv. 6-10', 11: 'Nv. 11-15', 16: 'Nv. 16-20' };
    const artesaniasTabLabels = { flechas: 'Flechas', ropa: 'Ropa', servicios: 'Servicios' };
    const bibliotecaSectionLabels = { magia: 'Magia', fabricacion: 'Fabricación', cocina: 'Cocina', trampas: 'Trampas', alquimia: 'Alquimia', mapas: 'Mapas', restringida: 'Restringida' };
    const emporioSectionLabels = { materiales: 'Materiales', raros: 'Raros', mapas: 'Mapas', otros: 'Otros' };

    const addBtn = (label, value) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-small' + (value ? ' btn-secondary' : '');
        btn.dataset.filter = value || '';
        btn.textContent = label;
        btn.addEventListener('click', function () {
            container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            applyInventoryFilters();
        });
        if (!value) btn.classList.add('active');
        container.appendChild(btn);
    };

    addBtn('Todos', '');
    const seen = {};
    if (isTaberna) {
        items.forEach(it => {
            const t = (it.type || 'drink').toLowerCase();
            const c = (it.categoria || 'servir').toLowerCase();
            if (!seen['type:' + t]) { seen['type:' + t] = true; addBtn(t === 'food' ? 'Comida' : 'Bebida', 'type:' + t); }
            if (!seen['categoria:' + c]) { seen['categoria:' + c] = true; addBtn(c === 'llevar' ? 'Para llevar' : 'Para servir', 'categoria:' + c); }
        });
    } else if (isHerreria) {
        items.forEach(it => {
            const tier = it.tier != null ? it.tier : 1;
            const tip = (it.tipo || 'arma').toLowerCase();
            if (!seen['tier:' + tier]) { seen['tier:' + tier] = true; addBtn(tierNames[tier] || 'Nv. ' + tier, 'tier:' + tier); }
            if (!seen['tipo:' + tip]) { seen['tipo:' + tip] = true; addBtn(tip === 'armadura' ? 'Armadura' : (tip === 'servicio' ? 'Servicio' : 'Arma'), 'tipo:' + tip); }
        });
    } else if (isArqueria) {
        items.forEach(it => {
            const tab = (it.tab || 'flechas').toLowerCase();
            const ty = (it.type || 'common').toLowerCase();
            if (!seen['tab:' + tab]) { seen['tab:' + tab] = true; addBtn(artesaniasTabLabels[tab] || tab, 'tab:' + tab); }
            if (!seen['type:' + ty]) { seen['type:' + ty] = true; addBtn(ty === 'magic' ? 'Mágico' : (ty === 'elemental' ? 'Elemental' : (ty === 'gear' ? 'Equipo' : (ty === 'service' ? 'Servicio' : 'Común'))), 'type:' + ty); }
        });
    } else if (isBiblioteca) {
        items.forEach(it => {
            const sec = (it.section || 'magia').toLowerCase();
            if (!seen['section:' + sec]) { seen['section:' + sec] = true; addBtn(bibliotecaSectionLabels[sec] || sec, 'section:' + sec); }
        });
    } else if (isEmporio) {
        items.forEach(it => {
            const sec = (it.section || 'otros').toLowerCase();
            const r = (it.rarity || 'común').toLowerCase();
            if (!seen['section:' + sec]) { seen['section:' + sec] = true; addBtn(emporioSectionLabels[sec] || sec, 'section:' + sec); }
            if (!seen['rarity:' + r]) { seen['rarity:' + r] = true; addBtn(r === 'inusual' ? 'Inusual' : (r === 'rara' ? 'Rara' : (r === 'legendaria' ? 'Legendaria' : 'Común')), 'rarity:' + r); }
        });
    } else {
        items.forEach(it => {
            const r = (it.rarity || 'común').toLowerCase();
            if (!seen['rarity:' + r]) { seen['rarity:' + r] = true; addBtn(r === 'inusual' ? 'Inusual' : (r === 'rara' ? 'Rara' : (r === 'legendaria' ? 'Legendaria' : 'Común')), 'rarity:' + r); }
        });
    }
}

function applyInventoryFilters() {
    const shopId = document.getElementById('inventory-shop-id').value;
    if (!shopId) return;
    const shop = shopsData.find(s => s.id === shopId);
    if (shop) renderInventoryList(shop);
}
window.applyInventoryFilters = applyInventoryFilters;

function renderInventoryList(shop) {
    const list = document.getElementById('inventory-list');
    const searchEl = document.getElementById('inventory-search');
    const filterBtns = document.getElementById('inventory-filter-buttons');
    const activeBtn = filterBtns ? filterBtns.querySelector('button.active') : null;
    const filterValue = (activeBtn && activeBtn.dataset.filter) ? activeBtn.dataset.filter : '';
    const searchText = (searchEl && searchEl.value || '').trim().toLowerCase();
    const items = shop.inventario || [];
    const tipo = (shop.tipo || '').toLowerCase();
    const isTaberna = tipo === 'taberna';
    const isHerreria = tipo === 'herreria';
    const isArqueria = tipo === 'arqueria';
    const isBiblioteca = tipo === 'biblioteca';
    const isEmporio = tipo === 'emporio';

    const filtered = items.map((item, realIndex) => ({ item, realIndex })).filter(({ item }) => _inventoryItemMatchesSearch(item, searchText) && _inventoryItemMatchesFilter(item, filterValue, shop));

    if (items.length === 0) {
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No hay items en el inventario</p>';
        return;
    }
    if (filtered.length === 0) {
        list.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">Ningún item coincide con la búsqueda.</p>';
        return;
    }

    const rarityColors = {
        'común': '#2ecc71',
        'inusual': '#3498db',
        'infrecuente': '#3498db',
        'rara': '#9b59b6',
        'legendaria': '#e74c3c'
    };
    const tierNames = { 1: 'Nv. 1-5', 6: 'Nv. 6-10', 11: 'Nv. 11-15', 16: 'Nv. 16-20' };
    const tabernaBadge = (item) => {
        if (!isTaberna || !item.type) return '';
        const t = (item.type || 'drink').toLowerCase();
        const c = (item.categoria || 'servir').toLowerCase();
        const tipoLabel = t === 'food' ? '🍖 Comida' : '🍺 Bebida';
        const cat = c === 'llevar' ? 'Para llevar' : 'Para servir';
        return `<span style="color:#8b7355; font-size:0.8em;">${tipoLabel} · ${cat}</span>`;
    };
    const forjaBadge = (item) => {
        if (!isHerreria) return '';
        var tier = item.tier != null ? item.tier : 1;
        var t = (item.tipo || 'arma').toLowerCase();
        var tierLabel = tierNames[tier] || 'Nv. 1-5';
        var tipoLabel = t === 'armadura' ? '🛡️ Armadura' : (t === 'servicio' ? '🔧 Servicio' : '⚔️ Arma');
        var extra = t === 'armadura' && item.ac ? ' CA: ' + item.ac : (item.damage ? ' ' + item.damage + (item.damageType ? ' ' + item.damageType : '') : '');
        return `<span style="color:#8b7355; font-size:0.8em;">${tipoLabel} · ${tierLabel}${extra ? ' · ' + extra.trim() : ''}</span>`;
    };
    const artesaniasTypeLabels = { common: 'Común', magic: 'Mágico', elemental: 'Elemental', gear: 'Equipo', service: 'Servicio' };
    const artesaniasTabLabels = { flechas: '🏹 Flechas', ropa: '👕 Ropa', servicios: '🔧 Servicios' };
    const artesaniasBadge = (item) => {
        if (!isArqueria) return '';
        var t = (item.type || 'common').toLowerCase();
        var tab = (item.tab || 'flechas').toLowerCase();
        return `<span style="color:#8b7355; font-size:0.8em;">${artesaniasTabLabels[tab] || tab} · ${artesaniasTypeLabels[t] || t}</span>`;
    };
    const bibliotecaSectionLabels = { magia: '✨ Magia', fabricacion: '⚔️ Fabricación', cocina: '🍲 Cocina', trampas: '⚙️ Trampas', alquimia: '🧪 Alquimia', mapas: '🗺️ Mapas', restringida: '🔒 Restringida' };
    const bibliotecaBadge = (item) => {
        if (!isBiblioteca || !item.section) return '';
        var sec = (item.section || '').toLowerCase();
        return `<span style="color:#8b7355; font-size:0.8em;">${bibliotecaSectionLabels[sec] || sec}</span>`;
    };
    const emporioSectionLabels = { materiales: '🧪 Materiales', raros: '💎 Raros', mapas: '🗺️ Mapas', otros: '📦 Otros' };
    const emporioBadge = (item) => {
        if (!isEmporio || !item.section) return '';
        var sec = (item.section || '').toLowerCase();
        return `<span style="color:#8b7355; font-size:0.8em;">${emporioSectionLabels[sec] || sec}</span>`;
    };

    list.innerHTML = filtered.map(({ item, realIndex }) => `
        <div class="mini-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="flex:1;">
                <div class="mini-card-title" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    ${item.name}
                    ${!isTaberna && !isHerreria && !isArqueria && !isBiblioteca && !isEmporio ? `<span style="background:${rarityColors[item.rarity] || '#888'}; padding:2px 8px; border-radius:10px; font-size:0.7em; text-transform:uppercase;">${item.rarity || 'común'}</span>` : ''}
                    ${isHerreria && item.tier ? `<span style="background:#5c3a21; color:#ffcc00; padding:2px 8px; border-radius:10px; font-size:0.7em;">${tierNames[item.tier] || item.tier}</span>` : ''}
                    ${isArqueria && item.tab ? `<span style="background:#3d5c3d; color:#aed581; padding:2px 8px; border-radius:10px; font-size:0.7em;">${artesaniasTabLabels[item.tab] || item.tab}</span>` : ''}
                    ${isBiblioteca && item.section ? `<span style="background:#4a3a5a; color:#c9a0dc; padding:2px 8px; border-radius:10px; font-size:0.7em;">${bibliotecaSectionLabels[item.section.toLowerCase()] || item.section}</span>` : ''}
                    ${isEmporio && item.section ? `<span style="background:#4a5a6a; color:#9ca8b8; padding:2px 8px; border-radius:10px; font-size:0.7em;">${emporioSectionLabels[(item.section||'').toLowerCase()] || item.section}</span>` : ''}
                    ${isEmporio ? `<span style="background:${rarityColors[item.rarity] || '#888'}; padding:2px 8px; border-radius:10px; font-size:0.7em;">${item.rarity || 'común'}</span>` : ''}
                </div>
                ${isTaberna ? `<div style="margin-bottom:4px;">${tabernaBadge(item)}</div>` : ''}
                ${isHerreria ? `<div style="margin-bottom:4px;">${forjaBadge(item)}</div>` : ''}
                ${isArqueria ? `<div style="margin-bottom:4px;">${artesaniasBadge(item)}</div>` : ''}
                ${isBiblioteca ? `<div style="margin-bottom:4px;">${bibliotecaBadge(item)}</div>` : ''}
                ${isEmporio ? `<div style="margin-bottom:4px;">${emporioBadge(item)}</div>` : ''}
                <div class="mini-card-info">${item.effect || item.desc || ''}</div>
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <span style="color:#f1c40f; font-weight:bold;">${item.price} GP</span>
                    ${(item.quantity != null && item.quantity >= 2) ? '<span style="color:#8b7355; font-size:0.9em;">Cant: ' + item.quantity + '</span>' : ''}
                </div>
            </div>
            <div class="mini-card-actions">
                <button class="btn btn-small btn-secondary" onclick="editItem(${realIndex})">✏️</button>
                <button class="btn btn-small btn-danger" onclick="deleteItem(${realIndex})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function openItemModal(index = null) {
    const shopId = document.getElementById('inventory-shop-id').value;
    const shop = shopsData.find(s => s.id === shopId);
    var tipo = (shop && shop.tipo || '').toLowerCase();
    var isTaberna = tipo === 'taberna';
    var isHerreria = tipo === 'herreria';
    var isArqueria = tipo === 'arqueria';
    var isBiblioteca = tipo === 'biblioteca';
    var isEmporio = tipo === 'emporio';
    var isGeneric = !isTaberna && !isHerreria && !isArqueria && !isBiblioteca;

    document.getElementById('item-index').value = index !== null ? index : -1;
    document.getElementById('item-name').value = '';
    document.getElementById('item-price').value = 50;
    var qtyEl = document.getElementById('item-quantity');
    if (qtyEl) qtyEl.value = 1;
    document.getElementById('item-effect').value = '';
    document.getElementById('item-avg').value = '';
    document.getElementById('item-rarity').value = 'común';
    document.getElementById('item-type').value = 'drink';
    document.getElementById('item-categoria').value = 'servir';
    document.getElementById('item-tier').value = '1';
    document.getElementById('item-tipo-forja').value = 'arma';
    document.getElementById('item-damage').value = '';
    document.getElementById('item-damage-type').value = '';
    document.getElementById('item-ac').value = '';
    document.getElementById('item-tab').value = 'flechas';
    document.getElementById('item-type-art').value = 'common';
    document.getElementById('item-section').value = 'magia';
    document.getElementById('item-tiempo').value = '';
    document.getElementById('item-nivel').value = '';
    document.getElementById('item-eflabel').value = '';

    document.getElementById('item-generic-fields').style.display = isGeneric ? 'block' : 'none';
    document.getElementById('item-taberna-fields').style.display = isTaberna ? 'block' : 'none';
    document.getElementById('item-forja-fields').style.display = isHerreria ? 'block' : 'none';
    document.getElementById('item-artesanias-fields').style.display = isArqueria ? 'block' : 'none';
    var emporioFieldsEl = document.getElementById('item-emporio-fields');
    if (emporioFieldsEl) emporioFieldsEl.style.display = isEmporio ? 'block' : 'none';
    document.getElementById('item-biblioteca-fields').style.display = isBiblioteca ? 'block' : 'none';

    var sectionEmporioEl = document.getElementById('item-section-emporio');
    if (sectionEmporioEl) sectionEmporioEl.value = 'materiales';

    if (isHerreria) {
        var armaExt = document.getElementById('item-forja-arma-extras');
        var armExt = document.getElementById('item-forja-armadura-extras');
        if (armaExt) armaExt.style.display = 'block';
        if (armExt) armExt.style.display = 'none';
        var tipoForjaEl = document.getElementById('item-tipo-forja');
        if (tipoForjaEl && !tipoForjaEl.hasAttribute('data-item-listener')) {
            tipoForjaEl.setAttribute('data-item-listener', '1');
            tipoForjaEl.addEventListener('change', function() {
                var t = (document.getElementById('item-tipo-forja').value || 'arma').toLowerCase();
                var armaE = document.getElementById('item-forja-arma-extras');
                var armE = document.getElementById('item-forja-armadura-extras');
                if (armaE) armaE.style.display = t === 'arma' ? 'block' : 'none';
                if (armE) armE.style.display = t === 'armadura' ? 'block' : 'none';
            });
        }
    }

    if (index !== null && index >= 0 && shop) {
        var item = shop.inventario[index];
        document.getElementById('item-name').value = item.name || '';
        document.getElementById('item-price').value = item.price != null ? item.price : 50;
        var qtyEl = document.getElementById('item-quantity');
        if (qtyEl) qtyEl.value = (item.quantity != null && item.quantity >= 1) ? item.quantity : 1;
        document.getElementById('item-effect').value = item.effect || item.desc || '';
        document.getElementById('item-modal-title').textContent = '✏️ Editar Item';
        if (isGeneric) {
            document.getElementById('item-avg').value = item.avg || '';
            document.getElementById('item-rarity').value = (item.rarity || 'común').toLowerCase();
        }
        if (isTaberna && item) {
            document.getElementById('item-type').value = (item.type || 'drink').toLowerCase();
            document.getElementById('item-categoria').value = (item.categoria || 'servir').toLowerCase();
        }
        if (isHerreria && item) {
            document.getElementById('item-tier').value = String(item.tier != null ? item.tier : 1);
            document.getElementById('item-tipo-forja').value = (item.tipo || 'arma').toLowerCase();
            document.getElementById('item-damage').value = item.damage || '';
            document.getElementById('item-damage-type').value = item.damageType || '';
            document.getElementById('item-ac').value = item.ac || '';
            var t = (item.tipo || 'arma').toLowerCase();
            var ae = document.getElementById('item-forja-arma-extras');
            var ame = document.getElementById('item-forja-armadura-extras');
            if (ae) ae.style.display = t === 'arma' ? 'block' : 'none';
            if (ame) ame.style.display = t === 'armadura' ? 'block' : 'none';
        }
        if (isArqueria && item) {
            document.getElementById('item-tab').value = (item.tab || 'flechas').toLowerCase();
            document.getElementById('item-type-art').value = (item.type || 'common').toLowerCase();
        }
        if (isBiblioteca && item) {
            document.getElementById('item-section').value = (item.section || 'magia').toLowerCase();
            document.getElementById('item-tiempo').value = item.tiempo || '';
            document.getElementById('item-nivel').value = item.nivel != null ? item.nivel : '';
            document.getElementById('item-eflabel').value = item.efLabel || '';
        }
        if (isEmporio && item) {
            if (sectionEmporioEl) sectionEmporioEl.value = (item.section || 'materiales').toLowerCase();
        }
    }

    openModal('item-modal');
}

function editItem(index) {
    openItemModal(index);
}

function saveItem() {
    const shopId = document.getElementById('inventory-shop-id').value;
    const index = parseInt(document.getElementById('item-index').value, 10);
    const shop = shopsData.find(s => s.id === shopId);
    const tipo = (shop && shop.tipo || '').toLowerCase();
    const isTaberna = tipo === 'taberna';
    const isHerreria = tipo === 'herreria';
    const isArqueria = tipo === 'arqueria';
    const isBiblioteca = tipo === 'biblioteca';
    const isEmporio = tipo === 'emporio';
    const isGeneric = !isTaberna && !isHerreria && !isArqueria && !isBiblioteca;

    const name = (document.getElementById('item-name').value || '').trim();
    const price = parseInt(document.getElementById('item-price').value, 10);
    const effect = (document.getElementById('item-effect').value || '').trim();
    const qtyEl = document.getElementById('item-quantity');
    const quantity = (qtyEl && parseInt(qtyEl.value, 10) >= 1) ? parseInt(qtyEl.value, 10) : 1;

    if (!shop) {
        showToast('Tienda no encontrada', true);
        return;
    }
    if (!name) {
        showToast('Nombre requerido', true);
        return;
    }
    if (isNaN(price) || price < 0) {
        showToast('Precio inválido', true);
        return;
    }

    var item = { name: name, price: price, effect: effect };
    if (quantity > 1) item.quantity = quantity;
    if (isGeneric) {
        item.avg = (document.getElementById('item-avg').value || '').trim();
        item.rarity = (document.getElementById('item-rarity').value || 'común').toLowerCase();
    }
    if (isTaberna) {
        item.type = (document.getElementById('item-type').value || 'drink').toLowerCase();
        item.categoria = (document.getElementById('item-categoria').value || 'servir').toLowerCase();
    }
    if (isHerreria) {
        item.tier = parseInt(document.getElementById('item-tier').value, 10) || 1;
        item.tipo = (document.getElementById('item-tipo-forja').value || 'arma').toLowerCase();
        item.desc = effect;
        if (item.tipo === 'arma') {
            var d = (document.getElementById('item-damage').value || '').trim();
            var dt = (document.getElementById('item-damage-type').value || '').trim();
            if (d) item.damage = d;
            if (dt) item.damageType = dt;
        } else if (item.tipo === 'armadura') {
            var ac = (document.getElementById('item-ac').value || '').trim();
            if (ac) item.ac = ac;
            item.isArmor = true;
        }
    }
    if (isArqueria) {
        item.type = (document.getElementById('item-type-art').value || 'common').toLowerCase();
        item.tab = (document.getElementById('item-tab').value || 'flechas').toLowerCase();
        item.desc = effect;
    }
    if (isBiblioteca) {
        item.section = (document.getElementById('item-section').value || 'magia').toLowerCase();
        item.desc = effect;
        var tiempo = (document.getElementById('item-tiempo').value || '').trim();
        var nivelVal = document.getElementById('item-nivel').value;
        var efLabel = (document.getElementById('item-eflabel').value || '').trim();
        if (tiempo) item.tiempo = tiempo;
        if (nivelVal !== '' && nivelVal !== null) { var n = parseInt(nivelVal, 10); if (!isNaN(n)) item.nivel = n; }
        if (efLabel) item.efLabel = efLabel;
    }
    if (isEmporio) {
        var sectionEmporioEl = document.getElementById('item-section-emporio');
        item.section = (sectionEmporioEl ? sectionEmporioEl.value : 'materiales').toLowerCase();
        item.rarity = (document.getElementById('item-rarity').value || 'común').toLowerCase();
    }

    var inventario = shop.inventario || [];
    if (index >= 0) {
        inventario[index] = item;
    } else {
        inventario.push(item);
    }

    db.collection('shops').doc(shopId).update({ inventario })
        .then(() => {
            showToast(index >= 0 ? 'Item actualizado' : 'Item agregado');
            closeModal('item-modal');
            shop.inventario = inventario;
            renderInventoryList(shop);
            if (typeof refreshCityData === 'function' && shop.ciudadId) refreshCityData(shop.ciudadId);
        })
        .catch(function(e) { showToast('Error: ' + e.message, true); });
}

function deleteItem(index) {
    if (!confirm('¿Eliminar este item?')) return;
    
    const shopId = document.getElementById('inventory-shop-id').value;
    const shop = shopsData.find(s => s.id === shopId);
    let inventario = shop.inventario || [];
    
    inventario.splice(index, 1);

    db.collection('shops').doc(shopId).update({ inventario })
        .then(() => {
            showToast('Item eliminado');
            shop.inventario = inventario;
            renderInventoryList(shop);
            if (typeof refreshCityData === 'function' && shop.ciudadId) refreshCityData(shop.ciudadId);
        })
        .catch(e => showToast('Error: ' + e.message, true));
}

function deleteAllItems() {
    const shopId = document.getElementById('inventory-shop-id').value;
    if (!shopId) return;
    const shop = shopsData.find(s => s.id === shopId);
    if (!shop) {
        showToast('Tienda no encontrada', true);
        return;
    }
    const count = (shop.inventario || []).length;
    if (count === 0) {
        showToast('El inventario ya está vacío');
        return;
    }
    if (!confirm('¿Borrar todos los ' + count + ' items del inventario de «' + (shop.nombre || 'esta tienda') + '»? Esta acción no se puede deshacer.')) return;

    const inventario = [];
    db.collection('shops').doc(shopId).update({ inventario })
        .then(() => {
            showToast('Se borraron todos los items (' + count + ')');
            shop.inventario = inventario;
            renderInventoryList(shop);
            if (typeof refreshCityData === 'function' && shop.ciudadId) refreshCityData(shop.ciudadId);
        })
        .catch(e => showToast('Error: ' + e.message, true));
}

// ==================== HELPER: Leer archivos CSV o Excel ====================
function readFileAsTextForInventory(file, callback) {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    if (isExcel) {
        // Leer archivo Excel usando SheetJS
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Obtener la primera hoja
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convertir a CSV
                const csv = XLSX.utils.sheet_to_csv(worksheet);
                callback(csv);
            } catch (error) {
                showToast('Error al leer archivo Excel: ' + error.message, true);
                console.error('Error leyendo Excel:', error);
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        // Leer archivo CSV normalmente
        const reader = new FileReader();
        reader.onload = function(e) {
            callback(e.target.result);
        };
        reader.readAsText(file);
    }
}

// ==================== CSV IMPORT FOR INVENTORY ====================
// Plantillas CSV para descargar (mismo contenido que csv-plantillas/)
const CSV_TEMPLATES = {
    pociones: {
        filename: '01_pociones_emporio_batalla.csv',
        content: `name,price,effect,avg,rarity
Poción de Curación,50,Recupera 2d4+2 HP,7 HP,común
Poción de Curación Superior,150,Recupera 4d4+4 HP,14 HP,inusual
Espada +1,350,+1 a ataques y daño,,inusual
Capa Élfica,2500,Ventaja en tiradas de Sigilo,,rara
Anillo de Protección,5000,+1 a CA y tiradas de salvación,,legendaria
`
    },
    taberna: {
        filename: '02_taberna.csv',
        content: `name,price,effect,type,categoria
Cerveza de Barril,2,,drink,servir
Vino de la Casa,3,,drink,servir
Elixir de Resistencia,8,+1 a tiradas de Constitución (1h),drink,llevar
Sopa del Día,4,,food,servir
Ración de Viaje,5,,food,llevar
Pan Curativo,12,Cura 1d4+1 PG,food,llevar
`
    },
    forja: {
        filename: '03_forja_herreria.csv',
        content: `name,price,tier,type,damage,damageType,ac,desc
Espada Corta,50,1,arma,1d6,Perforante,,Arma marcial, Ligera, Finesse
Daga,25,1,arma,1d4,Perforante,,Arma simple, Ligera, Finesse, Arrojadiza
Hacha de Mano,30,1,arma,1d6,Cortante,,Arma simple, Ligera, Arrojadiza
Maza,30,1,arma,1d6,Contundente,,Arma simple
Armadura de Cuero,75,1,armadura,,,12 + DES,Armadura ligera
Espada Larga,200,6,arma,1d8 (1d10),Cortante,,Arma marcial, Versátil
Hacha de Batalla,200,6,arma,1d8 (1d10),Cortante,,Arma marcial, Versátil
Martillo de Guerra,200,6,arma,1d8 (1d10),Contundente,,Arma marcial, Versátil
Estoque (Rapier),250,6,arma,1d8,Perforante,,Arma marcial, Finesse
Armadura de Hierro,300,6,armadura,,,16,Armadura pesada, FUE 13
Espada Grande,600,11,arma,2d6,Cortante,,Arma marcial, Pesada, Dos manos
Gran Hacha,600,11,arma,1d12,Cortante,,Arma marcial, Pesada, Dos manos
Mazo (Maul),600,11,arma,2d6,Contundente,,Arma marcial, Pesada, Dos manos
Alabarda,650,11,arma,1d10,Cortante,,Arma marcial, Alcance, Dos manos
Armadura de Acero,750,11,armadura,,,17,Armadura pesada, FUE 15
Espada Rúnica Legendaria,2500,16,arma,2d6+1d6⚡,Cortante+Elemental,,Arma mágica +2
Gran Hacha de Hierro Oscuro,3000,16,arma,1d12+1d8🔥,Cortante+Fuego,,Arma mágica +2
Martillo de los Titanes,3500,16,arma,2d6+1d6⚡,Contundente+Trueno,,Arma mágica +2
Armadura de Hierro Oscuro,3500,16,armadura,,,18+1,Armadura legendaria, Res. fuego
Reparación Básica,25,1,servicio,,,,Restauración de armas y armaduras dañadas
Herramientas Simples,50,1,servicio,,,,Martillos, hachas, picos de calidad
Afilado Express,50,6,servicio,,,,+1 daño hasta el final de la sesión
Reparación Armas Mágicas,500,6,servicio,,,,Restauración de propiedades mágicas
Mejora con Runas,1000,6,servicio,,,,Inscripción de runas mágicas
Reparación de Reliquias,1500,11,servicio,,,,Restauración de artefactos antiguos
Mejoras Mágicas Avanzadas,1200,11,servicio,,,,Potenciación de propiedades mágicas
Creación de Reliquias,5000,16,servicio,,,,Forja de artefactos míticos
Mejoras Legendarias,1500,16,servicio,,,,Potenciación máxima de equipo
`
    },
    artesanias: {
        filename: '04_artesanias_arqueria.csv',
        content: `name,price,type,tab,effect,desc
Flechas Comunes,1,common,flechas,,Flechas estándar de buena calidad
Flecha de Fuego,30,elemental,flechas,1d6 daño de fuego,Emite fuego al impacto
Flecha de Hielo,30,elemental,flechas,1d6 daño frío,Ralentiza en impacto
Capa Impermeable,25,gear,ropa,,Protege de la lluvia
Botas del Cazador,40,magic,ropa,Ventaja en rastrear,
Reparación de Arcos,15,service,servicios,,Restauración completa de arcos dañados
Afilado de Cuchillas,10,service,servicios,,+1 daño hasta próximo descanso
`
    },
    emporio: {
        filename: '06_emporio.csv',
        content: `name,price,section,effect,rarity
Polvo de diamante,50,materiales,Componente material para hechizos,común
Incienso exótico,120,raros,Objeto importado de lejanas tierras,inusual
Mapa del Bosque Norte,25,mapas,Rutas y puntos de interés,común
Caja de herramientas de viaje,15,otros,Equipo básico para aventureros,común
Cristal de enfoque,200,raros,Aumenta poder de hechizos,rara
`
    },
    biblioteca: {
        filename: '05_biblioteca.csv',
        content: `name,price,section,effect,tiempo,nivel,efLabel
Manual del Aprendiz Arcano,25,magia,Detect Magic,3 DL,1,Conjuro aprendido
Rituales de Protección Menor,30,magia,Alarm (ritual),3 DL,1,Conjuro aprendido
Tratado Ígneo Básico,40,magia,Burning Hands,3 DL,1,Conjuro aprendido
Forja del Aventurero,35,fabricacion,Armas simples a estándar D&D,2 DL,,Permite fabricar
Manual de Protección Ligera,45,fabricacion,Armadura ligera AC normal,3 DL,,Permite fabricar
Cocina del Caminante,25,cocina,Ración curativa 2d4+2 PG,2 DL,,Prepara
Trampas del Explorador,40,trampas,Trampa de lazo restringe,3 DL,,Enseña a construir
Alquimia del Iniciado,40,alquimia,Poción Curación 2d4+2,3 DL,,Permite fabricar
Atlas del Territorio Cercano,20,mapas,Ruta segura,2 DL,,Otorga
`
    },
    jugadores: {
        filename: '07_items_jugadores.csv',
        content: `name,price,effect,rarity,quantity
Espada Larga +1,350,+1 a ataques y daño,inusual,1
Armadura de Cuero Mágica,200,+1 a CA,inusual,1
Poción de Curación Superior,150,Recupera 4d4+4 HP,inusual,1
Hacha,25,Arma cuerpo a cuerpo,común,40
Anillo de Protección,5000,+1 a CA y tiradas de salvación,legendaria,1
Capa Élfica,2500,Ventaja en tiradas de Sigilo,rara,1
Pergamino de Fuego,100,Conjuro: Fireball (1 uso),rara,1
`
    }
};

function downloadCSVTemplate(key) {
    const t = CSV_TEMPLATES[key];
    if (!t) return;
    const blob = new Blob([t.content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = t.filename;
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof showToast === 'function') showToast('Descargado: ' + t.filename);
}

// Función para descargar plantilla de items de jugadores (Excel .xlsx)
function downloadPlayerItemsTemplate() {
    if (typeof XLSX === 'undefined') {
        downloadCSVTemplate('jugadores');
        return;
    }
    var t = CSV_TEMPLATES.jugadores;
    if (!t) return;
    var lines = t.content.trim().split('\n');
    var separator = lines[0].indexOf(';') !== -1 ? ';' : ',';
    var rows = lines.map(function(line) {
        return line.split(separator).map(function(cell) { return cell.trim().replace(/^"|"$/g, ''); });
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Items jugadores');
    XLSX.writeFile(wb, '07_items_jugadores.xlsx');
    if (typeof showToast === 'function') showToast('Descargado: 07_items_jugadores.xlsx');
}
window.downloadPlayerItemsTemplate = downloadPlayerItemsTemplate;

function toggleTemplateSection() {
    const shopId = document.getElementById('inventory-shop-id').value;
    const shop = shopsData.find(s => s.id === shopId);
    const tipo = (shop && shop.tipo || '').toLowerCase();
    const isTaberna = tipo === 'taberna';
    const isHerreria = tipo === 'herreria';
    const isArqueria = tipo === 'arqueria';
    const isBiblioteca = tipo === 'biblioteca';
    const isEmporio = tipo === 'emporio';
    const gen = document.getElementById('csv-template-section');
    const tab = document.getElementById('csv-template-section-taberna');
    const forja = document.getElementById('csv-template-section-forja');
    const artesanias = document.getElementById('csv-template-section-artesanias');
    const biblioteca = document.getElementById('csv-template-section-biblioteca');
    const emporio = document.getElementById('csv-template-section-emporio');
    if (!gen || !tab) return;
    if (isTaberna) {
        gen.style.display = 'none';
        if (forja) forja.style.display = 'none';
        if (artesanias) artesanias.style.display = 'none';
        if (biblioteca) biblioteca.style.display = 'none';
        if (emporio) emporio.style.display = 'none';
        tab.style.display = tab.style.display === 'none' ? 'block' : 'none';
    } else if (isEmporio && emporio) {
        gen.style.display = 'none';
        tab.style.display = 'none';
        if (forja) forja.style.display = 'none';
        if (artesanias) artesanias.style.display = 'none';
        if (biblioteca) biblioteca.style.display = 'none';
        emporio.style.display = emporio.style.display === 'none' ? 'block' : 'none';
    } else if (isHerreria && forja) {
        gen.style.display = 'none';
        tab.style.display = 'none';
        if (artesanias) artesanias.style.display = 'none';
        if (biblioteca) biblioteca.style.display = 'none';
        if (emporio) emporio.style.display = 'none';
        forja.style.display = forja.style.display === 'none' ? 'block' : 'none';
    } else if (isArqueria && artesanias) {
        gen.style.display = 'none';
        tab.style.display = 'none';
        if (forja) forja.style.display = 'none';
        if (biblioteca) biblioteca.style.display = 'none';
        if (emporio) emporio.style.display = 'none';
        artesanias.style.display = artesanias.style.display === 'none' ? 'block' : 'none';
    } else if (isBiblioteca && biblioteca) {
        gen.style.display = 'none';
        tab.style.display = 'none';
        if (forja) forja.style.display = 'none';
        if (artesanias) artesanias.style.display = 'none';
        if (emporio) emporio.style.display = 'none';
        biblioteca.style.display = biblioteca.style.display === 'none' ? 'block' : 'none';
    } else {
        tab.style.display = 'none';
        if (forja) forja.style.display = 'none';
        if (artesanias) artesanias.style.display = 'none';
        if (biblioteca) biblioteca.style.display = 'none';
        if (emporio) emporio.style.display = 'none';
        gen.style.display = gen.style.display === 'none' ? 'block' : 'none';
    }
}

function showImportSection() {
    const section = document.getElementById('csv-import-section');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
    
    // Reset file input when showing
    if (section.style.display === 'block') {
        document.getElementById('csv-file-input').value = '';
        document.getElementById('csv-file-preview').style.display = 'none';
        document.getElementById('csv-upload-btn').style.display = 'none';
        
        // Initialize file input listener if not already initialized
        const fileInput = document.getElementById('csv-file-input');
        if (fileInput && !fileInput.hasAttribute('data-listener-attached')) {
            fileInput.setAttribute('data-listener-attached', 'true');
            fileInput.addEventListener('change', function(event) {
                const file = event.target.files[0];
                if (file) {
                    document.getElementById('csv-file-name').textContent = file.name;
                    document.getElementById('csv-file-preview').style.display = 'block';
                    document.getElementById('csv-upload-btn').style.display = 'block';
                }
            });
        }
    }
}

function processCSVUpload() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Por favor selecciona un archivo CSV o Excel', true);
        return;
    }

    const shopId = document.getElementById('inventory-shop-id').value;
    if (!shopId) {
        showToast('Error: ID de tienda no encontrado', true);
        return;
    }

    const shop = shopsData.find(s => s.id === shopId);
    if (!shop) {
        showToast('Tienda no encontrada', true);
        return;
    }
    const tipo = (shop.tipo || '').toLowerCase();
    const isTaberna = tipo === 'taberna';
    const isHerreria = tipo === 'herreria';
    const isArqueria = tipo === 'arqueria';
    const isBiblioteca = tipo === 'biblioteca';
    const isEmporio = tipo === 'emporio';

    readFileAsTextForInventory(file, function(text) {
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
            var typeIdx = header.indexOf('type');
            var categoriaIdx = header.indexOf('categoria');
            // También aceptar "tab" como alternativa a "categoria" para la taberna
            if (categoriaIdx === -1 && isTaberna) {
                categoriaIdx = header.indexOf('tab');
            }
            var avgIdx = header.indexOf('avg');
            var rarityIdx = header.indexOf('rarity');
            var tierIdx = header.indexOf('tier');
            var tipoForjaIdx = header.indexOf('tipo');
            // También aceptar "type" como alternativa a "tipo" para la forja
            if (tipoForjaIdx === -1 && isHerreria) {
                tipoForjaIdx = header.indexOf('type');
            }
            var damageIdx = header.indexOf('damage');
            var danoIdx = header.indexOf('daño');
            if (danoIdx === -1) danoIdx = header.indexOf('dano');
            var damageTypeIdx = header.indexOf('damagetype');
            // También aceptar "damageType" (con mayúscula)
            if (damageTypeIdx === -1) {
                damageTypeIdx = header.indexOf('damagetype');
            }
            // Buscar también con mayúscula en la T
            if (damageTypeIdx === -1) {
                for (var h = 0; h < header.length; h++) {
                    if (header[h].toLowerCase() === 'damagetype') {
                        damageTypeIdx = h;
                        break;
                    }
                }
            }
            var acIdx = header.indexOf('ac');
            var descIdx = header.indexOf('desc');
            var typeArqIdx = header.indexOf('type');
            var tabIdx = header.indexOf('tab');
            var sectionIdx = header.indexOf('section');
            var tiempoIdx = header.indexOf('tiempo');
            var nivelIdx = header.indexOf('nivel');
            var efLabelIdx = header.indexOf('eflabel');
            var cantidadIdx = header.indexOf('cantidad');
            if (cantidadIdx === -1) cantidadIdx = header.indexOf('quantity');

            if (nameIdx === -1 || priceIdx === -1) {
                showToast('El CSV debe tener al menos las columnas "name" y "price"', true);
                return;
            }

            if (isTaberna && (typeIdx === -1 || categoriaIdx === -1)) {
                showToast('Para taberna el CSV debe tener columnas: name, price, effect, type, categoria (o tab). Valores de categoria: servir o llevar', true);
                return;
            }

            if (isHerreria && (tierIdx === -1 || tipoForjaIdx === -1)) {
                showToast('Para forja/herrería el CSV debe tener columnas: name, price, tier, tipo o type (arma|armadura|servicio)', true);
                return;
            }

            if (isArqueria && (typeArqIdx === -1 || tabIdx === -1)) {
                showToast('Para artesanías/arquería el CSV debe tener columnas: name, price, type, tab (flechas|ropa|servicios)', true);
                return;
            }

            if (isBiblioteca && sectionIdx === -1) {
                showToast('Para biblioteca el CSV debe tener columnas: name, price, section (magia|fabricacion|cocina|trampas|alquimia|mapas|restringida), effect', true);
                return;
            }

            if (isEmporio && sectionIdx === -1) {
                showToast('Para emporio el CSV debe tener columnas: name, price, section (materiales|raros|mapas|otros), effect, rarity', true);
                return;
            }

            const validRarities = ['común', 'inusual', 'rara', 'legendaria'];
            const validTypes = ['drink', 'food'];
            const validCategorias = ['servir', 'llevar'];
            const validTiers = [1, 6, 11, 16];
            const validTipoForja = ['arma', 'armadura', 'servicio'];
            const validTypesArq = ['common', 'magic', 'elemental', 'gear', 'service'];
            const validTabsArq = ['flechas', 'ropa', 'servicios'];
            let inventario = shop.inventario || [];
            let count = 0;
            let errors = [];

            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(separator).map(function(v) { return v.trim().replace(/^"|"$/g, ''); });
                
                var name = values[nameIdx];
                var priceStr = values[priceIdx] || '0';
                var effect = effectIdx !== -1 ? (values[effectIdx] || '') : '';
                // Limpiar valores inválidos como "???" en effect
                if (effect && (effect.trim() === '???' || effect.trim() === '??' || effect.trim() === '?')) {
                    effect = '';
                }

                if (!name || name.length === 0) {
                    errors.push('Línea ' + (i + 1) + ': nombre vacío');
                    continue;
                }
                var price = parseInt(priceStr);
                if (isNaN(price) || price < 0) {
                    errors.push('Línea ' + (i + 1) + ': precio inválido');
                    continue;
                }
                var quantity = 1;
                if (cantidadIdx >= 0 && values[cantidadIdx] !== undefined && values[cantidadIdx] !== '') {
                    var qNum = parseInt(values[cantidadIdx], 10);
                    if (!isNaN(qNum) && qNum >= 1) quantity = Math.min(qNum, 99999);
                }

                var item;
                if (isTaberna) {
                    var type = (typeIdx !== -1 ? (values[typeIdx] || 'drink') : 'drink').toLowerCase().trim();
                    var categoriaRaw = (categoriaIdx !== -1 ? (values[categoriaIdx] || '') : '').toLowerCase().trim();
                    if (validTypes.indexOf(type) === -1) type = 'drink';
                    
                    // Determinar categoria: si tiene effect, debe ser "llevar", si no, "servir"
                    // Pero primero verificar si ya viene especificado correctamente
                    var categoria;
                    if (validCategorias.indexOf(categoriaRaw) !== -1) {
                        // Ya viene con un valor válido (servir o llevar)
                        categoria = categoriaRaw;
                    } else if (categoriaRaw === 'bebidas' || categoriaRaw === 'cocina') {
                        // Si viene de la columna "tab" con valores antiguos, determinar por effect
                        categoria = (effect && effect.trim() && effect.trim() !== '???') ? 'llevar' : 'servir';
                    } else {
                        // Si no viene especificado o es inválido, determinar automáticamente por effect
                        categoria = (effect && effect.trim() && effect.trim() !== '???') ? 'llevar' : 'servir';
                    }
                    
                    item = { name: name, price: price, effect: effect, type: type, categoria: categoria };
                    if (quantity > 1) item.quantity = quantity;
                } else if (isHerreria) {
                    var tierNum = tierIdx >= 0 ? parseInt(values[tierIdx], 10) : 1;
                    if (isNaN(tierNum) || validTiers.indexOf(tierNum) === -1) tierNum = 1;
                    var tipoForja = (tipoForjaIdx >= 0 ? (values[tipoForjaIdx] || 'arma') : 'arma').toLowerCase().trim();
                    if (validTipoForja.indexOf(tipoForja) === -1) tipoForja = 'arma';
                    var desc = (descIdx >= 0 ? (values[descIdx] || '') : '') || (effectIdx >= 0 ? (values[effectIdx] || '') : '');
                    item = { name: name, price: price, tier: tierNum, tipo: tipoForja, effect: desc, desc: desc };
                    if (tipoForja === 'arma') {
                        if (damageIdx >= 0 && values[damageIdx]) item.damage = values[damageIdx];
                        if (damageTypeIdx >= 0 && values[damageTypeIdx]) item.damageType = values[damageTypeIdx];
                    } else if (tipoForja === 'armadura') {
                        if (acIdx >= 0 && values[acIdx]) item.ac = values[acIdx];
                        item.isArmor = true;
                    }
                    if (quantity > 1) item.quantity = quantity;
                } else if (isArqueria) {
                    var typeArq = (typeArqIdx >= 0 ? (values[typeArqIdx] || 'common') : 'common').toLowerCase().trim();
                    if (validTypesArq.indexOf(typeArq) === -1) typeArq = 'common';
                    var tabVal = (tabIdx >= 0 ? (values[tabIdx] || 'flechas') : 'flechas').toLowerCase().trim();
                    if (validTabsArq.indexOf(tabVal) === -1) tabVal = 'flechas';
                    var effectArq = effectIdx >= 0 ? (values[effectIdx] || '') : '';
                    var descArq = descIdx >= 0 ? (values[descIdx] || '') : '';
                    item = { name: name, price: price, type: typeArq, tab: tabVal, effect: effectArq || descArq, desc: descArq || effectArq };
                    if (quantity > 1) item.quantity = quantity;
                } else if (isBiblioteca) {
                    var validSections = ['magia', 'fabricacion', 'cocina', 'trampas', 'alquimia', 'mapas', 'restringida'];
                    var sectionVal = (sectionIdx >= 0 ? (values[sectionIdx] || 'magia') : 'magia').toLowerCase().trim();
                    if (validSections.indexOf(sectionVal) === -1) sectionVal = 'magia';
                    var effectBiblio = effectIdx >= 0 ? (values[effectIdx] || '') : '';
                    item = { name: name, price: price, section: sectionVal, effect: effectBiblio };
                    if (tiempoIdx >= 0 && values[tiempoIdx]) item.tiempo = values[tiempoIdx];
                    if (nivelIdx >= 0 && values[nivelIdx]) { var n = parseInt(values[nivelIdx]); if (!isNaN(n)) item.nivel = n; }
                    if (efLabelIdx >= 0 && values[efLabelIdx]) item.efLabel = values[efLabelIdx];
                    if (quantity > 1) item.quantity = quantity;
                } else if (isEmporio) {
                    var validSectionsEmp = ['materiales', 'raros', 'mapas', 'otros'];
                    var sectionEmp = (sectionIdx >= 0 ? (values[sectionIdx] || 'otros') : 'otros').toLowerCase().trim();
                    if (validSectionsEmp.indexOf(sectionEmp) === -1) sectionEmp = 'otros';
                    var rarityEmp = (rarityIdx >= 0 ? (values[rarityIdx] || 'común') : 'común').toLowerCase().trim();
                    if (rarityEmp === 'infrecuente') rarityEmp = 'inusual';
                    if (validRarities.indexOf(rarityEmp) === -1) rarityEmp = 'común';
                    item = { name: name, price: price, section: sectionEmp, effect: effect, rarity: rarityEmp };
                    if (quantity > 1) item.quantity = quantity;
                } else {
                    var avg = (avgIdx !== -1 ? (values[avgIdx] || '').trim() : '') || (danoIdx !== -1 ? (values[danoIdx] || '').trim() : '') || (damageIdx >= 0 ? (values[damageIdx] || '').trim() : '');
                    var rarity = (rarityIdx !== -1 ? (values[rarityIdx] || 'común') : 'común').toLowerCase().trim();
                    if (rarity === 'infrecuente') rarity = 'inusual';
                    if (validRarities.indexOf(rarity) === -1) rarity = 'común';
                    item = { name: name, price: price, effect: effect, avg: avg, rarity: rarity };
                    if (quantity > 1) item.quantity = quantity;
                }
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
            db.collection('shops').doc(shopId).update({ inventario })
                .then(function() {
                    showToast(count + ' items importados exitosamente' + (errors.length > 0 ? ' (con ' + errors.length + ' errores)' : ''));
                    shop.inventario = inventario;
                    renderInventoryList(shop);
                    if (typeof refreshCityData === 'function' && shop.ciudadId) refreshCityData(shop.ciudadId);
                    // Resetear el formulario
                    document.getElementById('csv-file-input').value = '';
                    document.getElementById('csv-file-preview').style.display = 'none';
                    document.getElementById('csv-upload-btn').style.display = 'none';
                    document.getElementById('csv-import-section').style.display = 'none';
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
}
