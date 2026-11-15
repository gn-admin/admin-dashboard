# Plan: Gestor de fichas y publicaciones (animales, eventos e historias)

> **Alcance:** análisis y plan por fases (**sin implementación**). Cubre la separación de dominios (ficha interna vs publicación), la relación entre fichas y tipos de publicación, y la coherencia UI/UX + lógica interna para evitar conflictos futuros.  
> **Contexto:** trabajo complementario al gestor web ya operativo; **no** incluye la ejecución en el proyecto `main` (ver `TRANSFERIR_A_MAIN.md`).  
> **Fecha:** 2026-11-16 (análisis consolidado).  
> **Verificación previa (C3, estática):** prerender con/sin `ficha` correcto en plantilla, bloques/visibilidad, lectura y SEO/viewport; responsive por reglas CSS (719/900, grids fluidos). Pendiente recomendada: pasada visual manual real a 360/1280. Observación a revisar: precedencia de `ficha.tags/cta` frente a campos base en el render.

---

## 1. Estado actual (resumen)

### 1.1 Arquitectura y módulos
- **UI/entrada:** `src/index.html` (`#page-web`), `src/js/dashboard.js` (ruta `web`), `src/js/dashboard-web.js` (delegación `data-action` → `Web.*`), `src/js/web.js` (núcleo: estado, filtros, tablas, selector, formularios, preview, media, completitud, deploy).
- **Modelo/render público:** `src/js/ficha-config.js`, `src/js/publico.js`, `scripts/prerender-publico.js`.
- **API:** `src/js/api.js` (endpoints `web-*`, token en `?token=`).
- **Backend:** `apps-script/WebPublicaciones.gs` (hoja `WebPublicaciones`, composición `webConstruirPublicacion`, slugs/historial, validación, media, canal público, saneado `webSanearHtml`/`webUrlSegura`, normalización `webNormalizarFicha`), `apps-script/Code.gs` (enrutado, auth/autorización, decisión centralizada de deploy `_webAnotarDeploy`).
- **Fichas internas:** gestión de animales en `dashboard.js` (+ módulos) sobre hoja `Animales`; la publicación web de animal se vincula por `origen_id`.

### 1.2 Tipos y ciclo de vida
- **`animal` (derivado):** publicación vinculada a ficha interna (`origen_id`). Puede existir borrador virtual pre-rellenado desde origen; portada por defecto desde foto del animal; bloque ficha/salud compuesto con origen.
- **`evento` / `historia` (autónomo):** contenido propio en `WebPublicaciones` (bloque `event`), sin origen animal.
- **Estados:** `borrador | publicado | oculto | retirado` (+ flags). `retirado` = lápida 410 lógica, slug reservado (301 histórico); restauración (evento/historia) conserva slug. Completitud autoritativa en backend para publicar.

### 1.3 Flujos UI actuales
- **Pestaña Animales:** lista solo animales con `publicacion_id`; “Nueva publicación” abre selector/picker de animales sin publicación. Acciones: editar/configurar, preview, ver pública, publicar/ocultar, eliminar borrador de config (no publicado/no retirado).
- **Pestaña Eventos e historias:** lista propia; crear/editar, preview, ver, publicar/ocultar, retirar (410) y restaurar.
- **Formularios:** extensos, con `<details>` (contenido, media `url|alt|pie`, datos de dominio, presentación C3, CTA/SEO), slug con check/historial, preview JSON. Publicación de animal incluye bloque/curación de datos del animal y C3; evento incluye datos de evento.

### 1.4 Datos y composición
- Compositor único `webConstruirPublicacion` (**preview == feed**): saneo, SEO/canonical/robots/og derivado, fechas/lectura, `animal` (curado+origen) o `event`; `ficha` **solo en detalle/preview/prerender** (listados ligeros). `ficha_json` normalizado (valores cerrados, máx. 45k).
- Media en Drive por publicación (`animales|eventos|historias/<slug>`), validación de tipo/tamaño, normalización de URLs (rechazo de carpetas), documentos privados.
- Slug único por tipo (incluye históricos); completitud y validación repartidas cliente/servidor (backend autoritativo).

### 1.5 UI/UX por dispositivo (estado)
- **Desktop (≥900):** tablas, filtros/acciones en fila, picker centrado, formularios densos.
- **Tablet (~720–900):** compresión de barras/stats/acciones.
- **Móvil (≤640/720):** tabla→tarjetas (`data-label`), acciones en grid, stats compactas, picker bottom-sheet a pantalla completa, formularios largos por secciones; riesgo de fatiga y edición precisa (slug/media textual).

---

## 2. Conflictos y riesgos identificados

| Área | Situación | Riesgo | Impacto |
|---|---|---|---|
| Fuente de verdad (animal) | Maestros en `Animales` y copia/curación en publicación; composición mezcla heredado/curado; heredados (p. ej. salud) no siempre visibles como tales. | Desincronización, doble edición, ambigüedad de vigencia. | Alto |
| Dominio mezclado | Misma pantalla/flujo/módulo para publicación derivada y contenido editorial. | Errores operativos y regresiones cruzadas. | Alto |
| Ciclo de vida asimétrico | Retirar/restaurar expuesto en evento/historia; distinto en animal aunque `retirado` existe en modelo. | Inconsistencia/casos borde. | Medio-alto |
| Semántica de campos | `estado` interno vs `estado_publico` vs `estado_publicacion`; `urgente` interno no mapeado automáticamente. | Taxonomía/estado incoherente. | Medio |
| Pre-relleno/descubribilidad | Pre-relleno parcial, portada por fallback no siempre visible, sin “importar desde ficha”, ficha interna sin estado web/completitud/URL. | Trabajo repetido e incertidumbre. | Medio |
| “Qué enseñar” / privacidad | Sin whitelist explícita de campos heredados al componer. | Fuga potencial de datos internos. | Alto |
| Media | Fuentes distintas (interna vs web), entrada `|` propensa a error. | Desorden/errores de assets. | Medio |
| Responsive | Formularios densos y acciones múltiples en móvil/tablet. | Fatiga/errores de edición. | Medio |
| Operación | Guardado ≠ estática si falla deploy (feedback existe). | Confusión de publicación efectiva. | Bajo-medio |
| Mantenibilidad | Monolito `web.js` y validaciones repartidas. | Divergencia de reglas y coste de cambio. | Medio |

