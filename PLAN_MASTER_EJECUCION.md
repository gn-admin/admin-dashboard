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
| F4 Integración web + SEO de publicaciones | ✅ Cerrada en este proyecto / ➡️ externa en web real | Visor `publico.html` con tema, canónica única a estática, metas/OG/JSON-LD, prerender `scripts/prerender-publico.js`, `publicaciones/<slug>.html`, `sitemap.xml`, `robots.txt`, páginas de retirada `noindex`, guarda de deploy, cron cada 30 min, índice de estáticas y canonical condicional, fixtures/tests (554 verdes) | **Trasladado a `TRANSFERIR_A_MAIN.md`** para ejecución en el proyecto `main` (fuera del alcance de este repo). |
| F5 Ajustes/calidad/operación | 🟡 Parcial | Completitud, consistencia preview↔público, cache/paginación, diagnóstico hoja/pestaña, historial de slug+301, retirada/410+l�pida, páginas de retirada, recuentos, docs operativa interna | Dominio propio + Search Console + sitemap en raíz; indexación/auditoría real; convertir aviso de retiradas en error si falla tras desplegar; **restaurar/salida de retirada** desde panel y auditoría de quién retira (propuesto); fixtures adicionales (301, oculta) y validación JSON-LD/canónica única |
| §7.3 Ficha configurable / media | 🟡 Parcial (media y contrato `ficha` hechos) | Media por ficha en Drive (`animales|eventos|historias/<slug>`), `web-media-subir`, normalización enlaces, galería `url|alt|pie`, documentos privados, límites/tipos. **C3:** `ficha` aditivo con `ficha_json` normalizado en servidor (máx. 45.000), solo detalle/preview, campo JSON en gestor, plantilla/bloques/lectura en visor y prerender, `cta.kind`, pruebas | **Falta:** decisiones abiertas (vídeo embebido vs enlace+CSP/cookies, saneado HTML, orden bloques) y port a `main`. UI estructurada hecha (plantilla/bloques/lectura, tags, salud curada, CTA kind) |

**Pendientes manuales clave (gestor web):** verificar canal/flujo en producción cuando corresponda, configurar/validar reCAPTCHA (D5) y cerrar decisiones/despliegues de C3/C4 si se aprueban. El dominio/indexación del sitio publicado corresponde al proyecto `main` (este repo es de gestión). (Ítems cerrados en código: C1, D1, instrumentación D3; `.gs` actualizados.)

### 1.2 Seguridad (`PLAN_SEGURIDAD.md`, consolidado)
**Estado:** ~66% estimado alcanzado (en repo); objetivo 80–85%.

| Hito | Estado | Detalle |
|---|---|---|
| 1.1 Autorización por endpoint en GAS + `sin_acceso` para no reconocidos (normalizar email) | ✅ Hecho y verificado | Desplegado; denegación por defecto, perfil minimizado y matriz por rol verificados en vivo y cubiertos por tests automatizados (Code/Auth/Roles). |
| 1.2 `sin_acceso` y bloqueo UI/cargas en frontend | ✅ Hecho y verificado | Pantalla de bloqueo, navegación oculta y restricción de cargas; efectivo con D1 desplegado (revocado verificado en vivo). |
| 1.3 Higiene Roles/cuentas | ✅ Verificado (config efectiva) | Roles desplegados correctos (incl. revocado→`sin_acceso`), normalizados y cubiertos por tests; mantener alineados ante altas/bajas. |
| 2.1 Endurecimiento login (reCAPTCHA v3 verificado en servidor) | ~ Parcial (repo/código completado) | Implementado y `.gs` actualizado; pendiente configurar dominios/hostname/umbral en consola reCAPTCHA y prueba e2e. **MFA/App Check: mejora futura opcional** (no imprescindible para este plan). |
| 2.2 Token API (rotación, mínima exposición, sin logs con `?token=`) | ✅ Revisado (procedimiento y exposición) | Token en `?token=` por diseño, sin eco de secretos ni exposición detectada; rotación definida (acción operativa periódica). |
| 3.1 Minimizar/limpiar caché cliente | 🟡 Avanzado en repo (~64–66%) | Limpieza logout/cambio, restricciones por permisos, `responses/notas` solo en memoria; ajustes finos SW/cobertura posibles. |
| 3.2 Hardening frontend (CSP enforcement en meta, Permissions-Policy, errores/deps) | 🟡 Parcial en repo (~66%) | Hecho dentro de límites GitHub Pages; verificación producción recomendada. |
| 4.1 Canal público separado de solo lectura | ✅ Revisado en código y producción | Allowlist pública, solo GET, antes de auth y sin datos internos; verificado en vivo. |
| 5.1 Auditoría/historial operativos en GAS/hojas | ✅ Cerrado | Instrumentación desplegada y verificada en producción (código/tests y flujos operativos). Inspección visual de filas: opcional. |
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

