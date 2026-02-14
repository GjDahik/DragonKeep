// ==================== NOTIFICACIONES ====================

let _unreadBadgeUnsubscribe = null;

function _updateMailBadges(n) {
    const ids = ['mail-unread-badge', 'mail-unread-badge-subtab'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (n > 0) {
            el.textContent = n > 99 ? '99+' : String(n);
            el.classList.remove('nav-badge--hidden');
        } else {
            el.textContent = '';
            el.classList.add('nav-badge--hidden');
        }
    });
}

/** Suscribe al conteo de correos no leídos y actualiza los badges (nav CDD & Correo y subtab Correo). */
function startUnreadMailBadge() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) return;
    if (!document.getElementById('mail-unread-badge')) return;

    if (typeof _unreadBadgeUnsubscribe === 'function') {
        _unreadBadgeUnsubscribe();
        _unreadBadgeUnsubscribe = null;
    }

    _unreadBadgeUnsubscribe = db.collection('notifications')
        .where('playerId', '==', user.id)
        .where('leida', '==', false)
        .limit(100)
        .onSnapshot(snap => {
            _updateMailBadges(snap.size);
        }, err => {
            console.error('Unread badge:', err);
            _updateMailBadges(0);
        });
    // FIRESTORE LISTENER FIX
    if (typeof registerUnsub === 'function') registerUnsub('player', 'mailBadge', _unreadBadgeUnsubscribe);
}

// Cargar lista de jugadores en el selector de destinatarios
function loadNotificationRecipients() {
    const select = document.getElementById('notification-recipient');
    if (!select) return;
    
    // Limpiar opciones excepto "Todos"
    select.innerHTML = '<option value="all">📢 Todos los Jugadores</option>';
    
    // Cargar solo jugadores visibles (desde playersData o Firestore)
    const addVisiblePlayer = (id, nombre) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `⚔️ ${nombre || 'Sin nombre'}`;
        select.appendChild(option);
    };
    if (window.getVisiblePlayers && window.getVisiblePlayers().length > 0) {
        window.getVisiblePlayers().forEach(player => addVisiblePlayer(player.id, player.nombre));
    } else if (window.playersData && window.playersData.length > 0) {
        window.playersData.filter(p => p.visible !== false).forEach(player => addVisiblePlayer(player.id, player.nombre));
    } else {
        db.collection('players').limit(200).get().then(snap => {
            snap.forEach(doc => {
                const player = doc.data();
                if (player.visible === false) return;
                addVisiblePlayer(doc.id, player.nombre);
            });
        });
    }
}

