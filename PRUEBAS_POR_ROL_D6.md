# Pruebas por rol y procedimiento (D6 / 5.2)

> Checklist operativo para validar autorización, visibilidad y acciones por rol tras D1. **Sin secretos**: no incluir tokens, contraseñas, IDs reales sensibles ni datos personales. Ejecutar en entorno de pruebas y, cuando aplique, verificar también por API directa.

## 0. Estado de verificación (2026-11-15)

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

## 1. Roles esperados

| Rol | Acceso esperado (resumen) |
|---|---|
| `admin` | Acceso total (lectura/escritura, configuración, gestor web, borrados/exportaciones según políticas). |
| `coordinador` | Gestión operativa y gestor web (`web-*`), sin configuración/sistema reservada a admin. |
| `voluntario` | Operativa básica (animales, docs/galería, seguimiento/notas según política); sin datos sensibles/contratos/blacklist/finanzas globales restringidos. |
| `tesoreria` | Donaciones, gastos, apadrinamientos, inventario y reportes económicos permitidos; resto limitado. |
| `consulta` | Solo lectura (acotada por política/filtros); sin escrituras. |
| `sin_acceso` | **Denegación por defecto** (no reconocido o revocado): solo `user-profile` con datos mínimos; sin lecturas operativas ni escrituras. |

## 2. Precondiciones

- [ ] D1 desplegado en Apps Script (`Code.gs`, `Auth.gs`, `Roles.gs`, y `WebPublicaciones.gs` si aplica) y `ROLES_USUARIOS`/`ADMIN_EMAILS` actualizados con todos los usuarios legítimos (emails normalizados).
- [ ] Probar con al menos un usuario por rol y un usuario **no listado/revocado** (caso `sin_acceso`).
- [ ] Tras cambiar rol en hoja, el usuario cierra sesión y vuelve a entrar (re-login) para reflejar el cambio.
- [ ] Registrar resultados (fecha, entorno, rol, caso, OK/Fallo, observación) sin datos sensibles.

## 3. Casos mínimos por rol

### 3.1 `sin_acceso` (no reconocido / revocado) — crítico
- [ ] Login correcto en Firebase pero perfil de app resuelto como `sin_acceso`.
- [ ] `GET user-profile` devuelve solo datos mínimos esperados (p. ej. `role: "sin_acceso"`, `email`) y **no** expone datos operativos adicionales.
- [ ] La UI muestra estado de sin acceso/bloqueo y no permite navegar/operar módulos.
- [ ] Lecturas a endpoints operativos (`animales`, `familias`, `adopciones`, `web-*`, etc.) devueltas como no autorizadas.
- [ ] Escrituras (POST/acciones) denegadas.
- [ ] **API directa** (con token del usuario): confirmar denegación por endpoint, no solo ocultación en UI.

### 3.2 `consulta`
- [ ] Puede ver datos permitidos en solo lectura.
- [ ] No puede crear/editar/eliminar registros ni ejecutar acciones de escritura.
- [ ] Acceso a `web-*` denegado (según política actual).
- [ ] API directa: escrituras denegadas.

### 3.3 `voluntario`
- [ ] Acceso operativo permitido (animales, documentos/galería, seguimiento/notas según alcance).
- [ ] Sin acceso a datos/acciones restringidas (p. ej. blacklist, finanzas globales, contratos u otros según política).
- [ ] `web-*` denegado.
- [ ] API directa: endpoints/acciones fuera de alcance denegados.

### 3.4 `tesoreria`
- [ ] Acceso a donaciones, gastos, apadrinamientos, inventario y vistas/reportes económicos permitidos.
- [ ] Resto de módulos/acciones fuera de alcance denegados.
- [ ] `web-*` denegado.
- [ ] API directa: denegación coherente con UI.

### 3.5 `coordinador`
- [ ] Gestión operativa permitida y acceso al gestor web (`web-*`) según política.
- [ ] Sin capacidades reservadas a admin (configuración/sistema) si aplica.
- [ ] API directa: lectura/escritura permitida en alcance definido.

### 3.6 `admin`
- [ ] Acceso total esperado.
- [ ] `user-profile` completo (`uid`, `email`, `role`, `name`).
- [ ] Operaciones sensibles/admin funcionan (según políticas y auditoría).

## 4. Casos transversales

- [ ] **Normalización de email**: mismo usuario con mayúsculas/espacios en origen se resuelve al rol correcto.
- [ ] **Revocación**: usuario pasado a revocado/inactivo pasa a `sin_acceso` tras re-login.
- [ ] **No listado**: usuario autenticado no presente en roles/admins → `sin_acceso`.
- [ ] **Canal público** (`/api/publicaciones`, `publicacion`, `retiradas`, `sitemap`, etc.): sigue siendo de solo lectura y accesible sin sesión del panel (no debe requerir token).
- [ ] **C1 gestor web**: retirar/restaurar (evento/historia) respeta permisos (`web-*`), audita, y el canal refleja el estado (considerar cache ~60 s; validar con `nocache=1` si procede).
- [ ] **Errores**: las denegaciones devuelven respuesta clara (403/no autorizado) sin filtrar datos.

## 5. Procedimiento de revisión periódica

- Revisar altas/bajas/cambios de rol al modificar el equipo (mínimo privilegio).
- Repetir esta matriz tras cambios en `Auth.gs`/`Roles.gs`/`Code.gs` o en reglas de permisos.
- Verificar periódicamente auditoría/historial operativo (D3) y rotación/exposición de token (D4).

## 6. Respuesta a incidentes (básica)

- **Acceso indebido detectado**: revocar/ajustar rol en hoja, forzar re-login, revisar auditoría de acciones recientes, rotar credenciales/token si hay sospecha de exposición.
- **Usuario legítimo bloqueado (`sin_acceso`)**: comprobar email normalizado en `ROLES_USUARIOS`/`ADMIN_EMAILS`, rol activo y re-login.
- Documentar incidente, causa y corrección (sin incluir secretos ni datos personales innecesarios).