> Nota: el plan registra métricas antiguas (357/470 tests en distintas filas) frente al estado actual del repo (554 tests según `AGENTS`/`memory`); conviene actualizar el registro al ejecutar nuevas iteraciones.

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
| A1 | `.gs` actualizados en Apps Script (incl. canal/roles/D1 coherentes cuando aplique) | GAS (externo) | Hecho | Activar cambios; pendiente solo verificación operativa puntual en producción si se requiere |
| A2 | Verificación funcional de punta a punta en producción | GAS + Pages + gestor | Manual | Publicar/ocultar/retirar y consumo real validados | **Hecho.** Canal/endpoints, SPA/estática/SEO, `retiradas` y detalle `gone` verificados; caso real `prueba-retirada-playwright` con lápida estática publicada (noindex, fuera de sitemap) en `github.io`. |
| A3 | Ajuste post-despliegue de observabilidad | Repo CI | Repo | Aviso de retiradas pasa a **error** si falla (evitar que una lápida rota pase) | **Hecho.** Implementado y efectivo (falla si no puede leer `retiradas`, salvo `--soft`); validado en flujo real. Suite 554/554. |
| A4 | Dominio propio y Search Console del sitio publicado | Proyecto `main`/hosting/DNS/SC (externo) | Externo (en `main`) | Corresponde al sitio público real (ver `TRANSFERIR_A_MAIN.md`); no es pendiente de este proyecto de gestión |
| A5 | Cierre operativo F5 en este proyecto | Repo/docs | Mixto | Procedimientos y chequeos completos | **OK.** C1 y lote `.gs` verificados en vivo, D6 documentado con matriz/checklist y repo alineado. Resta solo seguimiento operativo externo (auditoría en hojas/roles legítimos/D4–D5/D7 y caso no listado). |

**Criterio de cierre Track A:** A2/A3 y C1 verificados (incl. front desplegado y lápida retirada tras prerender/deploy). **Cerrado para este proyecto de gestión** (dominio/indexación del sitio publicado se gestiona en `main`; aquí se usa `github.io` como entorno de gestión/simulación).

### Track B — Web externa (`main`): trasladado
**Estado:** planificación y ejecución **trasladadas a [`TRANSFERIR_A_MAIN.md`](TRANSFERIR_A_MAIN.md)** para ejecutar en `C:\Users\JonEg\Documents\proyectos\main` (consumo del canal, SEO/metadatos, prerender/sitemap/robots/301/410 y paridad). **No forma parte del alcance de ejecución de este repositorio.**
**Dependencias:** canal público verificado (A2) y, para indexación final, dominio propio (A4).

### Track C — Evolución funcional del Gestor web (repo, tras A2)
**Objetivo:** completar capacidades de valor del gestor sin bloquear la puesta en marcha.
**Dependencias:** A2 verificado para flujos de retirada reales.

