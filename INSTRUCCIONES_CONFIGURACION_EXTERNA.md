# Instrucciones de configuración externa (fuera de este repositorio)

> Guía para aplicar los cambios de seguridad que **no se pueden hacer en este código/repo** y requieren configuración en **Google Apps Script (GAS/.gs)**, **Google Sheets**, **Firebase**, **GitHub** o la **web pública**.
>
> Contexto del proyecto: frontend en **GitHub Pages**, autenticación **Firebase (email/contraseña)**, backend en **Google Apps Script** (hojas de cálculo), token de API en `?token=` (sin `Authorization` header por limitaciones CORS/preflight en GAS). No versionar secretos.

---

## 1) Google Apps Script (GAS / `.gs`) y Google Sheets — **prioridad crítica (Hitos 1.1, 1.3, 2.2, 4.1, 5.1)**

> La seguridad efectiva depende de que el backend valide identidad y permisos en **cada endpoint**. La UI del frontend ya no es suficiente.

### 1.1 Denegación por defecto y autorización por endpoint (Hito 1.1, ~66%)
**Objetivo:** ningún usuario no reconocido accede a datos; cada acción se autoriza por rol/módulo.

#### A. Endpoint `user-profile`
- Buscar al usuario en la hoja de Roles por email **normalizado**: `String(email || '').toLowerCase().trim()`.
- Si **no existe** o no está habilitado/activo en Roles:
  - Devolver explícitamente acceso denegado, por ejemplo:  
    `{ "status": "ok", "data": { "email": "...", "role": "sin_acceso", "acceso": false } }`  
    (ajusta al contrato exacto que use tu frontend/backend, pero el rol efectivo debe ser `sin_acceso`).
  - **No** devolver `consulta`, `admin` ni un rol por defecto con acceso.
