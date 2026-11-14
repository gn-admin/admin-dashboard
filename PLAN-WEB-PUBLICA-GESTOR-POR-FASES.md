# Plan por fases: Web pública + Gestor y endpoints (publicaciones, SEO)

> **Objetivo:** implementar de forma incremental y segura la gestión de contenido público en el admin (gestor) y el canal público de solo lectura para la web (`custom-page` / `nueva-version`), con foco en fichas de animales, eventos, SEO y curación de datos.  
> **Modo:** análisis/plan (sin implementar).  
> **Documento base:** `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`.  
> **Fuentes externas alineadas (leídas):**
> - `../custom-page/docs/estructura-endpoint-publicaciones.md` — contrato público `GET /api/publicaciones` (filtros `type,category,status,species,q,page,pageSize,sort`), detalle por `:slug`, esquema `Publicacion` (`icons`, `gallery`, `videos[]/video`, `animal`, `event`, `contentHtml`, `coverImage`, `cta`, `publication/nebak-post-v1`).
> - `../custom-page/docs/analisis-endpoint-seo-formularios-cookies-nueva-version.md` — inventario/consumo `nueva-version` (`HistoriasAPI`, `post.html?slug`, listados adopción), propuesta GAS/Sheets `/v1/*` (contenido, config, taxonomías, `forms/submit`), SEO (prerender/build por slug, metas/OG/JSON-LD, sitemap/robots, redirects 301), formularios/reCAPTCHA y cookies/políticas.
> **Dependencias externas:** cambios en Apps Script (`.gs`), hojas/Sheets, despliegue/CORS, estrategia de render/SEO de la web pública y (para formularios) reCAPTCHA/correos. Seguridad alineada con `PLAN_SEGURIDAD.md` e `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`.

---

## Visión general de fases

| Fase | Enfoque | Resultado principal | Depende de |
|---|---|---|---|
| **0** | Definición y contratos | Modelo, lista blanca, contratos gestor+público y estrategia SEO/entrega cerrados y alineados a `custom-page/docs` | — |
| **1** | Modelo de datos y backend gestor | Hojas/capa de publicación, endpoints de gestión (CRUD/config/preview/slug/estado) protegidos, payload público normalizado | Fase 0 |
| **2** | UI gestor en admin | Sección “Web/Contenido público” + edición contextual, curación/SEO/previsualización por permisos | Fase 1 |
| **3** | Canal público (contenido) | Endpoints/feed públicos de solo lectura (`/api/publicaciones` y/o `/v1/*`) con lista blanca, filtros y SEO payload | Fase 1 (datos curados) |
| **4** | Web pública, SEO técnico y formularios | Consumo del contrato, rutas canónicas, prerender/build por slug, metas/OG/JSON-LD, sitemap/robots/redirects, `forms/submit` y cookies | Fase 3 (y 0) |
| **5** | Endurecimiento y operación | Calidad, caché/rendimiento, seguridad/privacidad, observabilidad, QA por rol y documentación | Fases 2–4 |

> Se puede solapar **2** y **3** tras estabilizar contratos y payload normalizado de Fase 1, pero no exponer Fase 3/4 sin lista blanca, curación mínima y control de publicación.

---

## Fase 0 — Definición, decisiones y contratos (alineación)

**Objetivo:** cerrar ambigüedades de modelo, contratos y SEO para evitar rehacer backend/UI.

### Tareas
1. **Alineación de contratos (con `custom-page/docs`):**
   - Adoptar como base pública el esquema `Publicacion` y rutas `GET /api/publicaciones` + `GET /api/publicaciones/:slug` (filtros/paginación/respuesta) de `estructura-endpoint-publicaciones.md`.
   - Definir compatibilidad/alias con `/v1/*` (`/v1/publicaciones`, `/v1/animales`, `/v1/eventos`, `/v1/config`, `/v1/taxonomias`, `/v1/sitemap`/export) según `analisis-endpoint-seo-formularios-cookies-nueva-version.md`.
   - Fijar taxonomía: `type` (`animal|evento` y regla para `historia/blog`), `category`, `status`, `species`, y mapeos a categorías/estados actuales de `nueva-version`.
2. **Modelo de datos y fuente de verdad:**
   - **Animales:** capa de publicación separada recomendada (`web_animales`/`web_publicaciones` referenciando `animal_id`) para aislar lo público de la ficha interna.
   - **Eventos/historias publicables:** entidad/hoja dedicada (no `actividad` interna) con `estado_publicacion`, fechas/lugar, media y SEO.
   - Estados internos publicables → `estado_publico` (p. ej. adoptado en escaparate sí/no) y regla de `indexable/listed/featured`.
   - Origen y selección de media pública (`coverImage`, `gallery`, `videos`), `icons` y CTA pública.
