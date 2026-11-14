# Gestor web (admin) — Plan por fases y endpoints para la web

> **Objetivo:** crear un apartado **Gestor web** en el admin para preparar, curar y publicar contenido, y exponer los **endpoints necesarios** para que el proyecto web (`custom-page` / `nueva-version`) pueda consultar y visualizar fichas de animales, eventos e historias.
> **Alcance:** análisis, plan e **implementación**. Los puntos ya ejecutados llevan `- [x]`; los pendientes, `- [ ]` con su motivo.
> **Nota importante (SEO):** los campos/metadatos de SEO se gestionan aquí como parte de las **publicaciones** para que la **otra web** los use al renderizarlas (metas, OG, canonical, indexación, sitemap, etc.); no se refieren al SEO del gestor/admin.
> **Base de planificación:** este documento ya incorpora la información analizada sobre el proyecto web (contratos, consumo esperado y requisitos de publicación/SEO) y debe tratarse como fuente autosuficiente para la implementación. No depende de documentación externa adicional.
>
> **Notas:** seguridad/privacidad del módulo tratada aparte en `PLAN_SEGURIDAD.md` (no incluida aquí). Dependencias externas: Apps Script (`.gs`), hojas/Sheets, despliegue del canal público y estrategia de render/SEO de la web.

---

## 0. Estado de implementación (2026-11-14)

| Capa | Archivo | Estado |
|---|---|---|
| Lógica de publicaciones + canal público (GAS) | `apps-script/WebPublicaciones.gs` | `- [x]` implementado |
| Rutas, permisos y canal público (GAS) | `apps-script/Code.gs` | `- [x]` implementado |
| Hoja y dominio público en configuración | `apps-script/Config.gs` | `- [x]` claves añadidas (falta el ID real de la hoja) |
| UI Gestor web (listado, fichas, preview, slug) | `src/js/web.js` | `- [x]` implementado |
| Endpoints del cliente | `src/js/api.js` | `- [x]` implementado |
| Navegación, permisos y ruta | `src/js/app.js`, `src/js/dashboard.js`, `src/index.html` | `- [x]` implementado |
| Estilos | `src/css/styles.css` | `- [x]` implementado |
| Visor público (referencia de lo que verá la web) | `src/publico.html`, `src/css/publico.css`, `src/js/publico.js` | `- [x]` listado + detalle + SEO |
| Acceso desde el login | `src/index.html`, `src/css/styles.css` | `- [x]` botón “Ver publicaciones” (sin sesión) |
| Service worker | `src/sw.js` | `- [x]` `CACHE_NAME` → `v217`, assets `js/web.js` y `js/publico.js` |
| Pruebas | `tests/web.test.js`, `tests/web-backend.test.js`, `tests/publico.test.js`, `tests/sheets.test.js` | `- [x]` 444 en total (incluye cabeceras en hoja vacía, canonical condicional y pestaña única) |

**Pasos manuales pendientes (fuera de git):**

- [x] Hoja creada e ID en `CONFIG.sheets.webPublicaciones` + `SHEET_WEB_PUBLICACIONES_ID` en `.env` (y en el `Config.gs` local). La pestaña se llama `Hoja 1` y se selecciona con `SHEET_WEB_PUBLICACIONES_TAB`; las cabeceras de §3.6 se crean solas al guardar la primera publicación (ver §0.1).
- [x] `apps-script/WebPublicaciones.gs` desplegado como **nueva versión** (2026-11-14) y verificado en vivo: `publicaciones`, `sitemap`, `redirects` y `taxonomias` responden `success`; circuito completo publicar → feed → ficha → ocultar comprobado con Laia. Nota operativa: guardar el fichero no publica nada, hace falta “Nueva versión”.
- [x] `CONFIG.PUBLIC_WEB_BASE_URL` con valor actual `https://gn-admin.github.io/admin-dashboard`; cuando exista el dominio propio, cambiarlo a `https://gruponebak.net` (sin barra final).
- [x] Origen de la web pública permitido: `https://gn-admin.github.io` cubre `/admin-dashboard/` (la comprobación reduce a esquema+host y también lee `Referer`, necesario para JSONP). Al pasar a dominio propio, añadir `https://gruponebak.net` a `CONFIG.ALLOWED_ORIGINS`.
- [x] Canal público accesible sin token confirmado en el despliegue (`?endpoint=publicaciones` responde sin sesión); los endpoints del gestor siguen devolviendo 401 sin token.
- [ ] Desplegar GitHub Pages: `publico.html` viaja en `src/`, así que el botón del login funciona en cuanto se publique el workflow.

