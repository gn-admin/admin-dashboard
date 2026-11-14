# Gestor web (admin) — Plan por fases y endpoints para la web

> **Objetivo:** crear un apartado **Gestor web** en el admin para preparar, curar y publicar contenido, y exponer los **endpoints necesarios** para que el proyecto web (`custom-page` / `nueva-version`) pueda consultar y visualizar fichas de animales, eventos e historias.
> **Alcance:** análisis y plan de implementación (sin implementar en este documento). Un solo documento de referencia para construir la gestión y los endpoints que consumirá la web.
> **Fuentes de referencia (proyecto web, leídas):**
> - `../custom-page/docs/estructura-endpoint-publicaciones.md` — contrato de publicaciones: `GET /api/publicaciones` (filtros, paginación), `GET /api/publicaciones/:slug`, esquema `Publicacion` (`icons`, `gallery`, `videos[]/video`, bloques `animal`/`event`, `contentHtml`, `coverImage`, `cta`, `publication/nebak-post-v1`).
> - `../custom-page/docs/analisis-endpoint-seo-formularios-cookies-nueva-version.md` — inventario/consumo `nueva-version` (`HistoriasAPI`, `../data/blog-posts.json`, `post.html?slug`, listados `[data-adoption-list]`), propuesta GAS/Sheets `/v1/*` (contenido, config, taxonomías, `forms/submit`), SEO (prerender/build por slug, metas/OG/JSON-LD, sitemap/robots, redirects 301).
>
> **Notas:** seguridad/privacidad del módulo tratada aparte en `PLAN_SEGURIDAD.md` (no incluida aquí). Dependencias externas: Apps Script (`.gs`), hojas/Sheets, despliegue del canal público y estrategia de render/SEO de la web.

---

## 1. Qué se va a construir

### 1.1 Apartado Gestor web (en el admin)
Un módulo dentro del panel de administración para gestionar el contenido que se publica en la web:
- **Visión global:** sección “Web / Contenido público” con listado de animales y eventos/historias publicables, estado (borrador/publicado/oculto), `indexable`, indicadores de completitud (sin slug/SEO/imagen/descripción), filtros y búsqueda.
- **Curación de animales:** configurar la capa pública de cada animal (sin exponer la ficha interna): título/extracto/descripción pública, estado/categoría pública, selección de `coverImage/gallery/videos`, `icons`, CTA y metadatos SEO (`slug`, `seo_title/description`, OG/Twitter, canonical, robots/indexable).
- **Gestión de eventos/historias publicables:** CRUD de contenido propio (fechas/lugar/media/estado) con campos del bloque `event` y SEO.
- **Acciones rápidas contextuales:** desde la ficha de animal, acceso a “Publicación web” (estado, publicar/ocultar, enlace a edición completa).
- **Previsualización:** vista previa del payload público (`preview`) para validar que el contenido publicado coincide con lo que consumirá la web.
- **Utilidades:** validación de `slug` y resumen/contadores de publicación.

### 1.2 Canal de contenido para la web (consumo externo)
Endpoints/servicio para que el proyecto web obtenga el contenido publicado y renderice fichas y listados:
- Listado de publicaciones con filtros/paginación y detalle por `slug`, conforme al esquema `Publicacion`.
- (Según alcance) datos de configuración/taxonomías y soporte para sitemap/URLs.

---

## 2. Información del proyecto web y consumo esperado (alineado a `custom-page/docs`)

