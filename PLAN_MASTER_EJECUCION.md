# Plan maestro de ejecución — revisión de planes y estrategia óptima

> **Objetivo:** revisar el estado real de todos los planes del proyecto y definir una estrategia óptima y priorizada para ejecutar lo que queda pendiente.
> **Fecha de revisión:** 2026-11-15
> **Fuentes revisadas:** `GESTOR_WEB_PLAN_Y_ENDPOINTS.md`, `memory.md`, `PLAN_SEGURIDAD.md`, `PLAN_ANALISIS_Y_EJECUCION.md`, `AGENTS.md`, `PROGRESO.md`, `.internal-docs/GESTOR_WEB_OPERATIVA.md` y consolidados de `.internal-docs/`.
> **Alcance:** este plan maestro coordina trabajo en **este repositorio**, **backend externo (Apps Script/Sheets)**, **Firebase/GitHub/operación** y **proyecto web externo** (`proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`), sin mezclar su ejecución.

---

## 1. Revisión de planes y estado actual

### 1.1 Gestor web + endpoints públicos (`GESTOR_WEB_PLAN_Y_ENDPOINTS.md`, `memory.md`)
**Estado:** muy avanzado; el flujo gestor → canal público → visor de referencia funciona de punta a punta en este proyecto.

| Área | Estado | Entregado | Pendiente |
|---|---|---|---|
| F0 Contratos/modelo | ✅ Cerrada | Hoja única `WebPublicaciones`, taxonomía `animal|evento|historia`, slug único por tipo, estados/flags, payload `Publicacion` normalizado (`preview == feed`), alias `/api` y `/v1`, JSONP, `forms/submit` fuera de alcance | — |
| F1 Backend gestor (GAS) | ✅ Implementado y desplegado | `WebPublicaciones.gs`/`Code.gs` (rutas, permisos, canal), validaciones, slug/completitud, endpoints gestor y públicos, pruebas | Lote D1/C1/auditoría de borrado subido y desplegado (2026-11-15). `retirado`/`gone`/`?endpoint=retiradas` activos y verificados. Mantener `ROLES_USUARIOS`/`ADMIN_EMAILS` completos en el entorno desplegado. |
| F2 UI Gestor web (admin) | ✅ Implementado | Sección “Web/Contenido público”, alta guiada, curación animal/evento/historia, preview, slug-check, resumen, integración en ficha, permisos UI, estilos, `web.js`/`api.js`/rutas/SW | Revisión visual final en Pages/uso real tras despliegues; mejoras evolutivas menores si surgen |
| F3 Canal público | ✅ Implementado | `/api/publicaciones`, detalle por slug, alias `/v1/*`, `config/taxonomias/sitemap/redirects/retiradas`, filtros/paginación/búsqueda, cache interna, 404/301/410 lógico, JSONP | **Verificado en producción** (canal sin token, `gone`/`retiradas`, cache ~60 s; prerender usa `nocache=1`). |
| F4 Integración web + SEO de publicaciones | ✅ Cerrada en este proyecto / ➡️ externa en web real | Visor `publico.html` con tema, canónica única a estática, metas/OG/JSON-LD, prerender `scripts/prerender-publico.js`, `publicaciones/<slug>.html`, `sitemap.xml`, `robots.txt`, páginas de retirada `noindex`, guarda de deploy, cron diario, fixtures/tests (508 verdes) | **Port a `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`** (consumo del canal, metas/JSON-LD/redirects 301, 410 real/retiradas, rutas canónicas en dominio propio) — tarea del otro proyecto usando este contrato como referencia |
| F5 Ajustes/calidad/operación | 🟡 Parcial | Completitud, consistencia preview↔público, cache/paginación, diagnóstico hoja/pestaña, historial de slug+301, retirada/410+l�pida, páginas de retirada, recuentos, docs operativa interna | Dominio propio + Search Console + sitemap en raíz; indexación/auditoría real; convertir aviso de retiradas en error si falla tras desplegar; **restaurar/salida de retirada** desde panel y auditoría de quién retira (propuesto); fixtures adicionales (301, oculta) y validación JSON-LD/canónica única |
| §7.3 Ficha configurable / media | 🟡 Parcial (media hecha, configuración pendiente) | Media por ficha en Drive (`animales|eventos|historias/<slug>`), `web-media-subir`, normalización enlaces, galería `url|alt|pie`, documentos privados, límites/tipos; análisis y contrato aditivo v1.1 planificado | **No implementado:** ficha configurable (`ficha_json`/plantilla/bloques/iconos/tags/CTA kind/salud curada/campos animal extra), decisiones abiertas (vídeo embebido vs enlace+CSP/cookies, catálogo iconos compartido, saneado HTML, orden bloques, tags retrocompatibles) |

