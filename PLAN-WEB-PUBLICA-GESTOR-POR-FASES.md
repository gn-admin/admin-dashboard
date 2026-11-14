# Plan por fases: Gestor web + endpoints públicos (contenido)

> **Objetivo:** implementar de forma incremental un apartado **Gestor web** en el admin para preparar/publicar contenido y un **canal público** para que la web (`custom-page` / `nueva-version`) pueda consultar y visualizar fichas de animales, eventos e historias, con SEO y contrato estable.
> **Modo:** análisis/plan (sin implementar).
> **Documento base:** `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`.
> **Nota de alcance:** las consideraciones de seguridad/privacidad de este módulo están separadas en `SEGURIDAD-WEB-PUBLICA-NOTAS.md` y **no forman parte de este plan por ahora** (no aplicar de momento).
> **Fuentes externas alineadas (leídas):**
> - `../custom-page/docs/estructura-endpoint-publicaciones.md` — contrato público `GET /api/publicaciones` (filtros `type,category,status,species,q,page,pageSize,sort`), detalle por `:slug`, esquema `Publicacion` (`icons`, `gallery`, `videos[]/video`, `animal`, `event`, `contentHtml`, `coverImage`, `cta`, `publication/nebak-post-v1`).
> - `../custom-page/docs/analisis-endpoint-seo-formularios-cookies-nueva-version.md` — inventario/consumo `nueva-version` (`HistoriasAPI`, `post.html?slug`, listados adopción), propuesta GAS/Sheets `/v1/*` (contenido, config, taxonomías, `forms/submit`), SEO (prerender/build por slug, metas/OG/JSON-LD, sitemap/robots, redirects 301), formularios y cookies.
> **Dependencias externas:** cambios en Apps Script (`.gs`), hojas/Sheets, despliegue del canal público y (si aplica) estrategia de render/SEO de la web.

---

## Visión general de fases

| Fase | Enfoque | Resultado principal | Depende de |
|---|---|---|---|
| **0** | Definición y contratos | Modelo, capa de curación, contratos gestor+público, taxonomía y estrategia SEO/entrega cerrados y alineados a `custom-page/docs` | — |
| **1** | Modelo de datos y backend gestor | Hojas/capa de publicación, endpoints de gestión (CRUD/config/preview/slug/estado), payload público normalizado | Fase 0 |
| **2** | UI Gestor web en admin | Sección “Web/Contenido público” + edición contextual, curación/SEO/previsualización | Fase 1 |
| **3** | Canal público (contenido) | Endpoints/feed públicos de solo lectura (`/api/publicaciones` y/o `/v1/*`) con filtros, detalle por slug y payload conforme al contrato | Fase 1 (datos curados) |
| **4** | Web pública y SEO técnico | Consumo del contrato en `nueva-version`, rutas canónicas, prerender/build por slug, metas/OG/JSON-LD, sitemap/robots/redirects | Fase 3 (y 0) |
| **5** | Ajustes, calidad y operación | Validaciones funcionales, caché/rendimiento, QA, documentación y (si aplica) formularios/cookies según alcance definido | Fases 2–4 |

> Se puede solapar **2** y **3** tras estabilizar contratos y payload normalizado de Fase 1.

---

## Fase 0 — Definición, decisiones y contratos (alineación)

**Objetivo:** cerrar ambigüedades de modelo, contratos y SEO para evitar rehacer backend/UI.

### Tareas
1. **Alineación de contratos (con `custom-page/docs`):**
   - Base pública: esquema `Publicacion` y rutas `GET /api/publicaciones` + `GET /api/publicaciones/:slug` (filtros `type,category,status,species,q,page,pageSize,sort`, paginación/respuesta) de `estructura-endpoint-publicaciones.md`.
   - Definir compatibilidad/alias con `/v1/*` (`/v1/publicaciones`, `/v1/animales`, `/v1/eventos`, `/v1/config`, `/v1/taxonomias`, `/v1/sitemap`/export) según `analisis-endpoint-seo-formularios-cookies-nueva-version.md`.
   - Fijar taxonomía: `type` (`animal|evento` y regla para `historia/blog`), `category`, `status`, `species`, y mapeos a categorías/estados actuales de `nueva-version`.
