// ==================== MISIONES ====================
// DM: crear, editar, hacer visibles, marcar completadas, reabrir. Solo el DM marca completada.
// Aventureros: ver misiones visibles, aceptar/en curso (no pueden marcar completada). Historial = misiones que el DM marcó completadas.

const MISSION_STATUS = { draft: 'draft', visible: 'visible', completed: 'completed', archived: 'archived' };
const PLAYER_PROGRESS_STATUS = { accepted: 'accepted', in_progress: 'in_progress', rejected: 'rejected' };

let missionsData = [];

// ---------- DM ----------

function switchDMMissionsSubtab(subtabId) {
    const section = document.getElementById('missions');
    if (!section) return;
    const subtabs = section.querySelectorAll('.dm-missions-subtab');
    const activasPanel = document.getElementById('dm-missions-activas-panel');
    const rechazadasPanel = document.getElementById('dm-missions-rechazadas-panel');
    const historialPanel = document.getElementById('dm-missions-historial-panel');
    const leyendaPanel = document.getElementById('dm-missions-leyenda-panel');
    if (!subtabs.length || !activasPanel || !rechazadasPanel || !historialPanel || !leyendaPanel) return;
    subtabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-dm-missions-subtab') === subtabId);
    });
    activasPanel.style.display = subtabId === 'activas' ? 'block' : 'none';
    rechazadasPanel.style.display = subtabId === 'rechazadas' ? 'block' : 'none';
    historialPanel.style.display = subtabId === 'historial' ? 'block' : 'none';
    leyendaPanel.style.display = subtabId === 'leyenda' ? 'block' : 'none';
    if (subtabId === 'activas') renderDMMissionsList('activas');
    if (subtabId === 'rechazadas') renderDMMissionsList('rechazadas');
    if (subtabId === 'historial') renderDMMissionsList('historial');
    if (subtabId === 'leyenda') loadLegendTracks();
}

// OPTIMIZACIÓN READS: get() al cargar/refrescar, sin listener permanente
function loadDMMissions() {
    db.collection('missions')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
        .then(snap => {
            missionsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const activasOn = document.getElementById('dm-missions-activas-panel')?.style.display !== 'none';
            const rechazadasOn = document.getElementById('dm-missions-rechazadas-panel')?.style.display !== 'none';
            const historialOn = document.getElementById('dm-missions-historial-panel')?.style.display !== 'none';
            const filter = activasOn ? 'activas' : (rechazadasOn ? 'rechazadas' : (historialOn ? 'historial' : 'activas'));
            renderDMMissionsList(filter);
        })
        .catch(err => {
            console.error('Missions load:', err);
            missionsData = [];
            renderDMMissionsList('activas');
        });
}

