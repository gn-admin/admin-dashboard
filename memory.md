# memory.md — Qué se ha hecho

> Registro de trabajo del gestor web y del visor público (`publico.html`, simulación de la web real de Grupo Nebak).
> Última actualización: 2026-11-14. Contratos y detalles: [`GESTOR_WEB_PLAN_Y_ENDPOINTS.md`](GESTOR_WEB_PLAN_Y_ENDPOINTS.md). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

## Estado en una frase

El flujo gestor → canal público → visor funciona de punta a punta, con SEO prerenderizado, canónica única, retiradas con 410 lógico y despliegue diario; queda desplegar dos ficheros de Apps Script y llevar el SEO al proyecto real.

## Entregado

### Visor público (`src/publico.html`, `src/js/publico.js`, `src/css/publico.css`)

- Tema portado de `custom-page/nueva-version`: hero a dos columnas, datos destacados con iconos, tarjetas de 24 px, Inter/Montserrat (CSP con Google Fonts). Verificado a 360/768/1280.
- Listado, ficha y estados vacío/error/retirada; composición de la ficha extraída a `Publico.htmlDetalle(p)` para reutilizarla desde Node.
- **Canónica única**: la ficha del SPA emite `canonical`, `og:url` y `mainEntityOfPage` hacia `publicaciones/<slug>.html`; el listado y las páginas de estado conservan su URL. SPA y estática ya no compiten.
- La pantalla de retirada muestra «Publicación retirada» con `noindex,nofollow`, sin JSON-LD.

### SEO y prerender (`scripts/prerender-publico.js`)

- Genera `src/publicaciones/<slug>.html` (title, description, robots, canonical absoluto, OG/Twitter, JSON-LD y HTML renderizado sin JS), `src/sitemap.xml` y `src/robots.txt`.
- **Guarda de despliegue**: bloquea con `exit 1` si no puede leer el canal, si falla una ficha o si sitemap/robots no son válidos; no borra la salida anterior. `--soft` solo avisa (uso manual).
- **Avisos en Actions**: `::warning::` para lo no bloqueante (p. ej. no poder leer retiradas) y `::error::` para el fallo que detiene el deploy, con `%`/saltos escapados.
- **Fixtures versionadas** en `tests/fixtures/prerender/`: `ficha-normal.json`, `retirada.json`, `sin-portada.json`. Los tests ejecutan el generador completo en un directorio temporal y validan el HTML, el sitemap y el robots sin depender del canal real.
- Integrado en `.github/workflows/deploy.yml` después de `npm test`; además **ejecución diaria** (`cron: '17 3 * * *'`, UTC) para aplicar retiradas sin push. Concurrencia en cola para no cancelar un deploy en curso.

### Retiradas y 410

- Estado `retirado` en el canal: la fila **no se borra** (lápida), `listed/indexable = false`, el slug queda reservado y no se reutiliza.
- Detalle del canal: `status: "gone"` + `code: "gone"` para el slug actual o histórico de una retirada. Se excluye de feed, sitemap y redirects.
- Nuevo endpoint público `?endpoint=retiradas` con los slugs retirados (y sus históricos) para que la web publique una página de retirada.
- Página estática de retirada: `noindex,nofollow`, sin canonical ni JSON-LD, **fuera del sitemap**. Si una ficha publicada recupera el slug, la ficha manda sobre la lápida.
- Gestor: botón «Retirar (410)» con confirmación; el resumen cuenta las retiradas aparte (tarjeta «Retiradas», fuera de borradores e incompletas) y el listado las muestra con badge, sin acciones de republicar ni volver a retirar.
- Plazo máximo documentado: **~24 h** (siguiente ejecución) **+ 5–10 min** de pipeline; ~48 h si fallan dos ejecuciones seguidas. Se puede forzar con `workflow_dispatch`.

### Gestor de contenido (`src/js/web.js` + `apps-script/WebPublicaciones.gs`)

- Alta/edición de publicaciones de animales, eventos e historias; completitud, SEO, media, CTA, preview y slug check.
- Historial de slugs (`slug_historial`) con 301 desde `?endpoint=redirects`; un slug histórico no se reutiliza.
- Resumen con totales por tipo y por estado, diagnósticos de hoja y aviso de cabeceras.

### Media por ficha (Drive)

