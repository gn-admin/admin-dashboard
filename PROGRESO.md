# GN-Encuestas / Admin Dashboard — Contexto completo (2026-09-27)

> Documento vivo de estado. Sin datos sensibles (sin URLs de exec, claves, IDs ni tokens).
> Reglas de trabajo en `AGENTS.md`. Puesta en marcha en `README.md`.

## Qué es y dónde vive
PWA de administración para protectora (Grupo Nebak, Irun): encuestas de Google Forms
(pre-adopción perros/gatos + solicitud de acogida), animales, familias acogedoras,
adopciones con contrato, apadrinamientos, socios/voluntarios, lista negra, donaciones,
gastos, recordatorios, seguimiento post-adopción, redes (simulado) y reportes.
- Front: GitHub Pages desde `main` vía Actions (`deploy.yml`), repo **público**.
- Back: Google Apps Script (un proyecto, una implementación `/exec`), Sheets como BBDD.
- Auth: Firebase email/contraseña. Sin roles (todos admin, por decisión).
- Secrets reales solo en: `.env` local (gitignored), Secrets de GitHub (build Pages)
  y editor de Apps Script (`Config.gs` generado + `ScriptProperties` si hiciera falta).

## Comandos
- `npm run dev` — genera config y sirve en `http://localhost:8080`.
- `npm run build` — regenera config (`node scripts/gen-config.js`).
- `npm test` — `node --test tests/*.test.js` (66 tests en verde, lógica pura sin DOM).
- No editar a mano `src/js/config.js` ni `apps-script/Config.gs` (generados, ignorados).

## Arquitectura
- `src/`: `index.html` + `js/` (config, icons, auth, api, dashboard ~3600 líneas,
  carnet-generator, pdf-export, app) + `css/styles.css` + `sw.js` + `manifest` + assets.
- Router por hash (`app.js`). Sin framework ni build de JS.
- `apps-script/` (gitignored, solo local para desplegar): `Code.gs`, `Config.gs`
  (generado), `Auth.gs` (JWT Firebase vía `accounts:lookup`), `DataFilter.gs`
  (reservado, sin uso), `PdfService.gs` (reservado, sin uso; el front exporta en cliente).
- `tests/` (node:test, sin dependencias). SW actual: `gn-encuestas-v95`.

## Mapa funcional final
- **Encuestas** (3): listados con filtros/buscador, ficha con estados (`pendiente`,
  `en_proceso`, `aprobada`, `descartada`, clave `survey_id::id`), notas, aprobar→
  candidatura (+auto-familia en acogida), asignar animal/familia, PDF individual y
  completo (portada + KPIs + fichas), chequeo de blacklist, mantenimiento Descartar-2025.
