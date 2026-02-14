// ==================== TRANSACTIONS ====================
const TRANSACTIONS_PAGE_SIZE = 10;
const TRANSACTIONS_MAX_AGE_DAYS = 30;
let transactionsData = [];
let currentTransactionsPage = 1;

function buildTransactionCardBody(t, tipo) {
    if (tipo === 'compra') {
        return `
            <div class="card-stat"><span class="card-stat-label">👤 Comprador</span><span class="card-stat-value">${t.playerName || 'Desconocido'}</span></div>
            <div class="card-stat"><span class="card-stat-label">🏪 Tienda</span><span class="card-stat-value">${t.shopName || 'Desconocida'}</span></div>
            <div class="card-stat"><span class="card-stat-label">💰 Precio</span><span class="card-stat-value gold-value">${t.precio} GP</span></div>`;
    }
    if (tipo === 'venta') {
        return `
            <div class="card-stat"><span class="card-stat-label">👤 Vendido por</span><span class="card-stat-value">${t.playerName || 'Desconocido'}</span></div>
            <div class="card-stat"><span class="card-stat-label">🏪 Concepto</span><span class="card-stat-value">Venta</span></div>
            <div class="card-stat"><span class="card-stat-label">💰 Ingreso</span><span class="card-stat-value gold-value">${t.precio} GP</span></div>`;
    }
    if (tipo === 'deposito') {
        return `
            <div class="card-stat"><span class="card-stat-label">👤 Depositado por</span><span class="card-stat-value">${t.playerName || 'Desconocido'}</span></div>
            <div class="card-stat"><span class="card-stat-label">🏦 Banco</span><span class="card-stat-value">${t.shopName || 'Banco'}</span></div>
            <div class="card-stat"><span class="card-stat-label">💰 Cantidad</span><span class="card-stat-value gold-value">${t.precio} GP</span></div>`;
    }
    if (tipo === 'retiro') {
        const comision = t.comision != null ? t.comision : 0;
        return `
            <div class="card-stat"><span class="card-stat-label">👤 Retirado por</span><span class="card-stat-value">${t.playerName || 'Desconocido'}</span></div>
            <div class="card-stat"><span class="card-stat-label">🏦 Banco</span><span class="card-stat-value">${t.shopName || 'Banco'}</span></div>
            <div class="card-stat"><span class="card-stat-label">💰 Recibido</span><span class="card-stat-value gold-value">${t.precio} GP</span></div>
            ${comision > 0 ? `<div class="card-stat"><span class="card-stat-label">📉 Comisión (2%)</span><span class="card-stat-value">${comision} GP</span></div>` : ''}`;
    }
    if (tipo === 'hospedaje') {
        return `
            <div class="card-stat"><span class="card-stat-label">👤 Huésped</span><span class="card-stat-value">${t.playerName || 'Desconocido'}</span></div>
            <div class="card-stat"><span class="card-stat-label">🏨 Posada</span><span class="card-stat-value">${t.shopName || 'Posada'}</span></div>
            <div class="card-stat"><span class="card-stat-label">💰 Precio/noche</span><span class="card-stat-value gold-value">${t.precio} GP</span></div>`;
    }
    return `
        <div class="card-stat"><span class="card-stat-label">👤 Usado por</span><span class="card-stat-value">${t.playerName || 'Desconocido'}</span></div>
        <div class="card-stat"><span class="card-stat-label">📌 Tipo</span><span class="card-stat-value">Uso (consumido)</span></div>`;
}

