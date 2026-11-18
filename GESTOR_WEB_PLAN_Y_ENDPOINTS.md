# Gestor web (admin) — Plan por fases y endpoints para la web

> **Objetivo:** crear un apartado **Gestor web** en el admin para preparar, curar y publicar contenido, y exponer los **endpoints necesarios** para que el proyecto web (`proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` / `nueva-version`) pueda consultar y visualizar fichas de animales, eventos e historias.
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
| Visor público (referencia de lo que verá la web) | `src/publico.html`, `src/css/publico.css`, `src/js/publico.js` | `- [x]` listado + detalle + SEO, con el tema de `nueva-version` |
| Prerender SEO del visor | `scripts/prerender-publico.js` | `- [x]` fichas estáticas + `sitemap.xml` + `robots.txt` en el build |
| Acceso desde el login | `src/index.html`, `src/css/styles.css` | `- [x]` botón “Ver publicaciones” (sin sesión) |
| Service worker | `src/sw.js` | `- [x]` `CACHE_NAME` → `v267`, assets `js/web.js`, `js/publico.js`, `js/publico-embed.js` y `css/publico.css` |
| Pruebas | `tests/web.test.js`, `tests/web-backend.test.js`, `tests/publico.test.js`, `tests/publico-embed.test.js`, `tests/sheets.test.js` | `- [x]` 646 en local / 636 en CI (incluye cabeceras en hoja vacía, canonical condicional, pestaña única, prerender SEO, páginas de retirada, 410, ficha configurable v1.1 y vídeo click-to-load) |
| Ficha configurable desde la publicación | §7.3 | `- [x]` contrato aditivo v1.1 **implementado en local** (sin desplegar): backend validado (orden, `videoModo`, `tags`, `contenido`), precedencia `ficha > base`, controles estructurados con orden, visor/prerender y pruebas; queda el despliegue de `.gs`/Pages y el port |
| Port a la web (`main`) | externo | Planificación trasladada a `TRANSFERIR_A_MAIN.md` |

**Pasos manuales pendientes (fuera de git):**

- [x] Hoja creada e ID en `CONFIG.sheets.webPublicaciones` + `SHEET_WEB_PUBLICACIONES_ID` en `.env` (y en el `Config.gs` local). La pestaña se llama `Hoja 1` y se selecciona con `SHEET_WEB_PUBLICACIONES_TAB`; las cabeceras de §3.6 se crean solas al guardar la primera publicación (ver §0.1).
- [x] `apps-script/WebPublicaciones.gs` desplegado como **nueva versión** (2026-11-14) y verificado en vivo: `publicaciones`, `sitemap`, `redirects` y `taxonomias` responden `success`; circuito completo publicar → feed → ficha → ocultar comprobado con Laia. Nota operativa: guardar el fichero no publica nada, hace falta “Nueva versión”.
- [x] `CONFIG.PUBLIC_WEB_BASE_URL` con valor actual `https://gn-admin.github.io/admin-dashboard`; cuando exista el dominio propio, cambiarlo a `https://gruponebak.net` (sin barra final).
- [x] Origen de la web pública permitido: `https://gn-admin.github.io` cubre `/admin-dashboard/` (la comprobación reduce a esquema+host y también lee `Referer`, necesario para JSONP). Al pasar a dominio propio, añadir `https://gruponebak.net` a `CONFIG.ALLOWED_ORIGINS`.
- [x] Canal público accesible sin token confirmado en el despliegue (`?endpoint=publicaciones` responde sin sesión); los endpoints del gestor siguen devolviendo 401 sin token.
- [x] Desplegar GitHub Pages: `publico.html` viaja en `src/` y responde **200** en `https://gn-admin.github.io/admin-dashboard/publico.html` (verificado con `sw` `v225` y el tema del visor).
- [x] `apps-script/Code.gs` y `apps-script/WebPublicaciones.gs` desplegados en Apps Script, incluida la normalización de `ficha` (confirmado 2026-11-15). `retirado`/`gone` (410 lógico) y `?endpoint=retiradas` verificados en producción.
- [x] **Dominio:** se mantiene `https://gn-admin.github.io/admin-dashboard` para el gestor; el dominio propio y su indexación quedan fuera de este plan (proyecto `main`).

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
- [x] **`getSheet()` endurecido (2026-11-14).** Mantiene el fallback a la primera pestaña solo cuando el documento tiene **una** pestaña; con dos o más y sin coincidencia registra las pestañas en `Logger` y lanza error, para no leer ni escribir en la hoja equivocada. Cubierto en `tests/sheets.test.js` (nombre exacto, pestaña única, ambigüedad y “sin `sheetName`”). **Desplegado** en Apps Script como nueva versión (confirmado 2026-11-14); el canal sigue respondiendo `success` con la lectura estricta activa.

---

## 1. Qué se va a construir

