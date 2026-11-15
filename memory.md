# memory.md — Qué se ha hecho

> Registro de trabajo del gestor web y del visor público (`publico.html`, simulación de la web real de Grupo Nebak).
> Última actualización: 2026-11-15. Contratos y detalles: [`GESTOR_WEB_PLAN_Y_ENDPOINTS.md`](GESTOR_WEB_PLAN_Y_ENDPOINTS.md). Reglas de trabajo: [`AGENTS.md`](AGENTS.md).

## Estado en una frase

El flujo gestor -> canal público -> visor funciona de punta a punta en `https://gn-admin.github.io/admin-dashboard/`, con SEO prerenderizado, canónica única, retiradas con 410 lógico (`gone`/lápida) y despliegue/prerender cada 30 minutos. **Track A cerrado para este proyecto de gestión** (dominio/indexación del sitio publicado se gestiona en `main`; aquí se usa `github.io`). **`.gs` actualizados** (D1, C1, D3, D5 en repo). **Track E cerrado** (E1–E5). **C3 en curso**: contrato `ficha` aditivo implementado en backend, gestor (controles estructurados), visor y pruebas. Suite: **554/554**.

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
- Integrado en `.github/workflows/deploy.yml` después de `npm test`. **El deploy lo dispara el backend** al publicar, guardar o retirar (`webDispararDeploy` → `workflow_dispatch`, deduplicado 60 s), así que la estática está en 2–4 min. El cron `*/30 * * * *` queda solo como red de seguridad: no es puntual (ver «Despliegue»). Concurrencia en cola para no cancelar un deploy en curso.
- **Índice de estáticas** (`publicaciones/index.json`, `{generadoEn, publicados, retirados}`): el visor solo declara `canonical`/`og:url` hacia `publicaciones/<slug>.html` cuando el índice confirma que esa página ya existe; si aún no se ha generado, omite el canonical en vez de apuntar a un 404. Sin índice (fallo de red) mantiene la canónica estática. El SW sirve ese JSON con red primero.

### Retiradas y 410

- Estado `retirado` en el canal: la fila **no se borra** (lápida), `listed/indexable = false`, el slug queda reservado y no se reutiliza.
- Detalle del canal: `status: "gone"` + `code: "gone"` para el slug actual o histórico de una retirada. Se excluye de feed, sitemap y redirects.
- Nuevo endpoint público `?endpoint=retiradas` con los slugs retirados (y sus históricos) para que la web publique una página de retirada.
- Página estática de retirada: `noindex,nofollow`, sin canonical ni JSON-LD, **fuera del sitemap**. Si una ficha publicada recupera el slug, la ficha manda sobre la lápida.
- Gestor: botón «Retirar (410)» con confirmación; el resumen cuenta las retiradas aparte (tarjeta «Retiradas», fuera de borradores e incompletas) y el listado las muestra con badge, sin acciones de republicar ni volver a retirar.
- Plazo real desde 2026-11-15: **2–4 min** (el backend dispara el deploy al retirar). Si el disparo falla, el cron de 30 min es la red de seguridad y, en el peor caso, el siguiente push.

### Gestor de contenido (`src/js/web.js` + `apps-script/WebPublicaciones.gs`)