**Pendientes manuales clave (gestor web):** desplegar `Code.gs`+`WebPublicaciones.gs` (desbloquea `gone`/`retiradas`), verificar canal/flujo en producción, dominio propio y Search Console, portar SEO/consumo al proyecto web real.

### 1.2 Seguridad (`PLAN_SEGURIDAD.md`, consolidado)
**Estado:** ~66% estimado alcanzado (en repo); objetivo 80–85%.

| Hito | Estado | Detalle |
|---|---|---|
| 1.1 Autorización por endpoint en GAS + `sin_acceso` para no reconocidos (normalizar email) | ⏳ Externo, crítico | No verificable/aplicable en repo; frontend ya preparado para `sin_acceso` |
| 1.2 `sin_acceso` y bloqueo UI/cargas en frontend | 🟡 Parcial en repo (~61% registrado) | Rol y pantalla/bloqueos añadidos; depende de 1.1 para efectividad real |
| 1.3 Higiene Roles/cuentas | ⏳ Operativo externo | Depuración hoja Roles, mínimo privilegio, reflejo tras re-login |
| 2.1 Firebase login endurecido (MFA admins, reCAPTCHA/App Check si aplica) | ⏳ Externo (Firebase) | No iniciado según plan |
| 2.2 Token API (rotación, mínima exposición, sin logs con `?token=`) | ⏳ Externo/operativo | Procedimiento y revisión; limitación estructural `?token=` |
| 3.1 Minimizar/limpiar caché cliente | 🟡 Avanzado en repo (~64–66%) | Limpieza logout/cambio, restricciones por permisos, `responses/notas` solo en memoria; ajustes finos SW/cobertura posibles |
| 3.2 Hardening frontend (CSP enforcement en meta, Permissions-Policy, errores/deps) | 🟡 Parcial en repo (~66%) | Hecho dentro de límites GitHub Pages; verificación producción recomendada |
| 4.1 Canal público separado de solo lectura | 🟡 Avance funcional importante / pendiente endurecimiento | El canal público del gestor web existe y separa consumo; falta revisión de lista blanca/CORS/dominio y alinearlo al criterio de seguridad definitivo |
| 5.1 Auditoría/historial operativos en GAS/hojas | ⏳ Externo a verificar | Cabeceras/código existen en líneas generales; validar en producción (auditoría, historial fases) |
| 5.2 Pruebas por rol, revisión periódica y respuesta a incidentes | ⏳ Operativo | Checklist y procedimiento pendientes de formalizar/ejecutar |

### 1.3 Modernización UI/UX (`PLAN_ANALISIS_Y_EJECUCION.md`)
**Estado:** avance sustancial implementado y desplegado (según plan), con trabajo evolutivo pendiente.