- **Animales**: CRUD en modal, alta de camada bulk, foto principal (Drive + thumbnail),
  especie extensible, grupos, estados (`disponible`, `en_acogida`, `en_adopcion`,
  `adoptado`, `fallecido`), ficha con héroe + secciones plegables (info, publicaciones,
  apadrinamientos, gastos, documentos-dummy, grupo, familia, historial médico).
  **Urgencias (v93)**: checkbox *Necesita acogida/adopción urgente* en el formulario
  (campo `urgente`; la columna la auto-añaden `appendToSheet`/`updateSheetRow`),
  insignia roja **Urgente** en tarjeta y ficha (+ campo *Prioridad*) y **orden
  urgente-primero** en el selector de asignación y en *Vincular animal*
  (`_esUrgente`/`_ordenaUrgentes`, sin mutar el original).
  **Selector de grupo (v94)**: el campo *Grupo / Camada* es ahora un `<select>`
  (`_listaGrupos` = entidad `grupos` ∪ nombres de animales, unidos por `_normGrupo`,
  con número de miembros) + *Crear grupo nuevo…*, que despliega el input. Sustituye
  al `<datalist>`, poco fiable en móvil. Si el nombre tecleado ya existía,
  `_onChangeGrupoNuevo` selecciona esa opción en lugar de partir el grupo.
  **Grupos unidos por nombre** (opción A): `_normGrupo` normaliza mayúsculas/acentos/
  espacios y `_resolveGrupoId` reutiliza el `grupo_id` existente → alta, edición y
  camada convergen en un mismo grupo; cambiar de nombre saca del grupo anterior.
  `_repairGrupos` (una vez por sesión, al abrir Animales) fusiona por nombre los
  grupos ya partidos y lo persiste con `updateAnimal`. **Export CSV** (`;` + BOM UTF-8)
  de todo el inventario con las columnas `grupo`/`grupo_id` para revisar en Excel.
  **UI de grupos**: el listado pinta bloques por grupo (cabecera con collage 2x2 de
  los miembros —o foto propia—, nombre, totales y botón *Ver grupo*) y el resto de
  tarjetas sueltas; la insignia de la tarjeta abre el grupo. Ficha de grupo en
  `info-modal` (foto, descripción, notas, miembros clicables, *Editar grupo*,
  *Añadir animal* con datos precargados) y **Separar** desde la ficha del animal
  (con confirmación; si era el último miembro se borra la fila del grupo).
  Prefill al elegir grupo en *Nuevo Animal* (especie/raza/edad/sexo).
  **Entidad `grupos`**: hoja `Grupos` (`SHEET_GRUPOS_ID`) + endpoints
  `grupos`/`update-grupo`/`delete-grupo`; mientras la hoja no exista, GET devuelve
  `[]` y los guards emiten `status:'warning'` explicativo.
  **Auditoría de grupos (v90)**: renombrar a un nombre ya usado **fusiona** los dos
  grupos en el id existente y borra la fila absorbida (`_grupoDestino`); la ficha del
  grupo deja de bloquear el renombrado si falla (aviso, no error) y si `update-grupo`
  no encuentra la fila se reintenta con el alta (upsert); `grupos` se carga en
  `renderAnimales` con `_loadListBestEffort` (un backend sin el endpoint **no rompe**
  el listado) y se hidrata desde caché.
- **Familias**: CRUD, capacidad/ocupación, borrado con cierre de casos.
- **Acogidas activas**: ciclo entrega→en_casa→finalizada (con confirmación), borrado
  de caso individual, rollback espejo (animal, familia, solicitud, candidatura).
- **Adopciones**: pipeline de 7 fases (+/−), contrato con firma en canvas (firmante 1
  obligatorio) + PDF, borrado con rollback en cascada (backend `deleteAdopcionCascade`
  + espejo front), **devolución con motivo** (`desenlace=devuelto`, `motivo_devolucion`,
  `fecha_devolucion`: conserva el caso y revierte animal/solicitud/candidatura),
  enlace al cuestionario origen (modal solo lectura + salto).
- **Apadrinamientos**: N padrinos por animal (socio existente o externo con
  conversión a socio), aporte mensual, totales, finalizar/eliminar.
- **Socios/voluntarios**: perfiles Socio/Voluntario/Ambos, cuota + último pago con
  estado (Al día/Pendiente), carnets diferenciados por color con QR. Campo **Área**
  con la opción «Cuidado de acogida» **retirada** (esa gestión vive en su propia
  pestaña); los registros antiguos que la tengan se conservan como opción legada.
- **Lista negra**: CRUD con aviso en fichas coincidentes.
- **Donaciones / Gastos / Recordatorios / Seguimiento**: CRUD completos. **Gastos con
  factura adjunta opcional** (PDF/imagen → Drive, enlace «Ver factura») en **carpeta
  propia**: `DRIVE_FACTURAS_FOLDER_ID` si está configurada, si no subcarpeta
  «Facturas» auto-creada dentro de la de documentos.
- **Documentos / Almacén**: reales (Drive + API compartida); el Almacén lleva texto
  de uso «Qué se guarda aquí».
- **Redes**: módulo Instagram en dummy local (plantilla con iconos/tipo/contacto,
  preview, historial con enlace simulado). Corte a real marcado `TODO Meta`.
- **Reportes**: tasas, resumen por entidad, **memoria anual por ejercicio (tarjeta
  con selector + descarga PDF)**, exports PDF de encuestas.
- **Dashboard**: tarjeta Hoy, Acción requerida unificada, KPIs clicables con deltas,
  Tesorería (donaciones/gastos/balance/cuotas), barras + embudo, recientes. Pintado
  instantáneo desde caché + refresco en fondo.
