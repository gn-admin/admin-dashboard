# memory.md — Qué se ha hecho

> Registro de trabajo del gestor web y del visor público (`publico.html`, simulación de la web real de Grupo Nebak).
> Última actualización: 2026-11-14. Contratos y detalles: [`GESTOR_WEB_PLAN_Y_ENDPOINTS.md`](GESTOR_WEB_PLAN_Y_ENDPOINTS.md). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

## Estado en una frase

El flujo gestor → canal público → visor funciona de punta a punta en `https://gn-admin.github.io/admin-dashboard/`, con SEO prerenderizado, canónica única, retiradas con 410 lógico (`gone`/lápida) y despliegue/prerender diario. **Track A cerrado salvo A4** (dominio propio aplazado; se usa `github.io`). Hay cambios de `.gs` en repo pendientes de redesplegar: **restaurar retirada (C1)** y **eliminar borrador de publicación web de animal** (solo `WebPublicaciones`). Suite: **495/495**.

## Entregado

### Visor público (`src/publico.html`, `src/js/publico.js`, `src/css/publico.css`)

- Tema portado de `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)`: hero a dos columnas, datos destacados con iconos, tarjetas de 24 px, Inter/Montserrat (CSP con Google Fonts). Verificado a 360/768/1280.
- Listado, ficha y estados vacío/error/retirada; composición de la ficha extraída a `Publico.htmlDetalle(p)` para reutilizarla desde Node.
- **Canónica única**: la ficha del SPA emite `canonical`, `og:url` y `mainEntityOfPage` hacia `publicaciones/<slug>.html`; el listado y las páginas de estado conservan su URL. SPA y estática ya no compiten.
- La pantalla de retirada muestra «Publicación retirada» con `noindex,nofollow`, sin JSON-LD.

### SEO y prerender (`scripts/prerender-publico.js`)

- Genera `src/publicaciones/<slug>.html` (title, description, robots, canonical absoluto, OG/Twitter, JSON-LD y HTML renderizado sin JS), `src/sitemap.xml` y `src/robots.txt`.
- **Guarda de despliegue**: bloquea con `exit 1` si no puede leer el canal, si falla una ficha o si sitemap/robots no son válidos; no borra la salida anterior. `--soft` solo avisa (uso manual).
- **Avisos en Actions** y guarda: falla el deploy si no puede leer `retiradas` (salvo `--soft`, A3) o si sitemap/robots no son válidos; no borra la salida anterior.
- **Fixtures versionadas** en `tests/fixtures/prerender/`: `ficha-normal.json`, `retirada.json`, `sin-portada.json`, `oculta.json`, `redirect-301.json`. Genera también páginas de **redirección 301** estáticas (noindex, canonical/refresh al destino, fuera de sitemap) y valida **JSON-LD/canonical únicos** (`validarFichaHtml`). C2 avanzado (`d4daabf`).
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
- **Eliminar borrador/configuración de publicación web de animal** (no publicada/no retirada): elimina solo la fila en `WebPublicaciones` y deja la ficha del animal intacta en BBDD. Implementado en repo (`9435a6d`, verificado con Playwright, `v230`), **pendiente de redesplegar `.gs`**.
- **Restaurar publicación retirada** (`evento|historia`, C1): vuelve a `borrador` manteniendo el slug, con auditoría `restaurar_publicacion`; botón en gestor. Implementado en repo (`39fb362`, `v231`), **pendiente de redesplegar `.gs`** y validar en vivo.

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
- `npm test`: **495/495**.

## Decisiones cerradas

- La ficha canónica es la página **estática**; el SPA apunta a ella.
- El 410 se modela como `status:'gone'` porque el canal (JSONP) no puede devolver códigos HTTP; la lápida conserva el slug.
- El prerender **bloquea** el deploy antes que publicar sin sitemap/robots.
- El port a `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` **no pertenece a este repositorio**: se entrega documentado (§7.2 y §7.4 del plan).
- No implementar la ficha configurable (§7.3) sin aprobación.

## Pendiente manual / verificación (fuera de git)

1. **Redesplegar `.gs` actuales** (`Code.gs`, `WebPublicaciones.gs`) y validar en producción: **restaurar retirada (C1)** y **eliminar borrador de publicación web de animal** (solo `WebPublicaciones`, ficha intacta). Tras restaurar, comprobar que desaparece de `retiradas/gone` y que la lápida se elimina en el siguiente prerender/deploy.
2. **Raíz de media**: configurada en `.env` y `Config.gs` local (ID en `.internal-docs`, no versionado). Confirmar que `Config.gs` desplegado en Apps Script incluye `DRIVE_WEB_FOLDER_ID`.
3. **A4 aplazado**: dominio propio y Search Console (sobre `github.io` es opcional enviar sitemap mientras tanto). Port del SEO al proyecto real (`C:\Users\JonEg\Documents\proyectos\main`).
4. Indexación real y auditoría formal: dependen del dominio y del proyecto web.

**A2/A2.2 verificado:** endpoints públicos y prerender/SEO correctos en `github.io`; caso retirada `prueba-retirada-playwright` comprobado (`retiradas`, `gone`, slug reservado) y lápida estática publicada fuera de sitemap tras deploy.

## Siguientes pasos propuestos

1. **Redesplegar `.gs` y validar C1 + borrado de borrador animal** en vivo (y efecto en retiradas/`gone`/lápida tras deploy).
2. **Track B**: port SEO/consumo al proyecto web real (`C:\Users\JonEg\Documents\proyectos\main`).
3. **Track D** (prioridad seguridad): D1 autorización por endpoint/perfil en GAS, D2–D7 (higiene Roles, auditoría, token, MFA, pruebas por rol, canal público). Se puede preparar en repo sin desplegar; validar requiere despliegue.
4. **Track E**: homogeneizar módulos, limpiar CSS/modularizar `dashboard.js`, a11y/responsive y QA por rol (en repo).
5. **A4 (aplazado)**: dominio propio + Search Console cuando aplique. C3 (ficha configurable) y C4 (forms) solo tras decisión.

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

## Historial de commits recientes (2026-11-14)

`714f053`…`06ce8fa` visor/SEO/prerender/retiradas/docs — `870735f` A3 (fallo retiradas bloquea deploy) — `7fbeca0` UI móvil publicaciones (`v229`) — `9435a6d` eliminar borrador publicación web de animal (solo `WebPublicaciones`, `v230`, pendiente `.gs`) — `d4daabf` C2 prerender (redirect 301/oculta/JSON-LD-canonical, 495 tests) — `39fb362` C1 restaurar retirada (evento/historia, `v231`, pendiente `.gs`).