function renderTransactionsPage() {
    const list = document.getElementById('transactions-list');
    const searchEl = document.getElementById('transactions-search');
    const filterPlayerEl = document.getElementById('transactions-filter-player');
    const filterShopEl = document.getElementById('transactions-filter-shop');
    const search = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
    const filterPlayer = (filterPlayerEl && filterPlayerEl.value) ? filterPlayerEl.value : '';
    const filterShop = (filterShopEl && filterShopEl.value) ? filterShopEl.value : '';

    let filtered = transactionsData.slice();
    if (filterPlayer) filtered = filtered.filter(t => (t.playerName || 'Desconocido') === filterPlayer);
    if (filterShop) filtered = filtered.filter(t => (t.shopName || '') === filterShop);
    if (search) filtered = filtered.filter(t => (t.itemName || '').toLowerCase().includes(search));
    const totalPages = Math.max(1, Math.ceil(filtered.length / TRANSACTIONS_PAGE_SIZE));
    currentTransactionsPage = Math.min(Math.max(1, currentTransactionsPage), totalPages);
    const start = (currentTransactionsPage - 1) * TRANSACTIONS_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + TRANSACTIONS_PAGE_SIZE);

    if (!pageItems.length) {
        const hasFilter = search || filterPlayer || filterShop;
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>' + (hasFilter ? 'No hay resultados con los filtros seleccionados.' : 'No hay transacciones') + '</p></div>';
    } else {
        list.innerHTML = '<div class="cards-grid">';
        const tipoLabels = { compra: 'Compra', venta: 'Venta', deposito: 'Depósito', retiro: 'Retiro', hospedaje: 'Hospedaje' };
        pageItems.forEach(t => {
            const fecha = t.fecha?.toDate?.() || new Date();
            const tipo = t.tipo || 'compra';
            const tipoLabel = tipoLabels[tipo] || 'Uso';
            const tipoClass = tipo === 'compra' ? '' : tipo === 'venta' ? 'tipo-venta' : tipo === 'deposito' ? 'tipo-deposito' : tipo === 'retiro' ? 'tipo-retiro' : tipo === 'hospedaje' ? 'tipo-hospedaje' : 'tipo-uso';
            const body = buildTransactionCardBody(t, tipo);
            list.innerHTML += `
                <div class="card ${tipoClass}">
                    <div class="card-header">
                        <div>
                            <span class="tipo-badge tipo-${tipo}">${tipoLabel}</span>
                            <div class="card-title">${t.itemName}</div>
                            <div class="card-subtitle">${fecha.toLocaleDateString('es')} ${fecha.toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                    </div>
                    <div class="card-body">${body}</div>
                </div>`;
        });
        list.innerHTML += '</div>';
    }

    const paginationEl = document.getElementById('transactions-pagination');
    if (paginationEl) {
        if (filtered.length <= TRANSACTIONS_PAGE_SIZE && filtered.length > 0) {
            paginationEl.style.display = 'none';
        } else if (filtered.length > TRANSACTIONS_PAGE_SIZE) {
            paginationEl.style.display = 'flex';
            paginationEl.innerHTML = `
                <button type="button" class="btn-pagination" id="transactions-prev" ${currentTransactionsPage <= 1 ? 'disabled' : ''}>← Anterior</button>
                <span class="pagination-info">Página ${currentTransactionsPage} de ${totalPages} (${filtered.length} resultado${filtered.length !== 1 ? 's' : ''})</span>
                <button type="button" class="btn-pagination" id="transactions-next" ${currentTransactionsPage >= totalPages ? 'disabled' : ''}>Siguiente →</button>`;
            const prevBtn = document.getElementById('transactions-prev');
            const nextBtn = document.getElementById('transactions-next');
            if (prevBtn) prevBtn.onclick = () => { currentTransactionsPage--; renderTransactionsPage(); };
            if (nextBtn) nextBtn.onclick = () => { currentTransactionsPage++; renderTransactionsPage(); };
        } else {
            paginationEl.style.display = 'none';
        }
    }
}

