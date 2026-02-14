# División del proyecto en 3 bloques: Login · Player App · DM Dashboard

Este documento lista **exactamente** qué bloques del `index.html` y de `app.js` van en cada uno de los 3 archivos, y qué modales y scripts cargar en cada página.

---

## 1. INDEX.HTML → Tres archivos

### 1.1 `index.html` (solo LOGIN)

| Bloque | Líneas aprox. en index.html actual | Descripción |
|--------|-----------------------------------|-------------|
| **`<head>`** | 1–19 | Meta, title, favicon, manifest (condicional), fuentes, `styles.css`. Mantener igual. |
| **`<body>`** | 20–21 | Apertura de body. |
| **Fire transition** | 3005–3010 | `<div class="fire-transition-screen" id="fire-transition-screen">` (transición de fuego al entrar). |
| **Modal Login** | 3011–3046 | `<div class="modal-overlay active" id="login-modal">` (tipo usuario, nombre/PIN, botón Iniciar sesión). |
| **Modal Crear DM** | 3325–3361 | `<div class="modal-overlay" id="create-dm-modal">` (nombre DM, PIN, confirmar PIN). |
| **Toast** | 3363 | `<div class="toast" id="toast">`. |
| **Footer** | 3365–3373 | Placa “powered by GjDahik” y `#footer-tagline`. |
| **Scripts** | 3375–3390 | Solo: Firebase (app + Firestore), SheetJS (opcional aquí, o solo en DM), **auth.js**, **firestore-subscriptions.js**, **common.js** (nuevo: Firebase config + db + utilidades compartidas), **login.js** (nuevo: toggleLoginFields, loadLoginPlayers, handleLogin, handleCreateDM, showCreateDMModal; al éxito → `window.location = 'dm-dashboard.html'` o `'player-app.html'`). |

**No incluir en index.html (login):**  
- `#main-container` (vista DM).  
- `#player-view-container` (vista Personaje).  
- Cualquier modal de DM o de Player (tiendas, jugadores, ciudades, etc.).  

---

### 1.2 `dm-dashboard.html` (solo DM)

| Bloque | Líneas aprox. en index.html actual | Descripción |
|--------|-----------------------------------|-------------|
| **`<head>`** | 1–19 | Igual que login (mismo título "DragonKeep" o "DragonKeep – DM"). |
| **Contenedor DM** | 21–359 | `<div class="container" id="main-container">` completo: header DM (placa, app-brand, logout, hamburger), nav (Mapa, Jugadores, Ciudades, Tiendas ambulantes, Notificaciones, Misiones, Historial, Battle Tracker, Salir), y **todas** las `<section class="tab-content">`: **map** (65–178), **players** (179–210), **cities** (211–218), **traveling-shops** (220–228), **notifications** (230–283), **missions** (284–337), **transactions** (339–359). |
| **Modales solo DM** | Ver tabla 1.2.1 | Todos los modales que solo usa el DM. |
| **Toast + Footer** | 3363, 3365–3373 | Mismo toast y footer. |
| **Scripts DM** | Ver 3.2 | common, auth, app-dm.js (o parte DM de app.js), players, cities, traveling-shops, inventory, transactions, notifications, automation, missions. |

**Tabla 1.2.1 – Modales que van en dm-dashboard.html (en el orden que aparecen en el HTML actual)**

