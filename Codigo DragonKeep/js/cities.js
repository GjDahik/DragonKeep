// ==================== HELPER: Leer archivos CSV o Excel ====================
function readFileAsText(file, callback) {
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

// ==================== CITIES + NPCs + SHOPS ====================
/** Ciudad fija "Old Mistfall": no se puede borrar desde el dashboard, solo desde la base de datos. */
const OLD_MISTFALL_CITY_NAME = 'Old Mistfall';
function isOldMistfallCity(cityOrNombre) {
    const n = (typeof cityOrNombre === 'object' ? (cityOrNombre && cityOrNombre.nombre) : cityOrNombre) || '';
    return ('' + n).trim().toLowerCase() === OLD_MISTFALL_CITY_NAME.toLowerCase();
}

/** Cache por ciudad: solo se cargan NPCs y tiendas al expandir. { cityId: { npcs: [], shops: [], loaded: true } } */
var _cityDataCache = {};
if (typeof window !== 'undefined') window._cityDataCache = _cityDataCache;

// FIRESTORE REALTIME REMOVED: replaced with manual refresh (getDocs)
function fetchCitiesDM() {
    if (!db) return Promise.resolve();
    return db.collection('cities').limit(300).get()
        .then(snap => {
            if (snap && snap.docs && snap.docs.length > 0) {
                citiesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                citiesData.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
            } else {
                citiesData = [];
            }
            window.citiesData = citiesData;
            if (typeof populateTransactionsFilters === 'function') populateTransactionsFilters();
            if (typeof renderCities === 'function') renderCities();
        })
        .catch(err => {
            console.error('Error al cargar ciudades:', err);
            if (typeof showToast === 'function') showToast('Error al cargar ciudades: ' + (err.message || err), true);
        });
}

/** Carga NPCs y tiendas de una ciudad (bajo demanda). Actualiza _cityDataCache y npcsData/shopsData para esa ciudad. */
function ensureCityDataLoaded(cityId) {
    if (!db || !cityId) return Promise.resolve();
    if (_cityDataCache[cityId] && _cityDataCache[cityId].loaded) return Promise.resolve();

    return Promise.all([
        db.collection('npcs').where('ciudadId', '==', cityId).limit(300).get(),
        db.collection('shops').where('ciudadId', '==', cityId).limit(300).get()
    ]).then(([npcsSnap, shopsSnap]) => {
        const npcs = npcsSnap && npcsSnap.docs ? npcsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        const shops = shopsSnap && shopsSnap.docs ? shopsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        _cityDataCache[cityId] = { npcs, shops, loaded: true };
        // Mantener npcsData/shopsData como unión de ciudades ya cargadas (para editNpc, editShop, etc.)
        npcsData = (npcsData || []).filter(n => n.ciudadId !== cityId).concat(npcs);
        shopsData = (shopsData || []).filter(s => s.ciudadId !== cityId).concat(shops);
        window.npcsData = npcsData;
        window.shopsData = shopsData;
        if (typeof renderCities === 'function') renderCities();
    }).catch(err => {
        console.error('Error al cargar datos de ciudad:', err);
        if (typeof showToast === 'function') showToast('Error al cargar ciudad: ' + (err.message || err), true);
    });
}

/** Vuelve a cargar solo los datos de una ciudad (tras guardar/eliminar NPC o tienda). */
function refreshCityData(cityId) {
    if (!cityId) return Promise.resolve();
    if (_cityDataCache[cityId]) _cityDataCache[cityId].loaded = false;
    return ensureCityDataLoaded(cityId);
}

// FIRESTORE REALTIME REMOVED: solo se cargan ciudades al entrar; NPCs/tiendas al expandir
function loadWorld() {
    if (!db) {
        console.error('Error: db no está definido');
        return;
    }
    // No cargar todos los NPCs ni tiendas: solo ciudades. Los datos por ciudad se cargan en ensureCityDataLoaded()
    fetchCitiesDM();
}

function renderCities() {
    const cities = citiesData || [];
    const npcs = npcsData || [];
    const shops = shopsData || [];
    let container = document.getElementById('cities-container');
    if (!container) {
        setTimeout(function() {
            container = document.getElementById('cities-container');
            if (container) {
                renderCities();
            } else {
                console.error('cities-container no existe en el DOM');
                var citiesSection = document.getElementById('cities');
                if (citiesSection) {
                    citiesSection.innerHTML += '<div style="background:red;color:white;padding:20px;margin:20px;">ERROR: El contenedor cities-container no existe</div>';
                }
            }
        }, 1000);
        return;
    }
    if (!cities || !Array.isArray(cities)) {
        console.error('Error: citiesData no es un array válido');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏘️</div><p>Error al cargar ciudades</p></div>';
        return;
    }
    
    if (!cities.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏘️</div><p>No hay ciudades. ¡Crea la primera!</p></div>';
        return;
    }
    try {
        const sortedCities = [...cities].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        let htmlContent = '';
        sortedCities.forEach((city, index) => {
            const cached = _cityDataCache[city.id];
            const cityNpcs = cached ? (cached.npcs || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')) : [];
            const cityShops = cached ? (cached.shops || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')) : [];
            const countsLoaded = !!cached;
            const npcCountLabel = countsLoaded ? cityNpcs.length : '?';
            const shopCountLabel = countsLoaded ? cityShops.length : '?';
        const nivelColor = city.nivel <= 2 ? '🟢' : city.nivel <= 4 ? '🟡' : city.nivel <= 5 ? '🟠' : '🔴';
        const tipoEmoji = { herreria: '⚔️', pociones: '🧪', taberna: '🍺', biblioteca: '📚', arqueria: '🏹', emporio: '🛒', batalla: '🥊', santuario: '🪞', banco: '🏦', posada: '🏨' };
        const actitudEmoji = { amigable: '😊', neutral: '😐', hostil: '😠' };

        const html = `
            <div class="city-card" id="city-${city.id}">
                <div class="city-header" onclick="toggleCity('${city.id}')">
                    ${city.imagenUrl ? `<div class="city-image" style="width:120px; height:80px; border-radius:8px; overflow:hidden; margin-right:16px; flex-shrink:0; background:#2a231c; display:flex; align-items:center; justify-content:center;"><img src="${city.imagenUrl.replace(/"/g, '&quot;')}" alt="${(city.nombre || '').replace(/"/g, '&quot;')}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='🖼️';"></div>` : ''}
                    <div class="city-info" style="flex:1;">
                        <h3>🏰 ${city.nombre}</h3>
                        <p>${city.descripcion || 'Sin descripción'}</p>
                    </div>
                    <div class="city-meta">
                        <span>${nivelColor} Nivel ${city.nivel}</span>
                        <span>🎭 ${npcCountLabel}</span>
                        <span>🛒 ${shopCountLabel}</span>
                        <span class="city-toggle">▼</span>
                    </div>
                </div>
                <div class="city-actions" style="flex-wrap:wrap; align-items:center;">
                    <label for="city-order-${city.id}" style="color:#8b7355; font-size:0.85em; margin-right:4px;" title="Orden en que los aventureros ven las ciudades">Orden:</label>
                    <select id="city-order-${city.id}" style="width:auto; min-width:3em; margin-right:8px; background:#1a1a1a; border:1px solid #4a3c31; color:#d4c4a8; padding:4px 8px; border-radius:4px; font-size:0.9em;" onchange="event.stopPropagation(); setCityOrderPosition('${city.id}', parseInt(this.value, 10))">
                        ${sortedCities.map((_, i) => `<option value="${i + 1}" ${index === i ? 'selected' : ''}>${i + 1}</option>`).join('')}
                    </select>
                    <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); editCity('${city.id}')">✏️</button>
                    ${!isOldMistfallCity(city) ? `<button class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteCity('${city.id}', '${(city.nombre || '').replace(/'/g, "\\'")}')">🗑️</button>` : '<span class="btn btn-small btn-secondary" style="opacity:0.7; cursor:not-allowed;" title="Old Mistfall solo puede eliminarse desde la base de datos">🗑️</span>'}
                    <button class="btn btn-small ${(city.visibleToPlayers !== false) ? 'btn-success' : 'btn-secondary'}" onclick="event.stopPropagation(); toggleCityVisibility('${city.id}')" title="${(city.visibleToPlayers !== false) ? 'Visible para jugadores. Clic para ocultar.' : 'Oculta para jugadores. Clic para mostrar.'}">${(city.visibleToPlayers !== false) ? '👁️ Visible' : '👁️‍🗨️ Oculta'}</button>
                    <div style="display:flex; align-items:center; gap:8px; margin-left:auto;">
                        <span style="color:#8b7355; font-size:0.9em; white-space:nowrap;">Est. recomendado:</span>
                        <select onchange="setEstablecimientoRecomendado('${city.id}', this.value)" style="background:#1a1a1a; border:1px solid #4a3c31; color:#d4c4a8; padding:6px 10px; border-radius:4px; font-size:0.9em; min-width:140px;">
                            <option value="">Ninguno</option>
                            ${cityShops.map(s => `<option value="${s.id}" ${(city.establecimientoRecomendadoId === s.id) ? 'selected' : ''}>${(s.nombre || 'Tienda').replace(/"/g, '&quot;')}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="city-content">
                    <div class="subsection subsection-npcs" id="city-${city.id}-npcs-subsection">
                        <div class="subsection-header">
                            <div class="subsection-header-title subsection-header-toggle" role="button" tabindex="0" data-city-id="${city.id}" data-section="npcs" onclick="event.stopPropagation(); toggleCitySubsection(this.closest('.subsection').querySelector('.subsection-body'))" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); var b=this.closest('.subsection').querySelector('.subsection-body'); toggleCitySubsection(b); }" title="Clic para mostrar u ocultar">
                                <h4>🎭 NPCs (${countsLoaded ? cityNpcs.length : '?'}) <span class="subsection-toggle-icon">▶</span></h4>
                            </div>
                            <div class="subsection-header-toolbar" onclick="event.stopPropagation();">
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); openNpcModal('${city.id}')">+ NPC</button>
                                <button type="button" class="btn btn-small btn-secondary" onclick="event.stopPropagation(); openImportNpcsModal('${city.id}')">📤 Importar NPCs</button>
                                <button type="button" class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteAllNpcsFromCity('${city.id}', '${(city.nombre || '').replace(/'/g, "\\'")}')" title="Eliminar todos los NPCs de esta ciudad">🗑️ Eliminar NPCs</button>
                            </div>
                        </div>
                        <div class="subsection-body" id="city-${city.id}-npcs-body" style="display:none;">
                        <input type="search" class="searchbar city-section-search" placeholder="Buscar NPCs..." data-city-id="${city.id}" data-section="npcs" oninput="filterCitySection(this)" style="margin-bottom:10px;">
                        <div id="city-${city.id}-npcs-cards" class="mini-cards">
                            ${cityNpcs.length ? cityNpcs.map(n => {
                                const actitud = (n.actitud || 'neutral').toLowerCase();
                                const actitudClass = ['amigable','neutral','hostil'].includes(actitud) ? actitud : 'neutral';
                                return `
                                <div class="mini-card mini-card-npc">
                                    <div class="mini-card-title">${n.nombre}</div>
                                    <div class="mini-card-info">${n.rol} <span class="badge-actitud badge-actitud-${actitudClass}" title="Actitud">${actitudEmoji[n.actitud] || ''} ${n.actitud}</span></div>
                                    <div class="mini-card-actions">
                                        <button class="btn btn-small btn-secondary" onclick="editNpc('${n.id}')">✏️</button>
                                        <button class="btn btn-small btn-danger" onclick="deleteNpc('${n.id}', '${(n.nombre || '').replace(/'/g, "\\'")}')">🗑️</button>
                                    </div>
                                </div>
                            `}).join('') : '<p style="color:#a89a8c;padding:10px;">Sin NPCs</p>'}
                        </div>
                        </div>
                    </div>
                    <div class="subsection subsection-shops" id="city-${city.id}-shops-subsection">
                        <div class="subsection-header">
                            <div class="subsection-header-title subsection-header-toggle" role="button" tabindex="0" data-city-id="${city.id}" data-section="shops" onclick="event.stopPropagation(); toggleCitySubsection(this.closest('.subsection').querySelector('.subsection-body'))" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); var b=this.closest('.subsection').querySelector('.subsection-body'); toggleCitySubsection(b); }" title="Clic para mostrar u ocultar">
                                <h4>🛒 Tiendas (${countsLoaded ? cityShops.length : '?'}) <span class="subsection-toggle-icon">▶</span></h4>
                            </div>
                            <div class="subsection-header-toolbar" onclick="event.stopPropagation();">
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); openShopModal('${city.id}')">+ Tienda</button>
                                <button type="button" class="btn btn-small btn-secondary" onclick="event.stopPropagation(); openImportShopsModal('${city.id}')">📤 Importar Tiendas</button>
                                <button type="button" class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteAllShopsFromCity('${city.id}', '${(city.nombre || '').replace(/'/g, "\\'")}')" title="Eliminar todas las tiendas de esta ciudad">🗑️ Eliminar Tiendas</button>
                            </div>
                        </div>
                        <div class="subsection-body" id="city-${city.id}-shops-body" style="display:none;">
                        <input type="search" class="searchbar city-section-search" placeholder="Buscar tiendas..." data-city-id="${city.id}" data-section="shops" oninput="filterCitySection(this)" style="margin-bottom:10px;">
                        <div id="city-${city.id}-shops-cards" class="mini-cards">
                            ${cityShops.length ? cityShops.map(s => {
                                const owner = npcs.find(n => n.id === s.npcDueno);
                                const shopTipo = (s.tipo || '').toLowerCase();
                                const isSantuario = shopTipo === 'santuario';
                                const isBanco = shopTipo === 'banco';
                                const isPosada = shopTipo === 'posada';
                                const isBatalla = shopTipo === 'batalla';
                                const sinInventario = isSantuario || isBanco || isPosada || isBatalla;
                                const nombreEsc = (s.nombre || '').replace(/'/g, "\\'");
                                return `
                                <div class="mini-card mini-card-shop">
                                    <div class="mini-card-title">${tipoEmoji[s.tipo] || '🏪'} ${s.nombre}</div>
                                    <div class="mini-card-info">${s.tipo} ${owner ? '• ' + owner.nombre : ''}${sinInventario ? ' <span class="badge-sin-inventario">sin inventario</span>' : ''}</div>
                                    <div class="mini-card-actions">
                                    ${s.tipo === 'batalla' ? `<button class="btn btn-small" onclick="openBatallaConfigModal('${s.id}')" title="Configurar enemigos de esta tienda">🥊</button>` : ''}
                                    ${!sinInventario ? `<button class="btn btn-small" onclick="manageInventory('${s.id}')">📦</button>` : ''}
                                        <button class="btn btn-small btn-secondary" onclick="editShop('${s.id}')">✏️</button>
                                        <button class="btn btn-small btn-danger" onclick="deleteShop('${s.id}', '${nombreEsc}')">🗑️</button>
                                    </div>
                                </div>`;
                            }).join('') : '<p style="color:#a89a8c;padding:10px;">Sin tiendas</p>'}
                        </div>
                        </div>
                    </div>
                </div>
            </div>`;
            htmlContent += html;
        });
        container.innerHTML = htmlContent;
        if (typeof renderDMMapMarkersDropdown === 'function' && typeof isDM === 'function' && isDM()) renderDMMapMarkersDropdown();
    } catch (error) {
        console.error('Error renderizando ciudades:', error);
        console.error('Stack trace:', error.stack);
        if (container) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Error al renderizar ciudades: ' + error.message + '</p><p style="font-size:0.8em;color:#888;">Revisa la consola para más detalles</p></div>';
        }
    }
}

// Hacer funciones globalmente accesibles
window.renderCities = renderCities;
window.loadWorld = loadWorld;
window.ensureCityDataLoaded = ensureCityDataLoaded;
window.refreshCityData = refreshCityData;

// Filtro por búsqueda dentro de cada ciudad (NPCs o Tiendas)
function filterCitySection(inputEl) {
    const q = (inputEl.value || '').trim().toLowerCase();
    const cityId = inputEl.dataset.cityId;
    const section = inputEl.dataset.section;
    const container = document.getElementById('city-' + cityId + '-' + section + '-cards');
    if (!container) return;
    const npcsAll = window.npcsData || npcsData || [];
    const shopsAll = window.shopsData || shopsData || [];
    const cityNpcs = npcsAll.filter(n => n.ciudadId === cityId);
    const cityShops = shopsAll.filter(s => s.ciudadId === cityId);
    const actitudEmoji = { amigable: '😊', neutral: '😐', hostil: '😠' };
    const tipoEmoji = { herreria: '⚔️', pociones: '🧪', taberna: '🍺', biblioteca: '📚', arqueria: '🏹', emporio: '🛒', batalla: '🥊', santuario: '🪞', banco: '🏦', posada: '🏨' };

    if (section === 'npcs') {
        let list = cityNpcs.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
        if (q) list = list.filter(n => (n.nombre || '').toLowerCase().includes(q));
        container.innerHTML = list.length ? list.map(n => {
            const actitud = (n.actitud || 'neutral').toLowerCase();
            const actitudClass = ['amigable','neutral','hostil'].includes(actitud) ? actitud : 'neutral';
            return `
            <div class="mini-card mini-card-npc">
                <div class="mini-card-title">${n.nombre}</div>
                <div class="mini-card-info">${n.rol} <span class="badge-actitud badge-actitud-${actitudClass}" title="Actitud">${actitudEmoji[n.actitud] || ''} ${n.actitud}</span></div>
                <div class="mini-card-actions">
                    <button class="btn btn-small btn-secondary" onclick="editNpc('${n.id}')">✏️</button>
                    <button class="btn btn-small btn-danger" onclick="deleteNpc('${n.id}', '${(n.nombre || '').replace(/'/g, "\\'")}')">🗑️</button>
                </div>
            </div>`;
        }).join('') : '<p style="color:#a89a8c;padding:10px;">Sin NPCs' + (q ? ' que coincidan' : '') + '</p>';
    } else {
        let list = cityShops.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
        if (q) list = list.filter(s => (s.nombre || '').toLowerCase().includes(q));
        container.innerHTML = list.length ? list.map(s => {
            const owner = cityNpcs.find(n => n.id === s.npcDueno) || npcsAll.find(n => n.id === s.npcDueno);
            const shopTipo = (s.tipo || '').toLowerCase();
            const sinInventario = ['santuario', 'banco', 'posada', 'batalla'].includes(shopTipo);
            const nombreEsc = (s.nombre || '').replace(/'/g, "\\'");
            return `
            <div class="mini-card mini-card-shop">
                <div class="mini-card-title">${tipoEmoji[s.tipo] || '🏪'} ${s.nombre}</div>
                <div class="mini-card-info">${s.tipo} ${owner ? '• ' + owner.nombre : ''}${sinInventario ? ' <span class="badge-sin-inventario">sin inventario</span>' : ''}</div>
                <div class="mini-card-actions">
                ${s.tipo === 'batalla' ? `<button class="btn btn-small" onclick="openBatallaConfigModal('${s.id}')" title="Configurar enemigos de esta tienda">🥊</button>` : ''}
                ${!sinInventario ? `<button class="btn btn-small" onclick="manageInventory('${s.id}')">📦</button>` : ''}
                    <button class="btn btn-small btn-secondary" onclick="editShop('${s.id}')">✏️</button>
                    <button class="btn btn-small btn-danger" onclick="deleteShop('${s.id}', '${nombreEsc}')">🗑️</button>
                </div>
            </div>`;
        }).join('') : '<p style="color:#a89a8c;padding:10px;">Sin tiendas' + (q ? ' que coincidan' : '') + '</p>';
    }
}
window.filterCitySection = filterCitySection;

function toggleCitySubsection(bodyEl) {
    if (!bodyEl) return;
    const header = bodyEl.previousElementSibling;
    const icon = header ? header.querySelector('.subsection-toggle-icon') : null;
    const isHidden = bodyEl.style.display === 'none';
    bodyEl.style.display = isHidden ? 'block' : 'none';
    if (icon) icon.textContent = isHidden ? '▼' : '▶';
}
window.toggleCitySubsection = toggleCitySubsection;

// Función de diagnóstico que se puede llamar desde la consola
window.debugCities = function() {
    console.log('=== DIAGNÓSTICO DE CIUDADES ===');
    console.log('citiesData:', citiesData);
    console.log('window.citiesData:', window.citiesData);
    console.log('Número de ciudades:', (citiesData || []).length);
    console.log('Contenedor existe:', !!document.getElementById('cities-container'));
    console.log('db existe:', typeof db !== 'undefined');
    console.log('loadWorld existe:', typeof loadWorld !== 'function');
    console.log('renderCities existe:', typeof renderCities === 'function');
    
    const container = document.getElementById('cities-container');
    if (container) {
        console.log('Contenedor encontrado, contenido actual:', container.innerHTML.length, 'caracteres');
    }
    
    // Intentar renderizar manualmente
    if (typeof renderCities === 'function') {
        console.log('Intentando renderizar ciudades...');
        renderCities();
    }
    
    // Intentar cargar manualmente
    if (typeof loadWorld === 'function' && typeof db !== 'undefined') {
        console.log('Intentando cargar ciudades desde Firestore...');
        db.collection('cities').limit(300).get().then(snap => {
            console.log('Ciudades en Firestore:', snap.size);
            snap.forEach(doc => {
                console.log('Ciudad:', doc.id, doc.data());
            });
        });
    }
};

function toggleCity(id) {
    const el = document.getElementById('city-' + id);
    if (!el) return;
    const isExpanding = !el.classList.contains('expanded');
    if (isExpanding) {
        ensureCityDataLoaded(id).then(() => {
            el.classList.add('expanded');
        });
    } else {
        el.classList.remove('expanded');
    }
}

function setEstablecimientoRecomendado(cityId, shopId) {
    var payload = { establecimientoRecomendadoId: shopId || null };
    db.collection('cities').doc(cityId).update(payload).then(function() {
        showToast(shopId ? 'Establecimiento recomendado actualizado' : 'Recomendado quitado');
    }).catch(function(e) { showToast('Error: ' + (e.message || e), true); });
}

function toggleCityVisibility(cityId) {
    const cities = window.citiesData || citiesData || [];
    var city = cities.find(function(c) { return c.id === cityId; });
    if (!city) return;
    var next = city.visibleToPlayers === false;
    db.collection('cities').doc(cityId).update({ visibleToPlayers: next }).then(function() {
        city.visibleToPlayers = next;
        if (typeof renderCities === 'function') renderCities();
        showToast(next ? 'Ciudad visible para jugadores' : 'Ciudad oculta para jugadores');
    }).catch(function(e) { showToast('Error: ' + (e.message || e), true); });
}

// ==================== IMPORT SHOPS CSV ====================
function openImportShopsModal(cityId) {
    const cities = window.citiesData || citiesData || [];
    var city = cities.find(function(c) { return c.id === cityId; });
    if (!city) {
        showToast('Ciudad no encontrada', true);
        return;
    }
    
    var cityIdEl = document.getElementById('import-shops-city-id');
    var cityNameEl = document.getElementById('import-shops-city-name');
    
    if (!cityIdEl || !cityNameEl) {
        showToast('Error: Elementos del modal no encontrados', true);
        return;
    }
    
    // Establecer el cityId y nombre de la ciudad
    cityIdEl.value = cityId;
    cityNameEl.textContent = city.nombre;
    
    console.log('Abriendo modal de importación para ciudad:', cityId, city.nombre);
    
    // Limpiar el input de archivo si existe
    var fileInput = document.querySelector('#import-shops-modal input[type="file"]');
    if (fileInput) fileInput.value = '';
    
    openModal('import-shops-modal');
}

function importShopsCSV(event) {
    var file = event.target.files[0];
    if (!file) return;

    var cityIdEl = document.getElementById('import-shops-city-id');
    var cityId = cityIdEl ? cityIdEl.value : '';
    
    if (!cityId || !cityId.trim()) {
        showToast('Error: No se ha seleccionado una ciudad. Por favor, cierra y vuelve a abrir el modal de importación.', true);
        console.error('Error: cityId vacío al importar tiendas');
        return;
    }
    
    console.log('Importando tiendas para ciudad ID:', cityId);

    readFileAsText(file, function(text) {
        var lines = text.split('\n').filter(function(line) { return line.trim(); });
        
        if (lines.length < 2) {
            showToast('El archivo está vacío', true);
            return;
        }

        // Detectar separador (coma o punto y coma)
        var separator = lines[0].indexOf(';') !== -1 ? ';' : ',';

        var header = lines[0].split(separator).map(function(h) { return h.trim().toLowerCase(); });
        var nombreIdx = header.indexOf('nombre');
        var tipoIdx = header.indexOf('tipo');

        if (nombreIdx === -1 || tipoIdx === -1) {
            showToast('El CSV debe tener columnas "nombre" y "tipo"', true);
            return;
        }

        var validTypes = ['pociones', 'herreria', 'arqueria', 'emporio', 'biblioteca', 'taberna', 'batalla', 'santuario', 'banco', 'posada'];
        function normalizeTipo(s) {
            if (!s) return '';
            // Normalizar: quitar tildes, convertir a minúsculas, y limpiar espacios
            var normalized = (s + '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            // Mapeo directo de tipos normalizados
            var typeMap = {
                'arqueria': 'arqueria',
                'arquería': 'arqueria',
                'arqueria / artifice': 'arqueria',
                'arquería / artífice': 'arqueria',
                'artesano': 'arqueria',
                'herreria': 'herreria',
                'herrería': 'herreria',
                'herreria / forja': 'herreria',
                'herrería / forja': 'herreria',
                'pociones': 'pociones',
                'emporio': 'emporio',
                'biblioteca': 'biblioteca',
                'taberna': 'taberna',
                'batalla': 'batalla',
                'santuario': 'santuario',
                'banco': 'banco',
                'posada': 'posada'
            };
            return typeMap[normalized] || normalized;
        }
        var batch = db.batch();
        var count = 0;
        var skipped = [];

        for (var i = 1; i < lines.length; i++) {
            var values = lines[i].split(separator).map(function(v) { return v.trim(); });
            var nombre = values[nombreIdx];
            var tipoRaw = (values[tipoIdx] || '').trim();
            
            if (!nombre || !nombre.trim()) {
                skipped.push('Línea ' + (i + 1) + ': Sin nombre');
                continue;
            }
            
            if (!tipoRaw || !tipoRaw.trim()) {
                skipped.push('Línea ' + (i + 1) + ' (' + nombre + '): Sin tipo');
                continue;
            }
            
            var tipo = normalizeTipo(tipoRaw);

            if (validTypes.indexOf(tipo) !== -1) {
                var ref = db.collection('shops').doc();
                var shopData = {
                    nombre: nombre,
                    tipo: tipo,
                    ciudadId: cityId,
                    npcDueno: '',
                    inventario: []
                };
                console.log('Agregando tienda:', nombre, 'a ciudad:', cityId);
                batch.set(ref, shopData);
                count++;
            } else {
                skipped.push('Línea ' + (i + 1) + ' (' + nombre + '): Tipo inválido "' + tipoRaw + '"');
            }
        }

        if (count === 0) {
            var errorMsg = 'No se encontraron tiendas válidas. Tipos aceptados: pociones, herrería, arquería, emporio, biblioteca, taberna, batalla, santuario, banco, posada';
            if (skipped.length > 0) {
                errorMsg += '\n\nLíneas omitidas:\n' + skipped.slice(0, 5).join('\n');
                if (skipped.length > 5) errorMsg += '\n... y ' + (skipped.length - 5) + ' más';
            }
            showToast(errorMsg, true);
            console.log('Tiendas omitidas:', skipped);
            return;
        }
        
        if (skipped.length > 0) {
            console.log('Tiendas omitidas:', skipped);
        }

        batch.commit().then(function() {
            showToast(count + ' tiendas importadas para la ciudad seleccionada');
            closeModal('import-shops-modal');
            if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId);
            if (cityIdEl) cityIdEl.value = '';
        }).catch(function(e) {
            console.error('Error al importar tiendas:', e);
            showToast('Error: ' + e.message, true);
        });
    });
    event.target.value = '';
}

// ==================== IMPORT NPCs CSV ====================
function openImportNpcsModal(cityId) {
    const cities = window.citiesData || citiesData || [];
    var city = cities.find(function(c) { return c.id === cityId; });
    if (!city) {
        showToast('Ciudad no encontrada', true);
        return;
    }
    document.getElementById('import-npcs-city-id').value = cityId;
    document.getElementById('import-npcs-city-name').textContent = city.nombre;
    openModal('import-npcs-modal');
}

function importNpcsCSV(event) {
    var file = event.target.files[0];
    if (!file) return;

    var cityId = document.getElementById('import-npcs-city-id').value;
    var validActitudes = ['amigable', 'neutral', 'hostil'];

    readFileAsText(file, function(text) {
        var lines = text.split('\n').filter(function(line) { return line.trim(); });

        if (lines.length < 2) {
            showToast('El archivo está vacío', true);
            return;
        }

        var separator = lines[0].indexOf(';') !== -1 ? ';' : ',';
        var header = lines[0].split(separator).map(function(h) { return h.trim().toLowerCase(); });
        var nombreIdx = header.indexOf('nombre');
        var rolIdx = header.indexOf('rol');
        var actitudIdx = header.indexOf('actitud');
        var notasIdx = header.indexOf('notas');

        if (nombreIdx === -1) {
            showToast('El CSV debe tener al menos la columna "nombre"', true);
            return;
        }
        if (rolIdx === -1) rolIdx = -1;
        if (actitudIdx === -1) actitudIdx = -1;
        if (notasIdx === -1) notasIdx = -1;

        var batch = db.batch();
        var count = 0;

        for (var i = 1; i < lines.length; i++) {
            var values = lines[i].split(separator).map(function(v) { return v.trim(); });
            var nombre = values[nombreIdx];
            var rol = rolIdx >= 0 ? (values[rolIdx] || '') : '';
            var actitudRaw = actitudIdx >= 0 ? (values[actitudIdx] || 'neutral').toLowerCase().trim() : 'neutral';
            var actitud = validActitudes.indexOf(actitudRaw) !== -1 ? actitudRaw : 'neutral';
            var notas = notasIdx >= 0 ? (values[notasIdx] || '') : '';

            if (nombre) {
                var ref = db.collection('npcs').doc();
                batch.set(ref, {
                    nombre: nombre,
                    ciudadId: cityId,
                    rol: rol,
                    actitud: actitud,
                    notas: notas
                });
                count++;
            }
        }

        if (count === 0) {
            showToast('No se encontraron NPCs válidos (nombre requerido)', true);
            return;
        }

        batch.commit().then(function() {
            showToast(count + ' NPCs importados');
            closeModal('import-npcs-modal');
            if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId);
        }).catch(function(err) { showToast('Error: ' + err.message, true); });
    });
    event.target.value = '';
}

// City CRUD
function openCityModal() {
    console.log('openCityModal llamado');
    console.log('db disponible:', typeof db !== 'undefined');
    console.log('openModal disponible:', typeof openModal !== 'undefined');
    console.log('showToast disponible:', typeof showToast !== 'undefined');
    
    try {
        const cityIdEl = document.getElementById('city-id');
        const cityNombreEl = document.getElementById('city-nombre');
        const cityNivelEl = document.getElementById('city-nivel');
        const cityDescripcionEl = document.getElementById('city-descripcion');
        const cityVisibleEl = document.getElementById('city-visible-jugadores');
        const cityModalTitleEl = document.getElementById('city-modal-title');
        
        console.log('Elementos encontrados:', {
            cityIdEl: !!cityIdEl,
            cityNombreEl: !!cityNombreEl,
            cityNivelEl: !!cityNivelEl,
            cityDescripcionEl: !!cityDescripcionEl,
            cityVisibleEl: !!cityVisibleEl,
            cityModalTitleEl: !!cityModalTitleEl
        });
        
        if (!cityIdEl || !cityNombreEl || !cityNivelEl || !cityDescripcionEl || !cityVisibleEl || !cityModalTitleEl) {
            console.error('Error: Elementos del modal de ciudad no encontrados');
            alert('Error: Elementos del formulario no encontrados. Revisa la consola.');
            if (typeof showToast === 'function') {
                showToast('Error: No se puede abrir el modal de ciudad', true);
            }
            return;
        }
        
        const cityImagenUrlEl = document.getElementById('city-imagen-url');
        const cityLoreEl = document.getElementById('city-lore');
        
        cityIdEl.value = '';
        cityNombreEl.value = '';
        cityNivelEl.value = '3';
        cityDescripcionEl.value = '';
        if (cityImagenUrlEl) cityImagenUrlEl.value = '';
        if (cityLoreEl) cityLoreEl.value = '';
        cityVisibleEl.checked = true;
        cityModalTitleEl.textContent = '🏘️ Nueva Ciudad';
        
        if (typeof openModal === 'function') {
            console.log('Abriendo modal city-modal');
            openModal('city-modal');
        } else {
            console.error('Error: función openModal no está definida');
            alert('Error: función openModal no está definida');
            if (typeof showToast === 'function') {
                showToast('Error: No se puede abrir el modal', true);
            }
        }
    } catch (error) {
        console.error('Error en openCityModal:', error);
        alert('Error: ' + error.message);
        if (typeof showToast === 'function') {
            showToast('Error al abrir el modal: ' + error.message, true);
        }
    }
}

// Hacer funciones globalmente accesibles
window.openCityModal = openCityModal;
window.editCity = editCity;
window.saveCity = saveCity;
window.deleteCity = deleteCity;
window.toggleCity = toggleCity;
window.toggleCityVisibility = toggleCityVisibility;
window.setEstablecimientoRecomendado = setEstablecimientoRecomendado;
window.setCityOrderPosition = setCityOrderPosition;

function editCity(id) {
    const cities = window.citiesData || citiesData || [];
    const c = cities.find(x => x.id === id);
    if (!c) {
        showToast('Ciudad no encontrada', true);
        return;
    }
    const cityIdEl = document.getElementById('city-id');
    const cityNombreEl = document.getElementById('city-nombre');
    const cityNivelEl = document.getElementById('city-nivel');
    const cityDescripcionEl = document.getElementById('city-descripcion');
    const cityImagenUrlEl = document.getElementById('city-imagen-url');
    const cityVisibleEl = document.getElementById('city-visible-jugadores');
    const cityModalTitleEl = document.getElementById('city-modal-title');
    
    if (!cityIdEl || !cityNombreEl || !cityNivelEl || !cityDescripcionEl || !cityVisibleEl || !cityModalTitleEl) {
        showToast('Error: Campos del formulario no encontrados', true);
        return;
    }
    
    cityIdEl.value = id;
    cityNombreEl.value = c.nombre;
    cityNivelEl.value = c.nivel;
    cityDescripcionEl.value = c.descripcion || '';
    if (cityImagenUrlEl) cityImagenUrlEl.value = c.imagenUrl || '';
    const cityLoreEl = document.getElementById('city-lore');
    if (cityLoreEl) cityLoreEl.value = c.lore || '';
    cityVisibleEl.checked = c.visibleToPlayers !== false;
    cityModalTitleEl.textContent = '✏️ Editar Ciudad';
    
    if (typeof openModal === 'function') {
        openModal('city-modal');
    } else {
        showToast('Error: No se puede abrir el modal', true);
    }
}

function saveCity() {
    try {
        if (!db) {
            showToast('Error: Base de datos no disponible', true);
            return;
        }
        const id = document.getElementById('city-id').value;
        const nombreEl = document.getElementById('city-nombre');
        const nivelEl = document.getElementById('city-nivel');
        const descripcionEl = document.getElementById('city-descripcion');
        const imagenUrlEl = document.getElementById('city-imagen-url');
        const loreEl = document.getElementById('city-lore');
        const visibleEl = document.getElementById('city-visible-jugadores');
        
        if (!nombreEl || !nivelEl || !descripcionEl || !visibleEl) {
            showToast('Error: Campos del formulario no encontrados', true);
            return;
        }
        
        const data = {
            nombre: nombreEl.value.trim(),
            nivel: parseInt(nivelEl.value) || 3,
            descripcion: descripcionEl.value.trim(),
            imagenUrl: imagenUrlEl ? imagenUrlEl.value.trim() : '',
            lore: loreEl ? loreEl.value.trim() : '',
            visibleToPlayers: visibleEl.checked
        };
        if (!id) {
            const cities = window.citiesData || citiesData || [];
            const maxOrder = cities.reduce((m, c) => Math.max(m, c.order ?? 0), -1);
            data.order = maxOrder + 1;
        }
        
        if (!data.nombre) { 
            showToast('Nombre requerido', true); 
            return; 
        }
        
        const promise = id 
            ? db.collection('cities').doc(id).update(data)
            : db.collection('cities').add(data);
            
        promise
            .then(() => { 
                showToast(id ? 'Ciudad actualizada' : 'Ciudad creada'); 
                if (typeof closeModal === 'function') {
                    closeModal('city-modal');
                }
                if (typeof loadWorld === 'function') loadWorld();
            })
            .catch(error => {
                console.error('Error guardando ciudad:', error);
                showToast('Error al guardar: ' + error.message, true);
            });
    } catch (error) {
        console.error('Error en saveCity:', error);
        showToast('Error: ' + error.message, true);
    }
}

function deleteCity(id, nombre) {
    if (isOldMistfallCity(nombre)) {
        showToast('Old Mistfall no puede borrarse desde aquí. Solo desde la base de datos.', true);
        return;
    }
    if (confirm(`¿Eliminar ${nombre} y todos sus NPCs/tiendas?`)) {
        const npcs = window.npcsData || npcsData || [];
        const shops = window.shopsData || shopsData || [];
        const batch = db.batch();
        batch.delete(db.collection('cities').doc(id));
        npcs.filter(n => n.ciudadId === id).forEach(n => batch.delete(db.collection('npcs').doc(n.id)));
        shops.filter(s => s.ciudadId === id).forEach(s => batch.delete(db.collection('shops').doc(s.id)));
        batch.commit().then(() => {
            showToast('Ciudad eliminada');
            if (typeof loadWorld === 'function') loadWorld();
        }).catch(e => {
            console.error('Error eliminando ciudad:', e);
            showToast('Error al eliminar: ' + e.message, true);
        });
    }
}

/** Coloca la ciudad en la posición elegida (1 = primera). Actualiza order en Firestore. */
function setCityOrderPosition(cityId, newPosition1Based) {
    if (!db || !cityId || newPosition1Based == null) return;
    const cities = window.citiesData || citiesData || [];
    const sorted = [...cities].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const idx = sorted.findIndex(c => c.id === cityId);
    if (idx < 0) return;
    const newIdx = Math.max(0, Math.min(sorted.length - 1, newPosition1Based - 1));
    if (idx === newIdx) return;
    const city = sorted[idx];
    const reordered = sorted.filter(c => c.id !== cityId);
    reordered.splice(newIdx, 0, city);
    const updates = reordered.map((c, i) => db.collection('cities').doc(c.id).update({ order: i }));
    Promise.all(updates).then(() => {
        if (typeof showToast === 'function') showToast('Orden actualizado');
        if (typeof loadWorld === 'function') loadWorld();
    }).catch(e => {
        console.error('Error actualizando orden:', e);
        if (typeof showToast === 'function') showToast('Error al cambiar orden: ' + (e.message || e), true);
    });
}

// NPC CRUD
function openNpcModal(ciudadId) {
    document.getElementById('npc-id').value = '';
    document.getElementById('npc-ciudad-id').value = ciudadId;
    document.getElementById('npc-nombre').value = '';
    document.getElementById('npc-rol').value = 'Mercader';
    document.getElementById('npc-actitud').value = 'neutral';
    document.getElementById('npc-notas').value = '';
    document.getElementById('npc-precio-batalla').value = '50';
    document.getElementById('npc-modal-title').textContent = '🎭 Nuevo NPC';
    openModal('npc-modal');
}

function editNpc(id) {
    const n = npcsData.find(x => x.id === id);
    document.getElementById('npc-id').value = id;
    document.getElementById('npc-ciudad-id').value = n.ciudadId;
    document.getElementById('npc-nombre').value = n.nombre;
    document.getElementById('npc-rol').value = n.rol;
    document.getElementById('npc-actitud').value = n.actitud;
    document.getElementById('npc-notas').value = n.notas || '';
    document.getElementById('npc-precio-batalla').value = (n.precioBatalla != null && n.precioBatalla > 0) ? n.precioBatalla : '50';
    document.getElementById('npc-modal-title').textContent = '✏️ Editar NPC';
    openModal('npc-modal');
}

function saveNpc() {
    const id = document.getElementById('npc-id').value;
    const precioBatallaEl = document.getElementById('npc-precio-batalla');
    const precioBatalla = precioBatallaEl ? (parseInt(precioBatallaEl.value) || 0) : 0;
    
    const data = {
        nombre: document.getElementById('npc-nombre').value,
        ciudadId: document.getElementById('npc-ciudad-id').value,
        rol: document.getElementById('npc-rol').value,
        actitud: document.getElementById('npc-actitud').value,
        notas: document.getElementById('npc-notas').value,
        precioBatalla: precioBatalla > 0 ? precioBatalla : null
    };
    if (!data.nombre) { showToast('Nombre requerido', true); return; }
    const cityId = data.ciudadId;
    (id ? db.collection('npcs').doc(id).update(data) : db.collection('npcs').add(data))
        .then(() => { showToast(id ? 'NPC actualizado' : 'NPC creado'); closeModal('npc-modal'); if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId); });
}

function deleteNpc(id, nombre) {
    if (confirm(`¿Eliminar a ${nombre}?`)) {
        const cityId = (npcsData || []).find(n => n.id === id)?.ciudadId;
        db.collection('npcs').doc(id).delete().then(() => { showToast('NPC eliminado'); if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId); });
    }
}