- **Guía**: modal por botones (8 pestañas: general, adopción, acogida, **animales
  (camadas y grupos)**, redes, apadrinamiento, gestión, estados) + accesos directos.
  La de animales lleva **11 pasos** con el paso 3 «Crear un grupo (no hay pantalla
  aparte)»: los grupos se eligen en el **selector *Grupo / Camada*** (o se crean con
  *Crear grupo nuevo…*, en *Alta de camada* o desde *Editar*), no en una pantalla propia.
- **Transversal**: login sin flash (`gn_session`), init perezoso con `_ensureListas`,
  sync offline con cola (`gn_pending_ops` + badge + upsert backend), anti-doble-clic
  en forms (`Guardando...`), semáforo verde/naranja/rojo + glyphs, PWA instalable
  (iconos 180/192/512), a11y (diálogos, foco, teclado global, reduced-motion),
  responsive móvil/tablet/escritorio + táctil por `pointer:coarse`. **Animales en
  móvil (≤767px)**: 2 columnas, imagen 104px, tipografía/padding reducidos y bloques
  de grupo con cabecera a 40px (collage) y 8px de aire; por debajo de 360px se vuelve
  a 1 columna. Regla en `styles.css` «ANIMALES EN MOVIL».

## Backend: endpoints y reglas
GET/POST: `surveys`, `responses`, `user-profile`, `animales`, `familias`,
`adopciones`, `socios`, `blacklist`, `candidaturas`, `acogidas`, `contratos`,
`actividad`, `estados`, `notas`, `apadrinamientos`, `gastos`, `recordatorios`,
`donaciones`, `seguimientos`, `documentos`, `inventario` (+ `update-*`, `delete-*`,
`upload-foto-animal`, `upload-documento`, `delete-documento`).
- Responde **siempre HTTP 200** con `status` (`success` | `warning` | `error`) y,
  si no va bien, `error` (mensaje). `jsonResponse` infiere `status` si el llamante
  no lo pone. `actualizar()` devuelve error explícito en vez de `{data:null}`.
- `api.js` lanza con `err.status`; el front pinta con `_snackErr(err, msg)`
  (ámbar en `warning`, rojo en `error`). Hoy emite `warning` el rate-limit (429).
- POST siempre `Content-Type: text/plain;charset=utf-8` (sin preflight).
- `appendToSheet` persiste `id` y hace **upsert** (sin duplicados en reintentos);
  auto-añade columnas nuevas. `updateSheetRow` también auto-añade columnas.
  Comparaciones de id como texto.
- `carpetaDestino(tipo)` decide dónde aterriza la subida: `tipo='factura'` →
  `DRIVE_FACTURAS_FOLDER_ID` (o subcarpeta «Facturas» creada al vuelo), resto →
  `DRIVE_DOCS_FOLDER_ID`.
- `ALLOW_ORIGIN_EMPTY:true` (Apps Script no ve cabeceras Origin; el control real
  es el token). `REQUIRE_EMAIL_VERIFIED:false`. `RATE_LIMIT:100` fail-open/60s.
- `deleteAdopcionCascade`: borra caso y revierte animal/solicitud/candidatura.

