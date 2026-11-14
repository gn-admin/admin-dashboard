# Análisis: Web pública, publicaciones, SEO y endpoints (gestor + público)

> **Alcance:** análisis y definición funcional/técnica para planificar (sin implementar).  
> **Contexto:** el panel de administración (este repo) gestiona animales, acogidas, adopciones, etc. y debe alimentar una **web pública separada** con fichas públicas de animales y eventos propios, con buen SEO.  
> **Fuentes internas solicitadas:** no se localizaron en este workspace los archivos indicados (`docs/custom-page/` con “estructura endpoints publicaciones” y el otro md). Se buscó en el repositorio y en `.internal-docs` sin resultados. Este documento se basa en la arquitectura conocida del proyecto, el análisis de estructura/SEO tipo Wix (CMS/publicaciones dinámicas) y buenas prácticas. Si compartes esos md, se puede alinear el plan/contratos con ellos.

---

## 1. Objetivos y principios

- **Separación de superficies:** la web pública es un sitio/app distinto del admin. El admin no expone su API/token ni datos internos.
- **Capa pública curada (lista blanca):** la web consume solo contenido marcado como publicable y solo campos permitidos. Nunca se publica la ficha interna completa (especialmente animales).
- **Gestión central + contextual:** una sección dedicada en el admin para “Web/Contenido público” (visión global, publicación, SEO) complementada con acciones rápidas desde la ficha de cada entidad.
- **SEO primero:** URLs estables, metadatos por elemento, indexación controlada, datos estructurados, sitemap/robots y buen rendimiento.
- **Backend como fuente de verdad:** validación, autorización y filtrado de campos/estados en el servidor (Apps Script), no solo en UI.

---

## 2. Modelo de contenido (replicar patrón publicaciones/CMS)

### 2.1 Tipos de contenido público
| Tipo | Origen interno | Página | Notas |
|---|---|---|---|
| `animal` | Ficha de animal (`animales`) | Listado + detalle | Vista pública curada (no ficha interna). |
| `evento` | Contenido propio (nueva entidad/hoja o fuente dedicada) | Listado + detalle | Borrador/publicado, fechas/lugar público, schema `Event`. |
| `pagina` (opcional) | Contenido propio | Detalle | Textos estáticos (quiénes somos, contacto, cómo ayudar). |

### 2.2 Estados y flags (editorial/publicación)
- `estado_publicacion`: `borrador` | `publicado` | `oculto` | (opcional `programado`).
- `publicado_web` (bool/derivado): visible en feed público.
- `indexable` (bool): permitir indexación (`index/noindex`).
- `fecha_publicacion`, `fecha_actualizacion`.
- `orden` / `destacado` (para listados/portada).

### 2.3 Campos comunes de publicación (SEO y presentación)
| Campo | Descripción | Uso |
|---|---|---|
| `id_publico` / `slug` | Identificador único legible en URL (`/animales/luna`) | Ruta canónica, estable |
| `titulo` / `nombre_publico` | Título visible y base de `<title>` | UI + SEO |
| `extracto` | Resumen corto | Listados, fallback meta description, OG |
| `contenido_publico` / `descripcion_publica` | Cuerpo/descripción pública | Detalle |
| `imagen_principal` | URL/ID de imagen cover | Detalle, listados, OG/Twitter |
| `galeria_publica` | Lista de medios seleccionados | Detalle (solo públicos) |
| `seo_title` | Title tag (si vacío, derivar de plantilla) | `<title>` |
| `seo_description` | Meta description | `<meta name="description">` |
| `canonical_url` / derivada | URL canónica | `<link rel="canonical">` |
| `og_title`, `og_description`, `og_image` | Open Graph (fallback a SEO/título/imagen) | Compartir en redes |
| `twitter_card`, `twitter_title`, `twitter_description`, `twitter_image` | Twitter Cards | Compartir |
| `robots` / `indexable` | `index,follow` o `noindex` | Control de indexación |
| `schema_type` + datos | JSON-LD según tipo (`Event`, etc.) | Rich results |
| `categorias` / `etiquetas` / taxonomías | Clasificación pública | Listados, filtros, SEO contextual |

### 2.4 Ficha pública de `animal` (lista blanca — qué SÍ / qué NO)

**SÍ (ejemplo publicable, según política):** `id_publico/slug`, `nombre`, `especie`, `raza`, `sexo`, `edad` o `fecha_nacimiento` (si se decide), `tamano`, `descripcion_publica`/historia, `caracter`/compatibilidades públicas, `estado_publico` (en adopción, en acogida, adoptado en escaparate — solo estados permitidos), `ubicacion_general` (no dirección), `imagen_principal`, `galeria_publica`, `fecha_publicacion`, `fecha_actualizacion`, `destacado/orden`, etiquetas públicas.