| id del modal | Líneas aprox. | Uso |
|--------------|---------------|-----|
| `player-modal` | 1521–1575 | Editar/crear jugador (DM). |
| `gold-modal` | 1577–1618 | Ajustar oro del jugador. |
| `banco-modal` | 1620–1656 | Ajustar banco del jugador. |
| `cartas-destino-modal` | 1658–1694 | Cartas del Destino del jugador. |
| `ruta-modal` | 1696–1735 | Crear/editar ruta conocida. |
| `city-modal` | 1737–1789 | Crear/editar ciudad. |
| `npc-modal` | 1791–1847 | Crear/editar NPC. |
| `shop-modal` | 1849–1894 | Crear/editar tienda. |
| `dm-casa-modal` | 1896–1932 | Mi Casa del jugador (DM). |
| `batalla-config-modal` | 1934–1989 | Configurar NPCs de batalla en tienda. |
| `player-inventory-modal` | 1991–2036 | Ver inventario del jugador (DM). |
| `give-item-modal` | 2038–2079 | Dar ítem al jugador. |
| `registrar-encontrado-modal` | 2081–2123 | Registrar objeto encontrado. |
| `registrar-encontrado-recibo-modal` | 2125–2136 | Recibo de registro. |
| `automation-rule-modal` | 2138–2179 | Regla de mensaje automático. |
| `notification-modal` | 2181–2192 | Contenido de notificación (lectura). |
| `import-shops-modal` | 2194–2249 | Importar tiendas (CSV/Excel). |
| `import-npcs-modal` | 2251–2303 | Importar NPCs. |
| `inventory-modal` | 2305–2825 | Inventario de una tienda (DM). |
| `item-modal` | 2827–3003 | Crear/editar ítem de tienda. |
| `traveling-shop-modal` | 3049–3094 | Crear/editar tienda ambulante. |
| `traveling-shop-ver-reglas-modal` | 3096–3121 | Ver reglas (Análisis de objetos). |
| `traveling-analisis-rule-modal` | 3123–3205 | Añadir/editar regla Análisis de objetos. |
| `legend-edit-modal` | 3248–3273 | Editar canción “Escucha la leyenda”. |
| `mission-modal` | 3275–3323 | Crear/editar misión. |

**No incluir en dm-dashboard.html:**  
- `login-modal`, `create-dm-modal`, `fire-transition-screen` (quedan en index.html).  
- Cualquier modal cuyo `id` empiece por `player-` y sea solo de la vista personaje (player-city-shops-modal, player-habitantes-modal, player-santuario-modal, player-banco-modal, player-batalla-modal, player-posada-modal, player-*-modal de tiendas jugador, etc.).  
- `app-confirm-modal` se puede incluir en DM también (confirmaciones genéricas).

---

### 1.3 `player-app.html` (solo Personaje)

| Bloque | Líneas aprox. en index.html actual | Descripción |
|--------|-----------------------------------|-------------|
| **`<head>`** | 1–19 | Igual que login. |
| **Contenedor Player** | 362–718 | `<div class="container player-view-container" id="player-view-container">` completo: header personaje (placa nombre/clase/nivel, oro, banco, logout, hamburger), nav (Mapa, Ciudades, Tiendas ambulantes, Inventario, CDD & Correo, Home, Misiones, Battle Tracker, Salir), y **todas** las `<section class="tab-content">`: **player-map** (409–511), **player-ciudades** (512–562), **player-traveling-shops** (562–569), **player-inventario** (570–614), **player-notifications** (615–645), **player-home** (647–686), **player-missions** (687–718). |
| **Modales solo Player** | Ver tabla 1.3.1 | Todos los modales que solo usa el jugador. |
| **Modal compartido** | 934–949 | `app-confirm-modal` (confirmaciones). |
| **Toast + Footer** | 3363, 3365–3373 | Mismo toast y footer. |
| **Scripts Player** | Ver 3.3 | common, auth, app-player.js (o parte Player de app.js), player-map-touch, notifications (badge correo), missions (vista jugador). |

**Tabla 1.3.1 – Modales que van en player-app.html**