---

## 3. Modelo objetivo

**Principio:** *la ficha interna es la fuente de verdad; la publicación web es una capa de presentación, visibilidad y distribución.*

- **Publicación de animal (derivada, 1:1 con `origen_id`):** guarda editorial/presentación (`slug`, estado/flags, `seo`, copy/overrides permitidos, selección de media pública, `cta`, `ficha` C3/visibilidad). Datos del animal **heredados (solo lectura en UI)** salvo overrides acordados.
- **Evento/Historia (autónoma):** contenido propio, sin origen animal ni bloque de ficha animal.
- **Composición única:** `payload = normalizar(publicación ⊕ overrides_permitidos ⊕ herencia_whitelist(ficha_origen))` filtrada por whitelist pública y bloques/visibilidad, con saneado en servidor. **Precedencia:** override publicación > heredado ficha > vacío/default (documentada por campo). Misma salida en preview, detalle y prerender.
- **Reglas:** maestros editables solo en su ficha; nunca exponer campos sensibles; acciones/transiciones explícitas por tipo; contratos aditivos; listados sin ficha pesada.

### UX objetivo (resumen)
| Aspecto | Desktop | Tablet | Móvil |
|---|---|---|---|
| Navegación | Áreas separadas: Publicar animales / Eventos e historias | Igual, compacto | Vistas separadas, listas en tarjetas |
| Animal | Heredados (solo lectura, enlace a ficha) + presentación/SEO; desde ficha o listado | Panel/drawer | Flujo guiado por pasos |
| Evento/Historia | Formulario editorial propio | Secciones agrupadas | Secciones colapsables/pasos |
| Qué enseñar | Toggles de bloques + preview | Toggles + preview a demanda | Toggles + preview accesible |
| Acciones/feedback | Explícitas por tipo, completitud por sección, guardado vs deploy | Igual | Primarias visibles, destructivas secundarias, mensajes junto al campo |

---

## 4. Plan por fases (sin implementación)

| Fase | Objetivo | Trabajo principal | Criterio de salida | Riesgo |
|---|---|---|---|---|
| **F0. Inventario y contrato** | Cerrar ambigüedades | Mapear y clasificar campos (maestro/editorial/derivado/duplicado/sensible). Definir whitelist pública, precedencia de overrides, mapeo estados/taxonomía (`urgente`), cardinalidad animal↔publicación y matriz de acciones/transiciones por tipo. | Documento de mapeo + contrato de composición y decisiones. | Bajo |
| **F1. Separación UX** | Claridad, menos errores | Dos entradas: **Publicar animales** y **Eventos e historias** (CTAs, filtros, vacíos, contadores propios). Formularios por tipo reutilizando bloques comunes (SEO/media/C3/CTA). Acciones/confirmaciones por tipo. Responsive: tarjetas en móvil, secciones/colapsables, sin overflow. | UX diferenciada, QA 360/768/1280, `npm test` verde (sin cambio de modelo). | Bajo |
| **F2. Ficha como fuente + “qué enseñar”** | Fuente de verdad y seguridad | Cargar origen y mostrar heredados (solo lectura, enlace a ficha); pre-rellenar derivados. Unificar visibilidad (C3/bloques/whitelist). Backend: composición con precedencia y **whitelist estricta**; estado web visible en ficha interna. `preview == feed`. | Sin doble edición de maestros, sin fugas, compatibilidad. (Despliegue `.gs`.) | Medio |
| **F3. Migración y limpieza** | Sin duplicidad | Mover campos maestros a `Animales`; migración controlada en Sheets (respaldo); retirar duplicados del formulario; persistir solo editorial/presentación/overrides; ajustar completitud por tipo. | Sin pérdida de datos, precedencia aplicada. | Medio-alto |
| **F4. Endurecimiento y QA** | Estabilidad | Tests de contrato (composición, whitelist, estados, slugs/301/410, con/sin `ficha`), pruebas por rol y viewport (360/768/1280), rendimiento de listados. Documentar flujos y coordinar contrato público si cambia (`TRANSFERIR_A_MAIN.md`, externo). | Regresión cubierta y documentación alineada. | Bajo |

**Dependencias/cautelas:** despliegue manual de `.gs` y cambios en Sheets con respaldo; mantener aditividad y listados ligeros; saneado/whitelist en servidor siempre; `preview == feed`. **Recomendación:** iniciar por **F0** (mapeo, whitelist, precedencia y matriz de estados por tipo) antes de tocar UI o modelo.

---

## 5. Notas abiertas
- Confirmar precedencia de overrides de `ficha` (p. ej. `tags/cta/icons/gallery/videos`) en render frente a campos base.
- Definir semántica de `retirado`/eliminación para publicaciones de animal (alinear modelo y UI).
- Unificar mapeo `estado` interno ↔ `estado_publico` y tratamiento de `urgente`.
- Decidir estrategia de media pública (reutilizar/seleccionar desde ficha interna vs assets propios de publicación) dentro de la whitelist.