### Decisiones cerradas en Fase 0

- [x] **Modelo de datos único:** una sola hoja `WebPublicaciones` (no `web_animales` + `web_eventos`). Los animales referencian `origen_id`; eventos e historias son contenido propio. Menos configuración y un único compositor de payload.
- [x] **Taxonomía `type`:** `animal` | `evento` | `historia`. `historia` cubre blog/posts sin bloque `event`.
- [x] **Slug:** único **por tipo**, normalizado (minúsculas, sin acentos, guiones) y máximo 80 caracteres.
- [x] **Estados:** publicación `borrador` | `publicado` | `oculto`; `sin_publicar` es un estado derivado (animal sin fila web).
- [x] **Publicable:** `estado_publicacion = publicado` **y** `listed !== false`. (`indexable` solo afecta a `robots` y al sitemap).
- [x] **Preview = feed:** ambos usan `webConstruirPublicacion`, verificado con prueba (`preview del gestor == canal público`).
- [x] **Transporte del canal público:** `GET` sin token con `?endpoint=…`; alias `/api/...` y `/v1/...`. Soporta **JSONP** (`callback=`) porque Apps Script no permite cabeceras CORS ni `Cache-Control`/`ETag`.
- [x] **`forms/submit`:** fuera de alcance por ahora (canal separado, §5.5).

### 0.1 Pestaña de la hoja web y cabeceras

- [x] **Selección de pestaña:** se exige el nombre configurado (`sheetName`). Si no existe pero el documento tiene **una única pestaña** (`Hoja 1`), se acepta: no hay ambigüedad. Con **dos o más pestañas** y sin coincidencia, el canal responde `sheet_not_found` y el gestor no escribe nada; nunca se adivina con la primera.
- [x] **Cabeceras:** si la hoja está vacía, `appendToSheet` escribe las 26 columnas de §3.6 antes de la fila. Cubierto por `tests/sheets.test.js` (hoja vacía, primera publicación y segunda reutilizando cabecera).
- [x] **Canonical condicional:** con base `*.github.io` el backend devuelve `canonical: ""` y sitemap vacío con `notice` (las rutas `/animales/<slug>` aún no existen en Pages); con dominio propio vuelve a `dominio + ruta`. El visor omite `<link rel="canonical">` y `og:url` cuando viene vacío (la ruta relativa `url` del payload nunca se usa como canonical).
- [ ] **Propuesto (no implementado): endurecer `getSheet()`.** Hoy cae a la primera pestaña aunque la configurada no exista. Propuesta: mantener el fallback solo con una pestaña y lanzar error con ≥2 pestañas sin coincidencia (registrando los nombres en `Logger`), para que un `sheetName` mal puesto no escriba en la hoja equivocada en silencio. Afecta a todos los módulos, así que requiere sus propios tests.

---

## 1. Qué se va a construir

### 1.1 Apartado Gestor web (en el admin)
Un módulo dentro del panel de administración para gestionar el contenido que se publica en la web:
- [x] **Visión global:** sección “Web / Contenido público” con listado de animales y eventos/historias publicables, estado (borrador/publicado/oculto), `indexable`, indicadores de completitud (sin slug/SEO de publicación/imagen/descripción), filtros y búsqueda.
- [x] **Curación de animales:** configurar la capa pública de cada animal (sin exponer la ficha interna): título/extracto/descripción pública, estado/categoría pública, selección de `coverImage/gallery/videos`, `icons`, CTA y metadatos SEO de la publicación para la web (`slug`, `seo_title/description`, OG/Twitter, canonical, robots/indexable).
- [x] **Gestión de eventos/historias publicables:** CRUD de contenido propio (fechas/lugar/media/estado) con campos del bloque `event` y metadatos SEO de la publicación para la web.
- [x] **Acciones rápidas contextuales:** desde la ficha de animal, botón “Publicación web” (estado, publicar/ocultar, edición completa).
- [x] **Previsualización:** vista previa del payload público (`preview`) para validar que el contenido publicado coincide con lo que consumirá la web.
- [x] **Utilidades:** validación de `slug` (comprobación en vivo contra el backend) y resumen/contadores de publicación.

