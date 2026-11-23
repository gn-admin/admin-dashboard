# Pendientes — Grupo Nebak (admin-dashboard y `main`)

> **Documento único de trabajo pendiente.** Lo entregado y verificado está en [`memory.md`](memory.md); el contrato del canal y del gestor, en [`GESTOR_WEB_PLAN_Y_ENDPOINTS.md`](GESTOR_WEB_PLAN_Y_ENDPOINTS.md).
> **Última actualización:** 2026-11-23.
> **Contenido íntegro, sin resumir:** las secciones 1, 2, 3, 4 y 7 reproducen completos `CHECKLIST_PRODUCCION_F0_F5.md`, `PLAN_SEGURIDAD.md` + `PRUEBAS_POR_ROL_D6.md`, `REQUISITOS_WEB_CANAL_PUBLICO.md`, `TRANSFERIR_A_MAIN.md` y `MEJORAS_UI_UX_PENDIENTES.md`. La sección 5 conserva el estado operativo completo de contratos y la 6 las decisiones abiertas. Los `[x]` se mantienen como contexto verificado; los `[ ]` son el trabajo pendiente.
> **Sin secretos:** URLs de ejecución, tokens, IDs de hojas y claves viven en `.internal-docs/` o en el entorno, nunca aquí.

## 0. Prioridad

| # | Tema | ¿Bloquea? | Dónde |
|---|---|---|---|
| 1 | Backend GAS actual | Sí | §1 (checklist) y §3 (requisitos) |
| 2 | Deploy automático a `main` | Sí | §1 y §4 |
| 3 | Verificación F0–F5 en producción | Sí | §1 |
| 4 | Seguridad y roles | No | §2 |
| 5 | Requisitos del canal público | No | §3 |
| 6 | Port y formularios en `main` | No | §4 |
| 7 | Contratos de adopción y acogida | No | §5 |
| 8 | Decisiones abiertas | No | §6 |
| 9 | UI/UX | No | §7 |

## 1. Verificación F0–F5 en producción

> **Origen:** `CHECKLIST_PRODUCCION_F0_F5.md` (retirado el 2026-11-23). Texto completo, sin resumir.
> **Estado actual:** las fases están cerradas en código local; falta la verificación funcional en producción y subir el lote actual de `.gs` con versión nueva. El checklist siguiente es el documento íntegro.

**Además del checklist original (operativo, 2026-11-23):**

- [ ] `CONTACTO_TELEFONO` en el `Config.gs` del despliegue para que `config-publica` no lo devuelva vacío.
- [ ] `DRIVE_WEB_FOLDER_ID` en el `Config.gs` desplegado: sin esa carpeta la media del gestor no tiene destino.

### Checklist de verificación en producción — plan F0–F5

> Las fases F0–F5 están **cerradas en código local**. Lo único que falta es validarlas
> sobre el entorno real (el lote actual de `.gs` sigue pendiente de subir con versión nueva).
> Contrato, grupos y plan: [`memory.md`](memory.md).
>
> **Sin secretos:** aquí se usan `<API_URL>` y `<token>`, que se toman del entorno
> (`.env`/config generada). No pegar valores reales en este documento ni en capturas.

#### 0. Antes de empezar

- [ ] `npm run build` con el `.env` de producción y la app servida desde el origen real
      (las rutas del front son relativas: `/admin-dashboard/`).
- [ ] Login con un usuario **admin/coordinador** real y con un usuario **sin permisos** para
      comprobar el 403 (los endpoints del gestor exigen token y rol).
- [ ] `GET <API_URL>?endpoint=web-deploy-estado` → responde `version` y el deploy está
      configurado; en el gestor se ve el chip «Deploy automático activo · repo (main)».
- [ ] Columnas aditivas presentes (el backend las crea al vuelo, confirma en el diagnóstico
      del resumen): `WebPublicaciones` → `ficha_json`, `documents_json`, `media_folder_id`,
      `origen_tipo`; `Animales` → `portada_url`, `portada_alt`, `galeria`, `videos`,
      `documentos_internos`.
- [ ] Preparado **contenido de prueba** (un animal con grupo obligatorio, un animal suelto y
      un evento/historia) con slugs que no existan ya en la web pública.
- [ ] Anotar la hora de inicio: cada publicación dispara deploy y la estática tarda **2–4 min**.

#### F0 — Contrato 1:1 + grupos

- [ ] `GET ?endpoint=publicaciones` no incluye `borrador` ni `oculto`; sí lo publicado.
- [ ] El listado **no** trae `ficha` (solo detalle, preview y prerender la llevan).
- [ ] Un animal con estado interno `disponible` sale como `en_adopcion`; `en_acogida`,
      `reservado`, `adoptado` y `cerrado` se corresponden con la tabla del contrato.
- [ ] `urgente` llega como bandera `urgent` (nunca como estado) y se pinta en el badge.
- [ ] Con `estado_publico_modo = manual`, el override manda; en `auto`, se deriva del estado
      interno del animal.
- [ ] Un animal `fallecido` no se puede publicar (error legible en el gestor y en el backend).

#### F1 — UX y flujos

- [ ] Pestañas **Animales / Grupos / Eventos e historias** con contadores correctos.
- [ ] «Publicar animal» abre el selector solo con animales sin publicación; «Publicar grupo»
      solo con grupos `grupo_obligatorio` sin publicación vigente.
- [ ] Formulario de animal: datos heredados en **solo lectura**, portada heredada visible,
      slug con check y historial, media, presentación (C3) y SEO.
- [ ] Formulario de grupo: miembros en solo lectura con agregados (estado, urgente, salud,
      portada/especie/categoría) y aviso de conflicto si algún miembro tiene publicación
      individual viva.
- [ ] Acciones visibles por estado: publicar / ocultar / retirar / restaurar / eliminar
      borrador, sin ofrecer acciones imposibles (p. ej. publicar una retirada).
- [ ] Responsive real en **360, 768 y 1280**: sin scroll horizontal, tablas en tarjetas,
      botones con diana ≥44 px y menú accesible con teclado.

#### F2 — Composición, whitelist y estados

- [ ] `GET ?endpoint=publicacion&slug=<slug>` de un animal: sin IDs internos, sin microchip,
      sin documentos privados, sin datos de la familia; contacto público por defecto.
- [ ] `preview` del gestor y `detalle` público devuelven **el mismo** contenido (mismos
      campos y mismos valores derivados).
- [ ] Cambiar el estado interno del animal (a `adoptado`, por ejemplo) y recargar el canal
      **sin republicar**: el estado público y el bloque agregado se recalculan.
- [ ] Marcar el animal como urgente y comprobar badge y orden en el listado.
- [ ] Ocultar → el slug desaparece del feed; publicar de nuevo → vuelve.
- [ ] Retirar (410) → `status: "gone"`, aparece en `?endpoint=retiradas` y el slug queda
      reservado (no se puede reutilizar en otra publicación). Restaurar → vuelve a `borrador`
      conservando el slug.
- [ ] HTML guardado con `<script>`, `onclick` o `javascript:` sale **limpio** en `contentHtml`.

#### F3 — Modelo de datos, persistencia y media

- [ ] Guardar un animal con documentos: van a `documents_json` (no a `media_json`) y **no**
      aparecen en el payload público en ningún nivel.
- [ ] Crear publicación desde animal: se pre-rellenan portada/galería/vídeos de la ficha
      interna y el formulario deja editar sin tocar la ficha salvo que se marque propagar.
- [ ] Propagación **opt-in** apagada por defecto: guardar sin marcar no modifica la ficha del
      animal; al marcarla, reutiliza los mismos `fileId` (no duplica archivos en Drive).
- [ ] Subida de media (`web-media-subir`): la carpeta de la ficha existe una sola vez y el
      archivo aparece con nombre `<tipo>-<original>-<uuid>`.
- [ ] Pegar un enlace de Drive: fichero → se normaliza (thumbnail/vista); enlace de carpeta →
      se rechaza con aviso.
- [ ] Borrar media (`web-media-eliminar`): el archivo va a la papelera y el campo se limpia.
- [ ] Guardar dos veces la misma publicación no duplica filas ni campos (idempotente).

#### F4 — Grupos (adopción conjunta)

- [ ] Crear publicación de grupo desde un grupo `grupo_obligatorio` con 2+ miembros: aparece
      en la pestaña **Grupos** con su completitud.
- [ ] Derivación agregada: todos `disponible` → `en_adopcion`; disponible + acogida →
      `en_acogida`; algún `reservado` → `reservado`; todos `adoptado` → `adoptado`;
      mezcla inválida / algún `fallecido` → `cerrado` y **no publicable** (con motivo).
- [ ] `urgent` de grupo = sí si algún miembro es prioritario.
- [ ] **Exclusividad:** con el grupo publicado vigente no se puede publicar una ficha
      individual de un miembro; si ya existía, el gestor avisa y la resuelve al activar el grupo.
- [ ] Detalle y estática del grupo muestran el bloque de miembros (nombres y datos públicos,
      sin IDs ni documentos) y el enlace «Quiero adoptar» correcto.
- [ ] Ciclo completo del grupo: publicar → aparece en feed/sitemap/estática con canónica
      `publicaciones/<slug>.html`; ocultar → sale; retirar → 410 + lápida; restaurar →
      `borrador` con el mismo slug.
- [ ] Una sola publicación por grupo (no se puede crear una segunda).

#### F5 — Endurecimiento y QA final

- [ ] `sitemap.xml` incluye solo fichas indexables y **no** las lápidas ni las redirecciones.
- [ ] `robots.txt` apunta al sitemap y permite `/publico.html` y `/publicaciones/`.
- [ ] `publicaciones/index.json` lista los slugs generados; el visor no declara canónica a una
      estática que aún no existe (espera el deploy, 2–4 min).
- [ ] Redirección 301 de un slug histórico: página de paso `noindex,follow` con canónica al
      destino y `Location` 301 en el canal.
- [ ] SEO de una ficha: `title`, `description`, `canonical` **único**, OG/Twitter, un solo
      bloque JSON-LD válido y `mainEntityOfPage` = canónica.
- [ ] Compartir: en el visor y en la estática, «Compartir» copia la URL canónica y muestra
      «Enlace copiado»; en el gestor, «Copiar enlace» solo en publicadas con slug.
- [ ] Lector de pantalla (NVDA o VoiceOver): el aviso se anuncia sin mover el foco; con el
      aviso vacío no queda hueco entre los botones.
- [ ] Regresión 1:1 y grupos a 360/768/1280 sobre el entorno real, incluido el visor público y
      una página estática.
- [ ] Sin errores nuevos en consola ni en la pestaña de red (404 de imágenes o `index.json`
      antes del primer deploy pueden ser esperados; anotarlos).

#### Móvil y tablet — toda la gestión, no solo mirarla

El gestor es una PWA: no hay ninguna función que exija escritorio. Repetir estas
comprobaciones en **tablet (768–1024, vertical y horizontal)** y en **móvil
(360–430)** con las acciones reales, al menos una vez por cada fase de arriba.

- [ ] Navegación completa: menú lateral / «Más» y barra inferior llegan a todas
      las páginas del rol, marcan la activa y no dejan nada inalcanzable por falta
      de sitio en la barra.
- [ ] Login y cierre de sesión tecleando en el móvil; al enfocar un campo el
      teclado no lo tapa (formularios con scroll suficiente).
- [ ] Animales: abrir ficha, editar y guardar; el formulario largo se recorre sin
      saltos, `details` desplegables incluidos.
- [ ] Publicaciones: crear / editar / preview / publicar / ocultar / retirar /
      restaurar / eliminar desde las tarjetas de fila, sin scroll horizontal.
- [ ] Grupos: crear, editar (miembros en solo lectura), preview, publicar y
      retirar desde el dispositivo.
- [ ] Media: subir portada y galería desde cámara o galería del dispositivo, ver
      el chip del archivo y borrarlo con «×».
- [ ] Selector «Publicar animal» / «Publicar grupo»: buscar, seleccionar y crear
      con el teclado abierto, sin quedarse sin ver la lista.
- [ ] Snackbar: se lee entero, aparece **por encima de la barra inferior** (con
      *safe area*), no tapa acciones y se anuncia al lector de pantalla.
- [ ] Modales, preview y confirmaciones: cabecera y botones alcanzables con el
      pulgar, cierre visible y foco de vuelta al botón que los abrió.
- [ ] Tablas convertidas en tarjetas: no se pierde ningún dato (estado, slug,
      completitud, acciones) ni aparece scroll lateral.
- [ ] Zonas táctiles ≥44 px en pestañas, menú y acciones principales; las acciones
      secundarias de fila (`.btn-sm`, ~36–40 px) cumplen al menos el mínimo AA de
      24 px y no se solapan entre sí.
- [ ] Girar el dispositivo en mitad de un formulario no pierde lo escrito.

#### Cierre

- [ ] Limpieza del contenido de prueba (retirar u ocultar y eliminar borradores) y volver a
      desplegar para que no queden lápidas de prueba.
- [ ] Anotar en `memory.md` el resultado y, si algo falla, abrir incidencia con: endpoint,
      payload (sin datos personales), hora y slug.

| Fecha | Entorno | Fases | Resultado | Notas |
|---|---|---|---|---|
|  | producción |  |  |  |

## 2. Seguridad y roles

> **Origen:** `PLAN_SEGURIDAD.md` y `PRUEBAS_POR_ROL_D6.md` (retirados el 2026-11-23). Texto completo, sin resumir.
> **Estado actual:** D1/D2/D4/D6/D7 cerrados en lo verificable; D3 (inspección visual) y D5 (reCAPTCHA v3) pendientes; MFA/App Check es mejora futura. El plan y el procedimiento siguientes son los documentos íntegros.

### Plan de seguridad — Admin Dashboard (Grupo Nebak)

> **Objetivo:** elevar la postura de seguridad del proyecto desde un estado estimado **~60%** hasta **80–85%** (objetivo recomendado) dentro de las limitaciones del stack: **GitHub Pages (repo/app pública, sin cabeceras HTTP de servidor)** + **Firebase Auth** + **Google Apps Script (GAS)** + hojas de cálculo.
>
> **Nota:** los porcentajes son **estimaciones orientativas** (no métricas absolutas). La seguridad efectiva depende en gran medida del backend (GAS/Firebase/hojas), no totalmente auditable desde este repositorio. El máximo práctico en este stack se estima en **~85–90%**.
>
> **Restricciones vigentes:** no versionar secretos; token de API en `?token=` (sin preflight/CORS completo en GAS); CSP solo vía `<meta>` en GitHub Pages; rutas relativas; backend como fuente de verdad de permisos.

---

#### Línea base (estimada): ~60%

**Supuestos del estado actual (resumen):**
- Autenticación con Firebase (email/contraseña); perfil/rol obtenido de `user-profile` (GAS).
- Control de permisos por rol en frontend; fallback no admin (`consulta`); `consulta` reducido a `dashboard` y `animales` (solo lectura) y sin edición.
- Secretos fuera de git (`.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`).
- Caché de datos en `localStorage` y Service Worker; token de API en URL; CSP por `<meta>`.
- Auditoría/historial dependientes de configuración correcta en GAS/hojas (cabeceras añadidas en hojas, validar operación real).

**Principales brechas:** autorización y validación no verificables en GAS, usuarios no reconocidos sin bloqueo explícito en backend, exposición potencial del token en URL, datos residuales en cliente, ausencia confirmada de MFA/reCAPTCHA/App Check, ausencia de canal público separado para consumo externo.

---

#### Hoja de ruta (cambios y % alcanzado)

Cada hito indica el **% estimado alcanzado tras completarlo** (acumulado). Completar un hito implica su verificación/aceptación.

##### Fase 0 — Preparación y baseline (sin cambio de % de seguridad, habilita el plan)
- **Acciones**
  - Inventariar: endpoints GAS en uso, hojas/IDs, roles actuales, cuentas admin, dónde se genera/usa el token de API, datos cacheados (`gn_*`, `gn_cache_*`) y flujos sensibles (adopciones, socios, blacklist, donaciones, documentos).
  - Definir matriz de permisos objetivo (por rol y módulo: leer/escribir) y política para “usuario no reconocido”.
  - Establecer checklist de verificación (frontend, GAS, Firebase, hojas) y responsable por hito.
- **Dónde:** documentación operativa interna (no versionada) + este plan.
- **Criterio de aceptación:** inventario y matriz aprobados; responsables asignados.
- **% alcanzado tras Fase 0:** **~60%** (línea base)

---