// Shop CRUD
function openShopModal(ciudadId) {
    document.getElementById('shop-id').value = '';
    document.getElementById('shop-ciudad-id').value = ciudadId;
    document.getElementById('shop-nombre').value = '';
    document.getElementById('shop-tipo').value = 'herreria';
    document.getElementById('shop-posada-cuartos').value = '';
    updateShopNpcSelect(ciudadId);
    toggleShopPosadaConfig();
    document.getElementById('shop-modal-title').textContent = '🛒 Nueva Tienda';
    openModal('shop-modal');
}

function toggleShopPosadaConfig() {
    const tipo = document.getElementById('shop-tipo').value;
    const posadaConfig = document.getElementById('shop-posada-config');
    if (posadaConfig) {
        posadaConfig.style.display = tipo === 'posada' ? 'block' : 'none';
    }
}

function editShop(id) {
    const s = shopsData.find(x => x.id === id);
    document.getElementById('shop-id').value = id;
    document.getElementById('shop-ciudad-id').value = s.ciudadId;
    document.getElementById('shop-nombre').value = s.nombre;
    document.getElementById('shop-tipo').value = s.tipo;
    if (s.posadaCuartos && Array.isArray(s.posadaCuartos)) {
        const cuartosText = s.posadaCuartos.map(c => `${c.nombre}|${c.precio}|${c.efecto}`).join('\n');
        document.getElementById('shop-posada-cuartos').value = cuartosText;
    } else {
        document.getElementById('shop-posada-cuartos').value = '';
    }
    updateShopNpcSelect(s.ciudadId);
    setTimeout(() => {
        document.getElementById('shop-npc').value = s.npcDueno || '';
        toggleShopPosadaConfig();
    }, 50);
    document.getElementById('shop-modal-title').textContent = '✏️ Editar Tienda';
    openModal('shop-modal');
}