### 1.2 Canal de contenido para la web (consumo externo)
Endpoints/servicio para que el proyecto web obtenga el contenido publicado y renderice fichas y listados:
- [x] Listado de publicaciones con filtros/paginación y detalle por `slug`, conforme al esquema `Publicacion`.
- [x] Datos de configuración/taxonomías y soporte para sitemap/URLs.

---

## 2. Información del proyecto web y consumo esperado (alineado al análisis realizado)

| Zona/componente (`nueva-version`) | Fuente/consumo actual | Necesidad de endpoint/contrato | Estado |
|---|---|---|---|
| `js/blog-api.js` (`HistoriasAPI`) | `../data/blog-posts.json` (`getAllPosts`, `getPostBySlug`, `getSiteConfig`) | Listado y detalle de publicaciones (`/api/publicaciones`, `/:slug` o `/v1` equivalente) | [x] canal listo; sustitución en la web → Fase 4 |
| `historias.html` | Posts filtrados (excluye adopción/acogida/SC según lógica) | Listado por `type/category/status/listed` | [x] `type`, `category`, `status`, `q`, `page`, `sort` |
| `post.html` (`blog-render.js`) | Detalle por `?slug` (ficha/historia, `publication.icons/gallery/videos`, CTA contextual) | Detalle completo: `contentHtml`, media, `animal`/`event`, `seo`, `cta` | [x] `endpoint=publicacion&slug=` |
| Listados adopción (`main.js`, `[data-adoption-list]`) | Filtrado por categoría (Gatos/Perros en adopción) | `type=animal` + `category/status/species` | [x] filtros en el canal público |
| Secciones a dinamizar | `acogidas.html`, `casos-externos.html`, `adoptados.html`, destacados home | Consultas filtradas al canal público | [x] disponibles (`category`, `featured` en payload) |
| Búsqueda/chat | Búsqueda sobre posts cargados | Parámetro `q` o dataset cacheado | [x] `q` sobre título/extracto/contenido/tags |
| Formularios (alcance opcional) | Envío simulado | `POST /v1/forms/submit` (canal separado del feed) | [ ] fuera de alcance (§5.5) |

**Implicación:** el contrato debe ser compatible con el render actual (`coverImage/image`, `contentHtml`, `icons,gallery,videos`, `type/category/status`, `cta`, contexto `animal/event`) → [x] cubierto con campos de compatibilidad (`image`, `imageAlt`, `dateFormatted`, `readTime`).

---

## 3. Modelo de contenido y esquema de publicación

### 3.1 Tipos, categorías y estados
- [x] **`type`:** `animal` | `evento` | `historia` (decisión de Fase 0, ver §0).
- [x] **`category` (ejemplos):** `Acogida`/`Acogidas`, `Gatos en adopción`, `Perros en adopción`, `Adoptados`, `Caso externo`, `Eventos`, `Historias` (select en la ficha de animal; texto libre en eventos).
- [x] **`status` (referencia):** animales `en_adopcion`, `en_acogida`, `adoptado`, `reservado`, `urgente`, `cerrado`; eventos `activo`, `programado`, `finalizado`, `cancelado`.
- [x] **Estados de publicación (gestor):** `borrador` | `publicado` | `oculto` (+ flags `indexable`, `listed`, `featured`, `orden`).

### 3.2 Esquema común `Publicacion` (contrato para la web) — implementado
Campos alineados con `estructura-endpoint-publicaciones.md`:
- [x] **Base:** `id`, `slug`, `type`, `category`, `status`, `title`, `excerpt`, `publishedAt` (ISO), `updatedAt?`, `coverImage:{src,alt}`, `contentHtml`, `author?`, `tags[]?`, `cta:{label,url}?`.
- [x] **Presentación:** `icons[]` (`{icon,label,value}`), `gallery[]` (`{src,alt,caption?,order?}`), `videos[]` (`{title?,provider,url,thumbnail?,durationSec?,note?}`) y compatibilidad `video`.
- [x] **Condicionales:** `animal` cuando `type="animal"`, `event` cuando `type="evento"`.
- [x] **Metadatos SEO de la publicación:** bloque `seo` (`metaTitle`, `metaDescription`, `ogImage`, `canonical`, `robots`, `og/twitter`), flags/compatibilidad legacy (`image/imageAlt/dateFormatted/readTime`), `featured`, `listed`.
- [x] **Extras del contrato implementado:** `url` (ruta pública por tipo) y `canonical` de primer nivel.