- Alta/edición de publicaciones de animales, eventos e historias; completitud, SEO, media, CTA, preview y slug check.
- Historial de slugs (`slug_historial`) con 301 desde `?endpoint=redirects`; un slug histórico no se reutiliza.
- Resumen con totales por tipo y por estado, diagnósticos de hoja y aviso de cabeceras.
- **Login sin reCAPTCHA (2026-11-15):** se quitó el gate `login-recaptcha` del formulario (script, aviso y llamada); Firebase Auth ya valida las credenciales y el chequeo previo bloqueaba accesos legítimos con score bajo. El endpoint sigue en el backend, sin uso desde el panel.
- **Móvil del gestor web (2026-11-15):** estadísticas compactas (sin subtítulo, icono 34 px), acciones en rejilla, fichas de publicación con título destacado y botones 2×2 sin scroll horizontal (el `min-width: 540px` de `.data-table` ya se anula en modo tarjetas), y selector de «Nueva publicación» en filas con botón «Crear».
- **Fix de delegación (2026-11-15):** `Dashboard` es `const` (no `window.Dashboard`), así que los módulos `dashboard-actividad|finanzas|blacklist|web` no se fusionaban en el navegador y sus acciones (`data-action`) no existían en producción; ahora resuelven el binding léxico. Verificado en producción (cargando el módulo nuevo con caché invalidada): la pestaña «Eventos e historias» cambia y lista el borrador. Con el service worker, `v259` propaga el arreglo.
- **Publicar solo fichas completas (2026-11-15):** el gestor bloquea «Publicar» si el backend marca campos pendientes y muestra la lista legible (Título, Portada, Descripción, Meta descripción…), abriendo el formulario; el backend ya rechazaba esas publicaciones, esto evita el error sin explicación. El aviso de publicación ya no habla de 30 min: con el deploy inmediato dice que la página SEO se regenera en 2–3 min.
- **Aviso del deploy en el gestor (2026-11-15):** `Web.avisoDeploy(res, base)` lee `data.deploy` de la respuesta y añade el estado real a todos los avisos (publicar, ocultar, retirar, restaurar, guardar). Si `ok:false`, el snack sale en `warning` con el motivo (p. ej. falta `GITHUB_DEPLOY_TOKEN`) y recuerda relanzarlo desde GitHub Actions; si `disparado:false` avisa de que ya hay uno en marcha.
- **Único punto de disparo (2026-11-15):** el deploy lo decide solo `_webAnotarDeploy` (`Code.gs`), que envuelve `web-animales`, `web-animales-estado`, `web-eventos` (guardar/archivar/restaurar) y `web-eventos-estado`. Decide con el `estado_publicacion` que devuelve la respuesta (el guardado), no con el del cliente; `forzar` cubre retirar y restaurar; si la respuesta ya trae `data.deploy` no repite. `WebPublicaciones.gs` no llama a GitHub: así no hay dos lógicas que puedan divergir.
- **Marcador de versión:** `WEB_DEPLOY_VERSION` (`2026-11-15.6`) viaja en `web-deploy-estado` y en `data.backend` de los estados. Es la forma de saber si la implementación viva del panel tiene el cuerpo actual: si `web-deploy-estado` da `version` pero un estado no trae `backend`, el cuerpo servido de esa función es antiguo (hipótesis abierta: definición duplicada en otro archivo del proyecto que gana por orden de carga).
- **Botón «Regenerar web» (2026-11-15):** en la barra del gestor, junto a «Actualizar». Dispara `web-deploy` con `API.dispararDeployWeb()`, cuenta el resultado (lanzado / ya en marcha / error con motivo) y debajo aparece un chip con `estadoDeployTexto()`: «Deploy automático activo · repo (main)» o «sin configurar: falta GITHUB_DEPLOY_TOKEN».
- **Eliminar borrador/configuración de publicación web de animal** (no publicada/no retirada): elimina solo la fila en `WebPublicaciones` y deja la ficha del animal intacta en BBDD. Implementado en repo (`9435a6d`, `v230`), verificado en producción (Playwright) y con auditoría `eliminar_publicacion` en el backend desplegado.
- **Restaurar publicación retirada** (`evento|historia`, C1): vuelve a `borrador` manteniendo el slug, con auditoría `restaurar_publicacion`; botón en gestor. Implementado en repo (`39fb362`, `v231`) y **verificado en vivo (2026-11-15):** restauración de `prueba-retirada-playwright` → `borrador`, slug conservado; tras deploy/prerender la lápida estática responde 404, no figura en sitemap ni en `retiradas`, y el front desplegado incluye la acción de restaurar (`API.restaurarWebEvento`). `retiradas` puede servir cache ~60 s sin `nocache=1`.

### Ficha configurable (C3)