function updateShopNpcSelect(ciudadId) {
    const sel = document.getElementById('shop-npc');
    const cityNpcs = npcsData.filter(n => n.ciudadId === ciudadId);
    sel.innerHTML = '<option value="">— Sin dueño —</option>' +
        cityNpcs.map(n => `<option value="${n.id}">${n.nombre}</option>`).join('');
}

function saveShop() {
    const id = document.getElementById('shop-id').value;
    const tipo = document.getElementById('shop-tipo').value;
    const data = {
        nombre: document.getElementById('shop-nombre').value,
        ciudadId: document.getElementById('shop-ciudad-id').value,
        tipo: tipo,
        npcDueno: document.getElementById('shop-npc').value
    };
    
    // Si es una posada, procesar los cuartos
    if (tipo === 'posada') {
        const cuartosText = document.getElementById('shop-posada-cuartos').value.trim();
        if (cuartosText) {
            const cuartos = [];
            const lines = cuartosText.split('\n').filter(l => l.trim());
            lines.forEach(line => {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 3) {
                    cuartos.push({
                        nombre: parts[0],
                        precio: parseInt(parts[1]) || 0,
                        efecto: parts.slice(2).join('|')
                    });
                }
            });
            if (cuartos.length > 0) {
                data.posadaCuartos = cuartos;
            }
        }
    }
    
    if (!id) data.inventario = [];
    if (!data.nombre) { showToast('Nombre requerido', true); return; }
    const cityId = data.ciudadId;
    (id ? db.collection('shops').doc(id).update(data) : db.collection('shops').add(data))
        .then(() => { showToast(id ? 'Tienda actualizada' : 'Tienda creada'); closeModal('shop-modal'); if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId); });
}