function renderDMMissionsList(filter) {
    const activasContainer = document.getElementById('dm-missions-activas-list');
    const rechazadasContainer = document.getElementById('dm-missions-rechazadas-list');
    const historialContainer = document.getElementById('dm-missions-historial-list');
    if (!activasContainer || !rechazadasContainer || !historialContainer) return;

    const hasRejections = (m) => {
        if (!m.playerProgress || typeof m.playerProgress !== 'object') return false;
        return Object.keys(m.playerProgress).some(pid => m.playerProgress[pid] && m.playerProgress[pid].status === PLAYER_PROGRESS_STATUS.rejected);
    };

    const activas = missionsData.filter(m => m.status === MISSION_STATUS.draft || m.status === MISSION_STATUS.visible);
    const rechazadas = missionsData.filter(m => m.status === MISSION_STATUS.visible && hasRejections(m));
    const historial = missionsData.filter(m => m.status === MISSION_STATUS.completed || m.status === MISSION_STATUS.archived);

    const esc = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const players = window.playersData || [];
    const getPlayerName = (playerId) => {
        const p = players.find(x => x.id === playerId);
        return p ? (p.nombre || playerId) : playerId;
    };

    activasContainer.innerHTML = activas.length === 0
        ? '<p style="color:#8b7355; text-align:center; padding:30px;">No hay misiones activas. Crea una con "+ Nueva misión".</p>'
        : activas.map(m => {
            const statusLabel = m.status === MISSION_STATUS.visible ? 'Visible' : 'Borrador';
            const visibleToLabel = (m.visibleTo === 'player' && Array.isArray(m.assignedPlayerIds) && m.assignedPlayerIds.length)
                ? `${m.assignedPlayerIds.length} jugador(es)` : (m.visibleTo === 'all' ? 'Todos' : '—');
            const nivelLabel = m.nivel != null && m.nivel !== '' ? `Nivel ${m.nivel}` : '';
            const desc = (m.description || '').trim();
            const pp = m.playerProgress || {};
            const acceptedIds = Object.keys(pp).filter(pid => pp[pid] && pp[pid].status === PLAYER_PROGRESS_STATUS.accepted);
            const inProgressIds = Object.keys(pp).filter(pid => pp[pid] && pp[pid].status === PLAYER_PROGRESS_STATUS.in_progress);
            const acceptedLabel = acceptedIds.length ? 'Aceptada por: ' + acceptedIds.map(pid => esc(getPlayerName(pid))).join(', ') : '';
            const inProgressLabel = inProgressIds.length ? 'En curso: ' + inProgressIds.map(pid => esc(getPlayerName(pid))).join(', ') : '';
            return `
                <div class="mission-card" data-mission-id="${esc(m.id)}">
                    <div class="mission-card-header">
                        <h3 class="mission-card-title">${esc(m.title || 'Sin título')}</h3>
                        <span class="mission-card-meta">${statusLabel}${nivelLabel ? ' · ' + esc(nivelLabel) : ''}</span>
                    </div>
                    ${desc ? `<p class="mission-card-desc">${esc(desc)}</p>` : ''}
                    <p class="mission-card-extra">Visibilidad: ${esc(visibleToLabel)}</p>
                    ${acceptedLabel ? `<p class="mission-card-extra" style="color:#8fbc8f;">✓ ${acceptedLabel}</p>` : ''}
                    ${inProgressLabel ? `<p class="mission-card-extra" style="color:#d4af37;">▶ ${inProgressLabel}</p>` : ''}
                    <div class="mission-card-actions">
                        <button type="button" class="btn btn-small" onclick="openMissionModal('${esc(m.id)}')">Editar</button>
                        ${m.status === MISSION_STATUS.draft ? `<button type="button" class="btn btn-small" onclick="setMissionStatus('${esc(m.id)}', 'visible')">Hacer visible</button>` : ''}
                        ${m.status === MISSION_STATUS.visible ? `<button type="button" class="btn btn-small" onclick="setMissionStatus('${esc(m.id)}', 'completed')">Marcar completada</button>` : ''}
                        <button type="button" class="btn btn-small btn-secondary mini-card-delete-btn" onclick="deleteMission('${esc(m.id)}')" title="Eliminar">🗑️</button>
                    </div>
                </div>`;
        }).join('');

    rechazadasContainer.innerHTML = rechazadas.length === 0
        ? '<p style="color:#8b7355; text-align:center; padding:30px;">No hay misiones rechazadas.</p>'
        : rechazadas.map(m => {
            const rejectedPlayerIds = Object.keys(m.playerProgress || {}).filter(pid => m.playerProgress[pid] && m.playerProgress[pid].status === PLAYER_PROGRESS_STATUS.rejected);
            const rejectedLabel = 'Rechazada por: ' + rejectedPlayerIds.map(pid => esc(getPlayerName(pid))).join(', ');
            const visibleToLabel = (m.visibleTo === 'player' && Array.isArray(m.assignedPlayerIds) && m.assignedPlayerIds.length)
                ? `${m.assignedPlayerIds.length} jugador(es)` : (m.visibleTo === 'all' ? 'Todos' : '—');
            const nivelLabel = m.nivel != null && m.nivel !== '' ? ` · Nivel ${m.nivel}` : '';
            const desc = (m.description || '').trim();
            return `
                <div class="mission-card" data-mission-id="${esc(m.id)}" style="border-color: #8b5a2b;">
                    <div class="mission-card-header">
                        <h3 class="mission-card-title">${esc(m.title || 'Sin título')}</h3>
                        <span class="mission-card-meta">Visible${esc(nivelLabel)}</span>
                    </div>
                    ${desc ? `<p class="mission-card-desc">${esc(desc)}</p>` : ''}
                    <p class="mission-card-extra">Visibilidad: ${esc(visibleToLabel)}</p>
                    <p class="mission-card-extra" style="color:#b87333;">❌ ${rejectedLabel}</p>
                    <div class="mission-card-actions">
                        <button type="button" class="btn btn-small" onclick="openMissionModal('${esc(m.id)}')">Editar</button>
                        <button type="button" class="btn btn-small" onclick="clearMissionRejections('${esc(m.id)}')" title="Quitar rechazos para que los jugadores puedan aceptarla de nuevo">Volver a asignar</button>
                        <button type="button" class="btn btn-small" onclick="setMissionStatus('${esc(m.id)}', 'completed')">Marcar completada</button>
                        <button type="button" class="btn btn-small btn-secondary mini-card-delete-btn" onclick="deleteMission('${esc(m.id)}')" title="Eliminar">🗑️</button>
                    </div>
                </div>`;
        }).join('');

    historialContainer.innerHTML = historial.length === 0
        ? '<p style="color:#8b7355; text-align:center; padding:30px;">No hay misiones en el historial.</p>'
        : historial.map(m => {
            const statusLabel = m.status === MISSION_STATUS.completed ? 'Completada' : 'Archivada';
            const completedStr = m.completedAt && m.completedAt.toDate ? m.completedAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
            const nivelLabel = m.nivel != null && m.nivel !== '' ? ` · Nivel ${m.nivel}` : '';
            const desc = (m.description || '').trim();
            return `
                <div class="mission-card" data-mission-id="${esc(m.id)}" style="opacity: 0.92;">
                    <div class="mission-card-header">
                        <h3 class="mission-card-title">${esc(m.title || 'Sin título')}</h3>
                        <span class="mission-card-meta">${statusLabel} · ${completedStr}${esc(nivelLabel)}</span>
                    </div>
                    ${desc ? `<p class="mission-card-desc">${esc(desc)}</p>` : ''}
                    <div class="mission-card-actions">
                        <button type="button" class="btn btn-small" onclick="openMissionModal('${esc(m.id)}')">Ver / Editar</button>
                        <button type="button" class="btn btn-small" onclick="setMissionStatus('${esc(m.id)}', 'visible')" title="Volver a poner visible para jugadores">Reabrir</button>
                        ${m.status === MISSION_STATUS.completed ? `<button type="button" class="btn btn-small btn-secondary" onclick="setMissionStatus('${esc(m.id)}', 'archived')">Archivar</button>` : ''}
                        <button type="button" class="btn btn-small btn-secondary mini-card-delete-btn" onclick="deleteMission('${esc(m.id)}')" title="Eliminar">🗑️</button>
                    </div>
                </div>`;
        }).join('');
}