function populateTransactionsFilters() {
    const playerNames = [...new Set(transactionsData.map(t => t.playerName || 'Desconocido').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const playerSelect = document.getElementById('transactions-filter-player');
    const shopSelect = document.getElementById('transactions-filter-shop');
    if (playerSelect) {
        const current = playerSelect.value;
        playerSelect.innerHTML = '<option value="">Todos</option>' + playerNames.map(n => `<option value="${(n + '').replace(/"/g, '&quot;')}">${(n + '').replace(/</g, '&lt;')}</option>`).join('');
        if (playerNames.includes(current)) playerSelect.value = current;
    }
    const shopNames = [...new Set(transactionsData.map(t => t.shopName || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (shopSelect) {
        const current = shopSelect.value;
        shopSelect.innerHTML = '<option value="">Todas</option>' + shopNames.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n.replace(/</g, '&lt;')}</option>`).join('');
        if (shopNames.includes(current)) shopSelect.value = current;
        else shopSelect.value = '';
    }
}

var _transactionsUnsubscribe = null;

/** Fecha límite: solo transacciones de los últimos N días. */
function getTransactionsCutoffTimestamp() {
    const d = new Date();
    d.setDate(d.getDate() - TRANSACTIONS_MAX_AGE_DAYS);
    d.setHours(0, 0, 0, 0);
    return firebase.firestore.Timestamp.fromDate(d);
}

/** Elimina transacciones con más de 30 días (en segundo plano). */
function cleanupOldTransactions() {
    const cutoff = getTransactionsCutoffTimestamp();
    db.collection('transactions').where('fecha', '<', cutoff).limit(500).get()
        .then(snap => {
            if (snap.empty) return;
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            return batch.commit();
        })
        .catch(err => console.error('Cleanup transacciones antiguas:', err));
}

// OPTIMIZACIÓN READS: get() al abrir pestaña Historial; solo últimas 10 y últimos 30 días
function loadTransactions() {
    const list = document.getElementById('transactions-list');
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>Cargando transacciones...</p></div>';
    const cutoff = getTransactionsCutoffTimestamp();
    db.collection('transactions').where('fecha', '>=', cutoff).orderBy('fecha', 'desc').limit(10).get()
        .then(snap => {
            if (snap.empty) {
                transactionsData = [];
                list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>No hay transacciones (solo se muestran las últimas 10 de los últimos 30 días)</p></div>';
                const paginationEl = document.getElementById('transactions-pagination');
                if (paginationEl) paginationEl.style.display = 'none';
                cleanupOldTransactions();
                return;
            }
            transactionsData = [];
            snap.forEach(doc => transactionsData.push({ id: doc.id, ...doc.data() }));
            transactionsData.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '', 'es'));
            populateTransactionsFilters();
            const searchEl = document.getElementById('transactions-search');
            const filterPlayerEl = document.getElementById('transactions-filter-player');
            const filterShopEl = document.getElementById('transactions-filter-shop');
            const applyFilters = () => { currentTransactionsPage = 1; renderTransactionsPage(); };
            if (searchEl && !searchEl.oninput) searchEl.oninput = applyFilters;
            if (filterPlayerEl && !filterPlayerEl._bound) { filterPlayerEl._bound = true; filterPlayerEl.onchange = applyFilters; }
            if (filterShopEl && !filterShopEl._bound) { filterShopEl._bound = true; filterShopEl.onchange = applyFilters; }
            currentTransactionsPage = 1;
            renderTransactionsPage();
            cleanupOldTransactions();
        })
        .catch(err => {
            console.error('Error cargando transacciones:', err);
            list.innerHTML = '<div class="empty-state"><p style="color:#d4af37;">Error al cargar transacciones.</p></div>';
        });
}

function stopTransactionsListener() {
    if (_transactionsUnsubscribe) {
        _transactionsUnsubscribe();
        _transactionsUnsubscribe = null;
    }
}

/** Borra todas las transacciones de la colección Firestore (por lotes de 500). */
async function deleteAllTransactions() {
    if (!confirm('¿Borrar TODAS las transacciones de la base de datos? Esta acción no se puede deshacer.')) return;
    const btn = document.getElementById('transactions-delete-all');
    if (btn) { btn.disabled = true; btn.textContent = 'Borrando…'; }
    try {
        const snap = await db.collection('transactions').get();
        if (snap.empty) {
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ Borrar todas'; }
            return;
        }
        const refs = [];
        snap.forEach(doc => refs.push(doc.ref));
        const BATCH_SIZE = 500;
        for (let i = 0; i < refs.length; i += BATCH_SIZE) {
            const batch = db.batch();
            refs.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
            await batch.commit();
        }
        transactionsData = [];
        renderTransactionsPage();
        if (typeof showToast === 'function') showToast('Transacciones borradas.');
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('Error al borrar: ' + (e.message || e), true);
    }
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Borrar todas'; }
}

// No cargar al inicio; se cargará al abrir la pestaña Historial (desde app.js).

const deleteAllBtn = document.getElementById('transactions-delete-all');
if (deleteAllBtn) deleteAllBtn.addEventListener('click', deleteAllTransactions);