function deleteShop(id, nombre) {
    if (confirm(`¿Eliminar ${nombre}?`)) {
        const cityId = (shopsData || []).find(s => s.id === id)?.ciudadId;
        db.collection('shops').doc(id).delete().then(() => { showToast('Tienda eliminada'); if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId); });
    }
}

function deleteAllShopsFromCity(cityId, cityNombre) {
    if (!cityId) {
        showToast('Error: ID de ciudad no válido', true);
        return;
    }
    
    if (!confirm(`⚠️ ADVERTENCIA: Esto eliminará TODAS las tiendas de la ciudad "${cityNombre}".\n\nEsta acción NO se puede deshacer.\n\n¿Estás seguro de que deseas continuar?`)) {
        return;
    }
    
    showToast('Eliminando tiendas de ' + cityNombre + '...', false);
    
    db.collection('shops').where('ciudadId', '==', cityId).limit(50).get().then(snapshot => {
        if (snapshot.empty) {
            showToast('No hay tiendas en esta ciudad para eliminar');
            return;
        }
        
        const batch = db.batch();
        let count = 0;
        
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
            count++;
        });
        
        return batch.commit().then(() => {
            showToast(`Se eliminaron ${count} tienda${count !== 1 ? 's' : ''} de ${cityNombre}`);
            if (typeof refreshCityData === 'function') refreshCityData(cityId);
        });
    }).catch(error => {
        console.error('Error al eliminar tiendas:', error);
        showToast('Error al eliminar tiendas: ' + error.message, true);
    });
}