##### Fase 1 — Control de acceso: mínimo privilegio y denegación por defecto
**Objetivo:** que ningún usuario no autorizado vea datos internos; que los autorizados vean solo lo necesario.

1. **1.1 Backend (GAS) — rol explícito para no reconocidos y autorización por endpoint** *(externo, crítico)*
   - `user-profile`: si el email no existe/no está habilitado en Roles, devolver estado/rol `sin_acceso` (o error controlado) — no degradar a `consulta`.
   - En **cada endpoint**: validar identidad/token y comprobar permiso por módulo/acción (lectura/escritura) según rol; denegar por defecto.
   - Normalizar emails en Roles (minúsculas, trim) y coincidencia exacta para evitar errores de mapeo.
   - **Criterio:** usuario no presente en Roles no obtiene datos ni puede operar; pruebas por rol/módulo en endpoints sensibles.
   - **% alcanzado:** **~66%**

2. **1.2 Frontend — rol `sin_acceso` y bloqueo de navegación/carga** *(repo)*
   - Añadir rol `sin_acceso` en `_paginasPorRol` (sin acceso a módulos/datos) y `puedeEditar` (false); mostrar pantalla clara “Sin acceso / perfil no autorizado”.
   - Asegurar que, con `sin_acceso` o sin perfil válido, no se disparen cargas de listas/datos (`_loadList`, cargas en background/home) ni se rendericen vistas con datos.
   - Mantener `consulta` mínimo (`dashboard`, `animales`, solo lectura) solo para usuarios explícitamente autorizados.
   - **Criterio:** cuenta no autorizada autenticada en Firebase no ve listados ni detalles internos; `consulta` autorizado ve solo lo mínimo.
   - **% alcanzado:** **~68%**

3. **1.3 Higiene de cuentas y Roles** *(operativo + hojas/GAS)*
   - Revisar/depurar hoja de Roles (altas/bajas, emails correctos), eliminar accesos innecesarios, principio de mínimo privilegio por persona.
   - Verificar que cambios de rol se reflejan tras re-login/recarga.
   - **Criterio:** inventario de usuarios/roles actualizado y validado.
   - **% alcanzado:** **~70%**

---

##### Fase 2 — Protección de credenciales y acceso al API
**Objetivo:** reducir riesgo de abuso de cuentas y exposición del token.

4. **2.1 Endurecer login (Firebase)** *(configuración Firebase, externo)*
   - Revisar políticas de Firebase Auth (protección ante intentos abusivos/bloqueos).
   - Habilitar **MFA/2FA** para cuentas administrativas (prioritario) y cuentas con permisos elevados.
   - Evaluar/activar **reCAPTCHA/App Check** en el flujo de autenticación si el plan/configuración lo permite (equilibrar seguridad/UX).
   - **Criterio:** admins con MFA activo; protección frente a automatización habilitada o justificada.
   - **% alcanzado:** **~74%**

5. **2.2 Gestión y exposición del token de API** *(GAS/operativo + revisión frontend)*
   - Rotar el token de API si existe sospecha de exposición; definir procedimiento de rotación segura (secretos/entorno, no en git).
   - Minimizar exposición: evitar registrar la URL completa con `?token=` en logs propios, no incluir token en mensajes/telemetría; revisar que no se filtre por `Referer` desde contextos controlables.
   - Confirmar que el token se usa solo donde es imprescindible y con alcance mínimo (si GAS lo soporta, separar tokens por propósito).
   - **Criterio:** token rotado/documentado el procedimiento; sin fugas conocidas en código/logs del repo.
   - **% alcanzado:** **~76%**

---

##### Fase 3 — Minimización de datos y endurecimiento del cliente
**Objetivo:** reducir el impacto ante acceso al dispositivo/navegador o exposición de datos.

6. **3.1 Minimizar y proteger caché en cliente** *(repo)*
   - Revisar qué se guarda en `localStorage` y caché del SW (`gn_cache_*`, listas, respuestas): almacenar solo lo necesario para funcionamiento/offline previsto.
   - Asegurar limpieza completa de datos de usuario al **logout** y al **cambio de cuenta** (ya existe base; auditar coberturas, incluidos `gn_cache_*` y estados).
   - Evitar cachear en SW respuestas con datos sensibles/dinámicos si no es necesario; ajustar estrategia de caché (p. ej. network-first para datos, cache de assets estáticos).
   - **Criterio:** tras logout/cambio de usuario no quedan datos de la cuenta anterior; caché limitado a lo imprescindible.
   - **% alcanzado:** **~78%**

7. **3.2 Superficie y hardening frontend** *(repo, dentro de límites de GitHub Pages)*
   - Mantener y revisar CSP en `<meta>` (mínimos permisos necesarios para scripts/estilos/fuentes/conexiones).
   - Revisar dependencias/cargas externas (CDNs), uso de `defer`/carga controlada y evitar exponer información sensible en UI/mensajes de error.
   - No incluir datos sensibles en URLs/hash más allá de lo necesario; revisar manejo de errores para no filtrar detalles internos.
   - **Criterio:** CSP coherente con el funcionamiento; sin filtraciones innecesarias en cliente.
   - **% alcanzado:** **~79%**

---

##### Fase 4 — Separación de superficies y exposición pública controlada
**Objetivo:** poder alimentar la web pública sin exponer el API/admin interno.

8. **4.1 Canal público de solo lectura (para web externa)** *(GAS + nueva web, externo)*
   - Crear endpoint/feed **público y separado** (o exportación estática periódica) con **lista blanca** de campos y solo registros/estados publicables (p. ej. fichas de animales públicas, eventos publicados).
   - Nunca reutilizar el token/API de administración; sin datos personales/sensibles (adoptantes, documentos, contratos, gastos, notas internas, etc.).
   - Aplicar CORS para el dominio público, caché y, si es dinámico, límites de uso razonables.
   - **Criterio:** la web pública consume solo el canal público; imposible obtener datos internos desde ese canal.
   - **% alcanzado:** **~82%**

---

##### Fase 5 — Trazabilidad, verificación y operación continua
**Objetivo:** detectar incidentes, validar controles y sostener el nivel alcanzado.

9. **5.1 Auditoría e historial operativos** *(GAS/hojas + verificación, externo)*
   - Verificar que `auditoria` (cabeceras mínimas ya definidas) e `historial-fases-adopcion` registran y leen correctamente en producción (endpoints, IDs de hoja, permisos de ejecución).
   - Asegurar que eventos críticos quedan trazados (altas/bajas/cambios de rol, cambios de fase, anulaciones/devoluciones, accesos relevantes si aplica).
   - **Criterio:** registros correctos visibles y consultables; sin errores en ejecuciones de GAS.
   - **% alcanzado:** **~83%**

10. **5.2 Pruebas de seguridad y revisión periódica** *(operativo + repo)*
    - Pruebas por rol (incluido `sin_acceso` y `consulta`): acceso/denegación en UI y, sobre todo, en **endpoints GAS**.
    - Revisión periódica: accesos Firebase/GAS, rotación de credenciales cuando proceda, dependencias, y coherencia Rolesâ†”usuarios.
    - Documentar procedimiento de respuesta ante sospecha de exposición (rotar token, revisar logs/auditoría, revocar accesos).
    - **Criterio:** checklist de pruebas pasado; calendario/procedimiento de revisión definido.
    - **% alcanzado:** **~84–85%**

---

#### Resumen de progresión (estimada)

| Hito | Cambio principal | % alcanzado |
|---|---|---:|
| Base | Estado actual | ~60% |
| 1.1 | Autorización por defecto en GAS + `sin_acceso` en backend | ~66% |
| 1.2 | `sin_acceso` y bloqueo de datos en frontend | ~68% |
| 1.3 | Higiene de cuentas/Roles | ~70% |
| 2.1 | MFA/admins + endurecimiento login Firebase (reCAPTCHA/App Check si aplica) | ~74% |
| 2.2 | Gestión/rotación y mínima exposición del token API | ~76% |
| 3.1 | Minimización/limpieza de caché en cliente | ~78% |
| 3.2 | Hardening frontend (CSP/deps/errores) | ~79% |
| 4.1 | Canal público separado de solo lectura | ~82% |
| 5.1 | Auditoría/historial verificados en producción | ~83% |
| 5.2 | Pruebas, revisión periódica y procedimiento de respuesta | ~84–85% |

> **Objetivo recomendado:** **80–85%**. Alcanzar ~85–90% requeriría controles adicionales difíciles en este stack (p. ej. cabeceras de seguridad gestionadas en servidor/proxy propio, reducción mayor de exposición del token/arquitectura de API), con coste y cambios estructurales mayores.

---

#### Clasificación por ámbito (para ejecución)

- **Repositorio (este proyecto):** 1.2, 3.1, 3.2 (y apoyo a 5.2 con pruebas).
- **GAS / Hojas / Backend (externo):** 1.1, parte de 1.3, 2.2 (lado servidor/token), 4.1, 5.1.
- **Firebase (configuración):** 2.1.
- **Operativo/procesos:** 0, 1.3, 2.2 (rotación/procedimiento), 5.2.

#### Registro de avance

| Fecha | Hito(s) | Cambio realizado | % alcanzado | Responsable | Evidencia/Notas |
|---|---|---|---:|---|---|
| — | Base | Línea base documentada | ~60% | — | Estado inicial estimado |
| 2026-11-12 | 1.2 (parcial, frontend) | Añadido rol `sin_acceso` (sin páginas), bloqueo de navegación/cargas en background/home/estados/notas/refresco cuando el rol es `sin_acceso`, y pantalla “Sin acceso autorizado”. Requiere 1.1 en backend (GAS) para denegar/no degradar usuarios no reconocidos y devolver `sin_acceso`. | ~61% | — | Commit `f3e68e3`, desplegado en `v201`. Tests 357/357. |
| 2026-11-12 | 3.1 (avanzado, frontend) | Ampliada limpieza de datos locales en logout/cambio de usuario y añadidas restricciones de caché/hidratación por permisos de rol (`_cachePermitido`), evitando hidratar/persistir en caché listas no permitidas cuando el perfil está resuelto (con salvaguarda durante perfil pendiente). `loadLocal`/`saveLocal` ahora también respetan permisos y eliminan claves locales no permitidas al persistir. Pendiente: minimizar alcance de datos cacheados en uso y ajustes finos de estrategia SW. | ~64% | — | Commits `37ce8e1` (`v202`), `6bae4b1` (`v203`), `7d15e75` (`v204`). Tests 357/357. |
| 2026-11-14 | 3.2 (frontend, dentro de límites GitHub Pages) | CSP en `<meta>` endurecida y activada en modo **enforcement** (incluye `https://script.googleusercontent.com` en `connect-src`, `frame-src 'none'`, `worker-src 'self' blob:`). Añadida `Permissions-Policy` restrictiva (`camera/microphone/geolocation/payment/usb` deshabilitados). Mantener verificación en producción; GitHub Pages no permite cabeceras HTTP de seguridad. | ~66% | — | Commits `7d15e75` (`v204`), `684005f` (`v205`), `9811371` (`v206`). Tests 357/357. |
| 2026-11-14 | 3.1 (avanzado, frontend) | `responses` y `notas` pasan a caché solo en memoria (no persistidas en `gn_cache_*`) para reducir datos sensibles en disco local; se eliminan restos persistidos previos al acceder. | ~66% | — | Commit `9811371` (`v206`). |

> Actualizar esta tabla al completar cada hito, indicando evidencia (commit, captura/config, resultado de prueba o verificación en GAS/Firebase).

---

### Anexo: Instrucciones de configuración externa (consolidado)

### Instrucciones de configuración externa (fuera de este repositorio)

> Guía para aplicar los cambios de seguridad que **no se pueden hacer en este código/repo** y requieren configuración en **Google Apps Script (GAS/.gs)**, **Google Sheets**, **Firebase**, **GitHub** o la **web pública**.
>
> Contexto del proyecto: frontend en **GitHub Pages**, autenticación **Firebase (email/contraseña)**, backend en **Google Apps Script** (hojas de cálculo), token de API en `?token=` (sin `Authorization` header por limitaciones CORS/preflight en GAS). No versionar secretos.

---

#### 1) Google Apps Script (GAS / `.gs`) y Google Sheets — **prioridad crítica (Hitos 1.1, 1.3, 2.2, 4.1, 5.1)**

> La seguridad efectiva depende de que el backend valide identidad y permisos en **cada endpoint**. La UI del frontend ya no es suficiente.

##### 1.1 Denegación por defecto y autorización por endpoint (Hito 1.1, ~66%)
**Objetivo:** ningún usuario no reconocido accede a datos; cada acción se autoriza por rol/módulo.

###### A. Endpoint `user-profile`
- Buscar al usuario en la hoja de Roles por email **normalizado**: `String(email || '').toLowerCase().trim()`.
- Si **no existe** o no está habilitado/activo en Roles:
  - Devolver explícitamente acceso denegado, por ejemplo:
    `{ "status": "ok", "data": { "email": "...", "role": "sin_acceso", "acceso": false } }`
    (ajusta al contrato exacto que use tu frontend/backend, pero el rol efectivo debe ser `sin_acceso`).
  - **No** devolver `consulta`, `admin` ni un rol por defecto con acceso.