| Zona/componente (`nueva-version`) | Fuente/consumo actual | Necesidad de endpoint/contrato |
|---|---|---|
| `js/blog-api.js` (`HistoriasAPI`) | `../data/blog-posts.json` (`getAllPosts`, `getPostBySlug`, `getSiteConfig`) | Listado y detalle de publicaciones (`/api/publicaciones`, `/:slug` o `/v1` equivalente) |
| `historias.html` | Posts filtrados (excluye adopción/acogida/SC según lógica) | Listado por `type/category/status/listed` |
| `post.html` (`blog-render.js`) | Detalle por `?slug` (ficha/historia, `publication.icons/gallery/videos`, CTA contextual) | Detalle completo: `contentHtml`, media, `animal`/`event`, `seo`, `cta` |
| Listados adopción (`main.js`, `[data-adoption-list]`) | Filtrado por categoría (Gatos/Perros en adopción) | `type=animal` + `category/status/species` |
| Secciones a dinamizar | `acogidas.html`, `casos-externos.html`, `adoptados.html`, destacados home | Consultas filtradas al canal público |
| Búsqueda/chat | Búsqueda sobre posts cargados | Parámetro `q` o dataset cacheado |
| Formularios (alcance opcional) | Envío simulado | `POST /v1/forms/submit` (canal separado del feed) |

**Implicación:** el contrato debe ser compatible con el render actual (`coverImage/image`, `contentHtml`, `icons,gallery,videos`, `type/category/status`, `cta`, contexto `animal/event`).

---

## 3. Modelo de contenido y esquema de publicación

### 3.1 Tipos, categorías y estados
- **`type`:** `animal` | `evento` (y regla para `historia/blog` si se unifica, a definir en Fase 0).
- **`category` (ejemplos):** `Acogida`/`Acogidas`, `Gatos en adopción`, `Perros en adopción`, `Adoptados`, `Caso externo`, `Eventos` (y otros según web).
- **`status` (referencia):** animales `en_adopcion`, `en_acogida`, `adoptado`, `reservado`, `urgente`, `cerrado`; eventos `activo`, `programado`, `finalizado`, `cancelado`.
- **Estados de publicación (gestor):** `borrador` | `publicado` | `oculto` (+ flags `publicado_web`, `indexable`, `listed`, `featured`, `orden`).

### 3.2 Esquema común `Publicacion` (contrato para la web)
Campos alineados con `estructura-endpoint-publicaciones.md`:
- **Base:** `id`, `slug`, `type`, `category`, `status`, `title`, `excerpt`, `publishedAt` (ISO), `updatedAt?`, `coverImage:{src,alt}`, `contentHtml`, `author?`, `tags[]?`, `cta:{label,url}?`.
- **Presentación:** `icons[]` (`{icon,label,value}`), `gallery[]` (`{src,alt,caption?,order?}`), `videos[]` (`{title?,provider,url,thumbnail?,durationSec?,note?}`) y compatibilidad `video`.
- **Condicionales:** `animal` cuando `type="animal"`, `event` cuando `type="evento"`.
- **SEO/extensiones (según alcance):** bloque `seo` (`metaTitle`, `metaDescription`, `ogImage`, `canonical`, `robots`, `og/twitter`), flags/compatibilidad legacy (`image/imageAlt/dateFormatted/readTime`), `featured`, `listed`.

### 3.3 Bloque `animal` (ficha pública curada)
`names[]`, `species`, `breed`, `sex[]`, `age{value,unit,label}`, `size`, `color?`, `health{vaccinated,dewormed,neutered,microchipped,specialNeeds}`, `temperament[]`, `compatibility{dogs,cats,kids}`, `adoption{mode,feeEur,includes,requirements}`, `foster{temporary,reason,durationLabel,expensesPolicy}`, `location{city,province,shelter?}`, `contact{email,phone}`.
> La publicación expone solo los campos curados para la web (capa pública), no la ficha interna completa del gestor.

### 3.4 Bloque `event`
`kind`, `startDate/endDate` (ISO), `timezone`, `location{name,address,city,onlineUrl}`, `organizer{name,contactEmail,phone}`, `audience[]`, `agenda[]`, `registration{required,url,label}`, `milestone{label,value,date}`.

### 3.5 Mapeo interno (gestor) → publicación web
- **Origen:** `animales` del gestor y fuente/entidad dedicada para eventos/historias publicables.
- **Capa de publicación (recomendada separada):** p. ej. hojas `web_animales` / `web_eventos` o `web_publicaciones` referenciando origen (`animal_id`/`id`), con `slug`, estado/flags, campos públicos, media seleccionada, SEO y fechas.
- **Payload normalizado:** función/composición única que genera `Publicacion` y se reutiliza en `preview` (gestor) y en el feed público.

