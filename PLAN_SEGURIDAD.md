# Plan de seguridad — Admin Dashboard (Grupo Nebak)

> **Objetivo:** elevar la postura de seguridad del proyecto desde un estado estimado **~60%** hasta **80–85%** (objetivo recomendado) dentro de las limitaciones del stack: **GitHub Pages (repo/app pública, sin cabeceras HTTP de servidor)** + **Firebase Auth** + **Google Apps Script (GAS)** + hojas de cálculo.
>
> **Nota:** los porcentajes son **estimaciones orientativas** (no métricas absolutas). La seguridad efectiva depende en gran medida del backend (GAS/Firebase/hojas), no totalmente auditable desde este repositorio. El máximo práctico en este stack se estima en **~85–90%**.
>
> **Restricciones vigentes:** no versionar secretos; token de API en `?token=` (sin preflight/CORS completo en GAS); CSP solo vía `<meta>` en GitHub Pages; rutas relativas; backend como fuente de verdad de permisos.

---

## Línea base (estimada): ~60%

**Supuestos del estado actual (resumen):**
- Autenticación con Firebase (email/contraseña); perfil/rol obtenido de `user-profile` (GAS).
- Control de permisos por rol en frontend; fallback no admin (`consulta`); `consulta` reducido a `dashboard` y `animales` (solo lectura) y sin edición.
- Secretos fuera de git (`.env`, `src/js/config.js`, `apps-script/*`, `.internal-docs/*`).
- Caché de datos en `localStorage` y Service Worker; token de API en URL; CSP por `<meta>`.
- Auditoría/historial dependientes de configuración correcta en GAS/hojas (cabeceras añadidas en hojas, validar operación real).

**Principales brechas:** autorización y validación no verificables en GAS, usuarios no reconocidos sin bloqueo explícito en backend, exposición potencial del token en URL, datos residuales en cliente, ausencia confirmada de MFA/reCAPTCHA/App Check, ausencia de canal público separado para consumo externo.

---

## Hoja de ruta (cambios y % alcanzado)

Cada hito indica el **% estimado alcanzado tras completarlo** (acumulado). Completar un hito implica su verificación/aceptación.

### Fase 0 — Preparación y baseline (sin cambio de % de seguridad, habilita el plan)
- **Acciones**
  - Inventariar: endpoints GAS en uso, hojas/IDs, roles actuales, cuentas admin, dónde se genera/usa el token de API, datos cacheados (`gn_*`, `gn_cache_*`) y flujos sensibles (adopciones, socios, blacklist, donaciones, documentos).
  - Definir matriz de permisos objetivo (por rol y módulo: leer/escribir) y política para “usuario no reconocido”.
  - Establecer checklist de verificación (frontend, GAS, Firebase, hojas) y responsable por hito.
- **Dónde:** documentación operativa interna (no versionada) + este plan.
- **Criterio de aceptación:** inventario y matriz aprobados; responsables asignados.
- **% alcanzado tras Fase 0:** **~60%** (línea base)

---

### Fase 1 — Control de acceso: mínimo privilegio y denegación por defecto
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

### Fase 2 — Protección de credenciales y acceso al API
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

### Fase 3 — Minimización de datos y endurecimiento del cliente
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

### Fase 4 — Separación de superficies y exposición pública controlada
**Objetivo:** poder alimentar la web pública sin exponer el API/admin interno.

8. **4.1 Canal público de solo lectura (para web externa)** *(GAS + nueva web, externo)*
   - Crear endpoint/feed **público y separado** (o exportación estática periódica) con **lista blanca** de campos y solo registros/estados publicables (p. ej. fichas de animales públicas, eventos publicados).
   - Nunca reutilizar el token/API de administración; sin datos personales/sensibles (adoptantes, documentos, contratos, gastos, notas internas, etc.).
   - Aplicar CORS para el dominio público, caché y, si es dinámico, límites de uso razonables.
   - **Criterio:** la web pública consume solo el canal público; imposible obtener datos internos desde ese canal.
   - **% alcanzado:** **~82%**

---

### Fase 5 — Trazabilidad, verificación y operación continua
**Objetivo:** detectar incidentes, validar controles y sostener el nivel alcanzado.

9. **5.1 Auditoría e historial operativos** *(GAS/hojas + verificación, externo)*
   - Verificar que `auditoria` (cabeceras mínimas ya definidas) e `historial-fases-adopcion` registran y leen correctamente en producción (endpoints, IDs de hoja, permisos de ejecución).
   - Asegurar que eventos críticos quedan trazados (altas/bajas/cambios de rol, cambios de fase, anulaciones/devoluciones, accesos relevantes si aplica).
   - **Criterio:** registros correctos visibles y consultables; sin errores en ejecuciones de GAS.
   - **% alcanzado:** **~83%**

10. **5.2 Pruebas de seguridad y revisión periódica** *(operativo + repo)*
    - Pruebas por rol (incluido `sin_acceso` y `consulta`): acceso/denegación en UI y, sobre todo, en **endpoints GAS**.
    - Revisión periódica: accesos Firebase/GAS, rotación de credenciales cuando proceda, dependencias, y coherencia Roles↔usuarios.
    - Documentar procedimiento de respuesta ante sospecha de exposición (rotar token, revisar logs/auditoría, revocar accesos).
    - **Criterio:** checklist de pruebas pasado; calendario/procedimiento de revisión definido.
    - **% alcanzado:** **~84–85%**

---

## Resumen de progresión (estimada)

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

## Clasificación por ámbito (para ejecución)

- **Repositorio (este proyecto):** 1.2, 3.1, 3.2 (y apoyo a 5.2 con pruebas).
- **GAS / Hojas / Backend (externo):** 1.1, parte de 1.3, 2.2 (lado servidor/token), 4.1, 5.1.
- **Firebase (configuración):** 2.1.
- **Operativo/procesos:** 0, 1.3, 2.2 (rotación/procedimiento), 5.2.

## Registro de avance

| Fecha | Hito(s) | Cambio realizado | % alcanzado | Responsable | Evidencia/Notas |
|---|---|---|---:|---|---|
| — | Base | Línea base documentada | ~60% | — | Estado inicial estimado |
| 2026-11-12 | 1.2 (parcial, frontend) | Añadido rol `sin_acceso` (sin páginas), bloqueo de navegación/cargas en background/home/estados/notas/refresco cuando el rol es `sin_acceso`, y pantalla “Sin acceso autorizado”. Requiere 1.1 en backend (GAS) para denegar/no degradar usuarios no reconocidos y devolver `sin_acceso`. | ~61% | — | Commit `f3e68e3`, desplegado en `v201`. Tests 357/357. |

> Actualizar esta tabla al completar cada hito, indicando evidencia (commit, captura/config, resultado de prueba o verificación en GAS/Firebase).
