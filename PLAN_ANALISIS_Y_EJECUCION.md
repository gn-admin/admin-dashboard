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
- **UI/UX móvil/tablet:** objetivos táctiles pequeños en acciones/iconos (31–36px) y gráficos (11px), campos de búsqueda/filtro sin etiqueta accesible explícita, botones icon-only sin `aria-label` en algunos contextos, tablas con scroll horizontal (mejorables a tarjetas en móvil), y toggle “Más” implementado como `<a href="javascript:void(0)">`.
- **UI/UX desktop:** base funcional correcta; oportunidades en accesibilidad (foco, etiquetas, targets), densidad de tablas y consistencia de estados.
- **Roles/permisos:** funcionamiento correcto en sesiones limpias (menú, rutas, acciones por módulo/rol). Riesgo residual de estados transitorios por carreras de sesión/perfil.

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
| S1 | Alta | CSP en `Content-Security-Policy-Report-Only` (no enforcement) | Parcial (no efectiva en `<meta>`) | Política endurecida en `src/index.html`, pero verificación en navegador mostró que **CSP Report-Only entregada vía `<meta>` es ignorada** por el navegador. Para que tenga efecto real se requiere entregarla por cabecera HTTP (o CSP enforcing por cabecera) en el hosting/CDN; enforcement/meta-only no es suficiente. |
| S2 | Alta | Token API en query string `?token=` (GET/POST) | Bloqueado por backend | Migrar a `Authorization: Bearer` + preflight CORS cuando GAS lo soporte (B3). No abordable en frontend sin romper contrato. |
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
- [~] **S1:** CSP endurecida/alineada en código, pero **CSP Report-Only en `<meta>` es ignorada por el navegador** (verificado en producción). Requiere cabeceras HTTP en hosting/CDN para reportes/enforcement efectivos.
- [~] **S2:** **Bloqueado por backend/CORS (GAS)** — token sigue en `?token=`; migración a `Authorization: Bearer` + preflight requiere despliegue coordinado.
- [x] **S3:** Caché API con TTL (7 días), migración compatible de formato legacy y limpieza en logout/cambio de usuario.
- [x] **S4/S6:** Guards sin sesión, gating por permisos/módulo en dashboard y renders/cargas defensivas, y descarte por contexto/token para evitar aplicar estados obsoletos en navegación rápida.
- [x] **S5:** Auditoría dirigida de sinks `innerHTML` en áreas de riesgo (usuarios/encuestas/notas/motivos) sin hallazgos evidentes sin escape en la pasada realizada; mantener vigilancia en cambios futuros.
- [x] **S7:** Toggle “Más” móvil como `<button>` semántico con ARIA y foco.
- **Archivos modificados (fase):** `src/index.html`, `src/js/app.js`, `src/js/dashboard.js`, `src/css/styles.css`, `src/sw.js`, `PLAN_ANALISIS_Y_EJECUCION.md`.
- **Criterio de salida:** alcanzado en alcance frontend (S2 bloqueado por backend). Sin regresiones conocidas en tests (`357/357`), menos cargas no autorizadas/races visibles y caché con expiración.

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
- [~] `admin`: backend `user-profile` devuelve `admin` (verificado en producción 2026-11-12 con `gn.test.admin`). UI mostraba fallback `Consulta` por bug de carga de perfil en `init`; fix aplicado en `v175` (pendiente verificación post-deploy en producción).
- [~] `coordinador`: backend devuelve `coordinador` (verificado en producción). Misma incidencia de UI/fallback corregida en `v175`; pendiente verificación post-deploy.
- [~] `voluntario`: backend devuelve `voluntario` (verificado en producción). Misma incidencia corregida en `v175`; pendiente verificación post-deploy.
- [~] `tesoreria`: backend devuelve `tesoreria` (verificado en producción). Misma incidencia corregida en `v175`; pendiente verificación post-deploy.
- [~] `consulta`: backend devuelve `consulta` y fallback/solo lectura coherentes (verificado en producción). Pendiente smoke final multi-dispositivo.

### 5.2 Por plataforma
- [~] **Desktop:** mejoras de accesibilidad/foco/targets y comportamiento por rol implementadas (validación visual final recomendada)
- [ ] **Tablet:** ajustes responsive aplicados; **validación en dispositivo real pendiente** (768–1023px, orientación, teclado)
- [~] **Móvil:** bottom-nav/menú “Más”, targets táctiles, tablas→tarjetas y modales/formularios mejorados en código; **validación en dispositivo real pendiente**

### 5.3 Seguridad/estabilidad
- [~] Token sigue en query por restricción CORS/GAS (S2); frontend preparado para `Authorization` opt-in y backend acepta ambos formatos (pendiente despliegue/config CORS en GAS para migrar)
- [x] Sin acciones mutantes visibles para roles sin permiso (refuerzo UI) y cargas/gating condicionados por permisos en frontend
- [~] Reducción de peticiones/carreras no autorizadas y estados obsoletos (guards, perfil/rol, tokens de página); verificación exhaustiva en sesiones reales multirol pendiente
- [x] Caché `gn_cache_*` con TTL y limpieza en logout/cambio de usuario
- [x] CSP/meta revisadas y endurecidas en modo report-only; enforcement y validación final de reportes pendientes de entorno/operación

---

## 6. Dependencias y bloqueos / acciones fuera del frontend
- **S2/B3 (token fuera de query + preflight CORS):** aplicado en código/local workspace, **bloqueado por plataforma GAS/CORS**
  - Frontend: `src/js/api.js` preparado para enviar `Authorization: Bearer` cuando `CONFIG.useAuthorizationHeader=true` (mantiene token en query por compatibilidad). Por defecto desactivado para no romper producción con preflight GAS.
  - Backend (local, no versionado): `apps-script/Code.gs` ya acepta token en `Authorization` o query (`extractToken`) y se añadió `doOptions` best-effort. Usuario indicó que subió `Code.gs`.
  - **Verificación (2026-11-12, navegador/producción):** petición cross-origin con cabecera `Authorization` falla en navegador (`Failed to fetch`) por preflight/CORS incompatible con Apps Script Web Apps. **Conclusión:** no es viable completar S2 en esta arquitectura sin un proxy/backend que controle cabeceras CORS/preflight. Mantener token en query y no habilitar `useAuthorizationHeader` en producción.
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
| 2026-11-12 | 5+ | Verificación multi-rol con navegador (producción, `gn.test.*@example.test` / `asdf@1234`): login correcto para los 5 roles; **backend `user-profile` devuelve el rol esperado** (admin/coordinador/voluntario/tesoreria/consulta), pero en el flujo UI `Dashboard.userProfile` quedaba `null` y se aplicaba fallback `Consulta` (sidebar/permisos incorrectos) por fallo/race al cargar perfil en `init`. Fix frontend: espera/reintento robusto de token/perfil (`src/js/auth.js`, `src/js/dashboard.js`) + bump SW `v175`. Roles backend configurados OK; verificación visual final por rol requiere despliegue de este fix. | Pendiente commit | Browser producción + tests 357/357 | Completado (fix frontend; verificación post-deploy pendiente) |

---

## 8. Notas de implementación
- Mantener **rutas relativas** (GitHub Pages `/admin-dashboard/`).
- No versionar secretos: `.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`.
- Subir `CACHE_NAME` en `src/sw.js` ante cambios de JS/CSS/HTML relevantes.
- Token API en query hasta soporte backend de preflight/Authorization.
- Backend como fuente de verdad para autorización; frontend como refuerzo UX.