| ID | Acción | Dónde | Prioridad | Resultado esperado | Notas |
|---|---|---|---|---|---|
| C1 | **Restaurar publicación retirada** desde panel + registro de quién retira/restaura | Repo + GAS | Alta | Salida controlada de `retirado` y trazabilidad | **OK.** Backend y front desplegados y verificados en vivo (restauración → borrador, slug conservado; sin `gone`/fuera de `retiradas` en fresco, lápida estática eliminada tras deploy/prerender, acción de restaurar disponible). Cache `retiradas` ~60 s. |
| C2 | Hardening de pruebas/prerender (fixtures 301 y ficha oculta, validación JSON-LD/canónica única, caso `gone`) | Repo | Media | Regresiones cubiertas | **Avanzado en repo**: fixtures `redirect-301`/`oculta`, soporte de redirecciones estáticas, `validarFichaHtml` (JSON-LD/canonical únicos), 554 tests. `npm test` + `npm run prerender --fixture`. |
| C3 | **§7.3 Ficha configurable (v1.1 aditivo)** — en curso | Repo + GAS/Sheets | Media-baja (decisión requerida) | Plantilla/bloques, iconos, galería/alt-pie completo, salud curada, CTA kind, campos animal/tags, etc. | **Hecho:** contrato/helpers, `ficha_json` normalizado en servidor (valores cerrados, 45.000 caracteres), solo detalle/preview, **UI estructurada** (plantilla/bloques/lectura, tags, salud curada con «heredar», CTA kind), visor+prerender, 554 tests. **Falta:** decidir vídeo embebido vs enlace, saneado HTML y orden de bloques; después, port a `main`. **Regla vigente:** listados no leen ficha; sin `ficha` el payload no cambia. |
| C4 | `forms/submit` (opcional) | GAS + web | Baja / alcance aparte | Envío real de formularios | Canal separado; reCAPTCHA server-side (`UrlFetchApp`), validación/antiabuso, plantillas/correos y políticas de datos. **Limitación clave:** CORS/preflight en POST a GAS → prototipar transporte compatible (form clásico/iframe, UX sin lectura directa de respuesta) y verificar cuotas/rate-limit antes de implementar. |

### Track D — Seguridad: subir de ~66% a 80–85% (paralelo, foco externo)
**Objetivo:** cerrar brechas críticas de control de acceso y operación.
**Dependencias:** acceso a GAS/Sheets/Firebase/GitHub.

| ID | Acción | Dónde | Prioridad | Hito plan |
|---|---|---|---|---|
| D1 | **Autorización por endpoint en GAS** + `user-profile` devuelve `sin_acceso` a no reconocidos (email normalizado) + denegación por defecto + minimización de datos | GAS/Sheets | Crítica | 1.1 | **Hecho.** Desplegado y validado en vivo (revocado, perfiles, matriz lecturas/escrituras por rol); regresión automatizada en `tests/roles-d1.test.js` y `tests/roles-auth.test.js` (no listado/revocado/normalización/fallbacks seguros). Residual operativo: confirmar `ROLES_USUARIOS`/`ADMIN_EMAILS` de producción (D2). |
| D2 | Higiene de Roles/cuentas (depurar, mínimo privilegio, correos correctos) y reflejo de cambios | Sheets/operativo | Alta | 1.3 | **Verificado (config efectiva).** Roles desplegados resuelven correctamente (admin/coordinador/voluntario/tesorería/consulta y revocado→`sin_acceso`), con normalización y denegación por defecto testeadas. Mantener `ROLES_USUARIOS`/`ADMIN_EMAILS` alineados ante altas/bajas. |
| D3 | Verificar auditoría e historial de fases operativos en producción (cabeceras/IDs/endpoints/escritura) | GAS/Sheets | Alta | 5.1 | **Cerrado.** Instrumentación en código/tests (`tests/auditoria-d3.test.js`), desplegada y operativa en producción (incl. `web-media-subir` con permisos correctos). Inspección visual de filas en hoja: opcional. |
| D4 | Gestión/rotación de token API y revisión de logs/exposición (`?token=`) | GAS/GitHub/operativo | Alta | 2.2 | **Revisado/cerrado (exposición y procedimiento).** Token en `?token=` por diseño (sin header auth por defecto), sin eco de secretos en workflow y sin exposición detectada en repo/cliente. Procedimiento de rotación definido (Secrets + config GAS + redespliegue); la rotación efectiva es una acción operativa a ejecutar cuando proceda. |
| D5 | Endurecimiento login con reCAPTCHA v3 (configuración y validación) | Consola reCAPTCHA / entorno desplegado | Media | 2.1 | **Pendiente operativo.** Código y `.gs` actualizados: verificar dominios/hostname/umbral y realizar prueba e2e. **MFA/App Check:** mejora futura opcional (no imprescindible). |
| D6 | Pruebas por rol (incl. `sin_acceso`/`consulta`) en UI y API directa + procedimiento de revisión/incidentes | Operativo (+repo apoyo) | Alta | 5.2 | **Cerrado en repo/verificable.** Automatizado (554 tests, Code/Auth/Roles), verificado en vivo por rol (incl. revocado, UI y matriz API directa), checklist y procedimiento documentados en [`PRUEBAS_POR_ROL_D6.md`](PRUEBAS_POR_ROL_D6.md). Residual operativo: auditoría en hojas (D3) y ejecución periódica/revisión de incidentes. |
| D7 | Revisar canal público del gestor web frente a criterio 4.1 (lista blanca, CORS/dominio, sin datos internos) | GAS/config | Media | 4.1 | **Cerrado (código y producción).** Endpoints públicos allowlistados, solo GET, resueltos antes de auth y sin datos internos; verificado en vivo sin token (incl. rechazo de endpoints internos sin token). CORS/dominio condicionado al despliegue actual (JSONP). |