function openMissionModal(missionId) {
    const modal = document.getElementById('mission-modal');
    const titleEl = document.getElementById('mission-modal-title');
    const titleInput = document.getElementById('mission-title');
    const descInput = document.getElementById('mission-description');
    const statusSelect = document.getElementById('mission-status');
    const visibleToSelect = document.getElementById('mission-visible-to');
    const assignedPlayersWrap = document.getElementById('mission-assigned-players-wrap');
    const rewardInput = document.getElementById('mission-reward');
    const nivelInput = document.getElementById('mission-nivel');
    if (!modal || !titleInput || !descInput) return;

    if (titleEl) titleEl.textContent = missionId ? '📋 Editar misión' : '📋 Nueva misión';

    if (missionId) {
        const m = missionsData.find(x => x.id === missionId);
        if (!m) return;
        titleInput.value = m.title || '';
        descInput.value = m.description || '';
        if (rewardInput) rewardInput.value = m.reward || '';
        if (nivelInput) nivelInput.value = m.nivel != null && m.nivel !== '' ? m.nivel : '';
        if (statusSelect) statusSelect.value = m.status || MISSION_STATUS.draft;
        if (visibleToSelect) visibleToSelect.value = m.visibleTo || 'all';
        if (assignedPlayersWrap) {
            assignedPlayersWrap.innerHTML = '';
            const players = (window.getVisiblePlayers && window.getVisiblePlayers()) || (window.playersData || []).filter(p => p.visible !== false);
            const assigned = Array.isArray(m.assignedPlayerIds) ? m.assignedPlayerIds : [];
            players.forEach(p => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.marginBottom = '6px';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = p.id;
                cb.checked = assigned.includes(p.id);
                cb.style.marginRight = '8px';
                label.appendChild(cb);
                label.appendChild(document.createTextNode(p.nombre || p.id));
                assignedPlayersWrap.appendChild(label);
            });
        }
        modal.dataset.missionId = missionId;
    } else {
        titleInput.value = '';
        descInput.value = '';
        if (rewardInput) rewardInput.value = '';
        if (nivelInput) nivelInput.value = '';
        if (statusSelect) statusSelect.value = MISSION_STATUS.draft;
        if (visibleToSelect) visibleToSelect.value = 'all';
        if (assignedPlayersWrap) {
            assignedPlayersWrap.innerHTML = '';
            const playersNew = (window.getVisiblePlayers && window.getVisiblePlayers()) || (window.playersData || []).filter(p => p.visible !== false);
            playersNew.forEach(p => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.marginBottom = '6px';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = p.id;
                cb.checked = false;
                cb.style.marginRight = '8px';
                label.appendChild(cb);
                label.appendChild(document.createTextNode(p.nombre || p.id));
                assignedPlayersWrap.appendChild(label);
            });
        }
        delete modal.dataset.missionId;
    }
    openModal('mission-modal');
}

function saveMission() {
    const titleInput = document.getElementById('mission-title');
    const descInput = document.getElementById('mission-description');
    const statusSelect = document.getElementById('mission-status');
    const visibleToSelect = document.getElementById('mission-visible-to');
    const assignedPlayersWrap = document.getElementById('mission-assigned-players-wrap');
    const rewardInput = document.getElementById('mission-reward');
    const nivelInput = document.getElementById('mission-nivel');
    const modal = document.getElementById('mission-modal');
    if (!titleInput || !descInput || !modal) return;

    const title = (titleInput.value || '').trim();
    if (!title) {
        showToast('Escribe un título para la misión', true);
        return;
    }

    const assignedPlayerIds = [];
    if (assignedPlayersWrap) {
        assignedPlayersWrap.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => assignedPlayerIds.push(cb.value));
    }

    const user = getCurrentUser();
    const payload = {
        title,
        description: (descInput.value || '').trim(),
        status: (statusSelect && statusSelect.value) || MISSION_STATUS.draft,
        visibleTo: (visibleToSelect && visibleToSelect.value) || 'all',
        assignedPlayerIds,
        reward: (rewardInput && rewardInput.value) ? rewardInput.value.trim() : '',
        nivel: (nivelInput && nivelInput.value !== undefined && nivelInput.value !== '') ? (isNaN(Number(nivelInput.value)) ? nivelInput.value.trim() : Number(nivelInput.value)) : null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const missionId = modal.dataset.missionId;
    if (missionId) {
        db.collection('missions').doc(missionId).update(payload).then(() => {
            showToast('Misión actualizada');
            closeModal('mission-modal');
            if (typeof loadDMMissions === 'function') loadDMMissions();
        }).catch(e => {
            showToast('Error: ' + e.message, true);
        });
    } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        payload.createdBy = user && user.id ? user.id : '';
        db.collection('missions').add(payload).then(() => {
            showToast('Misión creada');
            closeModal('mission-modal');
            if (typeof loadDMMissions === 'function') loadDMMissions();
        }).catch(e => {
            showToast('Error: ' + e.message, true);
        });
    }
}