// OPTIMIZACIÓN READS: una sola lectura al cargar/refrescar; sin listener permanente
function _renderDMNotificationsList(docs) {
    const container = document.getElementById('dm-notifications-list');
    if (!container) return;
    if (!docs || docs.length === 0) {
        container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:30px; font-style:italic;">No hay notificaciones enviadas</p>';
        return;
    }
    const grouped = {};
    docs.forEach(doc => {
        const notif = doc.data();
        const fecha = notif.fecha?.toDate?.() || new Date();
        const fechaKey = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const mensaje = notif.mensaje || 'Sin mensaje';
        const key = `${mensaje.substring(0, 50)}_${fechaKey}`;
        if (!grouped[key]) {
            grouped[key] = { mensaje: mensaje, fecha: fechaKey, hora: horaStr, destinatarios: [], ids: [] };
        }
        grouped[key].destinatarios.push(notif.playerName || 'Jugador desconocido');
        grouped[key].ids.push(doc.id);
    });
    let html = '';
    Object.values(grouped).forEach(group => {
        const mensajeText = group.mensaje.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const preview = mensajeText.substring(0, 150) + (mensajeText.length > 150 ? '...' : '');
        const destinatariosText = group.destinatarios.length === 1 ? group.destinatarios[0] : `${group.destinatarios.length} jugadores`;
        html += `
            <div class="mini-card" style="margin-bottom: 16px; border: 1px solid #4a3c31;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
                            <div class="mini-card-title" style="font-size: 1.1em; font-weight: 600;">📮 Notificación</div>
                            <div style="color: #8b7355; font-size: 0.85em;">${group.fecha} a las ${group.hora}</div>
                        </div>
                        <div style="color: #d4c4a8; line-height: 1.6; margin-bottom: 10px; white-space: pre-wrap;">${preview}</div>
                        <div style="color: #8b7355; font-size: 0.9em;"><strong>Para:</strong> ${destinatariosText}</div>
                    </div>
                    <button onclick="deleteDMNotification(['${group.ids.join("','")}'])" style="background: rgba(139, 90, 43, 0.3); border: 1px solid #8b5a2b; color: #d4af37; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.9em; flex-shrink: 0; white-space: nowrap;" title="Eliminar notificación">🗑️ Eliminar</button>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

// Cargar historial de notificaciones enviadas (DM) — get() una vez, sin listener
function loadDMNotifications() {
    const container = document.getElementById('dm-notifications-list');
    if (!container) return;
    container.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">Cargando...</p>';
    db.collection('notifications')
        .orderBy('fecha', 'desc')
        .limit(100)
        .get()
        .then(snap => _renderDMNotificationsList(snap.docs))
        .catch(error => {
            console.error('Error cargando notificaciones del DM:', error);
            if (error.code === 'failed-precondition') {
                db.collection('notifications').limit(500).get()
                    .then(snap => {
                        const sorted = snap.docs.sort((a, b) => {
                            const fechaA = a.data().fecha?.toDate?.() || new Date(0);
                            const fechaB = b.data().fecha?.toDate?.() || new Date(0);
                            return fechaB - fechaA;
                        }).slice(0, 100);
                        _renderDMNotificationsList(sorted);
                    })
                    .catch(err => {
                        console.error('Error cargando notificaciones sin orderBy:', err);
                        container.innerHTML = '<p style="color:#d4af37; text-align:center; padding:20px;">Error al cargar notificaciones.</p>';
                    });
            } else {
                container.innerHTML = '<p style="color:#d4af37; text-align:center; padding:20px;">Error: ' + (error.message || '') + '</p>';
            }
        });
}

// Eliminar notificación desde el DM
async function deleteDMNotification(notificationIds) {
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        showToast('IDs de notificación inválidos', true);
        return;
    }
    
    // Confirmar eliminación
    const count = notificationIds.length;
    const message = count === 1 
        ? '¿Estás seguro de que quieres eliminar esta notificación? Esta acción no se puede deshacer.'
        : `¿Estás seguro de que quieres eliminar ${count} notificaciones? Esta acción no se puede deshacer.`;
    
    if (!confirm(message)) {
        return;
    }
    
    try {
        const batch = db.batch();
        notificationIds.forEach(id => {
            const ref = db.collection('notifications').doc(id);
            batch.delete(ref);
        });
        
        await batch.commit();
        
        showToast(`${count} notificación${count !== 1 ? 'es' : ''} eliminada${count !== 1 ? 's' : ''}`);
        
        // Recargar notificaciones
        loadDMNotifications();
        
    } catch (error) {
        showToast('Error al eliminar notificaciones: ' + error.message, true);
        console.error(error);
    }
}

// Enviar notificación
async function sendNotification() {
    const recipientId = document.getElementById('notification-recipient').value;
    const message = document.getElementById('notification-message').value.trim();
    
    if (!message) {
        showToast('El mensaje no puede estar vacío', true);
        return;
    }
    
    try {
        const notificationData = {
            mensaje: message,
            enviadoPor: 'DM',
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            leida: false
        };
        
        if (recipientId === 'all') {
            // Enviar solo a jugadores visibles
            const visiblePlayers = window.getVisiblePlayers ? window.getVisiblePlayers() : [];
            let docsToUse = [];
            if (visiblePlayers.length > 0) {
                docsToUse = visiblePlayers.map(p => ({ id: p.id, data: () => ({ nombre: p.nombre || 'Jugador' }) }));
            } else {
                const playersSnap = await db.collection('players').limit(200).get();
                playersSnap.forEach(doc => {
                    if (doc.data().visible === false) return;
                    const d = doc.data();
                    docsToUse.push({ id: doc.id, data: () => d });
                });
            }
            const batch = db.batch();
            let count = 0;
            docsToUse.forEach(doc => {
                const notificationRef = db.collection('notifications').doc();
                batch.set(notificationRef, {
                    ...notificationData,
                    playerId: doc.id,
                    playerName: (typeof doc.data === 'function' ? doc.data() : doc.data).nombre || 'Jugador'
                });
                count++;
            });
            if (count === 0) {
                showToast('No hay jugadores visibles para enviar', true);
                return;
            }
            await batch.commit();
            showToast(`Notificación enviada a ${count} jugador${count !== 1 ? 'es' : ''}`);
        } else {
            // Enviar a un jugador específico
            const playerDoc = await db.collection('players').doc(recipientId).get();
            if (!playerDoc.exists) {
                showToast('Jugador no encontrado', true);
                return;
            }
            
            await db.collection('notifications').add({
                ...notificationData,
                playerId: recipientId,
                playerName: playerDoc.data().nombre || 'Jugador'
            });
            
            showToast('Notificación enviada a ' + playerDoc.data().nombre);
        }
        
        // Limpiar formulario
        document.getElementById('notification-message').value = '';
        
        // Recargar historial de notificaciones
        if (typeof loadDMNotifications === 'function') {
            setTimeout(() => loadDMNotifications(), 500);
        }
        
    } catch (error) {
        showToast('Error al enviar notificación: ' + error.message, true);
        console.error(error);
    }
}

// Cargar notificaciones del jugador
function loadPlayerNotifications() {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        console.log('loadPlayerNotifications: No hay usuario o no es jugador', { user, isPlayer: isPlayer() });
        return;
    }
    
    const unreadContainer = document.getElementById('player-notifications-unread');
    const readContainer = document.getElementById('player-notifications-read-list');
    
    if (!unreadContainer || !readContainer) {
        console.log('loadPlayerNotifications: Contenedores no encontrados', { unreadContainer, readContainer });
        return;
    }
    
    console.log('loadPlayerNotifications: Cargando notificaciones para playerId:', user.id);
    
    // Cargar notificaciones no leídas (sin orderBy para no requerir índice compuesto; ordenamos en cliente)
    function renderUnread(docs) {
        const sorted = docs.sort((a, b) => {
            const fechaA = a.data().fecha?.toDate?.() || new Date(0);
            const fechaB = b.data().fecha?.toDate?.() || new Date(0);
            return fechaB - fechaA;
        });
        let unreadHtml = '';
        if (sorted.length === 0) {
            unreadHtml = '<p style="color:#8b7355; text-align:center; padding:30px; font-style:italic;">📭 No tienes cartas nuevas</p>';
        } else {
            unreadHtml = '<h3 style="font-family: \'Cinzel\', serif; color: #d4af37; font-size: 1.3em; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #4a3c31; padding-bottom: 10px;">📬 Nuevas Cartas</h3>';
            sorted.forEach(doc => {
                const notif = doc.data();
                const fecha = notif.fecha?.toDate?.() || new Date();
                const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const mensajeText = (notif.mensaje || 'Sin mensaje').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const preview = mensajeText.substring(0, 100) + (mensajeText.length > 100 ? '...' : '');
                unreadHtml += `
                    <div class="mini-card" style="margin-bottom: 16px; cursor: pointer; border: 2px solid #8b5a2b; position: relative; transition: all 0.2s ease;" onmouseover="this.style.borderColor='#d4af37'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#8b5a2b'; this.style.transform='translateY(0)'" onclick="openNotificationModal('${doc.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                    <div class="mini-card-title" style="font-size: 1.15em; font-weight: 600;">📮 Carta del DM</div>
                                    <div style="background: #8b5a2b; color: #fff; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 0.75em; font-weight: bold; flex-shrink: 0;">!</div>
                                </div>
                                <div style="color: #8b7355; font-size: 0.85em; margin-bottom: 10px;">${fechaStr} a las ${horaStr}</div>
                                <div style="color: #d4c4a8; line-height: 1.6; max-height: 48px; overflow: hidden;">${preview}</div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        unreadContainer.innerHTML = unreadHtml;
    }
    var unsubUnread = db.collection('notifications')
        .where('playerId', '==', user.id)
        .where('leida', '==', false)
        .limit(100)
        .onSnapshot(snap => {
            console.log('loadPlayerNotifications: Notificaciones no leídas recibidas:', snap.size);
            renderUnread(snap.docs);
        }, error => {
            console.error('Error cargando notificaciones no leídas:', error);
            unreadContainer.innerHTML = '<p style="color:#d4af37; text-align:center; padding:20px;">Error al cargar notificaciones. Por favor recarga la página.</p>';
        });
    // FIRESTORE LISTENER FIX
    if (typeof registerUnsub === 'function') registerUnsub('player', 'notifUnread', unsubUnread);
    
    // Cargar notificaciones leídas (sin orderBy para no requerir índice compuesto; ordenamos en cliente)
    function renderReadNotifications(docs) {
        const sorted = docs.slice().sort((a, b) => {
            const fechaA = a.data().fecha?.toDate?.() || new Date(0);
            const fechaB = b.data().fecha?.toDate?.() || new Date(0);
            return fechaB - fechaA;
        }).slice(0, 50);
        if (sorted.length === 0) {
            readContainer.innerHTML = '<p style="color:#8b7355; text-align:center; padding:20px;">No hay cartas leídas</p>';
            return;
        }
        let readHtml = '';
        sorted.forEach(doc => {
            const notif = doc.data();
            const fecha = notif.fecha?.toDate?.() || new Date();
            const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const mensajeText = (notif.mensaje || 'Sin mensaje').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const preview = mensajeText.substring(0, 80) + (mensajeText.length > 80 ? '...' : '');
            readHtml += `
                <div class="mini-card" style="margin-bottom: 12px; opacity: 0.75; transition: all 0.2s ease; position: relative;" onmouseover="this.style.opacity='1'; this.style.borderColor='#8b5a2b'" onmouseout="this.style.opacity='0.75'; this.style.borderColor='#4a3c31'">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                        <div style="flex: 1; min-width: 0; cursor: pointer;" onclick="openNotificationModal('${doc.id}')">
                            <div class="mini-card-title" style="font-size: 1em; margin-bottom: 6px; color: #a89878;">📮 Carta del DM</div>
                            <div style="color: #6b5a4a; font-size: 0.8em; margin-bottom: 8px;">${fechaStr} a las ${horaStr}</div>
                            <div style="color: #8b7355; line-height: 1.4;">${preview}</div>
                        </div>
                        <button onclick="deleteNotification('${doc.id}'); event.stopPropagation();" style="background: rgba(139, 90, 43, 0.3); border: 1px solid #8b5a2b; color: #d4af37; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 0.85em; transition: all 0.2s ease; flex-shrink: 0;" onmouseover="this.style.background='rgba(139, 90, 43, 0.5)'; this.style.borderColor='#d4af37'" onmouseout="this.style.background='rgba(139, 90, 43, 0.3)'; this.style.borderColor='#8b5a2b'" title="Eliminar carta">🗑️</button>
                    </div>
                </div>
            `;
        });
        readContainer.innerHTML = readHtml;
    }
    var unsubRead = db.collection('notifications')
        .where('playerId', '==', user.id)
        .where('leida', '==', true)
        .limit(100)
        .onSnapshot(snap => {
            console.log('loadPlayerNotifications: Notificaciones leídas recibidas:', snap.size);
            renderReadNotifications(snap.docs);
        }, error => {
            console.error('Error cargando notificaciones leídas:', error);
            readContainer.innerHTML = '<p style="color:#d4af37; text-align:center; padding:20px;">Error al cargar historial. Por favor recarga la página.</p>';
        });
    // FIRESTORE LISTENER FIX
    if (typeof registerUnsub === 'function') registerUnsub('player', 'notifRead', unsubRead);
}

// Abrir modal de notificación
async function openNotificationModal(notificationId) {
    const notifDoc = await db.collection('notifications').doc(notificationId).get();
    if (!notifDoc.exists) {
        showToast('Notificación no encontrada', true);
        return;
    }
    
    const notif = notifDoc.data();
    const fecha = notif.fecha?.toDate?.() || new Date();
    const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const isRead = notif.leida === true;
    
    // Crear contenido del modal (clases para estilos responsive en móvil)
    const modalContent = `
        <div class="notification-letter" style="background: linear-gradient(180deg, rgba(61, 42, 30, 0.95) 0%, rgba(42, 28, 20, 0.98) 100%); border: 2px solid #8b5a2b; border-radius: 12px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
            <div class="notification-letter-header" style="text-align: center; margin-bottom: 24px;">
                <div class="notification-letter-icon" style="font-size: 4em; margin-bottom: 12px;">📮</div>
                <div class="notification-letter-title" style="font-family: 'Cinzel', serif; color: #d4af37; font-size: 1.5em; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 2px;">Carta del Dungeon Master</div>
                <div class="notification-letter-date" style="color: #8b7355; font-size: 0.9em;">${fechaStr} a las ${horaStr}</div>
            </div>
            <div class="notification-letter-body" style="border-top: 2px solid #8b5a2b; border-bottom: 2px solid #8b5a2b; padding: 24px 0; margin: 24px 0; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 24px;">
                <div class="notification-letter-text" style="color: #d4c4a8; line-height: 1.8; font-size: 1.05em; white-space: pre-wrap; text-align: left;">${(notif.mensaje || 'Sin mensaje').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
            </div>
            ${!isRead ? `
            <div class="notification-letter-actions" style="text-align: center;">
                <button class="btn" onclick="markNotificationAsRead('${notificationId}')" style="min-width: 200px; font-size: 1.05em;">✓ Marcar como Leída</button>
            </div>
            ` : `
            <div class="notification-letter-actions" style="text-align: center; color: #8b7355; font-style: italic;">
                ✓ Esta carta ya fue leída
            </div>
            `}
        </div>
    `;
    
    // Mostrar modal
    const modal = document.getElementById('notification-modal');
    if (modal) {
        document.getElementById('notification-modal-content').innerHTML = modalContent;
        openModal('notification-modal');
    }
}

// Marcar notificación como leída
async function markNotificationAsRead(notificationId) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como jugador', true);
        return;
    }
    
    try {
        await db.collection('notifications').doc(notificationId).update({
            leida: true,
            fechaLectura: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeModal('notification-modal');
        showToast('Carta marcada como leída');
        
        // Recargar notificaciones
        loadPlayerNotifications();
        
    } catch (error) {
        showToast('Error al marcar como leída: ' + error.message, true);
        console.error(error);
    }
}

// Eliminar notificación
async function deleteNotification(notificationId) {
    const user = getCurrentUser();
    if (!user || !user.id || !isPlayer()) {
        showToast('Debes estar logueado como jugador', true);
        return;
    }
    
    // Confirmar eliminación
    if (!confirm('¿Estás seguro de que quieres eliminar esta carta? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        // Verificar que la notificación pertenece al jugador actual
        const notifDoc = await db.collection('notifications').doc(notificationId).get();
        if (!notifDoc.exists) {
            showToast('Carta no encontrada', true);
            return;
        }
        
        const notif = notifDoc.data();
        if (notif.playerId !== user.id) {
            showToast('No tienes permiso para eliminar esta carta', true);
            return;
        }
        
        // Eliminar la notificación
        await db.collection('notifications').doc(notificationId).delete();
        
        showToast('Carta eliminada');
        
        // Recargar notificaciones
        loadPlayerNotifications();
        
    } catch (error) {
        showToast('Error al eliminar carta: ' + error.message, true);
        console.error(error);
    }
}

// Exponer funciones globalmente
window.sendNotification = sendNotification;
window.loadNotificationRecipients = loadNotificationRecipients;
window.loadPlayerNotifications = loadPlayerNotifications;
window.loadDMNotifications = loadDMNotifications;
window.openNotificationModal = openNotificationModal;
window.markNotificationAsRead = markNotificationAsRead;
window.deleteNotification = deleteNotification;
window.deleteDMNotification = deleteDMNotification;
window.startUnreadMailBadge = startUnreadMailBadge;
