# Plan por fases: Web pública + Gestión (gestor) y endpoints públicos

> **Objetivo:** implementar de forma incremental y segura la gestión de contenido público en el admin (gestor) y el canal público de solo lectura para la web, con foco en SEO y curación de datos (especialmente fichas de animales).  
> **Modo:** análisis/plan (sin implementar).  
> **Documento base:** `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`.  
> **Dependencia externa:** cambios en Apps Script (`.gs`), hojas/Sheets, configuración de despliegue/CORS y la web pública. Seguridad alineada con `PLAN_SEGURIDAD.md` e `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`.  
> **Fuentes internas no encontradas:** no se localizaron `docs/custom-page/*` (“estructura endpoints publicaciones” y el otro md) en el workspace; al disponer de ellos, ajustar contratos, nombres de acciones/campos y prioridades.

---

## Visión general de fases

| Fase | Enfoque | Resultado principal | Depende de |
|---|---|---|---|
| **0** | Definición y preparación | Decisiones cerradas, modelo de datos y contratos acordados | — |
| **1** | Modelo de datos y backend gestor (base) | Hojas/entidades y endpoints de gestión (CRUD/configuración publicación/SEO) operativos y protegidos | Fase 0 |
| **2** | UI gestor en admin | Sección “Web/Contenido público” + acciones contextuales para publicar/curar/SEO | Fase 1 |
| **3** | Canal público (endpoints/feed) | Endpoints públicos de solo lectura con lista blanca, filtros y SEO payload | Fase 1 (y datos curados) |
| **4** | Web pública (consumo y SEO técnico) | Sitio público renderizando listados/detalles, metadatos, schema, sitemap/robots | Fase 3 |
| **5** | Endurecimiento, calidad y operación | Validaciones, caché, redirecciones, monitorización, pruebas y ajustes | Fases 2–4 |

> Se puede solapar parcialmente **2** y **3** tras estabilizar contratos de Fase 1, pero no exponer público (3/4) sin lista blanca y curación mínimas.

---

## Fase 0 — Definición, decisiones y contratos (análisis/preparación)

**Objetivo:** cerrar ambigüedades para evitar rehacer modelo y endpoints.

### Tareas
1. **Alinear con fuentes internas:** revisar `docs/custom-page` (“estructura endpoints publicaciones” y md relacionado) cuando estén disponibles y ajustar nomenclatura/contratos.
2. **Decisiones de modelo:**
   - **Animales:** ¿campos de publicación en hoja `Animales` o entidad separada (`web_animales`/`publicaciones_animales` referenciando `animal_id`)? (recomendado: separada para aislar lo público).
   - **Eventos:** crear hoja/entidad dedicada (ej. `EventosWeb`/`Publicaciones`) con estado borrador/publicado.
   - **Estados publicables:** mapeo de estados internos de animal → `estado_publico` permitido en web (ej. disponible/en acogida; adoptado como escaparate sí/no).
   - **Medios:** cómo se seleccionan `imagen_principal`/`galeria_publica` (URLs/IDs existentes de Drive/galería) y qué es público.
3. **Definir lista blanca por tipo:** campos exactos permitidos en respuestas públicas (`animal`, `evento`) y campos excluidos.
4. **Definir contrato de endpoints (gestor y público):** nombres de `endpoint/action`, parámetros, formato de respuesta/error, paginación, filtros y ordenación (borrador en `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`).
5. **SEO y URL:** estructura (`/animales/{slug}`, `/eventos/{slug}`), reglas de slug, canonical, estrategia de redirecciones 301, sitemap/robots.
6. **Seguridad y permisos:** roles que pueden gestionar web en admin; CORS/dominio(s) de la web pública; confirmación de que el canal público no usa token admin.
7. **Estrategia de entrega:** endpoint dinámico GAS vs exportación JSON estática (o híbrido con caché) según volumen y límites.

### Entregables
- Matriz de decisiones y modelo de datos (campos por entidad/hoja).
- Especificación de contratos (gestor y público) y lista blanca.
- Checklist de seguridad/privacidad para publicación.

### Criterio de salida
- Contratos y modelo aprobados; sin ambigüedades críticas para Fase 1.

---

## Fase 1 — Modelo de datos y backend gestor (Apps Script/Sheets)

**Objetivo:** disponer de almacenamiento y APIs de gestión seguras para configurar publicación y SEO.