3. **Lista blanca y campos sensibles:**
   - Definir campos exactos permitidos por tipo (`animal`, `evento`, y extensiones) y exclusiones (adoptantes/contratos/documentos/gastos/datos médicos sensibles/dirección exacta/notas/IDs internos).
4. **Contratos del gestor (admin):** acciones, parámetros, respuestas y validaciones para `web-animales`, `web-eventos`, `web-animales-preview`, `web-slug-check`, `web-resumen` (y autorización por rol).
5. **SEO y URLs (web pública):** estrategia canónica por slug (rutas limpias objetivo y convivencia con `post.html?slug=`), `slug` único/normalizado, redirects 301, `sitemap.xml`/`robots.txt`, metas/OG/canonical/robots/JSON-LD, y decisión de entrega (prerender/build por slug vs dinámico/híbrido/export JSON).
6. **Seguridad, CORS y permisos:** canal público sin token admin y con CORS limitado a dominio(s) públicos; roles con permiso de gestión web; confirmación de autorización por endpoint en `.gs`.
7. **Formularios y políticas (alcance y dependencias):** contrato `POST /v1/forms/submit` (tipos, reCAPTCHA server-side, hoja `solicitudes_form`/correo) y requisitos de cookies/consentimiento/políticas para la web pública.

### Entregables
- Matriz de decisiones y modelo de datos (hojas/cabeceras/campos por tipo) + mapeos de estados/taxonomías.
- Especificación de contratos público/gestor, lista blanca y reglas de validación/publicación.
- Diseño SEO/URL (rutas, sitemap, redirects, estrategia prerender/export) y checklist de seguridad/privacidad/CORS.

### Criterio de salida
- Contratos y modelo aprobados y alineados con `custom-page/docs`; sin ambigüedades críticas para Fase 1.

---

## Fase 1 — Modelo de datos y backend gestor (Apps Script/Sheets)

**Objetivo:** disponer de almacenamiento y APIs de gestión seguras que produzcan el payload público normalizado.

### Tareas
1. **Hojas/entidades y `CONFIG` (`.gs`):**
   - Crear/ajustar hojas de publicación web (p. ej. `web_animales`, `web_eventos`/`web_publicaciones`) con cabeceras: identificadores/origen, `slug`, `estado_publicacion/publicado_web`, `indexable`, `listed/featured/orden`, campos públicos (`title/excerpt/contentHtml` o equivalentes curados, `category/status/type`, `cover`, `gallery_json`, `videos_json`, `icons_json`, CTA), bloque SEO/OG, fechas (`publishedAt/updatedAt`) y metadatos de control. Fila 1 = cabeceras.
   - Registrar en `CONFIG.sheets` y validar permisos/IDs.
2. **Lógica de dominio:**
   - Normalización/validación de `slug` (único por tipo), unicidad y control de cambios (base para redirects).
   - Validaciones de publicación: campos mínimos, estado interno publicable (animales), coherencia de fechas/lugar (eventos), y reglas de `indexable`.
   - Composición de **payload `Publicacion` normalizado** (lista blanca, con `icons/gallery/videos`, `animal/event`, y bloque `seo` si aplica) reutilizable por `preview` y por el canal público.
3. **Endpoints gestor (autenticados y autorizados, denegación por defecto):**
   - `GET/POST ?endpoint=web-animales` (list/get/upsert), `web-animales-estado`, `web-animales-preview`.
   - `GET/POST ?endpoint=web-eventos` (list/get/create/update/archivar/estado).
   - Utilidades: `web-slug-check`, `web-resumen`.
4. **Seguridad y calidad backend:**
   - Autorización por rol/módulo en cada acción (hito 1.1); no devolver datos internos innecesarios; sanitizar/limitar entradas (slugs, textos, URLs/JSON).
   - Registrar en auditoría acciones de publicación y cambios SEO relevantes (según capacidad).
5. **Pruebas:** CRUD, unicidad de slug, reglas de publicación/estado, y verificación de que `preview`/payload público no incluye campos prohibidos.

### Entregables
- Hojas/entidades mapeadas y operativas.
- Endpoints gestor con control de acceso y payload normalizado validado.
- Ejemplos request/response (gestor y preview) alineados al contrato.

### Criterio de salida
- Se puede curar/publicar/ocultar contenido y obtener un `preview` público conforme a la lista blanca y al esquema `Publicacion`.

---

## Fase 2 — UI gestor en el admin (sección Web + contexto)

**Objetivo:** gestionar contenido público y SEO desde el panel de forma global y contextual.

