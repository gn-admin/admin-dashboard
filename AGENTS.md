# GN-Encuestas / Admin Dashboard — Contexto del proyecto

> Documento operativo para el equipo. Contiene reglas de trabajo y arquitectura de alto nivel. Los detalles de despliegue, IDs de hojas, claves y secretos viven en `.internal-docs/` (no versionado).

## Qué es

PWA admin de Grupo Nebak: encuestas de Google Forms (pre-adopción perros/gatos + solicitud de acogida), gestión de animales, familias acogedoras, adopciones, socios, lista negra y reportes. Backend en Google Apps Script (hojas de cálculo), auth con Firebase (email/contraseña).

## Comandos

- `npm run dev` — genera config (`.env` → `src/js/config.js`) y sirve en `http://localhost:8080`.
- `npm run build` — regenera la config manualmente (`node scripts/gen-config.js`).
- `npm test` (`node --test tests/*.test.js`) — unitarios de lógica pura del front, sin dependencias (357 tests). Se corren en CI y un test en rojo bloquea el despliegue.

## Reglas importantes

- **Nunca subir datos sensibles**: `.env`, `src/js/config.js` y `apps-script/Config.gs` están en `.gitignore`. Para GitHub Pages, las variables se inyectan como Repository secrets (encriptados), nunca Variables planas. El repo es PÚBLICO.
- **Token de API SOLO en query** (`?token=`), nunca en cabecera `Authorization`, mientras el backend no soporte preflight CORS.
- **Urgencias de animal**: campo booleano `urgente`. Se pinta y ordena con `_esPrioritario(a)` (urgente y estado `disponible`/`en_acogida`).
- **Selects sueltos** dentro de `.detail-field` usan la clase `.form-input`. `.form-control` no existe.
- **Contraste WCAG AA**: snackbar éxito/error y `.urgente-badge` respetan los tokens de diseño. Revisar `tests/diseno.test.js` si se cambian variables CSS.
- **Service worker**: al tocar `src/js/dashboard.js`, `app.js`, `api.js`, `auth.js`, `pwa.js` u otros, subir `CACHE_NAME` en `src/sw.js`.
- **Rutas relativas obligatorias** en el frontend: GitHub Pages sirve bajo `/admin-dashboard/`.

## Arquitectura

- Frontend: `src/index.html` + `src/js/*` + `src/sw.js` + `manifest.webmanifest`. Router por hash en `src/js/app.js`.
- Backend: Google Apps Script (desplegado por separado, no versionado aquí).
- Despliegue: GitHub Pages (workflow `.github/workflows/deploy.yml`), rama `main`.

## Documentación interna

La documentación operativa detallada (`AGENTS.md` completo, `PROGRESO.md`, `PLANNING.md`, `docs/`, `apps-script/README.md`) se ha movido a `.internal-docs/` y **no se sube a git**. Allí están los IDs de hojas, formularios, detalles de endpoints, reglas de seguridad interna y estado de pendientes.
