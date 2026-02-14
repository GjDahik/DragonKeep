# 🏰 DragonKeep

**Dashboard para Dungeon Master** y **app de personajes** en una sola entrada. Login compartido por tipo de usuario (DM o Personaje), nombre y PIN. Diseñado para campañas de D&D y juegos de rol por turnos.

---

## 🚀 Cómo abrir la app (evitar CORS)

Si abres `index.html` directamente (`file://`) el navegador puede bloquear el manifest y el service worker. **Sirve la carpeta por HTTP**:

```bash
npm start
```

Se abrirá en **http://localhost:3000**. Si no tienes Node, puedes usar Python: `python3 -m http.server 3000` y entrar en http://localhost:3000.

---

## 🚀 Entrada y login

La app está dividida en **3 páginas**:

- **`index.html`** — Solo login. Elige **Dungeon Master** o **Personaje**, nombre y PIN. Tras iniciar sesión redirige a `dm-dashboard.html` o `player-app.html`.
- **`dm-dashboard.html`** — Panel completo del DM (mapa, jugadores, ciudades, notificaciones, misiones, historial, etc.). Si no hay sesión de DM, redirige a `index.html`.
- **`player-app.html`** — Vista del aventurero (mapa, ciudades, inventario, CDD & Correo, Home, misiones). Si no hay sesión de personaje, redirige a `index.html`.

Por seguridad, el **primer DM** se crea solo **directamente en la base de datos** (Firestore, colección `dms`). A partir de ahí, ese DM puede crear otros DMs desde el dashboard (Jugadores → **👑 + DM**). Los personajes los crea el DM en **Jugadores** y les asigna un PIN. Al hacer **Salir** en DM o Personaje se vuelve a `index.html`. Ver `CREAR_DM.md` y `AUTH_SETUP.md` para más detalle.

*(También existe `index-full.html` con la versión antigua de una sola página, por si se necesita.)*

---

## 👑 Vista Dungeon Master

### Navegación

| Pestaña | Descripción |
|--------|-------------|
| 🗺️ **Mapa** | Mapa del continente. Nombre y URL de imagen editables; modo “solo ver” para ocultar la configuración. |
| 👥 **Jugadores** | Grupo de aventureros: crear, editar, oro, inventario, banco, Cartas del Destino, Mi Casa, dar ítems. Crear otro DM. |
| 🏘️ **Ciudades/Pueblos** | Ciudades con nivel de peligro, visibilidad a jugadores, notas por ciudad. NPCs y tiendas por ciudad. |
| 📮 **Notificaciones** | **Enviar**: cartas a uno o todos los jugadores. **Historial**: notificaciones enviadas. **🤖 Mensajes automáticos**: reglas que envían un mensaje al correo del jugador al comprar un ítem o rentar un cuarto, y opcionalmente quitar el ítem de la tienda. Las reglas se crean, editan y eliminan desde aquí. |
| 📋 **Misiones** | Crear misiones (título, descripción, recompensa), hacerlas visibles a todos o a jugadores asignados. **Activas**: borrador/visible. **Historial**: completadas o archivadas. Los aventureros ven solo las visibles y trackean su progreso (aceptar, en curso, completada). |
| 📜 **Historial** | Transacciones (compras, hospedaje, retiros, etc.) con filtros por aventurero y tienda. |
| ⚔️ **Battle Tracker** | Abre `battle-tracker.html` en nueva pestaña. |
| 🚪 **Salir** | Cerrar sesión. |

### Ciudades y tiendas

- Cada ciudad puede tener **NPCs** y **tiendas**.
- Tipos de tienda: **Pociones**, **Taberna**, **Herrería**, **Arquería**, **Emporio**, **Biblioteca**, **Santuario**, **Banco**, **Posada**, **Batalla**.
- **Posada**: cuartos configurables (nombre|precio|efecto) o por defecto (ej. Nebulosa).
- **Batalla**: NPCs como oponentes con precios. Configuración desde el modal de tienda.
- **Santuario**: deidad, donación, d100; sin inventario.
- **Banco**: depósitos y retiros; comisión en retiros.
- Inventarios por tienda (subida manual o **importación CSV**). Hay plantillas en `csv-plantillas/`.

### Importación CSV

