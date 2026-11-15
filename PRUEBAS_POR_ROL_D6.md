# Pruebas por rol y procedimiento (D6 / 5.2)

> Checklist operativo para validar autorización, visibilidad y acciones por rol tras D1. **Sin secretos**: no incluir tokens, contraseñas, IDs reales sensibles ni datos personales. Ejecutar en entorno de pruebas y, cuando aplique, verificar también por API directa.

## 0. Estado de verificación (2026-11-15)

**Automatizado en repo:** `tests/roles-d1.test.js` carga el `apps-script/Code.gs` real y fija la matriz `_role`/`_canReadEndpoint`/`_canWriteEndpoint` (denegación por defecto, `sin_acceso` sin lecturas ni escrituras, perfil minimizado y alcance de cada rol). Suite completa: **508/508**.

**Verificado en vivo (con lote `.gs` desplegado):**
- [x] `sin_acceso` **revocado** (`gn.test.revocado@example.test`, `activo:false`): login Firebase OK, `user-profile` mínimo `{"role":"sin_acceso","email", "status"}` (sin `uid`/`name`), UI de bloqueo/navegación oculta, lecturas operativas/`web-*` y escrituras denegadas por API directa.
- [x] Perfiles completos (`uid,email,role,name`) para `admin`, `coordinador`, `voluntario`, `tesoreria`, `consulta`.
- [x] **Matriz de lecturas** por API directa coherente con política (incl. `web-*` solo admin/coordinador; restricciones de voluntario/tesorería/consulta según alcance).
- [x] **Matriz de escrituras/acciones** por API directa con ids inexistentes (sin modificar datos): denegaciones/autorizaciones coherentes con la política implementada (`coordinador` sin acciones solo-admin; `voluntario` sin borrados sensibles/finanzas/contratos/blacklist/web; `tesoreria` limitada a su ámbito; `consulta` y `sin_acceso` sin escrituras). Nota: `voluntario` no tiene permitido `delete-animal` (borrado no incluido en su allowlist de escritura).
- [x] Sin token / token inválido denegados en endpoints privados.
- [x] Canal público sin token OK (`config-publica`, `retiradas`, `sitemap`, `taxonomias`, `redirects`); detalle público coherente tras restauración (publicación en borrador no expuesta).

**Pendiente (operativo/manual):**
- [ ] `sin_acceso` **no listado**: cuenta Firebase autenticable no presente en `ROLES_USUARIOS`/`ADMIN_EMAILS` (misma ruta de denegación por defecto; falta cuenta de prueba).
- [ ] Verificar en la hoja de **auditoría** de producción que `restaurar_publicacion`, `eliminar_publicacion` y acciones sensibles quedan registradas (D3).
- [ ] Confirmar que `ROLES_USUARIOS`/`ADMIN_EMAILS` desplegados cubren a todos los usuarios legítimos (D2).
- [ ] Escrituras con datos reales en entorno controlado (si se requiere validación funcional completa de negocio, más allá de autorización).

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
