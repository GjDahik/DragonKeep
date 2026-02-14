/**
 * Patrón de unsubscribe centralizado para Firestore onSnapshot en Vanilla JS.
 * No modifica lógica de negocio: solo registra y cierra listeners.
 *
 * Uso:
 *   1. Donde crees onSnapshot: var unsub = ref.onSnapshot(...); registerUnsubscribe('dm', null, unsub);
 *   2. Al cambiar de vista (DM → jugador): closeAll('dm');
 *   3. Al cambiar de vista (jugador → DM): closeAll('player');
 *   4. Al salir de un tab (ej. Historial): closeAll('tab', 'transactions');
 *   5. Opcional al logout global: closeAllSubscriptions();
 */
(function (global) {
    'use strict';

    var subscriptions = {
        dm: [],
        player: [],
        tab: {}
    };

    /**
     * Registra una función de desuscripción para cerrarla después.
     * @param {string} scope - 'dm' | 'player' | 'tab'
     * @param {string|null} key - Si scope === 'tab', nombre del tab (ej. 'transactions'). Si no, null.
     * @param {function} unsubscribeFn - Función que devolvió onSnapshot() (sin argumentos, cierra el listener).
     */
    function registerUnsubscribe(scope, key, unsubscribeFn) {
        if (typeof unsubscribeFn !== 'function') return;
        var bag;
        if (scope === 'tab' && key) {
            if (!subscriptions.tab[key]) subscriptions.tab[key] = [];
            bag = subscriptions.tab[key];
        } else if (scope === 'dm' || scope === 'player') {
            bag = subscriptions[scope];
        } else {
            return;
        }
        bag.push(unsubscribeFn);
    }

    /**
     * Cierra todos los listeners del scope (y opcionalmente del tab).
     * @param {string} scope - 'dm' | 'player' | 'tab'
     * @param {string} [key] - Si scope === 'tab', nombre del tab.
     */
    function closeAll(scope, key) {
        var bag;
        if (scope === 'tab' && key) {
            bag = subscriptions.tab[key];
            if (bag) {
                bag.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
                subscriptions.tab[key] = [];
            }
        } else if (scope === 'dm' || scope === 'player') {
            bag = subscriptions[scope];
            if (bag) {
                bag.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
                subscriptions[scope] = [];
            }
        }
    }

    /**
     * Cierra todos los listeners registrados (dm + player + todos los tabs).
     */
    function closeAllSubscriptions() {
        closeAll('dm');
        closeAll('player');
        Object.keys(subscriptions.tab || {}).forEach(function (k) { closeAll('tab', k); });
    }

    global.__firestoreSubscriptions = subscriptions;
    global.registerUnsubscribe = registerUnsubscribe;
    global.registerUnsub = registerUnsubscribe;
    global.closeAllSubscriptions = closeAllSubscriptions;
    /** Cerrar por scope: closeAll('dm'), closeAll('player'), closeAll('tab', 'transactions'). */
    global.closeAll = closeAll;
    global.closeScope = closeAll;

})(typeof window !== 'undefined' ? window : this);

/*
 * FIRESTORE LISTENER LIFECYCLE CHECKLIST:
 * - DM listeners closed on exit (closeAll('dm') when entering player view or logout)
 * - Player listeners closed on exit (closeAll('player') when entering DM or logout)
 * - Tabs listeners closed (closeAll('tab', 'transactions') when leaving Historial tab)
 * - Logout closes player doc listener (player-app.js playerLogout; index logout → closeAllSubscriptions)
 * - No orphan onSnapshot remains (all onSnapshot unsubs stored or registered in manager)
 */
