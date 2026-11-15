# GN-Encuestas / Admin Dashboard — Contexto del proyecto

> Documento operativo para el equipo. Contiene reglas de trabajo y arquitectura de alto nivel. Los detalles de despliegue, IDs de hojas, claves y secretos viven en `.internal-docs/` (no versionado).

## Qué es

PWA admin de Grupo Nebak: encuestas de Google Forms (pre-adopción perros/gatos + solicitud de acogida), gestión de animales, familias acogedoras, adopciones, socios, lista negra y reportes. Backend en Google Apps Script (hojas de cálculo), auth con Firebase (email/contraseña). Incluye un **visor público** (`src/publico.html`, simulación de la web real) y un **gestor de contenido** (`src/js/web.js`) que publica en el canal público del backend.

## Comandos

- `npm run dev` — genera config (`.env` → `src/js/config.js`) y sirve en `http://localhost:8080`.
- `npm run build` — regenera la config manualmente (`node scripts/gen-config.js`).
- `npm test` (`node --test tests/*.test.js`) - unitarios de lógica pura del front, sin dependencias (554 tests, 16 ficheros). Incluye `tests/roles-d1.test.js`, `tests/roles-auth.test.js` y `tests/auditoria-d3.test.js`, que cargan/verifican los `.gs` reales para autorización, resolución de roles e instrumentación de auditoría. Se corren en CI y un test en rojo bloquea el despliegue. `tests/roles-auth.test.js` se omite si faltan `Roles.gs`/`Auth.gs` (no versionados): local 554, CI 544.
- `npm run prerender` — genera las páginas estáticas de `src/publicaciones/`, `sitemap.xml` y `robots.txt` desde el canal público. El deploy lo ejecuta tras los tests y **bloquea** si no puede generarlos (`--fixture`, `--dry`, `--soft` para uso manual). Fixtures versionadas en `tests/fixtures/prerender/` (ficha normal, retirada y sin portada) para validar el HTML sin canal real. Los avisos salen como anotaciones del run (`::warning::`/`::error::`).

## Reglas importantes

- **Nunca subir datos sensibles**: `.env`, `src/js/config.js` y `apps-script/Config.gs` están en `.gitignore`. Para GitHub Pages, las variables se inyectan como Repository secrets (encriptados), nunca Variables planas. El repo es PÚBLICO.
- **Token de API SOLO en query** (`?token=`), nunca en cabecera `Authorization`, mientras el backend no soporte preflight CORS.
- **Urgencias de animal**: campo booleano `urgente`. Se pinta y ordena con `_esPrioritario(a)` (urgente y estado `disponible`/`en_acogida`).
- **Selects sueltos** dentro de `.detail-field` usan la clase `.form-input`. `.form-control` no existe.
- **Contraste WCAG AA**: snackbar éxito/error y `.urgente-badge` respetan los tokens de diseño. Revisar `tests/diseno.test.js` si se cambian variables CSS.
- **Service worker**: al tocar `src/js/dashboard.js`, `app.js`, `api.js`, `auth.js`, `pwa.js`, `web.js`, `publico.js` u otros, subir `CACHE_NAME` en `src/sw.js`.
- **Rutas relativas obligatorias** en el frontend: GitHub Pages sirve bajo `/admin-dashboard/`.
- **Contenido público**: la canónica de una ficha es su página estática `publicaciones/<slug>.html`, no la URL del SPA. Los estados `borrador` y `oculto` no salen del canal; `retirado` responde `gone` (410 lógico) y deja una lápida que conserva el slug.
- **Prerender**: `npm run prerender` genera fichas, `sitemap.xml` y `robots.txt`; el deploy lo ejecuta tras los tests y bloquea si falla. Sus avisos salen como anotaciones (`::warning::`/`::error::`) en el run.
- **Ficha configurable (C3)**: el bloque `ficha` es aditivo; el backend lo valida y normaliza (`webNormalizarFicha`, límite 45.000 caracteres) y solo viaja en detalle/preview, nunca en listados. Sin `ficha` el payload no cambia.
- **Media del gestor**: una carpeta de Drive por ficha dentro de `DRIVE_WEB_FOLDER_ID` → `animales|eventos|historias/<slug>`; se sube con `web-media-subir`. Los enlaces de carpeta se rechazan y los de fichero de Drive se normalizan a thumbnail/vista. Imágenes y vídeos se comparten para la web, los documentos quedan privados. Los enlaces de carpeta no se publican.
- **No tocar el proyecto web externo (`C:\Users\JonEg\Documents\proyectos\main`) desde este repositorio**: el port del SEO se documenta como entrega externa (§7.2 y §7.4 del plan).
- **Sin secretos**: nada de tokens, IDs de hojas ni claves en el código, fixtures o documentación versionada (el repo es público).

## Arquitectura

- Frontend: `src/index.html` + `src/js/*` + `src/sw.js` + `manifest.webmanifest`. Router por hash en `src/js/app.js`.
- Visor público: `src/publico.html` + `src/js/publico.js` + `src/css/publico.css`; las páginas estáticas van a `src/publicaciones/` (generadas, ignoradas por git).
- Prerender y fixtures: `scripts/prerender-publico.js`, `tests/fixtures/prerender/`.
- Media: una carpeta de Drive por publicación (`apps-script/WebPublicaciones.gs` · `webSubirMedia`), con `APPS_SCRIPT_DRIVE_WEB_FOLDER_ID` en `.env`.
- Backend: Google Apps Script (desplegado por separado). El canal web y el gestor viven en `apps-script/WebPublicaciones.gs` y los endpoints públicos en `Code.gs`.
- Despliegue: GitHub Pages (workflow `.github/workflows/deploy.yml`), rama `main`. Publicar, guardar o retirar en el gestor dispara el deploy vía `workflow_dispatch` desde Apps Script (`webDispararDeploy`, token en `GITHUB_DEPLOY_TOKEN` de las propiedades del script); el cron de 30 min es solo red de seguridad y no es puntual.

## Documentación interna

La documentación operativa detallada (`AGENTS.md` completo, `PROGRESO.md`, `PLANNING.md`, `docs/`, `apps-script/README.md`) se ha movido a `.internal-docs/` y **no se sube a git**. Allí están los IDs de hojas, formularios, detalles de endpoints, reglas de seguridad interna y estado de pendientes.

En el repo, [`memory.md`](memory.md) resume qué se ha hecho (entregado, decisiones, pendientes manuales y verificación) y [`GESTOR_WEB_PLAN_Y_ENDPOINTS.md`](GESTOR_WEB_PLAN_Y_ENDPOINTS.md) contiene contratos, estados y plan por fases.
