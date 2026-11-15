# Handoff: Track B — Port SEO/canal al proyecto `main`

> Documento de traspaso para ejecutar en una sesión del proyecto **`C:\Users\JonEg\Documents\proyectos\main`**.  
> Origen: implementación y validación realizadas en `admin-dashboard` (visor/simulación, canal y prerender). **No modificar el proyecto `main` desde `admin-dashboard`.**

## 1. Objetivo y alcance (Track B)

Portar a la web real lo ya validado en la simulación de `admin-dashboard`:

- **Consumo del canal público** (sin JSON estático), con filtros/búsqueda/paginación y estados vacío/error.
- **SEO por publicación**: `<title>`, description, robots, canonical (condicional), OG/Twitter y JSON-LD (`Article`/`Event`/`BlogPosting`) desde el payload.
- **Indexabilidad real**: prerender/SSG por `slug`, `sitemap.xml` y `robots.txt` físicos en el dominio propio.
- **Estados y redirecciones**: 404 real, 410 para retirados (o página `noindex` equivalente), 301 desde slugs históricos (`/v1/redirects`).
- **Criterio de aceptación:** reproducir en el dominio real la lista verificada en la simulación (§7.1 de `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` en `admin-dashboard`).

**Referencia ejecutable (no copiar a ciegas, usar como guía de comportamiento):** en `admin-dashboard` → `src/js/publico.js` (lógica/render/SEO/JSON-LD), `src/publico.html` y `src/css/publico.css` (tema alineado), `scripts/prerender-publico.js` (prerender/sitemap/robots/retiradas).

## 2. Contrato del canal (backend en GAS)

Base URL del Web App: la configurada para el canal público (`CONFIG.apiUrl` en admin / endpoint GAS desplegado). Desde navegador usar **JSONP** (`&callback=`) para evitar CORS; el token **no** aplica a endpoints públicos.

| Endpoint (GET) | Uso | Notas |
|---|---|---|
| `?endpoint=publicaciones` | Listado público | Filtros `type`, `category`, `species`/`status` según canal, `q`, `page`, `pageSize` (máx. 50). Respuesta cacheable (~60 s). Usar `nocache=1` solo para depurar. |
| `?endpoint=publicacion&slug=<slug>` | Detalle por slug | Devuelve publicación; puede devolver `redirect` (slug histórico → slug actual) o estado `gone`/error para retirada/no disponible. |
| `?endpoint=retiradas` | Slugs retirados/lápidas | Para generar páginas 410/`noindex` y excluir del sitemap. |
| `?endpoint=redirects` (o `/v1/redirects`) | Mapa 301 | `from` → `to` (slug histórico a actual) para reglas del hosting/build. |
| `?endpoint=sitemap` / `?endpoint=taxonomias` / `?endpoint=config` | Soporte | Según necesidad; el sitemap/robots **físicos** del sitio real deben generarse en el build/hosting del dominio propio. |

**Estados a manejar:** listado vacío (sin resultados), canal no configurado (`status:"warning"`), error de red/carga (con reintento), publicación no disponible/404 lógico (`status:"error"`, mostrar “no disponible” con `noindex,nofollow` y enlace al listado), retirada/gone (410 o página `noindex`).

## 3. Port de consumo y render (pasos)

1. **Sustituir fuente estática:** reemplazar `blog-posts.json` / `HistoriasAPI` (o equivalente en `main`) por consumo del canal (`publicaciones` + `publicacion&slug=`) vía JSONP en cliente y/o fetch en build según arquitectura de `main`.
2. **Listado:** filtros, búsqueda, paginación (respetar `pageSize` máx. y total), tarjetas con datos de lista; no depender de campos de detalle pesado. Enlaces a la ruta canónica de ficha (`/publicaciones/<slug>` o la estructura de URLs del dominio).
3. **Detalle por slug:** render de `title`, `excerpt`, `publishedAt`/`updatedAt`, `coverImage`/`image`, `contentHtml`, `tags`, `icons`/datos destacados, `gallery` (soporta `alt`/`caption`), `videos`, `animal`/`event`, `cta`, autor/tiempo de lectura según disponibilidad.
4. **Redirect de slug histórico:** si la respuesta trae `redirect.slug`/destino, reescribir la URL sin recargar (`history.replaceState`/replace) y mostrar la ficha vigente (y/o emitir redirect en prerender/hosting según `redirects`).
5. **Retiradas/410:** si `status:"gone"` o slug en retiradas, mostrar estado “Publicación retirada” con `noindex,nofollow`, sin canonical ni JSON-LD; en hosting/prerender servir 410 cuando sea posible.
6. **`pub.ficha` (C3, aditivo y opcional):** si existe, usarla para plantilla/bloques/visibilidad (`ficha.plantilla`, `ficha.bloques`, `ficha.mostrarLectura`) y ajustes de render (p. ej. ocultar lectura/galería/vídeos/ficha animal/etiquetas/CTA según bloques). **Si no existe, mantener el comportamiento actual (fallback total).** No leer `ficha` para listados; aplicarla en detalle/prerender.

