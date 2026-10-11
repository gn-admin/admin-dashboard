# GN-Encuestas / Admin Dashboard — Contexto completo (2026-09-29)

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
- `npm test` — `node --test tests/*.test.js` (**290 tests en verde**, lógica pura sin
  DOM; 6 ficheros: `dashboard` / `cobertura` / `api` / `diseno` / `pdf-export` / `auth`).
  En PowerShell sin TTY el reporter es TAP: buscar `^# pass` / `^# fail`, no `✖`.
  **También corren en CI**: el workflow ejecuta `npm test` tras `gen-config`.
- No editar a mano `src/js/config.js` ni `apps-script/Config.gs` (generados, ignorados).

## Arquitectura
- `src/`: `index.html` + `js/` (config, icons, auth, api, dashboard ~4900 líneas,
  carnet-generator, pdf-export, app) + `css/styles.css` + `sw.js` + `manifest` + assets.
- Router por hash (`app.js`). Sin framework ni build de JS.
- `apps-script/` (gitignored, solo local para desplegar): `Code.gs`, `Config.gs`
  (generado), `Auth.gs` (JWT Firebase vía `accounts:lookup`), `DataFilter.gs`
  (reservado, sin uso), `PdfService.gs` (reservado, sin uso; el front exporta en cliente).
- `tests/` (node:test, sin dependencias). SW actual: `gn-encuestas-v105`.

## Mapa funcional final
- **Encuestas** (3, y solo 3): listados con filtros/buscador, ficha con estados (`pendiente`,
  `en_proceso`, `aprobada`, `descartada`, clave `survey_id::id`), notas, aprobar→
  candidatura (+auto-familia en acogida), asignar animal/familia, PDF individual y
  completo (portada + KPIs + fichas), chequeo de blacklist, mantenimiento Descartar-2025.
  **No hay encuesta de «otras especies»**: esa opción está **retirada del front y del
  generador** (decisión: no exponer nada a medias); de momento la adopción/acogida de
  cualquier especie se tramita con `pre-adopcion-perros`, `pre-adopcion-gatos` y
  `pre-acogida` (el selector de asignación no filtra por especie).