function setMissionStatus(missionId, status) {
    if (!missionId) return;
    const updates = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (status === MISSION_STATUS.completed) {
        updates.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    if (status === MISSION_STATUS.visible && typeof firebase.firestore.FieldValue.delete === 'function') {
        updates.completedAt = firebase.firestore.FieldValue.delete();
    }
    db.collection('missions').doc(missionId).update(updates).then(() => {
        const msg = status === MISSION_STATUS.visible ? 'Misión reabierta (visible para jugadores)' : status === MISSION_STATUS.completed ? 'Misión marcada como completada (se actualizará en la app del jugador)' : 'Misión archivada';
        showToast(msg);
        if (typeof loadDMMissions === 'function') loadDMMissions();
    }).catch(e => showToast('Error: ' + e.message, true));
}

function deleteMission(missionId) {
    if (!missionId || !confirm('¿Eliminar esta misión?')) return;
    db.collection('missions').doc(missionId).delete().then(() => {
        showToast('Misión eliminada');
        if (typeof loadDMMissions === 'function') loadDMMissions();
    }).catch(e => showToast('Error: ' + e.message, true));
}

function clearMissionRejections(missionId) {
    if (!missionId) return;
    const ref = db.collection('missions').doc(missionId);
    ref.get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const playerProgress = data.playerProgress || {};
        const rejectedPlayerIds = Object.keys(playerProgress).filter(pid =>
            playerProgress[pid] && playerProgress[pid].status === PLAYER_PROGRESS_STATUS.rejected
        );
        if (!rejectedPlayerIds.length) {
            showToast('No hay rechazos que limpiar');
            return;
        }
        const updates = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (typeof firebase.firestore.FieldValue.delete === 'function') {
            rejectedPlayerIds.forEach(pid => {
                updates['playerProgress.' + pid] = firebase.firestore.FieldValue.delete();
            });
        } else {
            const newProgress = { ...playerProgress };
            rejectedPlayerIds.forEach(pid => delete newProgress[pid]);
            updates.playerProgress = newProgress;
        }
        ref.update(updates).then(() => {
            showToast('Misión vuelta a asignar. Los jugadores podrán aceptarla de nuevo.');
            const rechazadasOn = document.getElementById('dm-missions-rechazadas-panel')?.style.display !== 'none';
            const historialOn = document.getElementById('dm-missions-historial-panel')?.style.display !== 'none';
            renderDMMissionsList(rechazadasOn ? 'rechazadas' : (historialOn ? 'historial' : 'activas'));
        }).catch(e => showToast('Error: ' + e.message, true));
    }).catch(e => showToast('Error: ' + e.message, true));
}

// ---------- JUGADOR ----------

function switchPlayerMissionsSubtab(subtabId) {
    const section = document.getElementById('player-missions');
    if (!section) return;
    const subtabs = section.querySelectorAll('.player-missions-subtab');
    const activasPanel = document.getElementById('player-missions-activas-panel');
    const historialPanel = document.getElementById('player-missions-historial-panel');
    const leyendaPanel = document.getElementById('player-missions-leyenda-panel');
    if (!subtabs.length || !activasPanel || !historialPanel || !leyendaPanel) return;
    subtabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-player-missions-subtab') === subtabId);
    });
    activasPanel.style.display = subtabId === 'activas' ? 'block' : 'none';
    historialPanel.style.display = subtabId === 'historial' ? 'block' : 'none';
    leyendaPanel.style.display = subtabId === 'leyenda' ? 'block' : 'none';
    if (subtabId === 'activas') loadPlayerMissions('activas');
    if (subtabId === 'historial') loadPlayerMissions('historial');
    if (subtabId === 'leyenda') loadPlayerLegendTracks();
}

let _playerMissionsUnsubscribe = null;
let _missionsBadgeUnsubscribe = null;

function updateMissionsPendingBadge(count) {
    const el = document.getElementById('missions-pending-badge');
    if (!el) return;
    if (count > 0) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.classList.remove('nav-badge--hidden');
    } else {
        el.textContent = '';
        el.classList.add('nav-badge--hidden');
    }
}

function startMissionsPendingBadge() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    if (!document.getElementById('missions-pending-badge')) return;
    if (typeof _missionsBadgeUnsubscribe === 'function') {
        _missionsBadgeUnsubscribe();
        _missionsBadgeUnsubscribe = null;
    }
    function isVisibleToPlayer(m) {
        const visibleTo = (m.visibleTo || 'all').toString().toLowerCase();
        if (visibleTo === 'all') return true;
        const assigned = m.assignedPlayerIds;
        const ids = Array.isArray(assigned) ? assigned : (assigned && typeof assigned === 'object' ? Object.values(assigned) : []);
        return ids.some(pid => String(pid) === String(user.id));
    }
    _missionsBadgeUnsubscribe = db.collection('missions').limit(200).onSnapshot(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const visible = all.filter(m => {
            const status = (m.status || '').toString().toLowerCase();
            return status === MISSION_STATUS.visible && isVisibleToPlayer(m);
        });
        const pending = visible.filter(m => !(m.playerProgress && m.playerProgress[user.id]));
        updateMissionsPendingBadge(pending.length);
    }, err => {
        console.error('Missions badge:', err);
        updateMissionsPendingBadge(0);
    });
    // FIRESTORE LISTENER FIX
    if (typeof registerUnsub === 'function') registerUnsub('player', 'missionsBadge', _missionsBadgeUnsubscribe);
}

