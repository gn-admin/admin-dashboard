# Plan de Modernización UI/UX — Admin Dashboard (Grupo Nebak)

**Proyecto:** GN-Encuestas / Admin Dashboard  
**Última actualización:** 2026-11-12  
**Rama/producción:** `main` (hasta `a94ab91`, `gn-encuestas-v188`)  
**Objetivo:** modernizar la interfaz y experiencia de usuario para que sea más ligera, clara, consistente y profesional en **desktop, tablet y móvil**, sin romper permisos por rol/fase, flujos existentes ni restricciones de plataforma.

---

## 1. Contexto y restricciones (a respetar)

- **Stack:** SPA vanilla (`src/index.html`, `src/css/styles.css`, `src/js/*.js`, `src/sw.js`) servida en GitHub Pages bajo `/admin-dashboard/` (rutas relativas obligatorias).
- **Backend:** Google Apps Script (Web App). **Token API solo en `?token=`** (`useAuthorizationHeader` desactivado); no migrar a `Authorization`/preflight. CSP por cabeceras HTTP no aplicable en GitHub Pages (mantener `<meta>` CSP como referencia).
- **Permisos/roles:** backend fuente de verdad; fallback seguro `consulta`. La UI debe mostrar solo datos, menús y acciones manejables por rol, fase y estado (consulta en solo lectura). Evitar fugas/flash de menús entre sesiones/roles.
- **Calidad operativa:** `node --test tests/*.test.js` en verde en cada iteración; subir `CACHE_NAME` en `src/sw.js` ante cambios frontend relevantes; no versionar secretos (`.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`, `apps-script.zip`); no ejecutar acciones destructivas en producción.

---

## 2. Estado real actual (verificado)

**Pruebas:** 357/357 OK.  
**Base técnica:** `src/js/dashboard.js` ~8567 líneas (monolito), `src/css/styles.css` ~7024 líneas, `src/js/utils.js` 99 líneas, dependencias runtime externas (Google Fonts/Inter, Firebase/gstatic, qrcodejs bajo demanda), sin bundler/minificación.

| Fase | Estado real | Entregado y verificado | Pendiente para completar la fase |
|---|---|---|---|
| **0. Baseline UI/UX** | Completada | Inventario de pantallas/patrones/componentes/tokens, tamaños y dependencias, métricas/criterios, pantallas críticas por rol y backlog. | Mantener métricas actualizadas. |
| **1. Design system (fundamentos visuales)** | Parcial (base) | Tokens en `:root` (color, tipografía, espaciado, radios, sombras, semánticos, foco, z-index, motion), `body` con variables, utilidades base (`.sr-only`, flex/gap/spacing/texto), `prefers-reduced-motion` global. | Normalizar primitivas (`btn`, inputs/forms, cards, tablas, modales, badges/chips, estados, empty/skeleton/toast) para consumir tokens de forma consistente y reducir estilos inline/valores ad-hoc en todas las vistas. |
| **2. Arquitectura y consistencia CSS** | Parcial | Foco visible global reforzado con `--focus-ring`; utilidades/tokens disponibles. | Limpieza profunda: consolidar capas/breakpoints, eliminar duplicados/overrides, reducir especificidad frágil y reemplazar estilos inline repetidos en templates por clases/utilidades coherentes. |
| **3. Modularización y mantenibilidad UI** | Parcial (inicio) | `src/js/utils.js` extraído e integrado (precache + carga) con delegación/fallback: `esc`, `partesFecha`, `tsFecha`, `fechaCorta`, `fmtFecha`, `fmtFechaHora`, `tipoLogLabel`, `tipoLogCls`, `euros`. Contratos preservados. | Extraer más helpers/componentes/lógica de presentación y particionar progresivamente el monolito `dashboard.js` por dominio/vista para facilitar evolución UI, reducir re-renders y aislar cambios visuales (sin romper `data-action`, hash, permisos/fases). |
| **4. Ligereza y rendimiento percibido** | Parcial | `qrcodejs` lazy-load bajo demanda, `pdf-export.js` `defer`, `Inter` no bloqueante (`preload`+`onload`), versionado de `CACHE_NAME` (`v180`–`v188`). | Lazy-load/diferir recursos pesados por vista/flujo cuando sea seguro, optimizar assets (iconos PWA), revisar estrategia de precache/SW y reducir trabajo de render inicial en móvil. |
| **5. Modernización UX por flujos y pantallas** | Parcial | Patrón de adopciones como referencia (proceso por fases, historial, acciones contextuales, progressive disclosure); skeleton de navegación mientras resuelve perfil/rol (evita flash entre sesiones). | Homogeneizar listados, fichas detalle, formularios, filtros/búsqueda, estados vacío/carga/error y feedback en **todos** los módulos (encuestas, animales, acogidas, socios, donaciones, almacén, reportes) con jerarquía visual clara, acciones contextuales y comportamiento coherente en desktop/tablet/móvil. |
| **6. Accesibilidad, responsive y pulido** | Parcial | Skip-link/semántica base, `:focus-visible` reforzado, toast con `aria-live`/`aria-atomic`, `prefers-reduced-motion`, mejoras previas de aria/targets. | Auditoría y corrección integral: foco en modales/re-renders, teclado en componentes compuestos, nombres/errores de formulario, contraste en todos los estados, targets táctiles y QA responsive por rol/viewport/orientación (dispositivos reales pendiente). |

---

