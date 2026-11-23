# Despliegue del lote `.gs` y rollback

> **Estado:** preparado y **no ejecutado**. El lote actual ya está desplegado; este runbook sirve para repetir el despliegue con seguridad, verificar el contrato y volver a la versión anterior si el gate falla.
>
> **Sin secretos:** aquí se usan `<DEPLOY_ID>`, `<VERSION>`, `<COMMIT>` y `<API_URL>`. Los valores reales viven en `.env`, en las propiedades del script o en `.internal-docs/`, nunca en este documento ni en capturas.

## 1. Alcance y regla de oro

- Aplica al **Web App de Apps Script** (`Code.gs`, `WebPublicaciones.gs`, `Config.gs`), no al deploy de GitHub Pages.
- Producción se sirve siempre desde una **versión concreta**, nunca desde `HEAD`.
- El gate `contract-smoke` es **solo lectura**: no publica, no guarda, no retira y no dispara GitHub.
- El token es **obligatorio** para el gate y va **solo** en `?token=`; no se pega en el chat, en el runbook ni en capturas.
- Las columnas nuevas son **aditivas**: el backend las crea al vuelo. Un rollback de código no las borra ni requiere migración.

## 2. Preflight (antes de tocar el despliegue)

1. **Fijar el commit**
   ```bash
   git status --short
   git rev-parse --short HEAD
   ```
   Anotar `<COMMIT>`. No desplegar con cambios sin commitear en `apps-script/`.

2. **Generar la configuración desde el entorno**
   ```bash
   npm run build
   ```
   Genera `src/js/config.js` y `apps-script/Config.gs` (ignorados por git). No imprime secretos.

3. **Verificar las columnas aditivas reales**
   - Abrir el proyecto de Apps Script del despliegue.
   - Pegar `scripts/diagnostico-columnas.gs` en un archivo nuevo y ejecutar `diagnosticoColumnasWeb`.
   - Copiar el JSON de Logs a `test-results/columnas.json`.
   - El informe debe traer `missing: []` para `WebPublicaciones` (`ficha_json`, `documents_json`, `media_folder_id`, `origen_tipo`) y `Animales` (`portada_url`, `portada_alt`, `galeria`, `videos`, `documentos_internos`).

   > El canal público no puede distinguir una columna vacía de una columna ausente; por eso el informe se obtiene de la cabecera real de la hoja y se pasa al gate con `--columns-report`.

4. **Smoke de línea base (solo lectura)**
   ```bash
   mkdir -p test-results
   npm run smoke:contract -- --json > test-results/contract-before.json || true
   ```
   Es una foto de línea base: si sale `FAIL`/`WARN`, revisar el JSON antes de desplegar. No se usa para aprobar el despliegue.

5. **Anotar el despliegue actual**
   - ID de despliegue: `<DEPLOY_ID>`.
   - Versión que sirve ahora: `<VERSION_ACTUAL>`.
   - URL `/exec`: `<API_URL>`.
   - Confirmar que la versión anterior está disponible en **Manage deployments**.

## 3. Despliegue (no ejecutado)

1. Abrir el editor de Apps Script del proyecto.
2. Revisar que `Code.gs`, `WebPublicaciones.gs` y `Config.gs` son los del commit `<COMMIT>`.
3. **Deploy > Manage deployments > Edit** (el despliegue activo).
4. Crear o seleccionar una **versión nueva** (`vYYYY-MM-DD-N`), no `HEAD`.
5. Mantener **Execute as: Me** y **Who has access: Anyone** (el canal público no usa sesión).
6. Desplegar y copiar el ID/URL resultantes.
7. Si la URL cambió, actualizar `API_URL` en `.env` y en los Repository secrets/variables de GitHub Pages. No commitear ninguno de los dos.
8. Anotar la versión nueva en `test-results/deploy.txt` (ignorado por git): commit, versión, ID, hora y responsable.

## 4. Post-despliegue