- `ficha` es **aditivo**: `plantilla` (`ficha|historia`), `bloques` (datos, galeria, videos, fichaAnimal, etiquetas, cta), `mostrarLectura`, y opcionales `icons`/`gallery`/`videos`/`cta` (con `kind`).
- Backend: columna `ficha_json` (se añade sola al final si la hoja ya existía), `webNormalizarFicha` cierra valores, acota listas/longitudes y rechaza fichas que no son objeto; máximo 45.000 caracteres.
- Solo viaja en **detalle y preview**; los listados no la leen (regla de rendimiento). `cta.kind` (`adopcion|acogida|contacto|url`) se conserva en el payload.
- Gestor: sección «Presentación de la ficha» con plantilla (ficha/historia), toggles de bloques y tiempo de lectura; etiquetas (`tags`), salud curada con «heredar» y CTA con intención (`kind`). Sin tocar nada no se envía `ficha` (compatibilidad).
- Visor y prerender: misma composición (`htmlDetalle`) respeta plantilla, bloques y `mostrarLectura`; sin `ficha` el HTML no cambia.
- Pruebas: `tests/ficha-config.test.js` (helpers), `tests/web-backend.test.js` (guardado/normalización, detalle sí y listado no) y `tests/publico.test.js` (bloques/plantilla).

### Prueba E2E real (2026-11-15)

- **Animal (ciclo completo y limpio):** publicación `prueba-e2e-elizabeth` sobre el animal Elizabeth **sin tocar su ficha interna**: alta en `borrador`, portada PNG generada al vuelo y subida a Drive (`animales/prueba-e2e-elizabeth/`, `fileId 1ewh1Eh9Y3RL1B4IFl6Mvq4L_ITaN1JtP`), publicación, estática verificada (title, canonical, `og:image`, JSON-LD, en sitemap), visor con portada (1200 px reales) y texto, y `index.json` con el slug → el canonical del visor pasó de **omitido** (mientras no existía la estática) a la URL estática. Limpieza: `oculto` → eliminación de la fila; el siguiente prerender deja su página en **404** y el slug libre.
- **410 real:** evento de pruebas `prueba-retirada-playwright` con portada en `eventos/…` (`fileId 1EVI7TGKKHal3m5pQegEZkoisqzuW6mBW`), publicado y verificado, luego retirado → canal `status:"gone"`, lápida estática `noindex,nofollow` sin canonical, fuera de sitemap, presente en `?endpoint=retiradas` y visor «Publicación retirada». Queda **retirado** (los eventos no tienen borrado).
- **Diagnóstico del cron (2026-11-15):** solo hay **un** run `schedule` en todo el historial: llegó a las 10:59 UTC cuando el cron era `17 3 * * *` (≈7 h de retraso) y encima falló en `npm test`. En la ventana de prueba no hubo ninguno a las 16:00 ni a las 16:30: GitHub retrasa o descarta los programados bajo carga. Las estáticas de la prueba las generaron dos `workflow_dispatch` a mano (16:16 y 16:45). Conclusión: el cron **no es fiable** y no se usa como garantía.
- **Solución implantada:** `webDispararDeploy` en `WebPublicaciones.gs` lanza `workflow_dispatch` al publicar, guardar o retirar (ocultar, retirar, restaurar incluidos), con deduplicación de 60 s y sin romper la acción si GitHub falla. Token en la propiedad de script `GITHUB_DEPLOY_TOKEN`; endpoint admin `POST web-deploy` (forzado) para relanzarlo a mano y `web-deploy-estado` para ver si está configurado.

### Media por ficha (Drive)

- Una **carpeta por publicación** en Drive, separada por tipo: `animales/<slug>`, `eventos/<slug>`, `historias/<slug>` dentro de la raíz `DRIVE_WEB_FOLDER_ID`; se busca por nombre y se reutiliza.
- Endpoint `POST web-media-subir` con `publicacion_id`, `tipo` (`portada`, `galeria`, `video`, `documento`), `archivo_base64`, `nombre` y `mime_type`. Devuelve `fileId`, `carpeta`, `carpeta_url`, `url` (thumbnail para imágenes) y `download`.
- Límites: imágenes 5 MB, vídeo 15 MB, documentos 10 MB. Nombre de archivo ordenado: `<tipo>-<original>-<uuid>.<ext>`.
- Imágenes y vídeos se comparten (los consume la web); **los documentos quedan privados**. Ni la raíz ni la carpeta de la ficha se comparten.
- Formularios: animal (portada, galería, vídeo, documento) y evento/historia (portada, galería, documento). Los documentos se guardan en `media.documents` y no se publican.
- **Galería:** `url|alt|pie` por línea, retrocompatible (una URL sola sigue valiendo); el visor pinta `<figure>`/`<figcaption>`.
- **Enlaces de Drive normalizados al pegar:** fichero → `thumbnail?id=…&sz=w1200|w1600` (imagen) o `/file/d/…/view` (vídeo/documento); enlace de carpeta → rechazado con aviso al guardar.
- **Borrado (2026-11-15):** `POST web-media-eliminar` `{file_id, publicacion_id?}` manda el archivo a la papelera. Con `publicacion_id` exige que esté en la carpeta de esa ficha; sin él, dentro del árbol de `DRIVE_WEB_FOLDER_ID` (huérfanos de fichas ya borradas). En los formularios, cada archivo enlazado sale como chip con «×» que borra en Drive y limpia el campo.
- Requiere `APPS_SCRIPT_DRIVE_WEB_FOLDER_ID` en `.env` y regenerar `Config.gs`.