---

## 4. Endpoints del gestor (apartado Gestor web, admin)

> APIs usadas por el admin para gestionar la publicación web. Independientes del canal de consumo de la web.

### 4.1 Publicación web de animales
| Endpoint/acción (propuesto) | Método | Función | Datos clave |
|---|---|---|---|
| `GET ?endpoint=web-animales` | GET | Listar animales con estado/configuración web | filtros (`estado_publicacion`, `q`, `publicado`, paginación), flags de completitud (slug/SEO/imagen) |
| `GET ?endpoint=web-animales&id={animal_id}` | GET | Obtener configuración pública/SEO del animal | campos editoriales, `slug`, flags, estado/categoría pública, media, SEO/OG, validaciones |
| `POST web-animales` (upsert) | POST | Crear/actualizar configuración pública | `animal_id`, `estado_publicacion/publicado_web`, `indexable`, `slug`, campos públicos/SEO, media, `orden/destacado` |
| `POST web-animales-estado` | POST | Publicar/ocultar/despublicar | `animal_id`, `estado_publicacion` |
| `GET ?endpoint=web-animales-preview&id={animal_id}` | GET | Previsualizar payload público (`Publicacion`) | mismo objeto que entregará el canal público |
| `GET ?endpoint=web-slug-check&tipo=animal&slug=...` | GET | Validar unicidad/formato de slug | `{ disponible, normalizado, conflicto? }` |

**Reglas funcionales:** `slug` único por tipo; mínimos para publicar (p. ej. nombre, descripción pública, imagen/estado público) y coherencia con origen.

### 4.2 Eventos/historias publicables
| Endpoint/acción (propuesto) | Método | Función |
|---|---|---|
| `GET/POST web-eventos` | GET/POST | Listar/obtener/crear/actualizar/archivar eventos con datos públicos y SEO |
| `GET web-eventos&id=...` | GET | Detalle para edición |
| `POST web-eventos-estado` | POST | Cambiar estado publicación/indexación |

Campos según §3.4 y contrato `event` (soporte `icons/gallery/videos` si aplica).

### 4.3 Utilidades de gestor
- `GET ?endpoint=web-resumen`: contadores (publicados, borradores, sin SEO/slug/imagen).
- Registro operativo de acciones de publicación/SEO (según capacidad del backend).

---

## 5. Endpoints para la web (canal público de contenido)

> Contrato que consumirá `custom-page/nueva-version` para mostrar fichas y listados. Alineado a `estructura-endpoint-publicaciones.md`.

### 5.1 Listado de publicaciones
- **`GET /api/publicaciones`** (contrato de referencia)
  - **Query:** `type` (`animal|evento`), `category`, `status`, `species` (`gato|perro|otros`), `q`, `page`, `pageSize`, `sort` (ej. `-publishedAt`).
  - **Respuesta:**
```json
{
  "endpoint": "GET /api/publicaciones",
  "generatedAt": "ISO-8601",
  "filters": { "type": [], "category": [], "status": [], "species": [], "q": "string" },
  "pagination": { "page": 1, "pageSize": 12, "total": 0, "totalPages": 0 },
  "data": [ /* Publicacion[] */ ]
}
```
- **Reglas:** solo contenido en estado publicable; paginación acotada; proyección ligera opcional (`fields=card`) para listados.

### 5.2 Detalle de publicación
- **`GET /api/publicaciones/:slug`**: publicación completa (`icons`, `gallery`, `videos[]/video`, `contentHtml`, `animal`/`event`, `seo`/schema si aplica).
- **404** cuando no esté disponible/publicado.