### 3.3 Bloque `animal` (ficha pública curada) — implementado
`names[]`, `species`, `breed`, `sex[]`, `age{value,unit,label}`, `size`, `color?`, `health{vaccinated,dewormed,neutered,microchipped,specialNeeds}`, `temperament[]`, `compatibility{dogs,cats,kids}`, `adoption{mode,feeEur,includes,requirements}`, `foster{temporary,reason,durationLabel,expensesPolicy}`, `location{city,province,shelter?}`, `contact{email,phone}`.
> [x] La publicación expone solo los campos curados para la web (capa pública), con respaldo de nombre/especie/raza/sexo/edad/foto desde la ficha interna. **No** se vuelca la ficha interna completa.

### 3.4 Bloque `event` — implementado
`kind`, `startDate/endDate` (ISO), `timezone`, `location{name,address,city,onlineUrl}`, `organizer{name,contactEmail,phone}`, `audience[]`, `agenda[]`, `registration{required,url,label}`, `milestone{label,value,date}`.

### 3.5 Mapeo interno (gestor) → publicación web — implementado
- [x] **Origen:** `animales` del gestor (`origen_id`) y la propia hoja para eventos/historias.
- [x] **Capa de publicación separada:** hoja `webPublicaciones` (referencia `origen_id`, `slug`, estado/flags, campos públicos, media JSON, SEO JSON, fechas).
- [x] **Payload normalizado:** `webConstruirPublicacion` es la composición única reutilizada en `preview` (gestor) y en el feed público.

### 3.6 Cabeceras de la hoja `WebPublicaciones`

```
id | tipo | origen_id | slug | estado_publicacion | indexable | listed | featured | orden
titulo | extracto | contenido_html | categoria | estado_publico | especie | autor | tags_json
media_json | seo_json | cta_json | animal_json | evento_json
publicado_en | actualizado_en | creado_en | slug_historial
```

`media_json`, `seo_json`, `cta_json`, `animal_json`, `evento_json` y `tags_json` guardan JSON serializado.

---

## 4. Endpoints del gestor (apartado Gestor web, admin)

> APIs usadas por el admin para gestionar la publicación web. Independientes del canal de consumo de la web. Todas exigen token; solo `admin` y `coordinador` pueden leerlas y escribirlas.

### 4.1 Publicación web de animales — implementado
| Endpoint/acción | Método | Función | Estado |
|---|---|---|---|
| `GET ?endpoint=web-animales` | GET | Listar animales con estado/configuración web (filtros `estado_publicacion`, `q`, `publicado`, paginación; flags de completitud) | [x] |
| `GET ?endpoint=web-animales&id={animal_id}` | GET | Configuración pública + metadatos SEO + datos de origen + completitud | [x] |
| `POST web-animales` (upsert) | POST | Crear/actualizar configuración pública | [x] |
| `POST web-animales-estado` | POST | Publicar/ocultar/despublicar | [x] |
| `GET ?endpoint=web-animales-preview&id={animal_id}` | GET | Previsualizar payload público (`Publicacion`) | [x] |
| `GET ?endpoint=web-slug-check&tipo=animal&slug=...` | GET | Validar unicidad/formato de slug (`{disponible, normalizado, valido, conflicto?}`) | [x] |

**Reglas funcionales:** `slug` único por tipo; mínimos para publicar (título, categoría, estado público, descripción ≥ 40 caracteres, portada —con foto del animal como respaldo— y meta descripción o extracto) y coherencia con origen. [x]

### 4.2 Eventos/historias publicables — implementado
| Endpoint/acción | Método | Función | Estado |
|---|---|---|---|
| `GET/POST web-eventos` | GET/POST | Listar/obtener/crear/actualizar/archivar (`accion=archivar`) eventos e historias con datos públicos y SEO | [x] |
| `GET web-eventos&id=...` | GET | Detalle para edición | [x] |
| `POST web-eventos-estado` | POST | Cambiar estado publicación | [x] |
| `GET web-eventos-preview&id=...` | GET | Previsualizar payload público | [x] |

Campos según §3.4 y contrato `event`; soporte `media.coverImage` y `gallery`. [x]