| Fase | Estado | Entregado (según plan) | Pendiente |
|---|---|---|---|
| 0 Baseline | ✅ | Inventario, métricas/backlog | Mantener actualizado |
| 1 Design system | 🟡 Base | Tokens/utilidades/reduced-motion/primitivas mejoradas | Normalizar primitivas en todas las vistas, reducir inline/ad-hoc |
| 2 CSS/consistencia | 🟡 | Foco/utilidades/capas parciales | Limpieza profunda, duplicados/overrides/especificidad, breakpoints consolidados |
| 3 Modularización | 🟡 Inicio | `utils.js` extraído (varios helpers) | Extraer más y particionar progresivamente `dashboard.js` sin romper contratos/permisos |
| 4 Rendimiento percibido | 🟡 | Lazy/defer/fuentes no bloqueantes, SW versionado | Lazy por vista/flujo, assets, precache/SW, render inicial móvil |
| 5 UX por pantallas | 🟡 | Patrón adopciones, skeleton navegación | Homogeneizar todos los módulos (listados/fichas/formularios/filtros/estados) |
| 6 A11y/responsive/pulido | 🟡 | Mejoras base (foco, aria-live, reduced-motion) | Auditoría integral, foco/teclado/ARIA/contraste/targets, QA real por rol/viewport |

> Nota: el plan registra métricas antiguas (357/470 tests en distintas filas) frente al estado actual del repo (508 tests según `AGENTS`/`memory`); conviene actualizar el registro al ejecutar nuevas iteraciones.

### 1.4 Documentación y organización
- **Consolidado hecho:** seguridad en un solo `PLAN_SEGURIDAD.md`; gestor web en `GESTOR_WEB_PLAN_Y_ENDPOINTS.md`; `.internal-docs` raíz reducida y agrupada por relación.
- **Pendiente menor:** mantener `memory.md`/planes sincronizados tras cada hito; opcional consolidar `docs/` internos si vuelve a crecer.

---

## 2. Principios de la estrategia óptima

1. **Desbloquear valor en producción primero:** cerrar pendientes manuales/de despliegue que activan funcionalidad ya implementada (especialmente `gone`/`retiradas` del gestor web).
2. **Maximizar trabajo en este repo (controlado y testeable):** priorizar ítems con `npm test`/prerender verificables antes de depender de terceros.
3. **Separar por dependencias:** no mezclar repo, GAS/Sheets, Firebase y `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`; ejecutar en paralelo solo tracks independientes.
4. **Seguridad backend antes que ampliación de superficie:** para exposición real, la autorización por endpoint (1.1) y verificación operativa pesan más que nuevas features.
5. **Evitar alcance difuso:** tratar `7.3 ficha configurable` y `forms/submit` como líneas explícitas con decisiones previas, no como “extras” de otras fases.
6. **Definición de hecho por hito:** código + pruebas + despliegue/configuración externa + verificación en entorno real.

---

## 3. Plan maestro de ejecución (por tracks y oleadas)

### Track A — Gestor web: puesta en producción y cierre operativo (prioridad alta)
**Objetivo:** que lo ya implementado funcione completamente en vivo y sea operable.
**Dependencias:** acceso a Apps Script/hoja y despliegue Pages.

| ID | Acción | Dónde | Tipo | Resultado esperado | Verificación |
|---|---|---|---|---|---|
| A1 | Desplegar **nueva versión** de `apps-script/Code.gs` y `apps-script/WebPublicaciones.gs` (+ `Auth.gs`/`Roles.gs` para D1 coherente) | GAS (externo) | Manual crítico | Activos `retirado`, `status:"gone"`, `?endpoint=retiradas`, C1 y D1 | **Hecho.** Lote desplegado y verificado: canal/C1 en vivo; D1 con `sin_acceso` revocado, perfiles y matriz de lecturas/escrituras por rol (API directa) coherentes con política. Repo/local alineado. |
| A2 | Verificación funcional de punta a punta en producción | GAS + Pages + gestor | Manual | Publicar/ocultar/retirar y consumo real validados | **Hecho.** Canal/endpoints, SPA/estática/SEO, `retiradas` y detalle `gone` verificados; caso real `prueba-retirada-playwright` con lápida estática publicada (noindex, fuera de sitemap) en `github.io`. |
| A3 | Ajuste post-despliegue de observabilidad | Repo CI | Repo | Aviso de retiradas pasa a **error** si falla (evitar que una lápida rota pase) | **Hecho.** Implementado y efectivo (falla si no puede leer `retiradas`, salvo `--soft`); validado en flujo real. Suite 508/508. |
| A4 | Dominio propio y Search Console | Dominio/hosting/DNS/SC (externo) | Externo | `sitemap.xml`/`robots.txt` en raíz, canonical `dominio+ruta`, sitemap enviado, indexación gestionable | **Aplazado** (decisión): se usa `github.io`. Opcional: Search Console/sitemap sobre la URL actual hasta tener dominio propio. |
| A5 | Cierre operativo F5 en este proyecto | Repo/docs | Mixto | Procedimientos y chequeos completos | **OK.** C1 y lote `.gs` verificados en vivo, D6 documentado con matriz/checklist y repo alineado. Resta solo seguimiento operativo externo (auditoría en hojas/roles legítimos/D4–D5/D7 y caso no listado). |