### Tareas
1. **Hojas/entidades y `CONFIG` en `.gs`:**
   - Crear/ajustar hojas para configuración pública (ej. `web_animales`, `web_eventos`) con cabeceras definidas (ids, `slug`, flags, campos públicos/SEO, fechas, `orden`, etc.). Fila 1 = cabeceras.
   - Registrar en `CONFIG.sheets` y validar IDs/permisos.
2. **Lógica de dominio (backend):**
   - Generación/validación de `slug` (único por tipo, normalizado), unicidad y actualización controlada.
   - Validaciones para publicar: campos mínimos, estado interno permitido (animales), coherencia de fechas (eventos).
   - Composición de **payload público normalizado** (lista blanca) reutilizable por preview y por feed público.
3. **Endpoints gestor (autenticados y autorizados):**
   - `web-animales`: list/get/upsert/cambiar estado (y preview de payload público).
   - `web-eventos`: list/get/create/update/delete (o archivar) + estado/SEO.
   - Utilidades: validación de slug, resumen/métricas de publicación (si aplica).
4. **Seguridad backend:**
   - Aplicar autorización por rol/módulo en cada acción (denegar por defecto), alineada al hito 1.1.
   - No exponer datos internos innecesarios en respuestas del gestor; sanitizar entradas.
5. **Pruebas de backend:**
   - CRUD/configuración, unicidad de slug, reglas de publicación, y que el payload público no incluya campos prohibidos.

### Entregables
- Hojas/entidades operativas y mapeadas en `.gs`.
- Endpoints gestor funcionando con control de acceso.
- Casos de prueba/ejemplos de request-response (internos).

### Criterio de salida
- Se puede crear/editar/publicar/ocultar configuración y SEO vía API gestor; payload público (preview) cumple lista blanca.

---

## Fase 2 — UI gestor en el admin (sección Web + contexto)

**Objetivo:** permitir gestionar el contenido público desde el panel sin ir entidad por entidad para el control global.

### Tareas
1. **Sección “Web / Contenido público”:**
   - Vista global: listados de `animales` y `eventos` con estado (borrador/publicado/oculto), indicadores (sin slug/SEO/imagen, no indexable), filtros y búsqueda.
   - Acciones: publicar/ocultar, editar configuración pública y SEO, previsualización (basada en `preview` del backend).
2. **Gestión de animales (curación):**
   - Selección/edición de campos públicos (descripción pública, extracto, estado público, imagen/galería pública) y SEO (`slug`, `seo_title`, `seo_description`, OG, `indexable`).
   - Validaciones en UI (campos requeridos para publicar) y avisos SEO (longitudes recomendadas).
3. **Gestión de eventos:**
   - Formulario CRUD (datos, fechas/lugar público, imagen, estado) + campos SEO.
4. **Integración contextual (híbrida):**
   - En la ficha de animal: acceso rápido a “Publicación web” (estado, publicar/ocultar, enlace a edición completa en sección Web).
5. **Permisos y UX:**
   - Mostrar/ocultar acciones según rol; respetar `aplicarPermisosUI` y estados de carga/error.
6. **SW/caché y pruebas:** actualizar `CACHE_NAME` ante cambios frontend; tests existentes en verde.

### Entregables
- Sección Web operativa y edición contextual básica.
- Flujo de curación y publicación usable.

### Criterio de salida
- Un usuario autorizado puede preparar y publicar/ocultar animales y eventos con metadatos SEO desde el admin.

---

## Fase 3 — Canal público (endpoints/feed de solo lectura)

**Objetivo:** exponer solo contenido público curado para la web externa, sin API/token admin.

### Tareas
1. **Implementar endpoints públicos (GAS, separados):**
   - `public-animales` (listado con filtros/paginación/orden) y detalle por `slug`.
   - `public-eventos` (listado, idealmente por rango de fechas) y detalle por `slug`.
   - (Opcional) `public-sitemap` / `public-site-meta`.
2. **Lista blanca y reglas:**
   - Incluir solo `publicado` y estados internos permitidos; construir respuesta campo a campo; 404 para no publicado/inexistente.
   - Incluir payload SEO (`title`, `description`, `canonical`, `robots`, OG/Twitter) y `schema` (p. ej. `Event`).
