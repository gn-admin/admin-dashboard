# GN-Encuestas / Admin Dashboard — Contexto del proyecto

> Lee también `PROGRESO.md` (estado actual y pendientes detallados) y `README.md` (puesta en marcha).

## Qué es
PWA admin de Grupo Nebak: encuestas de Google Forms (pre-adopción perros/gatos + solicitud de acogida), gestión de animales, familias acogedoras, adopciones, socios, lista negra y reportes. Backend en Google Apps Script (hojas de cálculo), auth con Firebase (email/contraseña).

## Comandos
- `npm run dev` — genera config (`.env` → `src/js/config.js` y `apps-script/Config.gs`) y sirve en `http://localhost:8080`.
- `npm run build` — regenera la config manualmente (`node scripts/gen-config.js`).
- `node scripts/gen-config.js` — script de generación: no editar `src/js/config.js` ni `apps-script/Config.gs` a mano, se regeneran.

## Reglas importantes
- **Nunca subir datos sensibles**: `.env` (valores reales), `src/js/config.js` y `apps-script/Config.gs` (generados) están en `.gitignore`. Para GitHub Pages, las variables se añaden como Repository secrets/variables y el workflow `.github/workflows/deploy.yml` las inyecta.
- **Estados y notas usan clave compuesta `survey_id::id`** (los ids `resp_N` colisionan entre encuestas). `handleSetEstado`/`handleSetNota` deben hacer match por `response_id` Y `survey_id`.
- **CORS POST**: Apps Script no responde preflights con `application/json`. Enviar siempre `Content-Type: text/plain;charset=utf-8` (véase `src/js/api.js`); el backend hace `JSON.parse(e.postData.contents)`.
- **Apps Script responde HTTP 200 con campo `error`**: api.js lanza por `data.error`, no por status.
- **Service worker**: al tocar `src/js/dashboard.js`, `api.js` u otros, subir `CACHE_NAME` en `src/sw.js`. Estado actual: `gn-encuestas-v17`.
- Feedback de estado en `Dashboard.setEstado`: muestra loader y revierte el estado si falla.

## Arquitectura
- Frontend: `src/index.html` + `src/js/*` (config, auth, api, dashboard, pdf-export, carnet-generator, icons) + `src/sw.js` + `src/css/styles.css`. Router por hash en `src/js/app.js`.
- Backend: `apps-script/Code.gs`, `Config.gs` (generado), `Auth.gs` (JWT Firebase), `DataFilter.gs`, `PdfService.gs`.
- Despliegue: GitHub Pages (workflow), rama `main`.

## Estado actual resumido
Backend funcional; frontend terminado salvo pendientes anotados en `PROGRESO.md` (redespliegue del fix de aislamiento en Apps Script, SW v17, `resp_9`, `ALLOWED_ORIGINS` con la URL real de Pages).