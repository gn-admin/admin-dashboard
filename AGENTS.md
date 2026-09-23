# GN-Encuestas / Admin Dashboard — Contexto del proyecto

> Lee también `PROGRESO.md` (estado actual y pendientes detallados) y `README.md` (puesta en marcha).

## Qué es
PWA admin de Grupo Nebak: encuestas de Google Forms (pre-adopción perros/gatos + solicitud de acogida), gestión de animales, familias acogedoras, adopciones, socios, lista negra y reportes. Backend en Google Apps Script (hojas de cálculo), auth con Firebase (email/contraseña).

## Comandos
- `npm run dev` — genera config (`.env` → `src/js/config.js` y `apps-script/Config.gs`) y sirve en `http://localhost:8080`.
- `npm run build` — regenera la config manualmente (`node scripts/gen-config.js`).
- `node scripts/gen-config.js` — script de generación: no editar `src/js/config.js` ni `apps-script/Config.gs` a mano, se regeneran.

## Reglas importantes
- **Nunca subir datos sensibles**: `.env` (valores reales), `src/js/config.js` y `apps-script/Config.gs` (generados) están en `.gitignore`. Para GitHub Pages, las variables se añaden como Repository secrets y el workflow `.github/workflows/deploy.yml` las inyecta (`secrets.X || vars.X`). **El repo es PÚBLICO**: usar siempre Secrets (encriptados), nunca Variables planas.
- **Estados y notas usan clave compuesta `survey_id::id`** (los ids `resp_N` colisionan entre encuestas). `handleSetEstado`/`handleSetNota` deben hacer match por `response_id` Y `survey_id`.
- **CORS POST**: Apps Script no responde preflights con `application/json`. Enviar siempre `Content-Type: text/plain;charset=utf-8` (véase `src/js/api.js`); el backend hace `JSON.parse(e.postData.contents)`.
- **Apps Script responde HTTP 200 con campo `error`**: api.js lanza por `data.error`, no por status.
- **Service worker**: al tocar `src/js/dashboard.js`, `api.js` u otros, subir `CACHE_NAME` en `src/sw.js`. Estado actual: `gn-encuestas-v20`.
- **Hub encuestas (móvil)**: bottom nav unificada en `Inicio | Encuestas | Animales | Más`. "Encuestas" abre un hub con 3 tarjetas (perros/gatos/acogida) que redirigen a sus listados; la sidebar de escritorio/tablet conserva los 3 enlaces directos.
- **Rutas relativas obligatorias** en el frontend: GitHub Pages sirve bajo `/admin-dashboard/` (rutas absolutas `/css/...` → 404).
- Feedback de estado en `Dashboard.setEstado`: muestra loader y revierte el estado si falla.

## Arquitectura
- Frontend: `src/index.html` + `src/js/*` (config, auth, api, dashboard, pdf-export, carnet-generator, icons) + `src/sw.js` + `src/css/styles.css`. Router por hash en `src/js/app.js`.
- Backend: `apps-script/Code.gs`, `Config.gs` (generado), `Auth.gs` (JWT Firebase), `DataFilter.gs`, `PdfService.gs` — **solo local, no versionado** (`.gitignore`); se usa para desplegar el backend.
- Despliegue: GitHub Pages (workflow `.github/workflows/deploy.yml`, `enablement: true`), rama `main`.

## Estado actual resumido
**Desplegado y funcionando** en `https://gn-admin.github.io/admin-dashboard/`. Frontend con rutas relativas; SW `v20`. Solo quedan pendientes de despliegue de backend (fix de aislamiento de estados/notas y `ALLOWED_ORIGINS` con `https://gn-admin.github.io`) y mejoras anotadas en `PROGRESO.md`. A partir de aquí se trabajan **mejoras de front y back**, sin tocar la lógica de negocio.