3. **Seguridad y entrega:**
   - Sin token de administración; CORS restringido al dominio de la web pública.
   - `Cache-Control`/paginación y límites razonables; no exponer errores internos.
4. **Estrategia de datos:** dinámico en GAS o exportación JSON estática programada (según Fase 0), con invalidación/actualización definida.
5. **Pruebas:** verificar ausencia de campos sensibles, comportamiento de borradores/no publicados y consistencia con preview del gestor.

### Entregables
- Endpoints/feed públicos documentados y operativos.
- Evidencia de lista blanca y CORS correcto.

### Criterio de salida
- La web pública puede obtener listados/detalles/SEO de contenido publicado sin acceder a datos internos.

---

## Fase 4 — Web pública: consumo, renderizado y SEO técnico

**Objetivo:** publicar el sitio público consumiendo el canal de Fase 3 con buenas prácticas SEO.

### Tareas
1. **Estructura y rutas:** `/{tipo}/{slug}` (animales, eventos) + páginas de listado con filtros/búsqueda y paginación.
2. **Renderizado por página:** `<title>`, meta description, canonical, robots, Open Graph/Twitter Cards y JSON-LD según tipo/contenido.
3. **SEO técnico:** `sitemap.xml`, `robots.txt`, redirecciones 301 ante cambios de `slug`, manejo 404.
4. **Rendimiento y calidad:** imágenes optimizadas y con `alt`, HTML semántico, responsive, accesibilidad básica.
5. **Integración de datos:** consumo del feed/endpoints públicos, manejo de caché/revalidación y estados vacíos/errores.

### Entregables
- Web pública navegable con listados/detalles y metadatos SEO.
- Sitemap/robots y redirecciones operativas.

### Criterio de salida
- Contenido publicado visible y correctamente indexable (según configuración), sin exposición de datos internos.

---

## Fase 5 — Endurecimiento, calidad y operación

**Objetivo:** estabilizar, asegurar y facilitar el mantenimiento continuo.

### Tareas
1. **Calidad de contenido:** validaciones reforzadas (slugs, campos mínimos, imágenes), detección de “publicado pero incompleto”, revisión de duplicados/canonical.
2. **Seguridad/privacidad:** auditoría de respuestas públicas (muestreo), revisión de permisos de gestión web y registro en auditoría de cambios de publicación/SEO.
3. **Rendimiento y resiliencia:** caché (cliente/CDN/`Cache-Control` o export estática), manejo de límites de GAS, tiempos de actualización.
4. **Observabilidad y pruebas:** checklist por rol, pruebas de endpoints públicos/gestor, verificación en Search Console (sitemap, indexación) cuando aplique.
5. **Documentación:** actualizar contratos, configuración (CORS, dominios, `CONFIG`), y procedimiento de publicación/redirecciones.

### Entregables
- Checklist de QA/seguridad pasado.
- Documentación operativa actualizada.

### Criterio de salida
- Flujo gestor→público estable, seguro, medible y mantenible.

---

## Orden recomendado de ejecución (resumen)

1. **Fase 0** (decisiones/contratos, alinear con `docs/custom-page` si aparece).  
2. **Fase 1** (hojas + backend gestor + payload/lista blanca).  
3. **Fase 2** (UI gestor) y preparación de **Fase 3** en paralelo una vez estable el contrato.  
4. **Fase 3** (canal público) con validación estricta de lista blanca.  
5. **Fase 4** (web pública + SEO técnico).  
6. **Fase 5** (endurecimiento y operación).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fuga de datos internos en feed público | Lista blanca en servidor, preview público, revisión de respuestas y pruebas automatizadas/manuales. |
| Desalineación gestor ↔ público | Contrato único, payload normalizado compartido (preview = base del público). |
| Cambios de slug rompen SEO | Redirecciones 301 y registro de slugs anteriores. |
| Límites/rendimiento de GAS | Paginación, caché, y opción de exportación estática si crece el tráfico. |
| Falta de permisos en backend | Autorización por rol en cada endpoint (hito 1.1) y pruebas por rol. |

## Registro de avance (a completar durante implementación)

| Fecha | Fase/Tarea | Cambio | Responsable | Evidencia/Notas |
|---|---|---|---|---|
| — | 0 | Plan creado (análisis) | — | `ANALISIS-WEB-PUBLICACIONES-SEO-ENDPOINTS.md`, este documento |