### 1.1 Apartado Gestor web (en el admin)
Un módulo dentro del panel de administración para gestionar el contenido que se publica en la web:
- [x] **Visión global:** sección “Web / Contenido público” con listado de animales y eventos/historias publicables, estado (borrador/publicado/oculto), `indexable`, indicadores de completitud (sin slug/SEO de publicación/imagen/descripción), filtros y búsqueda. **Solo se listan publicaciones web**: las fichas internas no aparecen.
- [x] **Alta guiada:** botón **Nueva publicación** → selector con los animales que aún **no** tienen publicación web (con búsqueda). Al elegir uno se abre su ficha pública para completarla.
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
- [x] **Estados de publicación (gestor):** `borrador` | `publicado` | `oculto` | `retirado` (+ flags `indexable`, `listed`, `featured`, `orden`). `retirado` es una lápida: la fila se conserva, el slug no se reutiliza y el detalle responde `gone` (410 lógico).

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
publicado_en | actualizado_en | creado_en | slug_historial | ficha_json
```

`media_json`, `seo_json`, `cta_json`, `animal_json`, `evento_json`, `tags_json` y `ficha_json` guardan JSON serializado.

`ficha_json` (C3) es opcional y aditivo, ya desplegado. En hojas ya creadas no hace falta migrar a mano: `appendToSheet`/`updateSheetRow` añaden las columnas nuevas al final; aun así, conviene revisar que aparezca tras el primer guardado. Contiene como máximo 45.000 caracteres y nunca se incluye en listados.

---

## 4. Endpoints del gestor (apartado Gestor web, admin)

> APIs usadas por el admin para gestionar la publicación web. Independientes del canal de consumo de la web. Todas exigen token; solo `admin` y `coordinador` pueden leerlas y escribirlas.

### 4.1 Publicación web de animales — implementado
| Endpoint/acción | Método | Función | Estado |
|---|---|---|---|
| `GET ?endpoint=web-animales` | GET | Listar animales con estado/configuración web (filtros `estado_publicacion`, `q`, `publicado`, paginación; flags de completitud) | [x] |
| `GET ?endpoint=web-animales&id={animal_id}` | GET | Configuración pública + metadatos SEO + datos de origen + completitud + `grupo` (H-3: `{id,nombre,estado_publicacion}` o `null` si el animal no va en grupo) | [x] |
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
- [x] Registro operativo de acciones de publicación (`registrarAuditoria` con `publicacion_web` al cambiar estado, y `retirar_publicacion` / `restaurar_publicacion` / `eliminar_publicacion` en las acciones destructivas del gestor; si la hoja de auditoría está configurada).

---

## 5. Endpoints para la web (canal público de contenido)

> Contrato que consumirá `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`. **No requieren token**: solo devuelven contenido publicado y listado.

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
- **Reglas:** [x] solo contenido en estado publicable; [x] paginación acotada; [x] proyección ligera (`fields=card`); [x] `filters` devuelve los valores disponibles para construir la UI; [x] **una ficha por animal**: si el grupo está publicado, el feed sirve la del grupo (`animal_grupo`) y descarta la individual del miembro, aunque la hoja tenga las dos (`webPublicables`).

### 5.2 Detalle de publicación — implementado
- [x] **`GET /api/publicaciones/:slug`** → `?endpoint=publicaciones/{slug}` o `?endpoint=publicacion&slug=...`: publicación completa (`icons`, `gallery`, `videos[]/video`, `contentHtml`, `animal`/`event`, `seo`).
- [x] **404 lógico** (`status: "error"`) cuando no está disponible/publicada (Apps Script responde 200; el `status` es el contrato real del proyecto).
- [x] **410 lógico** (`status: "gone"`, `code: "gone"`) cuando la publicación está `retirado`: feed, sitemap, redirects y gestor la excluyen, pero el slug queda bloqueado y la ficha muestra “Publicación retirada” con `noindex,nofollow`.
- [x] **Slug antiguo → 301:** si el slug no es el actual pero figura en `slug_historial`, responde `status:"success"` con `redirect:{from,to,slug,permanent:true}` y el `data` de la ficha vigente.
- [x] **Ficha individual superada por su grupo → 301:** si el slug —**el actual o cualquiera de su historial**— pertenece a una publicación `animal` en estado `publicado` cuyo grupo tiene publicación publicada y servida, el detalle **no devuelve esa ficha**: responde `status:"success"` con `redirect:{from,to,slug,permanent:true,motivo:"ficha_en_grupo"}` apuntando a la ruta del grupo (`/animales/<slug del grupo>`) y el `data` de esa ficha de grupo. Así un enlace antiguo del animal nunca acaba en 404 y el canal no sirve al mismo animal dos veces. La lápida manda: una publicación `retirado` sigue respondiendo `gone`.

### 5.3 Compatibilidad y endpoints adicionales (`/v1/*`) — implementado
- [x] `GET /v1/publicaciones` y `GET /v1/publicaciones/:slug` como alias.
- [x] Alias por tipo: `GET /v1/animales`, `GET /v1/eventos`, `GET /v1/blog|historias`.
- [x] Soporte: `GET /v1/config`, `GET /v1/taxonomias`, `GET /v1/sitemap` (URLs + `lastmod`; también `sitemap.xml`).
- [x] `GET /v1/redirects` (o `?endpoint=redirects`): mapa 301 `{from,to,status,type,slug,currentSlug,changedAt}` para generar redirecciones en el hosting. Cubre dos casos: slugs antiguos por `slug_historial` y, con `motivo:"ficha_en_grupo"`, el **slug actual y cada slug histórico** de una ficha individual superada por la publicación de su grupo, con `to` en la ruta del grupo y `changedAt` tomado del cambio de slug que corresponda.
- [x] `?endpoint=retiradas` (público): slugs retirados y sus slugs históricos (`{slug,tipo,retiradoEn}`), para que la web publique una página de retirada `noindex` en la canónica antigua en vez de un 404.
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
- **Factibilidad (GitHub Pages + GAS, 2026-11-15):** viable para bajo volumen si se resuelve el transporte. GAS no expone CORS configurable: los `POST` JSON cross-origin pueden fallar por preflight (el proyecto ya evita preflight en lecturas con JSONP). Recomendación: **prototipar** envío compatible (form clásico `x-www-form-urlencoded`/`multipart`, p. ej. con iframe oculto y UX sin dependencia de leer respuesta cross-origin) antes de implementar. Verificación reCAPTCHA en servidor vía `UrlFetchApp` con clave secreta en Script Properties (site key pública en cliente); `MailApp`/Sheets sujetos a cuotas; rate-limit/antiabuso limitado (sin estado transaccional robusto). Requiere política de datos/privacidad y no almacenar secretos/PII en repo.

---

## 6. SEO de las publicaciones en la web pública (requisitos para la otra web)

> Aplica a las fichas/publicaciones renderizadas en `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`, no al gestor/admin. El gestor provee los campos/metadatos; la web los consume y los aplica.

- [x] **El gestor provee:** `seo.metaTitle`, `seo.metaDescription`, `seo.ogImage`, `seo.canonical`, `seo.robots`, `url` por tipo, `indexable`, `publishedAt`/`updatedAt`.
- [~] **Fichas dinámicas:** `post.html?slug=` solo cliente es insuficiente para indexación/OG; estrategia recomendada **prerender/build por slug** (o SSG/export) usando el endpoint como fuente. El visor ya cubre metas/OG/JSON-LD (§7.1); el prerender se resuelve en el build de la web.
- [~] **URLs canónicas:** `seo.canonical` aplicado en el visor; el canonical, la imagen OG y los robots se derivan solos (dominio + ruta, portada e `indexable`). Rutas limpias y redirect 301 desde `post.html?slug=` pendientes en la web real.
- [x] **Por página/detalle:** `<title>`, meta description, canonical, robots, OG/Twitter y JSON-LD, aplicados desde la publicación en `src/js/publico.js`.
- [x] **`web-sitemap`:** endpoint listo (published + indexable + `lastmod`).
- [x] **`sitemap.xml` y `robots.txt` físicos:** generados desde el canal en el build del visor (§7.4); en la web se replican en su hosting. Los retirados quedan fuera y responden `gone` (§5.2).

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

### Fase 4 — Integración en la web y SEO — **cerrada en este proyecto** (visor + Pages); el port es tarea de la web
**Objetivo:** fijar y verificar **aquí** el comportamiento definitivo que la web debe replicar.
**Criterio de aceptación:** el **100% de las comprobaciones se hace sobre `src/publico.html` + `src/js/publico.js`**. `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` se actualiza **después**, replicando lo ya validado (mismo contrato, mismas metas, mismos estados).
- [x] Consumo del canal sin JSON estático, con filtros/búsqueda/paginación y estados vacío/error.
- [x] Metas/OG/canonical/robots y JSON-LD (`Article`/`Event`/`BlogPosting`) aplicados desde la publicación, validados en el visor (§7.1).
- [x] **Port a `main` trasladado.** Planificación y guía movidas a `TRANSFERIR_A_MAIN.md` para ejecución en el proyecto `main` (fuera del alcance de este repo).
- [x] **Prerender por slug y `sitemap.xml`/`robots.txt` físicos aplicados en la simulación** (`scripts/prerender-publico.js`, §7.4): una página estática por ficha con metas/JSON-LD, sitemap con `lastmod` y robots con `Sitemap:`. En la web se replica en su build; aquí queda además el **mapa 301** (`GET /v1/redirects`).
- [~] **Auditoría formal de rendimiento/accesibilidad → tarea del proyecto web:** aquí está medido lo básico (sin desbordes a 360/1280, 1 y 3 columnas, labels, `alt`, roles).

> El visor es la **referencia ejecutable**: lo que aquí funciona es lo que se porta. No se dará por buena la web hasta que reproduzca §7.1 en su propio dominio.

### 7.1 Aceptación del visor público (verificado 2026-11-15, 554 tests en verde)

Pruebas de comportamiento con el canal **simulado** en el navegador (sin escribir en la hoja) + endpoint real para el estado vacío.

> Las suites que cargan `apps-script/*.gs` (`web-backend`, `sheets`) corren igual en local y en CI desde que se versionaron `Code.gs` y `WebPublicaciones.gs` (2026-11-14). `Config.gs` y el resto de archivos con datos reales siguen en `.gitignore`. Total: **554 tests** en ambos entornos (los últimos, tras vestir el visor con el tema de `nueva-version`, añadir el prerender SEO, las páginas de retirada y el 410).

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
- [x] **Gestor responsive:** listado solo de publicaciones; en ≤767 px la tabla pasa a tarjetas (patrón U4), acciones a lo ancho, stats en 2 columnas y el selector “Nueva publicación” como hoja inferior; tablet y escritorio mantienen tabla y diálogo centrado de 620 px. Verificado a 360/768/1280 px.
- [x] **Pages en vivo (2026-11-14):** `https://gn-admin.github.io/admin-dashboard/publico.html` responde **200** con el tema nuevo (`Montserrat` 48 px a 1280, contenedor 1160), canal JSONP real, **1 publicación real (Laia)** en el listado, 404 lógico (`#/publicacion/no-existe-xyz`) con **`noindex,nofollow`**, sin JSON-LD en errores, canonical propio de la página, sin desbordes a 360/1280 y sin errores de consola.
- [x] **Prerender en Pages:** CI genera y publica `sitemap.xml` (200, con Laia y `lastmod`), `robots.txt` (200, con `Sitemap:`) y `publicaciones/laia.html` (200) con canonical absoluto, OG y JSON-LD sin JavaScript.
- [x] **Ficha real publicada (Laia):** el listado la muestra y la ficha se compone con datos reales; el prerender genera `publicaciones/laia.html` con metas, canonical y JSON-LD (§7.4).
- [x] **Prerender SEO:** una página estática por ficha sin JavaScript, `sitemap.xml` y `robots.txt` generados desde el canal y verificados a 360/1280 (§7.4).

### 7.2 Port al proyecto `main` — trasladado

La guía de port, consumo del canal, SEO/metadatos, prerender/sitemap/robots/301/410 y criterios de ejecución para la web real se han **trasladado a [`TRANSFERIR_A_MAIN.md`](TRANSFERIR_A_MAIN.md)** para su ejecución en `C:\Users\JonEg\Documents\proyectos\main` (fuera del alcance de este repositorio).

### 7.3 Ficha de animal configurable desde la publicación — C3 v1.1 implementada en local

**Pregunta de partida.** La ficha de `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` (`post.html` → `post-sheet--ficha`, render en `js/blog-render.js`) no es «título + HTML»: compone cabecera, datos destacados con iconos, etiquetas, galería, vídeo y bloque de animal. ¿Qué de eso debe poder configurarse en la publicación y qué tiene que enviar el endpoint?

**Objetivo de `ficha_json`.** Campo opcional y aditivo para guardar la **configuración/contenido estructurado de la ficha** (bloques, plantilla, iconos, datos curados/CTA, etc.) y hacerla configurable desde el gestor sin ampliar el esquema fijo en cada cambio. Si no existe, se mantiene el render actual.

**Estado (2026-11-16).** C3 v1.1 **desarrollada y probada en local, pendiente de desplegar** (no se ha subido `WebPublicaciones.gs` ni Pages en esta ronda). Incluye: `ficha_json` normalizado (solo detalle/preview/prerender), `orden` de bloques, bloque `contenido`, `videoModo` (`enlace|embed`), `tags` propias de la ficha, precedencia `ficha > base`, controles del gestor con orden ↑/↓, visor/prerender y vídeo **click-to-load** opcional con CSP acotada. Los listados siguen sin cargar la ficha.

#### A. Anatomía de la ficha de referencia

| Bloque | Qué pinta `blog-render.js` | Fuente en el payload | Configurable hoy |
|---|---|---|---|
| Cabecera | `eyebrow` con la categoría, `h1`, `lead` (extracto), línea `meta` (categoría · fecha · `readTime`) y CTA | `category`, `title`, `excerpt`, `publishedAt`, `readTime`, `cta` | Parcial: textos sí, CTA único |
| Datos destacados | rejilla de tarjetas `feature-card` con icono + etiqueta + valor | `icons[]` `{icon,label,value}` | Sí, como texto libre `icono\|etiqueta\|valor` |
| Etiquetas | chips bajo los datos | `tags[]` | **No**: el formulario de animal no edita `tags` |
| Sobre este caso | HTML libre | `contentHtml` | Sí |
| Galería | carrusel de imágenes 16/10 con pie | `gallery[]` `{src,alt,caption}` | Sí: `url|alt|pie` por línea (retrocompatible) |
| Vídeo | iframe 16/9 + nota | `videos[]` `{url,title,note}` | Solo `título\|url`; el visor **enlaza**, no incrusta |
| Ficha del animal | tabla de datos, salud y temperamento | `animal.{names,species,breed,sex,age,size,color,health,temperament,compatibility,adoption,foster,location,contact}` | Parcial (ver C.5) |
| CTA final | repite CTA + botón «volver» | `cta` | Igual que la cabecera |

La plantilla se elige por categoría (`isFichaPost`): `Adoptados` cae a formato historia y el resto de fichas usa el layout compacto. Esa decisión hoy es **implícita en la web**, no viene del gestor.

#### B. Huecos detectados (payload ↔ ficha real)

| # | Hueco | Efecto actual | Propuesta |
|---|---|---|---|
| 1 | **Plantilla y visibilidad de bloques** | La web decide por categoría; el gestor no puede pedir «ficha sin galería» ni «historia con datos» | Bloque `ficha` opcional: `plantilla` (`ficha`\|`historia`), `bloques` (booleanos de `datos`, `etiquetas`, `contenido`, `galeria`, `videos`, `fichaAnimal`, `cta`) y `orden` (lista cerrada y completa) |
| 2 | **Catálogo de iconos** | `icon` se guarda pero el render decide el dibujo por regex de la etiqueta; dos fichas con la misma etiqueta pueden salir con iconos distintos | Catálogo cerrado de claves (edad, ubicacion, caracter, salud, adopcion, acogida, contacto, urgente, hogar) + fallback por etiqueta para no romper datos viejos |
| 3 | **Galería sin alt ni pie** | Se pierde accesibilidad y el pie de foto que sí soporta el contrato | Formato `url\|alt\|pie` por línea (retrocompatible: `url` sola sigue valiendo) |
| 4 | **Vídeo sin nota ni miniatura** | La ficha de referencia muestra nota bajo el vídeo | Añadir `nota` y `miniatura` al parser `título\|url`; el modo `embed` se resuelve con fachada click-to-load (ver D) |
| 5 | **Salud no curada** | `vaccinated/dewormed/neutered/microchipped` salen de la hoja interna (`vacunas`, `esterilizada`, `microchip`); en la web no se pueden corregir sin tocar el animal | Cinco checkboxes en «Ficha pública del animal» con **heredar** por defecto; el backend ya respeta el valor explícito de `animal.health` |
| 6 | **Campos de animal ausentes en el formulario** | `age.value/unit`, `names[]`, `adoption.includes`, `foster.reason/expensesPolicy`, `location.shelter` existen en el contrato pero no se editan | Añadirlos al desplegable «Ficha pública del animal»; el payload ya los compone |
| 7 | **CTA sin intención** | La web real abre formularios de adopción/acogida por `data-open-form`; el contrato solo manda `label`+`url` | `cta.kind`: `adopcion`\|`acogida`\|`contacto`\|`url` (por defecto `url`); el gestor puede sugerir el formulario y la web decide cómo abrirlo |
| 8 | **Tiempo de lectura** | `readTime` se deriva del HTML y no se puede ocultar | Flag `ficha.mostrarLectura` (por defecto `true`) |
| 9 | **Secciones libres** | La ficha real solo tiene «Sobre este caso»; no hay forma de añadir «Cómo es» o «Salud» como bloques propios | **Opcional/fase posterior**: `sections[]` `{titulo,html}` (máx. 3), saneado en backend |

#### C. Contrato propuesto (v1.1, aditivo)

```jsonc
// GET ?endpoint=publicacion&slug=…  (solo se añade si está configurado)
"ficha": {
  "plantilla": "ficha",              // ficha | historia
  "bloques": { "datos": true, "etiquetas": true, "contenido": true,
                "galeria": true, "videos": true, "fichaAnimal": true, "cta": true },
  "orden": ["datos", "etiquetas", "contenido", "galeria", "videos", "fichaAnimal", "cta"],
  "videoModo": "enlace",             // enlace | embed (click-to-load)
  "tags": ["perro", "sociable"],     // opcional: prevalece sobre tags base
  "mostrarLectura": true
},
"cta": { "label": "Quiero adoptar", "url": "…", "kind": "adopcion" },
"gallery": [{ "src": "…", "alt": "…", "caption": "…", "order": 0 }],
"videos": [{ "title": "…", "url": "…", "provider": "youtube", "note": "…" }],
"icons": [{ "icon": "edad", "label": "Edad", "value": "2 años" }]
```

Reglas:
- **Aditivo y opcional:** ausencia de `ficha` = comportamiento actual; el visor y la web ignoran claves desconocidas.
- **Compatibilidad:** `icon` pasa a ser clave sugerida, no obligatoria; `label` manda para el texto y el icono cae al catálogo o al regex.
- **Precedencia:** si `ficha` define `icons`, `gallery`, `videos`, `tags` o `cta`, prevalecen sobre los campos base de la publicación (una lista vacía explícita oculta la base). Si no, se heredan.
- **Orden de bloques:** `ficha.orden` se filtra a claves conocidas, se deduplica y se completa con las que falten en el orden por defecto (`datos`, `etiquetas`, `contenido`, `galeria`, `videos`, `fichaAnimal`, `cta`). La plantilla `historia` nunca pinta `fichaAnimal`.
- **Vídeo:** por defecto `enlace` (sin peticiones a terceros). Con `videoModo: "embed"` el visor pinta una fachada propia y solo carga el iframe al pulsar; solo se aceptan YouTube (`youtube-nocookie`) y Vimeo. Las URLs no reconocidas mantienen el enlace.
- **Persistencia y tamaño:** propuesta base, columna `ficha_json` en `WebPublicaciones` (añadirla a mano en hojas ya creadas, como `slug_historial`). **Límite de celda en Sheets ~50.000 caracteres**: mantener el JSON compacto (IDs/referencias, sin duplicar contenido pesado que ya vive en otros campos/Drive). Alternativa/híbrido si crece: guardar la ficha completa en un fichero JSON en Drive (p. ej. en la carpeta de la publicación) y almacenar su `fileId`/ruta en la hoja como desbordamiento.
- **Rendimiento de lectura (regla):** los listados/secciones (historias, gatos/perros en adopción, feeds con 20+ ítems) **no deben** leer `ficha_json` ni ficheros por ítem: se resuelven con campos de la fila ya usados en tarjetas (slug, título, portada, extracto, categoría/estado, destacados). La ficha completa se carga **solo en el detalle** y en el **prerender** de la ficha (donde el coste se paga en build). Con caché interna del canal (~60 s) esto evita penalizar los listados.
- **Validación:** `plantilla`, `bloques`, `orden`, `videoModo` y `cta.kind` cerrados a valores conocidos; `tags` máx. 20 × 40 caracteres; el resto, texto saneado (ver decisiones). Publicar **no** exige la configuración nueva.

#### C bis. Media por ficha — implementado

- **Una carpeta por publicación** en Drive, separada por tipo: `animales/<slug>`, `eventos/<slug>`, `historias/<slug>` dentro de `CONFIG.DRIVE_WEB_FOLDER_ID`. Se busca por nombre y se crea si no existe, así la ficha reutiliza siempre la misma.
- **Enlaces normalizados al pegar:** un fichero de Drive (`/d/ID`, `open?id=`, `uc?id=`, `thumbnail?id=`) se convierte en `thumbnail?id=ID&sz=w1200|w1600` (imágenes) o en `/file/d/ID/view` (vídeo/documento). Los enlaces de **carpeta** (`/drive/folders/`) se rechazan y se avisa al guardar; nunca se guarda una URL de carpeta.
- **Galería con alt y pie:** `url|alt|pie` por línea; una URL sola sigue valiendo y el alt se genera con el título de la ficha. El visor pinta `<figure>` + `<figcaption>` cuando hay pie.
- **Endpoint** `POST web-media-subir` (admin/coordinación, como el resto de `web-*`): `{publicacion_id, tipo, archivo_base64, nombre, mime_type}` → `{fileId, nombre, carpeta, carpeta_id, carpeta_url, url, download}`.
- **Endpoint** `POST web-media-eliminar`: `{file_id, publicacion_id?}` → `{fileId, nombre, eliminado:true}` (papelera de Drive). Con `publicacion_id` exige que el archivo esté en la carpeta de esa ficha; sin él solo acepta archivos dentro del árbol de `DRIVE_WEB_FOLDER_ID` (sirve para huérfanos). Auditoría `web-media-eliminar`. En el formulario, cada archivo enlazado aparece como chip con «×»: borra el archivo y quita el enlace del campo.
- **Tipos y límites:** `portada` y `galeria` (imagen, 5 MB), `video` (15 MB), `documento` (PDF/imagen/vídeo, 10 MB). Nombre ordenado: `<tipo>-<original>-<uuid>.<ext>`.
- **Permisos:** se comparten imágenes y vídeos (`ANYONE_WITH_LINK`) porque los consume la web; **los documentos quedan privados**. Ni la carpeta raíz ni la de la ficha se comparten.
- **Formulario:** subida desde la publicación de animal (portada, galería, vídeo, documento) y de evento/historia (portada, galería, documento). Los documentos se guardan en `media.documents` (`nombre|url`) y **no se publican**.
- Requiere `APPS_SCRIPT_DRIVE_WEB_FOLDER_ID` en `.env` y regenerar `Config.gs`; sin esa variable el endpoint avisa y no sube nada. Los enlaces de carpeta no se publican nunca.

#### D. Decisiones (cerradas; v1.1 revisada el 2026-11-16)

- [x] **Almacenamiento de la ficha (celda vs fichero).** Decidido: `ficha_json` compacto en celda con límite de 45.000 caracteres (`webNormalizarFicha`). El desbordamiento a fichero JSON en Drive queda como plan B solo si una ficha real lo supera. Regla vigente: **nunca leer la ficha por ítem en listados**; viaja solo en detalle, preview y prerender.
- [x] **Vídeo incrustado o enlace.** Decidido (v1.1): **enlace por defecto** y `embed` opcional con **click-to-load**. La fachada no hace peticiones a terceros ni usa cookies; al pulsar se crea el iframe de `youtube-nocookie` o `player.vimeo.com`. La CSP del visor abre solo `frame-src` a esos dos dominios y el saneado sigue eliminando `<iframe>` del HTML libre. URLs no reconocidas mantienen el enlace externo.
- [x] **Catálogo de iconos compartido.** Decidido: se mantiene **duplicado local** (`svgFor` en `publico.js` y en el render de la web) y no se publica un endpoint nuevo; el catálogo cerrado ya viaja en el contrato de la ficha como clave (`icon`), que es lo que necesita la web para resolver el SVG en su propio código.
- [x] **HTML libre en `contentHtml` y `sections`.** Decidido: **se sanea en el servidor con lista blanca** (`webSanearHtml`), al construir el payload público (detalle, listados y prerender). Lo guardado no se modifica (reversible) y nada publicado lleva `script`, `style`, `iframe`, formularios ni atributos `on*`. `sections` no existe en el contrato actual (la ficha usa `bloques`), así que de momento solo aplica a `contentHtml`.
- [x] **Orden de bloques configurable.** Decidido (v1.1): **visibilidad + orden** (`ficha.bloques` y `ficha.orden`). El backend cierra el orden a claves conocidas, elimina duplicados y completa las que falten; el gestor ofrece subir/bajar cada bloque. La plantilla `historia` desactiva `fichaAnimal` al renderizar.
- [x] **Precedencia de campos de la ficha.** Decidido (v1.1): `ficha.icons/gallery/videos/tags/cta` prevalecen sobre los campos base cuando están presentes; si faltan, se heredan. Una lista vacía explícita oculta la base. Así el gestor puede sobrescribir la ficha del animal sin duplicar datos.
- [x] **Retrocompatibilidad de `tags` en animales.** Decidido: campo **aditivo y opcional**; las publicaciones antiguas sin etiquetas se siguen pintando sin la fila de etiquetas, y el payload no gana campos vacíos si no hay `tags`.

#### E. Factibilidad y notas de implementación (GitHub Pages + GAS, 2026-11-15)

- **C3 viable:** aditivo en Sheets/Drive + GAS + Pages/prerender. Claves: JSON compacto (o híbrido con fichero de desbordamiento), saneado/validación en servidor, y **no leer ficha completa en listados** (solo en detalle/prerender; caché ~60 s) para no penalizar secciones con 20+ publicaciones.
- **C4 viable con restricciones (alcance aparte):** verificación reCAPTCHA server-side vía `UrlFetchApp` (secreto en Script Properties) y persistencia/notificación con Sheets/`MailApp` dentro de cuotas; principal reto **CORS/preflight en POST** desde navegador a GAS. Requiere prototipo de transporte (p. ej. form `x-www-form-urlencoded`/iframe, UX sin lectura directa de respuesta) y política de antiabuso/datos.
- **Repo público/Pages:** sin secretos en repo; site key pública aceptable, secretos solo en GitHub Secrets/Script Properties; Pages estático (redirects/410 ya resueltos con prerender/estado lógico).

#### F. Plan de implementación (v1.1 completada en local; despliegue pendiente)

1. [x] **Contrato y validación** (`WebPublicaciones.gs`): `ficha_json` → objeto `ficha` en `webConstruirPublicacion`; valores cerrados; tests de ausencia (payload idéntico al actual).
2. [x] **Backend de guardado:** aceptar `ficha` (`plantilla`, `bloques`, `orden`, `videoModo`, `tags`), `cta.kind`, galería con `alt/pie`, vídeos con `nota` y los campos de animal que faltan; validar longitudes y tipos.
3. [x] **Gestor (`src/js/web.js`):** sección «Presentación de la ficha» con plantilla, bloques y orden ↑/↓, `videoModo`, `tags` propias y `mostrarLectura`; los extras ya guardados (`icons`/`gallery`/`videos`/`cta`) se conservan al guardar. Sin cambios no se envía `ficha` (compatibilidad).
4. [x] **Visor (`publico.js` + `publico.css` + `publico-embed.js`):** render por `ficha.orden`, precedencia `ficha > base`, plantilla `historia` sin bloque de animal, CTA por `kind`, fachada de vídeo click-to-load y fallback a enlace. Sin `ficha` el HTML no cambia.
5. **Port a `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`:** `blog-render.js` lee `pub.ficha` (si existe) para elegir `post-sheet--ficha` o `--story`, aplicar orden/precedencia, ocultar bloques y montar la fachada de vídeo; `publication.icons` con clave de catálogo.
6. [x] **Aceptación:** payload sin `ficha` idéntico al actual; ficha con bloques desactivados no pinta esos bloques; orden y precedencia verificados en tests; publicación antigua sigue renderizando igual; las páginas estáticas solo cargan `publico-embed.js`. QA visual local a 360/1280 sin desbordes (ficha, historia, embed y ficha mínima) y `moverFichaBloque` probado en navegador.

**Fuera de alcance:** exponer la ficha interna del animal, editor WYSIWYG, CSS/tema por publicación y multiplantilla más allá de `ficha`/`historia`.

### 7.4 SEO aplicado en la simulación (prerender, sitemap y robots) — verificado

> `publico` es la simulación de la web: cada requisito SEO se implementa y se comprueba **aquí** antes de documentarlo para el proyecto real.

**Qué se ha implementado**
- `scripts/prerender-publico.js`: lee el canal (`publicaciones` paginado + `publicacion&slug=` + `retiradas`) y escribe una **página estática por ficha** en `src/publicaciones/<slug>.html` con `<title>`, description, robots, canonical absoluto, OG/Twitter, JSON-LD y el HTML de la ficha **ya renderizado (sin JavaScript)**.
- `sitemap.xml` con el listado y cada ficha publicada/listada (`lastmod` desde `updatedAt`/`publishedAt`), y `robots.txt` que permite lo público y bloquea el resto del panel.
- `Publico.htmlDetalle(p)`: el HTML de la ficha se extrajo del render para reutilizarlo desde Node (una sola composición para SPA y estático).
- **Canónica única:** la ficha del visor emite `canonical`, `og:url` y `mainEntityOfPage` apuntando a `publicaciones/<slug>.html`, de modo que SPA y estática no compiten; el listado y los estados conservan la URL propia.
- **Guarda de despliegue:** si el canal no responde, falla una ficha o el `sitemap.xml`/`robots.txt` no salen válidos, el script **termina con error y bloquea el deploy** (sin borrar lo anterior). `--soft` permite solo avisar en ejecuciones manuales.
- **Índice de estáticas** (`publicaciones/index.json`): `{generadoEn, publicados[], retirados[]}`. El visor lo carga al arrancar y solo declara `canonical`/`og:url` hacia `publicaciones/<slug>.html` si el slug ya está generado; mientras no exista (ficha recién publicada) omite el canonical en vez de apuntar a un 404. Sin índice (fallo de red) mantiene la canónica estática anterior. El service worker lo sirve con red primero.
- **Páginas de retirada:** cada slug retirado (y sus slugs históricos) genera `publicaciones/<slug>.html` con `noindex,nofollow`, sin canonical ni JSON-LD y fuera del sitemap. Así el enlace no da 404 entre despliegues y el hosting real puede servir 410. Si una ficha publicada recupera el slug, la ficha manda sobre la lápida.

**Cuánto puede tardar en aplicarse una retirada**

- **El backend lanza el deploy al publicar, guardar o retirar.** `apps-script/WebPublicaciones.gs` hace `workflow_dispatch` sobre `deploy.yml` al terminar la acción (`webDispararDeploy`), con deduplicación de 60 s para que publicar y guardar seguidos generen un solo run. La estática queda lista en **2–4 min** sin push ni cron. El token vive en la propiedad de script `GITHUB_DEPLOY_TOKEN`; si falta, la publicación funciona igual y solo se pierde el aviso inmediato.
- El cron (`*/30 * * * *`, UTC) es solo **red de seguridad**. Medido el 2026-11-15: no hubo run `schedule` ni a las 16:00 ni a las 16:30 y el único del día llegó ~7 h tarde y con tests en rojo, así que no sirve para garantizar plazos.
- Si el disparo automático falla (token caducado, GitHub caído), el run no aparece: se relanza desde Actions → «Deploy a GitHub Pages» → *Run workflow* o con el botón **«Regenerar web»** del gestor (endpoint `POST web-deploy`, admin). Al lado del botón, un chip indica si el deploy automático está configurado (`web-deploy-estado`).
- El hosting es estático: entre la retirada y el deploy la página antigua sigue sirviéndose; con el disparo automático esa ventana es de minutos y, si el deploy falla, la lápida se genera en el siguiente run (push o cron).
- Integrado en el despliegue (`.github/workflows/deploy.yml`) después de los tests; si el canal falla, **bloquea el deploy** y **no borra** lo generado. `npm run prerender` para ejecutarlo a mano (`--fixture`, `--dry`, `--soft`).
- **Avisos visibles en el run:** con `GITHUB_ACTIONS=true` los avisos salen como anotaciones (`::warning::`, p. ej. si no puede leer retiradas) y los fallos bloqueantes como `::error::`, con saltos y `%` escapados; en local se imprimen como líneas normales.
- **Fixtures versionadas:** `tests/fixtures/prerender/{ficha-normal,retirada,sin-portada}.json` generan el sitio completo en un directorio temporal y se validan en `tests/prerender.test.js` (canonical, OG con y sin portada, JSON-LD, lápidas `noindex` y sitemap), sin depender del canal real.

**Resultados (2026-11-14, ficha real de Laia)**
- `src/publicaciones/laia.html`: `<title>Laia</title>`, description real, `canonical` absoluto a la página estática, OG/Twitter con la portada, **un único** `<script type="application/ld+json">` (`Article` con `mainEntityOfPage`) y **cero** scripts de aplicación.
- Render sin JS: `h1`, hero a dos columnas (1280), cuerpo y ficha del animal (5 filas), sin desbordes a 360/1280; imagen de portada cargada.
- `sitemap.xml`: 2 URLs (listado + ficha) con `lastmod`; `robots.txt`: `Allow` de `publico.html` y `publicaciones/`, `Disallow` del resto y línea `Sitemap:`.
- `npm test`: **646/646** en local (**636** en CI, donde `roles-auth` se omite) (prerender, canónica única, 410, páginas de retirada, fixtures, media por ficha, galería con pie, normalización de Drive, ficha configurable v1.1 y vídeo click-to-load).
- **En Pages:** el workflow ejecuta el prerender después de los tests y el sitio publicado sirve `sitemap.xml`, `robots.txt` y `publicaciones/laia.html` (los tres **200**); la ficha estática mantiene canonical propio, OG, JSON-LD y la portada cargada.
- **Límite conocido:** en un Pages de proyecto (`/admin-dashboard/`) `robots.txt` y `sitemap.xml` cuelgan de esa carpeta, no de la raíz del dominio; los rastreadores solo los usan si se envían en Search Console. Con dominio propio (`gruponebak.net`) quedan en la raíz y funcionan solos.

**Cómo aplicarlo en el proyecto correspondiente**
1. Generar en su build una página por `slug` usando el canal como fuente (SSG o script equivalente).
2. Metas desde `seo.*`; canonical `dominio + ruta` (con dominio propio, sin `.html`); OG/Twitter con `ogImage`; JSON-LD por tipo y `mainEntityOfPage`.
3. `sitemap.xml` en la raíz con `lastmod` y `robots.txt` con `Sitemap:`; excluir borradores, ocultos y `listed: false`.
4. 404 real del hosting para slugs inexistentes, 410 para retirados (o página `noindex` si el hosting no permite códigos por ruta) y redirecciones 301 desde `GET /v1/redirects` (mapa ya disponible).
5. Comprobar: HTML con contenido sin JS, `canonical` propio, JSON-LD válido, sitemap sin borradores y robots correcto.

### Fase 5 — Ajustes, calidad y operación — parcial
**Objetivo:** estabilizar y mantener el flujo gestor → web.
- [x] Validaciones de completitud/publicación y consistencia preview↔público (con pruebas).
- [x] Caché interna del canal público y control de límites (paginación máx. 50, 60 s de caché).
- [x] Diagnóstico de configuración en gestor y canal (`sheet_missing` / `sheet_not_found` vs lista vacía) y lectura estricta de la pestaña `WebPublicaciones`.
- [x] Gestión de cambios de slug: historial `slug_historial` + redirección 301 en el detalle y mapa `GET /v1/redirects`; un slug histórico no se puede reutilizar.
- [x] **Retirada con 410:** estado `retirado` (lápida con slug bloqueado), respuesta `status:"gone"` en el canal, exclusión de feed/sitemap/gestor y pantalla “Publicación retirada” con `noindex,nofollow` en el visor.
- [~] Pruebas de SEO/render: visor y prerender validados (metas/OG/canonical/JSON-LD, 404, estados vacíos, sitemap y robots); falta la indexación real en la web, que depende del dominio propio.
- [x] Documentación operativa: contratos y cabeceras de hoja en este documento.
- [x] Procedimiento de publicación/redirects para el equipo en `.internal-docs/GESTOR_WEB_OPERATIVA.md`.

---

## 8. Orden recomendado y dependencias
1. **Fase 0** → contratos/modelo. `[x]`
2. **Fase 1** → base (datos + gestor + payload). `[x]`
3. **Fase 2** y preparación de **Fase 3** en paralelo con contrato estable. `[x]`
4. **Fase 3** → canal público. `[x]`
5. **Fase 4** → integración web + SEO. `[x]` cerrada aquí (visor + Pages); el port se ejecuta en la web (§7.2)
6. **Fase 5** → estabilización. `[~]` parcial

## 9. Riesgos y mitigaciones (funcionales)
| Riesgo | Mitigación | Estado |
|---|---|---|
| Desalineación gestor ↔ web | Contrato único `Publicacion` normalizado y compatibilidad `/api`–`/v1` documentada. | [x] |
| Fichas dinámicas no indexables | Prerender/build por slug + metas/OG/JSON-LD + sitemap/canonical. | [~] metas/OG/JSON-LD en el visor; prerender en la web |
| Cambios de `slug` rompen enlaces | `slug` estable, historial y redirects 301; 404/410 para retirados. | [x] slug único + historial + 301 (`/v1/redirects`) + 410 (`status:"gone"`, lápida con slug bloqueado) |
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
| 2026-11-14 | 4 | Visor con el tema de `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`: tokens, Inter/Montserrat, hero a dos columnas, datos destacados con iconos y tarjetas de 24 px | — | `src/css/publico.css`, `tests` 454 en verde, `sw` v223 |
| 2026-11-14 | 4 | Revisión en Pages con el canal real: listado vacío, 404 con `noindex`, canonical propio, 360/1280 sin desbordes | — | §7.1 |
| 2026-11-14 | 5 | `Code.gs` endurecido desplegado como nueva versión en Apps Script y canal verificado en vivo (`publicaciones`, `sitemap`, `redirects`, `taxonomias`, JSONP y 401 sin token) | — | Peticiones reales al `/exec` |
| 2026-11-14 | 7.3 | Análisis y plan de la ficha de animal configurable (plantilla, bloques, iconos, galería, salud, CTA) sin implementar | — | §7.3 |
| 2026-11-14 | 4 | Port a la web declarado **tarea del proyecto `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`**: se entrega contrato + guía §7.2 + criterios §7.1 | — | §7.2 |
| 2026-11-14 | 4 | Prerender SEO en la simulación: página estática por ficha, `sitemap.xml` y `robots.txt` desde el canal, integrados en el despliegue | — | `scripts/prerender-publico.js`, `tests/prerender.test.js`, §7.4 |
| 2026-11-14 | 4 | Verificación con ficha real (Laia): estática con canonical/JSON-LD sin JS, 360/1280 sin desbordes; SPA sin regresiones | — | §7.4 |
| 2026-11-14 | 4 | Canónica única: la ficha del SPA apunta a su página estática en canonical, `og:url` y JSON-LD | — | `tests/publico.test.js`, §7.4 |
| 2026-11-14 | 4 | Guarda de despliegue del prerender: falla si no hay canal, ficha o sitemap/robots válidos | — | `scripts/prerender-publico.js`, `tests/prerender.test.js` |
| 2026-11-14 | 5 | Retirada con 410: estado `retirado`, lápida de slug, `gone` en canal, exclusión de feed/sitemap y pantalla en el visor | — | `tests/web-backend.test.js` · pendiente de desplegar `Code.gs` y `WebPublicaciones.gs` |
| 2026-11-14 | 5 | Página estática de retirada (`noindex`, sin canonical ni JSON-LD, fuera del sitemap) desde `?endpoint=retiradas` | — | `tests/prerender.test.js` |
| 2026-11-14 | 5 | Gestor: resumen con tarjeta «Retiradas» (fuera de borradores e incompletas) y listado que las muestra sin acciones de republicar | — | `tests/web-backend.test.js`, `tests/web.test.js` |
| 2026-11-14 | 5 | Deploy programado diario (03:17 UTC) para aplicar retiradas sin push; concurrencia en cola para no cancelar un deploy en curso | — | `.github/workflows/deploy.yml`, §7.4 |
| 2026-11-15 | 7 | Disparo del deploy unificado en un solo sitio: `_webAnotarDeploy` en el router decide con el estado guardado en la respuesta (y `forzar` para retirar/restaurar); `WebPublicaciones.gs` deja de llamar a GitHub. `WEB_DEPLOY_VERSION` en `web-deploy-estado` y endpoint `web-deploy-cuerpo` para saber qué cuerpo responde, errores de dispatch visibles y botón «Regenerar web» con chip de configuración | — | `apps-script/Code.gs`, `apps-script/WebPublicaciones.gs`, `src/js/web.js`, `tests/deploy-router.test.js`, `tests/web-backend.test.js` |
| 2026-11-15 | 7 | Deploy inmediato al publicar/retirar desde Apps Script (`workflow_dispatch` con deduplicación; token en propiedades del script), cron solo como red de seguridad, y borrado de media en Drive (`web-media-eliminar` + chips con «×» en los formularios) | — | `apps-script/WebPublicaciones.gs`, `apps-script/Code.gs`, `src/js/api.js`, `src/js/web.js`, `tests/web-backend.test.js`, `tests/web.test.js` |
| 2026-11-15 | 6 | Cierre del hueco de la ficha recién publicada: cron cada 30 min, `publicaciones/index.json` y canonical condicional en el visor; el gestor bloquea publicar fichas incompletas con la lista de lo que falta | — | `scripts/prerender-publico.js`, `src/js/publico.js`, `src/js/web.js`, `tests/publico.test.js`, `tests/web.test.js` |
| 2026-11-14 | 3 | Media por ficha: carpeta `tipo-slug` en Drive, endpoint `web-media-subir` y subidas desde los formularios; documentos privados | — | `tests/web-backend.test.js`, `tests/web.test.js`, §7.3 C bis |
| 2026-11-14 | 3 | Galería `url|alt|pie` con `<figure>`/`<figcaption>`, normalización de enlaces de Drive (carpetas rechazadas) y media separada por tipo (`animales|eventos|historias/<slug>`) | — | `tests/web.test.js`, `tests/prerender.test.js`, `tests/web-backend.test.js` |
| 2026-11-15 | C3 | Contrato `ficha` aditivo: helpers de normalización, `ficha_json` en backend (detalle/preview, nunca listados), campo JSON en gestor y bloques/plantilla en visor/prerender | — | `tests/ficha-config.test.js`, `tests/web-backend.test.js`, `tests/publico.test.js` |
| 2026-11-15 | C3 | `webUrlSegura` en portada, galería, vídeos, CTA y en `ficha` (galería/vídeos/CTA): las URLs no seguras se descartan en el payload sin tocar lo guardado. Comprobado sin regresiones sobre el contenido real (descripciones en texto plano y la única publicación con un `<p>`) | — | `apps-script/WebPublicaciones.gs`, `tests/saneado-html.test.js` |
| 2026-11-15 | C3 | Saneado del HTML público con lista blanca: `webSanearHtml`/`webUrlSegura` en `webConstruirPublicacion`, etiquetas/atributos permitidos, `javascript:`/`data:`/entidades numéricas rechazadas y saneado idempotente | — | `apps-script/WebPublicaciones.gs`, `tests/saneado-html.test.js` |
| 2026-11-15 | C3 | Endurecido en servidor: `webNormalizarFicha` (valores cerrados, listas/longitudes, máximo 45.000 caracteres), rechazo de fichas no objeto y `cta.kind` conservado en el payload | — | `tests/web-backend.test.js`, `tests/publico.test.js` |
| 2026-11-15 | C3 | UI estructurada en el gestor: plantilla, toggles de bloques, tiempo de lectura, etiquetas, salud con «heredar» y CTA con intención; sin cambios no se envía `ficha` | `v259` | `tests/web.test.js` |
| 2026-11-16 | C3 | Modelo v1.1: bloque `contenido`, `orden` validado/deduplicado/completado, `videoModo` (`enlace\|embed`) y `tags` propias (20 × 40); backend y `ficha-config.js` alineados | — | `apps-script/WebPublicaciones.gs`, `src/js/ficha-config.js`, `tests/ficha-config.test.js`, `tests/web-backend.test.js` |
| 2026-11-16 | C3 | Render por `ficha.orden` con precedencia `ficha > base` (`icons/gallery/videos/tags/cta`); plantilla `historia` sin ficha de animal; `contenido` opcional | — | `src/js/publico.js`, `tests/publico.test.js` |
| 2026-11-16 | C3 | Vídeo click-to-load: fachada sin peticiones, iframe solo al pulsar, `youtube-nocookie`/`player.vimeo.com`, CSP `frame-src` acotada y runtime en estáticas | `v267` | `src/js/publico-embed.js`, `src/css/publico.css`, `src/publico.html`, `scripts/prerender-publico.js`, `tests/publico-embed.test.js`, `tests/prerender.test.js` |
| 2026-11-16 | C3 | Gestor: orden ↑/↓ por bloque, selector de `videoModo`, etiquetas propias y conservación de extras del JSON; acción `moverFichaBloque` | — | `src/js/web.js`, `src/js/dashboard-web.js`, `src/css/styles.css`, `tests/web.test.js` |
| 2026-11-16 | C3 | QA visual local: ficha, historia, embed y ficha mínima a 360/1280 sin desbordes; fachada→iframe correcta; `moverFichaBloque` y lectura del formulario probados en navegador | — | verificación manual (sin cambios de código) |
| 2026-11-18 | 5 | Exclusividad 1:1 cerrada en las dos direcciones: no se publica el individuo si su grupo ya está publicado, el canal deduplica quedándose con el grupo y el detalle responde 301 al grupo desde el slug actual y los históricos; el sitemap sale de `webPublicables` | `v284` | `apps-script/WebPublicaciones.gs`, `src/js/web.js`, `tests/web-backend.test.js`, `tests/web.test.js` |
