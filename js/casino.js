/**
 * Casino (tienda ambulante tipo casino).
 * El jugador apuesta GP; el DM tira los dados en la mesa y marca WIN/LOSE.
 * Una apuesta activa (PENDING) por jugador a la vez.
 */
(function () {
    'use strict';
    if (typeof db === 'undefined') return;

    var COLLECTION = 'casino_bets';

    /** Juegos con opciones y multiplicadores (todos usan d6 en la mesa). */
    var CASINO_GAMES = {
        high_low: {
            id: 'high_low',
            name: 'Alto o Bajo (2d6)',
            desc: 'Elige Alto (8-12) o Bajo (2-6). Si sale 7, pierdes.',
            options: [
                { id: 'alto', label: 'Alto (8–12)', multiplier: 1.8 },
                { id: 'bajo', label: 'Bajo (2–6)', multiplier: 1.8 }
            ]
        },
        exact: {
            id: 'exact',
            name: 'Exacto (2d6)',
            desc: 'Elige el total exacto que saldrá (2 a 12).',
            options: [
                { id: '2', label: '2', multiplier: 8 },
                { id: '3', label: '3', multiplier: 6 },
                { id: '4', label: '4', multiplier: 5 },
                { id: '5', label: '5', multiplier: 4 },
                { id: '6', label: '6', multiplier: 3 },
                { id: '7', label: '7', multiplier: 2 },
                { id: '8', label: '8', multiplier: 3 },
                { id: '9', label: '9', multiplier: 4 },
                { id: '10', label: '10', multiplier: 5 },
                { id: '11', label: '11', multiplier: 6 },
                { id: '12', label: '12', multiplier: 8 }
            ]
        },
        duel: {
            id: 'duel',
            name: 'Duelo directo (2d6 vs 2d6)',
            desc: 'Tu suma vs la de la Casa. Mayor gana; empate gana la Casa.',
            options: [
                { id: 'play', label: 'Jugar', multiplier: 1.9 }
            ]
        },
        triple_risk: {
            id: 'triple_risk',
            name: 'Triple riesgo (3d6)',
            desc: 'Elige: todos distintos, un par o triple.',
            options: [
                { id: 'distintos', label: 'Todos distintos', multiplier: 2 },
                { id: 'par', label: 'Un par', multiplier: 3 },
                { id: 'triple', label: 'Triple', multiplier: 10 }
            ]
        }
    };

    window.CASINO_GAMES = CASINO_GAMES;

    /** Jugador: ¿tiene alguna apuesta PENDING (en cualquier casino)? */
    function hasPendingBet(playerId) {
        return db.collection(COLLECTION)
            .where('playerId', '==', playerId)
            .where('status', '==', 'PENDING')
            .limit(1)
            .get()
            .then(function (snap) { return !snap.empty; });
    }

    /** Jugador: colocar apuesta. Resta GP, crea bet PENDING. */
    window.placeCasinoBet = function (travelingShopId, gameId, optionId, optionLabel, betAmount) {
        var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!user || !user.id) {
            if (typeof showToast === 'function') showToast('Debes estar logueado como personaje', true);
            return Promise.reject(new Error('no user'));
        }
        var amount = parseInt(betAmount, 10);
        if (isNaN(amount) || amount <= 0) {
            if (typeof showToast === 'function') showToast('Ingresa un monto válido (entero mayor a 0)', true);
            return Promise.reject(new Error('invalid amount'));
        }
        var game = CASINO_GAMES[gameId];
        if (!game) return Promise.reject(new Error('invalid game'));
        var opt = game.options.find(function (o) { return String(o.id) === String(optionId); });
        var multiplier = opt ? (Number(opt.multiplier) || 1) : 1; /* mismo valor que en la tarjeta (x4 = x4) */

        return hasPendingBet(user.id).then(function (pending) {
            if (pending) {
                if (typeof showToast === 'function') showToast('Tienes una apuesta pendiente. Espera a que el DM la resuelva.', true);
                return Promise.reject(new Error('pending bet'));
            }
            return (typeof getCurrentPlayerDoc === 'function' ? getCurrentPlayerDoc() : Promise.reject(new Error('no getCurrentPlayerDoc')));
        }).then(function (doc) {
            if (!doc.exists) {
                if (typeof showToast === 'function') showToast('No se encontró el personaje', true);
                return Promise.reject(new Error('no doc'));
            }
            var data = doc.data();
            var oro = (data.oro != null ? data.oro : 0);
            if (oro < amount) {
                if (typeof showToast === 'function') showToast('No tienes suficiente oro. Tienes ' + oro.toLocaleString() + ' GP.', true);
                return Promise.reject(new Error('insufficient'));
            }
            var newOro = oro - amount;
            var bet = {
                playerId: user.id,
                playerName: (user.nombre || data.nombre || 'Jugador').trim(),
                travelingShopId: travelingShopId,
                gameId: gameId,
                gameName: game.name,
                optionId: optionId,
                optionLabel: optionLabel || opt ? opt.label : optionId,
                betAmount: amount,
                multiplier: multiplier,
                status: 'PENDING',
                createdAt: typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : new Date(),
                payoutAmount: 0
            };
            return db.collection('players').doc(user.id).update({ oro: newOro }).then(function () {
                return db.collection(COLLECTION).add(bet);
            }).then(function (ref) {
                if (typeof showToast === 'function') showToast('Apuesta enviada. Esperando al DM.');
                if (typeof lastPlayerViewData !== 'undefined' && lastPlayerViewData) {
                    lastPlayerViewData.oro = newOro;
                    if (typeof renderPlayerView === 'function') renderPlayerView(lastPlayerViewData);
                }
                return ref.id;
            });
        });
    };

    /** Obtener multiplicador de la apuesta: siempre desde CASINO_GAMES (misma fuente que las tarjetas) para que x4 en la card = x4 en el pago. */
    function getBetMultiplier(bet) {
        var game = CASINO_GAMES[bet.gameId];
        if (game && game.options && bet.optionId != null && bet.optionId !== '') {
            var opt = game.options.find(function (o) { return String(o.id) === String(bet.optionId); });
            if (opt) {
                var mult = Number(opt.multiplier);
                if (!isNaN(mult) && mult > 0) return mult;
            }
        }
        var mult = Number(bet.multiplier);
        return (!isNaN(mult) && mult > 0) ? mult : 1;
    }

    /** DM: resolver apuesta (WIN o LOSE). */
    window.resolveCasinoBet = function (betId, outcome) {
        if (outcome !== 'WIN' && outcome !== 'LOSE') return Promise.reject(new Error('invalid outcome'));
        var betRef = db.collection(COLLECTION).doc(betId);
        return betRef.get().then(function (snap) {
            if (!snap.exists) return Promise.reject(new Error('bet not found'));
            var bet = snap.data();
            if (bet.status !== 'PENDING') {
                if (typeof showToast === 'function') showToast('Esa apuesta ya fue resuelta.', true);
                return Promise.reject(new Error('already resolved'));
            }
            var payoutAmount = 0;
            if (outcome === 'WIN') {
                var betAmount = Number(bet.betAmount) || 0;
                var multiplier = getBetMultiplier(bet);
                payoutAmount = Math.round(betAmount * multiplier);
            }
            var dm = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            var updates = {
                status: outcome === 'WIN' ? 'WON' : 'LOST',
                resolvedAt: typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : new Date(),
                payoutAmount: payoutAmount
            };
            if (dm && dm.id) updates.resolvedByDmId = dm.id;
            var msg = outcome === 'WIN'
                ? 'Ganaste. +' + (payoutAmount || 0).toLocaleString() + ' GP.'
                : 'Perdiste. Mejor suerte la próxima.';
            var notifPayload = {
                mensaje: msg,
                enviadoPor: 'casino',
                fecha: typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : new Date(),
                leida: false,
                playerId: bet.playerId,
                playerName: bet.playerName || 'Jugador'
            };
            if (outcome === 'WIN') notifPayload.payoutGp = payoutAmount;
            return betRef.update(updates).then(function () {
                var notifPromise = db.collection('notifications').add(notifPayload);
                var creditPromise = Promise.resolve();
                if (outcome === 'WIN' && payoutAmount > 0 && bet.playerId) {
                    creditPromise = db.collection('players').doc(bet.playerId).get().then(function (pSnap) {
                        if (!pSnap.exists) return;
                        var oro = (pSnap.data().oro != null ? pSnap.data().oro : 0) + payoutAmount;
                        return db.collection('players').doc(bet.playerId).update({ oro: oro });
                    }).catch(function (err) { console.error('Casino credit GP', err); });
                }
                return Promise.all([notifPromise, creditPromise]);
            }).then(function () {
                if (typeof showToast === 'function') showToast(outcome === 'WIN' ? 'Apuesta ganada. GP acreditados.' : 'Apuesta perdida.');
            });
        });
    };

    /** DM: suscripción en tiempo real a apuestas PENDING de una tienda (sin orderBy para evitar índice compuesto; orden en memoria). */
    window.subscribeCasinoPendingBets = function (travelingShopId, callback) {
        return db.collection(COLLECTION)
            .where('travelingShopId', '==', travelingShopId)
            .where('status', '==', 'PENDING')
            .onSnapshot(function (snap) {
                var list = snap.docs.map(function (d) {
                    var data = d.data();
                    return { id: d.id, ...data, createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null };
                });
                list.sort(function (a, b) { return (b.createdAt && a.createdAt) ? (b.createdAt.getTime() - a.createdAt.getTime()) : 0; });
                if (typeof callback === 'function') callback(list);
            }, function (err) {
                console.error('subscribeCasinoPendingBets', err);
                if (typeof callback === 'function') callback([]);
            });
    };

    /** Jugador: abrir modal casino (4 juegos y formulario; sin historial). */
    window.openTravelingShopCasino = function (shopId) {
        var shop = (window.playerTravelingShopsData || []).find(function (s) { return s.id === shopId; });
        if (!shop) return;
        window._casinoShopId = shopId;
        window._casinoShopName = shop.nombre || 'Casino';
        var titleEl = document.getElementById('player-casino-title');
        var gamesEl = document.getElementById('player-casino-games');
        var formWrap = document.getElementById('player-casino-form-wrap');
        var waitingWrap = document.getElementById('player-casino-waiting-wrap');
        var winnerWrap = document.getElementById('player-casino-winner-wrap');
        if (!titleEl || !gamesEl) return;
        titleEl.textContent = '🎲 ' + (shop.nombre || 'Casino');
        if (gamesEl) gamesEl.style.display = '';
        if (formWrap) formWrap.style.display = 'none';
        if (waitingWrap) waitingWrap.style.display = 'none';
        if (winnerWrap) { winnerWrap.style.display = 'none'; winnerWrap.innerHTML = ''; }
        var gameIds = ['high_low', 'exact', 'duel', 'triple_risk'];
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        gamesEl.innerHTML = gameIds.map(function (gid) {
            var g = CASINO_GAMES[gid];
            if (!g) return '';
            return '<div class="player-casino-game-card" data-game-id="' + esc(gid) + '" role="button" tabindex="0">' +
                '<div class="player-casino-game-name">' + esc(g.name) + '</div>' +
                '<div class="player-casino-game-desc">' + esc(g.desc) + '</div></div>';
        }).join('');
        var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (user && user.id && typeof _casinoPlayerNotifUnsub === 'function') _casinoPlayerNotifUnsub();
        if (user && user.id) {
            var initial = true;
            _casinoPlayerNotifUnsub = db.collection('notifications')
                .where('playerId', '==', user.id)
                .where('enviadoPor', '==', 'casino')
                .onSnapshot(function (snap) {
                    if (initial) { initial = false; return; }
                    snap.docChanges().forEach(function (change) {
                        if (change.type === 'added') {
                            var data = change.doc.data();
                            var msg = (data.mensaje || '').trim();
                            if (!msg) return;
                            if (typeof showToast === 'function') showToast(msg);
                            if (msg.indexOf('Ganaste') === 0) {
                                var gp = 0;
                                if (data.payoutGp != null && !isNaN(Number(data.payoutGp))) {
                                    gp = Math.round(Number(data.payoutGp));
                                } else {
                                    var gpMatch = msg.match(/\+([\d\s.,]+)\s*GP/);
                                    if (gpMatch) {
                                        var numStr = String(gpMatch[1]).replace(/\D/g, '');
                                        gp = parseInt(numStr, 10);
                                    }
                                }
                                if (isNaN(gp)) gp = 0;
                                if (typeof openModal === 'function') openModal('player-casino-modal');
                                showCasinoWinnerTicket(gp);
                            } else if (msg.indexOf('Perdiste') === 0) {
                                if (typeof openModal === 'function') openModal('player-casino-modal');
                                showCasinoLoserTicket();
                            }
                        }
                    });
                }, function (err) { console.error('Casino notif listener', err); });
        }
        if (typeof openModal === 'function') openModal('player-casino-modal');
    };

    /** Recibo de ganador (estilo tienda): "Winner Winner Chicken Dinner" + GP ganados. */
    function buildCasinoWinnerReceiptHTML(gp) {
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var gpStr = (gp || 0).toLocaleString('es-ES') + ' GP';
        var now = new Date();
        var dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        return '<div class="player-shop-receipt">' +
            '<div class="player-shop-receipt-header">' +
            '<div class="player-shop-receipt-logo">🍗</div>' +
            '<div class="player-shop-receipt-title">Winner Winner Chicken Dinner</div>' +
            '<div class="player-shop-receipt-subtitle">Premio de casino</div>' +
            '</div>' +
            '<div class="player-shop-receipt-body">' +
            '<div class="player-shop-receipt-item"><span class="player-shop-receipt-item-name">Premio</span><span class="player-shop-receipt-item-price">+' + esc(gpStr) + '</span></div>' +
            '</div>' +
            '<div class="player-shop-receipt-total"><span class="player-shop-receipt-total-label">Total ganado</span><span class="player-shop-receipt-value">+' + esc(gpStr) + '</span></div>' +
            '<div class="player-shop-receipt-footer">' +
            '<div class="player-shop-receipt-date">' + esc(dateStr) + ' — ' + esc(timeStr) + '</div>' +
            '<div class="player-shop-receipt-thanks">¡Felicidades! Ganaste ' + esc(gpStr) + '.</div>' +
            '</div>' +
            '<button type="button" class="btn player-shop-receipt-close" onclick="typeof closePlayerCasinoModal===\'function\'&&closePlayerCasinoModal()">Cerrar</button>' +
            '</div>';
    }

    window.showCasinoWinnerTicket = function (gp) {
        var gamesEl = document.getElementById('player-casino-games');
        var formWrap = document.getElementById('player-casino-form-wrap');
        var waitingWrap = document.getElementById('player-casino-waiting-wrap');
        var winnerWrap = document.getElementById('player-casino-winner-wrap');
        if (!winnerWrap) return;
        if (gamesEl) gamesEl.style.display = 'none';
        if (formWrap) formWrap.style.display = 'none';
        if (waitingWrap) waitingWrap.style.display = 'none';
        winnerWrap.innerHTML = buildCasinoWinnerReceiptHTML(gp);
        winnerWrap.style.display = 'block';
    };

    /** Recibo de perdedor (estilo tienda): "La casa gana. Mejor suerte la próxima." */
    function buildCasinoLoserReceiptHTML() {
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var now = new Date();
        var dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        return '<div class="player-shop-receipt">' +
            '<div class="player-shop-receipt-header">' +
            '<div class="player-shop-receipt-logo">🎲</div>' +
            '<div class="player-shop-receipt-title">LA CASA GANA</div>' +
            '<div class="player-shop-receipt-subtitle">Mejor suerte la próxima</div>' +
            '</div>' +
            '<div class="player-shop-receipt-body">' +
            '<div class="player-shop-receipt-item"><span class="player-shop-receipt-item-name">Resultado</span><span class="player-shop-receipt-item-price">La casa gana</span></div>' +
            '</div>' +
            '<div class="player-shop-receipt-footer">' +
            '<div class="player-shop-receipt-date">' + esc(dateStr) + ' — ' + esc(timeStr) + '</div>' +
            '<div class="player-shop-receipt-thanks">Mejor suerte la próxima.</div>' +
            '</div>' +
            '<button type="button" class="btn player-shop-receipt-close" onclick="typeof closePlayerCasinoModal===\'function\'&&closePlayerCasinoModal()">Cerrar</button>' +
            '</div>';
    }

    window.showCasinoLoserTicket = function () {
        var gamesEl = document.getElementById('player-casino-games');
        var formWrap = document.getElementById('player-casino-form-wrap');
        var waitingWrap = document.getElementById('player-casino-waiting-wrap');
        var winnerWrap = document.getElementById('player-casino-winner-wrap');
        if (!winnerWrap) return;
        if (gamesEl) gamesEl.style.display = 'none';
        if (formWrap) formWrap.style.display = 'none';
        if (waitingWrap) waitingWrap.style.display = 'none';
        winnerWrap.innerHTML = buildCasinoLoserReceiptHTML();
        winnerWrap.style.display = 'block';
    };

    /** Jugador: seleccionar juego y mostrar formulario (opción + monto). Oculta la lista de juegos. */
    window.selectCasinoGame = function (gameId) {
        var g = CASINO_GAMES[gameId];
        if (!g) return;
        var gamesEl = document.getElementById('player-casino-games');
        var formWrap = document.getElementById('player-casino-form-wrap');
        var formTitle = document.getElementById('player-casino-form-title');
        var optionsEl = document.getElementById('player-casino-options');
        var amountEl = document.getElementById('player-casino-amount');
        var confirmBtn = document.getElementById('player-casino-confirm-btn');
        if (!formWrap || !optionsEl) return;
        var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        window._casinoSelectedGameId = gameId;
        window._casinoSelectedOptionId = null;
        window._casinoSelectedOptionLabel = null;
        if (gamesEl) gamesEl.style.display = 'none';
        if (formTitle) formTitle.textContent = g.name;
        optionsEl.innerHTML = g.options.map(function (o) {
            var mult = (o.multiplier != null && o.multiplier !== '') ? Number(o.multiplier) : 1;
            var multStr = mult % 1 === 0 ? 'x' + mult : 'x' + mult.toFixed(1);
            var label = (o.label || o.id) + ' · ' + multStr;
            var idEsc = (o.id || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            var labelEsc = (o.label || o.id).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return '<div class="player-casino-option-card" role="button" tabindex="0" data-option-id="' + idEsc + '" data-option-label="' + labelEsc + '">' + esc(label) + '</div>';
        }).join('');
        optionsEl.querySelectorAll('.player-casino-option-card').forEach(function (card) {
            card.addEventListener('click', function () {
                optionsEl.querySelectorAll('.player-casino-option-card').forEach(function (c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                window._casinoSelectedOptionId = card.getAttribute('data-option-id');
                window._casinoSelectedOptionLabel = card.getAttribute('data-option-label');
            });
        });
        if (amountEl) amountEl.value = '';
        if (confirmBtn) confirmBtn.onclick = function () { if (typeof confirmCasinoBet === 'function') confirmCasinoBet(); };
        formWrap.style.display = 'block';
    };

    /** Jugador: volver a la lista de juegos (oculta formulario, muestra tarjetas). */
    window.backToCasinoGames = function () {
        var gamesEl = document.getElementById('player-casino-games');
        var formWrap = document.getElementById('player-casino-form-wrap');
        if (gamesEl) gamesEl.style.display = '';
        if (formWrap) formWrap.style.display = 'none';
        window._casinoSelectedGameId = null;
    };

    /** Jugador: confirmar apuesta (validar y llamar placeCasinoBet). */
    window.confirmCasinoBet = function () {
        var shopId = window._casinoShopId;
        var gameId = window._casinoSelectedGameId;
        if (!shopId || !gameId) return;
        var amountEl = document.getElementById('player-casino-amount');
        var optionId = window._casinoSelectedOptionId || '';
        var optionLabel = window._casinoSelectedOptionLabel || optionId;
        var amount = amountEl ? amountEl.value.trim() : '';
        if (!optionId) {
            if (typeof showToast === 'function') showToast('Elige una opción', true);
            return;
        }
        placeCasinoBet(shopId, gameId, optionId, optionLabel, amount).then(function () {
            var gamesEl = document.getElementById('player-casino-games');
            var formWrap = document.getElementById('player-casino-form-wrap');
            var waitingWrap = document.getElementById('player-casino-waiting-wrap');
            if (gamesEl) gamesEl.style.display = 'none';
            if (formWrap) formWrap.style.display = 'none';
            if (waitingWrap) waitingWrap.style.display = 'block';
        }).catch(function () {});
    };

    /** Jugador: cerrar modal casino y desuscribir listener de notificaciones. */
    var _casinoPlayerNotifUnsub = null;
    window.closePlayerCasinoModal = function () {
        if (typeof _casinoPlayerNotifUnsub === 'function') {
            _casinoPlayerNotifUnsub();
            _casinoPlayerNotifUnsub = null;
        }
        if (typeof closeModal === 'function') closeModal('player-casino-modal');
    };

    /** DM: abrir modal de apuestas pendientes de una tienda casino. */
    var _casinoBetsUnsubscribe = null;
    window.openCasinoBetsModal = function (travelingShopId) {
        window._casinoBetsShopId = travelingShopId;
        var shop = (window.travelingShopsData || []).find(function (s) { return s.id === travelingShopId; });
        var titleEl = document.getElementById('dm-casino-bets-title');
        var listEl = document.getElementById('dm-casino-bets-list');
        if (titleEl) titleEl.textContent = '🎲 Apuestas pendientes · ' + (shop ? (shop.nombre || 'Casino') : '');
        if (listEl) listEl.innerHTML = '<p style="color:#8b7355;">Cargando…</p>';
        if (typeof _casinoBetsUnsubscribe === 'function') _casinoBetsUnsubscribe();
        _casinoBetsUnsubscribe = subscribeCasinoPendingBets(travelingShopId, function (list) {
            if (!document.getElementById('dm-casino-bets-list')) return;
            if (!list.length) {
                listEl.innerHTML = '<p style="color:#8b7355;">No hay apuestas pendientes.</p>';
                return;
            }
            var esc = function (s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
            listEl.innerHTML = list.map(function (b) {
                var betIdEsc = (b.id || '').replace(/'/g, "\\'");
                var dateStr = b.createdAt ? b.createdAt.toLocaleString('es-ES') : '';
                return '<div class="dm-casino-bet-card">' +
                    '<div class="dm-casino-bet-player">' + esc(b.playerName) + ' · ' + esc(b.gameName) + '</div>' +
                    '<div class="dm-casino-bet-detail">' + esc(b.optionLabel) + ' · ' + (b.betAmount || 0).toLocaleString() + ' GP · ' + dateStr + '</div>' +
                    '<div class="dm-casino-bet-actions">' +
                    '<button type="button" class="btn win" onclick="resolveCasinoBet(\'' + betIdEsc + '\', \'WIN\')">✅ Ganó</button>' +
                    '<button type="button" class="btn lose" onclick="resolveCasinoBet(\'' + betIdEsc + '\', \'LOSE\')">❌ Perdió</button></div></div>';
            }).join('');
        });
        if (typeof openModal === 'function') openModal('dm-casino-bets-modal');
    };

    /** Cerrar modal DM: desuscribir listener. */
    window.closeCasinoBetsModal = function () {
        if (typeof _casinoBetsUnsubscribe === 'function') {
            _casinoBetsUnsubscribe();
            _casinoBetsUnsubscribe = null;
        }
        if (typeof closeModal === 'function') closeModal('dm-casino-bets-modal');
    };

    document.addEventListener('DOMContentLoaded', function () {
        var gamesEl = document.getElementById('player-casino-games');
        if (gamesEl) {
            gamesEl.addEventListener('click', function (e) {
                var card = e.target.closest('.player-casino-game-card');
                if (card && card.dataset.gameId && typeof selectCasinoGame === 'function') selectCasinoGame(card.dataset.gameId);
            });
        }
    });
})();