- Si existe y está autorizado: devolver su rol real (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`, etc.).
- Registrar en logs/auditoría (si aplica) intentos de perfiles no autorizados, sin exponer datos sensibles.

> Nota: el frontend (`v201+`) ya trata `sin_acceso` como bloqueo total (sin carga de datos y con pantalla “Sin acceso autorizado”).

###### B. Autorización en **cada** endpoint/acción (`doGet`, `doPost`, `action=...`)
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

###### C. Minimización de datos en respuestas
- Devolver solo campos necesarios por endpoint y rol.
- No volcar filas completas con datos sensibles/personales si no son necesarios (especialmente para `consulta` u otros roles limitados).

###### D. Normalización y consistencia en Roles
- En la hoja de Roles: emails en minúsculas y sin espacios (o normalizar siempre en código).
- Coincidencia exacta del email normalizado. Evitar duplicados.

**Criterio de aceptación 1.1:** un usuario no presente en Roles no obtiene datos ni puede operar en ningún endpoint; pruebas manuales por rol/módulo (GET y POST) devuelven denegación correcta.

##### 1.3 Higiene de cuentas y Roles (Hito 1.3, ~70%)
- Revisar y depurar la hoja de Roles: corregir emails erróneos (p. ej. `82` vs `92`), asignar roles explícitos, eliminar accesos innecesarios, aplicar mínimo privilegio.
- Mantener inventario de usuarios/roles actualizado.
- Tras cambiar un rol: el usuario debe cerrar sesión y volver a entrar (o recargar) para refrescar `user-profile`.

##### 2.2 Token de API y rotación (Hito 2.2, ~76%)
- **Rotación:** si hay sospecha de exposición, generar un nuevo token en la configuración del script (PropertiesService/`CONFIG` según tu implementación). Las propiedades de script se leen en cada ejecución, así que **no hace falta volver a implementar la web app**.
- **Actualizar despliegue frontend** de forma coordinada:
  - Actualizar secreto/variable en GitHub (ver sección 4) y regenerar `src/js/config.js` en el flujo de build/despliegue.
  - No guardar el token en el repositorio.
- **Logs:** evitar registrar en `Logger.log`/ejecuciones la URL completa con `?token=` o parámetros sensibles.
- **Alcance:** usar el token con el mínimo alcance posible; si tu diseño lo permite, separar tokens por propósito.

##### 4.1 Canal público de solo lectura para la web externa (Hito 4.1, ~82%)
**Objetivo:** alimentar la nueva web sin exponer el API/token de administración.

- Crear un **endpoint/feed independiente** (acción `doGet` dedicada, p. ej. `public-animales`, `public-eventos`, o despliegue separado) con acceso público o token propio de solo lectura.
- **Lista blanca estricta** (solo campos publicables):
  - **Animales:** p. ej. `id/slug`, nombre, especie, raza, sexo, edad, tamaño, descripción, estado público permitido, foto/galería pública, ubicación general (no dirección). **Solo** estados que decidáis publicar (ej. `disponible`, `en_acogida`, y opcionalmente `adoptado` como escaparate).
  - **Eventos:** desde una fuente/hoja dedicada (p. ej. `Eventos`) con flag `publicado=true`, no desde `actividad` interna.
- **Excluir siempre:** adoptantes/solicitantes, acogidas, adopciones internas, contratos, documentos, gastos, donaciones, socios, blacklist, apadrinamientos, notas/historial/auditoría, datos médicos o personales.
- **CORS:** permitir solo el origen de la web pública (o los necesarios). Responder JSON estable; considerar caché.
- **No reutilizar** el token del panel de administración.

##### 5.1 Auditoría e historial operativos (Hito 5.1, ~83%)
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

#### 2) Firebase — autenticación y protección de login (Hito 2.1, ~74%)

> Se configura en la [Consola de Firebase](https://console.firebase.google.com/) (y, para algunas funciones, en Google Cloud / Identity Platform). Los pasos exactos pueden variar según el plan (Spark/Blaze) y la versión de la consola.

##### 2.1 Revisión de políticas y protección frente a abuso
1. **Authentication â†’ Settings / Usuarios:**
   - Revisar métodos de acceso habilitados (solo los necesarios: email/contraseña).
   - Verificar dominios autorizados (incluir el dominio de GitHub Pages y los usados en desarrollo si aplica).
2. **Protección contra abuso / intentos fallidos:**
   - Firebase aplica ciertas protecciones automáticas; revisa la configuración de protección y cuotas disponibles en tu proyecto.
   - Considerar límites/alertas y revisión periódica de actividad sospechosa.

##### 2.2 MFA (autenticación multifactor) para administradores
1. **Authentication â†’ Sign-in method:** habilitar proveedores/factores de segundo paso soportados (p. ej. SMS o TOTP según disponibilidad y plan; TOTP suele ser preferible).
2. **Activar MFA** (puede requerir **Identity Platform** y plan de facturación en algunos casos):
   - Habilitar MFA en el proyecto y definir si es opcional u obligatorio por tipo de usuario.
   - Priorizar **cuentas `admin` y elevadas**.
3. **Inscripción de usuarios:** guiar a los administradores para registrar su segundo factor en el siguiente inicio de sesión (según el flujo que habilites).
4. **Verificación:** probar login con cuenta admin y confirmar solicitud de segundo factor.

> Si MFA completo no está disponible en tu plan, aplica como mínimo contraseñas robustas, revisión de accesos y reCAPTCHA/App Check.

##### 2.3 reCAPTCHA / App Check en el flujo de login
Hay dos enfoques complementarios (según disponibilidad):

###### Opción A — Protección reCAPTCHA en Firebase Authentication (recomendado si disponible)
- Algunas capacidades (p. ej. protección con reCAPTCHA Enterprise / Email enumeration protection / controles de riesgo) pueden requerir **Identity Platform**.
- Pasos generales:
  1. En **Google Cloud Console**, crear/configurar una clave de **reCAPTCHA Enterprise** para el dominio de la app (p. ej. `gn-admin.github.io`).
  2. En **Firebase Console â†’ Authentication â†’ Settings** (o sección de protección/App Check según UI), habilitar la protección reCAPTCHA para el flujo de email/contraseña si está disponible.
  3. Asociar la clave/site key correspondiente y restringir dominios.
  4. Probar inicio de sesión (usuarios legítimos) y validar que no se degrada la experiencia.

###### Opción B — Firebase App Check (protección de recursos/abuso de backend y SDKs)
- Útil para reducir uso abusivo desde clientes no verificados; la integración exacta con el login email/contraseña depende de las funciones habilitadas.
- Pasos generales:
  1. **Firebase Console â†’ App Check:** registrar la app web.
  2. Seleccionar proveedor (p. ej. **reCAPTCHA v3** o **reCAPTCHA Enterprise**) y crear/configurar la clave para tu dominio.
  3. Activar App Check para los servicios soportados que uses (Authentication/otros) según esté disponible.
  4. Actualizar el frontend para inicializar App Check con el SDK de Firebase si es necesario (cambio en código; implica tocar `src/js/auth.js`/config y validar). **Coordinar antes de activar enforcement** para no bloquear usuarios.

> Recomendación práctica: empezar por **MFA para admins** y políticas/revisión de accesos; añadir reCAPTCHA/App Check cuando tengas la configuración y pruebas listas. Documentar lo activado y su plan asociado.

##### 2.4 Buenas prácticas de cuentas (operativo)
- Contraseñas robustas y únicas para cuentas con privilegios.
- Revisar y deshabilitar cuentas que ya no deban tener acceso.
- Revisar periódicamente **Authentication â†’ Users** y registros de actividad.

---

#### 3) Google Sheets — Roles y cabeceras (Hitos 1.1, 1.3, 5.1)

- **Hoja de Roles/Usuarios (usada por `user-profile`/`.gs`):**
  - Columnas con email y rol claros (p. ej. `email`, `rol`/`role`, `activo` si aplica).
  - Emails normalizados (minúsculas, sin espacios) y sin duplicados.
  - Solo usuarios autorizados; rol explícito (`admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`). Usuarios no presentes deben resultar en `sin_acceso` desde el backend.
- **Hoja `auditoria`:** fila 1 con cabeceras (ver 1 / 5.1). Datos desde fila 2.
- **Hoja `historial-fases-adopcion`:** fila 1 con cabeceras (ver 1 / 5.1). Datos desde fila 2.
- **Permisos de las hojas:** restringir acceso de edición/lectura en Google Sheets/Drive solo a quienes lo necesiten; el acceso operativo de la app debe ir vía GAS con permisos controlados.

---

#### 4) GitHub (despliegue y secretos) — Hito 2.2 / operación

- **Secretos:** en el repositorio (Settings â†’ Secrets and variables â†’ Actions), mantener el token de API y configuración sensible como **Secrets** (no Variables planas si el repo es público), y nunca commitear `.env` ni `src/js/config.js`.
- **Rotación de token:** las propiedades de script (`GITHUB_DEPLOY_TOKEN`, `RECAPTCHA_SECRET`) se leen en cada ejecución, así que rotarlas **no exige redespliegue**: se guarda el valor nuevo en Propiedades de la secuencia de comandos y se comprueba que funciona («Regenerar web» o la prueba de login). Solo si se rota un secreto que viaja al frontend (`RECAPTCHA_SITE_KEY`) hay que actualizarlo en GitHub y desplegar para regenerar `config.js`.
- **Verificación:** tras cambios, confirmar que la app desplegada funciona y que no se expone el token en el código publicado más allá de lo imprescindible en runtime (teniendo en cuenta la limitación `?token=`).

---

#### 5) Web pública (consumo de datos) — Hito 4.1

- Configurar la nueva web para consumir **solo** el endpoint/feed público creado en GAS (o JSON estático exportado), nunca el API/token de administración.
- Usar HTTPS, restringir orígenes CORS en el endpoint público y cachear respuestas cuando sea posible.
- No mostrar ni almacenar datos no públicos; revisar que imágenes/enlaces sean públicos.

---

#### 6) Verificación y operación continua (Hito 5.2)

- **Pruebas por rol (UI y API):** con cuentas `admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta` y un usuario **no autorizado/no presente en Roles**:
  - Comprobar acceso/denegación a páginas y acciones en la app.
  - Probar llamadas directas a endpoints GAS (lectura/escritura) y verificar denegación correcta.
- **Revisiones periódicas:** accesos en Firebase, ejecuciones/permisos en GAS, coherencia Rolesâ†”usuarios, vigencia de tokens.
- **Procedimiento ante incidente:** rotar token, revisar auditoría/ejecuciones, revocar accesos/cuentas comprometidas y corregir configuración de Roles.

---

#### Resumen rápido: qué toca en `.gs`
- `user-profile`: devolver `sin_acceso` para no reconocidos + normalizar email.
- **Todos los endpoints:** validar token/identidad + autorizar por rol/módulo/acción + denegar por defecto + minimizar datos.
- Ajustar `CONFIG`/IDs de hojas (`auditoria`, `historial-fases-adopcion`) y mapeo de cabeceras.
- (Opcional/recomendado) endpoint público separado para la web externa con lista blanca y sin token admin.
- Evitar loguear URLs con `?token=` y definir rotación de token.

---

### Anexo: Notas de seguridad - módulo web pública/gestor (consolidado)

### Notas de seguridad y privacidad — Web pública y gestor (separado)

> **Estado:** documento separado para evitar mezclar con el plan funcional del gestor web y los endpoints públicos. **De momento no aplicar** estos puntos como parte del plan de implementación del módulo web; tratarlos como consideraciones/requisitos previos o paralelos cuando se aborde seguridad.
> **Relación:** complementa (no sustituye) el plan de seguridad de §2 e `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`. Muchas medidas dependen de GAS/Sheets, Firebase y configuración externa.

---

#### 1. Separación de superficies y acceso
- El **gestor/admin** y la **web pública** son superficies distintas: la web pública no debe usar API/token de administración ni acceder a datos internos.
- **Gestor (endpoints de administración):** requieren identidad/autenticación y **autorización por rol/módulo en cada acción** (denegación por defecto), coherente con el plan de seguridad del backend.
- **Canal público:** solo lectura, sin token admin, con CORS restringido al/los dominios de la web pública.

#### 2. Curación y lista blanca de datos (privacidad)
- Publicar únicamente contenido marcado como publicable y **solo campos permitidos** (lista blanca definida por tipo).
- **Ficha pública de animal:** excluir adoptantes/solicitantes, acogidas internas, contratos, documentos, gastos/donaciones, apadrinamientos, datos médicos sensibles no aptos, dirección exacta, notas internas, historial/auditoría e IDs internos correlables.
- El payload público debe construirse **campo a campo en servidor** (nunca exponer la ficha interna completa). `preview` del gestor debe reflejar exactamente el payload público.
- **404** para contenido no publicado/no existente (no revelar borradores).

#### 3. Validación y saneado
- Validar/sanitizar entradas del gestor: `slug` (formato/longitud/unicidad), textos/HTML permitido, URLs de media, tamaños y JSON (`icons/gallery/videos`).
- Respuestas de error públicas sin detalles internos.

#### 4. SEO, URLs y contenido retirado
- Control de indexación por elemento (`index/noindex`, robots, canonical). Gestión de cambios de `slug` con redirects 301; 404/410 para retirados.
- No indexar parámetros auxiliares (p. ej. `?from=`).

#### 5. Formularios y datos personales (si se abordan)
- `forms/submit` como canal separado del feed de publicaciones: verificación reCAPTCHA en servidor, validaciones/antiabuso, minimización/retención de datos y envío seguro.
- Consentimiento previo para no esenciales y políticas (cookies/privacidad) alineadas a tratamientos reales y terceros.

#### 6. Auditoría y operación
- Registrar publicación/despublicación y cambios SEO relevantes cuando sea viable.
- Revisiones periódicas de respuestas públicas (muestreo de lista blanca) y de permisos de gestión web.

#### 7. Dependencias externas (no en este repo)
- Autorización y controles en **Apps Script/Sheets**, configuración en **Firebase/reCAPTCHA** (si aplica), CORS/dominios de despliegue y rotación/gestión de secretos según `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`.

### Pruebas por rol y procedimiento (D6 / 5.2)

> Checklist operativo para validar autorización, visibilidad y acciones por rol tras D1. **Sin secretos**: no incluir tokens, contraseñas, IDs reales sensibles ni datos personales. Ejecutar en entorno de pruebas y, cuando aplique, verificar también por API directa.

#### 0. Estado de verificación (2026-11-15)

**Automatizado en repo:** `tests/roles-d1.test.js` (Code.gs), `tests/roles-auth.test.js` (Roles.gs/Auth.gs) y `tests/auditoria-d3.test.js` fijan autorización/denegación por defecto, resolución de roles e instrumentación de auditoría. Suite completa: **554/554** en local. En CI, `roles-auth.test.js` se omite porque `Roles.gs`/`Auth.gs` no se versionan (checkout limpio): **544/544** ejecutados, sin fallos. `roles-d1` y `auditoria-d3` sí corren siempre (usan `Code.gs`/`WebPublicaciones.gs` versionados).

**Verificado en vivo (con lote `.gs` desplegado):**
- [x] **D1/D2:** `sin_acceso` revocado con perfil mínimo, UI bloqueada y denegación total por API; perfiles completos por rol; roles desplegados resuelven correctamente (revocado→`sin_acceso`) con denegación por defecto.
- [x] **Matriz de lecturas y escrituras/acciones** por API directa coherente con política (sin modificar datos reales).
- [x] **D7/canal público:** endpoints públicos accesibles sin token y endpoints internos denegados sin token.
- [x] **D3 (flujos):** operaciones auditadas del gestor (restaurar/retirar/estado) operativas en producción.
- [x] **D4 (exposición):** token en `?token=` por diseño, sin eco de secretos en workflow ni exposición detectada en cliente.

**Pendiente (operativo/manual):**
- [ ] **D3 (opcional):** inspección visual de filas en hoja de auditoría/fases.
- [ ] **D4 (periódico):** rotación del token cuando proceda. Las propiedades de script se leen en cada ejecución: **no exige redespliegue** (basta con guardar el valor y comprobarlo), salvo que el secreto rotado viaje al frontend (`RECAPTCHA_SITE_KEY`), que sí necesita desplegar para regenerar `config.js`.
- [ ] **D5:** configurar dominios/umbral en la consola reCAPTCHA v3 y ejecutar la prueba e2e de login (código y `.gs` ya actualizados). **MFA/App Check:** mejora futura opcional.

#### 1. Roles esperados

| Rol | Acceso esperado (resumen) |
|---|---|
| `admin` | Acceso total (lectura/escritura, configuración, gestor web, borrados/exportaciones según políticas). |
| `coordinador` | Gestión operativa y gestor web (`web-*`), sin configuración/sistema reservada a admin. |
| `voluntario` | Operativa básica (animales, docs/galería, seguimiento/notas según política); sin datos sensibles/contratos/blacklist/finanzas globales restringidos. |
| `tesoreria` | Donaciones, gastos, apadrinamientos, inventario y reportes económicos permitidos; resto limitado. |
| `consulta` | Solo lectura (acotada por política/filtros); sin escrituras. |
| `sin_acceso` | **Denegación por defecto** (no reconocido o revocado): solo `user-profile` con datos mínimos; sin lecturas operativas ni escrituras. |

#### 2. Precondiciones

- [ ] D1 desplegado en Apps Script (`Code.gs`, `Auth.gs`, `Roles.gs`, y `WebPublicaciones.gs` si aplica) y `ROLES_USUARIOS`/`ADMIN_EMAILS` actualizados con todos los usuarios legítimos (emails normalizados).
- [ ] Probar con al menos un usuario por rol y un usuario **no listado/revocado** (caso `sin_acceso`).
- [ ] Tras cambiar rol en hoja, el usuario cierra sesión y vuelve a entrar (re-login) para reflejar el cambio.
- [ ] Registrar resultados (fecha, entorno, rol, caso, OK/Fallo, observación) sin datos sensibles.

#### 3. Casos mínimos por rol

##### 3.1 `sin_acceso` (no reconocido / revocado) — crítico
- [ ] Login correcto en Firebase pero perfil de app resuelto como `sin_acceso`.
- [ ] `GET user-profile` devuelve solo datos mínimos esperados (p. ej. `role: "sin_acceso"`, `email`) y **no** expone datos operativos adicionales.
- [ ] La UI muestra estado de sin acceso/bloqueo y no permite navegar/operar módulos.
- [ ] Lecturas a endpoints operativos (`animales`, `familias`, `adopciones`, `web-*`, etc.) devueltas como no autorizadas.
- [ ] Escrituras (POST/acciones) denegadas.
- [ ] **API directa** (con token del usuario): confirmar denegación por endpoint, no solo ocultación en UI.

##### 3.2 `consulta`
- [ ] Puede ver datos permitidos en solo lectura.
- [ ] No puede crear/editar/eliminar registros ni ejecutar acciones de escritura.
- [ ] Acceso a `web-*` denegado (según política actual).
- [ ] API directa: escrituras denegadas.

##### 3.3 `voluntario`
- [ ] Acceso operativo permitido (animales, documentos/galería, seguimiento/notas según alcance).
- [ ] Sin acceso a datos/acciones restringidas (p. ej. blacklist, finanzas globales, contratos u otros según política).
- [ ] `web-*` denegado.
- [ ] API directa: endpoints/acciones fuera de alcance denegados.

##### 3.4 `tesoreria`
- [ ] Acceso a donaciones, gastos, apadrinamientos, inventario y vistas/reportes económicos permitidos.
- [ ] Resto de módulos/acciones fuera de alcance denegados.
- [ ] `web-*` denegado.
- [ ] API directa: denegación coherente con UI.

##### 3.5 `coordinador`
- [ ] Gestión operativa permitida y acceso al gestor web (`web-*`) según política.
- [ ] Sin capacidades reservadas a admin (configuración/sistema) si aplica.
- [ ] API directa: lectura/escritura permitida en alcance definido.

##### 3.6 `admin`
- [ ] Acceso total esperado.
- [ ] `user-profile` completo (`uid`, `email`, `role`, `name`).
- [ ] Operaciones sensibles/admin funcionan (según políticas y auditoría).

#### 4. Casos transversales

- [ ] **Normalización de email**: mismo usuario con mayúsculas/espacios en origen se resuelve al rol correcto.
- [ ] **Revocación**: usuario pasado a revocado/inactivo pasa a `sin_acceso` tras re-login.
- [ ] **No listado**: usuario autenticado no presente en roles/admins → `sin_acceso`.
- [ ] **Canal público** (`/api/publicaciones`, `publicacion`, `retiradas`, `sitemap`, etc.): sigue siendo de solo lectura y accesible sin sesión del panel (no debe requerir token).
- [ ] **C1 gestor web**: retirar/restaurar (evento/historia) respeta permisos (`web-*`), audita, y el canal refleja el estado (considerar cache ~60 s; validar con `nocache=1` si procede).
- [ ] **Errores**: las denegaciones devuelven respuesta clara (403/no autorizado) sin filtrar datos.

#### 5. Procedimiento de revisión periódica

- Revisar altas/bajas/cambios de rol al modificar el equipo (mínimo privilegio).
- Repetir esta matriz tras cambios en `Auth.gs`/`Roles.gs`/`Code.gs` o en reglas de permisos.
- Verificar periódicamente auditoría/historial operativo (D3) y rotación/exposición de token (D4).

#### 6. Respuesta a incidentes (básica)

- **Acceso indebido detectado**: revocar/ajustar rol en hoja, forzar re-login, revisar auditoría de acciones recientes, rotar credenciales/token si hay sospecha de exposición.
- **Usuario legítimo bloqueado (`sin_acceso`)**: comprobar email normalizado en `ROLES_USUARIOS`/`ADMIN_EMAILS`, rol activo y re-login.
- Documentar incidente, causa y corrección (sin incluir secretos ni datos personales innecesarios).

## 3. Requisitos del canal público para `main`

> **Origen:** `REQUISITOS_WEB_CANAL_PUBLICO.md` (retirado el 2026-11-23). Texto completo, sin resumir.
> **Estado actual (2026-11-23):** R2 (categoría canónica «Caso externo»), R3 (apadrinamiento), R4 (`featured`/orden/teléfono) y R5 (taxonomías por tipo) están implementados en código local y pendientes de subir el lote `.gs`; R1 (grupos en acogidas) sigue pendiente, aunque el puente `publicaciones&status=en_acogida` ya devuelve grupos; R6 (transporte) está cubierto por fetch/JSONP. El documento siguiente conserva el detalle original de cada petición y sus pruebas de aceptación.

### Requisitos de la web (`main`) al canal público

> **Alcance:** peticiones concretas al backend/canal público de `admin-dashboard` para poder encender **sección por sección** la web `main` contra datos reales.
> **Origen:** proyecto `main` (sitio estático en GitHub Pages). **Fecha:** 2026-11-21. **Estado original:** propuesta; el estado actual está en el bloque anterior.
> **Contexto en la web:** Fase 1 ya hecha — `js/data-source.js` + `js/publicaciones-api.js` con todas las secciones en `fake`, y el adaptador del canal ya escrito (`docs/plan-fuente-datos-fake-endpoint.md` en `main`). Lo único que falta para pasar cada sección a `'real'` es lo de este documento.
> **Regla:** mientras una petición no esté resuelta, esa sección de la web sigue con datos locales. No se requiere tocar el front para aprobar nada de aquí.

---

#### 1. Cómo se ha verificado

Consultas en vivo contra el Web App (2026-11-21, `nocache=1`):

- `?endpoint=taxonomias`
- `?endpoint=publicaciones&pageSize=50`
- `?endpoint=historias-publicas|eventos-publicos|animales-publicos&pageSize=1` (campo `pagination.total`)

**Resultado:** 7 publicaciones publicadas/listadas.

| Tipo | Nº | Categoría | Nº | Estado | Nº |
|---|---:|---|---:|---|---:|
| `animal` | 4 | `Perros en adopción` | 4 | `en_adopcion` | 3 |
| `historia` | 1 | `Gatos en adopción` | 1 | `reservado` | 1 |
| `evento` | 1 | `Historias` | 1 | `en_acogida` | 1 |
| `animal_grupo` | 1 | `Eventos` | 1 | `programado` | 1 |
| | | | | `publicado` | 1 |

`taxonomias` devuelve:
`type: [animal, animal_grupo, evento, historia]` · `category: [Perros en adopción, Gatos en adopción, Eventos, Historias]` · `status: [en_adopcion, reservado, en_acogida, programado, publicado]` · `species: [perro, gato]`.

---

#### 2. Estado por sección de la web

> **Actualización 2026-11-23:** R2, R3, R4 y R5 están **implementados en código local** y pendientes de subir el lote `.gs`; R1 sigue pendiente. La tabla y las notas siguientes reflejan ese estado, no solo la verificación original del 2026-11-21.

| Sección (`main`) | Consulta que usaría hoy | Resultado | Estado |
|---|---|---|---|
| Historias | `historias-publicas` | 1 | ✅ Cubierta |
| Detalle | `publicacion&slug=` | — | ✅ Cubierta (`redirect`/`gone` incluidos) |
| Gatos en adopción | `animales-publicos&species=gato&status=en_adopcion` | 1 | ✅ Cubierta |
| Perros en adopción | `animales-publicos&species=perro&status=en_adopcion` | 2 | ✅ Cubierta |
| Eventos | `eventos-publicos` | 1 | ✅ Cubierta |
| Acogidas | `animales-publicos&status=en_acogida` | 0 y **excluye grupos** | ⚠️ Pendiente → **R1** (puente: `publicaciones&status=en_acogida`) |
| Adoptados | `animales-publicos&status=adoptado` | 0 | ✅ Cubierta (sin datos) |
| Casos externos | `publicaciones&category=Caso externo` | 0 (sin datos) | ✅ Implementado en código (R2; pendiente deploy) |
| Home (destacados) | `publicaciones&featured=1` | 1 (6 sin destacar) | ✅ Implementado en código (R4; pendiente deploy) |
| Apadrinamiento | `animales-publicos&sponsor=1` | 2 | ✅ Implementado en código (R3; pendiente deploy) |
| Taxonomías por tipo | `taxonomias&type=animal` (y `animal_grupo`, `evento`, `historia`) | acotado por tipo | ✅ Implementado en código (R5; pendiente deploy) |

Notas de la verificación:

- `animal_grupo` **solo** aparece en `?endpoint=publicaciones`; los alias `animales-publicos` / `v1/animales` fuerzan `type=animal` (`_webParamsConTipo` en `Code.gs`). Por eso R1 sigue pendiente: para acogidas con grupos hay que usar el puente `publicaciones&status=en_acogida` o añadir `groups=1`.
- El grupo en `en_acogida` (`demo-camada-otono-2026`) lleva categoría `Perros en adopción`, no `Acogidas`: la categoría es editorial, no siempre derivada del estado.
- **R5 resuelto:** `?endpoint=taxonomias&type=…` acota el vocabulario a ese tipo; sin `type` la respuesta es idéntica a la anterior (los estados siguen mezclados solo si no se pide el tipo).
- Hay 0 filas en acogidas, adoptados y casos externos; apadrinamiento tiene 2 con `sponsor=1` y home tiene 1 destacada. Aunque la consulta exista, encender una sección sin filas daría listados vacíos.

---

#### 3. Peticiones

##### R3 · Apadrinamiento (bloqueante, sin equivalente hoy)

**Necesita la web:** una sección `apadrinamiento` que liste animales apadrinables y su ficha con importe/detalles.

**Situación actual:** `Animales.apadrinable` existe y el gestor ya tiene el flujo (`src/js/dashboard.js`, `_esApadrinable`: check + estado `disponible`/`en_acogida`), pero el contrato F0 (`memory.md`) lo lista en **“Nunca salen”**: no viaja al payload público y no hay filtro.

**Contrato propuesto (mínimo, aditivo):**

1. **Payload** — añadir bloque de nivel superior en `webConstruirPublicacion` (solo `type: animal`):

```json
"sponsor": {
  "available": true,
  "monthlyEur": 10,
  "notes": "Apadrinas su alimentación y cuidados"
}
```

   - `available` se deriva de `Animales.apadrinable` aplicando la regla ya existente (`_esApadrinable`): verdadero solo si el animal es apadrinable y su estado es `disponible` o `en_acogida`. `false`/`null` si no aplica.
   - `monthlyEur` y `notes` son override editorial (publicación), opcionales.
   - **No** exponer `apadrinable` en crudo ni `estado` interno (se mantiene la whitelist actual).

2. **Filtro** — `?endpoint=animales-publicos&sponsor=1` (y `sponsor=0`):

```
GET ?endpoint=animales-publicos&sponsor=1&pageSize=24&sort=-publishedAt
→ {status:"success", pagination:{total:N}, data:[{ …, sponsor:{available:true,…} }]}
```

   - Añadir `sponsor` a la clave de caché `_webKeyParams` (`Code.gs`), o las respuestas cacheadas se mezclarían con/sin filtro.

3. **Alternativa si se prefiere no tocar el compositor:** publicar los apadrinables con `category:"Apadrinamiento"` (columna editorial) y que la web filtre por `category`. Es menos correcto (la categoría y el estado se pisan) y no aporta el bloque `sponsor`, pero desbloquea la sección sin cambios de backend.

**Criterios de aceptación:**

- [ ] Un animal publicado con `apadrinable=true` y estado `disponible` o `en_acogida` aparece con `sponsor.available=true`.
- [ ] `animales-publicos&sponsor=1` lo incluye; `sponsor=0` lo excluye; sin parámetro no cambia nada.
- [ ] Un animal `adoptado` con `apadrinable=true` devuelve `sponsor.available=false` y no aparece en `sponsor=1`.
- [ ] `preview == feed` también para `sponsor`.
- [ ] Ningún campo interno (`apadrinable`, `origen_id`, `estado`) aparece en el payload.

**Mientras tanto en la web:** sección en `fake` (no existe aún en el front; se creará con el bloque `sponsor` cuando R3 esté aprobado).

---

##### R2 · Casos externos (valor de categoría)

**Necesita la web:** listar los casos de animales que no gestiona la asociación, con el mismo formato de ficha.

**Situación actual:** no hay `type` ni categoría derivada para ellos. El filtro `category` compara **exacto** con la columna editorial (`webListarPublicas`), así que funcionaría si existe una fila publicada con `categoria = "Caso externo"`. Con 0 filas no se puede confirmar el circuito completo.

**Lo que se pide (decisión + garantía, no código nuevo):**

1. Fijar el valor canónico **`Caso externo`** (misma grafía y acentos que usa hoy la web en `data/blog-posts.json`) y documentarlo en el catálogo de categorías.
2. Confirmar que la categoría editorial **no se re-deriva** al guardar/publicar para `type: historia` (hoy `webCategoriaGrupoDerivada` solo actúa en grupos; verificar que en alta de historia se respeta el valor).
3. Si el caso externo representa a un animal con ficha interna, decidir si va como `animal` (y entonces la categoría derivada lo pisaría) o como `historia` con categoría editorial. **Recomendado: `historia`**, porque no es un animal en adopción de la asociación.
4. (Opcional) Permitir el valor en el `<select>` de categoría del gestor para evitar erratas.

**Alternativa:** crear `type:"caso_externo"`, pero implica tocar `WEB_TIPOS`, gestor, JSON-LD, rutas y `main`: coste alto para el mismo resultado.

**Criterios de aceptación:**

- [ ] `GET ?endpoint=publicaciones&category=Caso%20externo` devuelve las filas marcadas así (probarlo con una fila de prueba publicada).
- [ ] La ficha de detalle responde igual que una historia (sin bloque `animal`).
- [ ] `taxonomias.category` incluye `Caso externo` cuando haya al menos una publicada.

**Mientras tanto en la web:** sección en `fake` y tarjetas fijas en `casos-externos.html`.

---

##### R4 · Home: destacados (`featured`)

**Necesita la web:** el carrusel de la home quiere N destacados sin descargar todo el catálogo.

**Situación actual:** `featured` viaja en el payload y está en `webProyeccionCard`, pero **no se filtra** en `webListarPublicas` ni está en `_webKeyParams` (hoy `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` §89 lo da por “disponible”, pero solo como campo del payload).

**Contrato propuesto:**

```
GET ?endpoint=publicaciones&featured=1&pageSize=6&sort=-publishedAt
→ solo publicaciones con featured=true (hoy: 1)
```

- Aceptar `featured=0` (no destacadas) y ausencia = sin filtro.
- Añadir `featured` a `_webKeyParams` para la caché.
- Respetar `listed` y el estado de publicación como ya hace `webPublicables`.

**Criterios de aceptación:**

- [ ] `featured=1` devuelve solo las filas con la bandera y `pagination.total` coherente.
- [ ] Sin el parámetro, la respuesta es idéntica a la actual.
- [ ] `featured=0` devuelve el resto.

**Mientras tanto en la web:** home en `fake` (carrusel fijo); la sección `home` no se enciende.

---

##### R1 · Acogidas: incluir grupos (`animal_grupo`)

**Necesita la web:** una sección de acogidas que muestre tanto animales individuales como camadas/grupos en acogida.

**Situación actual:** `?endpoint=animales-publicos` fuerza `type=animal`, así que el grupo `demo-camada-otono-2026` (estado `en_acogida`) **no** aparece. La web podría obtenerlo con `?endpoint=publicaciones&status=en_acogida` (sin `type`), que sí lo incluye; es un rodeo, no un bloqueo.

**Lo que se pide (una de las dos):**

1. Que `animales-publicos` / `v1/animales` incluya también `animal_grupo`, o
2. Un parámetro explícito: `?endpoint=animales-publicos&groups=1`.

Mantener el comportamiento actual si el parámetro no se envía, para no romper consumidores.

**Criterios de aceptación:**

- [ ] `animales-publicos&status=en_acogida` (opción 1) o `...&groups=1` (opción 2) devuelve el grupo además de los individuos.
- [ ] Sin el parámetro, la respuesta actual no cambia (opción 2).
- [ ] El payload del grupo sigue usando `group` + `animal` de compatibilidad.

**Mientras tanto en la web:** acogidas en `fake`; cuando se encienda, puede usar `publicaciones&status=en_acogida` como puente.

---

##### R5 · Taxonomías separadas por tipo (mejora, no bloqueante)

**Necesita la web:** construir los chips de filtro sin mezclar vocabularios.

**Situación actual:** `taxonomias.status` devuelve `[en_adopcion, reservado, en_acogida, programado, publicado]`: los dos últimos son estados de evento, no del vocabulario de animales (D1). Un chip “publicado” en el listado de gatos no tiene sentido.

**Propuesta:** `?endpoint=taxonomias&type=animal` (o `statusByType: {animal:[…], evento:[…], historia:[…]}`) manteniendo la respuesta actual si no se envía el parámetro.

**Mientras tanto en la web:** el adaptador filtra los estados conocidos de animales (`en_adopcion`, `en_acogida`, `reservado`, `adoptado`, `cerrado`) y descarta el resto.

---

##### R6 · Transporte (recordatorio, ya cubierto)

La web consume el canal con `fetch` y **cae a JSONP** (`&callback=`) porque `ContentService` no puede fijar `Access-Control-Allow-Origin`. No se pide nada nuevo: solo que `callback` y `?endpoint=…` sigan siendo la interfaz estable y que los cambios no rompan el JSONP (`_webSalida`).

---

#### 4. Fuera de alcance de esta solicitud

- Escritura o endpoints de gestión desde la web (sigue siendo solo lectura).
- Formularios (`forms/submit`): se tratan aparte en §4 de este documento, Parte B.
- Prerender, sitemap, robots y 301/410 físicos: se resuelven en el build de `main` (Parte A.5); el canal ya expone `sitemap`, `redirects` y `retiradas`.
- Cualquier cambio en `main`: lo ejecuta el proyecto `main` al aprobarse cada punto.

---

#### 5. Prioridad y orden recomendado

| Orden | Petición | Motivo | Coste estimado |
|---|---|---|---|
| 1 | **R3** apadrinamiento | Única sección sin ninguna vía hoy; requiere decisión de modelo | Medio (compositor + filtro + gestor/override) |
| 2 | **R2** casos externos | Desbloquea la sección con una decisión editorial | Bajo (documentar + verificar) |
| 3 | **R4** `featured` | Home sin descargar el catálogo | Bajo (filtro + clave de caché) |
| 4 | **R1** grupos en acogidas | Hay puente con `publicaciones&status=…` | Bajo |
| 5 | **R5** taxonomías por tipo | Mejora de UI; hay workaround | Bajo |

> **Estado 2026-11-23:** R2, R3, R4 y R5 ya están implementados en código local y pendientes de subir el lote `.gs`; de esta lista solo queda **R1** como decisión funcional.

---

#### 6. Pruebas de aceptación (copiar/pegar)

```bash
BASE="https://script.google.com/macros/s/<DEPLOY_ID>/exec"

curl -sSL "$BASE?endpoint=taxonomias&nocache=1"
curl -sSL "$BASE?endpoint=publicaciones&featured=1&nocache=1"          # R4
curl -sSL "$BASE?endpoint=animales-publicos&status=en_acogida&nocache=1" # R1
curl -sSL "$BASE?endpoint=publicaciones&category=Caso%20externo&nocache=1" # R2
curl -sSL "$BASE?endpoint=animales-publicos&sponsor=1&nocache=1"        # R3
```

Comprobar en cada una: `status:"success"`, `pagination.total` esperado y que el payload no gane campos internos.

---

#### 7. Qué hará la web al aprobarse cada punto

En `main`, la conmutación ya existe y es de una línea por sección:

```js
// js/data-source.js
sections: {
  apadrinamiento: { mode: 'real' },  // R3
  casosExternos:  { mode: 'real' },  // R2
  home:           { mode: 'real' },  // R4
  acogidas:       { mode: 'real' }   // R1
}
```

No hay que tocar renderizadores: `js/publicaciones-api.js` ya traduce el envelope y compone `publication`. Antes de encender cada sección se comprobará el conteo real: hoy `animales-publicos&status=en_acogida` devuelve 0 porque el único caso es un grupo (R1), y adoptados, apadrinamiento y casos externos no tienen ninguna fila publicada; esas secciones no se activarán hasta que el gestor tenga datos.

---

#### 8. Referencias

- Canal: `apps-script/Code.gs` (`handleGetPublico`, `_esEndpointPublico`, `_webKeyParams`, `_webSalida`) y `apps-script/WebPublicaciones.gs` (`webListarPublicas`, `webConstruirPublicacion`, `webBloqueAnimal`, `webPublicacionPublica`, `webTaxonomias`).
- Contrato: §4 de este documento, §A.2; F0 en `memory.md`; `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` §5.
- Web: `docs/plan-fuente-datos-fake-endpoint.md`, `js/data-source.js`, `js/publicaciones-api.js` (en `main`).

## 4. Port y formularios en `main`

> **Origen:** `TRANSFERIR_A_MAIN.md` (retirado el 2026-11-23). Texto completo, sin resumir.
> **Estado actual:** M1–M4 y M6 ejecutados y verificados en `main`; M5 (subir el lote `.gs` y configurar `GITHUB_DEPLOY_REPO_MAIN`/`GITHUB_DEPLOY_WORKFLOW_MAIN`, verificar el disparo E2E) sigue pendiente. El plan siguiente es el documento íntegro.

**Además del plan (operativo, 2026-11-23):**

- [ ] **Dominio propio + Search Console + sitemap en raíz:** configurar el dominio de `main`, verificar la propiedad y enviar `sitemap.xml`; revisar canónica, 301/410 e indexación real.

### Plan trasladado al proyecto `main` (ejecutar en `C:\Users\JonEg\Documents\proyectos\main`)

> Documento consolidado para **trasladar y ejecutar en el proyecto `main`**. Reúne todo lo planificado para `main` que antes estaba en `admin-dashboard`.
> **Origen:** `admin-dashboard` (contrato/canal/visor y groundwork ya implementados allí). **No modificar `main` desde `admin-dashboard`.**

---

#### Parte A — Track B: port SEO/canal a la web (`main`)

##### A.1 Objetivo y alcance

Portar a la web real lo ya validado en la simulación de `admin-dashboard`:

- **Consumo del canal público** (sin JSON estático), con filtros/búsqueda/paginación y estados vacío/error.
- **SEO por publicación**: `<title>`, description, robots, canonical (condicional), OG/Twitter y JSON-LD (`Article`/`Event`/`BlogPosting`) desde el payload.
- **Indexabilidad real**: prerender/SSG por `slug`, `sitemap.xml` y `robots.txt` físicos en el dominio propio.
- **Estados y redirecciones**: 404 real, 410 para retirados (o página `noindex` equivalente), 301 desde slugs históricos (`/v1/redirects`).
- **Criterio de aceptación:** reproducir en el dominio real lo verificado en la simulación (referencia: `admin-dashboard/src/js/publico.js`, `src/publico.html`, `src/css/publico.css`, `scripts/prerender-publico.js` y criterios §7.1 de `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` en `admin-dashboard`).

##### A.2 Contrato del canal (backend en GAS)

Base URL del Web App: la configurada para el canal público. El token **no** aplica a endpoints públicos. El Web App responde `Access-Control-Allow-Origin: *`, así que **`fetch` funciona directamente**; **JSONP** (`&callback=`) queda solo como respaldo (despliegues antiguos o navegadores que bloquean scripts de terceros).

No todas las respuestas tienen la misma forma: los **listados** devuelven `{ status, endpoint, applied, filters, pagination, data }`; el **detalle** devuelve `{ status, data }` (o `redirect`, o `gone`); `retiradas`, `redirects` y `sitemap` devuelven `{ status, generatedAt, data }`. `status` ∈ `success | warning | error | gone`.

El Web App contesta **HTTP 200** también cuando `status` es `error` o `gone`: la decisión sale de `status`, no del código HTTP (la excepción es el límite de peticiones, que llega como `warning` con HTTP 429). Un `endpoint` desconocido no da 404: cae en la API privada y responde `{ status:"error", code:401, error:"Token no proporcionado" }`.

**La vista no cambia.** Se mantienen las páginas de listado y de ficha, sus bloques, sus metas y su estética; lo que se adapta es **la fuente y los filtros**: donde antes había un JSON estático, ahora hay una o dos llamadas, y los filtros se llaman de otra forma.

**Endpoints públicos** (forma `?endpoint=`, la que usa el visor):

| `endpoint=` | Devuelve | Parámetros |
|---|---|---|
| `publicaciones` | Todo el canal (animales, grupos, eventos, historias) | `type`, `category`, `status`, `species`, `q`, `featured`, `sponsor`, `desde`, `sort`, `fields=card`, `page`, `pageSize` (máx. 50) |
| `publicacion&slug=<slug>` | Ficha completa por slug | `slug`; puede responder `redirect` (301 lógico) o `gone` (retirada) |
| `animales-publicos` | Atajo de `publicaciones&type=animal` | los mismos del listado |
| `eventos-publicos` | Atajo de `publicaciones&type=evento` | los mismos + `desde`, `sort=startDate` (§A.2.2) |
| `historias-publicas` | Atajo de `publicaciones&type=historia` | los mismos |
| `taxonomias` | Vocabulario de los filtros, dentro de `data`: `data.type`, `data.category`, `data.status`, `data.species` | `type` para acotarlo |
| `config-publica` | Config pública: `site` (`name`, `url`), `contact` (`email`, `phone`), `seo` (`defaultTitle`, `defaultDescription`, `robots`, `baseUrl`) y `locales` | — |
| `retiradas` | Lápida de cada slug retirado (`slug`, `tipo`, `retiradoEn`) | Para 410/`noindex` y para excluir del sitemap |
| `redirects` | Lista de 301: `{ from, to, status, type, slug, currentSlug, changedAt }` | Reglas del hosting/build |
| `sitemap` | URLs de ficha indexables (`loc`, `lastmod`, `changefreq`, `priority`, `type`, `slug`, `title`) | Sin dominio público responde `data: []` con un `notice`; el `sitemap.xml`/`robots.txt` **físicos** se generan en el dominio propio |

**Alias REST** (mismos datos, **como valor de `endpoint=`**, no como ruta): `?endpoint=api/publicaciones`, `?endpoint=api/publicaciones/<slug>` (y `v1/publicaciones/<slug>`), `?endpoint=v1/publicaciones`, `?endpoint=v1/animales`, `?endpoint=v1/eventos`, `?endpoint=v1/historias` (y `v1/blog`), `?endpoint=v1/config`, `?endpoint=v1/taxonomias`, `?endpoint=v1/sitemap`, `?endpoint=api/redirects`, `?endpoint=v1/redirects`, `?endpoint=sitemap.xml`. El backend normaliza mayúsculas y barras sobrantes (`API/Publicaciones`, `/v1/animales/`). **Las rutas de verdad (`/exec/api/publicaciones`) no sirven de forma anónima**: Google responde con un 302 a `accounts.google.com/ServiceLogin`, así que en `main` usad el parámetro `endpoint`, no la ruta.

**Parámetros del listado:**

- `type`: `animal`, `animal_grupo`, `evento`, `historia`.
- `category`, `species`, `status`: valores del vocabulario de `taxonomias`; el servidor normaliza (p. ej. `Caso externo` y `CASO EXTERNO` son lo mismo, §A.2.3).
- `q`: búsqueda de texto libre.
- `featured=1|0` y `sponsor=1|0`: destacados y apadrinados.
- `desde` y `sort`: agenda de eventos (§A.2.2). `sort` admite `orden`, `-orden`, `startDate`, `-startDate`; por defecto `-publishedAt`.
- `fields=card`: proyecta el listado a los campos de tarjeta (ver §A.2.3). Sin el parámetro, el payload es el completo.
- `page`, `pageSize` (tope 50).
- `nocache=1`: solo para depurar. La caché normal es de ~60 s y su clave incluye **todos** los parámetros, así que dos filtros distintos nunca se mezclan.

**Eco `applied`:** qué se aplicó de verdad (`type`, `category`, `status`, `featured`, `sponsor`, `desde`, `species`, `q`). **`sort`, `page`, `pageSize`, `fields` y `nocache` no salen en `applied`**: el orden y la página los da la propia respuesta. Sirve para pintar los filtros tal como los entendió el backend, sin duplicar la normalización en cliente.

**Estados a manejar:** listado vacío, canal no configurado (`status:"warning"`), límite de peticiones (`warning` con HTTP 429), error de red/carga (con reintento), no disponible/404 lógico (`status:"error"`, `error:"Publicación no encontrada"`, `noindex,nofollow` + enlace al listado), retirada/gone (`status:"gone"`, `code:"gone"` y `data` con `slug`, `tipo` y `retirado_en`; 410 o página `noindex`).

**Qué adaptar en cada vista (y qué no):**

- **Listado:** se mantienen tarjetas, buscador, paginación y contadores. Los filtros pasan a los parámetros de arriba y **sus opciones salen de `taxonomias`** (no hardcodear categorías). Si la web separa animales, grupos, eventos e historias en secciones propias, cada una pide su atajo (`animales-publicos`, `eventos-publicos`, `historias-publicas`) o `type=`, sin cambiar el render de la tarjeta.
- **Ficha:** mismos bloques y mismo orden; el detalle sigue siendo **una** llamada `publicacion&slug=`. No se pide el listado para pintar una ficha.
- **Metas, JSON-LD, sitemap y 410:** salen del payload de detalle, de `retiradas` y de `redirects`, como hasta ahora.

##### A.2.1 Publicaciones de grupo / camada (adopción conjunta, aditivo)

El canal puede entregar publicaciones de **grupo** (varios animales que se adoptan juntos). Es un tipo aditivo: si `main` aún no lo contempla, debe ignorarlo sin romper nada; el resto del contrato no cambia.

- **Tipo:** `type: "animal_grupo"` + `isGroup: true`. La URL sigue siendo `/animales/<slug>` y comparte listado, canonical, sitemap, 301/410 y prerender con las fichas individuales.
- **Bloque `group`:** `{ groupName, count, members[], species, sex, age, size, color, health, temperament, compatibility, adoption, foster, location, contact }`.
  - `members[]` es un **resumen público whitelisted**: solo `{ nombre, especie, raza, sexo, edad, size, foto }`. Nunca incluye IDs internos (`id`, `grupo_id`, `origen_id`), microchip, vacunas ni documentos.
  - Por compatibilidad, el payload incluye también `animal` con el mismo contenido que `group`; el consumidor nuevo debe usar `group` y el antiguo puede seguir leyendo `animal`.
- **Derivación:** el grupo no duplica datos; se compone de los animales internos que comparten `grupo_id`. `status` se agrega:
  - todos `adoptado` → `adoptado`;
  - algún `fallecido`, adopción parcial (mezcla de `adoptado` con no adoptados) o conjunto inconsistente → `cerrado` y **no publicable**;
  - algún `en_adopcion`/`reservado` → `reservado`;
  - todos `en_acogida` (o mezcla de `disponible` + `en_acogida`) → `en_acogida`;
  - todos `disponible` → `en_adopcion`.
- **Urgencia:** `urgent: true` si **cualquier** miembro prioritario; `urgente` no es un estado.
- **Portada:** si la publicación no fija `coverImage`, se hereda la primera foto disponible de los miembros.
- **Visibilidad:** estados `borrador`/`oculto`/`retirado` no salen del feed; `retirado` responde `gone` (410 lógico) y conserva el slug. `preview` del gestor y feed público devuelven exactamente el mismo objeto.
- **Exclusividad:** mientras el grupo está publicado no puede haber publicaciones individuales publicadas de sus miembros; si `main` encuentra ambas, debe priorizar el grupo o mostrar solo una (el backend ya bloquea la activación).
- **SEO/JSON-LD:** igual que una ficha de animal (`Article`), añadiendo `about.name = groupName` y una descripción con especie/miembros. Sin `group`, el render no cambia.
- **Referencia de render:** `admin-dashboard/src/js/publico.js` (`_bloqueGrupo`, tarjeta y JSON-LD) y `scripts/prerender-publico.js`.

##### A.2.2 Agenda de eventos: `sort=startDate`, `desde` y `event.pasado` (aditivo)

Los eventos ya traen `event.startDate`/`endDate`; el canal añade el criterio temporal para que la web abra la sección por el **próximo** evento y no por el último publicado. Todo es aditivo: sin estos parámetros, listado y payload no cambian.

- **`?endpoint=eventos-publicos&sort=startDate`** (y `-startDate`): ordena por el día del evento, con `endDate` mandando sobre `startDate`. Como `sort=orden`, desactiva la prioridad de `urgent` (si no, un animal urgente sin fecha adelanta al evento); las publicaciones **sin fecha van al final** en ambos sentidos. `-publishedAt` sigue siendo el orden por defecto.
- **`desde=YYYY-MM-DD|hoy`**: deja solo lo que no ha terminado (`endDate` o `startDate` ≥ ese día), con granularidad de día UTC. **Solo filtra `type=evento`**: animales, grupos e historias pasan sin tocar, así que `animales-publicos&desde=hoy` devuelve lo mismo que sin el parámetro. Dentro de los eventos, uno sin fecha no entra; un valor que no es una fecha **no filtra** (no es error).
- **`event.pasado`** (booleano, solo en `type=evento`): `true` si el último día del evento ya pasó; `false` si está en curso, es futuro o no tiene fechas. Sale de las mismas fechas y con la misma granularidad que `desde`, así que un evento de hoy nunca se marca como pasado.
- **Eco:** `applied.desde` devuelve el día normalizado (`YYYY-MM-DD`), o `''` si no se pidió o no era válido. `desde` y `sort` forman parte de la clave de caché (~60 s): respuestas con y sin filtro no se mezclan.

**Uso típico en la web:**

```js
// Próximos eventos, del más cercano al más lejano
GET ?endpoint=eventos-publicos&desde=hoy&sort=startDate&pageSize=6
// Archivo de eventos, del más reciente al más antiguo
GET ?endpoint=eventos-publicos&sort=-startDate
```

**Qué debe hacer `main`:** pintar «Próximos» con `desde=hoy&sort=startDate`, usar `event.pasado` para separar el archivo histórico (o marcarlo en la tarjeta) y **no** aplicar `desde` a las secciones de animales, grupos o historias. Referencia de render: `admin-dashboard/src/js/publico.js` (evento) y `scripts/prerender-publico.js`.

##### A.2.3 Filtros y taxonomías: `taxonomias`, `featured`, `sponsor` y categorías canónicas

Los filtros de la web salen del canal, no de listas escritas a mano.

- **`?endpoint=taxonomias`** devuelve `data` con `{ type, category, status, species }` (solo `status` + `data`, sin `applied`) y lo que hay publicado. Con `&type=animal` acota a ese tipo (así la sección de animales no ofrece estados de evento). Es lo que rellena los `<select>`; si vuelve vacío, ese filtro no se pinta.
- **`featured=1|0`**: `1` solo destacadas, `0` solo no destacadas. Suma exacta: `featured=1` + `featured=0` = total del canal (comprobado en producción: 1 + 6 = 7). Se usa para la portada o un carrusel.
- **`sponsor=1|0`**: publicaciones con apadrinamiento (`sponsor.available`), no las que solo tienen el bloque vacío. Suma exacta, como `featured`: `sponsor=1` + `sponsor=0` = total del canal (comprobado en producción: 2 + 5 = 7).
- **`applied`** devuelve lo que el backend entendió (`featured: "1"`, `category: "Caso externo"`, `desde: "2026-11-22"`…), sin `sort`. Si no coincide con lo pedido, manda `applied`: es la fuente de verdad para marcar el filtro activo.
- **Categoría canónica «Caso externo»**: se guarda y se devuelve con esa grafía exacta. Si la web pide `CASO EXTERNO`, `caso externo` o `casos externos`, el backend normaliza y responde con la canónica; los chips de `taxonomias` listan la categoría **una sola vez**. No comparar categorías en cliente con `===` sobre el texto libre: usar `applied.category` o la lista de `taxonomias`.
- **`fields=card`**: única forma admitida de recortar el listado. Devuelve `id`, `slug`, `type`, `category`, `status`, `title`, `excerpt`, `publishedAt`, `updatedAt`, `coverImage`, `image`, `imageAlt`, `url`, `featured`, `urgent`, más `sponsor` **solo si la ficha lo trae** (no viene en eventos, historias ni grupos) y un `animal` reducido a `{ species, age, sex }` (tampoco en eventos/historias); se van `contentHtml`, `tags`, `icons`, `gallery`, `videos`, `author`, `orden`, `listed`, `canonical`, `seo`, `dateFormatted` y `readTime`. Cualquier otro valor (`fields=slug,title`) **se ignora** y devuelve el payload completo; `fields` tampoco aparece en `applied`, así que no lo uses como filtro. Sin el parámetro, el payload es el completo.

##### A.2.4 Recetas por página (llamadas exactas)

Todo lo de arriba se reduce a **una** función de acceso. Copiar tal cual en `main` (vanilla o como módulo; no necesita dependencias):

```js
// canal.js
export function crearCanal({ baseUrl, dominio = '' }) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const canonica = (ruta) => (dominio ? dominio.replace(/\/+$/, '') + ruta : ruta);

  function url(endpoint, params = {}) {
    const u = new URL(base);
    u.searchParams.set('endpoint', endpoint);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      u.searchParams.set(k, v);
    }
    return u;
  }

  // Respaldo para despliegues antiguos o navegadores que bloquean scripts de terceros.
  function jsonp(endpoint, params = {}) {
    const nombre = 'gnCanal_' + Math.random().toString(36).slice(2);
    const u = url(endpoint, { ...params, callback: nombre });
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const cerrar = (fn, valor) => { clearTimeout(t); delete window[nombre]; s.remove(); fn(valor); };
      const t = setTimeout(() => cerrar(reject, new Error('JSONP sin respuesta')), 15000);
      window[nombre] = (data) => cerrar(resolve, data);
      s.onerror = () => cerrar(reject, new Error('JSONP no cargó'));
      s.src = u.toString();
      document.head.appendChild(s);
    });
  }

  // Devuelve el sobre tal cual (success/error/gone); el HTTP siempre es 200.
  async function pedir(endpoint, params = {}, { respaldo = true } = {}) {
    try {
      const r = await fetch(url(endpoint, params), { credentials: 'omit' });
      const data = await r.json();
      if (!data || !data.status) throw new Error('Canal sin envoltorio');
      return data;
    } catch (err) {
      if (!respaldo) throw err;
      return jsonp(endpoint, params);
    }
  }

  return {
    url, pedir, jsonp, canonica,
    listado: (params = {}) => pedir('publicaciones', { pageSize: 12, ...params }),
    seccion: (tipo, params = {}) => pedir('publicaciones', { type: tipo, pageSize: 12, ...params }),
    ficha: (slug) => pedir('publicacion', { slug }),
    taxonomias: (type = '') => pedir('taxonomias', type ? { type } : {}),
    config: () => pedir('config-publica'),

    // Build/prerender: recorre el listado completo (máx. 50 por página).
    async mapaPublicaciones() {
      const todo = [];
      for (let page = 1; page <= 50; page++) {
        const r = await pedir('publicaciones', { page, pageSize: 50 }, { respaldo: false });
        if (r.status !== 'success') break;
        todo.push(...(r.data || []));
        if (!r.pagination || r.pagination.totalPages <= page) break;
      }
      return todo;
    },
    retiradas: () => pedir('retiradas', {}, { respaldo: false }),
    redirects: () => pedir('redirects', {}, { respaldo: false }),
    sitemap: () => pedir('sitemap', {}, { respaldo: false })
  };
}
```

**Recetas** (siempre `GET {baseUrl}?…`; `pageSize` ≤ 50, 12 por defecto). En desarrollo, añadir `nocache=1` a la llamada para saltar la caché de ~60 s del canal (`canal.pedir('publicaciones', { nocache: 1 })`); en producción, dejarla actuar.

| Página de `main` | Llamada | Qué pintar |
|---|---|---|
| **Portada / destacados** | `canal.listado({ featured: 1, pageSize: 6 })` | Tarjetas con `title`, `excerpt`, `coverImage.src/alt`, `url`, `urgent`. |
| **Animales** | `canal.seccion('animal', { category, species, status, q, page, pageSize: 12 })` | Igual que portada; `animal.species`, `animal.age.label`. Opciones de filtro desde `canal.taxonomias('animal')`. |
| **Grupos** | `canal.seccion('animal_grupo', { … })` | Tarjeta normal; en ficha, `group.groupName`, `group.count`, `group.members[]` y `group.adoption`/`contact`. |
| **Eventos (próximos)** | `canal.seccion('evento', { desde: 'hoy', sort: 'startDate', pageSize: 12 })` | Fecha con `event.startDate`/`endDate`, lugar con `event.location.name/address`; `event.pasado` para marcar el archivo. |
| **Eventos (archivo)** | `canal.seccion('evento', { sort: '-startDate', pageSize: 12 })` | Mismo render; separar con `event.pasado`. |
| **Historias** | `canal.seccion('historia', { q, page, pageSize: 12 })` | Tarjeta normal (`coverImage`, `excerpt`, `dateFormatted`). |
| **Buscador global** | `canal.listado({ q, page: 1 })` | Resultados mezclados; `pagination.total` para el contador. |
| **Ficha (cualquier tipo)** | `canal.ficha(slug)` | Una sola llamada. `status: 'success'` → pintar `data`; `'gone'` → 410/`noindex`; `'error'` → 404; `redirect` → `history.replaceState` al `redirect.to`. |
| **Filtros** | `canal.taxonomias('animal' \| 'animal_grupo' \| 'evento' \| 'historia')` | Rellenar los `<select>`; si vuelve vacío, no pintar ese filtro. |
| **Contacto / pie** | `canal.config()` | `contact.email`, `contact.phone`, `site.name`, `seo.defaultTitle/Description`. Una vez por layout. |
| **Sitemap/robots/301 (build)** | `canal.mapaPublicaciones()` + `canal.ficha(slug)` + `canal.retiradas()` + `canal.redirects()` + `canal.sitemap()` | Ver §A.5. |

**Campos que usa cada ficha** (nombres reales del payload, no inventar):

- **Común:** `slug`, `type`, `category`, `status`, `title`, `excerpt`, `publishedAt`, `updatedAt`, `dateFormatted`, `readTime`, `coverImage { src, alt }`, `contentHtml`, `tags[]`, `icons[]`, `gallery[{ src, alt, caption, order }]`, `videos[]`, `featured`, `urgent`, `url` (ruta), `canonical`, `seo { metaTitle, metaDescription, ogImage, canonical, robots, og, twitter }`.
- **Animal:** `animal { names[], species, breed, sex[], age { value, unit, label }, size, color, health { vaccinated, dewormed, neutered, microchipped, specialNeeds }, temperament[], compatibility, adoption, foster, location, contact }` y `sponsor { available, monthlyEur, notes }` (solo si existe).
- **Grupo:** `group { groupName, count, members[{ nombre, especie, raza, sexo, edad, size, foto }], species, sex, age, size, color, health, temperament, compatibility, adoption, foster, location, contact }`; `isGroup: true`.
- **Evento:** `event { kind, startDate, endDate, timezone, location { name, address }, organizer, audience[], agenda[], registration, milestone, pasado }`.
- **Historia:** los comunes; sin `animal`/`group`/`event`.
- **`ficha` (solo detalle, opcional):** `plantilla`, `bloques { datos, etiquetas, contenido, galeria, videos, fichaAnimal, cta }`, `orden[]`, `videoModo`, `mostrarLectura`, `icons`, `gallery`, `videos`, `tags`, `cta`. Si no viene, render actual sin cambios.

**URL y canónica:** `data.url` es una **ruta** (`/animales/<slug>`, `/eventos/<slug>`…), no una URL absoluta; la canónica se compone con el dominio de `main` (y solo se emite si hay dominio configurado). El `canonical` del payload puede venir vacío en la demo: en ese caso, no emitir canonical/`og:url`.

**SEO por ficha:** `seo.metaTitle || title`, `seo.metaDescription || excerpt`, `seo.canonical || canonical` (si vacío: ni `<link rel="canonical">` ni `og:url`), `seo.ogImage || coverImage.src`, `seo.robots || 'index,follow'`. JSON-LD: `Article` (animal y grupo, con `about.name = group.groupName`), `Event` (evento, con `startDate`/`endDate`/`location`), `BlogPosting` (historia); nunca en `error`, `gone` ni listados.

**Formularios:** hoy van por EmailJS (Parte A). El endpoint `forms-submit` de la Parte B **no está desplegado**: `POST {baseUrl}?endpoint=forms-submit` responde `401 Token no proporcionado` porque cae en la API privada. No lo llames desde `main` hasta que C4 se implemente y despliegue.

**Estados en la UI:** `status:"warning"` → aviso de canal sin configurar; `status:"error"` → 404 con `noindex,nofollow` y enlace al listado; `status:"gone"` → «Publicación retirada», `noindex,nofollow`, sin canonical/JSON-LD y 410 si el hosting lo permite; fallo de red → mensaje con reintento. Recordar: el HTTP es 200 también en `error` y `gone`, así que **decidir por `status`**.

##### A.3 Port de consumo y render (B1–B2)

1. **Sustituir fuente estática:** reemplazar `blog-posts.json` / `HistoriasAPI` (o equivalente) por consumo del canal (`publicaciones` + `publicacion&slug=`). Usar `crearCanal` de §A.2.4 (fetch con respaldo JSONP) tanto en cliente como en build; las recetas por página están en esa misma sección.
2. **Listado:** filtros, búsqueda, paginación (respetar `pageSize` máx. y total), tarjetas con datos de lista; enlaces a la ruta canónica de ficha.
3. **Detalle por slug:** render de `title`, `excerpt`, `publishedAt`/`updatedAt`, `coverImage`/`image`, `contentHtml`, `tags`, `icons`/datos destacados, `gallery` (`alt`/`caption`), `videos`, `animal`/`event`, `cta`, autor/tiempo de lectura según disponibilidad.
4. **Redirect de slug histórico:** si hay `redirect`, reescribir URL sin recargar (`history.replaceState`) y mostrar ficha vigente (y/o redirect en prerender/hosting según `redirects`).
5. **Retiradas/410:** si `status:"gone"` o slug en retiradas, mostrar “Publicación retirada” con `noindex,nofollow`, sin canonical ni JSON-LD; en hosting/prerender servir 410 cuando sea posible.
6. **`pub.ficha` (C3, aditivo y opcional):** si existe, aplicar `ficha.plantilla`, `ficha.bloques`, `ficha.mostrarLectura` y ajustes de visibilidad; **si no existe, fallback total** al comportamiento actual. No leer `ficha` en listados; aplicarla en detalle/prerender.

##### A.4 SEO y metadatos

- **Title/description:** `seo.metaTitle` (o `title`) y `seo.metaDescription` (o `excerpt`).
- **Robots:** `seo.robots` / `indexable`; retiradas/error siempre `noindex`.
- **Canonical condicional:** usar **solo** `seo.canonical || canonical`. Si vacío, **no emitir** `<link rel="canonical">` ni `og:url`; nunca derivar de ruta relativa. En estado/listado, URL propia.
- **OG/Twitter:** `og:title`, `og:description`, `og:image`, `og:url` solo si hay canonical válido, `twitter:card` adecuado.
- **JSON-LD por tipo:** `animal` → `Article`, `evento` → `Event`, `historia` → `BlogPosting` (campos relevantes); único `<script type="application/ld+json">` en fichas válidas; **ninguno** en 404/error/retirada. `mainEntityOfPage` coherente con la canónica.
- **Dominio propio:** canonical/`og:url` absolutos a la URL pública definitiva de la ficha, consistentes entre HTML prerenderizado y metadatos.

##### A.5 Prerender, sitemap, robots y redirects (B3)

1. **Prerender/SSG por slug:** página HTML por publicación publicada con contenido, metas, OG/Twitter y JSON-LD renderizados (sin JS para indexación). Fuente: `publicaciones` paginado + `publicacion&slug=` + `retiradas` (equivalente a `scripts/prerender-publico.js` en `admin-dashboard`).
2. **Retiradas:** página `noindex,nofollow`, sin canonical/JSON-LD, fuera de sitemap; servir **410** si el hosting lo permite.
3. **`sitemap.xml` físico (raíz):** fichas publicadas/listadas/indexables; `lastmod` desde `updatedAt`/`publishedAt`; excluir borradores, ocultos, retirados y `listed:false`.
4. **`robots.txt` físico (raíz):** permitir público y `Sitemap: https://<dominio>/sitemap.xml`.
5. **Redirects 301:** desde `GET ?endpoint=redirects` en cada despliegue.
6. **Guarda de build:** fallar si canal no responde, faltan fichas o sitemap/robots inválidos.