2. **Modelo de datos y fuente de verdad:**
   - **Animales:** capa de publicación separada recomendada (`web_animales`/`web_publicaciones` referenciando `animal_id`) para aislar lo público de la ficha interna.
   - **Eventos/historias publicables:** entidad/hoja dedicada (no `actividad` interna) con estado de publicación, fechas/lugar, media y SEO.
   - Mapeo de estados internos → estado público/categoría visible y reglas de `indexable/listed/featured`.
   - Origen y selección de media pública (`coverImage`, `gallery`, `videos`), `icons` y CTA.
3. **Capa de curación (contenido público):**
   - Definir campos usados en la publicación por tipo (`animal`, `evento`, extensiones) y qué información de la ficha interna no forma parte de la publicación.
4. **Contratos del gestor (admin):** acciones, parámetros, respuestas y validaciones para `web-animales`, `web-eventos`, `web-animales-preview`, `web-slug-check`, `web-resumen`.
5. **SEO y URLs (web pública):** estrategia canónica por slug (rutas limpias objetivo y convivencia con `post.html?slug=`), `slug` único/normalizado, redirects 301, `sitemap.xml`/`robots.txt`, metas/OG/canonical/robots/JSON-LD, y decisión de entrega (prerender/build por slug vs dinámico/híbrido/export JSON).
6. **Alcance complementario (opcional, por decisión):** contrato `POST /v1/forms/submit` y requisitos de cookies/políticas para la web pública (referencia en `custom-page/docs`).

### Entregables
- Matriz de decisiones y modelo de datos (hojas/cabeceras/campos por tipo) + mapeos de estados/taxonomías.
- Especificación de contratos público/gestor, campos de publicación por tipo y reglas de validación/publicación.
- Diseño SEO/URL (rutas, sitemap, redirects, estrategia prerender/export).

### Criterio de salida
- Contratos y modelo aprobados y alineados con `custom-page/docs`; sin ambigüedades críticas para Fase 1.

---

## Fase 1 — Modelo de datos y backend gestor (Apps Script/Sheets)

**Objetivo:** disponer de almacenamiento y APIs de gestión que produzcan el payload público normalizado.

### Tareas
1. **Hojas/entidades y `CONFIG` (`.gs`):**
   - Crear/ajustar hojas de publicación web (p. ej. `web_animales`, `web_eventos`/`web_publicaciones`) con cabeceras: identificadores/origen, `slug`, `estado_publicacion/publicado_web`, `indexable`, `listed/featured/orden`, campos públicos (`title/excerpt/contentHtml` o equivalentes curados, `category/status/type`, `cover`, `gallery_json`, `videos_json`, `icons_json`, CTA), bloque SEO/OG, fechas (`publishedAt/updatedAt`) y metadatos de control. Fila 1 = cabeceras.
   - Registrar en `CONFIG.sheets` y validar IDs.
2. **Lógica de dominio:**
   - Normalización/validación de `slug` (único por tipo), unicidad y control de cambios (base para redirects).
   - Validaciones de publicación: campos mínimos, coherencia con estado/origen (animales), coherencia de fechas/lugar (eventos), y reglas de `indexable`.
   - Composición de **payload `Publicacion` normalizado** (campos de publicación definidos, con `icons/gallery/videos`, `animal/event`, y bloque `seo` si aplica) reutilizable por `preview` y por el canal público.
3. **Endpoints gestor (usados por el apartado Gestor web):**
   - `GET/POST ?endpoint=web-animales` (list/get/upsert), `web-animales-estado`, `web-animales-preview`.
   - `GET/POST ?endpoint=web-eventos` (list/get/create/update/archivar/estado).
   - Utilidades: `web-slug-check`, `web-resumen`.
4. **Calidad backend:** sanitizar/limitar entradas (slugs, textos, URLs/JSON) y mantener consistencia entre configuración guardada y `preview`.
5. **Pruebas:** CRUD, unicidad de slug, reglas de publicación/estado, y verificación de que `preview` coincide con el contrato `Publicacion` esperado.

### Entregables
- Hojas/entidades mapeadas y operativas.
- Endpoints gestor y payload normalizado validado.
- Ejemplos request/response (gestor y preview) alineados al contrato.