function loadPlayerMissions(subtab) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    const activasContainer = document.getElementById('player-missions-activas-list');
    const historialContainer = document.getElementById('player-missions-historial-list');
    if (!activasContainer || !historialContainer) return;

    activasContainer.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando misiones...</p>';
    historialContainer.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando historial...</p>';

    function isVisibleToPlayer(m) {
        const visibleTo = (m.visibleTo || 'all').toString().toLowerCase();
        if (visibleTo === 'all') return true;
        const assigned = m.assignedPlayerIds;
        const ids = Array.isArray(assigned) ? assigned : (assigned && typeof assigned === 'object' ? Object.values(assigned) : []);
        return ids.some(pid => String(pid) === String(user.id));
    }

    // FIRESTORE LISTENER FIX: cleanup primero; un solo onSnapshot, no crear listener en catch
    if (typeof _playerMissionsUnsubscribe === 'function') {
        _playerMissionsUnsubscribe();
        _playerMissionsUnsubscribe = null;
    }

    function runMissionsSnapshot(snap, playerNamesMap) {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const visibleRaw = all.filter(m => {
            const status = (m.status || '').toString().toLowerCase();
            return status === MISSION_STATUS.visible && isVisibleToPlayer(m);
        });
        const completedOrArchived = all.filter(m => {
            const s = (m.status || '').toString().toLowerCase();
            return (s === MISSION_STATUS.completed || s === MISSION_STATUS.archived) && isVisibleToPlayer(m);
        });

        const uid = String(user.id);
        const activas = visibleRaw.filter(m => {
            const pp = m.playerProgress || {};
            const prog = pp[user.id] || pp[uid];
            return !prog || prog.status !== PLAYER_PROGRESS_STATUS.rejected;
        });

        const order = { in_progress: 0, accepted: 1, available: 2 };
        activas.sort((a, b) => {
            const getOrder = (mission) => {
                const pp = mission.playerProgress || {};
                const p = pp[user.id] || pp[uid];
                if (!p) return order.available;
                if (p.status === PLAYER_PROGRESS_STATUS.in_progress) return order.in_progress;
                if (p.status === PLAYER_PROGRESS_STATUS.accepted) return order.accepted;
                return order.available;
            };
            const o = getOrder(a) - getOrder(b);
            if (o !== 0) return o;
            const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
            const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
            return tb - ta;
        });

        const pendingCount = visibleRaw.filter(m => {
            const pp = m.playerProgress || {};
            return !(pp[user.id] || pp[uid]);
        }).length;
        updateMissionsPendingBadge(pendingCount);

        completedOrArchived.sort((a, b) => {
            const ta = a.completedAt && a.completedAt.toDate ? a.completedAt.toDate().getTime() : 0;
            const tb = b.completedAt && b.completedAt.toDate ? b.completedAt.toDate().getTime() : 0;
            return tb - ta;
        });

        renderPlayerMissionsLists(activas, completedOrArchived, user.id, subtab, playerNamesMap || {});
    }

    function attachListener(playerNamesMap) {
        _playerMissionsUnsubscribe = db.collection('missions').limit(200).onSnapshot(snap => {
            runMissionsSnapshot(snap, playerNamesMap);
        }, err => {
            console.error('Player missions:', err);
            activasContainer.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No se pudieron cargar las misiones.</p>';
            historialContainer.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No se pudo cargar el historial.</p>';
        });
        if (typeof registerUnsub === 'function') registerUnsub('player', 'playerMissions', _playerMissionsUnsubscribe);
    }

    db.collection('players').limit(200).get()
        .then(playersSnap => {
            const playerNamesMap = {};
            playersSnap.docs.forEach(d => {
                const data = d.data();
                const nombre = (data.nombre || data.name || '').toString().trim();
                playerNamesMap[d.id] = nombre;
                playerNamesMap[String(d.id)] = nombre;
            });
            attachListener(playerNamesMap);
        })
        .catch(err => {
            console.error('Player missions: could not load player names', err);
            attachListener({});
        });
}