##### A.6 Checklist de aceptación (eq. validación en simulación)

- [ ] Listado con contador/filtros/búsqueda/paginación y estados (sin resultados, canal sin configurar, error con reintento).
- [ ] Fichas `animal`/`evento`/`historia` correctas (datos, galería, vídeo, bloques, CTA).
- [ ] Metas, OG/Twitter, canonical condicional y JSON-LD correctos; sin JSON-LD en 404/error/retirada.
- [ ] 404 con `noindex,nofollow` y enlace al listado; slug histórico redirige/muestra ficha vigente.
- [ ] Retiradas `noindex,nofollow` (y 410 si posible), fuera de sitemap.
- [ ] `sitemap.xml` y `robots.txt` físicos en raíz, válidos.
- [ ] Redirects 301 activos desde mapa.
- [ ] Sin desbordes 360/1280 px; labels/`alt`/roles básicos.
- [ ] Fallback correcto sin `ficha`; con `ficha` respeta bloques/plantilla sin romper fichas antiguas.

##### A.7 Dependencias Track B

- **Dominio propio (A4, externo):** canonical absolutos, sitemap/robots en raíz y Search Console.
- **Canal desplegado:** `.gs` del canal pueden requerir despliegue manual para incluir soporte reciente (p. ej. `ficha` en detalle).
- **C3 aditivo:** consumir `ficha` de forma tolerante (ignorar claves desconocidas).

