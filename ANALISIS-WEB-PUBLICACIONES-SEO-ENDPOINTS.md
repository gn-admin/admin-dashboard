# Análisis: Web pública, publicaciones, SEO y endpoints (gestor + público)

> **Alcance:** análisis y definición funcional/técnica para planificar (sin implementar).  
> **Contexto:** el panel de administración (este repo, **gestor**) gestiona animales, acogidas, adopciones, etc. y debe alimentar una **web pública separada** (`custom-page` / `nueva-version`) con fichas públicas de animales, eventos e historias, con buen SEO.  
> **Fuentes de referencia (leídas y alineadas):**
> - `../custom-page/docs/estructura-endpoint-publicaciones.md` — contrato de publicaciones para la web pública: `GET /api/publicaciones` (filtros, paginación), `GET /api/publicaciones/:slug`, esquema `Publicacion` con `icons`, `gallery`, `videos[]/video`, bloques `animal`/`event`, mapeo `publication` (`nebak-post-v1`).
> - `../custom-page/docs/analisis-endpoint-seo-formularios-cookies-nueva-version.md` — inventario `nueva-version`, consumo actual (`../data/blog-posts.json`, `HistoriasAPI`, listados `[data-adoption-list]`), propuesta GAS/Sheets, endpoints `/v1/*` (contenido, taxonomías, config, formularios), SEO (prerender/build por slug, sitemap, redirects, metas/OG/JSON-LD), formularios/reCAPTCHA y cookies/políticas.
>
> Este documento unifica la información necesaria para diseñar los **endpoints del gestor** y los **endpoints públicos**, manteniendo separación de seguridad. Donde conviven convenciones (`/api/publicaciones` vs `/v1/publicaciones`), se propone compatibilidad (ver §4.4).

---

## 1. Objetivos y principios

- **Separación de superficies:** web pública y admin son despliegues/apps distintos. El admin no expone API/token ni datos internos.
- **Capa pública curada (lista blanca):** solo contenido `published`/publicable y solo campos permitidos. Nunca la ficha interna completa (especialmente animales).
- **Un contrato de publicación estable:** la web (`nueva-version`) consume un esquema único compatible con el render actual (`publication`, `icons`, `gallery`, `videos[]`, `animal`/`event`, `contentHtml`, `cta`).
- **Gestión híbrida en el gestor:** sección dedicada “Web/Contenido público” (visión global, SEO, publicación) + acciones rápidas desde la ficha de la entidad.
- **SEO real para fichas dinámicas:** las fichas/eventos cargados desde endpoint requieren HTML indexable por URL/slug (prerender/build o estrategia equivalente), metas/OG/canonical/JSON-LD, sitemap y redirects (ver §6).
- **Backend como fuente de verdad:** validación, autorización por rol en cada endpoint gestor, filtrado de campos/estados y composición del payload público en servidor (GAS).

---

## 2. Inventario y consumo en `nueva-version` (alineado con custom-page)

| Zona/componente | Fuente/consumo actual | Necesidad de endpoint |
|---|---|---|
| `nueva-version/js/blog-api.js` (`HistoriasAPI`) | `../data/blog-posts.json` (`getAllPosts`, `getPostBySlug`, `getSiteConfig`) | `/publicaciones` (listado) y `/publicaciones/:slug` (detalle) o equivalentes `/v1` |
| `historias.html` (`blog-render-index.js`) | Posts filtrados (excluye adopción/acogida/SC según lógica actual) | Listado por `type/category/status/listed` con reglas claras |
| `post.html` (`blog-render.js`) | Detalle por `?slug` (modo ficha/historia, `publication.icons/gallery/videos`, CTA contextual) | Detalle completo por `slug` con `contentHtml`, media, `animal`/`event`, `seo`, `cta` |
| Listados adopción (`main.js`, `[data-adoption-list]`) | `blog-posts.json` filtrado por `category` (Gatos/Perros en adopción) | `type=animal` + `category`/`status/species` |
| Secciones hoy estáticas a dinamizar (prioridad) | `acogidas.html`, `casos-externos.html`, `adoptados.html`, destacados home | Consultas filtradas al endpoint público/gestor |
| Chat asistente (`main.js`) | Búsqueda sobre posts cargados | Búsqueda `q` o dataset cacheado |
| Formularios (`NebakForms`, `data-static-form`) | Envío simulado | `POST /v1/forms/submit` (endpoint separado, ver §5.4) |

**Implicación:** el endpoint debe entregar el esquema que ya espera el render (`coverImage/image`, `contentHtml`, `publication`/campos equivalentes `icons,gallery,videos`, `type/category/status`, `cta`, y contexto `animal/event`).

---