### Criterio de salida
- Se puede curar/publicar/ocultar contenido y obtener un `preview` conforme al esquema `Publicacion`.

---

## Fase 2 — UI Gestor web en el admin

**Objetivo:** gestionar contenido público y SEO desde el panel de forma global y contextual.

### Tareas
1. **Sección “Web / Contenido público” (nuevo apartado en admin):**
   - Listados de animales y eventos/historias publicables con estado (borrador/publicado/oculto), `indexable`, indicadores de completitud (sin slug/SEO/imagen/descripción), filtros y búsqueda.
   - Acciones: publicar/ocultar, editar configuración pública y SEO, y **previsualización** usando `web-*-preview`.
2. **Curación de animales (capa pública):**
   - Edición de campos públicos (título/extracto/descripción pública, estado/categoría pública, selección de `coverImage/gallery/videos`, `icons`, CTA) y SEO (`slug`, `seo_title/description`, OG/Twitter, canonical, robots/indexable), con avisos de longitud/calidad.
3. **Gestión de eventos/historias publicables:** formulario CRUD (datos, fechas/lugar, media, estado) + SEO y campos del bloque `event`.
4. **Integración contextual (híbrida):** acceso rápido desde la ficha de animal a “Publicación web” (estado, publicar/ocultar, enlace a edición completa).
5. **UX y permisos de UI:** visibilidad/acciones según rol de interfaz, estados de carga/error/vacío y validaciones previas a publicar.
6. **Calidad frontend:** rutas relativas, actualización de `CACHE_NAME` en `src/sw.js` ante cambios relevantes, y `npm test` en verde.

### Entregables
- Sección Gestor web operativa y flujo de curación/publicación usable.
- Edición contextual básica y previsualización de payload público.

### Criterio de salida
- Desde el admin se puede preparar, previsualizar y publicar/ocultar animales y eventos con metadatos SEO.

---

## Fase 3 — Canal público de solo lectura (contenido)

**Objetivo:** exponer el contenido publicado para que la web pueda consultarlo y mostrar fichas.

### Tareas
1. **Endpoints públicos en GAS (canal de contenido):**
   - `GET /api/publicaciones` (filtros `type,category,status,species,q,page,pageSize,sort`, respuesta con `endpoint/generatedAt/filters/pagination/data`) y `GET /api/publicaciones/:slug` según `estructura-endpoint-publicaciones.md`.
   - Alias/capa `/v1/*` según alcance: `/v1/publicaciones` (y detalle), `/v1/animales`, `/v1/eventos`, `/v1/config`, `/v1/taxonomias` y, si aplica, `/v1/sitemap`/export de URLs+`lastmod`.
2. **Composición de respuesta:**
   - Incluir solo registros en estado publicable y construir respuesta con el payload normalizado de Fase 1 (`icons/gallery/videos`, `animal/event`, `contentHtml`, CTA y metadatos/SEO necesarios).
   - **404** para contenido no disponible según las reglas de publicación definidas.
3. **No funcionales:** `Cache-Control` y/o ETag/`Last-Modified`, paginación acotada y, si se decide, cacheo en GAS/exportación JSON estática con contrato estable.
4. **Validación:** comparar respuestas con `web-*-preview` y con los casos de consumo de `nueva-version`.

### Entregables
- Canal público documentado y operativo (contrato alineado a `custom-page/docs`).
- Conjunto de ejemplos de respuestas para listados y detalle por `slug`.

### Criterio de salida
- `nueva-version` puede obtener listados y fichas/detalles de contenido publicado mediante el contrato definido.

---

## Fase 4 — Web pública: consumo y SEO técnico

**Objetivo:** hacer visible e indexable el contenido publicado en la web.

### Tareas
1. **Consumo del contrato en `custom-page/nueva-version`:**
   - Sustituir `../data/blog-posts.json` por el endpoint público (`HistoriasAPI`/adaptadores) manteniendo compatibilidad con el render (`post.html`, listados adopción/historias, secciones a dinamizar).
   - Implementar filtros/paginación/búsqueda (`type,category,status,species,q,sort`) y estados vacíos/error.