function deleteAllNpcsFromCity(cityId, cityNombre) {
    if (!cityId) {
        showToast('Error: ID de ciudad no válido', true);
        return;
    }
    
    if (!confirm(`⚠️ ADVERTENCIA: Esto eliminará TODOS los NPCs de la ciudad "${cityNombre}".\n\nEsta acción NO se puede deshacer.\n\n¿Estás seguro de que deseas continuar?`)) {
        return;
    }
    
    showToast('Eliminando NPCs de ' + cityNombre + '...', false);
    
    db.collection('npcs').where('ciudadId', '==', cityId).limit(300).get().then(snapshot => {
        if (snapshot.empty) {
            showToast('No hay NPCs en esta ciudad para eliminar');
            return;
        }
        
        const batch = db.batch();
        let count = 0;
        
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
            count++;
        });
        
        return batch.commit().then(() => {
            showToast(`Se eliminaron ${count} NPC${count !== 1 ? 's' : ''} de ${cityNombre}`);
            if (typeof refreshCityData === 'function') refreshCityData(cityId);
        });
    }).catch(error => {
        console.error('Error al eliminar NPCs:', error);
        showToast('Error al eliminar NPCs: ' + error.message, true);
    });
}
window.deleteAllNpcsFromCity = deleteAllNpcsFromCity;