**Criterio de cierre (seguridad de este plan):** 1.1, 1.3, 2.2, 4.1, 5.1 y 5.2 verificados/cerrados en lo aplicable. **D5** queda cerrado para este plan cuando se verifiquen dominios/umbral y la prueba e2e de reCAPTCHA; MFA/App Check se registran como **mejoras futuras opcionales**.

### Track E — UI/UX modernización evolutiva (repo, en iteraciones cortas)
**Objetivo:** completar la calidad percibida y mantenibilidad sin regresiones.
**Dependencias:** ninguna externa; ejecutar entre hitos o en paralelo controlado.

| ID | Acción | Estado | Resultado / avance | Verificación |
|---|---|---|---|---|
| E1 | Homogeneizar módulos prioritarios (listados, fichas, formularios, filtros, estados vacío/carga/error) usando patrón de referencia | ✅ Completado (prioritarios) | Homogeneizados listados/filtros/recuentos (`response-count` con `aria-live`), estados `Sin resultados`/vacío y errores anunciados, `scope` en tablas, y asociación `label/for`/atributos accesibles en formularios principales del admin y gestor web (`web.js`) y flujos clave (adopción, gestión, contrato/redes). | `npm test` en verde (554/554); revisión por rol automatizada/código |
| E2 | Normalizar primitivas y limpiar CSS/inline ad-hoc por vistas | ✅ Completado (incremental) | Normalizadas primitivas y soporte de estilos en áreas tocadas (`.form-label`, hooks `.actividad-tabla`/`.web-lista`, consistencia de controles y estados) y reducción de deuda ad-hoc en módulos intervenidos; limpieza residual no bloqueante queda como mantenimiento evolutivo. | Sin regresión funcional; `tests/diseno.test.js` y suite en verde |
| E3 | Modularización progresiva de `dashboard.js` (extraer helpers/vistas por dominio, mantener contratos y `data-action`) | ✅ Completado (progresivo) | Extraídos módulos `dashboard-actividad.js`, `dashboard-finanzas.js`, `dashboard-blacklist.js` y `dashboard-web.js` (carga browser/tests, contratos y `data-action` preservados); `dashboard.js` reducido y organizado por dominios adicionales. | `npm test` en verde; integración en `index.html`/SW validada |
| E4 | Rendimiento percibido (lazy por vista/flujo, assets, precache/SW) | ✅ Completado (incremental) | Render por vista en SPA, carga diferida de `pdf-export`, `loading="lazy"`/`decoding="async"` en imágenes de detalle/listados seguros y precache/SW actualizado por cambios (`v233`→`v252`), incluyendo nuevos módulos. | SW y assets coherentes; `npm test` en verde |
| E5 | Auditoría a11y/responsive integral y QA real (teclado/foco/ARIA/contraste/targets, móvil/tablet/orientaciones, por rol) | ✅ Completado (código/auditoría) | Skip link, landmarks/`aria-current`, `document.title` y foco en navegación, restauración de foco en modales, activación por teclado, `role="alert"`/`aria-live`, labels/ARIA en formularios y filtros, `scope` en tablas, iconos decorativos ocultos y controles accesibles. QA manual en dispositivos/orientaciones reales y validación por rol en entorno operativo recomendada como verificación final. | `npm test` y checks estáticos en verde; QA manual externa recomendada |

