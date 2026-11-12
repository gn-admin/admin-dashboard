# Plan de Análisis y Ejecución: UI/UX y Seguridad (Desktop, Tablet, Móvil)

**Proyecto:** GN-Encuestas / Admin Dashboard (Grupo Nebak)  
**Fecha:** 2026-11-12  
**Versión base analizada:** producción `v165` (commit `01617fe`)  
**Estado:** en ejecución

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
| S1 | Alta | CSP en `Content-Security-Policy-Report-Only` (no enforcement) | Completado (frontend) | Endurecida/alineada en report-only con recursos reales usados (`self`, Firebase/Google APIs, jsdelivr, fonts, `blob:`, `form-action`, `base-uri`, `object-src 'none'`, `upgrade-insecure-requests`). Paso a enforcement diferido a validación de reportes/CSP en producción. |
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
| U4 | Media | Tablas con scroll horizontal en móvil (Socios, Donaciones) | Móvil | Parcial | `data-label` + vista en tarjetas CSS para tablas en `<=767px` (Socios/Donaciones); extender a otras tablas densas (Fase 3). |
| U5 | Media | Menú “Más” móvil: semántica y foco mejorables | Móvil | Parcial | Botón real, `aria-expanded`, foco al primer ítem al abrir y retorno/cierre con Escape; pulir navegación por teclado interna y casos de foco avanzados (Fase 3). |
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
- [x] **S1:** CSP *report-only* endurecida y alineada con recursos reales. Enforcement progresivo diferido a validación de reportes (sin cambios backend).
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
- [ ] **U4:** Tablas en móvil: patrón responsive (tarjetas, columnas prioritarias o scroll mejor señalizado) para Socios/Donaciones y otras tablas densas.
- [ ] **U5:** Menú “Más”: comportamiento robusto (apertura/cierre, overlay, foco, `aria-expanded`, cierre al navegar).
- [ ] Modales/formularios: asegurar scroll interno, acciones visibles con teclado virtual, y tamaños adecuados en 360–767px.
- [ ] Gráficos/listas: mejorar interacción táctil (hit-area, alternativas de lectura).
- [ ] Ajustes específicos tablet (768–1023px): grillas, densidad, orientación.
- **Archivos probables:** `src/css/styles.css`, `src/js/dashboard.js`, `src/index.html`, `src/js/app.js`.
- **Criterio de salida:** flujos principales utilizables sin zoom/scroll horizontal accidental y con navegación clara en móvil/tablet.

### Fase 4 — Robustez, rendimiento y permisos (refuerzo)
**Objetivo:** estabilidad y consistencia percibida.
- [ ] Evitar errores “No hay usuario autenticado” por transiciones: sincronización auth+perfil.
- [ ] Revisar que widgets/dashboard no pidan datos de módulos no permitidos para el rol.
- [ ] Optimizar renders/listas largas si hay impacto (paginación, carga diferida) — solo si se detecta necesidad.
- [ ] Mensajes de error/estado vacíos claros y accionables.
- **Criterio de salida:** navegación entre roles/sesiones limpias sin errores transitorios visibles; sin llamadas innecesarias denegadas.

### Fase 5 — Validación final y hardening
**Objetivo:** cierre verificado.
- [ ] Ejecutar suite de tests (`node --test tests/*.test.js`).
- [ ] Pruebas por rol en desktop/tablet/móvil (manual en dispositivos reales recomendado): menú, rutas, acciones, formularios, modales, exportaciones.
- [ ] Revisión de seguridad residual (CSP, almacenamiento, XSS, permisos).
- [ ] Actualizar `src/sw.js` (`CACHE_NAME`) en cada despliegue con cambios frontend.
- [ ] Commit/push y verificación en producción.
- **Criterio de salida:** matriz de verificación completa, sin regresiones conocidas, mejoras desplegadas.

---

## 5. Matriz de verificación (checklist)

### 5.1 Por rol (cada plataforma)
- [ ] `admin`: acceso total, acciones de gestión visibles, donaciones/almacén accesibles
- [ ] `coordinador`: operativo sin donaciones/almacén, mutaciones permitidas por módulo
- [ ] `voluntario`: solo módulos permitidos, mutaciones/lectura según política
- [ ] `tesoreria`: donaciones/almacén/animales/reportes según permisos
- [ ] `consulta`: **solo lectura** estricta, sin crear/editar/eliminar/guardar

### 5.2 Por plataforma
- [ ] **Desktop:** sidebar, tablas, modales, formularios, foco teclado
- [ ] **Tablet:** layout intermedio, touch, orientación, modales con teclado
- [ ] **Móvil:** bottom-nav, menú “Más”, targets táctiles, formularios (teclado), tablas/tarjetas, modales full/scroll

### 5.3 Seguridad/estabilidad
- [ ] Sin token en rutas expuestas innecesariamente; comportamiento de auth correcto
- [ ] Sin acciones mutantes visibles para roles sin permiso
- [ ] Sin errores de carga por peticiones no autorizadas en flujo normal
- [ ] Caché limpiada en logout/cambio de usuario
- [ ] CSP y cabeceras/meta revisadas

---

## 6. Dependencias y bloqueos
- **S2/B3 (token fuera de query + preflight CORS):** requiere cambios y despliegue coordinado en `apps-script/Code.gs`/config GAS.
- **Auditoría/configuración backend** (códigos HTTP, paginación, versionado, auditoría efectiva, IDs): fuera del alcance exclusivo frontend.
- **Pruebas en dispositivos reales:** requieren acceso a móviles/tablets físicos o infraestructura de device lab.

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
| 2026-11-12 | 2 | Fase 2 accesibilidad/touch: targets y affordance (sidebar/acciones/gráficos), `aria-label`/estado dinámico en controles icon-only clave, `:focus-visible` y etiquetas accesibles en filtros/búsquedas principales | Pendiente commit (v171) | `node --test tests/*.test.js` en curso | En ejecución |

---

## 8. Notas de implementación
- Mantener **rutas relativas** (GitHub Pages `/admin-dashboard/`).
- No versionar secretos: `.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`.
- Subir `CACHE_NAME` en `src/sw.js` ante cambios de JS/CSS/HTML relevantes.
- Token API en query hasta soporte backend de preflight/Authorization.
- Backend como fuente de verdad para autorización; frontend como refuerzo UX.