### Tareas
1. **Sección “Web / Contenido público”:**
   - Listados de animales y eventos/historias publicables con estado (borrador/publicado/oculto), `indexable`, indicadores de completitud (sin slug/SEO/imagen/descripción), filtros y búsqueda.
   - Acciones: publicar/ocultar, editar configuración pública y SEO, y **previsualización** usando `web-*-preview` (validación visual del payload público).
2. **Curación de animales (capa pública):**
   - Edición de campos públicos permitidos (título/extracto/descripción pública, `estado_publico`, `category/status`, selección de `coverImage/gallery/videos`, `icons`, CTA) y SEO (`slug`, `seo_title/description`, OG/Twitter, canonical, robots/indexable), con avisos de longitud/calidad.
   - Nunca editar/exponer campos internos sensibles en esta capa.
3. **Gestión de eventos/historias publicables:** formulario CRUD (datos, fechas/lugar, media, estado) + SEO y campos del bloque `event`.
4. **Integración contextual (híbrida):** acceso rápido desde la ficha de animal a “Publicación web” (estado, publicar/ocultar, enlace a edición completa).
5. **Permisos y UX:** visibilidad/acciones según rol (`aplicarPermisosUI`), estados de carga/error/vacío y validaciones previas a publicar.
6. **Calidad frontend:** rutas relativas, actualización de `CACHE_NAME` en `src/sw.js` ante cambios relevantes, y `npm test` en verde.

### Entregables
- Sección Web operativa y flujo de curación/publicación usable.
- Edición contextual básica y previsualización de payload público.

### Criterio de salida
- Un usuario autorizado puede preparar, previsualizar y publicar/ocultar animales y eventos con metadatos SEO desde el admin.

---

## Fase 3 — Canal público de solo lectura (contenido curado)

**Objetivo:** exponer el contenido publicado para la web mediante un canal separado y seguro.

### Tareas
1. **Endpoints públicos en GAS (separados del admin):**
   - `GET /api/publicaciones` (filtros `type,category,status,species,q,page,pageSize,sort`, respuesta con `endpoint/generatedAt/filters/pagination/data`) y `GET /api/publicaciones/:slug` según `estructura-endpoint-publicaciones.md`.
   - Alias/capa `/v1/*` según alcance: `/v1/publicaciones` (y detalle), `/v1/animales`, `/v1/eventos`, `/v1/config`, `/v1/taxonomias` y, si aplica, `/v1/sitemap`/export de URLs+`lastmod`.
2. **Lista blanca y reglas:**
   - Solo registros publicados/publicables e `indexable` según corresponda; estados internos permitidos para animales.
   - Construir respuesta campo a campo (payload normalizado de Fase 1); incluir `icons/gallery/videos`, `animal/event`, `contentHtml`, CTA y metadatos/SEO necesarios; **404** para no publicado/inexistente.
3. **No funcionales y seguridad:**
   - Sin token admin; CORS restringido a dominio(s) de la web pública; errores genéricos sin detalles internos.
   - `Cache-Control` y/o ETag/`Last-Modified`, paginación acotada y (si se decide) cacheo en GAS/exportación JSON estática con contrato estable.
4. **Validación:** comparar respuestas con `web-*-preview` y verificar ausencia total de campos sensibles en muestreos.

### Entregables
- Canal público documentado y operativo (contrato alineado a `custom-page/docs`).
- Evidencia de lista blanca, CORS y comportamiento ante no publicados.

### Criterio de salida
- `nueva-version` puede consumir listados/detalles (y config/taxonomías si aplica) de contenido publicado sin acceder a datos internos.

---

## Fase 4 — Web pública: consumo, SEO técnico, formularios y cookies

**Objetivo:** hacer visible e indexable el contenido público y completar el circuito de interacción del sitio.

### Tareas
1. **Consumo del contrato en `custom-page/nueva-version`:**
   - Sustituir `../data/blog-posts.json` por el endpoint público (`HistoriasAPI`/adaptadores) manteniendo compatibilidad con el render (`post.html`, listados adopción/historias, secciones a dinamizar).
   - Implementar filtros/paginación/búsqueda (`type,category,status,species,q,sort`) y estados vacíos/error.
2. **Rutas y SEO técnico (crítico para fichas dinámicas):**
   - Rutas canónicas por tipo/slug (objetivo limpio) y mapeo/redirect 301 desde `post.html?slug=` y rutas antiguas.
   - Estrategia de **prerender/build por slug** (o SSG/export) para que detalle/ficha emita HTML con contenido y metadatos; uso del endpoint como fuente en build y/o runtime controlado.
   - Por página: `<title>`, meta description, canonical, robots (`index/noindex`), Open Graph/Twitter y JSON-LD (`Article/BlogPosting` o adecuado, `Event`, `BreadcrumbList`, `Organization/WebSite`).
   - `sitemap.xml` y `robots.txt` desde contenido publicado/indexable (`lastmod`), manejo 404/410, y tratamiento de parámetros no indexables (p. ej. `?from=`).