function renderPlayerMissionsLists(activas, historial, playerId, subtab, playerNamesMap) {
    const activasContainer = document.getElementById('player-missions-activas-list');
    const historialContainer = document.getElementById('player-missions-historial-list');
    if (!activasContainer || !historialContainer) return;

    const esc = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const getName = (pid, p) => {
        const name = (p && (p.playerName || p.nombre)) || (playerNamesMap && (playerNamesMap[pid] || playerNamesMap[String(pid)]));
        return (name && String(name).trim()) || 'Aventurero';
    };

    activasContainer.innerHTML = activas.length === 0
        ? '<p style="color:#8b7355; text-align:center; padding:30px;">No tienes misiones activas. El DM hará visibles las misiones cuando estén listas.</p>'
        : activas.map(m => {
            const pp = m.playerProgress || {};
            const prog = pp[playerId] || pp[String(playerId)] || null;
            const progressStatus = prog ? prog.status : null;
            const statusLabel = progressStatus === PLAYER_PROGRESS_STATUS.in_progress ? 'En curso' : progressStatus === PLAYER_PROGRESS_STATUS.accepted ? 'Aceptada' : 'Disponible';
            const nivelLabel = m.nivel != null && m.nivel !== '' ? ` · Nivel ${m.nivel}` : '';
            const desc = (m.description || '').trim();
            const partyNames = Object.keys(pp)
                .filter(pid => {
                    const p = pp[pid];
                    return p && (p.status === PLAYER_PROGRESS_STATUS.accepted || p.status === PLAYER_PROGRESS_STATUS.in_progress);
                })
                .map(pid => getName(pid, pp[pid]));
            const partyLabel = partyNames.length ? 'Party: ' + partyNames.map(n => esc(n)).join(', ') : '';
            const notesText = (prog && (prog.notes !== undefined || prog.notas !== undefined))
                ? String(prog.notes ?? prog.notas ?? '').trim()
                : (() => {
                    const list = (prog && Array.isArray(prog.notesList)) ? prog.notesList : [];
                    if (!list.length) return '';
                    return list.map(n => (n && n.text) ? String(n.text).trim() : '').filter(Boolean).join('\n\n');
                })();
            const missionTitleForModal = (m.title || 'Sin título').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const notesPreview = notesText ? (notesText.length > 80 ? notesText.slice(0, 80) + '…' : notesText) : '';
            const notesSection = progressStatus === PLAYER_PROGRESS_STATUS.in_progress
                ? `<div class="player-mission-notes-wrap">
                        <details class="player-mission-notes-details" ${notesText ? 'open' : ''}>
                            <summary class="player-mission-notes-summary">📝 Mis notas${notesText ? ' (guardadas)' : ''}</summary>
                            <div class="player-mission-notes-inner">
                                ${notesPreview ? `<div class="player-mission-notes-preview" style="color:#a89878; font-size:0.9em; margin-bottom:8px; white-space:pre-wrap; word-break:break-word;">${esc(notesPreview)}</div>` : ''}
                                <button type="button" class="btn btn-small" onclick="openMissionNotesModal('${esc(m.id)}', '${missionTitleForModal}')">📝 Notas</button>
                            </div>
                        </details>
                    </div>`
                : '';
            return `
                <div class="mission-card" data-mission-id="${esc(m.id)}">
                    <div class="mission-card-header">
                        <h3 class="mission-card-title">${esc(m.title || 'Sin título')}</h3>
                        <span class="mission-card-meta">${statusLabel}${esc(nivelLabel)}</span>
                    </div>
                    ${desc ? `<p class="mission-card-desc">${esc(desc)}</p>` : ''}
                    ${m.reward ? `<p class="mission-card-extra">🎁 ${esc(m.reward)}</p>` : ''}
                    ${partyLabel ? `<p class="mission-card-extra" style="color:#8fbc8f;">👥 ${partyLabel}</p>` : ''}
                    <div class="mission-card-actions">
                        ${!progressStatus ? `<button type="button" class="btn btn-small" onclick="updatePlayerMissionProgress('${esc(m.id)}', 'accepted')">Aceptar misión</button><button type="button" class="btn btn-small btn-secondary" onclick="updatePlayerMissionProgress('${esc(m.id)}', 'rejected')">Rechazar</button>` : ''}
                        ${progressStatus === PLAYER_PROGRESS_STATUS.accepted ? `<button type="button" class="btn btn-small" onclick="updatePlayerMissionProgress('${esc(m.id)}', 'in_progress')">En curso</button><button type="button" class="btn btn-small btn-secondary" onclick="clearPlayerMissionProgress('${esc(m.id)}')" title="Dejar la misión">Abandonar misión</button>` : ''}
                        ${progressStatus === PLAYER_PROGRESS_STATUS.in_progress ? `<button type="button" class="btn btn-small" onclick="updatePlayerMissionProgress('${esc(m.id)}', 'accepted')" title="Volver a estado Aceptada">Quitar de en curso</button><button type="button" class="btn btn-small btn-secondary" onclick="clearPlayerMissionProgress('${esc(m.id)}')" title="Dejar la misión por completo">Abandonar misión</button>` : ''}
                    </div>
                    ${notesSection}
                </div>`;
        }).join('');

    historialContainer.innerHTML = historial.length === 0
        ? '<p style="color:#8b7355; text-align:center; padding:30px;">Misiones que el DM ha marcado como completadas aparecerán aquí.</p>'
        : historial.map(m => {
            const completedAt = m.completedAt && m.completedAt.toDate ? m.completedAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
            const nivelLabel = m.nivel != null && m.nivel !== '' ? ` · Nivel ${m.nivel}` : '';
            const desc = (m.description || '').trim();
            const ppHist = m.playerProgress || {};
            const progHist = ppHist[playerId] || ppHist[String(playerId)] || {};
            const notesTextHist = (progHist.notes !== undefined || progHist.notas !== undefined)
                ? String(progHist.notes ?? progHist.notas ?? '').trim()
                : (() => {
                    const list = (progHist.notesList && Array.isArray(progHist.notesList)) ? progHist.notesList : [];
                    if (!list.length) return '';
                    return list.map(n => (n && n.text) ? String(n.text).trim() : '').filter(Boolean).join('\n\n');
                })();
            const missionTitleHist = (m.title || 'Sin título').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const notesSectionHist = notesTextHist
                ? `<div class="player-mission-notes-wrap">
                        <details class="player-mission-notes-details">
                            <summary class="player-mission-notes-summary">📝 Mis notas (solo lectura)</summary>
                            <div class="player-mission-notes-inner">
                                <div class="player-mission-notes-preview" style="color:#a89878; font-size:0.9em; white-space:pre-wrap; word-break:break-word;">${esc(notesTextHist)}</div>
                            </div>
                        </details>
                    </div>`
                : '';
            return `
                <div class="mission-card" style="opacity: 0.92;">
                    <div class="mission-card-header">
                        <h3 class="mission-card-title">${esc(m.title || 'Sin título')}</h3>
                        <span class="mission-card-meta">Completada · ${completedAt}${esc(nivelLabel)}</span>
                    </div>
                    ${desc ? `<p class="mission-card-desc">${esc(desc)}</p>` : ''}
                    ${m.reward ? `<p class="mission-card-extra">🎁 ${esc(m.reward)}</p>` : ''}
                    ${notesSectionHist}
                </div>`;
        }).join('');
}