- Una **carpeta por publicación** en Drive, separada por tipo: `animales/<slug>`, `eventos/<slug>`, `historias/<slug>` dentro de la raíz `DRIVE_WEB_FOLDER_ID`; se busca por nombre y se reutiliza.
- Endpoint `POST web-media-subir` con `publicacion_id`, `tipo` (`portada`, `galeria`, `video`, `documento`), `archivo_base64`, `nombre` y `mime_type`. Devuelve `fileId`, `carpeta`, `carpeta_url`, `url` (thumbnail para imágenes) y `download`.
- Límites: imágenes 5 MB, vídeo 15 MB, documentos 10 MB. Nombre de archivo ordenado: `<tipo>-<original>-<uuid>.<ext>`.
- Imágenes y vídeos se comparten (los consume la web); **los documentos quedan privados**. Ni la raíz ni la carpeta de la ficha se comparten.
- Formularios: animal (portada, galería, vídeo, documento) y evento/historia (portada, galería, documento). Los documentos se guardan en `media.documents` y no se publican.
- **Galería:** `url|alt|pie` por línea, retrocompatible (una URL sola sigue valiendo); el visor pinta `<figure>`/`<figcaption>`.
- **Enlaces de Drive normalizados al pegar:** fichero → `thumbnail?id=…&sz=w1200|w1600` (imagen) o `/file/d/…/view` (vídeo/documento); enlace de carpeta → rechazado con aviso al guardar.
- Requiere `APPS_SCRIPT_DRIVE_WEB_FOLDER_ID` en `.env` y regenerar `Config.gs`.

### Despliegue

- GitHub Pages sirve `publico.html`, `publicaciones/laia.html`, `sitemap.xml` y `robots.txt` (200). Service worker actual `v228`.
- `npm test`: **489/489**.

## Decisiones cerradas

- La ficha canónica es la página **estática**; el SPA apunta a ella.
- El 410 se modela como `status:'gone'` porque el canal (JSONP) no puede devolver códigos HTTP; la lápida conserva el slug.
- El prerender **bloquea** el deploy antes que publicar sin sitemap/robots.
- El port a `custom-page/nueva-version` **no pertenece a este repositorio**: se entrega documentado (§7.2 y §7.4 del plan).
- No implementar la ficha configurable (§7.3) sin aprobación.

## Pendiente manual (fuera de git)

1. **Desplegar `apps-script/Code.gs` y `apps-script/WebPublicaciones.gs`** como nueva versión en Apps Script. Hasta entonces no hay `gone` (410), ni `?endpoint=retiradas`, ni `web-media-subir`.
2. **Raíz de media configurada** en `.env` y `Config.gs` (carpeta «Fichas Animales»; ID en `.internal-docs`, no versionado). Falta pegar `Config.gs` en Apps Script junto a los dos `.gs`.
3. Dominio propio (`gruponebak.net`) y Search Console: `sitemap.xml`/`robots.txt` en la raíz, envío del sitemap y canonical `dominio + ruta` sin `.html`.
4. Port del SEO al proyecto real (páginas por slug, 410 real en el hosting, 301 desde `slug_historial`).
5. Indexación real y auditoría formal: dependen del dominio y del proyecto web.

## Siguientes pasos propuestos (no implementados)

1. Desplegar los dos `.gs` (desbloquea 410 y el canal de retiradas).
2. Tras desplegarlo, convertir el aviso de retiradas en error si vuelve a fallar (que una lápida rota no pase desapercibida).
3. Salida de una retirada desde el panel («Restaurar») y auditoría de quién retira.
4. Dominio propio + Search Console (lo único que queda de indexación).
5. Fixtures adicionales (301, ficha oculta) y validación de JSON-LD/canonical único sobre el HTML generado.

## Mapa rápido

| Área | Archivos |
|---|---|
| Visor | `src/publico.html`, `src/js/publico.js`, `src/css/publico.css` |
| Prerender | `scripts/prerender-publico.js`, `tests/prerender.test.js`, `tests/fixtures/prerender/` |
| Gestor | `src/js/web.js`, `src/js/api.js` |
| Media | `apps-script/WebPublicaciones.gs` (`webSubirMedia`), carpeta por ficha en Drive |
| Backend | `apps-script/WebPublicaciones.gs`, `apps-script/Code.gs` (endpoints públicos) |
| CI | `.github/workflows/deploy.yml` |
| Docs | `AGENTS.md`, `GESTOR_WEB_PLAN_Y_ENDPOINTS.md`, `PROGRESO.md` |

## Cómo reproducir en local

```bash
npm test                                   # 489 tests
npm run prerender -- --fixture tests/fixtures/prerender/retirada.json --out .tmp-prerender   # y borrar .tmp-prerender
npx --no-install serve src -l 8099 --no-clipboard
# http://localhost:8099/publico.html#/publicacion/laia
```

## Historial de commits (2026-11-14)

`714f053` tema del visor · `51d9cf8` SEO/prerender · `9337478`, `017e907`, `be456c8`, `dc9b339` ajustes y docs · `cce984e` canónica única + guarda + 410 · `14a34f4` páginas de retirada y gestor · `e5cb640` deploy diario · `768fdac` recuentos y docs · `06ce8fa` anotaciones de Actions y fixtures.