## Hojas y columnas (fila 1; el orden da igual; `id` obligatorio salvo Forms/Estados/Notas)
- **Animales**: `id, nombre, especie, raza, edad, peso, sexo, estado, microchip, descripcion, grupo_id, grupo, grupo_obligatorio, esterilizada, vacunas, fecha_ingreso, foto_drive_id, foto_url, foto, adopcion_id, acogida_familia, apadrinable`
- **Familias**: `id, nombre, email, telefono, ubicacion, especialidad, max_capacity, notas, capacidad, animales_actuales, origen, fecha_registro`
- **Adopciones**: `id, animal, adoptante, email, telefono, fase, estado, notas, fecha, solicitud_id, animal_id, estado_firma` (+ `desenlace, motivo_devolucion, fecha_devolucion` al devolver; el backend añade columnas que falten)
- **Acogidas**: `id, animal_id, familia_id, animal, familia, fase, estado, inicio, solicitud_id, notas` (+ `fin` al finalizar)
- **Candidaturas**: `id, solicitud_id, survey_id, response_id, tipo, nombre, email, animal_id, familia_id, estado, fecha`
- **Contratos**: `id, adopcion_id, animal, animal_id, fecha, ciudad, estado, creado, especie, raza, edad, f1_nombre, f1_dni, f1_email, f1_telefono, f1_rol, f1_firma, f2_nombre, f2_dni, f2_email, f2_telefono, f2_rol, f2_firma`
- **Socios**: `id, nombre, email, telefono, tipo, cuota, ultimo_pago, area, foto, carnet_id, activo, fecha_registro, horas_mes, ultima_actividad` (`activo` booleano real, no texto)
- **Blacklist**: `id, nombre, apellidos, email, telefono, motivo, notas, origen, fecha`
- **Actividad**: `id, fecha, usuario, tipo, detalle, entidad, entidad_id, descripcion`
- **Grupos**: `id, nombre, descripcion, notas, foto_drive_id, foto_url, foto, fecha_creacion` (nueva; `SHEET_GRUPOS_ID` en `.env`)
- **Apadrinamientos**: `id, animal_id, animal, padrino_tipo, padrino_id, padrino_nombre, padrino_email, padrino_telefono, aporte_mensual, fecha_inicio, fecha_fin, estado, notas`
- **Gastos**: `id, animal_id, animal, fecha, concepto, importe` (+ `factura_file_id, factura_url, factura_nombre` con factura adjunta)
- **Recordatorios**: `id, titulo, fecha, notas, hecho, creado`
- **Donaciones**: `id, donante, importe, fecha, notas`
- **Seguimientos**: `id, adopcion_id, adoptante, animal, fecha, tipo, nota`
- **Estados**: `response_id, survey_id, estado, fecha` · **Notas**: `response_id, survey_id, nota, fecha`
- **Forms** (Google las crea): `Marca temporal, Nombre, Apellido(s), DNI, Fecha de Nacimiento, Dirección de correo electrónico, Telefono principal, Domicilio, Codigo Postal, Pueblo o Ciudad` + preguntas (el backend acepta variantes y normaliza fecha a ISO).

## Historial de trabajo (resumen por fase)
CORS/login → estabilidad de ids (`_byId`, filas fantasma) → rollback adopciones →
ficha animal (foto Drive) → auditoría UI/UX → roles (sin restricciones) → modales
propios/Esc/login → sync offline → tests → fechas → dashboard v2 (Hoy/Acción/KPIs/
Tesorería/embudo) → costes (0 €) → foto principal → toast semáforo → anti-doble-clic
→ Redes dummy → responsive tablet → acordeón sidebar → plantilla IG → boot fluido →
ficha por secciones → PDF profesionales → socios/voluntarios + cuota + carnets →
apadrinamientos → gestión (gastos/recordatorios/donaciones/seguimiento/documentos) →
fallecido + fase Prueba + memoria anual + almacén + menú agrupado → guía por botones →
a11y/teclado → dashboard Hoy/Acción final → **retirar opción «Cuidado de acogida»
del Área de socios, factura adjunta al gasto, desenlace `devuelto`, memoria anual
en PDF, texto de uso del Almacén**. Detalle commit a commit en `git log`.

## Pendiente lado humano (fuera de git)
1. Pegar `Code.gs`+`Config.gs` + *Nueva versión* (misma implementación).
2. Secrets `API_URL` (+ `CONTACTO_TELEFONO/EMAIL`) y re-ejecutar workflow tras cambiarlos.
3. Hojas nuevas con pestaña exacta + acceso API; `id` rellenos (sin celdas vacías).
   Hoja **`Grupos` ya creada** (`SHEET_GRUPOS_ID` en `.env` + `node scripts/gen-config.js`).
   La columna nueva **`urgente`** de Animales la añade el backend solo si el
   `Code.gs` desplegado ya trae la auto-creación de columnas (punto 1).
4. Ejecutar Descartar-2025 en Reportes una vez.
5. Recargar PWA en cada dispositivo tras cada push (SW versionado).

## Futuro desarrollo (no empezado)
Redes real (Meta: cuenta Empresa + App + cablear `TODO Meta`), WhatsApp
(`wa.me`), portal público con datos de aquí, anti-doble-tap en botones de fase,
endpoint agregado `dashboard`, push notifications, fusión de duplicados, lector de
pantalla completo, logo en alta para splash 512, recibos SEPA, colonias felinas CER,
alta de voluntarios vía Google Form, protocolo automático de recordatorios de entrada.