## 3. Modelo de contenido y esquema de publicación

### 3.1 Tipos y categorías (según `estructura-endpoint-publicaciones.md`)
- **`type`:** `animal` | `evento` (y en la evolución puede convivir `historia/blog` según taxonomía unificada; definir regla en Fase 0).
- **`category` (ejemplos observados/previstos):** `Acogida`, `Acogidas`, `Gatos en adopción`, `Perros en adopción`, `Adoptados`, `Caso externo`, `Eventos` (y posibles `SC`, etc.).
- **`status` (recomendado):** animales `en_adopcion`, `en_acogida`, `adoptado`, `reservado`, `urgente`, `cerrado`; eventos `activo`, `programado`, `finalizado`, `cancelado`.

### 3.2 Esquema común `Publicacion` (contrato público)

Campos alineados con `estructura-endpoint-publicaciones.md`:
- **Obligatorios/recomendados:** `id`, `slug`, `type`, `category`, `status`, `title`, `excerpt`, `publishedAt` (ISO/recomendado), `coverImage:{src,alt}`, `contentHtml`.
- **Estructura de presentación (requerida para fichas/publicaciones normalizadas):** `icons[]` (`{icon,label,value}`), `gallery[]` (`{src,alt,caption?,order?}`), `videos[]` (`{title?,provider,url,thumbnail?,durationSec?,note?}`) y compatibilidad `video` único.
- **Opcionales:** `updatedAt`, `author`, `tags[]`, `cta:{label,url}`.
- **Condicionales:** `animal` cuando `type="animal"`, `event` cuando `type="evento"`.
- **Extensiones recomendadas (compatibilidad/migración y gestor):** `listed`, `featured`, `flags` precalculadas (urgente/cachorro/adulto/especial), `image/imageAlt/dateFormatted/readTime` legacy si facilitan migración, y bloque `seo` (`metaTitle`, `metaDescription`, `ogImage`, `canonical`, `robots`, `og/twitter`).

### 3.3 Bloque `animal` (ficha pública curada)
Estructura base: `names[]`, `species`, `breed`, `sex[]`, `age{value,unit,label}`, `size`, `color?`, `health{vaccinated,dewormed,neutered,microchipped,specialNeeds}`, `temperament[]`, `compatibility{dogs,cats,kids}`, `adoption{mode,feeEur,includes,requirements}`, `foster{temporary,reason,durationLabel,expensesPolicy}`, `location{city,province,shelter?}`, `contact{email,phone}`.

**Lista blanca (SÍ, según política):** datos necesarios para la ficha pública (identidad del animal, descripción pública, estado público, ubicación general, medios públicos seleccionados, contacto público previsto).  
**Excluir siempre (NO):** adoptantes/solicitantes, acogidas internas, contratos, documentos, gastos/donaciones, apadrinamientos internos, datos médicos sensibles no aptos para publicar, dirección exacta, notas internas, historial/auditoría, IDs internos correlables con datos privados.  
**Regla:** el payload público se construye campo a campo en servidor; nunca se expone la ficha interna del gestor.

### 3.4 Bloque `event`
`kind`, `startDate/endDate` (ISO), `timezone`, `location{name,address,city,onlineUrl}`, `organizer{name,contactEmail,phone}`, `audience[]`, `agenda[]`, `registration{required,url,label}`, `milestone{label,value,date}`. Estados recomendados: `activo`, `programado`, `finalizado`, `cancelado`.

### 3.5 Mapeo interno (gestor) → publicación pública
- **Origen:** `animales` (y entidades relacionadas en el gestor), más fuente dedicada para eventos/historias publicables.
- **Capa de publicación web:** configuración editorial por elemento (campos en entidad o tabla/hoja separada `web_publicaciones`/`web_animales`/`web_eventos`): `slug`, `estado_publicacion` (`borrador/publicado/oculto`), `publicado_web`, `indexable`, `titulo_publico/extracto/descripcion_publica`, selección de `cover/galeria/videos`, `icons`, `seo_*`, `og_*`, `orden/destacado`, `fecha_publicacion/actualizacion`.
- **Normalización:** `publication` (`nebak-post-v1`) o campos equivalentes directos en `Publicacion`, según lo que consuma `nueva-version` (mantener compatibilidad).

---

## 4. Endpoints públicos (web, solo lectura)

> Canal **separado** del API de administración: sin token admin, sin datos internos, CORS restringido al dominio público, respuestas construidas por lista blanca.