3. **Rendimiento y accesibilidad:** imágenes optimizadas con `alt`/URLs estables, HTML semántico, responsive y LCP razonable.
4. **Formularios (`/v1/forms/submit` o equivalente, canal separado):**
   - Reemplazar envío simulado (`NebakForms`) por POST real con `form_type`, `concepto`, contexto (slug/url), validación y feedback UX.
   - Backend: verificación reCAPTCHA server-side, validaciones/antiabuso, registro opcional (hoja) y envío de correo por plantilla.
5. **Cookies y políticas:**
   - Consentimiento previo real para no esenciales y carga condicional de terceros (Maps/YouTube/Analytics/reCAPTCHA según decisión).
   - Actualizar políticas de cookies/privacidad a los tratamientos reales (endpoints, Sheets/Drive, correos, terceros).

### Entregables
- Web pública consumiendo el canal y renderizando listados/detalles con metadatos SEO.
- Sitemap/robots y redirecciones operativas; formularios funcionales y cookies/políticas alineadas.

### Criterio de salida
- Contenido publicado indexable (según configuración) y compartible con metadatos correctos, sin exposición de datos internos; formularios operativos bajo las políticas definidas.

---

## Fase 5 — Endurecimiento, calidad y operación

**Objetivo:** estabilizar, asegurar y facilitar el mantenimiento continuo del flujo gestor → público.

### Tareas
1. **Calidad de contenido:** validaciones reforzadas (slugs, mínimos para publicar, media), detección de “publicado incompleto/sin SEO”, y gestión de cambios de slug con redirects.
2. **Seguridad/privacidad:** auditoría de respuestas públicas (muestreo de lista blanca), revisión de permisos/roles de gestión web, registro de publicación/SEO, y revisión de retención/minimización en formularios.
3. **Rendimiento y resiliencia:** caché (`Cache-Control`/ETag/`CacheService` o export estática), control de límites de GAS, tiempos de actualización y consistencia preview↔público.
4. **Observabilidad y pruebas:** checklist por rol, pruebas de endpoints gestor/público y de render/SEO (metas/schema/canonical), verificación de sitemap/indexación en Search Console cuando aplique.
5. **Documentación:** contratos finales (público/gestor), `CONFIG`/hojas, CORS/dominios, procedimiento de publicación/redirecciones y actualización de dependencias de `custom-page`.

### Entregables
- Checklist de QA/seguridad pasado y documentación operativa actualizada.
- Registro de incidencias y decisiones de mantenimiento.

### Criterio de salida
- Flujo estable, seguro, medible y mantenible de extremo a extremo.

---

## Orden recomendado de ejecución

1. **Fase 0** — decisiones, modelo, lista blanca y contratos alineados a `custom-page/docs`.  
2. **Fase 1** — hojas + backend gestor + payload normalizado/lista blanca (base de todo).  
3. **Fase 2** (UI gestor) y preparación de **Fase 3** en paralelo una vez estable el contrato/payload.  
4. **Fase 3** — canal público con validación estricta de lista blanca y compatibilidad `/api`–`/v1`.  
5. **Fase 4** — consumo en web pública, SEO técnico (prerender/redirects/sitemap) y formularios/cookies.  
6. **Fase 5** — endurecimiento y operación.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fuga de datos internos en feed público | Lista blanca en servidor, `preview` = base del público, muestreo/pruebas de respuestas. |
| Desalineación gestor ↔ público ↔ web | Contrato único `Publicacion` normalizado y compatibilidad de rutas/campos documentada. |
| Fichas dinámicas no indexables | Prerender/build por slug con metas/OG/JSON-LD, sitemap y canonicals. |
| Cambios de slug rompen SEO | `slug` estable, historial y redirecciones 301; `noindex`/404-410 para retirados. |
| Límites/rendimiento de GAS | Paginación, caché (`CacheService`/HTTP) y opción de exportación JSON estática. |
| Falta de autorización en backend | Autorización por rol en cada endpoint gestor y pruebas por rol (hito 1.1). |
| Formularios/spam o datos personales | `forms/submit` separado, reCAPTCHA server-side, validación/antiabuso y minimización. |

## Registro de avance (a completar durante implementación)

| Fecha | Fase/Tarea | Cambio | Responsable | Evidencia/Notas |
|---|---|---|---|---|
| 2026-11-14 | 0 | Plan y análisis alineados con `../custom-page/docs` (contratos publicaciones, `/v1/*`, SEO/prerender, formularios/cookies) | — | `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`, este documento |