### Despliegue

- GitHub Pages sirve `publico.html`, `sitemap.xml` y `robots.txt` (200); con el canal actual (sin fichas publicadas) el prerender solo genera el listado. Service worker actual `v263` (visor público con skip link/navegación accesible; admin con título/foco en navegación, modales con restauración de foco, formularios con labels/ARIA, recuentos anunciados, estados vacío/error consistentes, iconos decorativos ocultos a AT, lazy/decoding en imágenes de detalle y modularización progresiva: `dashboard-actividad.js`, `dashboard-finanzas.js`, `dashboard-blacklist.js`, `dashboard-web.js`; C3: `ficha-config.js` y controles estructurados de presentación de la ficha en el gestor).
- `npm test`: **576/576** (incluye `tests/roles-d1.test.js`, `tests/roles-auth.test.js`, `tests/auditoria-d3.test.js`, `tests/ficha-config.test.js`; +15 de borrado de media y deploy automático).

## Decisiones cerradas

- La ficha canónica es la página **estática**; el SPA apunta a ella.
- El 410 se modela como `status:'gone'` porque el canal (JSONP) no puede devolver códigos HTTP; la lápida conserva el slug.
- El prerender **bloquea** el deploy antes que publicar sin sitemap/robots.
- El port a `proyecto web (`C:\Users\JonEg\Documents\proyectos\main`)` **no pertenece a este repositorio**: se entrega documentado (§7.2 y §7.4 del plan).
- No implementar la ficha configurable (§7.3) sin aprobación.

## Verificación y pendientes

**Hecho en vivo (2026-11-15, lote `.gs` desplegado):**
- A2/A2.2, A3, A5 y C1 verificados (endpoints públicos, `gone`/`retiradas`, prerender/lápidas/sitemap, restauración a borrador). Canal público sin token OK y allowlist interna protegida (endpoints privados exigen token).
- **D1/D2/D4/D6/D7 cerrados en lo verificable:** D1 (authz + `sin_acceso`, perfiles, matriz lecturas/escrituras, UI, tests Code/Auth/Roles), D2 (roles desplegados resuelven correctamente y seguros por defecto), D4 (token en `?token=` por diseño, sin eco de secretos/exposición detectada, procedimiento de rotación definido), D6 (automatizado 554 + verificación en vivo + procedimiento), D7 (canal allowlistado, solo GET, sin datos internos, verificado en producción). Detalle en [`PRUEBAS_POR_ROL_D6.md`](PRUEBAS_POR_ROL_D6.md).
- **D3 cerrado:** instrumentación en código/tests y flujos auditados operativos (restaurar/retirar/estado web y `web-media-subir` con permisos correctos, mejora desplegada).

**Pendiente operativo/manual (no cerrable desde este repo):**
1. **D5 (reCAPTCHA, operativo):** configurar dominios/hostname/umbral en consola reCAPTCHA v3 y realizar prueba e2e del login en entorno desplegado (código y `.gs` ya actualizados).
2. **D3 (opcional):** inspección visual en la hoja de auditoría/fases para confirmar filas escritas.
3. **D4 (acción periódica):** ejecutar rotación del token cuando proceda (Secrets + config GAS + redespliegue).
4. **Raíz de media:** confirmar `DRIVE_WEB_FOLDER_ID` en `Config.gs` desplegado si aplica.

**Mejoras futuras opcionales (no imprescindibles):** MFA para cuentas elevadas y App Check/endurecimiento adicional en Firebase.