### 4.3 Utilidades de gestor — implementado
- [x] `GET ?endpoint=web-resumen`: contadores (publicados, borradores, ocultos, sin publicar, incompletas, sin SEO).
- [x] Registro operativo de acciones de publicación (`registrarAuditoria` con `publicacion_web` / `archivar_publicacion`; si la hoja de auditoría está configurada).

---

## 5. Endpoints para la web (canal público de contenido)

> Contrato que consumirá `custom-page/nueva-version`. **No requieren token**: solo devuelven contenido publicado y listado.

### 5.1 Listado de publicaciones — implementado
- **`GET /api/publicaciones`** → en Apps Script: `?endpoint=publicaciones` (o `api/publicaciones`, `v1/publicaciones`).
  - **Query:** `type` (`animal|evento|historia`), `category`, `status`, `species` (`gato|perro|otros`), `q`, `page`, `pageSize` (máx. 50), `sort` (`-publishedAt` | `publishedAt` | `title` | `updatedAt`), `fields=card`, `nocache=1`, `callback`.
  - **Respuesta:**
```json
{
  "status": "success",
  "endpoint": "GET /api/publicaciones",
  "generatedAt": "ISO-8601",
  "filters": { "type": [], "category": [], "status": [], "species": [], "q": "string" },
  "applied": { "type": "", "category": "", "status": "", "species": "", "q": "" },
  "pagination": { "page": 1, "pageSize": 12, "total": 0, "totalPages": 0 },
  "data": [ /* Publicacion[] */ ]
}
```
- **Reglas:** [x] solo contenido en estado publicable; [x] paginación acotada; [x] proyección ligera (`fields=card`); [x] `filters` devuelve los valores disponibles para construir la UI.

### 5.2 Detalle de publicación — implementado
- [x] **`GET /api/publicaciones/:slug`** → `?endpoint=publicaciones/{slug}` o `?endpoint=publicacion&slug=...`: publicación completa (`icons`, `gallery`, `videos[]/video`, `contentHtml`, `animal`/`event`, `seo`).
- [x] **404 lógico** (`status: "error"`) cuando no está disponible/publicada (Apps Script responde 200; el `status` es el contrato real del proyecto).
- [x] **Slug antiguo → 301:** si el slug no es el actual pero figura en `slug_historial`, responde `status:"success"` con `redirect:{from,to,slug,permanent:true}` y el `data` de la ficha vigente.

### 5.3 Compatibilidad y endpoints adicionales (`/v1/*`) — implementado
- [x] `GET /v1/publicaciones` y `GET /v1/publicaciones/:slug` como alias.
- [x] Alias por tipo: `GET /v1/animales`, `GET /v1/eventos`, `GET /v1/blog|historias`.
- [x] Soporte: `GET /v1/config`, `GET /v1/taxonomias`, `GET /v1/sitemap` (URLs + `lastmod`; también `sitemap.xml`).
- [x] `GET /v1/redirects` (o `?endpoint=redirects`): mapa 301 `{from,to,status,type,slug,currentSlug,changedAt}` para generar redirecciones en el hosting.
- [x] **Estrategia:** un único handler/payload normalizado con alias `/api/publicaciones` ↔ `/v1/*`.

### 5.4 Requisitos no funcionales — parcial
- [x] Paginación, JSON estable y caché interna de 60 s (`CacheService`; `nocache=1` fuerza lectura fresca).
- [x] `generatedAt` + `lastmod`/`updatedAt` para cacheo del consumidor.
- [x] **Diagnóstico explícito:** si falta el ID o la pestaña, el canal responde `status:"warning"` con `code:"sheet_missing"` / `code:"sheet_not_found"`; `success` con `total:0` significa “configurado y vacío”.
- [x] **Lectura por nombre, sin adivinar:** se exige la pestaña configurada; solo se acepta el nombre distinto si el documento tiene **una única pestaña** (`Hoja 1`). Con dos o más pestañas y sin coincidencia se responde `sheet_not_found` y no se lee ni escribe nada (ver §0.1).
- [ ] `Cache-Control` / `ETag` / `Last-Modified` reales: **imposible en Apps Script** (`ContentService` no permite cabeceras). Mitigación aplicada: caché interna + JSONP + `nocache`.
- [ ] Exportación JSON estática (opción de rendimiento/límites): pendiente de decisión; el contrato ya es compatible.

### 5.5 Formularios (opcional, canal separado del feed) — pendiente
- [ ] `POST /v1/forms/submit` (`form_type`, `concepto`, `fields`, `page_url`, `privacy_accepted`, `recaptcha{token,action}`) con validación, registro opcional y envío de correo según plantillas. Fuera del alcance de esta iteración.