#### Parte A — EmailJS + reCAPTCHA v3 (enfoque inicial para formularios en `main`)

##### A.1 Objetivo y alcance

- Implementar en la **web pública (`main`)** los formularios públicos (adopción, acogida, contacto, voluntariado, donaciones, información…) usando **EmailJS** como transporte de envío desde el frontend, protegidos con **reCAPTCHA v3**.
- Enfoque rápido y sin backend propio: los datos viajan a EmailJS y se reenvían como email con plantillas específicas.
- **C4 (`forms/submit` en GAS) se pospone a futura evaluación.** Si el volumen crece o se requiere trazabilidad estructurada (hoja de cálculo, estados, antiabuso robusto), se migrará desde este enfoque a C4 backend.

##### A.2 Contexto y restricciones

- **Sin CORS/preflight:** EmailJS está diseñado para llamarse directamente desde el navegador; no hay problema de preflight como con `POST` JSON a GAS.
- **Claves públicas en frontend:** `service ID`, `template ID` y `public key` van expuestas en el código de `main`. No son secretos críticos (no permiten acceso a la cuenta de email), pero cualquiera puede verlas. Se mitiga con **reCAPTCHA v3** para reducir spam automatizado.
- **Validación de reCAPTCHA:** inicialmente en frontend (`grecaptcha.execute`). Para seguridad real, más adelante se puede añadir validación server-side con `RECAPTCHA_SECRET` en un backend intermedio (GAS o similar).
- **Sin registro estructurado propio:** los datos quedan en los emails enviados y (opcionalmente) en el historial de EmailJS según el plan contratado. No hay hoja de cálculo propia ni estados de solicitud a menos que se añada posteriormente.
- **Cuotas:** EmailJS tiene un plan gratuito con envíos mensuales limitados. Si el volumen crece, es necesario pasar a plan de pago o migrar a C4.
- **Privacidad:** aviso de privacidad/términos de Google (v3) y consentimiento (`privacy_accepted`), finalidad/retención definidos.

