// ==================== FIREBASE CONFIG (único punto de configuración) ====================
// La API key es pública en frontend. La seguridad real depende de Firestore Rules.
// Al desplegar: reemplaza __REPLACE_API_KEY__ por tu API key (o inyéctala en build).
// No subas serviceAccount*.json ni claves privadas al repositorio.

(function () {
    window.firebaseConfig = {
        apiKey: "__REPLACE_API_KEY__",
        authDomain: "nueva-valdoria.firebaseapp.com",
        projectId: "nueva-valdoria",
        storageBucket: "nueva-valdoria.firebasestorage.app",
        messagingSenderId: "29742426810",
        appId: "1:29742426810:web:0cf259ba71b0e5f0d8f083"
    };
})();