---

## 6. SEO de las publicaciones en la web pública (requisitos para la otra web)

> Aplica a las fichas/publicaciones renderizadas en `custom-page/nueva-version`, no al gestor/admin. El gestor provee los campos/metadatos; la web los consume y los aplica.

- [x] **El gestor provee:** `seo.metaTitle`, `seo.metaDescription`, `seo.ogImage`, `seo.canonical`, `seo.robots`, `url` por tipo, `indexable`, `publishedAt`/`updatedAt`.
- [ ] **Fichas dinámicas:** `post.html?slug=` solo cliente es insuficiente para indexación/OG; estrategia recomendada **prerender/build por slug** (o SSG/export) usando el endpoint como fuente. → se cierra en el visor (§7.1) y luego se porta a `custom-page`.
- [~] **URLs canónicas:** `seo.canonical` aplicado en el visor; el canonical, la imagen OG y los robots se derivan solos (dominio + ruta, portada e `indexable`). Rutas limpias y redirect 301 desde `post.html?slug=` pendientes en la web real.
- [x] **Por página/detalle:** `<title>`, meta description, canonical, robots, OG/Twitter y JSON-LD, aplicados desde la publicación en `src/js/publico.js`.
- [x] **`web-sitemap`:** endpoint listo (published + indexable + `lastmod`).
- [ ] **`sitemap.xml` y `robots.txt` físicos:** generarlos en el hosting de la web; 404/410 para retirados.

---

## 7. Plan por fases (construcción)

### Fase 0 — Definición y contratos — completada
**Objetivo:** cerrar modelo, contratos y estrategia sin ambigüedades.
- [x] Alinear contrato público (`/api/publicaciones`, `Publicacion`) y compatibilidad `/v1/*`; fijar taxonomía (`type/category/status/species`) y mapeos (ver §0).
- [x] Decidir modelo de datos (capa separada `web_publicaciones`), origen de eventos/historias y estados publicables.
- [x] Definir campos de curación por tipo, media (`cover/gallery/videos/icons`), reglas de publicación y `slug`.
- [x] Definir contratos de endpoints del gestor (list/get/upsert/estado/preview/slug-check/resumen) y diseño SEO/URL (rutas, prerender/export, redirects, sitemap).
- [x] (Opcional) cerrar alcance de `forms/submit` → fuera de alcance.

### Fase 1 — Modelo de datos y backend gestor (GAS/Sheets) — completada
**Objetivo:** almacenamiento y APIs de gestión con payload normalizado.
- [x] Hoja y registro en `CONFIG` (cabeceras en §3.6).
- [x] Lógica: `slug` único/normalizado, validaciones de publicación, composición de payload `Publicacion` reutilizable (preview = feed).
- [x] Endpoints gestor: `web-animales` (list/get/upsert/estado/preview), `web-eventos` (CRUD/estado/preview), `web-slug-check`, `web-resumen`.
- [x] Pruebas: CRUD, unicidad, reglas y consistencia preview/contrato (`tests/web-backend.test.js`).

### Fase 2 — UI Gestor web en el admin — completada
**Objetivo:** gestionar contenido público y los metadatos SEO de las publicaciones desde el panel.
- [x] Sección “Web / Contenido público” (listados animales/eventos, estados, completitud, filtros, búsqueda, acciones publicar/ocultar/editar/preview).
- [x] Formularios de curación: campos públicos, selección de media/`icons`/CTA, metadatos SEO y bloque `event`; bloque `animal` curado.
- [x] Integración contextual en ficha de animal (“Publicación web”) y utilidades (slug-check en vivo, resumen).
- [x] UX/validaciones, permisos de UI (admin + coordinación), rutas relativas, `CACHE_NAME` en `src/sw.js` y `npm test` en verde.
- [~] Revisión en navegador: listado, ficha, estados vacío/error y metas comprobados en el visor local (`http://localhost:8099/publico`). Falta la revisión visual en Pages, bloqueada por el despliegue del frontend.