function openBatallaConfigModal(shopId) {
    const shops = window.shopsData || shopsData || [];
    const shop = shops.find(s => s.id === shopId);
    if (!shop) {
        showToast('Tienda no encontrada', true);
        return;
    }
    if ((shop.tipo || '').toLowerCase() !== 'batalla') {
        showToast('Esta tienda no es de tipo batalla', true);
        return;
    }

    const cities = window.citiesData || citiesData || [];
    const city = cities.find(c => c.id === shop.ciudadId);
    const cityNombre = city ? city.nombre : '—';

    const shopIdEl = document.getElementById('batalla-config-shop-id');
    const shopNameEl = document.getElementById('batalla-config-shop-name');
    const cityNameEl = document.getElementById('batalla-config-city-name');
    if (!shopIdEl || !shopNameEl || !cityNameEl) {
        showToast('Error: Modal de batalla no disponible', true);
        return;
    }

    shopIdEl.value = shopId;
    shopNameEl.textContent = shop.nombre || 'Tienda de batalla';
    cityNameEl.textContent = cityNombre;
    document.getElementById('batalla-config-npc-select').value = '';
    document.getElementById('batalla-config-custom-name').value = '';
    // Precio fijo por combate (si no existe, usar 300 por defecto)
    const precioFijoEl = document.getElementById('batalla-config-precio-fijo');
    if (precioFijoEl) precioFijoEl.value = (shop.batallaPrecioFijo != null ? shop.batallaPrecioFijo : 300);

    // Cargar NPCs de la ciudad de la tienda
    const cityNpcs = (window.npcsData || npcsData || []).filter(n => n.ciudadId === shop.ciudadId);
    const npcSelect = document.getElementById('batalla-config-npc-select');
    npcSelect.innerHTML = '<option value="">— Seleccionar NPC —</option>' +
        cityNpcs.map(n => `<option value="${n.id}">${n.nombre || 'Sin nombre'}</option>`).join('');

    // Cargar oponentes ya configurados EN ESTA TIENDA
    const oponentes = (shop.batallaOponentes && Array.isArray(shop.batallaOponentes)) ? shop.batallaOponentes : [];
    batallaConfigOponentes = oponentes.slice();
    renderBatallaConfigOponentes(batallaConfigOponentes);
    openModal('batalla-config-modal');
}