- Si existe y está autorizado: devolver su rol real (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`, etc.).
- Registrar en logs/auditoría (si aplica) intentos de perfiles no autorizados, sin exponer datos sensibles.

> Nota: el frontend (`v201+`) ya trata `sin_acceso` como bloqueo total (sin carga de datos y con pantalla “Sin acceso autorizado”).

#### B. Autorización en **cada** endpoint/acción (`doGet`, `doPost`, `action=...`)
Para **todas** las operaciones (lectura y escritura: `getAnimales`, `getAdopciones`, `create/update/delete*`, `upload*`, `historial-fases-adopcion`, `auditoria`, etc.):
1. **Validar identidad/token** de la petición (token en `?token=` y/o mecanismo que uses). Rechazar si falta o es inválido.
2. **Resolver usuario y rol** (desde Roles/`user-profile` interno) con email normalizado.
3. **Comprobar permiso por módulo y tipo de acción** antes de ejecutar lógica o leer/escribir hojas. **Denegar por defecto**.
4. **Responder 403/denegado** (o tu formato de error estándar) cuando no haya permiso, sin filtrar datos.

**Matriz de referencia (alinear con frontend):**
- `admin`: acceso total.
- `coordinador`: lectura/escritura en encuestas, animales, acogidas, adopciones, socios, blacklist, reportes, actividad (según política).
- `voluntario`: acceso limitado (p. ej. animales, reportes, actividad) según definición.
- `tesoreria`: donaciones, almacén/inventario, animales/reportes/actividad según definición.
- `consulta` (autorizado, solo lectura): **mínimo** acordado `dashboard`/`animales` (ajustar endpoints para que no devuelvan datos de otros módulos).
- `sin_acceso` / no reconocido: **ningún acceso**.

> Importante: aunque el frontend ya restringe `consulta`, el backend debe imponerlo (un cliente puede llamar a la API directamente).

#### C. Minimización de datos en respuestas
- Devolver solo campos necesarios por endpoint y rol.
- No volcar filas completas con datos sensibles/personales si no son necesarios (especialmente para `consulta` u otros roles limitados).

#### D. Normalización y consistencia en Roles
- En la hoja de Roles: emails en minúsculas y sin espacios (o normalizar siempre en código).
- Coincidencia exacta del email normalizado. Evitar duplicados.

**Criterio de aceptación 1.1:** un usuario no presente en Roles no obtiene datos ni puede operar en ningún endpoint; pruebas manuales por rol/módulo (GET y POST) devuelven denegación correcta.

### 1.3 Higiene de cuentas y Roles (Hito 1.3, ~70%)
- Revisar y depurar la hoja de Roles: corregir emails erróneos (p. ej. `82` vs `92`), asignar roles explícitos, eliminar accesos innecesarios, aplicar mínimo privilegio.
- Mantener inventario de usuarios/roles actualizado.
- Tras cambiar un rol: el usuario debe cerrar sesión y volver a entrar (o recargar) para refrescar `user-profile`.

### 2.2 Token de API y rotación (Hito 2.2, ~76%)
- **Rotación:** si hay sospecha de exposición, generar un nuevo token en la configuración del script (PropertiesService/`CONFIG` según tu implementación).
- **Actualizar despliegue frontend** de forma coordinada:
  - Actualizar secreto/variable en GitHub (ver sección 4) y regenerar `src/js/config.js` en el flujo de build/despliegue.
  - No guardar el token en el repositorio.
- **Logs:** evitar registrar en `Logger.log`/ejecuciones la URL completa con `?token=` o parámetros sensibles.
- **Alcance:** usar el token con el mínimo alcance posible; si tu diseño lo permite, separar tokens por propósito.

### 4.1 Canal público de solo lectura para la web externa (Hito 4.1, ~82%)
**Objetivo:** alimentar la nueva web sin exponer el API/token de administración.

- Crear un **endpoint/feed independiente** (acción `doGet` dedicada, p. ej. `public-animales`, `public-eventos`, o despliegue separado) con acceso público o token propio de solo lectura.
- **Lista blanca estricta** (solo campos publicables):
  - **Animales:** p. ej. `id/slug`, nombre, especie, raza, sexo, edad, tamaño, descripción, estado público permitido, foto/galería pública, ubicación general (no dirección). **Solo** estados que decidáis publicar (ej. `disponible`, `en_acogida`, y opcionalmente `adoptado` como escaparate).
  - **Eventos:** desde una fuente/hoja dedicada (p. ej. `Eventos`) con flag `publicado=true`, no desde `actividad` interna.
- **Excluir siempre:** adoptantes/solicitantes, acogidas, adopciones internas, contratos, documentos, gastos, donaciones, socios, blacklist, apadrinamientos, notas/historial/auditoría, datos médicos o personales.
- **CORS:** permitir solo el origen de la web pública (o los necesarios). Responder JSON estable; considerar caché.
- **No reutilizar** el token del panel de administración.

### 5.1 Auditoría e historial operativos (Hito 5.1, ~83%)
- **Hoja `auditoria`:**
  - Fila 1 con cabeceras alineadas al script (mínimo viable recomendado):  
    `id`, `fecha`, `usuario`, `email`, `rol`, `accion`, `modulo`, `entidad`, `entidad_id`, `detalle`, `antes`, `despues`, `resultado`, `error`, `ip`, `user_agent`, `origen`
  - Verificar que `CONFIG.sheets.auditoria` (o equivalente) apunta a la pestaña correcta y que el código escribe/lee por esas cabeceras u orden esperado.
  - Probar una acción que genere auditoría y confirmar en **Ejecuciones** de Apps Script que no hay errores y que se añade la fila correcta.
- **Hoja `historial-fases-adopcion`:**
  - Fila 1 con cabeceras alineadas al script/frontend (recomendado):  
    `id`, `adopcion_id`, `fecha`, `usuario`, `accion`, `fase_origen`, `fase_destino`, `fase`, `nota`, `created_at`
  - Verificar `CONFIG`/ID de hoja y endpoints `historial-fases-adopcion` (GET/POST). Probar avance/retroceso/anulación/devolución/nota y confirmar persistencia y visualización en la ficha.
- **Regla general:** datos desde la fila 2; fila 1 nunca vacía (evita fallos de mapeo lectura/escritura).

---

## 2) Firebase — autenticación y protección de login (Hito 2.1, ~74%)

> Se configura en la [Consola de Firebase](https://console.firebase.google.com/) (y, para algunas funciones, en Google Cloud / Identity Platform). Los pasos exactos pueden variar según el plan (Spark/Blaze) y la versión de la consola.

### 2.1 Revisión de políticas y protección frente a abuso
1. **Authentication → Settings / Usuarios:**
   - Revisar métodos de acceso habilitados (solo los necesarios: email/contraseña).
   - Verificar dominios autorizados (incluir el dominio de GitHub Pages y los usados en desarrollo si aplica).
2. **Protección contra abuso / intentos fallidos:**
   - Firebase aplica ciertas protecciones automáticas; revisa la configuración de protección y cuotas disponibles en tu proyecto.
   - Considerar límites/alertas y revisión periódica de actividad sospechosa.

### 2.2 MFA (autenticación multifactor) para administradores
1. **Authentication → Sign-in method:** habilitar proveedores/factores de segundo paso soportados (p. ej. SMS o TOTP según disponibilidad y plan; TOTP suele ser preferible).
2. **Activar MFA** (puede requerir **Identity Platform** y plan de facturación en algunos casos):
   - Habilitar MFA en el proyecto y definir si es opcional u obligatorio por tipo de usuario.
   - Priorizar **cuentas `admin` y elevadas**.
3. **Inscripción de usuarios:** guiar a los administradores para registrar su segundo factor en el siguiente inicio de sesión (según el flujo que habilites).
4. **Verificación:** probar login con cuenta admin y confirmar solicitud de segundo factor.

> Si MFA completo no está disponible en tu plan, aplica como mínimo contraseñas robustas, revisión de accesos y reCAPTCHA/App Check.

### 2.3 reCAPTCHA / App Check en el flujo de login
Hay dos enfoques complementarios (según disponibilidad):

#### Opción A — Protección reCAPTCHA en Firebase Authentication (recomendado si disponible)
- Algunas capacidades (p. ej. protección con reCAPTCHA Enterprise / Email enumeration protection / controles de riesgo) pueden requerir **Identity Platform**.
- Pasos generales:
  1. En **Google Cloud Console**, crear/configurar una clave de **reCAPTCHA Enterprise** para el dominio de la app (p. ej. `gn-admin.github.io`).
  2. En **Firebase Console → Authentication → Settings** (o sección de protección/App Check según UI), habilitar la protección reCAPTCHA para el flujo de email/contraseña si está disponible.
  3. Asociar la clave/site key correspondiente y restringir dominios.
  4. Probar inicio de sesión (usuarios legítimos) y validar que no se degrada la experiencia.

#### Opción B — Firebase App Check (protección de recursos/abuso de backend y SDKs)
- Útil para reducir uso abusivo desde clientes no verificados; la integración exacta con el login email/contraseña depende de las funciones habilitadas.
- Pasos generales:
  1. **Firebase Console → App Check:** registrar la app web.
  2. Seleccionar proveedor (p. ej. **reCAPTCHA v3** o **reCAPTCHA Enterprise**) y crear/configurar la clave para tu dominio.
  3. Activar App Check para los servicios soportados que uses (Authentication/otros) según esté disponible.
  4. Actualizar el frontend para inicializar App Check con el SDK de Firebase si es necesario (cambio en código; implica tocar `src/js/auth.js`/config y validar). **Coordinar antes de activar enforcement** para no bloquear usuarios.

> Recomendación práctica: empezar por **MFA para admins** y políticas/revisión de accesos; añadir reCAPTCHA/App Check cuando tengas la configuración y pruebas listas. Documentar lo activado y su plan asociado.

### 2.4 Buenas prácticas de cuentas (operativo)
- Contraseñas robustas y únicas para cuentas con privilegios.
- Revisar y deshabilitar cuentas que ya no deban tener acceso.
- Revisar periódicamente **Authentication → Users** y registros de actividad.

---

## 3) Google Sheets — Roles y cabeceras (Hitos 1.1, 1.3, 5.1)

- **Hoja de Roles/Usuarios (usada por `user-profile`/`.gs`):**
  - Columnas con email y rol claros (p. ej. `email`, `rol`/`role`, `activo` si aplica).
  - Emails normalizados (minúsculas, sin espacios) y sin duplicados.
  - Solo usuarios autorizados; rol explícito (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`). Usuarios no presentes deben resultar en `sin_acceso` desde el backend.
