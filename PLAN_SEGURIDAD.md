# Plan de seguridad â€” Admin Dashboard (Grupo Nebak)

> **Objetivo:** elevar la postura de seguridad del proyecto desde un estado estimado **~60%** hasta **80â€“85%** (objetivo recomendado) dentro de las limitaciones del stack: **GitHub Pages (repo/app pÃºblica, sin cabeceras HTTP de servidor)** + **Firebase Auth** + **Google Apps Script (GAS)** + hojas de cÃ¡lculo.
>
> **Nota:** los porcentajes son **estimaciones orientativas** (no mÃ©tricas absolutas). La seguridad efectiva depende en gran medida del backend (GAS/Firebase/hojas), no totalmente auditable desde este repositorio. El mÃ¡ximo prÃ¡ctico en este stack se estima en **~85â€“90%**.
>
> **Restricciones vigentes:** no versionar secretos; token de API en `?token=` (sin preflight/CORS completo en GAS); CSP solo vÃ­a `<meta>` en GitHub Pages; rutas relativas; backend como fuente de verdad de permisos.

---

## LÃ­nea base (estimada): ~60%

**Supuestos del estado actual (resumen):**
- AutenticaciÃ³n con Firebase (email/contraseÃ±a); perfil/rol obtenido de `user-profile` (GAS).
- Control de permisos por rol en frontend; fallback no admin (`consulta`); `consulta` reducido a `dashboard` y `animales` (solo lectura) y sin ediciÃ³n.
- Secretos fuera de git (`.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`).
- CachÃ© de datos en `localStorage` y Service Worker; token de API en URL; CSP por `<meta>`.
- AuditorÃ­a/historial dependientes de configuraciÃ³n correcta en GAS/hojas (cabeceras aÃ±adidas en hojas, validar operaciÃ³n real).

**Principales brechas:** autorizaciÃ³n y validaciÃ³n no verificables en GAS, usuarios no reconocidos sin bloqueo explÃ­cito en backend, exposiciÃ³n potencial del token en URL, datos residuales en cliente, ausencia confirmada de MFA/reCAPTCHA/App Check, ausencia de canal pÃºblico separado para consumo externo.

---

## Hoja de ruta (cambios y % alcanzado)

Cada hito indica el **% estimado alcanzado tras completarlo** (acumulado). Completar un hito implica su verificaciÃ³n/aceptaciÃ³n.

### Fase 0 â€” PreparaciÃ³n y baseline (sin cambio de % de seguridad, habilita el plan)
- **Acciones**
  - Inventariar: endpoints GAS en uso, hojas/IDs, roles actuales, cuentas admin, dÃ³nde se genera/usa el token de API, datos cacheados (`gn_*`, `gn_cache_*`) y flujos sensibles (adopciones, socios, blacklist, donaciones, documentos).
  - Definir matriz de permisos objetivo (por rol y mÃ³dulo: leer/escribir) y polÃ­tica para â€œusuario no reconocidoâ€.
  - Establecer checklist de verificaciÃ³n (frontend, GAS, Firebase, hojas) y responsable por hito.
- **DÃ³nde:** documentaciÃ³n operativa interna (no versionada) + este plan.
- **Criterio de aceptaciÃ³n:** inventario y matriz aprobados; responsables asignados.
- **% alcanzado tras Fase 0:** **~60%** (lÃ­nea base)

---

### Fase 1 â€” Control de acceso: mÃ­nimo privilegio y denegaciÃ³n por defecto
**Objetivo:** que ningÃºn usuario no autorizado vea datos internos; que los autorizados vean solo lo necesario.

1. **1.1 Backend (GAS) â€” rol explÃ­cito para no reconocidos y autorizaciÃ³n por endpoint** *(externo, crÃ­tico)*
   - `user-profile`: si el email no existe/no estÃ¡ habilitado en Roles, devolver estado/rol `sin_acceso` (o error controlado) â€” no degradar a `consulta`.
   - En **cada endpoint**: validar identidad/token y comprobar permiso por mÃ³dulo/acciÃ³n (lectura/escritura) segÃºn rol; denegar por defecto.
   - Normalizar emails en Roles (minÃºsculas, trim) y coincidencia exacta para evitar errores de mapeo.
   - **Criterio:** usuario no presente en Roles no obtiene datos ni puede operar; pruebas por rol/mÃ³dulo en endpoints sensibles.
   - **% alcanzado:** **~66%**