function openMissionNotesModal(missionId, missionTitle, readOnly) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer() || !missionId) return;
    const modal = document.getElementById('player-mission-notes-modal');
    const titleEl = document.getElementById('player-mission-notes-modal-title');
    const inputEl = document.getElementById('player-mission-notes-modal-input');
    const saveBtn = document.getElementById('player-mission-notes-modal-save-btn');
    if (!modal || !titleEl || !inputEl) return;
    modal.dataset.missionId = missionId;
    modal.dataset.readOnly = readOnly ? '1' : '';
    titleEl.textContent = '📝 Mis notas — ' + (missionTitle || 'Misión') + (readOnly ? ' (solo lectura)' : '');
    inputEl.value = '';
    inputEl.readOnly = !!readOnly;
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : '';
    db.collection('missions').doc(missionId).get()
        .then(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const pp = data.playerProgress || {};
            const prog = pp[user.id] || pp[String(user.id)] || {};
            let text = (prog.notes !== undefined || prog.notas !== undefined)
                ? String(prog.notes ?? prog.notas ?? '').trim()
                : '';
            if (!text && Array.isArray(prog.notesList) && prog.notesList.length > 0) {
                text = prog.notesList.map(n => (n && n.text) ? String(n.text).trim() : '').filter(Boolean).join('\n\n');
            }
            inputEl.value = text;
        })
        .catch(() => {})
        .finally(() => openModal('player-mission-notes-modal'));
}

function saveMissionNotesFromModal() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    const modal = document.getElementById('player-mission-notes-modal');
    if (modal && modal.dataset.readOnly === '1') return;
    const missionId = modal && modal.dataset.missionId;
    const inputEl = document.getElementById('player-mission-notes-modal-input');
    if (!missionId || !inputEl) return;
    const notes = inputEl.value.trim();
    db.collection('missions').doc(missionId).get()
        .then(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const playerProgress = data.playerProgress || {};
            const current = playerProgress[user.id] || {};
            playerProgress[user.id] = {
                ...current,
                status: current.status || PLAYER_PROGRESS_STATUS.in_progress,
                notes,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                playerName: current.playerName || user.nombre || ''
            };
            return db.collection('missions').doc(missionId).update({
                playerProgress,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            showToast('Notas guardadas');
            closeModal('player-mission-notes-modal');
        })
        .catch(e => {
            console.error('Error guardando notas:', e);
            showToast('Error al guardar notas', true);
        });
}

function updatePlayerMissionProgress(missionId, status) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer() || !missionId) return;
    if (status === 'completed') return;
    const ref = db.collection('missions').doc(missionId);
    ref.get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const playerProgress = data.playerProgress || {};
        playerProgress[user.id] = {
            status,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            playerName: user.nombre || ''
        };
        ref.update({
            playerProgress,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            if (status === PLAYER_PROGRESS_STATUS.accepted) showToast('Misión aceptada');
            else if (status === PLAYER_PROGRESS_STATUS.in_progress) showToast('Marcada en curso');
            else if (status === PLAYER_PROGRESS_STATUS.rejected) showToast('Misión rechazada');
        }).catch(e => showToast('Error: ' + e.message, true));
    }).catch(e => showToast('Error: ' + e.message, true));
}

/** Quita al jugador actual de la misión (borra su entrada en playerProgress). La misión vuelve a mostrarse como "Disponible" para ese jugador. */
function clearPlayerMissionProgress(missionId) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer() || !missionId) return;
    const ref = db.collection('missions').doc(missionId);
    ref.get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const playerProgress = data.playerProgress || {};
        if (!(playerProgress[user.id] || playerProgress[String(user.id)])) {
            showToast('No estás en esta misión', true);
            return;
        }
        const updates = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (typeof firebase.firestore.FieldValue.delete === 'function') {
            updates['playerProgress.' + user.id] = firebase.firestore.FieldValue.delete();
        } else {
            const newProgress = { ...playerProgress };
            delete newProgress[user.id];
            delete newProgress[String(user.id)];
            updates.playerProgress = newProgress;
        }
        return ref.update(updates);
    }).then(() => {
        showToast('Has abandonado la misión. Volverá a aparecer como disponible si el DM la tiene visible.');
    }).catch(e => showToast('Error: ' + (e && e.message) || 'Error al abandonar', true));
}

// ==================== ESCUCHA LA LEYENDA (audio MP3 por link) ====================
const LEGEND_COLLECTION = 'legend_audio';
let _legendUnsubscribe = null;
let _playerLegendUnsubscribe = null;
/** Cache de pistas de leyenda (DM): evita .get() cada vez que se abre la pestaña. null = aún no cargado. */
let legendTracksData = null;
/** Cache de pistas de leyenda (jugador): igual, una carga por sesión al abrir Leyenda. */
let playerLegendTracksData = null;

