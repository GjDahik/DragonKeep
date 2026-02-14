// ==================== FIREBASE (solo para index.html / login) ====================
// En dm-dashboard y player-app se usa el bloque de app.js; este archivo solo se carga en index.html
(function () {
    if (typeof firebase === 'undefined') return;
    if (firebase.apps && firebase.apps.length > 0) return; // ya inicializado
    const firebaseConfig = {
        apiKey: "AIzaSyAfOdbG9zqU4ccC_B-ZCUGPnfBDM2KvB-I",
        authDomain: "nueva-valdoria.firebaseapp.com",
        projectId: "nueva-valdoria",
        storageBucket: "nueva-valdoria.firebasestorage.app",
        messagingSenderId: "29742426810",
        appId: "1:29742426810:web:0cf259ba71b0e5f0d8f083"
    };
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.firestore();
})();