2. **1.2 Frontend â€” rol `sin_acceso` y bloqueo de navegaciÃ³n/carga** *(repo)*
   - AÃ±adir rol `sin_acceso` en `_paginasPorRol` (sin acceso a mÃ³dulos/datos) y `puedeEditar` (false); mostrar pantalla clara â€œSin acceso / perfil no autorizadoâ€.
   - Asegurar que, con `sin_acceso` o sin perfil vÃ¡lido, no se disparen cargas de listas/datos (`_loadList`, cargas en background/home) ni se rendericen vistas con datos.
   - Mantener `consulta` mÃ­nimo (`dashboard`, `animales`, solo lectura) solo para usuarios explÃ­citamente autorizados.
   - **Criterio:** cuenta no autorizada autenticada en Firebase no ve listados ni detalles internos; `consulta` autorizado ve solo lo mÃ­nimo.
   - **% alcanzado:** **~68%**

3. **1.3 Higiene de cuentas y Roles** *(operativo + hojas/GAS)*
   - Revisar/depurar hoja de Roles (altas/bajas, emails correctos), eliminar accesos innecesarios, principio de mÃ­nimo privilegio por persona.
   - Verificar que cambios de rol se reflejan tras re-login/recarga.
   - **Criterio:** inventario de usuarios/roles actualizado y validado.
   - **% alcanzado:** **~70%**

---

### Fase 2 â€” ProtecciÃ³n de credenciales y acceso al API
**Objetivo:** reducir riesgo de abuso de cuentas y exposiciÃ³n del token.

4. **2.1 Endurecer login (Firebase)** *(configuraciÃ³n Firebase, externo)*
   - Revisar polÃ­ticas de Firebase Auth (protecciÃ³n ante intentos abusivos/bloqueos).
   - Habilitar **MFA/2FA** para cuentas administrativas (prioritario) y cuentas con permisos elevados.
   - Evaluar/activar **reCAPTCHA/App Check** en el flujo de autenticaciÃ³n si el plan/configuraciÃ³n lo permite (equilibrar seguridad/UX).
   - **Criterio:** admins con MFA activo; protecciÃ³n frente a automatizaciÃ³n habilitada o justificada.
   - **% alcanzado:** **~74%**

5. **2.2 GestiÃ³n y exposiciÃ³n del token de API** *(GAS/operativo + revisiÃ³n frontend)*
   - Rotar el token de API si existe sospecha de exposiciÃ³n; definir procedimiento de rotaciÃ³n segura (secretos/entorno, no en git).
   - Minimizar exposiciÃ³n: evitar registrar la URL completa con `?token=` en logs propios, no incluir token en mensajes/telemetrÃ­a; revisar que no se filtre por `Referer` desde contextos controlables.
   - Confirmar que el token se usa solo donde es imprescindible y con alcance mÃ­nimo (si GAS lo soporta, separar tokens por propÃ³sito).
   - **Criterio:** token rotado/documentado el procedimiento; sin fugas conocidas en cÃ³digo/logs del repo.
   - **% alcanzado:** **~76%**

---

### Fase 3 â€” MinimizaciÃ³n de datos y endurecimiento del cliente
**Objetivo:** reducir el impacto ante acceso al dispositivo/navegador o exposiciÃ³n de datos.

6. **3.1 Minimizar y proteger cachÃ© en cliente** *(repo)*
   - Revisar quÃ© se guarda en `localStorage` y cachÃ© del SW (`gn_cache_*`, listas, respuestas): almacenar solo lo necesario para funcionamiento/offline previsto.
   - Asegurar limpieza completa de datos de usuario al **logout** y al **cambio de cuenta** (ya existe base; auditar coberturas, incluidos `gn_cache_*` y estados).
   - Evitar cachear en SW respuestas con datos sensibles/dinÃ¡micos si no es necesario; ajustar estrategia de cachÃ© (p. ej. network-first para datos, cache de assets estÃ¡ticos).
   - **Criterio:** tras logout/cambio de usuario no quedan datos de la cuenta anterior; cachÃ© limitado a lo imprescindible.
   - **% alcanzado:** **~78%**

7. **3.2 Superficie y hardening frontend** *(repo, dentro de lÃ­mites de GitHub Pages)*
   - Mantener y revisar CSP en `<meta>` (mÃ­nimos permisos necesarios para scripts/estilos/fuentes/conexiones).
   - Revisar dependencias/cargas externas (CDNs), uso de `defer`/carga controlada y evitar exponer informaciÃ³n sensible en UI/mensajes de error.
   - No incluir datos sensibles en URLs/hash mÃ¡s allÃ¡ de lo necesario; revisar manejo de errores para no filtrar detalles internos.
   - **Criterio:** CSP coherente con el funcionamiento; sin filtraciones innecesarias en cliente.
   - **% alcanzado:** **~79%**

---

### Fase 4 â€” SeparaciÃ³n de superficies y exposiciÃ³n pÃºblica controlada
**Objetivo:** poder alimentar la web pÃºblica sin exponer el API/admin interno.

