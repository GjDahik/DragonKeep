// ==================== LOGIN PAGE (solo index.html) ====================
// Requiere: firebase-init.js (db), login-common.js (showToast, openModal, closeModal), auth.js

function toggleLoginFields() {
    var userTypeEl = document.getElementById('login-user-type');
    var dmGroup = document.getElementById('login-dm-name-group');
    var playerGroup = document.getElementById('login-player-select-group');
    if (!userTypeEl || !dmGroup || !playerGroup) return;
    var userType = userTypeEl.value;
    if (userType === 'dm') {
        dmGroup.style.display = 'block';
        dmGroup.classList.add('login-field-visible');
        playerGroup.style.display = 'none';
        playerGroup.classList.remove('login-field-visible');
        var loginNombre = document.getElementById('login-nombre');
        if (loginNombre) loginNombre.value = '';
        var sel = document.getElementById('login-player-select');
        if (sel) sel.value = '';
    } else {
        dmGroup.style.display = 'none';
        dmGroup.classList.remove('login-field-visible');
        playerGroup.style.display = 'block';
        playerGroup.classList.add('login-field-visible');
        var loginNombre2 = document.getElementById('login-nombre');
        if (loginNombre2) loginNombre2.value = '';
        loadLoginPlayers();
    }
}

function loadLoginPlayers() {
    var sel = document.getElementById('login-player-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Cargando… —</option>';
    if (typeof db === 'undefined') {
        sel.innerHTML = '<option value="">— Error: db no disponible —</option>';
        return;
    }
    db.collection('players').limit(200).get()
        .then(function (snap) {
            var list = snap.docs.map(function (doc) {
                var d = doc.data();
                return { id: doc.id, nombre: d.nombre, visible: d.visible };
            }).filter(function (p) { return p.visible !== false; })
            .sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
            sel.innerHTML = '<option value="">— Selecciona tu aventurero —</option>';
            list.forEach(function (p) {
                var opt = document.createElement('option');
                opt.value = p.nombre || '';
                opt.textContent = p.nombre || 'Sin nombre';
                opt.dataset.id = p.id;
                sel.appendChild(opt);
            });
        })
        .catch(function (e) {
            sel.innerHTML = '<option value="">— Error al cargar —</option>';
            console.error(e);
        });
}

function handleLogin() {
    var userTypeEl = document.getElementById('login-user-type');
    var pinEl = document.getElementById('login-pin');
    if (!userTypeEl || !pinEl) return;
    var userType = userTypeEl.value;
    var pin = (pinEl.value || '').trim();
    var nombre = '';
    if (userType === 'dm') {
        var loginNombre = document.getElementById('login-nombre');
        nombre = loginNombre ? loginNombre.value.trim() : '';
    } else {
        var sel = document.getElementById('login-player-select');
        nombre = (sel && sel.options[sel.selectedIndex]) ? sel.options[sel.selectedIndex].value : '';
    }
    if (!nombre || !pin) {
        showToast('Por favor completa todos los campos', true);
        return;
    }
    var doRedirect = function () {
        updateFooterTagline();
        closeModal('login-modal');
        var transitionEl = document.getElementById('fire-transition-screen');
        if (transitionEl) {
            transitionEl.style.display = '';
            transitionEl.classList.add('active');
            transitionEl.setAttribute('aria-hidden', 'false');
            setTimeout(function () {
                transitionEl.classList.remove('active');
                transitionEl.setAttribute('aria-hidden', 'true');
                transitionEl.style.display = 'none';
                window.location = userType === 'dm' ? 'dm-dashboard.html' : 'player-app.html';
            }, 1800);
        } else {
            window.location = userType === 'dm' ? 'dm-dashboard.html' : 'player-app.html';
        }
    };
    if (userType === 'dm') {
        loginDM(nombre, pin).then(function (ok) {
            if (ok) doRedirect();
        });
    } else {
        loginPlayer(nombre, pin).then(function (ok) {
            if (ok) doRedirect();
        });
    }
}

function handleCreateDM() {
    var nombreEl = document.getElementById('create-dm-nombre');
    var pinEl = document.getElementById('create-dm-pin');
    var pinConfirmEl = document.getElementById('create-dm-pin-confirm');
    if (!nombreEl || !pinEl || !pinConfirmEl) return;
    var nombre = nombreEl.value.trim();
    var pin = pinEl.value.trim();
    var pinConfirm = pinConfirmEl.value.trim();
    if (!nombre || !pin || !pinConfirm) {
        showToast('Por favor completa todos los campos', true);
        return;
    }
    if (pin.length < 4) {
        showToast('El PIN debe tener al menos 4 dígitos', true);
        return;
    }
    if (pin !== pinConfirm) {
        showToast('Los PINs no coinciden', true);
        return;
    }
    createDM(nombre, pin).then(function (success) {
        if (success) {
            closeModal('create-dm-modal');
            var loginNombre = document.getElementById('login-nombre');
            if (loginNombre) loginNombre.value = nombre;
            pinEl.value = '';
            pinConfirmEl.value = '';
            var typeEl = document.getElementById('login-user-type');
            if (typeEl) typeEl.value = 'dm';
            showToast('Cuenta creada. Ahora puedes iniciar sesión');
        }
    });
}

function showCreateDMModal() {
    var nombreEl = document.getElementById('create-dm-nombre');
    var pinEl = document.getElementById('create-dm-pin');
    var pinConfirmEl = document.getElementById('create-dm-pin-confirm');
    if (nombreEl) nombreEl.value = '';
    if (pinEl) pinEl.value = '';
    if (pinConfirmEl) pinConfirmEl.value = '';
    openModal('create-dm-modal');
}

// Inicialización solo en página de login (index.html)
document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('login-modal')) return;
    if (document.getElementById('main-container')) return; // estamos en página unificada antigua
    toggleLoginFields();
    if (checkAuth()) {
        var t = sessionStorage.getItem('userType');
        if (t === 'dm') { window.location = 'dm-dashboard.html'; return; }
        if (t === 'player') { window.location = 'player-app.html'; return; }
    }
});
