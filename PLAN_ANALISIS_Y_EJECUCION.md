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
| S1 | Alta | CSP en `Content-Security-Policy-Report-Only` (no enforcement) | Pendiente | Endurecer y migrar a enforcement progresivo tras validación |
| S2 | Alta | Token API en query string `?token=` (GET/POST) | Bloqueado por backend | Migrar a `Authorization: Bearer` + preflight CORS cuando GAS lo soporte (B3) |
| S3 | Media | Datos sensibles/PII cacheados en `localStorage` (`gn_cache_*`) | Parcial (se limpia en logout/cambio) | Minimizar, TTL, segmentación por rol/módulo, endurecer en dispositivos compartidos |
| S4 | Media | Carreras auth/perfil en transiciones rápidas → UI/estado transitorio inconsistente | Pendiente | Gate de render por perfil, cancelación de requests, evitar cargas no autorizadas |
| S5 | Media | Uso extensivo de `innerHTML` (riesgo XSS si falta escape/sanitización) | Parcial (`_esc` usado en muchos casos) | Auditoría de sinks, sanitización donde aplique, preferir DOM APIs seguras |
| S6 | Media | Peticiones API potencialmente no autorizadas por rol en flujos/background | Pendiente | Condicionar cargas a `puedeAccederPagina/puedeEditar` y rol resuelto |
| S7 | Baja | `javascript:void(0)` en toggle de menú móvil | Pendiente | Reemplazar por `<button>` semántico |
| S8 | Baja | Dependencias externas (gstatic, jsdelivr, fonts) y superficie CSP | Pendiente | Revisar necesidad, SRI donde aplique, políticas estrictas |
| S9 | Info | `referrer: no-referrer`, `noindex`, HTTPS/HSTS (hosting) correctos | OK | Mantener |

### 3.2 Accesibilidad y UI/UX

| ID | Severidad | Hallazgo | Plataforma | Estado | Acción |
|---|---|---|---|---|---|
| U1 | Alta | Objetivos táctiles < 44px (botones 31–36px, iconos 36px, puntos gráfico 11px) | Móvil/Tablet | Pendiente | Aumentar tamaño/área táctil (min 44x44) |
| U2 | Alta | Botones icon-only sin etiqueta accesible suficiente (ej. editar/eliminar en blacklist) | Todas | Pendiente | Añadir `aria-label`/`title` descriptivos |
| U3 | Media | Inputs de búsqueda/filtro sin `<label>` asociado (solo placeholder) | Todas | Pendiente | Añadir `aria-label` o label visible/asociado |
| U4 | Media | Tablas con scroll horizontal en móvil (Socios, Donaciones) | Móvil | Pendiente | Vista tarjeta o columnas prioritarias en <=767px |
| U5 | Media | Menú “Más” móvil: semántica y foco mejorables | Móvil | Pendiente | Botón real, gestión de foco, cierre por Escape/overlay consistente |
| U6 | Media | Estados de carga/error transitorios y mensajes por carreras de sesión | Todas | Pendiente | Estados consistentes, gating por perfil, reintentos controlados |
| U7 | Baja | Sidebar colapsada: targets/densidad y affordance | Desktop/Tablet | Pendiente | Ajustar altura/touch, tooltips/foco |
| U8 | Baja | Feedback visual/foco en algunos controles (verificar `:focus-visible`) | Todas | Pendiente | Garantizar foco visible consistente |
| U9 | Baja | Validación visual responsive no realizada en dispositivos reales | Tablet/Móvil | Pendiente | Pruebas manuales en iOS/Android, portrait/landscape |
| U10 | Info | Modales con `role="dialog"`, `aria-modal`, `aria-labelledby` | Todas | OK | Mantener y verificar foco-trap/cierre |

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
- [x] Documentar estado desplegado (`v165`, commit), matriz de roles y rutas críticas.
- [ ] Definir checklist de smoke test por rol y por plataforma (desktop/tablet/móvil).
- [ ] (Opcional) Capturas/referencias de vistas clave para regresión visual.
- **Criterio de salida:** checklist y matriz listas para validar cada fase.

### Fase 1 — Seguridad frontend (impacto alto, sin romper contrato backend)
**Objetivo:** reducir superficie de riesgo en cliente sin requerir cambios incompatibles en GAS.
- [ ] **S1:** Revisar y endurecer CSP *report-only* (alinear con recursos reales: self, Firebase/gstatic, jsdelivr qrcode, Google Fonts, script.google.com, identitytoolkit). Preparar política de enforcement viable.
- [ ] **S3:** Revisar caché en `localStorage`: documentar datos sensibles, asegurar limpieza en logout/cambio de usuario, y añadir/ajustar TTL o minimización donde sea seguro.
- [ ] **S4/S6:** Endurecer flujo auth/perfil: no renderizar/cargar módulos no autorizados hasta resolver rol; evitar peticiones para páginas fuera de permisos; cancelar/ignorar respuestas obsoletas en cambios de sesión/ruta.
- [ ] **S5:** Auditoría dirigida de `innerHTML`/sinks en vistas de alto riesgo (datos de usuario/encuestas/notas) y corregir faltas de escape evidentes.
- [ ] **S7:** Cambiar toggle “Más” móvil a `<button>` con atributos ARIA correctos.
- **Archivos probables:** `src/index.html`, `src/js/api.js`, `src/js/auth.js`, `src/js/app.js`, `src/js/dashboard.js`, `src/sw.js`.
- **Criterio de salida:** sin regresiones de rol/permisos, tests `357+` OK, CSP mejor documentada/endurecida, menos errores por carreras/cargas no autorizadas.

### Fase 2 — Accesibilidad y objetivos táctiles
**Objetivo:** cumplir buenas prácticas de accesibilidad y usabilidad táctil.
- [ ] **U1:** Aumentar targets a >=44x44px (o 44px min-height/width con área táctil) para botones, icon-buttons, acciones de fila, controles de gráfico (hit-area).
- [ ] **U2:** Añadir `aria-label`/`title` a botones icon-only (editar, eliminar, cerrar, acciones contextuales).
- [ ] **U3:** Añadir `aria-label` o labels asociados a campos de búsqueda/filtros sin etiqueta.
- [ ] **U7/U8:** Mejorar foco visible (`:focus-visible`), estados hover/active y contraste donde aplique.
- [ ] Verificar orden de tabulación y cierre de modales (Escape, foco de retorno).
- **Archivos probables:** `src/css/styles.css`, `src/js/dashboard.js`, `src/index.html`.
- **Criterio de salida:** controles clave alcanzan target táctil recomendado; lectores/teclado pueden identificar acciones y campos.

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
| 2026-11-12 | 0 | Creación de plan de análisis y ejecución | - | Documento generado | En curso |

---

## 8. Notas de implementación
- Mantener **rutas relativas** (GitHub Pages `/admin-dashboard/`).
- No versionar secretos: `.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`.
- Subir `CACHE_NAME` en `src/sw.js` ante cambios de JS/CSS/HTML relevantes.
- Token API en query hasta soporte backend de preflight/Authorization.
- Backend como fuente de verdad para autorización; frontend como refuerzo UX.