8. **4.1 Canal pÃºblico de solo lectura (para web externa)** *(GAS + nueva web, externo)*
   - Crear endpoint/feed **pÃºblico y separado** (o exportaciÃ³n estÃ¡tica periÃ³dica) con **lista blanca** de campos y solo registros/estados publicables (p. ej. fichas de animales pÃºblicas, eventos publicados).
   - Nunca reutilizar el token/API de administraciÃ³n; sin datos personales/sensibles (adoptantes, documentos, contratos, gastos, notas internas, etc.).
   - Aplicar CORS para el dominio pÃºblico, cachÃ© y, si es dinÃ¡mico, lÃ­mites de uso razonables.
   - **Criterio:** la web pÃºblica consume solo el canal pÃºblico; imposible obtener datos internos desde ese canal.
   - **% alcanzado:** **~82%**

---

### Fase 5 â€” Trazabilidad, verificaciÃ³n y operaciÃ³n continua
**Objetivo:** detectar incidentes, validar controles y sostener el nivel alcanzado.

9. **5.1 AuditorÃ­a e historial operativos** *(GAS/hojas + verificaciÃ³n, externo)*
   - Verificar que `auditoria` (cabeceras mÃ­nimas ya definidas) e `historial-fases-adopcion` registran y leen correctamente en producciÃ³n (endpoints, IDs de hoja, permisos de ejecuciÃ³n).
   - Asegurar que eventos crÃ­ticos quedan trazados (altas/bajas/cambios de rol, cambios de fase, anulaciones/devoluciones, accesos relevantes si aplica).
   - **Criterio:** registros correctos visibles y consultables; sin errores en ejecuciones de GAS.
   - **% alcanzado:** **~83%**

10. **5.2 Pruebas de seguridad y revisiÃ³n periÃ³dica** *(operativo + repo)*
    - Pruebas por rol (incluido `sin_acceso` y `consulta`): acceso/denegaciÃ³n en UI y, sobre todo, en **endpoints GAS**.
    - RevisiÃ³n periÃ³dica: accesos Firebase/GAS, rotaciÃ³n de credenciales cuando proceda, dependencias, y coherencia Rolesâ†”usuarios.
    - Documentar procedimiento de respuesta ante sospecha de exposiciÃ³n (rotar token, revisar logs/auditorÃ­a, revocar accesos).
    - **Criterio:** checklist de pruebas pasado; calendario/procedimiento de revisiÃ³n definido.
    - **% alcanzado:** **~84â€“85%**

---

## Resumen de progresiÃ³n (estimada)

| Hito | Cambio principal | % alcanzado |
|---|---|---:|
| Base | Estado actual | ~60% |
| 1.1 | AutorizaciÃ³n por defecto en GAS + `sin_acceso` en backend | ~66% |
| 1.2 | `sin_acceso` y bloqueo de datos en frontend | ~68% |
| 1.3 | Higiene de cuentas/Roles | ~70% |
| 2.1 | MFA/admins + endurecimiento login Firebase (reCAPTCHA/App Check si aplica) | ~74% |
| 2.2 | GestiÃ³n/rotaciÃ³n y mÃ­nima exposiciÃ³n del token API | ~76% |
| 3.1 | MinimizaciÃ³n/limpieza de cachÃ© en cliente | ~78% |
| 3.2 | Hardening frontend (CSP/deps/errores) | ~79% |
| 4.1 | Canal pÃºblico separado de solo lectura | ~82% |
| 5.1 | AuditorÃ­a/historial verificados en producciÃ³n | ~83% |
| 5.2 | Pruebas, revisiÃ³n periÃ³dica y procedimiento de respuesta | ~84â€“85% |

> **Objetivo recomendado:** **80â€“85%**. Alcanzar ~85â€“90% requerirÃ­a controles adicionales difÃ­ciles en este stack (p. ej. cabeceras de seguridad gestionadas en servidor/proxy propio, reducciÃ³n mayor de exposiciÃ³n del token/arquitectura de API), con coste y cambios estructurales mayores.

---

## ClasificaciÃ³n por Ã¡mbito (para ejecuciÃ³n)

- **Repositorio (este proyecto):** 1.2, 3.1, 3.2 (y apoyo a 5.2 con pruebas).
- **GAS / Hojas / Backend (externo):** 1.1, parte de 1.3, 2.2 (lado servidor/token), 4.1, 5.1.
- **Firebase (configuraciÃ³n):** 2.1.
- **Operativo/procesos:** 0, 1.3, 2.2 (rotaciÃ³n/procedimiento), 5.2.

## Registro de avance