- **Hoja `auditoria`:** fila 1 con cabeceras (ver 1 / 5.1). Datos desde fila 2.
- **Hoja `historial-fases-adopcion`:** fila 1 con cabeceras (ver 1 / 5.1). Datos desde fila 2.
- **Permisos de las hojas:** restringir acceso de edición/lectura en Google Sheets/Drive solo a quienes lo necesiten; el acceso operativo de la app debe ir vía GAS con permisos controlados.

---

## 4) GitHub (despliegue y secretos) — Hito 2.2 / operación

- **Secretos:** en el repositorio (Settings → Secrets and variables → Actions), mantener el token de API y configuración sensible como **Secrets** (no Variables planas si el repo es público), y nunca commitear `.env` ni `src/js/config.js`.
- **Rotación de token:** al rotar el token en GAS, actualizar el secreto correspondiente en GitHub y ejecutar el despliegue para regenerar la config inyectada.
- **Verificación:** tras cambios, confirmar que la app desplegada funciona y que no se expone el token en el código publicado más allá de lo imprescindible en runtime (teniendo en cuenta la limitación `?token=`).

---

## 5) Web pública (consumo de datos) — Hito 4.1

- Configurar la nueva web para consumir **solo** el endpoint/feed público creado en GAS (o JSON estático exportado), nunca el API/token de administración.
- Usar HTTPS, restringir orígenes CORS en el endpoint público y cachear respuestas cuando sea posible.
- No mostrar ni almacenar datos no públicos; revisar que imágenes/enlaces sean públicos.

---

## 6) Verificación y operación continua (Hito 5.2)

- **Pruebas por rol (UI y API):** con cuentas `admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta` y un usuario **no autorizado/no presente en Roles**:
  - Comprobar acceso/denegación a páginas y acciones en la app.
  - Probar llamadas directas a endpoints GAS (lectura/escritura) y verificar denegación correcta.
- **Revisiones periódicas:** accesos en Firebase, ejecuciones/permisos en GAS, coherencia Roles↔usuarios, vigencia de tokens.
- **Procedimiento ante incidente:** rotar token, revisar auditoría/ejecuciones, revocar accesos/cuentas comprometidas y corregir configuración de Roles.

---

## Resumen rápido: qué toca en `.gs`
- `user-profile`: devolver `sin_acceso` para no reconocidos + normalizar email.
- **Todos los endpoints:** validar token/identidad + autorizar por rol/módulo/acción + denegar por defecto + minimizar datos.
- Ajustar `CONFIG`/IDs de hojas (`auditoria`, `historial-fases-adopcion`) y mapeo de cabeceras.
- (Opcional/recomendado) endpoint público separado para la web externa con lista blanca y sin token admin.
- Evitar loguear URLs con `?token=` y definir rotación de token.