2. **Rutas y SEO técnico:**
   - Rutas canónicas por tipo/slug (objetivo limpio) y mapeo/redirect 301 desde `post.html?slug=` y rutas antiguas.
   - Estrategia de **prerender/build por slug** (o SSG/export) para que detalle/ficha emita HTML con contenido y metadatos; endpoint como fuente en build y/o runtime controlado.
   - Por página: `<title>`, meta description, canonical, robots (`index/noindex`), Open Graph/Twitter y JSON-LD (`Article/BlogPosting` o adecuado, `Event`, `BreadcrumbList`, `Organization/WebSite`).
   - `sitemap.xml` y `robots.txt` desde contenido publicado/indexable (`lastmod`), manejo 404/410 y tratamiento de parámetros no indexables (p. ej. `?from=`).
3. **Rendimiento y accesibilidad:** imágenes optimizadas con `alt`/URLs estables, HTML semántico, responsive y LCP razonable.
4. **Alcance complementario (si se decide):** formularios (`/v1/forms/submit`) y cookies/políticas según `custom-page/docs` (como flujo separado del feed de publicaciones).

### Entregables
- Web pública consumiendo el canal y renderizando listados/detalles con metadatos SEO.
- Sitemap/robots y redirecciones operativas.

### Criterio de salida
- Contenido publicado visible e indexable (según configuración) y compartible con metadatos correctos.

---

## Fase 5 — Ajustes, calidad y operación

**Objetivo:** estabilizar y facilitar el mantenimiento del flujo gestor → público.

### Tareas
1. **Calidad de contenido:** validaciones reforzadas (slugs, mínimos para publicar, media), detección de “publicado incompleto/sin SEO”, y gestión de cambios de slug con redirects.
2. **Rendimiento y resiliencia:** caché (`Cache-Control`/ETag/`CacheService` o export estática), control de límites de GAS, tiempos de actualización y consistencia preview↔público.
3. **Observabilidad y pruebas:** checklist funcional, pruebas de endpoints gestor/público y de render/SEO (metas/schema/canonical), verificación de sitemap/indexación cuando aplique.
4. **Documentación:** contratos finales (público/gestor), `CONFIG`/hojas, procedimiento de publicación/redirecciones y actualización de dependencias de `custom-page`.

### Entregables
- Checklist de QA funcional pasado y documentación operativa actualizada.
- Registro de incidencias y decisiones de mantenimiento.

### Criterio de salida
- Flujo gestor → canal público → web estable, medible y mantenible.

---

## Orden recomendado de ejecución

1. **Fase 0** — decisiones, modelo, capa de curación y contratos alineados a `custom-page/docs`.
2. **Fase 1** — hojas + backend gestor + payload normalizado (base de todo).
3. **Fase 2** (UI Gestor web) y preparación de **Fase 3** en paralelo una vez estable el contrato/payload.
4. **Fase 3** — canal público con contrato y compatibilidad `/api`–`/v1`.
5. **Fase 4** — consumo en web pública y SEO técnico (prerender/redirects/sitemap).
6. **Fase 5** — ajustes, calidad y operación.

## Riesgos y mitigaciones (funcionales)

| Riesgo | Mitigación |
|---|---|
| Desalineación gestor ↔ público ↔ web | Contrato único `Publicacion` normalizado y compatibilidad de rutas/campos documentada. |
| Fichas dinámicas no indexables | Prerender/build por slug con metas/OG/JSON-LD, sitemap y canonicals. |
| Cambios de slug rompen enlaces/SEO | `slug` estable, historial y redirecciones 301; 404/410 para retirados. |
| Límites/rendimiento de GAS | Paginación, caché (`CacheService`/HTTP) y opción de exportación JSON estática. |
| Inconsistencia preview vs público | Reutilizar el mismo payload normalizado de Fase 1 para `preview` y feed público. |

## Registro de avance (a completar durante implementación)

| Fecha | Fase/Tarea | Cambio | Responsable | Evidencia/Notas |
|---|---|---|---|---|
| 2026-11-14 | 0 | Plan/analisis alineados con `../custom-page/docs` y separación de notas de seguridad en `SEGURIDAD-WEB-PUBLICA-NOTAS.md` | — | `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`, este documento |