| Fecha | Hito(s) | Cambio realizado | % alcanzado | Responsable | Evidencia/Notas |
|---|---|---|---:|---|---|
| â€” | Base | LÃ­nea base documentada | ~60% | â€” | Estado inicial estimado |
| 2026-11-12 | 1.2 (parcial, frontend) | AÃ±adido rol `sin_acceso` (sin pÃ¡ginas), bloqueo de navegaciÃ³n/cargas en background/home/estados/notas/refresco cuando el rol es `sin_acceso`, y pantalla â€œSin acceso autorizadoâ€. Requiere 1.1 en backend (GAS) para denegar/no degradar usuarios no reconocidos y devolver `sin_acceso`. | ~61% | â€” | Commit `f3e68e3`, desplegado en `v201`. Tests 357/357. |
| 2026-11-12 | 3.1 (avanzado, frontend) | Ampliada limpieza de datos locales en logout/cambio de usuario y aÃ±adidas restricciones de cachÃ©/hidrataciÃ³n por permisos de rol (`_cachePermitido`), evitando hidratar/persistir en cachÃ© listas no permitidas cuando el perfil estÃ¡ resuelto (con salvaguarda durante perfil pendiente). `loadLocal`/`saveLocal` ahora tambiÃ©n respetan permisos y eliminan claves locales no permitidas al persistir. Pendiente: minimizar alcance de datos cacheados en uso y ajustes finos de estrategia SW. | ~64% | â€” | Commits `37ce8e1` (`v202`), `6bae4b1` (`v203`), `7d15e75` (`v204`). Tests 357/357. |
| 2026-11-14 | 3.2 (frontend, dentro de lÃ­mites GitHub Pages) | CSP en `<meta>` endurecida y activada en modo **enforcement** (incluye `https://script.googleusercontent.com` en `connect-src`, `frame-src 'none'`, `worker-src 'self' blob:`). AÃ±adida `Permissions-Policy` restrictiva (`camera/microphone/geolocation/payment/usb` deshabilitados). Mantener verificaciÃ³n en producciÃ³n; GitHub Pages no permite cabeceras HTTP de seguridad. | ~66% | â€” | Commits `7d15e75` (`v204`), `684005f` (`v205`), `9811371` (`v206`). Tests 357/357. |
| 2026-11-14 | 3.1 (avanzado, frontend) | `responses` y `notas` pasan a cachÃ© solo en memoria (no persistidas en `gn_cache_*`) para reducir datos sensibles en disco local; se eliminan restos persistidos previos al acceder. | ~66% | â€” | Commit `9811371` (`v206`). |

> Actualizar esta tabla al completar cada hito, indicando evidencia (commit, captura/config, resultado de prueba o verificaciÃ³n en GAS/Firebase).


---

# Anexo: Instrucciones de configuración externa (consolidado)

# Instrucciones de configuraciÃ³n externa (fuera de este repositorio)

> GuÃ­a para aplicar los cambios de seguridad que **no se pueden hacer en este cÃ³digo/repo** y requieren configuraciÃ³n en **Google Apps Script (GAS/.gs)**, **Google Sheets**, **Firebase**, **GitHub** o la **web pÃºblica**.
>
> Contexto del proyecto: frontend en **GitHub Pages**, autenticaciÃ³n **Firebase (email/contraseÃ±a)**, backend en **Google Apps Script** (hojas de cÃ¡lculo), token de API en `?token=` (sin `Authorization` header por limitaciones CORS/preflight en GAS). No versionar secretos.

---

## 1) Google Apps Script (GAS / `.gs`) y Google Sheets â€” **prioridad crÃ­tica (Hitos 1.1, 1.3, 2.2, 4.1, 5.1)**

> La seguridad efectiva depende de que el backend valide identidad y permisos en **cada endpoint**. La UI del frontend ya no es suficiente.

### 1.1 DenegaciÃ³n por defecto y autorizaciÃ³n por endpoint (Hito 1.1, ~66%)
**Objetivo:** ningÃºn usuario no reconocido accede a datos; cada acciÃ³n se autoriza por rol/mÃ³dulo.

#### A. Endpoint `user-profile`
- Buscar al usuario en la hoja de Roles por email **normalizado**: `String(email || '').toLowerCase().trim()`.
- Si **no existe** o no estÃ¡ habilitado/activo en Roles:
  - Devolver explÃ­citamente acceso denegado, por ejemplo:  
    `{ "status": "ok", "data": { "email": "...", "role": "sin_acceso", "acceso": false } }`  
    (ajusta al contrato exacto que use tu frontend/backend, pero el rol efectivo debe ser `sin_acceso`).
  - **No** devolver `consulta`, `admin` ni un rol por defecto con acceso.