**NO (nunca en feed público):** datos de adoptantes/solicitantes/acogidas, contratos, documentos, gastos/donaciones, apadrinamientos internos, datos médicos/veterinarios sensibles, dirección exacta, notas internas, historial/auditoría, identificadores internos que permitan correlación con datos privados, cualquier campo no incluido en la lista blanca.

> **Regla:** el endpoint público construye la respuesta solo desde la lista blanca y solo para registros `publicado_web` y en estados permitidos.

### 2.5 Eventos (`evento`)
- Campos propios: `titulo`, `slug`, `descripcion`, `fecha_inicio`, `fecha_fin` (opcional), `hora`, `lugar_publico`, `direccion_publica` (si procede, general), `imagen`, `enlace_inscripcion`/contacto público, `estado_publicacion`, `indexable`, campos SEO/OG.
- Fuente recomendada: hoja/entidad dedicada “Eventos web” o “Publicaciones” (no reutilizar `actividad` interna).
- Schema: `Event` (JSON-LD) con fechas, ubicación y estado.

---

## 3. Arquitectura de endpoints (gestor/admin vs público)

> **Importante:** mantener el API de administración protegido (token/identidad + autorización por rol en cada endpoint, hito 1.1 del plan de seguridad). El canal público es **separado**, de **solo lectura**, con **lista blanca** y sin token admin.

### 3.1 Endpoints para el gestor (admin, autenticados y autorizados)

Objetivo: gestionar contenido público, metadatos SEO y publicación desde el panel (sección web + acciones contextuales).

#### A. Configuración/publicación de animales (capa pública sobre `animales`)
> Opción de diseño: (1) campos de publicación guardados en la propia entidad/hoja de animales, o (2) entidad separada `publicaciones_animales`/`web_animales` que referencia `animal_id`. La opción (2) aísla mejor lo público de lo interno; elegir según modelo GAS/hojas.

| Acción (ejemplo) | Método | Descripción | Entrada (ejemplo) | Salida (ejemplo) |
|---|---|---|---|---|
| `web-animales` (list) | GET | Listar animales con estado de publicación web (para sección “Web”) | `?endpoint=web-animales&estado_publicacion=&q=&page=&limit=` | `{ items:[{ animal_id, nombre, estado_interno, publicado_web, indexable, slug, seo_ok, imagen_principal, fecha_actualizacion_publica }], total }` |
| `web-animales` (get) | GET | Obtener configuración pública de un animal | `?endpoint=web-animales&id=<animal_id>` | `{ data:{ animal_id, publicado_web, estado_publicacion, indexable, slug, titulo_publico, descripcion_publica, extracto, imagen_principal, galeria_publica, seo_title, seo_description, og_*, estado_publico, orden, destacado, validaciones } }` |
| `web-animales` (upsert) | POST | Crear/actualizar configuración pública y SEO | body: `{ animal_id, publicado_web, indexable, slug, ...campos_publicos_permitidos }` | `{ data:{...} }` |
| `web-animales` (unpublish/estado) | POST | Publicar/ocultar/despublicar | `{ animal_id, estado_publicacion }` | `{ data:{...} }` |
| `web-animales-preview` | GET | Vista previa del payload público (lista blanca) | `?endpoint=web-animales-preview&id=<animal_id>` | `{ data:{ ...payload_publico_normalizado } }` |

**Validaciones gestor:** slug único por tipo, campos obligatorios para publicar (ej. nombre, descripción pública, imagen/estado público), coherencia con estados internos permitidos, longitud recomendada SEO (avisos, no bloqueos duros salvo reglas definidas).

#### B. Eventos web (entidad propia)
| Acción (ejemplo) | Método | Descripción | Entrada | Salida |
|---|---|---|---|---|
| `web-eventos` (list) | GET | Listar eventos (borrador/publicado/oculto) | filtros, paginación | `{ items, total }` |
| `web-eventos` (get) | GET | Detalle/edición | `id/slug` | `{ data }` |
| `web-eventos` (create) | POST | Crear evento | body evento | `{ data }` |
| `web-eventos` (update) | POST | Actualizar evento/SEO/estado | `{ id, ... }` | `{ data }` |
| `web-eventos` (delete) | POST | Eliminar (o archivar) | `{ id }` | `{ ok:true }` |

#### C. Utilidades gestor (opcionales)
- `web-slug-check`: validar disponibilidad/formato de slug.
- `web-publicaciones-resumen`: métricas (publicados, borradores, sin SEO, sin imagen) para la sección web.
- Auditoría de cambios de publicación (reutilizar/registrar en `auditoria`).

