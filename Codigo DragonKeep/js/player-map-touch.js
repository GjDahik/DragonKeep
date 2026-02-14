/**
 * Módulo para mapas en dispositivos táctiles (iOS, Android, tablets).
 * Solo se activa cuando se detecta touch o pointer:coarse.
 * PC/escritorio usa el flujo normal de app.js sin tocar este módulo.
 */
(function () {
    'use strict';

    function isTouchDevice() {
        var ua = navigator.userAgent || '';
        var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var isAndroid = /Android/i.test(ua);
        var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        var coarsePointer = typeof window.matchMedia !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
        return (isIOS || isAndroid) && (hasTouch || coarsePointer);
    }

    function attachTouchButton(btn, handler) {
        if (!btn) return;
        var lastTap = 0;
        function run() {
            if (Date.now() - lastTap < 400) return;
            lastTap = Date.now();
            handler();
        }
        btn.addEventListener('touchend', function (e) {
            e.preventDefault();
            run();
        }, { passive: false });
    }

    function findMarkerAtPoint(clientX, clientY) {
        var layer = document.getElementById('player-map-markers-layer');
        if (!layer) return null;
        var markers = layer.querySelectorAll('.player-map-marker');
        for (var i = 0; i < markers.length; i++) {
            var rect = markers[i].getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
                return markers[i];
            }
        }
        return null;
    }

    function handleMarkerTapTouch(marker) {
        if (!marker || typeof openPlayerCityFromMap !== 'function') return;
        var layer = document.getElementById('player-map-markers-layer');
        if (!layer) return;
        if (marker.dataset.cityId) {
            var labelAlreadyVisible = marker.classList.contains('label-visible');
            if (labelAlreadyVisible) {
                marker.classList.remove('label-visible');
                openPlayerCityFromMap(marker.dataset.cityId, marker.dataset.cityName);
            } else {
                layer.querySelectorAll('.player-map-marker.label-visible').forEach(function (m) { m.classList.remove('label-visible'); });
                marker.classList.add('label-visible');
            }
        } else {
            layer.querySelectorAll('.player-map-marker.label-visible').forEach(function (m) { m.classList.remove('label-visible'); });
            marker.classList.toggle('label-visible');
        }
    }

    function initPlayerMapTouch() {
        if (!isTouchDevice()) return;

        var viewport = document.getElementById('player-map-viewport');
        if (!viewport) return;

        var zoomIn = document.getElementById('player-map-zoom-in');
        var zoomOut = document.getElementById('player-map-zoom-out');
        if (zoomIn && typeof setPlayerMapZoom === 'function' && typeof playerMapZoom !== 'undefined') {
            attachTouchButton(zoomIn, function () { setPlayerMapZoom(playerMapZoom + 0.25); });
        }
        if (zoomOut && typeof setPlayerMapZoom === 'function' && typeof playerMapZoom !== 'undefined') {
            attachTouchButton(zoomOut, function () { setPlayerMapZoom(playerMapZoom - 0.25); });
        }

        attachTouchButton(document.getElementById('player-map-markers-toggle-btn'), function () {
            if (typeof setPlayerMapMarkersPanel === 'function') setPlayerMapMarkersPanel(!playerMapMarkersPanelOpen);
        });
        attachTouchButton(document.getElementById('player-map-rutas-toggle-btn'), function () {
            if (typeof togglePlayerRutasPanel === 'function') togglePlayerRutasPanel();
        });
        attachTouchButton(document.getElementById('player-map-bitacora-toggle-btn'), function () {
            if (typeof togglePlayerBitacoraPanel === 'function') togglePlayerBitacoraPanel();
        });

        var touchStart = { t: 0, x: 0, y: 0 };
        var lastMarkerTap = 0;
        var TAP_MAX_MS = 300;
        var TAP_MAX_PX = 15;

        viewport.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            touchStart.t = Date.now();
            touchStart.x = e.touches[0].clientX;
            touchStart.y = e.touches[0].clientY;
        }, { passive: true });

        viewport.addEventListener('touchend', function (e) {
            if (e.changedTouches.length !== 1) return;
            if (typeof playerMapPlaceMode !== 'undefined' && playerMapPlaceMode) return;
            if (typeof playerMapMoveMode !== 'undefined' && playerMapMoveMode) return;
            var tc = e.changedTouches[0];
            var dt = Date.now() - touchStart.t;
            var dx = Math.abs(tc.clientX - touchStart.x);
            var dy = Math.abs(tc.clientY - touchStart.y);
            if (dt <= TAP_MAX_MS && dx <= TAP_MAX_PX && dy <= TAP_MAX_PX) {
                if (Date.now() - lastMarkerTap < 350) return;
                var marker = findMarkerAtPoint(tc.clientX, tc.clientY);
                if (marker) {
                    lastMarkerTap = Date.now();
                    e.preventDefault();
                    handleMarkerTapTouch(marker);
                }
            }
        }, { passive: false });
    }

    window.isTouchDevice = isTouchDevice;
    window.initPlayerMapTouch = initPlayerMapTouch;
})();