**Criterio de cierre Track A:** A2/A3 y C1 verificados (incl. front desplegado y lápida retirada tras prerender/deploy). **Cerrado salvo A4** (dominio propio aplazado; uso `github.io`) y revisión operativa residual de A5 (consistencia preview↔público/casos 301/410 en uso real).

### Track B — Web externa: consumo e indexación real (paralelo tras A2, otro repositorio)
**Objetivo:** que `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` muestre el contenido con el contrato y SEO de publicaciones.
**Dependencias:** canal público verificado en vivo (A2) y, idealmente, dominio (A4).

| ID | Acción | Dónde | Resultado esperado |
|---|---|---|---|
| B1 | Sustituir `blog-posts.json`/`HistoriasAPI` por consumo del canal (JSONP, filtros/paginación/`q`, detalle por slug) | Repo web | Listados y fichas desde API |
| B2 | Aplicar metas/OG/JSON-LD/canonical/robots desde `seo` y payload; estados vacío/error/404/gone | Repo web | Render correcto por tipo (animal/evento/historia) |
| B3 | Prerender/build por slug + `sitemap.xml`/`robots.txt` en raíz + redirects 301 desde `/v1/redirects` + manejo 410/retiradas | Repo web/hosting | Indexación y compartición correctas |
| B4 | Validación de paridad con visor de referencia | Repo web | Fichas/tipos/estados equivalentes a `publico.html` |

**Criterio de cierre:** contenido publicado visible e indexable en dominio real con metadatos correctos.

### Track C — Evolución funcional del Gestor web (repo, tras A2)
**Objetivo:** completar capacidades de valor del gestor sin bloquear la puesta en marcha.
**Dependencias:** A2 verificado para flujos de retirada reales.

| ID | Acción | Dónde | Prioridad | Resultado esperado | Notas |
|---|---|---|---|---|---|
| C1 | **Restaurar publicación retirada** desde panel + registro de quién retira/restaura | Repo + GAS | Alta | Salida controlada de `retirado` y trazabilidad | **OK.** Backend y front desplegados y verificados en vivo (restauración → borrador, slug conservado; sin `gone`/fuera de `retiradas` en fresco, lápida estática eliminada tras deploy/prerender, acción de restaurar disponible). Cache `retiradas` ~60 s. |
| C2 | Hardening de pruebas/prerender (fixtures 301 y ficha oculta, validación JSON-LD/canónica única, caso `gone`) | Repo | Media | Regresiones cubiertas | **Avanzado en repo**: fixtures `redirect-301`/`oculta`, soporte de redirecciones estáticas, `validarFichaHtml` (JSON-LD/canonical únicos), 508 tests. `npm test` + `npm run prerender --fixture`. |
| C3 | **§7.3 Ficha configurable (v1.1 aditivo)** — solo si se aprueba | Repo + GAS/Sheets | Media-baja (decisión requerida) | Plantilla/bloques, iconos, galería/alt-pie completo, salud curada, CTA kind, campos animal/tags, etc. | **Antes:** cerrar decisiones abiertas (vídeo embebido vs enlace+CSP/cookies, catálogo iconos, saneado HTML, orden bloques, tags). Mantener compatibilidad: sin `ficha` = comportamiento actual. Implementar por etapas (contrato/validación → backend → UI → visor → port web) |
| C4 | `forms/submit` (opcional) | GAS + web | Baja / alcance aparte | Envío real de formularios | Canal separado; requiere reCAPTCHA server-side, validación/antiabuso, plantillas/correos y políticas |