### 4.1 Listado de publicaciones
- **Contrato de referencia (`estructura-endpoint-publicaciones.md`):** `GET /api/publicaciones`
- **Query params:** `type` (`animal|evento`), `category`, `status`, `species` (`gato|perro|otros`), `q`, `page`, `pageSize`, `sort` (ej. `-publishedAt`, `publishedAt`).
- **Respuesta:**
```json
{
  "endpoint": "GET /api/publicaciones",
  "generatedAt": "ISO-8601",
  "filters": { "type": [], "category": [], "status": [], "species": [], "q": "string" },
  "pagination": { "page": 1, "pageSize": 12, "total": 0, "totalPages": 0 },
  "data": [ /* Publicacion[] (lista blanca) */ ]
}
```
- **Reglas:** solo `publicado_web`/`published` y estados permitidos; paginación acotada; proyección ligera opcional (`fields=card`) para listados.

### 4.2 Detalle de publicación
- **`GET /api/publicaciones/:slug`** (o `:id` según compatibilidad). Devuelve la publicación completa (incluye `icons`, `gallery`, `videos[]/video`, `contentHtml`, `animal`/`event`, `seo`/schema si aplica).
- **404** para no publicado, no permitido o inexistente (no revelar borradores).

### 4.3 Endpoints/alias recomendados (compatibilidad y claridad)
Para simplificar consumo de `nueva-version` y evolución (alineado con el análisis integral):
- `GET /v1/publicaciones` y `GET /v1/publicaciones/:slug` como contrato versionado equivalente/canónico.
- Alias: `GET /v1/animales` (= `type=animal`), `GET /v1/eventos` (= `type=evento`), `GET /v1/blog|historias` según taxonomía definida.
- `GET /v1/config` (datos públicos de sitio/contacto/SEO por defecto) y `GET /v1/taxonomias` (filtros disponibles).
- (Opcional) `GET /v1/sitemap` o export de URLs/`lastmod` para generación de sitemap.

**Compatibilidad:** exponer `/api/publicaciones` (y detalle por `slug`) como alias estable para la web actual, o adaptar el cliente a `/v1`; mantener un único handler/mapeo interno.

### 4.4 Requisitos no funcionales del canal público
- **CORS:** solo dominios de la web pública.
- **Caché:** `Cache-Control` y/o ETag/`Last-Modified` (por `updatedAt`/versión), cacheo en GAS (`CacheService`) cuando aplique.
- **Errores:** JSON consistente, sin detalles internos.
- **Rendimiento:** paginación, lecturas agrupadas, opción de exportación JSON estática si crece tráfico (contrato estable).

---

## 5. Endpoints del gestor (admin, autenticados y autorizados)

> Requieren token/identidad y **autorización por rol en cada acción** (denegar por defecto). Separados del canal público.

### 5.1 Gestión de publicación web de animales
Objetivo: curar y configurar lo que se publica (sin exponer ficha interna).

| Endpoint/acción (propuesto) | Método | Función | Datos clave |
|---|---|---|---|
| `GET ?endpoint=web-animales` | GET | Listar animales con estado/configuración web | filtros (`estado_publicacion`, `q`, `publicado`, paginación), flags de completitud (slug/SEO/imagen) |
| `GET ?endpoint=web-animales&id={animal_id}` | GET | Obtener configuración pública/SEO del animal | campos editoriales, `slug`, flags, `estado_publico`, media seleccionada, SEO/OG, validaciones |
| `POST web-animales` (upsert) | POST | Crear/actualizar configuración pública | `animal_id`, `estado_publicacion/publicado_web`, `indexable`, `slug`, campos públicos/SEO, selección media, `orden/destacado` |
| `POST web-animales-estado` | POST | Publicar/ocultar/despublicar | `animal_id`, `estado_publicacion` |
| `GET ?endpoint=web-animales-preview&id={animal_id}` | GET | Previsualizar payload público (lista blanca) | mismo objeto que entregaría el endpoint público (para validar filtrado) |
| `GET ?endpoint=web-slug-check&tipo=animal&slug=...` | GET | Validar unicidad/formato de slug | `{ disponible, normalizado, conflicto? }` |

**Reglas:** solo permitir publicar si el estado interno es publicable (según política) y si se cumplen mínimos (nombre, descripción pública, imagen/estado público). `slug` único por tipo.

### 5.2 Gestión de eventos/historias publicables
| Endpoint/acción (propuesto) | Método | Función |
|---|---|---|
| `GET/POST web-eventos` | GET/POST | Listar/obtener/crear/actualizar/eliminar(archivar) eventos con datos públicos y SEO |
| `GET web-eventos&id=...` | GET | Detalle para edición |
| `POST web-eventos-estado` | POST | Cambiar estado publicación/indexación |

Campos según §3.4 y contrato `event`; soporte `icons/gallery/videos` si aplica.

