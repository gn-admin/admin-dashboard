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
- Todas las solicitudes de **2025 van descartadas** (no cuentan en dashboard/reportes). Hay botón en **Reportes → Mantenimiento** que descarta las 2025 restantes (`Dashboard.descartar2025`, con confirmación y cuenta previa).

## Modelo de estados / notas
- Clave compuesta `survey_id::id` en backend GET (`handleGetEstados`/`handleGetNotas`) y en frontend (`getEstado(id, surveyId)`, `states[surveyId::id]`).
- Hojas: `Estados` (response_id|survey_id|estado|fecha) y `Notas` (response_id|survey_id|nota|fecha) — IDs en `.env`.

## Pendientes (lado humano, fuera de git)
1. **Redeplegar backend Apps Script** (misma implementación `AKfycbw4…` → *Nueva versión*; la URL no cambia). Pegar `Code.gs` + `Config.gs` (+ `Auth.gs`/`DataFilter.gs` si no están al día) y **mantener `PdfService.gs` y `DataFilter.gs`** en el editor. El código local incluye: `handleSetEstado`/`handleSetNota` por clave compuesta, CRUD candidaturas/acogidas/contratos, `appendToSheet`/`updateSheetRow` con columnas nuevas + **upsert por id** (no duplica en reintentos), `appendToSheet` que **persiste el id** (no más filas fantasma), comparaciones de id como texto, **POST `actividad`**, blacklist con id estable, `deleteAdopcionCascade` (rollback), **`ALLOW_ORIGIN_EMPTY:true`** (Apps Script no ve cabeceras Origin; el control real es el token Firebase), **`REQUIRE_EMAIL_VERIFIED:false`**, `RATE_LIMIT:100` aplicado (fail-open).
2. **Secret `API_URL` en GitHub** (Settings → Secrets and variables → Actions) con la URL del exec vigente + re-ejecutar el workflow `deploy.yml` (el front de Pages se genera desde los secrets, no del `.env` local).
3. **Reparar filas fantasma**: filas de hoja con celda `id` vacía (creadas antes del fix) → rellenar `id` único o borrar la fila. Sin esto no se editan ni borran desde la app.
4. **Hojas nuevas**: dar permisos a la API sobre `Candidaturas`, `Acogidas`, `Contratos`, `Estados`, `Notas`, `Actividad` (y opcional cabeceras `foto`, `foto_url`, `foto_drive_id` en Animales).
5. **Resp_9 (perros 2025):** quedó `en_proceso` tras pruebas; decidir si vuelve a `descartada`.

## Hojas persistentes (candidaturas/acogidas/contratos)
- Columnas `Candidaturas`: `id, solicitud_id, survey_id, response_id, tipo, nombre, email, animal_id, familia_id, estado, fecha`.
- Columnas `Acogidas`: `id, animal_id, familia_id, animal, familia, fase, estado, inicio, solicitud_id, notas`.
- Columnas `Contratos`: `id, adopcion_id, animal, animal_id, fecha, ciudad, estado, creado, especie, raza, edad, f1_nombre, f1_dni, f1_email, f1_telefono, f1_rol, f1_firma, f2_nombre, f2_dni, f2_email, f2_telefono, f2_rol, f2_firma`.

## CORS / POST
- Apps Script responde siempre HTTP 200 con `error`; `api.js` lanza por `data.error`.
- CORS: `isOriginAllowed` hace **coincidencia exacta** contra `CONFIG.ALLOWED_ORIGINS` (ya no por substring). Orígenes vacíos/`null` se rechazan salvo `ALLOW_ORIGIN_EMPTY:true`. `http(s)://localhost:*` y `http(s)://127.0.0.1:*` se permiten para desarrollo.
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
- Estado actual: **`gn-encuestas-v45`** (subir `CACHE_NAME` al tocar `dashboard.js`/`api.js`/`auth.js`/`index.html`/CSS; regla en `AGENTS.md`).
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

## Estado final (cierre): qué se ha hecho
- Front completo y pusheado (SW v70, 56 tests en verde): encuestas, animales (foto Drive + thumbnails), familias, acogidas con rollback, adopciones (fases +/-, contrato con firma obligatoria, rollback en cascada, cuestionario linkado, manual vinculado), apadrinamientos (varios, socio/externo, conversión, totales), socios (3 perfiles, cuota, carnets por perfil), blacklist, donaciones, gastos, recordatorios con widget, seguimiento post-adopción, reportes (+descartar 2025), dashboard (KPIs, atención, vencimientos), guía por botones (7 pestañas), auth sin flash de login, sync offline con cola, semáforo verde/naranja/rojo + glyphs, anti-doble-clic en forms, PWA instalable.
- Backend local listo (cascadas, upsert, ids persistentes, rate-limit, keepWarm, 20 endpoints nuevos): **pendiente pegar `Code.gs`+`Config.gs` y Nueva versión**.
- Decisiones: sin roles (todos admin), sin reset de contraseña, `horas_mes` sin uso, documentos y redes en dummy local.

## Futuro desarrollo (no empezado)
1. **Redes real (Meta)**: cuenta Empresa/Creador + App + cablear `_pushPublicacion` (marcado `TODO Meta`) + hoja `Publicaciones`.
2. **Documentos real**: subida a Drive + visor (hoy referencias locales).
3. **WhatsApp**: enlaces `wa.me` precargados en solicitud/familia/adopción.
4. **Anti-doble-tap en botones** de fase/asignar/aprobar (los forms ya lo tienen).
5. **Endpoint agregado** `dashboard` (1 ejecución en vez de 6; requiere deploy).
6. **Push notifications**, fusión de duplicados, auditoría lector de pantalla, logo en alta para splash 512.