### Track D — Seguridad: subir de ~66% a 80–85% (paralelo, foco externo)
**Objetivo:** cerrar brechas críticas de control de acceso y operación.
**Dependencias:** acceso a GAS/Sheets/Firebase/GitHub.

| ID | Acción | Dónde | Prioridad | Hito plan |
|---|---|---|---|---|
| D1 | **Autorización por endpoint en GAS** + `user-profile` devuelve `sin_acceso` a no reconocidos (email normalizado) + denegación por defecto + minimización de datos | GAS/Sheets | Crítica | 1.1 | **Hecho (desplegado y validado en lo verificable).** `sin_acceso` revocado con perfil mínimo y denegación total; matriz de lecturas/escrituras por rol por API directa coherente con política; regresión en `tests/roles-d1.test.js`. Pendiente solo operativo: caso **no listado** (sin cuenta de prueba) y confirmar `ROLES_USUARIOS`/`ADMIN_EMAILS` completos (D2). |
| D2 | Higiene de Roles/cuentas (depurar, mínimo privilegio, correos correctos) y reflejo de cambios | Sheets/operativo | Alta | 1.3 |
| D3 | Verificar auditoría e historial de fases operativos en producción (cabeceras/IDs/endpoints/escritura) | GAS/Sheets | Alta | 5.1 |
| D4 | Gestión/rotación de token API y revisión de logs/exposición (`?token=`) | GAS/GitHub/operativo | Alta | 2.2 |
| D5 | MFA para admins/elevados y endurecimiento login (reCAPTCHA/App Check según viabilidad) | Firebase | Media-alta | 2.1 |
| D6 | Pruebas por rol (incl. `sin_acceso`/`consulta`) en UI y API directa + procedimiento de revisión/incidentes | Operativo (+repo apoyo) | Alta | 5.2 | **Avanzado.** Perfiles, lecturas y escrituras/acciones por API directa verificados por rol (incl. `sin_acceso` revocado) + UI de bloqueo; checklist en [`PRUEBAS_POR_ROL_D6.md`](PRUEBAS_POR_ROL_D6.md). Pendiente: caso no listado, verificación de auditoría en hojas (D3) y formalizar revisión/incidentes periódicos. |
| D7 | Revisar canal público del gestor web frente a criterio 4.1 (lista blanca, CORS/dominio, sin datos internos) | GAS/config | Media | 4.1 | **Revisado en código (repo).** Endpoints públicos allowlistados (`publicaciones/publicacion/animales-publicos/eventos-publicos/historias-publicas/config-publica/taxonomias/sitemap/redirects/retiradas`), solo GET, resueltos antes de exigir token; devuelven datos publicados/listados/indexables o retirados según función (sin datos internos del gestor). JSONP soportado; CORS/preflight y dominio siguen condicionados al despliegue (pendiente validación formal en entorno). |

**Criterio de cierre:** hitos 1.1, 1.3, 5.1, 2.2, 5.2 y (según viabilidad) 2.1 completados y verificados; objetivo ~80–85%.

### Track E — UI/UX modernización evolutiva (repo, en iteraciones cortas)
**Objetivo:** completar la calidad percibida y mantenibilidad sin regresiones.
**Dependencias:** ninguna externa; ejecutar entre hitos o en paralelo controlado.

