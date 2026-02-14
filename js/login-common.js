// ==================== Utilidades mínimas para la página de login ====================
// Solo se carga en index.html (login). dm-dashboard y player-app usan app.js para toast/modal.

var FOOTER_TAGLINES = [
    'Caos a la orden del dia',
    'Caos calculado, consecuencias inevitables.',
    'El orden es opcional. El destino, no.'
];

function showToast(msg, err) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' error' : '');
    setTimeout(function () { t.classList.remove('show'); }, 3000);
}

function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
}

function updateFooterTagline() {
    var el = document.getElementById('footer-tagline');
    if (!el || !FOOTER_TAGLINES.length) return;
    el.textContent = FOOTER_TAGLINES[Math.floor(Math.random() * FOOTER_TAGLINES.length)];
}

function showLoginModal() {
    var loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.classList.add('active');
}