- Si existe y estÃ¡ autorizado: devolver su rol real (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`, etc.).
- Registrar en logs/auditorÃ­a (si aplica) intentos de perfiles no autorizados, sin exponer datos sensibles.

> Nota: el frontend (`v201+`) ya trata `sin_acceso` como bloqueo total (sin carga de datos y con pantalla â€œSin acceso autorizadoâ€).

#### B. AutorizaciÃ³n en **cada** endpoint/acciÃ³n (`doGet`, `doPost`, `action=...`)
Para **todas** las operaciones (lectura y escritura: `getAnimales`, `getAdopciones`, `create/update/delete*`, `upload*`, `historial-fases-adopcion`, `auditoria`, etc.):
1. **Validar identidad/token** de la peticiÃ³n (token en `?token=` y/o mecanismo que uses). Rechazar si falta o es invÃ¡lido.
2. **Resolver usuario y rol** (desde Roles/`user-profile` interno) con email normalizado.
3. **Comprobar permiso por mÃ³dulo y tipo de acciÃ³n** antes de ejecutar lÃ³gica o leer/escribir hojas. **Denegar por defecto**.
4. **Responder 403/denegado** (o tu formato de error estÃ¡ndar) cuando no haya permiso, sin filtrar datos.

**Matriz de referencia (alinear con frontend):**
- `admin`: acceso total.
- `coordinador`: lectura/escritura en encuestas, animales, acogidas, adopciones, socios, blacklist, reportes, actividad (segÃºn polÃ­tica).
- `voluntario`: acceso limitado (p. ej. animales, reportes, actividad) segÃºn definiciÃ³n.
- `tesoreria`: donaciones, almacÃ©n/inventario, animales/reportes/actividad segÃºn definiciÃ³n.
- `consulta` (autorizado, solo lectura): **mÃ­nimo** acordado `dashboard`/`animales` (ajustar endpoints para que no devuelvan datos de otros mÃ³dulos).
- `sin_acceso` / no reconocido: **ningÃºn acceso**.

> Importante: aunque el frontend ya restringe `consulta`, el backend debe imponerlo (un cliente puede llamar a la API directamente).

#### C. MinimizaciÃ³n de datos en respuestas
- Devolver solo campos necesarios por endpoint y rol.
- No volcar filas completas con datos sensibles/personales si no son necesarios (especialmente para `consulta` u otros roles limitados).

#### D. NormalizaciÃ³n y consistencia en Roles
- En la hoja de Roles: emails en minÃºsculas y sin espacios (o normalizar siempre en cÃ³digo).
- Coincidencia exacta del email normalizado. Evitar duplicados.

**Criterio de aceptaciÃ³n 1.1:** un usuario no presente en Roles no obtiene datos ni puede operar en ningÃºn endpoint; pruebas manuales por rol/mÃ³dulo (GET y POST) devuelven denegaciÃ³n correcta.

### 1.3 Higiene de cuentas y Roles (Hito 1.3, ~70%)
- Revisar y depurar la hoja de Roles: corregir emails errÃ³neos (p. ej. `82` vs `92`), asignar roles explÃ­citos, eliminar accesos innecesarios, aplicar mÃ­nimo privilegio.
- Mantener inventario de usuarios/roles actualizado.
- Tras cambiar un rol: el usuario debe cerrar sesiÃ³n y volver a entrar (o recargar) para refrescar `user-profile`.

### 2.2 Token de API y rotaciÃ³n (Hito 2.2, ~76%)
- **RotaciÃ³n:** si hay sospecha de exposiciÃ³n, generar un nuevo token en la configuraciÃ³n del script (PropertiesService/`CONFIG` segÃºn tu implementaciÃ³n). Las propiedades de script se leen en cada ejecuciÃ³n, asÃ­ que **no hace falta volver a implementar la web app**.
- **Actualizar despliegue frontend** de forma coordinada:
  - Actualizar secreto/variable en GitHub (ver secciÃ³n 4) y regenerar `src/js/config.js` en el flujo de build/despliegue.
  - No guardar el token en el repositorio.
- **Logs:** evitar registrar en `Logger.log`/ejecuciones la URL completa con `?token=` o parÃ¡metros sensibles.
- **Alcance:** usar el token con el mÃ­nimo alcance posible; si tu diseÃ±o lo permite, separar tokens por propÃ³sito.

### 4.1 Canal pÃºblico de solo lectura para la web externa (Hito 4.1, ~82%)
**Objetivo:** alimentar la nueva web sin exponer el API/token de administraciÃ³n.

- Crear un **endpoint/feed independiente** (acciÃ³n `doGet` dedicada, p. ej. `public-animales`, `public-eventos`, o despliegue separado) con acceso pÃºblico o token propio de solo lectura.
- **Lista blanca estricta** (solo campos publicables):
  - **Animales:** p. ej. `id/slug`, nombre, especie, raza, sexo, edad, tamaÃ±o, descripciÃ³n, estado pÃºblico permitido, foto/galerÃ­a pÃºblica, ubicaciÃ³n general (no direcciÃ³n). **Solo** estados que decidÃ¡is publicar (ej. `disponible`, `en_acogida`, y opcionalmente `adoptado` como escaparate).
  - **Eventos:** desde una fuente/hoja dedicada (p. ej. `Eventos`) con flag `publicado=true`, no desde `actividad` interna.
- **Excluir siempre:** adoptantes/solicitantes, acogidas, adopciones internas, contratos, documentos, gastos, donaciones, socios, blacklist, apadrinamientos, notas/historial/auditorÃ­a, datos mÃ©dicos o personales.
- **CORS:** permitir solo el origen de la web pÃºblica (o los necesarios). Responder JSON estable; considerar cachÃ©.
- **No reutilizar** el token del panel de administraciÃ³n.

### 5.1 AuditorÃ­a e historial operativos (Hito 5.1, ~83%)
- **Hoja `auditoria`:**
  - Fila 1 con cabeceras alineadas al script (mÃ­nimo viable recomendado):  
    `id`, `fecha`, `usuario`, `email`, `rol`, `accion`, `modulo`, `entidad`, `entidad_id`, `detalle`, `antes`, `despues`, `resultado`, `error`, `ip`, `user_agent`, `origen`
  - Verificar que `CONFIG.sheets.auditoria` (o equivalente) apunta a la pestaÃ±a correcta y que el cÃ³digo escribe/lee por esas cabeceras u orden esperado.
  - Probar una acciÃ³n que genere auditorÃ­a y confirmar en **Ejecuciones** de Apps Script que no hay errores y que se aÃ±ade la fila correcta.
- **Hoja `historial-fases-adopcion`:**
  - Fila 1 con cabeceras alineadas al script/frontend (recomendado):  
    `id`, `adopcion_id`, `fecha`, `usuario`, `accion`, `fase_origen`, `fase_destino`, `fase`, `nota`, `created_at`
  - Verificar `CONFIG`/ID de hoja y endpoints `historial-fases-adopcion` (GET/POST). Probar avance/retroceso/anulaciÃ³n/devoluciÃ³n/nota y confirmar persistencia y visualizaciÃ³n en la ficha.
- **Regla general:** datos desde la fila 2; fila 1 nunca vacÃ­a (evita fallos de mapeo lectura/escritura).

---

## 2) Firebase â€” autenticaciÃ³n y protecciÃ³n de login (Hito 2.1, ~74%)

> Se configura en la [Consola de Firebase](https://console.firebase.google.com/) (y, para algunas funciones, en Google Cloud / Identity Platform). Los pasos exactos pueden variar segÃºn el plan (Spark/Blaze) y la versiÃ³n de la consola.

### 2.1 RevisiÃ³n de polÃ­ticas y protecciÃ³n frente a abuso
1. **Authentication â†’ Settings / Usuarios:**
   - Revisar mÃ©todos de acceso habilitados (solo los necesarios: email/contraseÃ±a).
   - Verificar dominios autorizados (incluir el dominio de GitHub Pages y los usados en desarrollo si aplica).
2. **ProtecciÃ³n contra abuso / intentos fallidos:**
   - Firebase aplica ciertas protecciones automÃ¡ticas; revisa la configuraciÃ³n de protecciÃ³n y cuotas disponibles en tu proyecto.
   - Considerar lÃ­mites/alertas y revisiÃ³n periÃ³dica de actividad sospechosa.

### 2.2 MFA (autenticaciÃ³n multifactor) para administradores
1. **Authentication â†’ Sign-in method:** habilitar proveedores/factores de segundo paso soportados (p. ej. SMS o TOTP segÃºn disponibilidad y plan; TOTP suele ser preferible).
2. **Activar MFA** (puede requerir **Identity Platform** y plan de facturaciÃ³n en algunos casos):
   - Habilitar MFA en el proyecto y definir si es opcional u obligatorio por tipo de usuario.
   - Priorizar **cuentas `admin` y elevadas**.
3. **InscripciÃ³n de usuarios:** guiar a los administradores para registrar su segundo factor en el siguiente inicio de sesiÃ³n (segÃºn el flujo que habilites).
4. **VerificaciÃ³n:** probar login con cuenta admin y confirmar solicitud de segundo factor.

> Si MFA completo no estÃ¡ disponible en tu plan, aplica como mÃ­nimo contraseÃ±as robustas, revisiÃ³n de accesos y reCAPTCHA/App Check.

### 2.3 reCAPTCHA / App Check en el flujo de login
Hay dos enfoques complementarios (segÃºn disponibilidad):

#### OpciÃ³n A â€” ProtecciÃ³n reCAPTCHA en Firebase Authentication (recomendado si disponible)
- Algunas capacidades (p. ej. protecciÃ³n con reCAPTCHA Enterprise / Email enumeration protection / controles de riesgo) pueden requerir **Identity Platform**.
- Pasos generales:
  1. En **Google Cloud Console**, crear/configurar una clave de **reCAPTCHA Enterprise** para el dominio de la app (p. ej. `gn-admin.github.io`).
  2. En **Firebase Console â†’ Authentication â†’ Settings** (o secciÃ³n de protecciÃ³n/App Check segÃºn UI), habilitar la protecciÃ³n reCAPTCHA para el flujo de email/contraseÃ±a si estÃ¡ disponible.
  3. Asociar la clave/site key correspondiente y restringir dominios.
  4. Probar inicio de sesiÃ³n (usuarios legÃ­timos) y validar que no se degrada la experiencia.

#### OpciÃ³n B â€” Firebase App Check (protecciÃ³n de recursos/abuso de backend y SDKs)
- Ãštil para reducir uso abusivo desde clientes no verificados; la integraciÃ³n exacta con el login email/contraseÃ±a depende de las funciones habilitadas.
- Pasos generales:
  1. **Firebase Console â†’ App Check:** registrar la app web.
  2. Seleccionar proveedor (p. ej. **reCAPTCHA v3** o **reCAPTCHA Enterprise**) y crear/configurar la clave para tu dominio.
  3. Activar App Check para los servicios soportados que uses (Authentication/otros) segÃºn estÃ© disponible.
  4. Actualizar el frontend para inicializar App Check con el SDK de Firebase si es necesario (cambio en cÃ³digo; implica tocar `src/js/auth.js`/config y validar). **Coordinar antes de activar enforcement** para no bloquear usuarios.

> RecomendaciÃ³n prÃ¡ctica: empezar por **MFA para admins** y polÃ­ticas/revisiÃ³n de accesos; aÃ±adir reCAPTCHA/App Check cuando tengas la configuraciÃ³n y pruebas listas. Documentar lo activado y su plan asociado.

### 2.4 Buenas prÃ¡cticas de cuentas (operativo)
- ContraseÃ±as robustas y Ãºnicas para cuentas con privilegios.
- Revisar y deshabilitar cuentas que ya no deban tener acceso.
- Revisar periÃ³dicamente **Authentication â†’ Users** y registros de actividad.

---

## 3) Google Sheets â€” Roles y cabeceras (Hitos 1.1, 1.3, 5.1)

- **Hoja de Roles/Usuarios (usada por `user-profile`/`.gs`):**
  - Columnas con email y rol claros (p. ej. `email`, `rol`/`role`, `activo` si aplica).
  - Emails normalizados (minÃºsculas, sin espacios) y sin duplicados.
  - Solo usuarios autorizados; rol explÃ­cito (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`). Usuarios no presentes deben resultar en `sin_acceso` desde el backend.
