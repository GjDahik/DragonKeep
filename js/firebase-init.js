// ==================== FIREBASE (solo para index.html / login) ====================
// Requiere firebase-config.js antes de este script. dm-dashboard y player-app usan app.js.
(function () {
    if (typeof firebase === 'undefined') return;
    if (firebase.apps && firebase.apps.length > 0) return;
    var conf = (typeof window !== 'undefined' && window.firebaseConfig) ? window.firebaseConfig : {
        apiKey: "__REPLACE_API_KEY__",
        authDomain: "nueva-valdoria.firebaseapp.com",
        projectId: "nueva-valdoria",
        storageBucket: "nueva-valdoria.firebasestorage.app",
        messagingSenderId: "29742426810",
        appId: "1:29742426810:web:0cf259ba71b0e5f0d8f083"
    };
    if (!conf.apiKey || conf.apiKey === "__REPLACE_API_KEY__") return;
    firebase.initializeApp(conf);
    window.db = firebase.firestore();
})();