- **Animales**: CRUD en modal, alta de camada bulk, foto principal (Drive + thumbnail),
  especie extensible, grupos, estados (`disponible`, `en_acogida`, `en_adopcion`,
  `adoptado`, `fallecido`), ficha con héroe + secciones plegables (info, publicaciones,
  apadrinamientos, gastos, documentos-dummy, grupo, familia, historial médico).
  **Especies domésticas (v97)**: `_especiesDomesticas()` ofrece *Perro, Gato, Conejo,
  Hámster, Pájaro, Tortuga, Hurón, Cobaya, Erizo, Pez* en la ficha y en *Alta de
  camada* (`Otro...` sigue libre) y el **filtro de especie de Animales es dinámico**
  (lista las especies presentes, las conocidas primero) en lugar del fijo
  *Perro/Gato/Otros*.
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
  **Filtro «Solo urgentes» (v96)**: tercer `<select>` de Animales
  (`_currentPrioridadFilter`) combinable con estado y especie, y el listado siempre
  ordena los urgentes a la cabeza de cada bloque (`_ordenaUrgentes`, sin mutar).
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
  **Horas de voluntariado (v96)**: la ficha del socio con tipo *Voluntario*/*Ambos*
  tiene *Registrar horas* → suma sobre `horas_mes` y sella `ultima_actividad`
  (columnas ya existentes, sin columnas nuevas) + botón *Reiniciar mes*; la lista
  muestra la columna *Horas/mes* y ambas acciones dejan traza en el log.
  **Ficha (v99)**: héroe compacto (avatar 72px con `flex-shrink:0` + nombre + badges
  + email/teléfono) y **todos los campos a ancho completo debajo** — la foto ya no
  va en columna y no desplaza los datos. **Al editar se sustituye la ficha por el
  solo formulario** (`_renderForm` guarda la anterior en `detailEl._prevHTML` y
  `cancelForm` la restaura); antes el form convivía con la ficha vieja debajo.
  Reglas puras `_renderFormMode`/`_formCancelAction` (compartidas con Familias y
  Adopciones, que usan el mismo `_renderForm`).
- **Lista negra**: CRUD con aviso en fichas coincidentes.
- **Donaciones / Gastos / Recordatorios / Seguimiento**: CRUD completos. **Gastos con
  factura adjunta opcional** (PDF/imagen → Drive, enlace «Ver factura») en **carpeta
  propia**: `DRIVE_FACTURAS_FOLDER_ID` si está configurada, si no subcarpeta
  «Facturas» auto-creada dentro de la de documentos.
- **Documentos / Almacén**: reales (Drive + API compartida); el Almacén lleva texto
  de uso «Qué se guarda aquí».
- **Redes**: módulo Instagram en dummy local (plantilla con iconos/tipo/contacto,
  preview, historial con enlace simulado). Corte a real marcado `TODO Meta`.
- **Reportes**: tasas, resumen por entidad, **tarjeta Analítica** —análisis de
  respuestas por encuesta/estado, duración media de la acogida (`_partesFecha`
  entiende ISO, ISO con hora, `dd/mm/aaaa`, `dd-mm-aaaa` y texto es-ES «13 abr 2025»)
  y horas de voluntariado con top del mes—, **memoria anual por ejercicio (tarjeta
  con selector + descarga PDF)**, exports PDF de encuestas.
- **Registro de actividad**: pantalla `#actividad` (sidebar *Herramientas*, menú *Más*)
  con buscador, filtro por tipo, tabla y export CSV; alimentada por `_regLog`, que
  además persiste en `gn_cache_actividad` (la colección no está en `saveLocal()`).
- **Anti doble-tap**: `avanzarFase`/`retrocederFase`/`avanzarFaseAcogida` protegidos
  por `_busyStart`/`_busyEnd` (llave por caso, liberada en `finally`).
- **Dashboard**: tarjeta Hoy, Acción requerida unificada, KPIs clicables con deltas,
  Tesorería (donaciones/gastos/balance/cuotas), barras + embudo, recientes. Pintado
  instantáneo desde caché + refresco en fondo.
- **Guía**: modal por botones (8 pestañas: general, adopción, acogida, **animales
  (camadas y grupos)**, redes, apadrinamiento, gestión, estados) + accesos directos.
  La de animales lleva **12 pasos** con el paso 3 «Crear un grupo (no hay pantalla
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
- **Login sin identificar al proveedor (v98)**: `Auth._msgLogin(err)` traduce cualquier
  error de acceso a una frase genérica en castellano («Email o contrasena incorrectos»,
  «Demasiados intentos…», «No se pudo conectar…») y **nunca** se pinta `err.message`:
  nada de `auth/…` ni «Firebase» en pantalla ni en `console.error`. Test en
  `tests/auth.test.js`. Ojo: `CONFIG.firebase.authDomain` y los `<script>` de
  `gstatic.com` siguen visibles en el bundle (inherente a la autenticación en cliente).

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
en PDF, texto de uso del Almacén** → v92 snackbar con `status` + ámbar → v93 marca de
urgencia + `.form-input` → v94 selector de grupo (sustituye al datalist) → v95
auditoría UI/UX (contraste AA en toasts/badge, `_esPrioritario`, pills flex,
checkbox nativo 44px, zoom iOS) → **v96 filtro de urgentes, `.btn-primary` con
contraste AA, pantalla de Registro de actividad, horas de voluntariado, Analítica
en Reportes y anti-doble-tap en fases** → **v97 especies domésticas (ficha animal,
alta de camada y filtro de especie dinámico) y retirada de la encuesta «Otras
Especies» del front y del generador** → **v98 errores de login anónimos (sin
mencionar el proveedor de autenticación)** → **v99 ficha de socio con héroe
compacto (la foto no desplaza los campos) y edición que sustituye la ficha por el
solo formulario** → **v100 suite de tests ampliada (152→272) con 3 bugs reales
corregidos (`_partesFecha` acepta `dd-mm-aaaa` y «13 abr 2025» —el texto es-ES de
`inicio`/`fin` de las acogidas rompía la duración media de Reportes—;
`apadrinaTotal` usa `aporte_mensual`, la memoria anual salía 0,00 €; y
`_fmtFecha` acepta `dd-mm-aaaa`), contraste AA de `.btn-danger` y
`.btn-outline-green`, tests en CI y `CACHE_NAME` v100** → **v101 foto de la ficha
de animal clickable: el avatar abre un modal con la imagen grande (`_fotoHero` +
`verFotoAnimal`, src `w1600` con reintento a `w800`, CSS `.foto-hero`/`.modal-foto`)
y tests 272→275** → **v102 auditoría de seguridad/lógica (P0-P1)**: escapeo XSS en
el render del cuestionario (`_seccionesHtml`, usado por la ficha y el modal; el PDF
escapa por su cuenta), en la tarjeta/listado de animales y adopciones, en el formulario
de familias y en las fichas de animal/socio; `setEstado` devuelve booleano y
`aprobarEncuesta`/`descartar2025` ya no pintan éxito cuando el backend falla;
`_memoriaData` cuenta solo apadrinamientos `activo` (antes pasaban los `finalizado`);
capacidad de familia real con `_capacidadFamilia` (una familia con `max_capacity`=2
ya no se quedaba «Ocupada» con un animal); lista negra con clave estable
(`_blClave`/`_blPorClave`: borrar con filtro ya no eliminaba a otra persona);
`api.js` envía `Authorization: Bearer` **además** del token en query (retirar el
query al publicar `Code.gs`); `sw.js` precachea `icon-180.png` e ignora no-GET;
tokens tipográficos (`--text-2xs/xs/sm`) y de color (`--success`, `--info-strong`)
sustituyendo hex/rem sueltos; `docs/` legado marcado HISTÓRICO; tests 275→287** →
**v103 fluidez (plan A-F)**: ningún `transition: all` (10 a propiedades explícitas)
con feedback táctil `scale(0.99)` en las tarjetas; `.loading-overlay` siempre
`display:flex` (fade por opacity en vez de show/hide brusco, sin `backdrop-filter`
en puntero táctil); scroll-lock de modales con ref-count (`_modalScrollLock` en
`showInfoModal`/`showFormModal`/`_confirm`); navegación y detalle con View
Transition progresiva (`_withViewTransition` en `navigateTo`/`_showDetail`/
`_hideDetail`); entrada sutil de listados con `.list-fresh` + keyframes `cardFade`
(`_animaListado` solo en renders, nunca en filtros); aria en el overlay de carga;
tests 287→290** → **v104 hotfix: retirada de la View Transition API** (envolver
`navigateTo`/`_showDetail`/`_hideDetail` en `document.startViewTransition` dejo
las pantallas y fichas en blanco al no ejecutarse el callback; la navegación
vuelve a ser directa y `_withViewTransition` es un simple `fn()`; la entrada de
listados la sigue aportando `.list-fresh`, que es CSS puro) → **v105 hotfix:
retirada de la cabecera `Authorization` de `api.js`** (se había añadido en v102 y
recién llegó a prod junto con la fluidez; un header no simple fuerza un preflight
CORS `OPTIONS` que Apps Script **no** responde con `Access-Control-Allow-Headers`
→ el navegador bloqueaba **todas** las peticiones GET/POST → «error al cargar» en
todas las pantallas. El token viaja **solo** en `?token=` —el backend desplegado
solo lee `e.parameter.token` y responde `ACAO: *`—; migrarlo a cabecera únicamente
cuando el `Code.gs` esté desplegado con soporte de preflight. Tests: `_get`/`_post`
afirman `Authorization === undefined`).
  Detalle commit a commit en `git log`.

## Pendiente lado humano (fuera de git)
1. Pegar `Code.gs`+`Config.gs` + *Nueva versión* (misma implementación).
   **Nota**: el `Code.gs` local ya lee `Authorization` (`getHeader(e,'Authorization')`
   → fallback `e.parameter.token`), pero **no publicarlo todavía sin antes añadir
   soporte de preflight**: mientras el front no mande la cabecera, el token va
   **solo** en `?token=` (v105 lo dejó así porque la cabecera rompía prod, véase
   el detalle de v105 arriba). El flujo correcto es: (a) publicar un `Code.gs` que
   responda el `OPTIONS` con `Access-Control-Allow-Headers: authorization` y
   `ACAO` correcto, (b) recién entonces migrar el front a la cabecera y retirar
   el query (saca el JWT de los logs/red).
2. Secrets `API_URL` (+ `CONTACTO_TELEFONO/EMAIL`) y re-ejecutar workflow tras cambiarlos.
   El workflow usa `secrets.X || vars.X` (fallback): **se mantiene a propósito**
   porque no se puede verificar desde el repo si los valores viven en Secrets o
   en Variables; el repo es público, así que no debe haber nunca valores planos
   en Variables. Si se confirma que todo está en Secrets, el `|| vars.X` se
   retira del workflow.
3. Hojas nuevas con pestaña exacta + acceso API; `id` rellenos (sin celdas vacías).
   Hoja **`Grupos` ya creada** (`SHEET_GRUPOS_ID` en `.env` + `node scripts/gen-config.js`).
   La columna nueva **`urgente`** de Animales la añade el backend solo si el
   `Code.gs` desplegado ya trae la auto-creación de columnas (punto 1).
4. Ejecutar Descartar-2025 en Reportes una vez.
5. Recargar PWA en cada dispositivo tras cada push (SW versionado).

## Deuda y decisiones abiertas (no bloquean)
1. **Regla de devolución de un grupo obligatorio**: ¿se devuelve el animal a la
   protectora o solo se marca el caso? Sin definir.
2. ~~**`docs/` legado desactualizado**~~ → **cerrado**: `ARQUITECTURA`, `CHANGELOG`,
   `CHECKLIST-PRODUCCION`, `FLUJO-TRABAJO`, `GUIA-DESPLIEGUE`, `ROLES` y
   `ESQUEMA-FLUJO-PREADOPCION-ACOGIDA` llevan ahora un encabezado **HISTÓRICO**
   que remite a `AGENTS.md`/`PROGRESO.md` (la fuente de verdad). No se retiran
   del repo por si sirven de contexto.
3. **Sin linter**: `npm run lint` es un `echo` (no hay ESLint/Prettier configurados).
4. **`.toast-info` daría 3,15:1**: el tipo `info` de snackbar **no se usa** hoy en el
   código; si algún día se añade, subirlo a AA (`--primary-hover`/`--danger-hover`).

> Cerrado: **contraste de botones** (`.btn-danger` y `.btn-outline-green` ahora en AA,
> ver historial v100) y **tests en CI** (el workflow ejecuta `npm test`).

## Futuro desarrollo (no empezado)

> **Contexto — Redes/Instagram**: no se lista aquí como mejora porque está **aún por
> definir**: hoy es un módulo *dummy* local (`TODO Meta` en el código) sin integración
> real. Antes de programar nada hay que decidir la dirección (conectar Meta / publicar
> desde el panel / o retirarlo). Solo después tendría sentido tocarlo.
> **Guía paso a paso del token de Instagram** (Fases 0-6, con huecos para capturas):
> `docs/GUIA-TOKEN-INSTAGRAM.md`. La integración en el código sería la Fase 7.

Mejoras candidatas, por orden de encaje:

- **Sugerir animales desde las encuestas** — *solo análisis, no implementado*:
  ver `docs/ANALISIS-ETIQUETAS-ENCUESTA-ANIMAL.md` (diccionario de etiquetas
  derivado de las columnas reales de los 3 formularios, matriz de compatibilidad
  y fases 0-3; bloqueador: publicar `Code.gs`).
- **Encuesta «Otras Especies»** (hoy retirada del front y de `gen-config`): crear el
  Google Form duplicando el de pre-adopción, rellenar `FORM_OTRAS_ESPECIES_ID` +
  `SHEET_OTRAS_ESPECIES_ID` en `.env`, `node scripts/gen-config.js` (el generador
  volverá a emitir la entrada `otras-especies` cuando exista el form id), *Nueva
  versión* en el editor y reintroducir la 4ª tarjeta del hub, la ruta
  `#encuestas-otras` y el export de Reportes.
- **WhatsApp** (`wa.me`) desde ficha de solicitud/socio.
- **Portal público** con datos de aquí (adopciones disponibles, sin datos sensibles).
- **Endpoint agregado `dashboard`** en el backend para cargar los KPIs en una sola
  petición (hoy son varias).
- **Push notifications** (recordatorios de vencimiento, acogidas, etc.).
- **Fusión de duplicados** (animales/socios con el mismo nombre o email).
- **Lector de pantalla completo** (lectura cómoda de respuestas largas).
- **Logo en alta** para el splash de 512 px (hoy solo 180/192/512 del icono).
- **Recibos SEPA** para cuotas de socios.
- **Colonias felinas CER** y **alta de voluntarios vía Google Form**.
- **Protocolo automático de recordatorios de entrada**.