**Nota de alcance:** el dominio propio/indexación del sitio publicado corresponde al proyecto `main` (ver `TRANSFERIR_A_MAIN.md`). Decisión vigente: el gestor se sirve en `https://gn-admin.github.io/admin-dashboard/`; el dominio propio queda fuera de este plan. Este repositorio es para gestión (aunque esté accesible públicamente).

## Pendiente de desarrollo (otros tracks)

- **Track B / formularios en `main`:** planificación trasladada a [`TRANSFERIR_A_MAIN.md`](TRANSFERIR_A_MAIN.md) (ejecución en el proyecto `main`, fuera de este repo).
- **Track E:** ✅ Completado (E1–E5: homogeneización UI/estados, mejoras de primitivas/CSS, modularización progresiva de `dashboard.js`, rendimiento percibido/SW y auditoría a11y en código; QA manual en dispositivos/orientaciones y por rol recomendada en entorno real).
- **Track C (pendiente, sujeto a aprobación/decisiones):** C1/C2 hechos. **C3 parcialmente implementado:** helpers (`ficha-config.js`), `ficha_json` en backend (detalle/preview, nunca listados) con normalización y límite, campo JSON avanzado en gestor, bloques/plantilla/lectura en visor y prerender, y pruebas de contrato. La UI ya es estructurada. Quedan las decisiones abiertas (vídeo embebido, saneado HTML, orden de bloques) y el port a `main`. **C3** plan refinado (objetivo de `ficha_json`, almacenamiento compacto/híbrido, regla de rendimiento: no leer ficha por ítem en listados de 20+ y cargarla solo en detalle/prerender, viabilidad GitHub Pages+GAS) y **C4** con nota de viabilidad/restricciones (CORS/preflight en POST, prototipo de transporte, cuotas/antiabuso). Requiere cerrar decisiones y aprobación antes de implementar.

## Mapa rápido

| Área | Archivos |
|---|---|
| Visor | `src/publico.html`, `src/js/publico.js`, `src/css/publico.css` |
| Prerender | `scripts/prerender-publico.js`, `tests/prerender.test.js`, `tests/fixtures/prerender/` |
| Gestor | `src/js/web.js`, `src/js/api.js` |
| Admin (modular) | `src/js/dashboard.js`, `src/js/dashboard-actividad.js`, `src/js/dashboard-finanzas.js`, `src/js/dashboard-blacklist.js`, `src/js/dashboard-web.js` |
| Media | `apps-script/WebPublicaciones.gs` (`webSubirMedia`), carpeta por ficha en Drive |
| Backend | `apps-script/WebPublicaciones.gs`, `apps-script/Code.gs` (endpoints públicos) |
| CI | `.github/workflows/deploy.yml` |
| Docs | `AGENTS.md`, `GESTOR_WEB_PLAN_Y_ENDPOINTS.md`, `PROGRESO.md`, `memory.md`, `PLAN_MASTER_EJECUCION.md` |

## Cómo reproducir en local

```bash
npm test                                   # 554 tests
npm run prerender -- --fixture tests/fixtures/prerender/retirada.json --out .tmp-prerender   # y borrar .tmp-prerender
npx --no-install serve src -l 8099 --no-clipboard
# http://localhost:8099/publico.html#/publicacion/laia
```

## Historial de commits recientes

- **2026-11-14:** `714f053`…`06ce8fa` visor/SEO/prerender/retiradas/docs — `870735f` A3 (fallo retiradas bloquea deploy) — `7fbeca0` UI móvil publicaciones (`v229`) — `9435a6d` eliminar borrador publicación web de animal (`v230`) — `d4daabf` C2 prerender (redirect 301/oculta/JSON-LD-canonical) — `39fb362` C1 restaurar retirada (`v231`).
- **2026-11-15 (Track E, `e86a662`…`8d93563`):** mejoras a11y/navegación y foco (`e86a662`, `df2e7c8`, `08a17f0`, `3d77fb2`, `f7d339e`, `0a9b748`, `f32308c`, `8d93563`), labels/formularios y estados (`c47e12d`, `09b0121`, `fd17604`, `ed1152a`, `e2fcac1`, `f7ac2f9`), rendimiento/lazy y SW (`dbe4537`, `v246`–`v252`), modularización E3 (`bd9cb8f` actividad, `4817c44` finanzas, `5ae8149` blacklist, `ecfc77d` delegados web) y sincronía documental (`2971d45`).