- Desde el modal de una tienda: importar ítems desde CSV/Excel.
- Formatos y ejemplos en `csv-plantillas/` (pociones, taberna, forja, artesanías, biblioteca, emporio).

---

## ⚔️ Vista Personaje

### Navegación

| Pestaña | Descripción |
|--------|-------------|
| 🗺️ **Mapa** | Mismo mapa que el DM (solo lectura). |
| 🏛️ **Ciudades** | Ciudades visibles; entrar para ver tiendas y abrir cada una. |
| 🎒 **Inventario** | Ítems del personaje. Buscador por nombre/efecto y filtro por tipo de tienda. Vista tabla en escritorio y tarjetas en móvil. |
| 🃏 **CDD & Correo** | **Cartas del Destino** asignadas por el DM. **Correo**: cartas nuevas y historial. Badge con cantidad de correos sin leer en el botón de nav y en el subtab Correo. |
| 🏠 **Home** | **Mi Casa**: nombre, imagen, descripción, ubicación, notas del DM. Notas personales editables por el jugador. |
| 📋 **Misiones** | Misiones que el DM ha hecho visibles. **Activas**: aceptar, marcar en curso o completada. **Historial**: misiones completadas. |
| ⚔️ **Battle Tracker** | Abre `battle-tracker.html` en nueva pestaña. |
| 🚪 **Salir** | Cerrar sesión. |

### Tiendas (personaje)

- **Pociones**: catálogo, carrito, compra.
- **Taberna**: entrada, bebidas, cocina.
- **Herrería / Artesanías**: tienda y servicios; según tipo.
- **Emporio**: materiales, raros, mapas, otros.
- **Biblioteca**: magia, fabricación, cocina, trampas, alquimia, mapas, restringida.
- **Santuario**: donación, d100, efectos por tirada.
- **Banco**: depositar y retirar (comisión en retiros).
- **Posada**: rentar cuartos; descuento por 3+ noches.
- **Batalla**: elegir oponentes, pagar y registrar combate.

Las compras y el hospedaje descontando oro, transacciones y **mensajes automáticos** (reglas de Notificaciones) se aplican en cada flujo correspondiente.

---

## 🤖 Mensajes automáticos

Dentro de **Notificaciones** → **🤖 Mensajes automáticos**:

- El DM define **reglas** por tienda (o posada) e ítem/cuarto.
- Al **comprar** ese ítem o **rentar** ese cuarto, el jugador recibe una **carta en Correo** con el mensaje configurado.
- Opcionalmente, **quitar el ítem de la tienda** al comprarlo (no aplica a posadas).
- Reglas editables y eliminables desde la lista.

---

## 📁 Estructura del proyecto

```
dm-dashboard-modular/
├── index.html              # App principal: login + vista DM o Personaje
├── player.html             # (Opcional) Entrada solo personajes; ver nota abajo
├── battle-tracker.html     # Tracker de combate (abre desde nav DM/Personaje)
├── heroes-legendarios.html # Página adicional (héroes legendarios)
├── .firebaserc             # Proyecto Firebase por defecto (nueva-valdoria)
├── firebase.json           # Configuración Firebase (reglas Firestore)
├── firestore.rules         # Reglas de seguridad Firestore (missions, legend_audio, etc.)
├── AUTH_SETUP.md           # Configuración de autenticación y colecciones
├── CREAR_DM.md             # Cómo crear el primer DM
├── README.md               # Este archivo
├── csv-plantillas/         # CSVs de ejemplo para importar ítems
│   ├── 01_pociones_emporio_batalla.csv
│   ├── 02_taberna.csv
│   ├── 03_forja_herreria.csv
│   ├── 04_artesanias_arqueria.csv
│   ├── 05_biblioteca.csv
│   └── 06_emporio_20_ejemplos.csv
├── css/
│   └── styles.css          # Estilos globales
└── js/
    ├── app.js              # Lógica principal, mapa, jugadores, tiendas personaje, etc.
    ├── auth.js             # Login DM/Personaje, crear DM
    ├── players.js          # CRUD jugadores, Cartas del Destino, Mi Casa, dar ítems
    ├── cities.js           # Ciudades, NPCs, tiendas, modales DM
    ├── inventory.js        # Inventarios de tiendas, importación CSV
    ├── transactions.js     # Historial de transacciones
    ├── notifications.js    # Notificaciones DM, correo personaje, badge sin leer
    ├── automation.js       # Reglas de mensajes automáticos
    ├── missions.js         # Misiones: DM crea/edita/visibilidad; jugador trackea progreso e historial
    └── player-app.js       # Solo usado por player.html (entrada opcional)
```

