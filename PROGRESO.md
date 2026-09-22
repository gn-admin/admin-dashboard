# GN-Encuestas — Progreso y estado actual

> Documento vivo para saber en qué punto estamos en cada sesión. Sin datos sensibles.

## Objetivo
PWA admin de Grupo Nebak (Apps Script + Sheets + Firebase Auth) desplegada en GitHub Pages. Frontend terminado salvo pendientes anotados abajo; backend de Apps Script **funcionando** salvo una mejora de aislamiento pendiente de publicar.

## Pila / URLs
- Backend (Apps Script web app) — URL única en `src/js/config.js` (generada desde `.env` vía `scripts/gen-config.js`).
- Firebase proyecto `grupo-nebak` (apiKey/IDs en `.env`, ocultos de git).
- Front → GitHub Pages (workflow `.github/workflows/deploy.yml`, rama `main`).
- Encuestas: `pre-adopcion-perros` (80), `pre-adopcion-gatos` (8, todas 2026), `pre-acogida` (4).

## Estado de datos (hoja "Estados")
- 43 solicitudes de 2025 de perros marcadas `descartada` (resp_2..resp_44) + acogida `resp_2` (2025).
- Cuenta 92 total → 48 activas (37 perros + 8 gatos + 3 acogida) en dashboard; "Total Encuestas" y "Tasa de Conversión" excluyen descartadas.

## Modelo de estados / notas
- Clave compuesta `survey_id::id` en backend GET (`handleGetEstados`/`handleGetNotas`) y en frontend (`getEstado(id, surveyId)`, `states[surveyId::id]`).
- Hojas: `Estados` (response_id|survey_id|estado|fecha) y `Notas` (response_id|survey_id|nota|fecha) — IDs en `.env`.

## Pendientes (importante)
1. **Backend aislamiento (Code.gs):** fix de `handleSetEstado`/`handleSetNota` (match por `response_id` + `survey_id`) aplicado en local pero **hay que redeplegarlo en Apps Script** (Implementar → Gestión de implementaciones → Nueva versión → Implementar -> la URL no cambia). Hasta entonces, cambiar estado en ids compartidos no persiste bien.
2. **Frontend caching:** `sw.js` debe quedar en **v17**; service worker viejo se elimina con Unregister + Ctrl+F5 (x2) en DevTools → Application → Service Workers.
3. **Resp_9 (perros 2025):** quedó `en_proceso` tras pruebas manuales en la app; decidir si se restaura a `descartada`.
4. **ALLOWED_ORIGINS** del backend: al publicar en GitHub Pages, poner la URL real `https://<usuario>.github.io` en `.env` (`APPS_SCRIPT_ALLOWED_ORIGINS`) y re-desplegar backend.

## CORS / POST
- Apps Script responde siempre HTTP 200 con `error`; `api.js` lanza por `data.error`.
- CORS descartado: todos los orígenes devuelven 200 con `Access-Control-Allow-Origin: *`; `isOriginAllowed` admite `''`/`null`.
- POST desde navegador: preflight con `application/json` NO funciona en Apps Script → `api.js` envía `Content-Type: text/plain;charset=utf-8` (petición simple, sin preflight). El backend hace `JSON.parse(e.postData.contents)`.
- `api.js` incluye un reintento (800 ms) ante fallos de red.
- SW: branch API con network-first y fallback a caché / `Response.error()` si no hay.

## Funcionalidad frontend reciente
- Vista detalle de solicitud rediseñada (tarjetas pregunta/respuesta, panel de notas).
- Responsive: listado 2 columnas en tablet (768-1023), cards compactas en móvil.
- Dashboard: stats principales excluyen descartadas.
- Estado de una solicitud: **loader** durante el POST y **revert del estado** si hay error (con snackbar); la tarjeta del listado se actualiza al instante (`_syncCard` + `data-card`).

## Configuración / despliegue (nuevo)
- `.env.example` documenta variables; `.env` (ignorado) con valores reales.
- `scripts/gen-config.js` genera `src/js/config.js` y `apps-script/Config.gs` desde `.env` / variables de CI.
- GitHub Pages: workflow en `.github/workflows/deploy.yml`; añadir las 7 variables *Frontend* en Settings → Secrets and variables → Actions (API_URL, FIREBASE_*).
- En GitHub debe activarse **Pages → Source: GitHub Actions**.

## Referencias útiles
- Backend: `apps-script/Code.gs`, `apps-script/Auth.gs`.
- Front: `src/js/dashboard.js`, `src/js/api.js`, `src/js/auth.js`, `src/sw.js`.
- Docs: `README.md`, `docs/GUIA-DESPLIEGUE.md`.