let batallaConfigOponentes = [];

function addBatallaOponente() {
    const npcSelect = document.getElementById('batalla-config-npc-select');
    const customName = document.getElementById('batalla-config-custom-name').value.trim();
    
    let nombre = '';
    let npcId = null;
    
    if (npcSelect.value) {
        const npcs = window.npcsData || npcsData || [];
        const npc = npcs.find(n => n.id === npcSelect.value);
        if (npc) {
            nombre = npc.nombre;
            npcId = npc.id;
        }
    } else if (customName) {
        nombre = customName;
    } else {
        showToast('Debes seleccionar un NPC o escribir un nombre personalizado', true);
        return;
    }
    
    if (!nombre) {
        showToast('Nombre requerido', true);
        return;
    }
    
    batallaConfigOponentes.push({
        nombre: nombre,
        npcId: npcId,
        isCustom: !npcId
    });
    
    renderBatallaConfigOponentes(batallaConfigOponentes);
    
    // Limpiar campos
    npcSelect.value = '';
    document.getElementById('batalla-config-custom-name').value = '';
}

function removeBatallaOponente(index) {
    batallaConfigOponentes.splice(index, 1);
    renderBatallaConfigOponentes(batallaConfigOponentes);
}

function renderBatallaConfigOponentes(oponentes) {
    const listEl = document.getElementById('batalla-config-oponentes-list');
    if (!listEl) return;
    oponentes = oponentes || [];
    batallaConfigOponentes = oponentes;
    if (oponentes.length === 0) {
        listEl.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">No hay oponentes configurados. Agrega algunos arriba.</p>';
        return;
    }
    
    listEl.innerHTML = oponentes.map((op, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(0,0,0,0.25); border:1px solid #4a3c31; border-radius:8px;">
            <div style="flex:1;">
                <div style="color:#d4c4a8; font-weight:bold;">${op.nombre}</div>
                <div style="color:#8b7355; font-size:0.85em;">${op.isCustom ? 'Bestia/Oponente personalizado' : 'NPC de la ciudad'}</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <button class="btn btn-small btn-danger" onclick="removeBatallaOponente(${idx})" style="padding:4px 8px;">🗑️</button>
            </div>
        </div>
    `).join('');
}

function saveBatallaConfig() {
    const shopIdEl = document.getElementById('batalla-config-shop-id');
    const shopId = shopIdEl ? shopIdEl.value : '';
    if (!shopId) return;

    const precioFijoEl = document.getElementById('batalla-config-precio-fijo');
    const precioFijo = precioFijoEl ? (parseInt(precioFijoEl.value) || 0) : 0;

    const ref = db.collection('shops').doc(shopId);
    const cityId = (shopsData || []).find(s => s.id === shopId)?.ciudadId;
    ref.update({
        batallaOponentes: batallaConfigOponentes,
        batallaPrecioFijo: precioFijo
    }).then(() => {
        showToast('Configuración guardada para esta tienda de batalla');
        closeModal('batalla-config-modal');
        if (typeof refreshCityData === 'function' && cityId) refreshCityData(cityId);
    }).catch(error => {
        console.error('Error guardando configuración:', error);
        showToast('Error al guardar: ' + error.message, true);
    });
}

// Hacer función disponible globalmente
window.readFileAsText = readFileAsText;
window.toggleShopPosadaConfig = toggleShopPosadaConfig;
window.deleteAllShopsFromCity = deleteAllShopsFromCity;
window.openBatallaConfigModal = openBatallaConfigModal;
window.addBatallaOponente = addBatallaOponente;
window.removeBatallaOponente = removeBatallaOponente;
window.saveBatallaConfig = saveBatallaConfig;

// Initialize - No cargar automáticamente aquí, se carga desde app.js cuando el DM inicia sesión
// loadWorld() se llama desde showDashboard() en app.js
