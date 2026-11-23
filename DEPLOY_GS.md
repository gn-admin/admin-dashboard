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

3. **Generar el informe de columnas aditivas (`test-results/columnas.json`)**
   Es la evidencia que consume `P0-14` del gate. Solo lectura: abre las hojas y lee la fila 1; no escribe, no publica y no despliega.

   1. Abrir el proyecto de Apps Script del despliegue (`script.google.com` → `GN-Backend`).
   2. **Archivo → Nuevo → Secuencia de comandos**, nombre `DiagnosticoColumnas`, y pegar íntegro `scripts/diagnostico-columnas.gs`.
   3. Guardar (Ctrl+S) y ejecutar `diagnosticoColumnasWeb` desde el selector de la barra. Aceptar la autorización de Sheets si la pide.
   4. Abrir **Ejecuciones → última ejecución → Registros** y copiar el JSON completo (de `{` a `}`).
   5. Guardarlo como `test-results/columnas.json`, en UTF-8 **sin BOM** (la carpeta está ignorada por git).
   6. Borrar el archivo `DiagnosticoColumnas` del proyecto (menú ⋮ → Eliminar) cuando ya esté el JSON guardado.

   Validación local antes de usarlo:

   ```bash
   node -e "const r=require('./test-results/columnas.json');console.log(r.ok, Object.keys(r.sheets), Object.values(r.sheets).map(s=>s.missing.length))"
   ```

   Debe imprimir `true [ 'WebPublicaciones', 'Animales' ] [ 0, 0 ]`. Forma esperada del informe:

   ```json
   {
     "ok": true,
     "generado_en": "2026-11-23T…",
     "diagnostico": "columnas-aditivas",
     "sheets": {
       "WebPublicaciones": { "pestana": "Hoja 1", "presentes": ["…"], "missing": [] },
       "Animales":         { "pestana": "Hoja 1", "presentes": ["…"], "missing": [] }
     }
   }
   ```

   Columnas exigidas: `WebPublicaciones` → `ficha_json`, `documents_json`, `media_folder_id`, `origen_tipo`; `Animales` → `portada_url`, `portada_alt`, `galeria`, `videos`, `documentos_internos`.

   El mismo JSON trae `pestanas` y `resumen_pestanas` (informativo: el gate solo lee `sheets`). Para cada hoja de `CONFIG.sheets` y cada encuesta informa de la pestaña **esperada** según `Config.gs` y de la(s) **real(es)** del documento, sin abrir cada Sheet:

   | `resultado` | Significado |
   |---|---|
   | `nombre` | Existe una pestaña con el nombre configurado |
   | `unica_pestana` | No coincide, pero el documento tiene una sola pestaña y `getSheet()` la acepta (caso de «Hoja 1») |
   | `ambigua` | Varias pestañas y ninguna coincide: el backend falla a propósito en vez de escribir en la primera |
   | `sin_configurar` / `error` | Falta el ID o el documento no se pudo abrir |

   `resumen_pestanas.desajustadas` cuenta las que no coinciden por nombre: con eso se revisan de una pasada las 20 pestañas por defecto y el caso de `Animales` (pestaña real «Hoja 1»). El diagnóstico **no escribe** y no cambia el resultado del gate.

   > **Pestaña con otro nombre.** El backend acepta un documento de una sola pestaña aunque se llame «Hoja 1» (`getSheet`), y el diagnóstico actual hace lo mismo: no exige el nombre si no hay ambigüedad. Si sale `"error": "No existe la pestaña …"` con `ok:false`, se ejecutó una versión antigua del script, que buscaba el nombre exacto.
   >
   > **Varias pestañas y ninguna con el nombre configurado.** El informe devuelve `error` y todas las columnas en `missing`: renombrar la pestaña o corregir `sheetName` en `Config.gs`. Nunca se lee la primera a ciegas.
   >
   > Lo que se comprueba es la **cabecera** de la hoja, no los datos: el canal público no distingue una columna vacía de una ausente. El JSON no lleva IDs ni filas, solo nombres de columna, así que puede adjuntarse a una incidencia.

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
