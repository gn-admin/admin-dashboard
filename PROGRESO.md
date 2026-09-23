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
1. **Redeplegar backend Apps Script** (Implementar → Gestión de implementaciones → Nueva versión → Implementar; la URL no cambia). El código local ya incluye el fix de `handleSetEstado`/`handleSetNota`, los CRUD de `candidaturas`/`acogidas`/`contratos` y `appendToSheet` alineado por cabecera. `Config.gs` regenerado con `SHEET_NOTAS_ID` corregido (44 chars; antes llegaba pegado a `SHEET_CANDITURAS_ID=...` y rompía `notas`) y `APPS_SCRIPT_ALLOWED_ORIGINS` ya apunta a `https://gn-admin.github.io`.
2. **Desplegar el front** (push a `main`): la sección "Procesos" ya no existe — la asignación de animal/familia se hace en la ficha de la solicitud aprobada; se añadió el modal "Guía de procesos" (botón `?` en topbar tablet/desktop, y accesible desde el perfil móvil y Acogidas activas), el botón de perfil en el topbar móvil (oculta título y email), y estados vacíos en listados (animales/familias/adopciones/socios/encuestas). SW `v23`.
3. **Dar permisos a la API** sobre las 3 spreadsheets (`Candidaturas`, `Acogidas`, `Contratos`) y (opcional) crear cabeceras manuales (columnas listadas abajo) para legibilidad.
4. **Resp_9 (perros 2025):** quedó `en_proceso` tras pruebas manuales en la app; decidir si se restaura a `descartada`.
5. **Iconos PWA:** el manifest apunta al logo (`assets/icons/logo-nebak.jpg`); falta generar/referenciar `icon-*.png` (72–512) de verdad si se quiere instalabilidad PWA completa.

## Hojas persistentes (candidaturas/acogidas/contratos)
- Columnas `Candidaturas`: `id, solicitud_id, survey_id, response_id, tipo, nombre, email, animal_id, familia_id, estado, fecha`.
- Columnas `Acogidas`: `id, animal_id, familia_id, animal, familia, fase, estado, inicio, solicitud_id, notas`.
- Columnas `Contratos`: `id, adopcion_id, animal, animal_id, fecha, ciudad, estado, creado, especie, raza, edad, f1_nombre, f1_dni, f1_email, f1_telefono, f1_rol, f1_firma, f2_nombre, f2_dni, f2_email, f2_telefono, f2_rol, f2_firma`.
4. **Resp_9 (perros 2025):** quedó `en_proceso` tras pruebas manuales en la app; decidir si se restaura a `descartada`.
5. **Iconos PWA:** el manifest apunta al logo (`assets/icons/logo-nebak.jpg`); falta generar/referenciar `icon-*.png` (72–512) de verdad si se quiere instalabilidad PWA completa.
6. **Verificación en localhost** del bloque actual antes de desplegar front (navegación, modal procesos, firma de contrato, alta de camada).

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
- **Estados `aprobada`/`finalizada`:** Aprobar una encuesta crea una candidatura (`en_lista`) y autoregistra la familia de acogida (pre-acogida); los listados filtran por estos estados.
- **Modal Procesos:** candidaturas en lista → asignación de animal disponible (+ familia libre en acogidas) → crea caso de acogida (`entrega → en_casa → finalizada`) o adopción (fase `Revision`).
- **Acogidas activas:** nueva página con pipeline de casos; al finalizar devuelve el animal a `disponible` y la familia a `Libre`.
- **Ficha animal:** especie extensible, campos `grupo_id`/`grupo`/`grupo_obligatorio`, badge de grupo en tarjetas, filtro por especie y **alta de camada** (bulk con API o fallback local).
- **Contratos de adopción:** en la fase `Contrato` se firma en canvas con **dos firmantes** (f1 titular con rol `El adoptante`/Titular/Tutor/Representante; f2 opcional: mayor de edad, tutor del menor, contacto responsable, persona de avanzada edad), ciudad + fecha, y se exporta PDF formal (`PdfExport.exportContracto`). Columnas de hoja `Contratos`: `id, adopcion_id, animal, fecha, ciudad, estado, creado, f1_nombre, f1_dni, f1_email, f1_telefono, f1_rol, f1_firma, f2_nombre, f2_dni, f2_email, f2_telefono, f2_rol, f2_firma`.
- Datos locales de respaldo (`gn_candidaturas`, `gn_contratos`, `gn_acogidas`) hasta que el backend tenga hojas/endpoints.

## Service worker
- Estado actual: **`gn-encuestas-v21`** (procesos, acogidas activas, camadas/especie, contratos con firma).
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