| id del modal | Líneas aprox. | Uso |
|--------------|---------------|-----|
| `player-city-shops-modal` | 721–735 | Tiendas de una ciudad. |
| `player-habitantes-modal` | 737–750 | Habitantes (NPCs) de la ciudad. |
| `player-use-item-confirm-modal` | 753–772 | Confirmar usar ítem. |
| `player-sell-item-confirm-modal` | 775–794 | Confirmar vender ítem. |
| `player-transfer-item-modal` | 797–821 | Transferir ítem a otro jugador. |
| `player-inventory-item-detail-modal` | 824–846 | Detalle de ítem en inventario. |
| `player-city-notes-modal` | 849–863 | Mis notas de la ciudad. |
| `player-mi-casa-notes-modal` | 866–879 | Mis notas de Mi Casa. |
| `player-npc-notes-modal` | 883–896 | Mis notas de NPC. |
| `player-mission-notes-modal` | 900–914 | Mis notas de misión. |
| `player-bitacora-note-modal` | 917–930 | Notas de noche (bitácora). |
| `app-confirm-modal` | 934–949 | Confirmaciones (compartido). |
| `player-santuario-modal` | 951–1003 | Santuario (donación, d100). |
| `player-banco-modal` | 1005–1044 | Banco (depósito/retiro). |
| `player-batalla-modal` | 1046–1089 | Batalla (elegir oponentes, pagar). |
| `player-posada-modal` | 1091–1142 | Posada (rentar cuartos). |
| `player-shop-catalog-modal` | 1144–1158 | Catálogo tienda genérica. |
| `player-artesanias-modal` | 1160–1205 | Tienda Artesanías/Arquería. |
| `player-emporio-modal` | 1207–1254 | Emporio. |
| `player-forge-modal` | 1256–1304 | Herrería. |
| `player-biblioteca-modal` | 1306–1357 | Biblioteca. |
| `player-tavern-modal` | 1359–1471 | Taberna. |
| `player-potion-shop-modal` | 1473–1518 | Tienda Pociones. |
| `player-analisis-objetos-modal` | 3207–3245 | Análisis de objetos (tienda ambulante). |

---

## 2. APP.JS → Tres partes (common + login + dm + player)

### 2.1 `js/common.js` (compartido por las 3 páginas)

Contenido a **extraer** de `app.js` y dejar en un único archivo que carguen index.html, dm-dashboard.html y player-app.html:

| Líneas app.js | Función / bloque | Notas |
|---------------|-------------------|-------|
| 1–96 | Firebase config, `db`, contador de reads (opcional), PWA base path y registro del Service Worker | Todo el encabezado hasta antes de `debounce`. |
| 98–101 | `debounce` | |
| 115–127 | `getCurrentPlayerDoc` | Usado en vista jugador; DM puede no usarlo. |
| 129–133 | `getCityInfoForShop` | |
| 158–165 | `getItemQuantity` | |
| 166–174 | `getItemSignature` | |
| 175–192 | `mergeItemsByQuantity` | |
| 252–257 | `getItemDesc` | |
| 269–295 | `buildShopReceiptHTML` | Usado en tiendas jugador. |
| 510–517 | `updateFooterTagline` | |
| 4470–4475 | `escapeForOnclick` | |
| 4680–4682 | `openBattleTracker` (solo la redirección a battle-tracker.html) | O dejarla en DM y Player por separado. |
| 6566–6571 | `showToast` | |
| 6573–6594 | `openModal` | |
| 6660–6678 | `closeModal` | |
| 6633–6659 | `showAppConfirm`, `runAppConfirmAndClose` | |
| 2958–2986 | `playAppIconFireEntrance` | |
| 2987–2992 | `rollBiasedD20` | |
| 2993–3035 | `rollHeaderD20` | |
| 6439–6466 | `toggleMobileNav`, `closeMobileNav` | |

Variables globales que deben estar en common (o en el scope que compartan):  
`PWA_BASE`, y las que usen las funciones anteriores. Las que son solo DM (`citiesData`, `npcsData`, `shopsData`, `playersData`, `mapLevels`, etc.) pueden ir en app-dm; las solo player (`playerCitiesData`, `playerPotionCart`, etc.) en app-player.

---