function loadLegendTracks(forceRefresh) {
    const container = document.getElementById('dm-legend-list');
    if (!container) return;
    if (!forceRefresh && legendTracksData !== null) {
        renderLegendList(container, legendTracksData, true);
        return;
    }
    if (typeof _legendUnsubscribe === 'function') {
        _legendUnsubscribe();
        _legendUnsubscribe = null;
    }
    container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando...</p>';
    db.collection(LEGEND_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get()
        .then(snap => {
            const tracks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            legendTracksData = tracks;
            renderLegendList(container, tracks, true);
        })
        .catch(err => {
            console.error('Legend load:', err);
            legendTracksData = [];
            container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No se pudieron cargar los audios.</p>';
        });
}

function renderLegendList(container, tracks, isDM) {
    if (!container) return;
    const esc = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (tracks.length === 0) {
        container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">Aún no hay audios. El DM puede añadir enlaces a MP3.</p>';
        return;
    }
    container.innerHTML = tracks.map(t => {
        const title = esc(t.title || 'Audio');
        const desc = (t.description || t.desc || '').trim();
        const descHtml = desc ? `<div class="legend-track-desc"><p class="legend-track-desc-text">${esc(desc).replace(/\n/g, '<br>')}</p></div>` : '';
        const url = (t.url || '').trim();
        const safeUrl = url ? esc(url) : '';
        const audioHtml = url
            ? `<div class="legend-track-audio"><audio controls preload="metadata"><source src="${safeUrl}" type="audio/mpeg">Tu navegador no soporta audio.</audio></div>`
            : '<div class="legend-track-audio"><p style="color:#8b7355; font-size:0.9em;">URL no válida</p></div>';
        const actionsBtns = isDM
            ? `<button type="button" class="btn btn-small" onclick="openLegendEditModal('${esc(t.id)}')" title="Editar">✏️ Editar</button><button type="button" class="btn btn-small btn-secondary mini-card-delete-btn" onclick="deleteLegendTrack('${esc(t.id)}')" title="Eliminar">🗑️</button>`
            : '';
        return `
            <div class="mission-card legend-card">
                <div class="mission-card-header">
                    <h3 class="mission-card-title">🎧 ${title}</h3>
                    ${actionsBtns}
                </div>
                <div class="legend-track-body">
                    ${descHtml}
                    ${audioHtml}
                </div>
            </div>`;
    }).join('');
}

function addLegendTrack() {
    const urlInput = document.getElementById('legend-audio-url');
    const titleInput = document.getElementById('legend-audio-title');
    const descInput = document.getElementById('legend-audio-description');
    if (!urlInput) return;
    const url = (urlInput.value || '').trim();
    if (!url) {
        showToast('Escribe la URL del audio (MP3 u otro)', true);
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('La URL debe comenzar con https:// (o http://)', true);
        return;
    }
    const title = (titleInput && titleInput.value) ? titleInput.value.trim() : '';
    const description = (descInput && descInput.value) ? descInput.value.trim() : '';
    db.collection(LEGEND_COLLECTION).add({
        url,
        title: title || 'Audio',
        description: description || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Audio añadido');
        if (urlInput) urlInput.value = '';
        if (titleInput) titleInput.value = '';
        if (descInput) descInput.value = '';
        loadLegendTracks(true);
    }).catch(e => showToast('Error: ' + e.message, true));
}

function openLegendEditModal(trackId) {
    const modal = document.getElementById('legend-edit-modal');
    const urlInput = document.getElementById('legend-edit-url');
    const titleInput = document.getElementById('legend-edit-title');
    const descInput = document.getElementById('legend-edit-description');
    if (!modal || !urlInput || !titleInput) return;
    db.collection(LEGEND_COLLECTION).doc(trackId).get().then(doc => {
        if (!doc.exists) return;
        const t = doc.data();
        urlInput.value = (t.url || '').trim();
        titleInput.value = (t.title || '').trim();
        if (descInput) descInput.value = (t.description || t.desc || '').trim();
        modal.dataset.trackId = trackId;
        openModal('legend-edit-modal');
    }).catch(e => showToast('Error: ' + e.message, true));
}

function saveLegendTrack() {
    const modal = document.getElementById('legend-edit-modal');
    const trackId = modal && modal.dataset.trackId;
    const urlInput = document.getElementById('legend-edit-url');
    const titleInput = document.getElementById('legend-edit-title');
    const descInput = document.getElementById('legend-edit-description');
    if (!trackId || !urlInput) return;
    const url = (urlInput.value || '').trim();
    if (!url) {
        showToast('La URL del audio es obligatoria', true);
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('La URL debe comenzar con https:// (o http://)', true);
        return;
    }
    const title = (titleInput && titleInput.value) ? titleInput.value.trim() : '';
    const description = (descInput && descInput.value) ? descInput.value.trim() : '';
    db.collection(LEGEND_COLLECTION).doc(trackId).update({
        url,
        title: title || 'Audio',
        description: description || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Audio actualizado');
        closeModal('legend-edit-modal');
        delete modal.dataset.trackId;
        loadLegendTracks(true);
    }).catch(e => showToast('Error: ' + e.message, true));
}

function deleteLegendTrack(id) {
    if (!id || !confirm('¿Eliminar este audio?')) return;
    db.collection(LEGEND_COLLECTION).doc(id).delete().then(() => {
        showToast('Audio eliminado');
        loadLegendTracks(true);
    }).catch(e => showToast('Error: ' + e.message, true));
}

function loadPlayerLegendTracks(forceRefresh) {
    const container = document.getElementById('player-legend-list');
    if (!container) return;
    if (!forceRefresh && playerLegendTracksData !== null) {
        renderLegendList(container, playerLegendTracksData, false);
        return;
    }
    if (typeof _playerLegendUnsubscribe === 'function') {
        _playerLegendUnsubscribe();
        _playerLegendUnsubscribe = null;
    }
    container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando...</p>';
    db.collection(LEGEND_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get()
        .then(snap => {
            const tracks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            playerLegendTracksData = tracks;
            renderLegendList(container, tracks, false);
        })
        .catch(err => {
            console.error('Player legend load:', err);
            playerLegendTracksData = [];
            container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px;">No se pudieron cargar los audios.</p>';
        });
}

/** Invalida la caché de Leyenda del jugador (p. ej. al entrar a vista jugador) para que la próxima apertura de Leyenda traiga datos frescos. */
function invalidatePlayerLegendCache() {
    playerLegendTracksData = null;
}

// FIXED: loadPlayerMissions single listener, no catch listener