- **Hoja `auditoria`:** fila 1 con cabeceras (ver 1 / 5.1). Datos desde fila 2.
- **Hoja `historial-fases-adopcion`:** fila 1 con cabeceras (ver 1 / 5.1). Datos desde fila 2.
- **Permisos de las hojas:** restringir acceso de ediciÃ³n/lectura en Google Sheets/Drive solo a quienes lo necesiten; el acceso operativo de la app debe ir vÃ­a GAS con permisos controlados.

---

## 4) GitHub (despliegue y secretos) â€” Hito 2.2 / operaciÃ³n

- **Secretos:** en el repositorio (Settings â†’ Secrets and variables â†’ Actions), mantener el token de API y configuraciÃ³n sensible como **Secrets** (no Variables planas si el repo es pÃºblico), y nunca commitear `.env` ni `src/js/config.js`.
- **RotaciÃ³n de token:** las propiedades de script (`GITHUB_DEPLOY_TOKEN`, `RECAPTCHA_SECRET`) se leen en cada ejecuciÃ³n, asÃ­ que rotarlas **no exige redespliegue**: se guarda el valor nuevo en Propiedades de la secuencia de comandos y se comprueba que funciona («Regenerar web» o la prueba de login). Solo si se rota un secreto que viaja al frontend (`RECAPTCHA_SITE_KEY`) hay que actualizarlo en GitHub y desplegar para regenerar `config.js`.
- **VerificaciÃ³n:** tras cambios, confirmar que la app desplegada funciona y que no se expone el token en el cÃ³digo publicado mÃ¡s allÃ¡ de lo imprescindible en runtime (teniendo en cuenta la limitaciÃ³n `?token=`).