### 5.3 Compatibilidad y endpoints adicionales (`/v1/*`, según alcance)
- `GET /v1/publicaciones` y `GET /v1/publicaciones/:slug` como versión/capa canónica o alias.
- Alias por tipo: `GET /v1/animales` (`type=animal`), `GET /v1/eventos` (`type=evento`), `GET /v1/blog|historias` según taxonomía.
- Soporte: `GET /v1/config` (sitio/contacto/SEO por defecto), `GET /v1/taxonomias` (filtros), `GET /v1/sitemap` o export de URLs+`lastmod`.
- **Estrategia:** un único handler/payload normalizado con alias `/api/publicaciones` ↔ `/v1/*` para mantener compatibilidad.

### 5.4 Requisitos no funcionales
- `Cache-Control` y/o ETag/`Last-Modified` (por `updatedAt/publishedAt`), paginación, JSON estable.
- Opción de exportación JSON estática (manteniendo contrato) si se decide por rendimiento/límites.

### 5.5 Formularios (opcional, canal separado del feed)
- `POST /v1/forms/submit` (`form_type`, `concepto`, `fields`, `page_url`, `privacy_accepted`, `recaptcha{token,action}`) con validación, registro opcional y envío de correo según plantillas (p. ej. `adopcion-animal`, `consulta-animal`, `acogida`, `contacto-general`, etc.).

---

## 6. SEO técnico en la web (requisitos para consumir/publicar)

- **Fichas dinámicas:** `post.html?slug=` solo cliente es insuficiente para indexación/OG; estrategia recomendada **prerender/build por slug** (o SSG/export) usando el endpoint como fuente.
- **URLs canónicas:** rutas limpias por tipo/slug y redirect 301 desde `post.html?slug=` y rutas antiguas.
- **Por página/detalle:** `<title>`, meta description, canonical, robots, Open Graph/Twitter y JSON-LD (`Article/BlogPosting`, `Event`, `BreadcrumbList`, `Organization/WebSite` según aplique).
- **`sitemap.xml` y `robots.txt`:** desde contenido publicado/indexable con `lastmod`; 404/410 o redirección para retirados; parámetros como `?from=` no indexables.

---

## 7. Plan por fases (construcción)

### Fase 0 — Definición y contratos
**Objetivo:** cerrar modelo, contratos y estrategia sin ambigüedades.
- Alinear contrato público (`/api/publicaciones`, `Publicacion`) y compatibilidad `/v1/*`; fijar taxonomía (`type/category/status/species`) y mapeos.
- Decidir modelo de datos (capa separada recomendada `web_animales`/`web_eventos` o `web_publicaciones`), origen de eventos/historias y estados publicables.
- Definir campos de curación por tipo, media (`cover/gallery/videos/icons`), reglas de publicación y `slug`.
- Definir contratos de endpoints del gestor (list/get/upsert/estado/preview/slug-check/resumen) y diseño SEO/URL (rutas, prerender/export, redirects, sitemap).
- (Opcional) cerrar alcance de `forms/submit`.
- **Criterio de salida:** contratos y modelo aprobados y alineados con `custom-page/docs`.

### Fase 1 — Modelo de datos y backend gestor (GAS/Sheets)
**Objetivo:** almacenamiento y APIs de gestión con payload normalizado.
- Crear/ajustar hojas y registrar en `CONFIG` (cabeceras: origen, `slug`, estado/flags, campos públicos, media JSON, SEO/OG, fechas, control).
- Implementar lógica: `slug` único/normalizado, validaciones de publicación, composición de payload `Publicacion` reutilizable (preview = feed).
- Endpoints gestor: `web-animales` (list/get/upsert/estado/preview), `web-eventos` (CRUD/estado), `web-slug-check`, `web-resumen`.
- Pruebas: CRUD, unicidad, reglas y consistencia preview/contrato.
- **Criterio de salida:** se puede curar/publicar/ocultar y obtener `preview` conforme al esquema.