### Track F — Higiene documental (continuo, bajo esfuerzo)
- **Estado:** ✅ Al día en esta iteración (2026-11-15) — `memory.md`, `PLAN_MASTER_EJECUCION.md` y `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` sincronizados: Track E cerrado y Track C refinado (C3: objetivo/almacenamiento/rendimiento/viabilidad; C4: restricciones CORS/cuotas y necesidad de prototipo). Mantener sincronía en iteraciones futuras.
- Mantener `memory.md`, `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` (registro/estado), `PLAN_SEGURIDAD.md` (tabla de avance) y `PLAN_ANALISIS_Y_EJECUCION.md` sincronizados con la realidad (tests actuales, despliegues, verificaciones).
- Mantener `CACHE_NAME` en `src/sw.js` ante cambios frontend relevantes y `npm test` en verde (CI).

---

## 4. Orden de ejecución recomendado (óptimo)

1. **Ahora:** **Track E cerrado** y **`.gs` actualizados**. Siguientes focos: **D5** (configurar dominios/hostname/umbral en consola reCAPTCHA y prueba e2e) y **C3** (decisiones + implementación), además de mantenimiento evolutivo.
2. **Operativo puntual:** inspección visual opcional de auditoría/fases en hojas, rotación periódica del token (D4) y confirmación de `DRIVE_WEB_FOLDER_ID` en `Config.gs` desplegado si aplica.
3. **Dependiente de decisión:** **C3** (ficha configurable v1.1) y soporte backend/C4 en este ecosistema si se aprueba. Lo planificado para `main` (Track B, formularios web C4 y dominio/indexación del sitio publicado) está en [`TRANSFERIR_A_MAIN.md`](TRANSFERIR_A_MAIN.md). **MFA/App Check:** mejora futura opcional (no imprescindible para este plan).
4. **Continuo:** mantener documentación y verificación alineadas con la realidad (tests, despliegues, SW).

## 5. Resumen de “qué falta” por responsabilidad

| Responsabilidad | Pendientes principales |
|---|---|
| **Este repo (gestión privada)** | Cerrar **D5** (config reCAPTCHA + e2e), avanzar **C3** si se aprueba, mantenimiento evolutivo y soporte a C4 backend si aplica |
| **Apps Script/Sheets (operativo)** | Inspección opcional de auditoría/fases en hojas, rotación de token cuando proceda, confirmar `DRIVE_WEB_FOLDER_ID` desplegado; soporte a C3/C4 si se aprueban |
| **Consola reCAPTCHA / operación** | Configurar dominios/hostname/umbral y validar login e2e (D5). Revisiones/rotaciones periódicas |
| **Proyecto `main` (externo)** | Ejecutar lo trasladado en [`TRANSFERIR_A_MAIN.md`](TRANSFERIR_A_MAIN.md) (Track B, formularios web C4 y dominio/indexación del sitio publicado), fuera de este repo. |

**Mejoras futuras opcionales (no imprescindibles):** MFA para cuentas elevadas y App Check/endurecimiento adicional en Firebase.

## 6. Criterio global de “terminado”
- **Gestor web:** canal y retiradas operativos en producción (A1–A2), documentación/CI alineadas, y (cuando aplique) dominio/indexación y port web completados.
- **Seguridad:** objetivo ~80–85% con 1.1/1.3/2.2/5.1/5.2 (y 2.1 viable) verificados.
- **UI/UX:** módulos homogenizados, a11y/responsive validada en dispositivos reales y sin regresiones (`npm test`/CI).
- **Decisiones cerradas:** 7.3 y forms o implementados por alcance definido, o explícitamente diferidos.