## 4. SEO y metadatos (aplicar en detalle y listados según corresponda)

- **Title/description:** `seo.metaTitle` (o `title`) y `seo.metaDescription` (o `excerpt`).
- **Robots:** `seo.robots` / `indexable` (`noindex,follow` o `noindex,nofollow` según caso; retiradas/error siempre `noindex`).
- **Canonical condicional:** usar **solo** `seo.canonical || canonical` del payload. Si viene vacío (base sin dominio propio) **no emitir** `<link rel="canonical">` ni `og:url` vacío; nunca derivar de una ruta relativa. En páginas de estado/listado, usar la URL propia de la página.
- **OG/Twitter:** `og:title`, `og:description`, `og:image` (`seo.ogImage`/portada), `og:url` solo si hay canonical válido, `twitter:card` adecuado.
- **JSON-LD por tipo:** `animal` → `Article` (o tipo acordado), `evento` → `Event` (fechas/lugar/organizador/ofertas si hay), `historia` → `BlogPosting`. Un único `<script type="application/ld+json">` en fichas válidas; **ninguno** en 404/error/retirada. Incluir `mainEntityOfPage` coherente con la canónica.
- **`og:url`/canónica de ficha:** en dominio propio deben apuntar a la URL pública definitiva de la ficha (p. ej. `https://<dominio>/publicaciones/<slug>` o la ruta elegida), consistente entre HTML prerenderizado y metadatos.

## 5. Prerender, sitemap, robots y redirects (dominio propio)

1. **Prerender/SSG por slug:** generar en el build una página HTML por publicación publicada con contenido, metas, OG/Twitter y JSON-LD ya renderizados (sin depender de JS para indexación). Usar el canal como fuente (`publicaciones` paginado + `publicacion&slug=` + `retiradas`), equivalente a `admin-dashboard/scripts/prerender-publico.js`.
2. **Retiradas:** generar página de retirada (`noindex,nofollow`, sin canonical/JSON-LD, fuera de sitemap) para slugs retirados e históricos; si el hosting lo permite, responder **410**.
3. **`sitemap.xml` físico (raíz del dominio):** incluir listado y fichas publicadas/listadas/indexables según política; `lastmod` desde `updatedAt`/`publishedAt`; excluir borradores, ocultos, retirados y `listed:false`.
4. **`robots.txt` físico (raíz):** permitir contenido público y referenciar `Sitemap: https://<dominio>/sitemap.xml`; bloquear lo que no deba indexarse.
5. **Redirects 301:** generar reglas del hosting/build desde `GET ?endpoint=redirects` (slugs históricos → slug actual) en cada despliegue.
6. **Guarda de build:** si el canal no responde, faltan fichas o sitemap/robots no son válidos, fallar el build (o política equivalente) para no publicar un sitio incompleto/roto.

## 6. Checklist de aceptación (repetir en dominio real, eq. §7.1)

- [ ] Listado con contador/filtros/búsqueda/paginación y estados (sin resultados, canal sin configurar, error con reintento).
- [ ] Fichas `animal`/`evento`/`historia` renderizadas correctamente (datos, galería, vídeo, bloques animal/evento, CTA).
- [ ] Metas, OG/Twitter, canonical condicional y JSON-LD correctos por tipo; sin JSON-LD en 404/error/retirada.
- [ ] 404 lógico con `noindex,nofollow` y enlace al listado; slug histórico redirige/muestra ficha vigente.
- [ ] Retiradas: página/estado de retirada `noindex,nofollow` (y 410 si el hosting lo permite), fuera de sitemap.
- [ ] `sitemap.xml` y `robots.txt` físicos en raíz, válidos y coherentes con lo publicado.
- [ ] Redirects 301 desde mapa de redirects activos en el hosting.
- [ ] Sin desbordes/layout roto en 360 px y 1280 px; labels/`alt`/roles básicos correctos.
- [ ] Fallback correcto cuando `ficha` no existe; si `ficha` existe, respeta bloques/plantilla sin romper fichas antiguas.

## 7. Dependencias y notas

- **Dominio propio (A4, externo):** canonical/`og:url` absolutos, sitemap/robots en raíz y validación en Search Console dependen del dominio real.
- **Despliegue/config:** `.gs` del canal en `admin-dashboard` pueden requerir despliegue manual para incluir cambios recientes (p. ej. soporte `ficha` en detalle). Coordinar con el estado desplegado del Web App.
- **C3 en evolución:** el contrato de `ficha` es aditivo; consumirlo de forma tolerante (ignorar claves desconocidas, fallback si falta).
- **C4 (formularios):** es un track separado; ver `HANDOFF_RECAPTCHA_FORMULARIOS_MAIN.md` en `admin-dashboard` si se abordan formularios públicos con reCAPTCHA en `main`.
- **No modificar `main` desde este repo.** Este documento es la guía para ejecutarlo en el repositorio `main`.