### 2.2 `js/login.js` (solo index.html – página de login)

| Líneas app.js | Función | Notas |
|---------------|--------|-------|
| 297–319 | `toggleLoginFields` | |
| 320–342 | `loadLoginPlayers` | |
| 343–391 | `handleLogin` | **Cambio:** en lugar de `showDashboard()` / `showPlayerView()`, hacer `window.location = 'dm-dashboard.html'` o `'player-app.html'`. |
| 392–421 | `handleCreateDM` | |
| 422–428 | `showCreateDMModal` | |
| 429–448 | `showLoginModal` | En login solo se usa al cargar la página (mostrar modal) y no “volver” desde DM/Player; se puede simplificar. |

Al cargar `index.html`: si ya hay sesión en `sessionStorage` (currentUser + userType), opcionalmente redirigir directamente a `dm-dashboard.html` o `player-app.html` para no mostrar login de nuevo.

---

### 2.3 `js/app-dm.js` (solo dm-dashboard.html)

Todo lo que **solo** usa la vista DM. Incluye:

- **Config y datos globales DM:** `mapLevels`, `mapEditIndex`, `citiesData`, `npcsData`, `shopsData`, `playersData`, `rutasConocidasData`, y constantes como `DEFAULT_MAP_IMAGE_URL`, `DEFAULT_CONTINENT_NAME`, `POSADA_CUARTOS` si las usan módulos DM.
- **Mapa DM:** desde `loadMapImage` (518) hasta `createDMMapFreeMarker` (1538), más `getDMMapLevelKey`, `initDMMapViewport`, `handleDMMapWheel`, `onDMMapPointer*`, `setDMMapZoom/Pan`, `clampDMMapPan`, `applyDMMapTransform`, `resetDMMapTransform`, `loadDMMapMarkers`, `saveDMMapMarkerToFirestore`, `deleteDMMapMarkerFromFirestore`, `renderDMMapMarkersDropdown`, `renderDMMapMarkers`, `toggleDMMapMarkersPanel`, `updateDMMapPlaceModeUI`, `toggleDMMapPlaceMode`, `startDMMapFreeMode`, `placeDMMapMarkerFromEvent`, `finishDMMapCityPlacement`, `finishDMMapFreePlacement`, `removeDMMapMarker`, `removeDMMapFreeMarker`, `createDMMapFreeMarker`; y `openDMCityFromMap` (1720), `toggleMapLevelVisible`, `editMapLevel`, `cancelMapLevelEdit`, `saveMapLevelEdit`, `addMapLevel`, `deleteMapLevel`, `saveMapLevels`, `setDefaultMapLevel`, `toggleMapEditMode` (1975–2071).
- **Rutas DM:** `loadRutasConocidas` (3195), `toggleDMRutasSection`, `renderDMRutas`, `openRutaModal`, `saveRuta`, `editRuta`, `deleteRuta` (3209–3318).
- **Dashboard y navegación DM:** `showDashboard` (6362), `refreshDMData` (6397), `switchDMNotificationsSubtab` (6487), `togglePlayersCard` (6863), `toggleShopCart`, `backToShop`, `updateShopCartBadge` (6595–6629) si se usan en contexto DM.
- **Migración (opcional en DM):** `runQuantityMigration` (193–251) y lo que expone en `window` para el botón de migración en DM.
- **Cartas / Mi Casa (vista DM):** `loadPlayerCartasDestino`, `toggleCartasDestinoCompletada` (6679–6764), `loadMiCasaContent` (6766) cuando se usan desde modales del DM (cartas-destino-modal, dm-casa-modal).

Inicialización al cargar `dm-dashboard.html`:  
- Comprobar `sessionStorage`: si no hay usuario o `userType !== 'dm'`, redirigir a `index.html`.  
- Llamar a `showDashboard()` (o su equivalente: mostrar `#main-container`, cargar datos, bind de tabs).

---