1. **Contrato**
   ```bash
   EXPECTED_BACKEND_VERSION="<VERSION_NUEVA>" \
   CONTRACT_RETIRED_SLUG="<SLUG_RETIRADO>" \
   npm run smoke:contract -- \
     --columns-report test-results/columnas.json \
     --json > test-results/contract-after.json
   ```
   El gate debe salir `PASS`. Si falla, aplicar rollback antes de seguir.

2. **Verificación funcional P0**
   - Ejecutar el **Gate P0 F0–F5** de `PENDIENTES.md` §1.
   - Guardar la plantilla de evidencia rellenada en `test-results/p0-<fecha>.md`.
   - Repetir el gate con caché fría y tras el deploy de la estática.

3. **Estática**
   - Publicar una ficha de prueba con slug reservado.
   - Esperar 2–4 minutos y comprobar página, canonical, sitemap y `robots.txt`.
   - Retirar la ficha y verificar `410` lógico y desaparición del sitemap.

## 5. Rollback

### Cuándo aplicarlo

- El smoke falla en `P0-01`, `P0-02`, `P0-03`, `P0-12`, `P0-13` o `P0-14`.
- Aparece un `500`, un `401` inesperado, una fuga de datos privados o una ficha pública rota.
- El deploy de estática no termina o sirve contenido de la versión anterior.
- Cualquier regresión que impida publicar, ocultar o retirar.

### Cómo volver atrás

1. **No tocar la hoja.** Las columnas aditivas no son un problema y no se revierten.
2. Abrir **Deploy > Manage deployments**.
3. Seleccionar el despliegue activo y pulsar **Edit**.
4. Cambiar **Version** a `<VERSION_ANTERIOR>`.
5. **Deploy**. La URL `/exec` se mantiene.
6. Si el cambio incluyó `Config.gs`, restaurar la configuración anterior desde el entorno/propiedades; no desde git.
7. Invalidar la caché pública si el editor lo permite:
   ```text
   Ejecutar webInvalidarCachePublico() en Apps Script
   ```
   Si no, esperar 60 segundos (TTL de la caché del canal).
8. Repetir el smoke y el subconjunto P0 que cubra la regresión.

### Qué NO hace el rollback

- No revierte filas escritas en `WebPublicaciones` durante el incidente.
- No borra columnas nuevas ni datos de Drive.
- No cambia el deploy de GitHub Pages; si la estática quedó mala, hay que relanzar el workflow o corregir la publicación.
- No rota tokens ni cambia propiedades del script.

Si el problema es de datos y no de código, el rollback de versión no basta: hay que reparar la fila/hoja con una copia de seguridad y dejar constancia en `memory.md`.

## 6. Evidencia mínima

| Campo | Valor |
|---|---|
| Fecha/hora | |
| Responsable | |
| Commit | `<COMMIT>` |
| Versión anterior | `<VERSION_ANTERIOR>` |
| Versión nueva | `<VERSION_NUEVA>` |
| ID de despliegue | `<DEPLOY_ID>` |
| Smoke antes | `test-results/contract-before.json` |
| Smoke después | `test-results/contract-after.json` |
| Columnas | `test-results/columnas.json` |
| Gate P0 | `test-results/p0-<fecha>.md` |
| Resultado | PASS / ROLLBACK |

## 7. Paso final listo (no ejecutado)

Cuando el despliegue esté autorizado, el último paso es este, en orden:

```bash
# 1. Cabeceras reales desde Apps Script (diagnosticoColumnasWeb) -> test-results/columnas.json
# 2. Gate de contrato, solo lectura
EXPECTED_BACKEND_VERSION="<VERSION_NUEVA>" \
CONTRACT_RETIRED_SLUG="<SLUG_RETIRADO>" \
npm run smoke:contract -- \
  --columns-report test-results/columnas.json \
  --json > test-results/contract-after.json

# 3. Gate P0 F0–F5 de PENDIENTES.md §1
```

No se ha ejecutado ninguno de estos pasos en esta preparación.