## 3. Plan de ejecución UI/UX (enfoque y entregables)

> Prioridad: impacto visual/UX y consistencia percibida por el usuario, manteniendo estabilidad funcional.

### Fase 1 — Sistema visual coherente (UI)
- Definir y aplicar escala tipográfica, espaciado, radios, sombras y estados (hover/focus/active/disabled/loading) mediante tokens.
- Unificar primitivas: botones, campos, selects, textareas, cards, tablas, modales, badges/chips, alertas/toasts, empty/skeleton.
- Reducir estilos inline en vistas reutilizando clases/utilidades.

### Fase 2 — Layout, CSS y consistencia (UI)
- Consolidar estilos por capas y breakpoints (desktop/tablet/móvil) con comportamiento predecible.
- Limpiar duplicados/overrides, normalizar contenedores, densidad, alineación e iconografía.
- Asegurar que la navegación y los patrones comunes se vean y comporten igual en todos los módulos.

### Fase 3 — Estructura para iterar UI (soporte UX)
- Extraer helpers/componentes y separar vistas del monolito para poder modernizar pantallas sin regresiones masivas.
- Mantener contratos existentes y permisos/fases.

### Fase 4 — Ligereza y respuesta (UX percibida)
- Carga diferida de recursos pesados por flujo, optimización de assets/fuentes y mejoras de caché/SW.
- Evitar re-renders innecesarios; preservar foco/scroll/estado en interacciones.

### Fase 5 — Experiencia por pantallas (UX)
- Aplicar patrón de ficha/listado guiado (referencia adopciones): resumen claro, detalle progresivo, acciones primarias/secundarias contextuales, feedback y estados explícitos.
- Homogeneizar filtros, formularios, confirmaciones y mensajes en todos los módulos, adaptado a desktop y móvil.

### Fase 6 — Accesibilidad y pulido final (UX)
- Corregir foco/teclado/ARIA/contraste/targets en flujos reales.
- QA por rol y por viewport (incl. tablet/móvil/orientaciones), con checklist de no-regresión visual y funcional.

---

## 4. Checklist de calidad UI/UX (por iteración)

- [ ] Tests `357/357` en verde.
- [ ] `CACHE_NAME` incrementado si hay cambios frontend.
- [ ] Sin regresión de permisos por rol/fase/estado (menús, rutas, acciones y datos).
- [ ] Jerarquía visual clara (títulos, secciones, acciones primarias vs secundarias).
- [ ] Consistencia de componentes y espaciado en la pantalla modificada.
- [ ] Estados cubiertos: carga, vacío, error, éxito, deshabilitado.
- [ ] Responsive correcto en desktop, tablet y móvil (sin overflow, controles utilizables).
- [ ] Accesibilidad básica: foco visible, teclado, etiquetas/nombres accesibles, contraste adecuado.

---

## 5. Registro de ejecución (UI/UX)

| Fecha | Fase | Cambio | Commit | Verificación | Estado |
|---|---|---|---|---|---|
| 2026-11-12 | 0 | Baseline UI/UX, inventario, métricas y backlog documentados | `565be1d` | Inventario en repo | Completada |
| 2026-11-12 | 5/UX seguridad | Skeleton de navegación y ocultación de menús mientras perfil/rol pendiente (evita flash entre sesiones/roles) | `f0499c7` (`v180`) | 357/357, push | Completada (entregable) |
| 2026-11-12 | 1 | Tokens base, `body` con variables, utilidades, `prefers-reduced-motion` global | `e6ed331` (`v181`) | 357/357, push | Parcial (base) |
| 2026-11-12 | 4 | `qrcodejs` lazy-load bajo demanda (carnet) | `87fec7f` (`v182`) | 357/357, push | Parcial |
| 2026-11-12 | 2/6 | Foco visible con `--focus-ring`, toast `aria-live`+`aria-atomic` | `04443fb` (`v183`) | 357/357, push | Parcial |
| 2026-11-12 | 3 | `utils.js` + delegación `_esc` con fallback | `268cddd` (`v184`) | 357/357, push | Parcial (inicio) |
| 2026-11-12 | 3 | Extracción helpers de fecha a `utils.js` + fallbacks compatibles (fix tras fallo de tests, revalidado) | `0aeab5b` (`v185`) | 357/357, push | Parcial |
| 2026-11-12 | 4 | Carga no bloqueante de `Inter` (`preload`+`onload`+`noscript`) | `0cf6069` (`v186`) | 357/357, push | Parcial |
| 2026-11-12 | 3 | Extracción helpers de log a `utils.js` + fallback corregido (revalidado) | `92ee35c` (`v187`) | 357/357, push | Parcial |
| 2026-11-12 | 3 | Extracción `_euros` a `utils.js` | `75ce35f` (`v188`) | 357/357, push | Parcial |
| 2026-11-12 | Docs | Verificación de fases, corrección de estado real y limpieza/enfoque del plan en UI/UX | (este commit) | 357/357 | Actualizado |

---

## 6. Pendientes externos / bloqueos de entorno

- **Backend GAS:** permisos de `tesorería` en endpoints (`animales/reportes/grupos/recordatorios/documentos`) según configuración desplegada.
- **Validación real:** pruebas en dispositivos físicos (móvil/tablet, iOS/Android, orientaciones) y auditoría a11y con lector de pantalla.
- **Plataforma:** S1/S2 no aplicables (GitHub Pages + GAS/CORS); no bloquean la modernización UI/UX.