### 2.4 `js/app-player.js` (solo player-app.html)

Todo lo que **solo** usa la vista Personaje. Incluye:

- **Datos globales jugador:** `playerCitiesData`, `playerShopsData`, `playerNpcsData`, `_playerDocCache`, `playerPotionCart`, `playerTavernCart`, etc., y variables de estado de tiendas jugador (playerForgeShopId, playerBibliotecaCart, …).
- **Mapa jugador:** `updateMapPlayerView` (662), `playerMapLevelUp`, `playerMapLevelDown`, `getPlayerMapLevelKey`, `loadPlayerMapMarkers`, `migrateFromLocalStorage`, `savePlayerMapMarkers`, `normalizePlayerMapMarker`, `normalizePlayerCustomMarker`, `getPlayerMapCustomMarkerNumbers`, `resetPlayerMapMarkerDropdowns`, `renderPlayerMapFreeMarkersDropdown`, `loadPlayerDMMapMarkers`, `renderPlayerMapMarkers`, `initPlayerMapViewport`, `handlePlayerMapWheel`, `onPlayerMapPointerDown/Move/Up`, `getPlayerMapPointersDistance/Center`, `setPlayerMapZoom/Pan`, `clampPlayerMapPan`, `applyPlayerMapTransform`, `resetPlayerMapTransform`, `startPlayerMapFreeMode`, `getPlayerMapClickCoords`, `movePlayerMapMarkerFromEvent`, `placePlayerMapMarkerFromEvent`, `startPlayerMapMoveMode`, `removePlayerMapFreeMarker`, `finishPlayerMapFreePlacement`, `openPlayerCityFromMap` (1710), `initPlayerMapMarkers` (1744), `updatePlayerMapPlaceModeUI`, `togglePlayerMapMarkersPanel`, `setPlayerMapMarkersPanel`.
- **Rutas y bitácora jugador:** `renderPlayerRutas`, `closeOtherPlayerMapPanels`, `togglePlayerRutasPanel`, `playerRutaCalcular`, `clearCurrentRutaParaViaje`, `togglePlayerBitacoraPanel`, `startViaje`, `deleteBitacoraViaje`, `toggleBitacoraViajeNoches`, `loadBitacora`, `renderBitacora`, `saveBitacoraNota`, `openBitacoraNoteModal`, `saveBitacoraNoteFromModal`.
- **Ciudades y directorio jugador:** `fetchPlayerCities`, `fetchPlayerShops`, `fetchPlayerNpcs`, `refreshPlayerWorld`, `loadPlayerWorld`, `renderPlayerCities`, `renderPlayerMapUbicacionDropdown`, `setPlayerUbicacion`, `loadPlayerCityNotesPreviews`, `openCityNotesModalFromDirectorio`, `openCityNotesModal`, `saveCityNotesFromModal`, `openPlayerCityShops`, `switchDirectorioTab`, `playerDirectorioVolver`, `toggleDirectorioTabsMobile`, `getNpcCardColor`, `openPlayerHabitantesModal`, `openNpcNotesModal`, `saveNpcNotesFromModal`, `savePlayerNpcNote`, `renderPlayerDirectorioHabitantes`, `playerDirectorioHabitantesVolver`.
- **Inventario jugador:** `getTipoLabel`, `groupInventoryItems`, `setPlayerInventorySort`, `setPlayerInventorySortFromSelect`, `syncPlayerInventorySortSelect`, `sortPlayerInventoryGroups`, `renderPlayerView`, `closeAllInvActionsMenus`, `toggleInvActionsMenu`, `invActionGetMenuBtn`, `invActionUse`, `invActionSell`, `invActionTransfer`, `openPlayerInventoryItemDetail`, `openUseItemConfirm`, `openUseItemConfirmStack`, `doConfirmedUseItem`, `openSellConfirm`, `openSellConfirmStack`, `doConfirmedSellItem`, `playerUseItem`, `playerUseItemStack`, `playerSellItem`, `playerSellItemStack`, `openTransferItemModal`, `confirmTransferItem`, `openRegistrarEncontradoModal`, `confirmRegistrarEncontrado`.
- **Santuario, Banco, Posada, Batalla:** `getSanctuaryChance`, `pickArr`, `openPlayerSanctuaryModal`, `resetPlayerSanctuarySession`, `performPlayerSanctuaryOffering`, `openPlayerBancoModal`, `doPlayerBancoDeposit`, `doPlayerBancoWithdraw`, `openPlayerPosadaModal`, `renderPlayerPosadaCuartos`, `updatePosadaCart`, `openPlayerBatallaModal`, `renderBatallaOponentes`, `toggleBatallaOponente`, `updateBatallaSelected`, `processBatallaPayment`.
- **Tiendas jugador (Pociones, Taberna, Forge, Artesanías, Emporio, Biblioteca, Catálogo):** `openPlayerShop`, `openPlayerArtesaniasModal`, `renderPlayerArtesaniasGrids`, `playerArtesaniasAddToCart`, `playerArtesaniasUpdateQty`, `renderPlayerArtesaniasCart`, `playerArtesaniasCheckout`, `openPlayerEmporioModal`, `renderPlayerEmporioGrids`, `playerEmporioAddToCart`, `playerEmporioUpdateQty`, `renderPlayerEmporioCart`, `playerEmporioCheckout`, `openPlayerBibliotecaModal`, `renderPlayerBibliotecaTabsAndGrids`, `playerBibliotecaToggleCart`, `renderPlayerBibliotecaCart`, `playerBibliotecaCheckout`, `openPlayerForgeModal`, `renderPlayerForgeGrids`, `playerForgeAddToCart`, `playerForgeUpdateQty`, `renderPlayerForgeCart`, `playerForgeCheckout`, `openPlayerShopCatalog`, `openPlayerPotionShop`, `normalizeRarity`, `renderPlayerPotionProducts`, `addToPotionCart`, `updatePotionQty`, `renderPlayerPotionCart`, `playerPotionCheckout`, `openPlayerTavernShop`, `playerTavernEnter`, `getTavernItems`, `renderTavernBebidas`, `renderTavernCocina`, `renderTavernOtros`, `addToTavernCart`, `updateTavernQty`, `renderTavernCart`, `playerTavernCheckout`.
- **Vista jugador y notificaciones:** `showPlayerView` (3037), `switchPlayerNotificationsSubtab` (6468), `loadPlayerCartasDestino`, `toggleCartasDestinoCompletada`, `loadMiCasaContent` (vista jugador), y las que abren/guardan notas de Mi Casa (openMiCasaNotesModal, saveMiCasaNotesFromModal) si están en app.js.