| ID | Acción | Resultado esperado | Verificación |
|---|---|---|---|
| E1 | Homogeneizar módulos prioritarios (listados, fichas, formularios, filtros, estados vacío/carga/error) usando patrón de referencia | Consistencia UX en encuestas/animales/acogidas/socios/donaciones/almacén/reportes | `npm test`, revisión por rol |
| E2 | Normalizar primitivas y limpiar CSS/inline ad-hoc por vistas | UI coherente y menor deuda visual | Sin regresión visual/funcional |
| E3 | Modularización progresiva de `dashboard.js` (extraer helpers/vistas por dominio, mantener contratos y `data-action`) | Mantenibilidad y cambios más seguros | `npm test` en cada extracción |
| E4 | Rendimiento percibido (lazy por vista/flujo, assets, precache/SW) | Mejor carga en móvil | Medición básica, SW actualizado |
| E5 | Auditoría a11y/responsive integral y QA real (teclado/foco/ARIA/contraste/targets, móvil/tablet/orientaciones, por rol) | Cumplimiento práctico y pulido | Checklist + pruebas en dispositivos |

### Track F — Higiene documental (continuo, bajo esfuerzo)
- Mantener `memory.md`, `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` (registro/estado), `PLAN_SEGURIDAD.md` (tabla de avance) y `PLAN_ANALISIS_Y_EJECUCION.md` sincronizados con la realidad (tests actuales, despliegues, verificaciones).
- Mantener `CACHE_NAME` en `src/sw.js` ante cambios frontend relevantes y `npm test` en verde (CI).

---

## 4. Orden de ejecución recomendado (óptimo)

1. **Ahora:** cerrar pendientes operativos verificables de D1/D6/D2/D3 (caso `sin_acceso` no listado si hay cuenta, confirmar roles legítimos desplegados y registro en hoja de auditoría). A1–A3/A5, C1 y la matriz D1 por API directa verificados.
2. **En paralelo inmediato:** `D1, D2, D3, D4` (seguridad backend/operativa crítica) y preparación de `B1` (contrato ya estable). 
3. **Corto plazo:** `A3` (CI, tras confirmar A2) + `C1` (restaurar retirada, tras A2) + `C2` (pruebas) + `D5/D6/D7` según viabilidad.
4. **Medio plazo (con dominio disponible):** `A4 → B2/B3/B4` (SEO/indexación real en web externa).
5. **Continuo / bajo bloqueo:** `Track E` en iteraciones pequeñas con `npm test` verde.
6. **Solo tras decisión explícita:** `C3` (ficha configurable) por etapas y `C4` (forms) como alcance separado.

## 5. Resumen de “qué falta” por responsabilidad

| Responsabilidad | Pendientes principales |
|---|---|
| **Este repo** | Cierre UI/prerender C1 y A5, C2/C3 (según decisión), iteraciones Track E, ajustes doc (Track F), apoyo D6 |
| **Apps Script/Sheets (externo)** | C1/D1 desplegados según usuario (mantener alineación); validación completa D1/D3/D7, soporte C3/C4 si aplica |
| **Firebase/GitHub/operación** | D5, parte D4/D6, A4 (DNS/SC), rotaciones/revisiones |
| **Proyecto web `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` (externo)** | Track B completo (consumo, SEO de publicaciones, prerender/sitemap/robots/301/410) |

## 6. Criterio global de “terminado”
- **Gestor web:** canal y retiradas operativos en producción (A1–A2), documentación/CI alineadas, y (cuando aplique) dominio/indexación y port web completados.
- **Seguridad:** objetivo ~80–85% con 1.1/1.3/2.2/5.1/5.2 (y 2.1 viable) verificados.
- **UI/UX:** módulos homogenizados, a11y/responsive validada en dispositivos reales y sin regresiones (`npm test`/CI).
- **Decisiones cerradas:** 7.3 y forms o implementados por alcance definido, o explícitamente diferidos.