### Fase 3 — Canal público de contenido para la web — completada
**Objetivo:** que la web pueda consultar publicaciones y fichas.
- [x] `GET /api/publicaciones` y `GET /api/publicaciones/:slug` con filtros/paginación y payload normalizado (solo publicables).
- [x] Alias/capa `/v1/*` y soporte (`config`, `taxonomias`, `sitemap`) según alcance.
- [x] Caché interna, paginación, consistencia con `preview`; error lógico para no disponibles.
- [x] Validado con el visor público de este repo (`src/publico.html`): listado con filtros/paginación, detalle, 404 y SEO. La validación dentro de `nueva-version` queda en Fase 4.

### Fase 4 — Integración en la web y SEO — **aceptación en el visor (`publico`)**, port posterior a `custom-page`
**Objetivo:** fijar y verificar **aquí** el comportamiento definitivo que la web debe replicar.
**Criterio de aceptación:** el **100% de las comprobaciones se hace sobre `src/publico.html` + `src/js/publico.js`**. `custom-page/nueva-version` se actualiza **después**, replicando lo ya validado (mismo contrato, mismas metas, mismos estados).
- [x] Consumo del canal sin JSON estático, con filtros/búsqueda/paginación y estados vacío/error.
- [x] Metas/OG/canonical/robots y JSON-LD (`Article`/`Event`/`BlogPosting`) aplicados desde la publicación, validados en el visor (§7.1).
- [~] **Port a `custom-page/nueva-version`** (otro repositorio): sustituir `blog-posts.json`/`HistoriasAPI` por el canal y replicar metas, JSON-LD, redirects y estados.
- [~] Prerender/build por slug y `sitemap.xml`/`robots.txt` físicos: se resuelven en el hosting al integrar; el **mapa 301** ya está en `GET /v1/redirects`.
- [~] Rendimiento/accesibilidad: medido en el visor (sin desbordes a 360/1280, 1 y 3 columnas, labels, `alt`, roles); falta auditoría formal en la web final.

> El visor es la **referencia ejecutable**: lo que aquí funciona es lo que se porta. No se dará por buena la web hasta que reproduzca §7.1 en su propio dominio.

### 7.1 Aceptación del visor público (verificado 2026-11-14, 449 tests en verde)

Pruebas de comportamiento con el canal **simulado** en el navegador (sin escribir en la hoja) + endpoint real para el estado vacío.

> Las suites que cargan `apps-script/*.gs` (`web-backend`, `sheets`) se **saltan en CI**, porque el backend no se versiona; en local se ejecutan completas (449). En CI quedan 401 por ese motivo.

- [x] **Listado:** 12 tarjetas, contador “25 publicaciones”, enlaces relativos `#/publicacion/<slug>`, paginador “Página 1 de 3”.
- [x] **Filtros y búsqueda:** la categoría elegida viaja como parámetro al endpoint; sin coincidencias muestra “Sin resultados” con acción para limpiar.
- [x] **Paginación:** pulsar “Siguiente” pide `page=2`.
- [x] **Fichas por tipo:** animal → JSON-LD `Article`; evento → `Event` con bloque de datos; historia → `BlogPosting`.
- [x] **Canonical condicional:** ficha sin canonical (base GitHub Pages) → sin `<link rel="canonical">` y `og:url` vacío; listado y páginas de estado usan la URL propia.
- [x] **404 lógico:** “Publicación no disponible” + `noindex,nofollow` + enlace al listado.
- [x] **Slug histórico:** `redirect.slug` reescribe la URL con `history.replaceState` y muestra la ficha vigente.
- [x] **Estados de canal:** “Canal público sin activar” vs “No se pudieron cargar las publicaciones”, con botón **Reintentar**; ambos `noindex,nofollow` (corregido en esta pasada: antes se indexaban).
- [x] **Accesibilidad básica:** `role="search"` en la barra, `label for` en todos los campos, `alt` de portada, placeholder “Sin imagen”, `role="status"` al cargar, `aria-label` en el paginador.
- [x] **Responsive:** 360 px → 1 columna sin desbordamiento horizontal; 1280 px → 3 columnas.
- [ ] **Revisión visual en Pages** (colores/espaciados reales): bloqueada por el despliegue del frontend.