Inicialización al cargar `player-app.html`:  
- Comprobar `sessionStorage`: si no hay usuario o `userType !== 'player'`, redirigir a `index.html`.  
- Llamar a `showPlayerView()` (o equivalente: mostrar `#player-view-container`, cargar mundo jugador, bind de tabs, iniciar badge de correo).

---

## 3. Scripts a cargar en cada página

### 3.1 index.html (login)

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
<script src="js/auth.js"></script>
<script src="js/firestore-subscriptions.js"></script>
<script src="js/common.js"></script>
<script src="js/login.js"></script>
```

No cargar: players.js, cities.js, traveling-shops.js, inventory.js, transactions.js, notifications.js, automation.js, missions.js, player-map-touch.js (ni app.js completo).

---

### 3.2 dm-dashboard.html

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="js/auth.js"></script>
<script src="js/firestore-subscriptions.js"></script>
<script src="js/common.js"></script>
<script src="js/app-dm.js"></script>
<script src="js/players.js"></script>
<script src="js/cities.js"></script>
<script src="js/traveling-shops.js"></script>
<script src="js/inventory.js"></script>
<script src="js/transactions.js"></script>
<script src="js/notifications.js"></script>
<script src="js/automation.js"></script>
<script src="js/missions.js"></script>
```

No cargar: login.js, app-player.js, player-map-touch.js (el mapa DM usa su propia lógica en app-dm.js).