---

## 5) Web pÃºblica (consumo de datos) â€” Hito 4.1

- Configurar la nueva web para consumir **solo** el endpoint/feed pÃºblico creado en GAS (o JSON estÃ¡tico exportado), nunca el API/token de administraciÃ³n.
- Usar HTTPS, restringir orÃ­genes CORS en el endpoint pÃºblico y cachear respuestas cuando sea posible.
- No mostrar ni almacenar datos no pÃºblicos; revisar que imÃ¡genes/enlaces sean pÃºblicos.

---

## 6) VerificaciÃ³n y operaciÃ³n continua (Hito 5.2)

- **Pruebas por rol (UI y API):** con cuentas `admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta` y un usuario **no autorizado/no presente en Roles**:
  - Comprobar acceso/denegaciÃ³n a pÃ¡ginas y acciones en la app.
  - Probar llamadas directas a endpoints GAS (lectura/escritura) y verificar denegaciÃ³n correcta.
- **Revisiones periÃ³dicas:** accesos en Firebase, ejecuciones/permisos en GAS, coherencia Rolesâ†”usuarios, vigencia de tokens.
- **Procedimiento ante incidente:** rotar token, revisar auditorÃ­a/ejecuciones, revocar accesos/cuentas comprometidas y corregir configuraciÃ³n de Roles.