##### A.3 Claves y configuración

| Elemento | Valor / ubicación | Notas |
|---|---|---|
| **Site key (pública, v3)** | `<RECAPTCHA_SITE_KEY>` | Frontend/config pública. |
| **EmailJS Service ID** | Config pública de `main` | Obtener en dashboard de EmailJS. |
| **EmailJS Template IDs** | Config pública de `main` | Uno por tipo de formulario (adopción, acogida, contacto, etc.). |
| **EmailJS Public Key** | Config pública de `main` | Obtener en dashboard de EmailJS. |
| **Acción reCAPTCHA** | `form_submit` (fija) | Igual en cliente y servidor. |
| **Dominios** | Dominio real de `main` (y `localhost` solo pruebas) | Verificar en consola reCAPTCHA (v3). |
| **Umbral inicial** | `0.5` | Ajustar con datos reales. |

##### A.4 Implementación en `main` (web)

1. Crear cuenta en EmailJS y configurar servicio de envío (Gmail/Outlook/etc.).
2. Crear plantillas específicas: `adopcion`, `acogida`, `contacto`, `voluntariado`, `donaciones`, `informacion`, etc., con variables dinámicas (`{{nombre}}`, `{{email}}`, `{{mensaje}}`, etc.).
3. Añadir claves públicas a la configuración de `main` (no subir secretos al repo si es público).
4. Cargar `https://www.google.com/recaptcha/api.js?render=<SITE_KEY>` y mostrar aviso de privacidad/condiciones de Google.
5. En submit: `grecaptcha.execute(siteKey, {action:'form_submit'})`; si no hay token, bloquear.
6. Llamar a `emailjs.send(serviceID, templateID, templateParams, publicKey)` con los datos del formulario.
7. UX de confirmación genérica, evitar doble submit.
8. Validación cliente (UX) y CSP (`api.emailjs.com`, `cdn.jsdelivr.net` o CDN de EmailJS, `google.com`, `gstatic.com`, `recaptcha.net` si aplica) restrictiva.
9. Accesibilidad y consentimiento.