### Fase 5 — Ajustes, calidad y operación — parcial
**Objetivo:** estabilizar y mantener el flujo gestor → web.
- [x] Validaciones de completitud/publicación y consistencia preview↔público (con pruebas).
- [x] Caché interna del canal público y control de límites (paginación máx. 50, 60 s de caché).
- [x] Diagnóstico de configuración en gestor y canal (`sheet_missing` / `sheet_not_found` vs lista vacía) y lectura estricta de la pestaña `WebPublicaciones`.
- [x] Gestión de cambios de slug: historial `slug_historial` + redirección 301 en el detalle y mapa `GET /v1/redirects`; un slug histórico no se puede reutilizar.
- [~] Pruebas de SEO/render: validadas en el visor (metas/OG/canonical/JSON-LD, 404 y estados vacíos); falta la verificación de indexación real en la web (Fase 4).
- [x] Documentación operativa: contratos y cabeceras de hoja en este documento.
- [x] Procedimiento de publicación/redirects para el equipo en `.internal-docs/GESTOR_WEB_OPERATIVA.md`.

---

## 8. Orden recomendado y dependencias
1. **Fase 0** → contratos/modelo. `[x]`
2. **Fase 1** → base (datos + gestor + payload). `[x]`
3. **Fase 2** y preparación de **Fase 3** en paralelo con contrato estable. `[x]`
4. **Fase 3** → canal público. `[x]`
5. **Fase 4** → integración web + SEO. `[ ]`
6. **Fase 5** → estabilización. `[~]` parcial

## 9. Riesgos y mitigaciones (funcionales)
| Riesgo | Mitigación | Estado |
|---|---|---|
| Desalineación gestor ↔ web | Contrato único `Publicacion` normalizado y compatibilidad `/api`–`/v1` documentada. | [x] |
| Fichas dinámicas no indexables | Prerender/build por slug + metas/OG/JSON-LD + sitemap/canonical. | [ ] Fase 4 |
| Cambios de `slug` rompen enlaces | `slug` estable, historial y redirects 301; 404/410 para retirados. | [x] slug único + historial + 301 (`/v1/redirects`); 410 para retirados pendiente |
| Límites/rendimiento GAS | Paginación, caché (`CacheService`) u opción de exportación JSON estática. | [x] caché + paginación |
| Inconsistencia preview vs público | Reutilizar la misma composición de payload normalizado. | [x] probado |

## 10. Registro de avance (implementación)
| Fecha | Fase/Tarea | Cambio | Responsable | Evidencia/Notas |
|---|---|---|---|---|
| 2026-11-14 | 0 | Documento único creado: plan por fases del Gestor web y endpoints para la web (autosuficiente, seguridad en `PLAN_SEGURIDAD.md`) | — | Este documento |
| 2026-11-14 | 0 | Decisiones de modelo/taxonomía/transporte cerradas | — | §0 |
| 2026-11-14 | 1 | `WebPublicaciones.gs`: hoja única, slug único, validaciones, compositor `Publicacion`, endpoints gestor y canal público | — | `tests/web-backend.test.js` |
| 2026-11-14 | 1 | `Code.gs`: rutas `web-*`, permisos admin/coordinación, canal público sin token con alias y JSONP | — | `tests/web-backend.test.js` |
| 2026-11-14 | 2 | `web.js` + navegación + ficha de animal + estilos + `CACHE_NAME` v208 | — | `tests/web.test.js` |
| 2026-11-14 | 3 | Canal público `/api/publicaciones`, `/:slug`, `/v1/*`, config, taxonomías, sitemap | — | `tests/web-backend.test.js` |
| 2026-11-14 | 3/4 | Visor público `publico.html` (JSONP al canal, listado y detalle, SEO y JSON-LD) y botón “Ver publicaciones” en el login | — | `tests/publico.test.js` |
| 2026-11-14 | 5 | Pruebas y documentación del contrato | — | 418 pruebas en verde |
| 2026-11-14 | 5 | Historial de slugs (`slug_historial`): 301 en `publicacion` y mapa `/v1/redirects`; slugs históricos no reutilizables | — | `tests/web-backend.test.js`, `tests/publico.test.js` |
| 2026-11-14 | 5 | Procedimiento operativo de publicación y redirects | — | `.internal-docs/GESTOR_WEB_OPERATIVA.md` |
| 2026-11-14 | 5 | Distinguir hoja sin configurar/pestaña inexistente de “sin publicaciones”; sin fallback a la primera pestaña | — | `tests/web-backend.test.js` |
| 2026-11-14 | 5 | SEO simplificado: solo meta title (auto desde el título) y meta description; canonical/OG/robots derivados. Base por defecto = GitHub Pages | — | `tests/web-backend.test.js`, `tests/web.test.js` |
