# GN-Encuestas — Progreso y estado actual

> Documento vivo para saber en qué punto estamos en cada sesión. Sin datos sensibles.

## Objetivo
PWA admin de Grupo Nebak (Apps Script + Sheets + Firebase Auth) desplegada y **funcionando en GitHub Pages**. El frontend usa **rutas relativas** (project site bajo `/admin-dashboard/`). A partir de aquí solo se esperan **mejoras de front y back**; la lógica de negocio no debe cambiar.

## Estado: DESPLEGADO ✅
- Producción: `https://gn-admin.github.io/admin-dashboard/` (GitHub Pages, Source: **GitHub Actions**).
- Workflow `.github/workflows/deploy.yml` inyecta los valores reales desde **Repository secrets** (usa `secrets.X || vars.X`).
- En GitHub ya están activadas Pages y **las 7 variables/secrets frontend**:
  `API_URL`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`.
- IMPORTANTE: el repositorio es **público** → usar siempre **Secrets** (encriptados), nunca Variables planas. No subir nunca IDs de hojas/formularios, tokens ni Firebase service account.

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

## Pendientes
1. **Backend aislamiento (Code.gs):** fix de `handleSetEstado`/`handleSetNota` (match por `response_id` + `survey_id`) aplicado en local pero **hay que redeplegarlo en Apps Script** (Implementar → Gestión de implementaciones → Nueva versión → Implementar → la URL no cambia). Hasta entonces, cambiar estado en ids compartidos no persiste bien.
2. **ALLOWED_ORIGINS** del backend: usar la URL real de Pages `https://gn-admin.github.io` en `.env` (`APPS_SCRIPT_ALLOWED_ORIGINS`) y re-desplegar backend (o bastaría `"*"` — el backend responde 200 a cualquier origen, ver CORS abajo).
3. **Resp_9 (perros 2025):** quedó `en_proceso` tras pruebas manuales en la app; decidir si se restaura a `descartada`.
4. **Iconos PWA:** el manifest apunta al logo (`assets/icons/logo-nebak.jpg`); falta generar/referenciar `icon-*.png` (72–512) de verdad si se quiere instalabilidad PWA completa.

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
- **Rutas relativas** en `index.html`, `sw.js`, `manifest.webmanifest` y registro de SW — necesario porque GitHub Pages sirve bajo `/admin-dashboard/`.

## Service worker
- Estado actual: **`gn-encuestas-v19`** (rutas relativas, mejoras responsive).
- Regla: al tocar `src/js/dashboard.js`, `api.js` u otros assets, **subir CACHE_NAME** en `src/sw.js`.

## Configuración / despliegue
- `.env.example` documenta variables; `.env` (ignorado) con valores reales.
- `scripts/gen-config.js` genera `src/js/config.js` y `apps-script/Config.gs` desde `.env` / variables de CI. Ejecutar con `npm run dev` o `npm run build`.
- **`apps-script/` NO se versiona** (solo local para desplegar el backend). Añadido a `.gitignore`. Los `.gs` no están en git.
- En GitHub: **Pages → Source: GitHub Actions** (además el workflow tiene `enablement: true` para auto-habilitarla).
- Las 7 variables *Frontend* van en Settings → Secrets and variables → Actions (API_URL, FIREBASE_*). Las de backend (IDs de hojas/formularios, orígenes) solo en `.env` local.

## Referencias útiles
- Backend: `apps-script/Code.gs`, `apps-script/Auth.gs` (local, no en git).
- Front: `src/js/dashboard.js`, `src/js/api.js`, `src/js/auth.js`, `src/sw.js`.
- Docs: `README.md`, `docs/GUIA-DESPLIEGUE.md`.