**Nota sobre `player.html`:** Página alternativa solo para personajes (login nombre + PIN, vista reducida). No se usa en el flujo normal de `index.html`. Puedes borrarla si no la utilizas; `player-app.js` solo la usa a ella.

---

## 🔧 Tecnologías

- **HTML5**, **CSS3**, **JavaScript** (vanilla)
- **Firebase Firestore** (datos en tiempo real)
- **SheetJS (xlsx)** para importar Excel/CSV

---

## 🗄️ Firestore

### Colecciones principales

| Colección | Uso |
|-----------|-----|
| `dms` | Dungeon Masters (nombre, PIN). Login DM. |
| `players` | Personajes (nombre, PIN, clase, nivel, oro, inventario, banco, cartasDestino, Mi Casa, etc.). Login personaje. |
| `cities` | Ciudades (nombre, nivel de peligro, visibleToPlayers, etc.). |
| `npcs` | NPCs por ciudad; en batalla, precios de combate. |
| `shops` | Tiendas por ciudad (tipo, inventario, posada cuartos, etc.). |
| `transactions` | Compras, hospedaje, retiros, etc. |
| `notifications` | Cartas enviadas a personajes (mensaje, leida, playerId, etc.). |
| `automation_rules` | Reglas de mensajes automáticos (tienda, ítem/cuarto, mensaje, quitar de tienda). |
| `missions` | Misiones (título, descripción, status: draft/visible/completed/archived, visibleTo, assignedPlayerIds, reward, playerProgress por jugador, completedAt). |
| `legend_audio` | Audios de "Escucha la leyenda" (título, url, descripción). DM CRUD; jugador solo lectura. |
| `settings` | Configuración global; documento `map` para nombre del continente y URL del mapa. |

Subcolecciones: `cities/{id}/playerNotes` para notas de jugadores por ciudad.

Configuración de Firebase en `js/app.js` (`firebaseConfig`). Proyecto por defecto: `nueva-valdoria` (`.firebaserc`).

### Reglas de Firestore

El proyecto incluye `firestore.rules` y `firebase.json` para desplegar las reglas desde la CLI. Las reglas permiten lectura y escritura en todas las colecciones usadas por la app (incluidas `missions` y `legend_audio`). La app usa autenticación custom (nombre + PIN), no Firebase Auth, por lo que las reglas no pueden distinguir DM de jugador en el servidor; mantén el enlace del dashboard privado o usa Firebase App Check si lo expones.

**Desplegar reglas:**

```bash
firebase deploy --only firestore:rules
```

Requisito: tener Firebase CLI instalado y haber hecho `firebase login` y `firebase use nueva-valdoria` (o tu proyecto).

---

## 🚀 Cómo usar

1. Abre **`index.html`** en el navegador (o despliégalo en GitHub Pages / tu hosting).
2. Crea el **primer DM** en Firestore (colección `dms`: documento con `nombre` y `pin`) si aún no existe; los demás DMs los crea un DM desde el dashboard (**👑 + DM** en Jugadores).
3. Inicia sesión como **DM**, crea **Jugadores** y asígnales PIN.
4. Como **Personaje**, inicia sesión con nombre y PIN del personaje.
5. Configura **Firebase** (Firestore, reglas) y, si usas emulación, `.firebaserc` y `firebaseConfig` según tu proyecto.

---

## 📤 Despliegue (GitHub Pages)

1. Sube el proyecto al repositorio.
2. Configura GitHub Pages para la rama `main` (o `master`) y la raíz del repo.
3. Asegúrate de que `index.html` esté en la raíz.

Para Firebase en producción, configura dominios autorizados en la consola de Firebase.

---

## 📄 Licencia y créditos

Proyecto de hobby, uso personal.  
*"powered by GjDahik" — Caos a la orden del día.*