**Autorización:** restringir gestión web a roles con permiso (p. ej. `admin`/`coordinador` o rol específico); `consulta` sin escritura.

### 3.2 Endpoints públicos (solo lectura, separados del admin)

Objetivo: alimentar la web pública con datos ya filtrados y curados. **Sin token de administración**, sin datos internos, con CORS limitado al dominio público.

| Acción (ejemplo) | Método | Descripción | Parámetros | Respuesta (lista blanca) |
|---|---|---|---|---|
| `public-animales` | GET | Listado público de animales | `estado_publico`, `especie`, `q`, `destacado`, `page`, `limit`, `sort` | `{ items:[{ slug, nombre, especie, raza, edad, tamano, extracto, imagen_principal, estado_publico, ubicacion_general, fecha_publicacion, url }], meta:{ total, page, limit } }` |
| `public-animales/:slug` (o `slug`) | GET | Detalle público de un animal | `slug` o `id_publico` | `{ data:{ slug, nombre, ..., descripcion_publica, galeria_publica, seo:{ title, description, canonical, robots, og, twitter }, schema, fecha_publicacion, fecha_actualizacion } }` o 404 si no publicado/no permitido |
| `public-eventos` | GET | Listado público de eventos | `desde`, `hasta`, `q`, `page`, `limit` | `{ items:[...campos públicos...], meta }` |
| `public-eventos/:slug` | GET | Detalle público de evento | `slug` | `{ data:{ ...campos públicos..., seo, schema(Event) } }` |
| `public-sitemap` (opcional) | GET | Datos para generar sitemap | — | `{ urls:[{ loc, lastmod, changefreq, priority, type }] }` |
| `public-site-meta` (opcional) | GET | Config global pública | — | `{ siteName, defaultSeo, organization? }` |

**Reglas del canal público:**
- Solo `estado_publicacion = publicado` (y `indexable`/flags según aplique).
- Solo estados internos permitidos para animales.
- Respuesta construida campo a campo (lista blanca), nunca `SELECT *`/objeto interno completo.
- 404 para no publicado/no existente (no filtrar existencia de borradores internos).
- Cacheo/`Cache-Control` y paginación; rate limiting razonable si es dinámico.
- CORS solo para el/los dominios de la web pública.

### 3.3 Contrato de error/respuesta (recomendado)
- Éxito: `{ status: "ok", data/items, meta? }` (alinear con convenciones actuales si aplica).
- Error: `{ status: "error", code, message }` sin detalles internos sensibles.
- Público: mensajes genéricos; no exponer estructura interna ni razones de autorización.

---

## 4. SEO técnico (a implementar en la web pública)

- Rutas: `/{tipo}/{slug}` (ej. `/animales/{slug}`, `/eventos/{slug}`) + listados con filtros en query.
- `<title>`, `<meta name="description">`, `<link rel="canonical">`, `meta robots` por página.
- Open Graph y Twitter Cards por página/detalle (con fallback).
- JSON-LD por tipo (`Event`, breadcrumbs, y metadatos de organización/sitio si aplica) con datos coherentes y reales.
- `sitemap.xml` y `robots.txt` generados desde contenido publicado/indexable.
- Redirecciones 301 al cambiar `slug`.
- Imágenes con `alt`, optimizadas; HTML semántico; buen rendimiento móvil.
- Evitar contenido duplicado (paginación/filtros con canonical o `noindex` según estrategia).

---

## 5. Seguridad y cumplimiento

- Autorización por rol en **todos** los endpoints del gestor (`.gs`), denegación por defecto.
- Canal público sin token admin, sin datos sensibles, con lista blanca estricta.
- Validar/sanitizar entradas (slugs, textos, URLs de imagen) y limitar tamaños.
- Auditoría de acciones de publicación y cambios SEO relevantes.
- RGPD/privacidad: no publicar datos personales ni información identificativa; ubicación general, no exacta.

---

## 6. Dependencias y decisiones abiertas (a cerrar antes de implementar)

- Fuente de verdad para configuración pública de animales: campos en hoja `Animales` vs entidad separada `web_animales/publicaciones`.
- Dónde se gestionan **eventos** (hoja nueva `Eventos`/`Publicaciones web`).
- Estados internos de animal que se consideran publicables y mapeo a `estado_publico`.
- Selección de imágenes públicas (referencia a galería/documentos existentes vs URLs dedicadas).
- Estrategia de entrega pública: endpoint dinámico en GAS vs exportación JSON estática programada (o híbrido con caché).
- Dominio(s) de la web pública para CORS y canonical.
- Roles con permiso para gestionar la web en el admin.

> **Nota:** alinear contratos finales con los md de `docs/custom-page` cuando estén disponibles.