##### A.5 Checklist de aceptación (EmailJS)

- [ ] reCAPTCHA v3 genera token en submit (`action:"form_submit"`).
- [ ] EmailJS envía email con plantilla correcta según `form_type`.
- [ ] Usuario recibe acuse de recibo.
- [ ] CSP permite dominios de EmailJS y reCAPTCHA sin errores de consola.
- [ ] Formulario accesible y con consentimiento de privacidad.

---

#### Parte B — C4: Formularios públicos + reCAPTCHA v3 (`forms/submit`) en `main`

##### B.1 Objetivo y alcance

- Implementar en la **web pública (`main`)** los formularios que envían a `forms/submit` (C4), protegidos con **reCAPTCHA v3 verificado en servidor**.
- Backend de recepción/validación en **GAS** del ecosistema admin. Despliegue de `.gs` manual.

##### B.2 Contexto y restricciones

- **CORS/preflight en POST a GAS:** no fiable. No usar `fetch` JSON cross-origin como primera opción.
- **Transporte recomendado:** `<form>` `POST` `application/x-www-form-urlencoded` a **iframe oculto**. Respuesta cross-origin **no legible** → UX de confirmación genérica.
- **reCAPTCHA v3:** verificación **obligatoria en servidor** (`UrlFetchApp` → `siteverify`, secret en Script Properties). *Fail closed*.
- **Seguridad:** sin secretos en repos; site key pública en config; secret solo en Script Properties.
- **Cuotas/antiabuso:** límites de `UrlFetchApp`/`MailApp`/Sheets; validar/sanear, limitar tamaño/frecuencia, logs sin token/secret/PII.
- **Privacidad:** aviso de privacidad/términos de Google (v3) y consentimiento (`privacy_accepted`), finalidad/retención definidos.

##### B.3 Claves y configuración

| Elemento | Valor / ubicación | Notas |
|---|---|---|
| **Site key (pública, v3)** | `<RECAPTCHA_SITE_KEY>` | Frontend/config pública. |
| **Secret key (privada)** | Script Properties GAS: `RECAPTCHA_SECRET` | Ya indicada como añadida en GAS. No en repo/código. |
| **Acción** | `form_submit` (fija) | Igual en cliente y servidor. |
| **Dominios** | `gn-admin.github.io`, dominio real (y `localhost` solo pruebas) | Verificar en consola reCAPTCHA (v3). |
| **Umbral inicial** | `0.5` | Ajustar con datos reales. |
| **Hostname** | Dominios registrados | Validar en `siteverify`. |

##### B.4 Contrato propuesto `forms/submit`

**Estado:** propuesta C4, **no implementada** en el despliegue actual (el POST responde 401 «Token no proporcionado»). Mientras siga así, los formularios de `main` usan EmailJS (Parte A).

**Request (form-urlencoded, plano; anidados `fields[...]`):** `endpoint=forms-submit`, `form_type`, `concepto` (opcional), `fields[...]`, `page_url`, `privacy_accepted`, `recaptcha_token`, `recaptcha_action`.

**Procesamiento servidor (antes de efectos):** leer params → verificar reCAPTCHA (`success`, `action`, `hostname`, `score>=UMBRAL`, fail closed) → validar contrato/campos/sanear → antiabuso/cuotas → destino (Sheet/`MailApp` según `form_type`) → respuesta coherente (cliente puede no leerla) y registro sin token/secret/PII.

**Referencia:** transporte `admin-dashboard/src/js/forms-transport.js` (`buildPayload`, `submitViaIframe`) y verificación `admin-dashboard/apps-script/Code.gs` → `verificarRecaptchaV3`.

##### B.5 Implementación en `main` (web)

1. Inventariar/crear formularios y mapear campos al contrato.
2. Añadir site key a config pública.
3. Cargar `https://www.google.com/recaptcha/api.js?render=<SITE_KEY>` y mostrar aviso privacidad/condiciones de Google.
4. En submit: `grecaptcha.execute(siteKey,{action:'form_submit'})`; si no hay token, bloquear.
5. Enviar payload por **form POST a iframe oculto** al Web App GAS (`...?endpoint=forms-submit`) (adaptar `buildPayload`/`submitViaIframe`).
6. UX de confirmación genérica (sin lectura de respuesta), evitar doble submit.
7. Validación cliente (UX) y CSP (`google.com`, `gstatic.com`, `recaptcha.net` si aplica) restrictiva.
8. Accesibilidad y consentimiento.

##### B.6 Implementación en backend GAS (manual)

1. Endpoint público `POST forms-submit` enrutable antes de auth Firebase.
2. Verificar con `verificarRecaptchaV3` (`RECAPTCHA_SECRET`), validar `action`/`hostname`/`score` (fail closed).
3. Validar por `form_type`, sanear, aplicar cuotas y ejecutar destino; sin loguear token/secret/PII.
4. Calibrar umbral/hostnames y rate limiting.
5. Desplegar manualmente.

##### B.7 Checklist de aceptación

- [ ] Token generado en submit (`action:"form_submit"`) y enviado.
- [ ] GAS rechaza token ausente/inválido, acción/hostname incorrectos o score bajo (sin efectos).
- [ ] Con OK se ejecuta destino definido dentro de cuotas.
- [ ] Envío form+iframe con confirmación coherente sin leer respuesta.
- [ ] Doble envío controlado; validaciones y consentimiento operativos.
- [ ] Aviso privacidad/reCAPTCHA visible; sin secretos en repo.
- [ ] CSP sin bloqueos; dominios configurados; umbral/hostnames calibrados.

##### B.8 Decisiones abiertas

- Catálogo `form_type`, campos y destinos (Sheet/Mail/plantillas).
- Copy/flujo de confirmación y errores visibles.
- Política de privacidad, consentimiento y retención.
- Umbral definitivo y reglas antiabuso/rate limit.
- Idempotencia/confirmación adicional si aplica.

---

#### Referencias en `admin-dashboard` (consultar, no depender de copia)

- Canal/contrato/SEO de referencia: `GESTOR_WEB_PLAN_Y_ENDPOINTS.md`, `src/js/publico.js`, `scripts/prerender-publico.js`.
- Transporte C4: `src/js/forms-transport.js`. Verificación reCAPTCHA: `apps-script/Code.gs` (`verificarRecaptchaV3`).
- Estado: C3 groundwork aditivo (ficha en detalle, no en listados); D5 (login reCAPTCHA en admin) es flujo distinto a formularios de `main`.

---

#### Estado final del port (2026-11-22)

##### Verificado en `main`

- `node --test`: 41/41 OK (incluye SEO: canonical único y JSON-LD coherente).
- `node --check` en `js/main.js`, `scripts/prerender.js`: OK.
- Prerender en seco contra el canal: 7 fichas + 5 lápidas, 15 URLs en sitemap, 0 errores.
- Canal en vivo: `type=evento` → 1 item; `taxonomias` y `config-publica` OK.
- Navegación incluye `grupos.html`; `grupos.html` sin tarjetas de acogida sobrantes.
- Mapeo de sección en `main/js/main.js` cubre `acogidas`, `adoptados`, `casosExternos`, `grupos`, `eventos` vía `getPostsFor`.

##### Pendiente manual (M5)

1. Subir `WebPublicaciones.gs` + `Code.gs` a GAS.
2. Configurar propiedades del script: `GITHUB_DEPLOY_REPO_MAIN=gn-admin/main`, `GITHUB_DEPLOY_WORKFLOW_MAIN=pages.yml`.
3. Verificar disparo E2E: publicar en el gestor → run de `pages.yml` en `main` en < 5 min.
4. Confirmar que `main` es la única canónica indexable (sitemap de `main` sin URLs de `admin-dashboard`).

## 5. Contratos de adopción y acogida

> **Origen:** `PLAN_CONTRATOS_ADOPCION_Y_ACOGIDA.md` (retirado el 2026-11-23). El detalle entregado (F-C0…F-C5, modelo de datos, PDF, textos y verificación en producción) está en `memory.md`; aquí queda el estado operativo completo.

**Estado:** implementado y cerrado en código (F-C0…F-C5, 2026-11-18/19). Queda solo la prueba con impresora real (decisión D-C17: sin numeración de página por ahora).

- [ ] **Prueba con impresora real** de los contratos de adopción y acogida: comprobar los márgenes de la máquina, que el sello y las firmas caigan dentro y que la acogida quepa en una cara. El QA con Edge headless ya está hecho; la prueba en papel no.
- [ ] **Numeración de páginas (D-C17):** decidir entre (a) no numerar, (b) migrar a un motor PDF o (c) pie manual. Por ahora (a): Chrome no soporta *margin boxes* de `@page`; se revisa si se adopta un motor PDF.
- [ ] **Contrato de acogida por correo:** hoy el panel solo lo imprime/descarga; `sendContratoEmail` no tiene modelo, asunto ni plantilla de acogida y lo rechaza con aviso. Si se decide conectar el envío, faltan esos tres elementos y el arnés de pruebas.
- [ ] **Verificación tras cambios:** tras cualquier cambio en `PdfExport`/`ContratoModelo`, repetir `.internal-docs/verificar-pdf-contrato.js` contra un contrato real (páginas, imágenes, «[Sin firma]», 20 estipulaciones, importes, foto en la fila «Fotografía» y párrafo de la asociación).

## 6. Decisiones abiertas y otros pendientes

- [ ] **D7 / H-6 — `author`/`contact`:** `autor` se guarda, pero el contacto cae al de la asociación. Falta decidir y documentar la política pública.
- [ ] **H-7 — orden de publicaciones:** el campo `orden` existe en el modelo, pero no hay control en la UI; el orden depende de la hoja.
- [ ] **H-4 — importar desde ficha / refresco manual:** la propagación solo va de publicación → ficha; falta el sentido inverso y un refresco manual.
- [ ] **H-5 — publicación desactualizada:** cambiar un miembro no regenera la estática; falta aviso y acción de refresco/deploy.
- [x] **H-8 — documentación desalineada:** cerrado en la consolidación de 2026-11-23. `memory.md` ya separa entregado y pendiente, `PENDIENTES.md` recoge la verificación real de F0–F5 y `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` ya no lista `config` como público (es `config-publica`; el antiguo responde 401).
- [ ] **R1 — grupos en acogidas:** pendiente de decidir entre incluir `animal_grupo` en `animales-publicos` o añadir `groups=1`; mientras tanto, `publicaciones&status=en_acogida` es el puente. Detalle completo en §3.

**Hallazgos H-4…H-8 de la auditoría de funciones (texto completo):**

| ID | Hallazgo | Evidencia | Impacto | Coste | Estado |
|---|---|---|---|---|---|
| **H-4** | No hay «importar desde ficha» ni refresco manual de la publicación | propagación solo publicación → ficha (`_propagarMediaAFicha` 1341) | Retrabajo si cambia la ficha interna | M | Abierto |
| **H-5** | Cambiar un miembro no regenera la estática | el deploy se decide en `_webAnotarDeploy` a partir de las rutas del gestor | Web desfasada hasta el cron (30 min), sin aviso | M | Abierto |
| **H-6** | D7 sin cerrar (`author`/`contact`) | `autor` se guarda; contacto cae al de la asociación | Política pública sin documentar | S | Abierto (D7) |
| **H-7** | Sin orden de publicaciones | campo `orden` en el modelo, sin control en UI | Orden depende de la hoja | S | Abierto |
| **H-8** | Documentación desalineada | `memory.md` dice «sin pendientes»; plan marca F0–F5 cerradas; §5.3 lista `config` como público y hoy es 401 | Decisiones mal informadas | S | **✅ cerrado** (consolidación 2026-11-23) |

**H-1…H-3** quedaron cerrados y verificados (detalle en `memory.md`): exclusividad 1:1 en las dos direcciones, selector sin miembros de grupo obligatorio y chip del estado del grupo en la ficha del miembro.

## 7. UI/UX — backlog completo

> **Origen:** `MEJORAS_UI_UX_PENDIENTES.md` (retirado el 2026-11-23). Texto completo, sin resumir.
> **Estado actual:** backlog completo y congelado a propósito; no se ha aplicado. Se retoma después de cerrar la lógica del gestor, salvo regresiones que bloqueen el uso.

### Mejoras de UI/UX pendientes

Backlog de interfaz y experiencia **congelado a propósito**: primero se cierra la
lógica del gestor, después se aplica esto de una vez. Sirve para no perder lo
detectado y para no mezclar refactors visuales con cambios de comportamiento.

- **Origen:** QA del gestor a 390 / 768 / 900 / 1280 px con la sesión de pruebas
  (`gn.test.coordinador@example.test`).
- **Verificado contra el código** (`src/js/web.js`, `src/js/dashboard.js`,
  `src/index.html`, `src/css/styles.css`) el 2026-11-18. Cuando una ficha lleva
  archivo y línea, la comprobación es de código; cuando lleva medidas, es del
  navegador. Estado del service worker: v283.
- **Regla mientras haya lógica en curso:** no se toca nada de esta lista salvo
  que sea una regresión (algo que se rompa y bloquee el uso).

#### Cómo leer cada ficha

**Dónde** (selector o archivo), **evidencia** (medida o referencia real, no
impresión), **coste** (S ≈ media sesión, M ≈ una sesión, L ≈ varias) y
**dependencias** si las tiene.

Severidades:

- **S1** defecto visible o medido que estorba al usar el gestor.
- **S2** fricción o inconsistencia que se nota pero se puede esquivar.
- **S3** pulido, coherencia a futuro o decisión pendiente.

