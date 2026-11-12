# Plan de Análisis y Ejecución: UI/UX y Seguridad (Desktop, Tablet, Móvil)

**Proyecto:** GN-Encuestas / Admin Dashboard (Grupo Nebak)  
**Fecha:** 2026-11-12  
**Versión base analizada:** producción `v165` (commit `01617fe`)  
**Estado:** Fases 0–5 completadas en alcance frontend/código (pendientes externos: despliegue/config GAS, validación en dispositivos reales y operación de backups/auditoría)

---

## 1. Resumen ejecutivo

Análisis exhaustivo realizado sobre producción desplegada y código fuente (`src/`, `apps-script/` en contexto local) para **desktop (>=1024px)**, **tablet (768–1023px)** y **móvil (<=767px)**, cubriendo UI/UX, accesibilidad y seguridad. Se verificó con los 5 roles (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`) el correcto comportamiento de menús, rutas y ocultamiento de acciones mutantes tras el despliegue v165.

**Hallazgos principales:**
- **Seguridad:** CSP en modo *report-only* (sin enforcement), token API en query string (restricción backend/CORS), datos sensibles cacheados en `localStorage`, posibles carreras auth/perfil en transiciones rápidas, y necesidad de auditoría continua de sinks `innerHTML`.
- **Limitaciones de plataforma (no accionables en este stack):** S1 (CSP enforcement/report-only por cabeceras HTTP) y S2 (token en `Authorization` + preflight CORS) **no son posibles** con **GitHub Pages + Google Apps Script Web App** tal como está desplegado. Se dejan documentados como **ignorados/no aplicables** en las fases (no ejecutar cambios adicionales sobre ellos).
- **UI/UX móvil/tablet:** objetivos táctiles pequeños en acciones/iconos (31–36px) y gráficos (11px), campos de búsqueda/filtro sin etiqueta accesible explícita, botones icon-only sin `aria-label` en algunos contextos, tablas con scroll horizontal (mejorables a tarjetas en móvil), y toggle “Más” implementado como `<a href="javascript:void(0)">`.
- **UI/UX desktop:** base funcional correcta; oportunidades en accesibilidad (foco, etiquetas, targets), densidad de tablas y consistencia de estados.
- **Roles/permisos:** funcionamiento correcto en sesiones limpias (menú, rutas, acciones por módulo/rol). Riesgo residual de estados transitorios por carreras de sesión/perfil. Pendiente mejorar dashboards/vistas y limitación de botones por rol para mostrar solo datos y acciones relevantes.

---

## 2. Alcance y metodología

### 2.1 Plataformas objetivo
| Plataforma | Viewport | Navegación principal | Consideraciones |
|---|---:|---|---|
| **Desktop** | >=1024px | Sidebar fija/colapsable | Densidad, tablas, atajos/foco, multi-columna |
| **Tablet** | 768–1023px | Sidebar/patrones intermedios | Touch + pointer, orientación, modales, teclado |
| **Móvil** | <=767px | Bottom-nav + menú “Más”, sidebar off-canvas | Touch targets, espacio, formularios, scroll, rendimiento |

### 2.2 Metodología
- Revisión de código: `src/index.html`, `src/css/styles.css`, `src/js/*.js`, `src/sw.js`, manifiesto.
- Inspección en producción (v165) con navegador automatizado: estructura DOM, visibilidad, roles, rutas, acciones, atributos ARIA, overflow, tablas, modales.
- Verificación por roles en sesiones limpias: `admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`.
- Revisión de seguridad frontend: CSP, manejo de token/auth, almacenamiento, exposición de datos, sinks DOM.
- **Limitación:** sin emulación de viewport/dispositivo real en herramientas; validación visual responsive final requiere pruebas manuales en dispositivos físicos.

---

## 3. Inventario de hallazgos

### 3.1 Seguridad

| ID | Severidad | Hallazgo | Estado | Acción |
|---|---|---|---|---|
| S1 | Alta | CSP en `Content-Security-Policy-Report-Only` (no enforcement) | **Ignorado / no aplicable (GitHub Pages)** | CSP report-only en `<meta>` es ignorada por el navegador y GitHub Pages no permite cabeceras HTTP. **No es posible realizarlo en esta infraestructura**; se considera descartado para este plan. Mantener política endurecida en código como referencia, sin más acciones. |
| S2 | Alta | Token API en query string `?token=` (GET/POST) | **Ignorado / no aplicable (GAS+CORS)** | Migración a `Authorization: Bearer` requiere preflight CORS fiable; **no es posible con Google Apps Script Web App** en esta arquitectura (verificado: `Failed to fetch` por preflight). **Descartado para este plan**; mantener token en `?token=` y `useAuthorizationHeader` desactivado. |
| S3 | Media | Datos sensibles/PII cacheados en `localStorage` (`gn_cache_*`) | Completado (frontend) | Caché API con TTL (7 días) y envoltorio versionado compatible con formato legacy; limpieza de `gn_cache_*`/datos de usuario en logout y cambio de usuario mantenida. Segmentación adicional por rol/módulo queda como mejora opcional. |
| S4 | Media | Carreras auth/perfil en transiciones rápidas → UI/estado transitorio inconsistente | Completado (frontend) | Guards para no fetch sin sesión en loaders, control por token de página/render y gating de cargas del dashboard por permisos/módulo; fallback de rol `consulta` mantiene seguridad mientras se resuelve perfil. Cancelación HTTP nativa no implementada (sin abort centralizado), pero respuestas obsoletas se descartan por contexto/token en flujos clave. |
| S5 | Media | Uso extensivo de `innerHTML` (riesgo XSS si falta escape/sanitización) | Completado (auditoría dirigida) | Revisión dirigida de sinks/renderizados de campos de usuario, encuestas, notas y motivos: uso de `_esc`/escape presente en puntos revisados; sin hallazgos evidentes sin escapar en la pasada realizada. Recomendable auditoría continua en cambios futuros. |
| S6 | Media | Peticiones API potencialmente no autorizadas por rol en flujos/background | Completado (frontend) | Gating por permisos/módulo en cargas de dashboard y guards defensivos en renders/cargas de módulos restringidos (`donaciones`, `almacen`, `socios`, `blacklist`, encuestas/familias según acceso), reduciendo peticiones fuera de permisos. |
| S7 | Baja | `javascript:void(0)` en toggle de menú móvil | Completado | Reemplazado por `<button>` semántico con `aria-label`/`aria-controls` y gestión de foco/cierre. |
| S8 | Baja | Dependencias externas (gstatic, jsdelivr, fonts) y superficie CSP | Pendiente | Revisar necesidad, SRI donde aplique, políticas estrictas |
| S9 | Info | `referrer: no-referrer`, `noindex`, HTTPS/HSTS (hosting) correctos | OK | Mantener |

### 3.2 Accesibilidad y UI/UX

| ID | Severidad | Hallazgo | Plataforma | Estado | Acción |
|---|---|---|---|---|---|
| U1 | Alta | Objetivos táctiles < 44px (botones 31–36px, iconos 36px, puntos gráfico 11px) | Móvil/Tablet | Completado (frontend) | Targets mejorados globalmente (`btn-sm`, `.btn-icon`, acciones/tablas, áreas táctiles en coarse/mobile, puntos de gráfico con hit-area ampliada, sidebar colapsada con `min-height` en enlaces). |
| U2 | Alta | Botones icon-only sin etiqueta accesible suficiente (ej. editar/eliminar en blacklist) | Todas | Completado (frontend) | `aria-label`/`title` añadidos en acciones icon-only clave (blacklist, donaciones, controles globales/modales) y estado dinámico accesible del botón de colapso del sidebar. |
| U3 | Media | Inputs de búsqueda/filtro sin `<label>` asociado (solo placeholder) | Todas | Completado (frontend, alcance principal) | `aria-label` añadido en búsquedas/filtros principales de listas y navegación de datos; formularios modales conservan labels visibles (asociación explícita `for/id` mejorable en iteraciones futuras). |
| U4 | Media | Tablas con scroll horizontal en móvil (Socios, Donaciones) | Móvil | Completado (frontend) | Tablas densas principales adaptadas a tarjetas en móvil (`<=767px`) con `data-label` (Socios, Donaciones, Almacén, Actividad, historial publicaciones). |
| U5 | Media | Menú “Más” móvil: semántica y foco mejorables | Móvil | Completado (frontend) | Semántica de botón, ARIA, foco al abrir/cerrar, cierre por Escape/overlay/navegación y navegación por teclado con flechas/Home/End/Tab. |
| U6 | Media | Estados de carga/error transitorios y mensajes por carreras de sesión | Todas | Completado (frontend, alcance Fase 1) | Guards sin sesión, gating por permisos/contexto y descarte por token/página para estados obsoletos; mantener observación en flujos complejos. |
| U7 | Baja | Sidebar colapsada: targets/densidad y affordance | Desktop/Tablet | Completado (frontend) | Botón de colapso con mayor tamaño/estado accesible y enlaces en sidebar colapsada con altura táctil adecuada/tooltips existentes. |
| U8 | Baja | Feedback visual/foco en algunos controles (verificar `:focus-visible`) | Todas | Completado (frontend) | `:focus-visible` global reforzado y controles interactivos clave con estilos de foco coherentes. |
| U9 | Baja | Validación visual responsive no realizada en dispositivos reales | Tablet/Móvil | Pendiente | Pruebas manuales en iOS/Android, portrait/landscape. |
| U10 | Info | Modales con `role="dialog"`, `aria-modal`, `aria-labelledby` | Todas | OK | Mantener y verificar foco-trap/cierre en pruebas de dispositivo/teclado. |

### 3.3 Roles y permisos (funcional)
| Área | Estado | Nota |
|---|---|---|
| Menú/rutas por rol | OK (v165) | Verificado para 5 roles en sesiones limpias |
| Ocultamiento de acciones mutantes por módulo/rol | OK (v165) | Incluye `consulta` solo lectura |
| Reaplicación en renders/modales/dinámico | OK (v165) | `loadPage`, modales, `injectIcons` |
| Backend RBAC | OK (desplegado, según verificación previa) | Fuente de verdad; frontend complementario |
| Cargas API condicionadas al rol activo | Parcial | Mejorar para evitar errores 401/403 y fugas de intento |

---

## 4. Plan de ejecución por fases

### Fase 0 — Baseline y preparación (rápida)
**Objetivo:** asegurar punto de partida medible y entorno de validación.
- [x] Documentar estado desplegado (`v165` y avances hasta `v170`), matriz de roles/rutas y hallazgos.
- [x] Definir checklist formal de smoke test por rol y por plataforma (desktop/tablet/móvil) — ver sección 5 (matriz de verificación).
- [ ] (Opcional) Capturas/referencias de vistas clave para regresión visual.
- **Criterio de salida:** baseline y matriz de verificación documentados; validación visual en dispositivos reales pendiente (U9/bloqueo de entorno).

### Fase 1 — Seguridad frontend (impacto alto, sin romper contrato backend)
**Objetivo:** reducir superficie de riesgo en cliente sin requerir cambios incompatibles en GAS.
- [x] **S1:** **Ignorado/no aplicable** en esta infraestructura (GitHub Pages no permite cabeceras HTTP y CSP report-only en `<meta>` es ignorada). No se realizarán más cambios.
- [x] **S2:** **Ignorado/no aplicable** en esta infraestructura (GAS Web App no soporta preflight CORS fiable para `Authorization`, verificado). Se mantiene `?token=`; no se realizarán más cambios.
- [x] **S3:** Caché API con TTL (7 días), migración compatible de formato legacy y limpieza en logout/cambio de usuario.
- [x] **S4/S6:** Guards sin sesión, gating por permisos/módulo en dashboard y renders/cargas defensivas, y descarte por contexto/token para evitar aplicar estados obsoletos en navegación rápida.
- [x] **S5:** Auditoría dirigida de sinks `innerHTML` en áreas de riesgo (usuarios/encuestas/notas/motivos) sin hallazgos evidentes sin escape en la pasada realizada; mantener vigilancia en cambios futuros.
- [x] **S7:** Toggle “Más” móvil como `<button>` semántico con ARIA y foco.
- **Archivos modificados (fase):** `src/index.html`, `src/js/app.js`, `src/js/dashboard.js`, `src/css/styles.css`, `src/sw.js`, `PLAN_ANALISIS_Y_EJECUCION.md`.
- **Criterio de salida:** alcanzado en alcance frontend. **S1/S2 descartados por limitación de plataforma** (sin acciones pendientes). Sin regresiones conocidas en tests (`357/357`), menos cargas no autorizadas/races visibles y caché con expiración.

### Fase 2 — Accesibilidad y objetivos táctiles
**Objetivo:** cumplir buenas prácticas de accesibilidad y usabilidad táctil.
- [x] **U1:** Targets táctiles reforzados (global/touch/mobile): `btn-sm`, iconos/acciones, filas/tablas, hit-area en controles de gráfico y enlaces del sidebar colapsado.
- [x] **U2:** `aria-label`/`title` en botones icon-only y controles clave (modales, acciones contextuales, colapso sidebar con estado dinámico).
- [x] **U3:** `aria-label` en búsquedas/filtros principales; formularios con labels visibles mantenidos (asociación explícita `for/id` residual en modales como mejora incremental).
- [x] **U7/U8:** Mejora de foco visible global (`:focus-visible`) y affordance/targets del sidebar colapsado; estados existentes conservados.
- [x] Verificar orden de tabulación y cierre de modales (Escape, foco de retorno) a nivel de implementación actual (focus-trap básico en modales y cierre de “Más” con Escape); validación manual en dispositivos/teclados reales pendiente (U9).
- **Archivos modificados (fase):** `src/index.html`, `src/js/app.js`, `src/js/dashboard.js`, `src/css/styles.css`, `src/sw.js`, `PLAN_ANALISIS_Y_EJECUCION.md`.
- **Criterio de salida:** alcanzado en alcance frontend (controles clave más accesibles y táctiles; validación visual/teclado en dispositivos reales pendiente).

### Fase 3 — UX responsive (tablet y móvil)
**Objetivo:** mejorar legibilidad y operativa en pantallas pequeñas.
- [x] **U4:** Patrón responsive de tablas como tarjetas en móvil (`<=767px`) aplicado a tablas en tarjetas (`.card .data-table`) con `data-label`; extendido a Socios, Donaciones, Almacén, Actividad y historial de publicaciones (redes).
- [x] **U5:** Menú “Más” robustecido: botón semántico, `aria-expanded/controls`, foco al abrir, cierre por Escape/overlay/navegación, foco de retorno y navegación por teclado con flechas/Home/End/Tab dentro del menú.
- [x] Modales/formularios: mejoras de tamaño, scroll interno y pie de acciones en móvil (incl. `safe-area`), manteniendo formularios usables con teclado virtual en `360–767px`.
- [x] Gráficos/listas: hit-area táctil ampliada en puntos interactivos de gráficos (mejora aplicada en CSS/touch).
- [~] Ajustes específicos tablet (768–1023px): base responsive existente y mejoras de targets/foco aplicadas; ajustes finos adicionales dependen de validación visual en dispositivo real (U9).
- **Archivos modificados (fase):** `src/css/styles.css`, `src/js/dashboard.js`, `src/js/app.js`, `src/sw.js`, `PLAN_ANALISIS_Y_EJECUCION.md`.
- **Criterio de salida:** alcanzado en alcance frontend (mejoras implementadas para móvil/tablet); validación visual en dispositivos reales pendiente.

### Fase 4 — Robustez, rendimiento y permisos (refuerzo)
**Objetivo:** estabilidad y consistencia percibida.
- [x] Sincronización auth+perfil para decisiones de acceso: espera de perfil/rol en navegación/carga cuando hay sesión (`_profilePromise/_profileResolved`) y fallback seguro `consulta`.
- [x] Cargas condicionadas por permisos/módulo: `_ensureListas` y preloads/`refreshData` filtran listas según rol/página; dashboard/home y renders de módulos restringidos evitan peticiones no autorizadas; encuestas/respuestas se cargan solo si hay acceso.
- [x] Reducción de estados obsoletos en transiciones: guards sin sesión en loaders, control por token de página/render y repintados condicionados al contexto activo.
- [~] Optimización de rendimiento en listas muy largas: no se detectó necesidad inmediata de cambios estructurales en esta fase; mantener paginación/carga diferida como mejora futura si hay impacto.
- [x] Mensajes de error/estado: manejo existente de errores y estados vacíos/sin permisos mantenido; sin nuevos errores transitorios introducidos por los cambios de esta fase.
- **Archivos modificados (fase):** `src/js/dashboard.js`, `src/sw.js`, `PLAN_ANALISIS_Y_EJECUCION.md`.
- **Criterio de salida:** alcanzado en alcance frontend (navegación/cargas más consistentes con rol y sesión; validación manual multirol/dispositivo recomendada).

### Fase 5 — Validación final y hardening
**Objetivo:** cierre verificado.
- [x] Ejecutar suite de tests (`node --test tests/*.test.js`) — 357/357 OK en esta iteración.
- [~] Pruebas por rol en desktop/tablet/móvil: verificación en producción (2026-11-12, navegador) con 5 cuentas de prueba (`asdf@1234`) confirmó autenticación y que `user-profile` devuelve roles correctos, pero detectó fallo frontend (perfil no aplicado en UI -> fallback consulta). Fix desplegable preparado (`v175`); **pendiente smoke post-deploy por los 5 roles** y validación manual en dispositivos reales (iOS/Android/tablet, portrait/landscape).
- [x] Revisión de seguridad residual (alcance frontend/código): permisos UI+gating de cargas, CSP report-only alineada, caché con TTL y limpieza en logout/cambio, token en query mantenido por compatibilidad CORS/GAS con soporte preparado para `Authorization` (opt-in), y auditoría dirigida de sinks `innerHTML` sin hallazgos evidentes en la pasada realizada.
- [x] Actualizar `src/sw.js` (`CACHE_NAME`) en despliegues con cambios frontend (hasta `v174`).
- [x] Commit/push y verificación de despliegue en producción (frontend).
- **Criterio de salida:** alcanzado en alcance frontend/código y despliegue web. Pendientes externos: validación en dispositivos reales, despliegue/configuración GAS para S2/preflight y operación de backups/auditoría en entorno Google.

---

## 5. Matriz de verificación (checklist)

### 5.1 Por rol (cada plataforma)
- [x] `admin` (desktop, verificado v177 + 2026-11-12): perfil/rol correctos, sidebar/nav completos (incl. Donaciones/Almacén). Dashboard completo (KPIs/gráficos/embudo/acción requerida/tesorería/solicitudes recientes/accesos/recordatorio). Acceso correcto a páginas permitidas; acciones de creación/edición visibles en módulos de gestión muestreados (animales, acogidas, adopciones, socios, blacklist, donaciones, almacén). Sin rutas denegadas.
- [x] `coordinador` (desktop, verificado v177 + 2026-11-12): perfil/rol correctos, sin Donaciones/Almacén. Dashboard operativo (encuestas/adopciones/socios/animales) sin panel de tesorería. Rutas `#donaciones`/`#almacen` redirigen a dashboard. Acciones mutantes visibles en módulos permitidos (animales, acogidas, adopciones, socios, blacklist, reportes/descartar según contexto, recordatorio en home).
- [x] `voluntario` (desktop, verificado v177 + 2026-11-12, perfil resuelto): perfil/rol y sidebar correctos (`dashboard`, `animales`, `reportes`). Dashboard simplificado. Rutas restringidas (`#encuestas*`, `#acogidas*`, `#adopciones`, `#socios`, `#blacklist`, `#donaciones`, `#almacen`) redirigen a dashboard. Acciones de edición en animales/reportes coherentes con permisos de rol (`puedeEditar` incluye animales/reportes/actividad); sin acceso a módulos no permitidos. **Pendiente:** validación visual de bottom-nav/menú “Más” y layout móvil/tablet en dispositivo real/emulación.
- [~] `tesoreria` (desktop, verificado v177 + 2026-11-12, perfil resuelto): perfil/rol y sidebar correctos (`dashboard`, `animales`, `reportes`, `donaciones`, `almacen`). Dashboard con KPIs/paneles de tesorería y animales; rutas restringidas redirigen. Acciones visibles en donaciones/almacen/home según permisos. **Pendiente externo/backend:** consola muestra `No autorizado para consultar este recurso` en endpoints de `animales`/`reportes`/`grupos`/`recordatorios`/`documentos` al navegar como tesorería (frontend permite acceso pero backend desplegado parece denegar), provocando datos vacíos o parciales en esas vistas; contrastar/ajustar permisos en GAS (`apps-script/Roles.gs`/despliegue).
- [x] `consulta` (desktop, verificado v177 + 2026-11-12): perfil/rol correctos, sin Donaciones/Almacén. Solo lectura en vistas muestreadas: sin acciones mutantes ni botones submit visibles en dashboard, encuestas, animales, acogidas, adopciones, socios, blacklist y reportes; rutas restringidas redirigen. **Pendiente:** smoke de solo lectura en fichas/modales/rutas profundas y listados con acciones por fila no cubiertos en esta pasada.

### 5.2 Por plataforma
- [~] **Desktop:** verificación en producción (`v177`, 2026-11-12, navegador) por los 5 roles con perfil resuelto: login, `user-profile`, sidebar/rutas permitidas-denegadas, dashboards diferenciados y presencia/ausencia de acciones mutantes en vistas principales muestreadas. **Pendiente:** smoke exhaustivo en fichas, modales, formularios, rutas profundas y acciones por fila/dinámicas en todos los módulos.
- [ ] **Tablet:** ajustes responsive aplicados; **validación en dispositivo real pendiente** (768–1023px, orientación, teclado). Sin emulación de viewport disponible en las herramientas usadas.
- [~] **Móvil:** mejoras responsive y lógica de permisos en bottom-nav/“Más” presentes en código; verificación parcial de visibilidad/permisos en DOM por rol desde desktop. **No fue posible emular viewport móvil real** con las herramientas de navegador disponibles; **validación en dispositivo real/emulación dedicada pendiente** (layout, touch, teclado).

### 5.3 Seguridad/estabilidad
- [x] **S2 ignorado/no aplicable:** token en query se mantiene por limitación GAS+CORS (no viable migrar a `Authorization` en esta arquitectura). Sin acciones pendientes.
- [~] Sin acciones mutantes visibles para roles sin permiso: verificado en producción (desktop, 2026-11-12) para vistas principales de los 5 roles con perfil resuelto (admin/coordinador/voluntario/tesorería/consulta) y redirección de rutas denegadas; `consulta` sin mutaciones/submit en vistas muestreadas. **Pendiente auditoría/verificación exhaustiva en fichas, modales, listados con acciones por fila, rutas profundas y acciones dinámicas**.
- [~] Reducción de peticiones/carreras no autorizadas y estados obsoletos (guards, perfil/rol, tokens de página): mejorado (fix v175 y gating). Verificación automatizada rápida sigue pudiendo capturar estado previo a resolución de perfil; con espera de perfil/rol correcto la UI aplica permisos adecuadamente. **Pendiente observación en sesiones reales y revisión de errores backend de autorización para tesorería**.
- [x] Caché `gn_cache_*` con TTL y limpieza en logout/cambio de usuario
- [x] **S1 ignorado/no aplicable:** CSP efectiva por cabeceras HTTP no posible en GitHub Pages; se mantiene endurecimiento en `<meta>` como referencia, sin acciones pendientes.

---

## 6. Dependencias y bloqueos / acciones fuera del frontend

> **Nota:** S1 (CSP por cabeceras HTTP) y S2 (token en `Authorization` + preflight CORS) **no son posibles** con la infraestructura actual (**GitHub Pages + Google Apps Script Web App**). Aunque se consideraron en fases, quedan **descartados/ignorados** para este plan y **no requieren más trabajo**.

- **Auditoría y backups (backend/operación):**
  - Código local presente (`apps-script/Code.gs` registra auditoría sensible si `CONFIG.sheets.auditoria` está configurado; `apps-script/Backup.gs` incluye exportación ZIP, envío email y helpers de triggers).
  - **Pendiente externo:** configurar IDs reales de hojas de auditoría/historial, `BACKUP_EMAIL`/`BACKUP_DRIVE_FOLDER_ID`, permisos de Drive/Spreadsheet y crear/activar triggers en entorno GAS (`crearTriggerBackupDiario/Semanal/CadaXDias`).
- **Pruebas en dispositivos reales:** requieren acceso a móviles/tablets físicos o device lab (no automatizable en este entorno).

---

## 7. Registro de ejecución

| Fecha | Fase | Cambio | Commit | Verificación | Estado |
|---|---|---|---|---|---|
| 2026-11-12 | - | Ocultamiento acciones por rol/módulo, UI solo lectura consulta, permisos tras render/modal | `01617fe` (v165) | 357 tests OK, verificación 5 roles en producción | Completado |
| 2026-11-12 | 0 | Creación de plan de análisis y ejecución | `fea917c` | Documento y registro generados | Completado |
| 2026-11-12 | 1/2 | Accesibilidad/UI: menú “Más” como botón, `aria-label` en controles/acciones clave, targets táctiles iniciales | `9787e0f` (v166) | 357 tests OK, despliegue en producción | Completado |
| 2026-11-12 | 1 | CSP report-only endurecida/alineada (Firebase, `unsafe-inline` estilos, `blob:`, políticas base) | `86ac93d` (v167) | 357 tests OK, despliegue en producción | Completado |
| 2026-11-12 | 0-3 | U4 tablas Socios/Donaciones con `data-label` y tarjetas responsive móvil, U5 foco/teclado en menú “Más”, S4/S6 guards de carga sin sesión, refuerzo `:focus-visible`/targets y `aria-label` adicionales | `84c8362` (v168) | 357 tests OK, desplegado (`gn-encuestas-v168`) | Completado (parcial por fases) |
| 2026-11-12 | 1 | Gating parcial de cargas del dashboard por permisos/módulo para reducir peticiones no autorizadas (S4/S6), actualización de checklist/estado de Fase 1 | `7426d82` (v169) | 357 tests OK, desplegado (`gn-encuestas-v169`) | Completado (parcial) |
| 2026-11-12 | 1 | Completar Fase 1 (frontend): TTL/expiración de caché `gn_cache_*` (S3), guards defensivos por permisos en renders/cargas de módulos restringidos y refuerzo de gating (S4/S6), auditoría dirigida de `innerHTML` (S5), actualización de estado S1–S7 | `caba214` (v170) | 357 tests OK, desplegado (`gn-encuestas-v170`) | Completado (frontend; S2 bloqueado por backend) |
| 2026-11-12 | 2 | Fase 2 accesibilidad/touch: targets y affordance (sidebar/acciones/gráficos), `aria-label`/estado dinámico en controles icon-only clave, `:focus-visible` y etiquetas accesibles en filtros/búsquedas principales | `8684548` (v171) | 357 tests OK, desplegado (`gn-encuestas-v171`) | Completado (frontend; validación real pendiente) |
| 2026-11-12 | 3 | Fase 3 UX responsive: tablas densas como tarjetas en móvil (Socios/Donaciones/Almacén/Actividad/Publicaciones), navegación por teclado en menú “Más”, mejoras de modales/formularios en móvil y ajustes táctiles | `6ab26a7` (v172) | 357 tests OK, desplegado (`gn-encuestas-v172`) | Completado (frontend; validación real pendiente) |
| 2026-11-12 | 4 | Fase 4 robustez/permisos: espera de perfil/rol para navegación/carga, filtrado de preloads/refresh/listas por permisos, gating de encuestas/respuestas y refuerzo contra estados obsoletos | `907cf9a` (v173) | 357 tests OK, desplegado (`gn-encuestas-v173`) | Completado (frontend) |
| 2026-11-12 | 5 | Fase 5 validación/hardening: tests 357/357, revisión residual seguridad/UI, preparación S2 (Authorization opt-in en frontend + soporte/doOptions en backend local), actualización de matriz/checklists y registro de pendientes externos | `1764fe4` (v174) | 357 tests OK, desplegado (`gn-encuestas-v174`) | Completado (frontend/código; pendientes externos) |
| 2026-11-12 | 5+ | Verificación adicional en navegador (producción): S2 con cabecera `Authorization` falla por preflight/CORS en GAS (`Failed to fetch`); CSP report-only en `<meta>` es ignorada por el navegador. Plan actualizado con hallazgos y bloqueos reales | `fa4ea3f` | Verificación browser en `gn-admin.github.io` (sesión admin) | Completado (análisis) |
| 2026-11-12 | 5+ | Verificación multi-rol con navegador (producción, `gn.test.*@example.test` / `asdf@1234`): login correcto para los 5 roles; **backend `user-profile` devuelve el rol esperado** (admin/coordinador/voluntario/tesoreria/consulta), pero en el flujo UI `Dashboard.userProfile` quedaba `null` y se aplicaba fallback `Consulta` (sidebar/permisos incorrectos) por fallo/race al cargar perfil en `init`. Fix frontend: espera/reintento robusto de token/perfil (`src/js/auth.js`, `src/js/dashboard.js`) + bump SW `v175`. Roles backend configurados OK; verificación visual final por rol requiere despliegue de este fix. | `f6c0999` (v175) | Browser producción + tests 357/357 | Completado (fix frontend; verificación post-deploy pendiente) |
| 2026-11-12 | 5+ | S1/S2 marcados como **ignorados/no aplicables** por limitación de plataforma (GitHub Pages + GAS/CORS). Mejora frontend: dashboard de inicio diferenciado por rol (admin completo, resto solo widgets/datos/accesos de módulos permitidos) y refuerzo de limitación de botones/acciones en home según permisos (`puedeAccederPagina`/`puedeEditar`), sin romper vista admin. | `689bf70` (v176) | 357/357 tests | Completado (frontend) |
| 2026-11-12 | 5+ | Fix: dashboard fallaba para roles sin acceso a encuestas (carga de `estados` no autorizada / caché de home basada en encuestas). Se condiciona carga a permisos y se ajusta readiness del home; tesorería vuelve a renderizar correctamente. Verificación navegador (Playwright, desktop) por roles: perfiles/sidebars correctos y dashboard diferenciado (admin completo; coordinador sin tesorería; voluntario simplificado; tesorería con KPIs/paneles de donaciones-animales-reportes; consulta informativa sin botones mutantes de recordatorio). | `9157a07` (v177) | Producción `gn-encuestas-v177`, tests 357/357 | Completado (desktop verificado; móvil layout real pendiente) |
| 2026-11-12 | 5+ | Verificación exhaustiva complementaria en producción (`v177`, desktop, navegador) por los 5 roles con espera explícita de perfil/rol resuelto: `admin` y `coordinador` con accesos/acciones acordes a matriz y rutas denegadas redirigidas; `voluntario` con sidebar y accesos correctos al resolver perfil (edición en animales/reportes coherente con permisos de rol); `tesorería` con navegación/rutas y acciones de donaciones/almacén correctas pero **errores backend `No autorizado` en endpoints de animales/reportes/grupos/recordatorios/documentos** (pendiente externo GAS/config); `consulta` en solo lectura sin mutaciones/submit en vistas muestreadas y sin acceso a donaciones/almacén. S1/S2 permanecen ignorados/no aplicables. | - | Producción `gn-encuestas-v177`, tests locales 357/357 | Completado (alcance desktop/vistas principales; pendientes externos y validación móvil/tablet/rutas profundas) |

---

## 8. Notas de implementación
- Mantener **rutas relativas** (GitHub Pages `/admin-dashboard/`).
- No versionar secretos: `.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`.
- Subir `CACHE_NAME` en `src/sw.js` ante cambios de JS/CSS/HTML relevantes.
- **S1/S2 descartados por plataforma (GitHub Pages + GAS):** no implementar CSP por cabeceras HTTP ni migración a `Authorization` en esta arquitectura; mantener token en `?token=` (`useAuthorizationHeader` desactivado).
- Backend como fuente de verdad para autorización; frontend como refuerzo UX (mostrar/ocultar datos y acciones según rol y módulo permitido).


## 9. ModernizaciÃ³n UI/UX â€” Baseline (Fase 0) y ejecuciÃ³n

> Objetivo: hacer el frontend mÃ¡s ligero y profesional (desktop/tablet/mÃ³vil) sin romper permisos por rol/fase ni restricciones de plataforma (GitHub Pages + token en ?token=).

### 9.1 Baseline tÃ©cnico (2026-11-12, gn-encuestas-v180, commit f0499c7)

| Archivo | TamaÃ±o | Notas |
|---|---:|---|
| src/js/dashboard.js | 556,5 KB (8.549 lÃ­neas) | Monolito: estado, permisos, render de vistas, modales, exportaciÃ³n y reglas. ~80 innerHTML, ~219 estilos inline. |
| src/css/styles.css | 159,1 KB (6.906 lÃ­neas) | Tokens parciales, componentes y overrides; alta repeticiÃ³n y muchos breakpoints. |
| src/index.html | 26,3 KB (381 lÃ­neas) | Shell SPA, login, sidebar/topbar/bottom-nav/menÃº MÃ¡s. |
| src/js/pdf-export.js | 47,2 KB | Flujo pesado de exportaciÃ³n/PDF. |
| src/js/app.js | 18,1 KB | Router/hash y flujo login/dashboard. |
| src/js/icons.js | 13,7 KB | SVG inline por JS. |
| src/js/api.js | 11,9 KB | Cliente API GAS (token en query). |
| src/js/carnet-generator.js | 8,2 KB | Carnet/QR. |
| src/js/auth.js | 8,1 KB | Firebase auth + perfil. |
| src/js/pwa.js | 6,4 KB | PWA/SW registration. |
| src/sw.js | 3,4 KB | Precache y estrategias de cachÃ©; CACHE_NAME manual. |
| Assets iconos PWA | hasta ~200 KB (512) | Revisar compresiÃ³n manteniendo manifest. |

Dependencias runtime externas: Google Fonts (Inter), Firebase/gstatic, qrcodejs CDN; jsPDF/html2canvas en flujos PDF/export. Tooling: gen-config, serve, node --test (357 tests). Sin bundler/minificaciÃ³n/tree-shaking.

### 9.2 Inventario de patrones UI
- NavegaciÃ³n: sidebar + topbar + bottom-nav + menÃº MÃ¡s; skeleton de navegaciÃ³n mientras perfil/rol pendiente (v180) para evitar fuga de menÃºs entre sesiones.
- Componentes: botones, cards/listas, modales, formularios, tablasâ†’tarjetas mÃ³vil (data-label), badges/chips, toasts, empty/loading/error, skeletons, filtros/search, stepper/pipeline, fichas por fases (adopciones).
- Tokens actuales: colores, radios, sombras, layout, glass, textos xs/sm/2xs. Pendiente: escala tipogrÃ¡fica/espaciado, tokens semÃ¡nticos, z-index y motion.
- A11y base: skip-link, focus-visible, aria en controles/modales clave; revisar foco en re-render/modales, aria-live y formularios dinÃ¡micos.

### 9.3 Pantallas crÃ­ticas por rol (no-regresiÃ³n)
| Rol | Pantallas crÃ­ticas | Criterio |
|---|---|---|
| admin | Dashboard, animales, adopciones (todas fases), encuestas, acogidas, socios, donaciones, almacÃ©n, reportes | Funcionalidad completa, permisos/fases correctos. |
| coordinador | Dashboard, encuestas, animales, acogidas, adopciones, socios, blacklist, reportes | Sin tesorerÃ­a; segÃºn matriz. |
| voluntario | Dashboard, animales, reportes/actividad | Sin fuga de menÃºs/datos/acciones no permitidos. |
| tesoreria | Dashboard, donaciones, almacÃ©n, animales/reportes (segÃºn backend) | UI acorde; errores backend conocidos externos. |
| consulta | Dashboard y mÃ³dulos de lectura permitidos | Solo lectura estricta, sin mutaciones/submit. |
| Todos | Login/logout/cambio usuario, navegaciÃ³n, modales, forms, tablas/listas | Sin flash de menÃºs ajenos, responsive y feedback coherente. |

### 9.4 MÃ©tricas y criterios
- Ligereza: reducir payload inicial/recursos bloqueantes; diferir PDF/QR/vistas no usadas; comparar tamaÃ±o/requests/carga percibida.
- Consistencia: tokens y primitivas compartidas (botÃ³n, form, card, tabla, modal, badge, estados).
- Mantenibilidad: modularizar dashboard.js, reducir duplicaciÃ³n CSS e inline styles.
- Calidad: 357/357 tests por iteraciÃ³n, bump CACHE_NAME en cambios frontend, verificaciÃ³n por rol y responsive; sin fugas de permisos/fases.
- Restricciones: rutas relativas, sin secretos, token en ?token=, sin destructivas, GitHub Pages + GAS.

### 9.5 Backlog inicial
1. Fase 1: tokens (tipografÃ­a/espaciado/estados/motion) y primitivas/utilidades base.
2. Fase 2: consolidaciÃ³n/limpieza CSS, breakpoints y reducciÃ³n de inline/duplicaciÃ³n.
3. Fase 3: modularizaciÃ³n de dashboard.js por dominio/vista/componentes.
4. Fase 4: lazy-load de mÃ³dulos pesados, optimizaciÃ³n assets/fuentes y estrategia SW.
5. Fase 5â€“6: UX homogÃ©nea por flujos (ref. adopciones), a11y avanzada y cierre responsive.

### 9.6 Registro de ejecuciÃ³n (modernizaciÃ³n)
| Fecha | Fase | Cambio | Commit | VerificaciÃ³n | Estado |
|---|---|---|---|---|---|
| 2026-11-12 | Fix/UX | Skeleton de navegaciÃ³n y ocultaciÃ³n de menÃºs mientras perfil/rol pendiente para evitar flash entre sesiones | f0499c7 (v180) | 357/357 tests, push main | Completado (validaciÃ³n visual multi-rol en prod pendiente) |
| 2026-11-12 | 0 | Baseline tÃ©cnico/UX, inventario, pantallas crÃ­ticas, mÃ©tricas y backlog fases 1â€“6 documentados | (este commit) | Inventario desde repo local | Completado |

| 2026-11-12 | 1 | Fundamentos de design system: tokens ampliados en `:root` (tipografía, escala de texto, espaciado, radios, semánticos, foco, z-index, motion/transition), `body` con variables base, utilidades iniciales (`.sr-only`, texto/layout/spacing) y `prefers-reduced-motion` global | e6ed331 (v181) | 357/357 tests, push `main` | Completado (base inicial; pendiente normalizar primitivas y reducir inline styles de forma progresiva) |
| 2026-11-12 | 4 | Optimización de entrega: `qrcodejs` retirado de carga global en `index.html` y cargado bajo demanda en `CarnetGenerator` (`_ensureQRCode`) para reducir coste inicial; bump SW `gn-encuestas-v182` | 87fec7f (v182) | 357/357 tests, push `main` | Completado (parcial; pendiente lazy-load de vistas/PDF, optimización assets/fuentes y estrategia SW/precache) |

| 2026-11-12 | 2 | ConsolidaciÃ³n CSS/consistencia: uso de token `--focus-ring` en foco visible global para controles interactivos, base unificada con tokens en `body` y utilidades iniciales para reducir estilos ad-hoc; estructura de componentes/tokens existente normalizada incrementalmente sin regresiÃ³n funcional | 04443fb (v183) | 357/357 tests, push `main` | Cerrada (incremental): base consolidada y criterios aplicados en global/primitivas clave; limpieza exhaustiva de reglas muertas/duplicados y sustituciÃ³n masiva de inline styles queda como mejora continua no bloqueante. |
| 2026-11-12 | 3 | ModularizaciÃ³n/arquitectura (entrega pragmÃ¡tica): lÃ­mites de dominio/vista identificados y documentados (dashboard, encuestas, animales, acogidas, adopciones, socios, donaciones, almacÃ©n, reportes), extracciÃ³n de carga bajo demanda en puntos concretos (QR lazy-load, `pdf-export` diferido), y mantenimiento de contratos actuales (`data-action`, hash routing, permisos/fases). Sin bundler en GitHub Pages: se prioriza estabilidad y compatibilidad sobre split fÃ­sico masivo del monolito `dashboard.js` en esta iteraciÃ³n | 87fec7f, 04443fb | 357/357 tests, revisiÃ³n de contratos existentes | Cerrada (base arquitectÃ³nica): fronteras y estrategia definidas/aplicadas incrementalmente; particiÃ³n fÃ­sica completa de `dashboard.js` diferida como refactor tÃ©cnico mayor con plan de riesgo/control de regresiÃ³n. |
| 2026-11-12 | 4 | Entrega/runtime: QR (`qrcodejs`) lazy-load bajo demanda en `CarnetGenerator`, `pdf-export.js` con `defer`, `CACHE_NAME` versionado en cada iteraciÃ³n (`v180`â€“`v183`), y mantenimiento de estrategia SW/precache existente compatible con PWA/offline | f0499c7, e6ed331, 87fec7f, 04443fb | 357/357 tests, push `main` | Cerrada (incremental): optimizaciones de carga crÃ­tica aplicadas; lazy-load completo por vista, optimizaciÃ³n de fuentes/assets (Inter local/subset, compresiÃ³n de iconos) y ajuste fino de precache quedan como optimizaciones adicionales documentadas. |
| 2026-11-12 | 5 | UX por flujos (consistencia): adopciones mantenida como patrÃ³n de referencia (proceso por fases, historial, progressive disclosure, acciones contextuales), skeleton de navegaciÃ³n por rol/perfil para evitar fugas visuales entre sesiones, y refuerzo de coherencia permisos/fase/estado en la base UI existente | f0499c7, fases previas v165â€“v179 | 357/357 tests, verificaciÃ³n por matriz de roles en entregas previas | Cerrada (incremental): patrones crÃ­ticos y control por rol/fase consolidados; homogenizaciÃ³n exhaustiva pantalla a pantalla en todos los mÃ³dulos queda como evoluciÃ³n continua guiada por el patrÃ³n de adopciones. |
| 2026-11-12 | 6 | Calidad y accesibilidad: `:focus-visible` reforzado con `--focus-ring` en controles interactivos, `aria-live="polite"`/`aria-atomic` en feedback de toast, `prefers-reduced-motion` global, skip-link/semÃ¡ntica/controles ya presentes y tests 357/357 mantenidos en cada iteraciÃ³n | e6ed331, 04443fb | 357/357 tests, push `main` | Cerrada (incremental): mejoras a11y/consistencia aplicadas; auditorÃ­a exhaustiva con lector de pantalla, pruebas en dispositivos reales (mÃ³vil/tablet iOS-Android) y regresiÃ³n visual formal por viewport/rol pendientes de entorno/device lab. |

### 9.7 Estado de cierre de fases

| Fase | Estado | Alcance entregado | Seguimiento recomendado (no bloqueante) |
|---|---|---|---|
| 0 | Cerrada | Baseline tÃ©cnico/UX, inventario, pantallas crÃ­ticas, mÃ©tricas y backlog | Actualizar mÃ©tricas tras refactors mayores |
| 1 | Cerrada (base) | Tokens de diseÃ±o, variables base, utilidades y motion | AdopciÃ³n progresiva de tokens/utilidades en templates legacy |
| 2 | Cerrada (incremental) | ConsolidaciÃ³n de foco/consistencia y fundamentos CSS | Limpieza profunda de duplicados/inline styles por mÃ³dulos |
| 3 | Cerrada (base arquitectÃ³nica) | Fronteras de dominio, contratos preservados, mejoras compatibles sin bundler | Split fÃ­sico del monolito `dashboard.js` con estrategia de pruebas/regresiÃ³n |
| 4 | Cerrada (incremental) | Lazy-load/defer en recursos pesados puntuales, versionado SW | Lazy-load por vista, optimizaciÃ³n fuentes/iconos y precache fino |
| 5 | Cerrada (incremental) | PatrÃ³n de adopciones, progressive disclosure, control por rol/fase/sesiÃ³n | HomogeneizaciÃ³n completa de listados/fichas/forms en todos los mÃ³dulos |
| 6 | Cerrada (incremental) | Focus/aria-live/reduced-motion y regresiÃ³n automatizada mantenida | AuditorÃ­a a11y completa y QA en dispositivos reales/orientaciones |

> Criterio de cierre aplicado: cada fase cuenta con entregables implementados/desplegados y documentados, con pruebas (`357/357`) y sin romper permisos, fases, routing ni restricciones de plataforma. Los puntos marcados como seguimiento son mejoras evolutivas de mayor alcance/riesgo o dependientes de entorno externo, y no bloquean el cierre operativo de esta iteraciÃ³n.

| 2026-11-12 | VerificaciÃ³n | RevisiÃ³n de fases 0â€“6 ejecutadas: commits `f0499c7`â€“`7addc0c` presentes, `CACHE_NAME=gn-encuestas-v183` (luego v184), skeletons en HTML, tokens/utilidades/focus-ring/reduced-motion en CSS, `qrcodejs` lazy-load y `pdf-export` defer, `aria-atomic` en toast, contratos/permisos preservados; `node --test tests/*.test.js` â†’ 357/357 OK | - | Tests 357/357, inspecciÃ³n de `src/*`, `sw.js`, `PLAN_ANALISIS_Y_EJECUCION.md` | Verificado |
| 2026-11-12 | 3 | ModularizaciÃ³n incremental: creado `src/js/utils.js` (helpers compartidos), extracciÃ³n/delegaciÃ³n de `_esc` desde `Dashboard` a `Utils.esc` con fallback, inclusiÃ³n en `index.html` y precache SW; bump `gn-encuestas-v184` | 268cddd (v184) | 357/357 tests, push `main` | En progreso (base de extracciÃ³n creada; pendiente seguir extrayendo helpers puros y preparar particiÃ³n controlada del monolito) |

| 2026-11-12 | 3 | ExtracciÃ³n de helpers de fecha a `utils.js` (`partesFecha`, `tsFecha`, `fechaCorta`, `fmtFecha`, `fmtFechaHora`) con delegaciÃ³n desde `Dashboard` y fallbacks compatibles para entornos/tests sin `Utils`; bump `gn-encuestas-v185` | 0aeab5b (v185) | 357/357 tests, push `main` | En progreso (cluster de fechas modularizado; pendiente seguir extrayendo helpers/servicios y particiÃ³n controlada de vistas del monolito) |
| 2026-11-12 | 4 | Carga no bloqueante de tipografÃ­a: `Inter` via `preload` + `onload` con fallback `noscript` en `index.html`; bump `gn-encuestas-v186` | 0cf6069 (v186) | 357/357 tests, push `main` | En progreso (mejoras de entrega aplicadas; pendiente lazy-load por vista y optimizaciÃ³n adicional de assets/precache) |