### Fase 2 — UI Gestor web en el admin
**Objetivo:** gestionar contenido público y SEO desde el panel.
- Sección “Web / Contenido público” (listados animales/eventos, estados, completitud, filtros, búsqueda, acciones publicar/ocultar/editar/preview).
- Formularios de curación: campos públicos, selección de media/`icons`/CTA, SEO y bloque `event`.
- Integración contextual en ficha de animal (“Publicación web”) y utilidades (slug-check, resumen).
- UX/validaciones, permisos de UI, rutas relativas, actualizar `CACHE_NAME` en `src/sw.js` ante cambios frontend y `npm test` en verde.
- **Criterio de salida:** preparación, previsualización y publicación/ocultación operativas desde el admin.

### Fase 3 — Canal público de contenido para la web
**Objetivo:** que la web pueda consultar publicaciones y fichas.
- Implementar `GET /api/publicaciones` y `GET /api/publicaciones/:slug` con filtros/paginación y payload normalizado (solo publicables).
- Añadir alias/capa `/v1/*` y soporte (`config`, `taxonomias`, `sitemap`/export) según alcance.
- Cacheo/ETag, paginación y consistencia con `preview`; 404 para no disponibles.
- Validar con casos de consumo de `nueva-version` (listados, detalle, adopción/acogidas/eventos).
- **Criterio de salida:** la web obtiene listados y detalles por contrato definido.

### Fase 4 — Integración web y SEO técnico (`custom-page`)
**Objetivo:** visualizar contenido publicado con SEO correcto.
- Sustituir `blog-posts.json` por consumo del endpoint (`HistoriasAPI`/adaptadores), filtros/búsqueda/paginación y estados vacíos/error.
- Rutas canónicas, prerender/build por slug, redirects 301 (desde `post.html?slug=`), metas/OG/canonical/robots/JSON-LD, `sitemap.xml`/`robots.txt`, 404/410.
- Rendimiento/accesibilidad (imágenes, semántica). (Opcional) `forms/submit` y cookies/políticas según alcance.
- **Criterio de salida:** fichas y listados visibles e indexables con metadatos correctos.

### Fase 5 — Ajustes, calidad y operación
**Objetivo:** estabilizar y mantener el flujo gestor → web.
- Validaciones de completitud/publicación, gestión de cambios de slug/redirects, consistencia preview↔público.
- Caché/rendimiento (GAS/HTTP o export estática), control de límites y tiempos de actualización.
- Pruebas funcionales y de SEO/render, verificación de sitemap/indexación cuando aplique.
- Documentación operativa: contratos finales, `CONFIG`/hojas, procedimiento de publicación/redirects.
- **Criterio de salida:** flujo estable, medible y mantenible.

---

## 8. Orden recomendado y dependencias
1. **Fase 0** → contratos/modelo.
2. **Fase 1** → base (datos + gestor + payload).
3. **Fase 2** y preparación de **Fase 3** en paralelo con contrato estable.
4. **Fase 3** → canal público.
5. **Fase 4** → integración web + SEO.
6. **Fase 5** → estabilización.

## 9. Riesgos y mitigaciones (funcionales)
| Riesgo | Mitigación |
|---|---|
| Desalineación gestor ↔ web | Contrato único `Publicacion` normalizado y compatibilidad `/api`–`/v1` documentada. |
| Fichas dinámicas no indexables | Prerender/build por slug + metas/OG/JSON-LD + sitemap/canonical. |
| Cambios de `slug` rompen enlaces | `slug` estable, historial y redirects 301; 404/410 para retirados. |
| Límites/rendimiento GAS | Paginación, caché (HTTP/`CacheService`) u opción de exportación JSON estática. |
| Inconsistencia preview vs público | Reutilizar la misma composición de payload normalizado. |

## 10. Registro de avance (implementación)
| Fecha | Fase/Tarea | Cambio | Responsable | Evidencia/Notas |
|---|---|---|---|---|
| 2026-11-14 | 0 | Documento único creado: plan por fases del Gestor web y endpoints para la web, alineado a `../custom-page/docs` (seguridad en `PLAN_SEGURIDAD.md`) | — | Este documento |