---

#### A. Defectos medidos

##### A1 · El formulario de publicación es un scroll larguísimo — S1 · coste M

- **Dónde:** formulario de publicación de animal (`src/js/web.js`, `<details>`
  de las líneas 725, 749, 808 y 812), a 390 px.
- **Evidencia:** 3.533 px de scroll dentro de un cuerpo de 710 px. Tiene **cuatro
  bloques plegables** (Media, Ficha pública, Presentación, CTA y SEO) y los
  campos sueltos de arriba; aun así «Guardar publicación» queda lejísimos.
- **Propuesta:** abrir por defecto solo los bloques con cambios o incompletos,
  resumen de una línea por bloque cerrado e índice pegajoso; alternativa:
  dividir en 2–3 pasos.
- **Ojo:** cambia el orden de tabulación y el estado de foco; hacerlo junto con
  la validación (B1).

##### A2 · La barra de acciones tapa contenido al hacer scroll — S1 · coste S

- **Dónde:** `.modal-body--form .form-actions` (`position: sticky`).
- **Evidencia:** a 390 px la barra ocupa 698–819 px y el contenido del formulario
  sigue por debajo; el texto desaparece bajo el pie mientras se desplaza.
- **Propuesta:** sombra o borde superior que aparezca solo al quedar pegada
  (`IntersectionObserver`) y `scroll-margin-bottom` en los campos para que el
  foco no los deje justo debajo del pie.
- **Nota:** el aire inferior ya está resuelto (`padding-bottom: 16px` hasta
  1023 px y con punteros gruesos).

##### A3 · Seis botones por fila en una columna de ~152 px — S2 · coste S/M

- **Dónde:** `td.table-actions` de `.web-tabla` (`src/js/web.js` 420–432).
- **Evidencia:** una fila de animal puede llevar **Preview, Ver ficha, Copiar
  enlace, Publicar/Ocultar, Retirar y Eliminar borrador**; a 768 px la columna
  queda en ~152 px y los botones caen en vertical, estirando la fila.
- **Propuesta:** menú de acciones (botón «⋯» con `aria-expanded`) para las
  secundarias y dejar visible solo la principal.

##### A4 · Etiquetas del modo tarjeta a ancho fijo — S2 · coste S

- **Dónde:** `.card .data-table td::before { flex: 0 0 42% }`.
- **Evidencia:** a 390 px los valores largos se parten mucho («Estado web — Sin
  configurar» en tres líneas). El contador de grupo ya está arreglado aparte.
- **Propuesta:** etiqueta encima del valor (lista de dos líneas) o
  `flex: 0 1 auto` con `min-width: 30%`.

##### A5 · Estadísticas del gestor ocupan casi dos pantallas — S2 · coste S

- **Dónde:** `.web-stats` en `@media (max-width: 720px)` (2 columnas); las seis
  tarjetas se generan en `src/js/web.js` ~366–371.
- **Evidencia:** Publicados, Borradores, Ocultos, Retiradas, Sin configurar e
  Incompletos empujan la lista de publicaciones por debajo del primer scroll.
- **Propuesta:** fila horizontal desplazable o chip compacto con el número
  primero.

##### A6 · Preview del JSON con mucho scroll vertical — S2 · coste S/M

- **Dónde:** `.web-preview-json` (`max-height: 60vh`, `src/css/styles.css` 8300).
- **Evidencia:** a 390 px son 2.199 px de contenido dentro del `<pre>`; el scroll
  lateral ya está resuelto (`pre-wrap`).
- **Propuesta:** plegar objetos por nivel, resaltar claves, o mostrar un resumen
  (slug, estado, campos publicados) y el JSON completo tras «Ver JSON».
  Mantener «Copiar JSON».

##### A7 · El pie del preview no queda fijo y el botón roza el borde — S2 · coste S

- **Dónde:** modal de previsualización (`src/js/web.js` 1725 y 1992): las
  acciones son un `.form-actions` **dentro del `.modal-body`**, no un
  `.modal-footer`, así que no reciben el área segura del pie.
- **Evidencia (390 px):** a scroll 0 el botón «Cerrar» acaba en 842 px con la caja
  del modal en 836 (recortado por `overflow: hidden`); hay que desplazar 22 px
  para verlo entero y aun así queda a 2 px del borde inferior.
- **Propuesta:** usar `.modal-footer` (o el patrón de pie del resto de modales,
  con `env(safe-area-inset-bottom)`) y no meter acciones en el cuerpo.

---

#### B. Formularios, errores y validación

##### B1 · Los errores no se asocian al campo — S1 · coste M

- **Dónde:** todo el panel (`aria-invalid` = 0 y `aria-describedby` = 0 en `src/`).
- **Evidencia:** hay mensajes de error, pero el input no queda marcado como
  inválido ni enlazado a su texto; un lector de pantalla lee el campo como
  válido y el error solo se anuncia si cae en una región viva.
- **Propuesta:** helper único que pinte `.form-error` con `id`, añada
  `aria-invalid="true"` y `aria-describedby` al control, y devuelva el foco al
  primer campo con error al intentar guardar.

##### B2 · `autocomplete` / `inputmode` casi sin usar — S2 · coste S

- **Dónde:** 2 apariciones de `autocomplete=` y 6 de `inputmode` en `src/`.
- **Evidencia:** teléfono, email de contacto, DNI, importes y fechas no piden el
  teclado adecuado ni dejan que el navegador rellene.
- **Propuesta:** repasar por tipo de campo (`inputmode="tel|numeric|decimal"`,
  `autocomplete="tel|email|name"`, `type="date"` donde toque).

##### B3 · Validación nativa mezclada con la propia — S2 · coste S

- **Dónde:** `novalidate` = 0 en el código.
- **Evidencia:** conviven mensajes del navegador (en el idioma del sistema) con
  los del panel (en español).
- **Propuesta:** `novalidate` + validación propia con mensajes en español, junto
  con B1.

##### B4 · Confirmaciones: modal propio con dos fugas — S2 · coste S

- **Dónde:** `#confirm-modal` (`src/index.html` 357) y `Dashboard._confirm`
  (`src/js/dashboard.js` ~1419), con 34 usos ya migrados.
- **Evidencia:** el modal propio existe, tiene título, texto, etiqueta de botón y
  captura de foco. Quedan **dos `window.confirm` nativos**: borrar media
  (`src/js/web.js` 1164) y el respaldo cuando falta el modal
  (`src/js/dashboard.js` 1421).
- **Propuesta:** migrar esos dos, y revisar que todos los call sites destructivos
  usan `_confirm` con etiqueta explícita («Retirar», no «Confirmar»).

---

#### C. Diálogos, foco y teclado

##### C1 · Confirmaciones sin `role="alertdialog"` — S2 · coste S

- **Dónde:** `#confirm-modal` declara `role="dialog" aria-modal="true"`;
  `role="alertdialog"` no aparece en `src/`.
- **Evidencia:** las confirmaciones destructivas se anuncian como diálogo normal,
  sin la carga de alerta que sí tienen otros paneles.
- **Propuesta:** `role="alertdialog"` en el modal de confirmación (y en el de
  borrado), con el foco inicial en «Cancelar».

##### C2 · Foco en diálogos anidados — S2 · coste S

- **Dónde:** el selector de publicación/media (`src/js/web.js` 614–616,
  `web-picker-dialog` con `aria-modal="true"`) se abre sobre el formulario.
- **Evidencia:** la restauración de foco por modal existe (fases anteriores),
  pero no está probada en dos niveles.
- **Propuesta:** prueba manual de teclado (Tab, Escape, volver) y ajuste si el
  foco vuelve al contenedor en lugar del botón que abrió.

##### C3 · Las tablas no se recorren con teclado — S3 · coste M

- **Dónde:** `_filaAnimal` (`src/js/web.js` 411): el nombre va en un `<b>`, no es
  foco ni enlace.
- **Evidencia:** para abrir una ficha hay que tabular hasta los botones de la
  fila; no se puede llegar al nombre.
- **Propuesta:** decidir si el gestor necesita patrón de rejilla o basta con que
  el nombre sea un botón/enlace que abra la publicación.

---

#### D. Móvil y tablet restantes

##### D1 · Orden visual y de tabulación en formularios a 2 columnas — S2 · coste S

- **Dónde:** formulario de publicación a 768 px (Ciudad/Provincia, Vacunado/
  Desparasitado…), `.form-row`.
- **Evidencia:** dos columnas a partir de 768 px; hay que confirmar que el orden
  del DOM coincide con el visual en cada bloque.
- **Propuesta:** auditar con Tab en 768 y reordenar el marcado si hiciera falta.

##### D2 · Filtros y acciones del gestor apilados a 390 — S3 · coste S

- **Evidencia:** buscador, selector de estado y tres botones de acción ocupan casi
  una pantalla antes de la lista.
- **Propuesta:** acciones en un menú y filtros en una fila desplazable.

##### D3 · Botones de 36 px en escritorio fino — S3 · coste S

- **Evidencia:** `.btn-sm` mide 36 px a 768/1280 con puntero fino; en táctil sube a
  44 px por la regla `(max-width: 767px), (pointer: coarse)`. No incumple AA
  (mínimo 24 px), pero es pequeño para tablet con ratón.
- **Propuesta:** subir `.btn-sm` a 40 px y revisar la escala completa (36/40/44)
  de una vez.

---

#### E. Sistema de diseño y temas

##### E1 · No hay tema oscuro — S3 · coste L (decisión primero)

- **Evidencia:** 0 apariciones de `prefers-color-scheme` y de `data-theme`.
- **Propuesta:** decidir si se quiere. Si sí, hay que tokenizar los colores en
  crudo (hay muchos `rgb()` y hex sueltos en `styles.css`) y añadir un selector.

##### E2 · `styles.css` con 8.422 líneas y parches por fase — S3 · coste L

- **Evidencia:** reglas del mismo componente repartidas en varios bloques; el
  ajuste de esta semana acabó con dos declaraciones duplicadas del mismo valor
  (se quitaron en `d72c009`).
- **Propuesta:** separar tokens, base, componentes y módulos; borrar duplicados y
  reglas muertas. Hacerlo **después** de la lógica, porque toca todo.

##### E3 · Escala de espaciados y radios sin norma escrita — S3 · coste M

- **Evidencia:** en `styles.css` conviven `padding: 10px` (36 usos), `12px` (40),
  `14px` (20) y `16px` (17), y radios de 10 px (38), 12 px (16) y 16 px (4) en
  componentes equivalentes.
- **Propuesta:** fijar una escala corta (4/8/12/16/24) y aplicarla por componente,
  no a ciegas.

---

#### F. Rendimiento percibido y feedback

##### F1 · Arranque en frío del gestor web tarda unos segundos — S2 · coste S/M

- **Evidencia:** tras borrar caché y service worker, en las pruebas de esta semana
  el módulo Web tardó ~3 s en pintar filas (observación de las esperas, sin
  instrumentación); durante ese rato se ve estructura sin datos.
- **Propuesta:** esqueleto específico de tabla (existe `.page-skeleton`),
  `aria-busy` en el contenedor mientras carga y aviso si pasa de 3 s.

##### F2 · Sin control de cambios sin guardar — S3 · coste M

- **Dónde:** el único `beforeunload` del panel es `flushPendingOps`
  (`src/js/dashboard.js` 75), que vacía la cola de operaciones; no vigila
  formularios.
- **Evidencia:** cerrar el modal de publicación con cambios no avisa de nada.
- **Propuesta:** marcar el bloque modificado y confirmar al cerrar con cambios
  pendientes (relacionado con A1).

---

#### G. Contenido y microcopy

##### G1 · Textos de ayuda con formatos distintos — S3 · coste S

- **Dónde:** `src/js/web.js` 803 (`Heredado: …` bajo los selects) y 749–760
  (grid de datos heredados con «Sin dato» / «—»).
- **Evidencia:** conviven «Heredado: Sí», «Heredado: Sin dato» y valores «—» para
  el mismo concepto de dato ausente.
- **Propuesta:** un único formato para «heredado» y para «vacío», y una línea de
  ayuda como máximo por campo.

##### G2 · Avisos de despliegue con tiempos — S3 · coste S

- **Dónde:** `src/js/web.js` 290, 291, 1842 y 1844 («en 2–3 min»).
- **Propuesta:** confirmar el tiempo real y, si varía, quitar el número o enlazar
  al estado del deploy.

---

#### H. Deuda de marcado detectada

##### H1 · Prefijo `we-` para la lista de media de eventos — S3 · coste S

- **Dónde:** `src/js/web.js` 744 (`web-media-lista`), 1274 (`we-media-lista`),
  1556 (`wg-media-lista`); los pinta `_pintarMediaFormulario(prefijo)` (1154) con
  los prefijos `'web'`, `'we'` y `'wg'` (841, 1338, 1633).
- **Evidencia:** funciona, pero el prefijo del formulario de eventos es `we` donde
  el resto usa `web`/`wg`; invita a errores al buscar el id.
- **Propuesta:** renombrar a `web-media-lista`, `wevento-media-lista` y
  `wgrupo-media-lista` (o un `data-prefijo` único) en una sola pasada.

##### H2 · `aria-live` que se reescribe entero — S3 · coste S

- **Dónde:** `_pintarMediaFormulario` (1154) hace `cont.innerHTML = ...` sobre la
  región viva de los tres formularios.
- **Evidencia:** cada cambio reemplaza la lista completa, así que el anuncio
  puede repetir todos los archivos o no oírse, según el lector.
- **Propuesta:** región viva aparte que anuncie solo el cambio («3 archivos
  añadidos», «Portada borrada») y dejar la lista sin `aria-live`.

---

#### Lo que queda fuera de este documento

- **Lógica y funcionalidad** (filtros nuevos, acciones en lote, flujos de
  grupos): va antes que todo esto, por decisión del equipo.
- **El port al proyecto `main`**: entrega externa, ver §4 de este documento.
- **Pruebas con lector de pantalla real** (NVDA/VoiceOver): no se han hecho; lo
  comprobado es el árbol de accesibilidad y medidas del DOM. Conviene una pasada
  al cerrar el bloque B.

#### Orden sugerido cuando se retome

1. **A1–A2 + B1–B3** (formulario: altura, pie pegajoso, errores asociados).
2. **B4 + C1–C2** (confirmaciones: dos fugas, `alertdialog`, foco anidado).
3. **A3–A7, D1–D3** (tablas, preview, tarjetas y feedback de carga).
4. **E1–E3** (tema y consolidación de CSS), al final porque toca todo.

## 8. Documentos absorbidos y cobertura

Estos documentos se consolidaron aquí y se retiraron del árbol de trabajo. Su contenido completo sigue en el historial de git (commit anterior a la consolidación).

| Documento retirado | Dónde queda |
|---|---|
| `CHECKLIST_PRODUCCION_F0_F5.md` | §1, texto completo |
| `PLAN_SEGURIDAD.md` | §2, texto completo |
| `PRUEBAS_POR_ROL_D6.md` | §2, texto completo |
| `REQUISITOS_WEB_CANAL_PUBLICO.md` | §3, texto completo |
| `TRANSFERIR_A_MAIN.md` | §4, texto completo |
| `PLAN_CONTRATOS_ADOPCION_Y_ACOGIDA.md` | §5 (pendientes operativos); entregado en `memory.md` |
| `MEJORAS_UI_UX_PENDIENTES.md` | §7, texto completo |
| `AUDITORIA_FUNCIONES_F0_F5.md` | §6 (H-4…H-8) y `memory.md` (H-1…H-3, producción y pruebas) |
| `AUDITORIA-E2E.md` | `memory.md` (37/37 escenarios) |
| `F0_MAPA_CAMPOS_Y_CONTRATO.md` | `memory.md` (contrato F0, D1–D8, G-D1…G-D7) |
| `F4_GRUPOS_MINIPROPUESTA.md` | `memory.md` (G1, composición y exclusividad) |
| `PLAN_GESTOR_FICHAS_PUBLICACIONES.md` | `memory.md` (fases F0–F5) |
| `PROGRESO.md`, `PLAN_MASTER_EJECUCION.md`, `PLAN_ANALISIS_Y_EJECUCION.md` | `memory.md` (planificación y análisis; sin entrega de código propia) |

**Se mantienen:** `AGENTS.md` (reglas), `README.md` (arranque), `memory.md` (entregado) y `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` (contrato de referencia).

> Este documento no sustituye a `.internal-docs/`: los IDs, credenciales y detalles operativos sensibles siguen ahí.