### 5.3 Utilidades de gestor
- `GET ?endpoint=web-resumen`: contadores (publicados, borradores, sin SEO/slug/imagen) para la sección Web.
- Registro en **auditoría** de publicar/despublicar y cambios SEO relevantes.
- **Permisos:** p. ej. edición web para `admin`/`coordinador` (o rol dedicado); `consulta` solo lectura según política.

### 5.4 Formularios web pública (endpoint separado, no público de datos)
Alineado con el análisis de `nueva-version` (no mezclar con publicaciones):
- `POST /v1/forms/submit` (o acción dedicada): recibe `form_type`, `concepto`, `fields`, `page_url`, `privacy_accepted`, `recaptcha{token,action}`.
- GAS: verifica reCAPTCHA server-side, valida (honeypot/rate/whitelist por tipo), opcionalmente registra en hoja `solicitudes_form`, envía correo por plantilla (incluye `animal_slug/url` cuando aplique) y responde `{ok,id}`/error.
- Tipos: `contacto-general`, `adopcion-animal`, `consulta-animal`, `acogida`, `voluntariado`, `socio`, `donaciones`.

---

## 6. SEO técnico (web pública) — requisitos para la migración

- **Fichas dinámicas y SEO:** `post.html?slug=` renderizado solo en cliente es insuficiente para indexación/snippets/OG. Estrategia recomendada: **prerender/build por slug** (o SSG/export) generando HTML por publicación con contenido y metadatos; endpoint como fuente en build y/o runtime controlado.
- **URLs canónicas:** rutas limpias por tipo (`/ficha/{slug}/`, `/animales-en-adopcion/{slug}/`, `/eventos/{slug}/` o según arquitectura final) y mapeo/redirect 301 desde `post.html?slug=` y rutas antiguas.
- **Por página/detalle:** `<title>`, `meta description`, canonical, robots (`index/noindex`), Open Graph/Twitter, JSON-LD (`Article/BlogPosting` o adecuado, `Event`, `BreadcrumbList`, `Organization/WebSite` donde aplique).
- **`sitemap.xml` y `robots.txt`:** generados con URLs publicadas/indexables y `lastmod` desde `updatedAt/publishedAt`.
- **Parámetros:** `?from=` no indexable (canonical al slug). 404/410 o redirección para contenido retirado.
- **Imágenes:** URLs estables, `alt`, optimización y buen LCP.

---

## 7. Seguridad, privacidad y cumplimiento

- **Gestor:** autenticación + autorización por rol en cada endpoint `.gs`; `sin_acceso`/no autorizado denegado (alineado al plan de seguridad).
- **Público:** sin token admin, lista blanca estricta, sin datos personales/sensibles, CORS limitado, errores genéricos.
- **Cookies/privacidad (web pública):** consentimiento previo real para no esenciales, bloqueo condicional de terceros (Maps/YouTube/Analytics/reCAPTCHA según implementación) y políticas adaptadas a protectora (ver análisis integral en `custom-page/docs`).
- **Datos:** ubicación general (no exacta) en público; retención/minimización en formularios y auditoría de publicaciones.

---

## 8. Decisiones abiertas (cerrar en Fase 0)

- **Modelo de datos:** campos de publicación en `Animales` vs entidad/hoja separada (`web_animales`/`web_publicaciones`) — recomendado separada.
- **Fuente de eventos/historias publicables:** hoja/entidad dedicada (no `actividad` interna).
- **Mapeo estados internos → `estado_publico`** y reglas (adoptado en escaparate sí/no).
- **Selección de media pública:** origen (galería/documentos/URLs) y permisos.
- **Convención de API pública:** `/api/publicaciones` (compatibilidad actual) vs `/v1/*` (versionado) o ambos (alias).
- **Entrega:** endpoint dinámico GAS vs exportación JSON estática programada (o híbrido).
- **Dominio(s) web pública** para CORS/canonical y roles con permiso de gestión web.
- **Alineación fina** con `docs/custom-page` ante cambios futuros en sus contratos.

---

## 9. Resumen de entregables para implementación

- **Backend gestor (`.gs`/Sheets):** modelo de publicación/SEO, endpoints CRUD/config/preview/slug-check, autorización, normalización de payload público.
- **Backend público (`.gs`/feed):** `/api/publicaciones` y/o `/v1/*` de solo lectura con lista blanca, filtros, detalle por slug, config/taxonomías/sitemap según alcance.
- **Admin (este repo):** sección Web + edición contextual, validaciones, previsualización y permisos.
- **Web pública (`custom-page`):** consumo del contrato, render/SEO técnico (prerender, metas/schema, sitemap/redirects) y formularios/cookies según plan integral.
- **Documentación operativa:** contratos, `CONFIG`, CORS, procedimiento de publicación y actualización de datos.