---

### 3.3 player-app.html

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="js/auth.js"></script>
<script src="js/firestore-subscriptions.js"></script>
<script src="js/common.js"></script>
<script src="js/app-player.js"></script>
<script src="js/player-map-touch.js"></script>
<script src="js/notifications.js"></script>
<script src="js/missions.js"></script>
```

Opcional: si alguna parte de cities o traveling-shops se usa solo desde la vista jugador (por ejemplo helpers), se podría cargar solo ese módulo o mover esas funciones a app-player. Hoy `cities.js` y `traveling-shops.js` tienen sobre todo lógica DM; la vista jugador usa sobre todo app.js (que pasará a app-player) y notifications/missions.

---

## 4. Flujo entre páginas

1. **Entrada:** el usuario abre `index.html` (o la raíz que redirija a `index.html`).
2. **Login:** en login.js, `handleLogin` tras éxito hace:
   - `window.location = 'dm-dashboard.html'` si es DM, o  
   - `window.location = 'player-app.html'` si es Personaje.  
   Opcional: mostrar antes la pantalla de transición (fuego) unos segundos.
3. **dm-dashboard.html:** al `DOMContentLoaded`, si no hay `currentUser` con `userType === 'dm'`, `window.location = 'index.html'`. Si sí, ejecutar la inicialización del dashboard (equivalente a `showDashboard()`).
4. **player-app.html:** al `DOMContentLoaded`, si no hay `currentUser` con `userType === 'player'`, `window.location = 'index.html'`. Si sí, ejecutar la inicialización de la vista jugador (equivalente a `showPlayerView()`).
5. **Salir:** en DM o Player, `logout()` limpia sesión y hace `window.location = 'index.html'` (y opcionalmente `closeAllSubscriptions()` antes).

---

## 5. Resumen de archivos nuevos

| Archivo | Contenido |
|---------|-----------|
| **index.html** | Solo head, fire-transition, login-modal, create-dm-modal, toast, footer, scripts login. |
| **dm-dashboard.html** | Head, main-container (todas las secciones DM), modales DM, toast, footer, scripts DM. |
| **player-app.html** | Head, player-view-container (todas las secciones jugador), modales jugador + app-confirm, toast, footer, scripts Player. |
| **js/common.js** | Firebase config, db, PWA, debounce, getCurrentPlayerDoc, getItem*, mergeItemsByQuantity, buildShopReceiptHTML, showToast, openModal, closeModal, showAppConfirm, updateFooterTagline, openBattleTracker, playAppIconFireEntrance, rollBiasedD20, rollHeaderD20, toggleMobileNav, closeMobileNav, escapeForOnclick. |
| **js/login.js** | toggleLoginFields, loadLoginPlayers, handleLogin (con redirección a dm-dashboard o player-app), handleCreateDM, showCreateDMModal, showLoginModal. |
| **js/app-dm.js** | Toda la lógica y datos globales usados solo por dm-dashboard (mapa DM, rutas, showDashboard, refreshDMData, migración, etc.). |
| **js/app-player.js** | Toda la lógica y datos globales usados solo por player-app (mapa jugador, ciudades, inventario, tiendas jugador, bitácora, showPlayerView, etc.). |

El **app.js** actual se deja de usar como monolito: se parte en common.js, login.js, app-dm.js y app-player.js según esta lista. Los módulos existentes (players.js, cities.js, missions.js, etc.) se mantienen y se cargan solo en las páginas que los necesiten (DM o Player).

Si quieres, el siguiente paso puede ser implementar la división en archivos (empezando por index.html → 3 HTML y por common.js + login.js).