---

## Resumen rÃ¡pido: quÃ© toca en `.gs`
- `user-profile`: devolver `sin_acceso` para no reconocidos + normalizar email.
- **Todos los endpoints:** validar token/identidad + autorizar por rol/mÃ³dulo/acciÃ³n + denegar por defecto + minimizar datos.
- Ajustar `CONFIG`/IDs de hojas (`auditoria`, `historial-fases-adopcion`) y mapeo de cabeceras.
- (Opcional/recomendado) endpoint pÃºblico separado para la web externa con lista blanca y sin token admin.
- Evitar loguear URLs con `?token=` y definir rotaciÃ³n de token.


---

# Anexo: Notas de seguridad - módulo web pública/gestor (consolidado)

# Notas de seguridad y privacidad â€” Web pÃºblica y gestor (separado)

> **Estado:** documento separado para evitar mezclar con el plan funcional del gestor web y los endpoints pÃºblicos. **De momento no aplicar** estos puntos como parte del plan de implementaciÃ³n del mÃ³dulo web; tratarlos como consideraciones/requisitos previos o paralelos cuando se aborde seguridad.
> **RelaciÃ³n:** complementa (no sustituye) `PLAN_SEGURIDAD.md` e `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`. Muchas medidas dependen de GAS/Sheets, Firebase y configuraciÃ³n externa.

---

## 1. SeparaciÃ³n de superficies y acceso
- El **gestor/admin** y la **web pÃºblica** son superficies distintas: la web pÃºblica no debe usar API/token de administraciÃ³n ni acceder a datos internos.
- **Gestor (endpoints de administraciÃ³n):** requieren identidad/autenticaciÃ³n y **autorizaciÃ³n por rol/mÃ³dulo en cada acciÃ³n** (denegaciÃ³n por defecto), coherente con el plan de seguridad del backend.
- **Canal pÃºblico:** solo lectura, sin token admin, con CORS restringido al/los dominios de la web pÃºblica.

## 2. CuraciÃ³n y lista blanca de datos (privacidad)
- Publicar Ãºnicamente contenido marcado como publicable y **solo campos permitidos** (lista blanca definida por tipo).
- **Ficha pÃºblica de animal:** excluir adoptantes/solicitantes, acogidas internas, contratos, documentos, gastos/donaciones, apadrinamientos, datos mÃ©dicos sensibles no aptos, direcciÃ³n exacta, notas internas, historial/auditorÃ­a e IDs internos correlables.
- El payload pÃºblico debe construirse **campo a campo en servidor** (nunca exponer la ficha interna completa). `preview` del gestor debe reflejar exactamente el payload pÃºblico.
- **404** para contenido no publicado/no existente (no revelar borradores).

## 3. ValidaciÃ³n y saneado
- Validar/sanitizar entradas del gestor: `slug` (formato/longitud/unicidad), textos/HTML permitido, URLs de media, tamaÃ±os y JSON (`icons/gallery/videos`).
- Respuestas de error pÃºblicas sin detalles internos.

## 4. SEO, URLs y contenido retirado
- Control de indexaciÃ³n por elemento (`index/noindex`, robots, canonical). GestiÃ³n de cambios de `slug` con redirects 301; 404/410 para retirados.
- No indexar parÃ¡metros auxiliares (p. ej. `?from=`).

## 5. Formularios y datos personales (si se abordan)
- `forms/submit` como canal separado del feed de publicaciones: verificaciÃ³n reCAPTCHA en servidor, validaciones/antiabuso, minimizaciÃ³n/retenciÃ³n de datos y envÃ­o seguro.
- Consentimiento previo para no esenciales y polÃ­ticas (cookies/privacidad) alineadas a tratamientos reales y terceros.

## 6. AuditorÃ­a y operaciÃ³n
- Registrar publicaciÃ³n/despublicaciÃ³n y cambios SEO relevantes cuando sea viable.
- Revisiones periÃ³dicas de respuestas pÃºblicas (muestreo de lista blanca) y de permisos de gestiÃ³n web.

## 7. Dependencias externas (no en este repo)
- AutorizaciÃ³n y controles en **Apps Script/Sheets**, configuraciÃ³n en **Firebase/reCAPTCHA** (si aplica), CORS/dominios de despliegue y rotaciÃ³n/gestiÃ³n de secretos segÃºn `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`.

