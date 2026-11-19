# Plan: Gestor de fichas y publicaciones (animales, eventos, historias y grupos)

> **Alcance:** análisis y plan por fases. Cubre la separación de dominios (ficha interna vs publicación), la relación entre fichas y tipos de publicación (incluido **grupo/camada de adopción conjunta**), y la coherencia UI/UX + lógica interna para evitar conflictos futuros.
> **Contexto:** trabajo complementario al gestor web ya operativo; **no** incluye la ejecución en el proyecto `main` (ver `TRANSFERIR_A_MAIN.md`).
> **Fecha:** 2026-11-16 (análisis consolidado). **Replanificación:** 2026-11-17 para integrar grupos en todas las fases.
> **Estado (2026-11-18):** **F0–F5 cerradas** (contrato 1:1+grupos, diseño, implementación end-to-end de grupos G1 y QA/endurecimiento). Queda solo verificación funcional en producción.
> **Base:** 1:1 conservada (F1–F3) + F4 implementada (`apps-script/WebPublicaciones.gs`, `apps-script/Code.gs`, `src/js/api.js`, `src/js/web.js`, `src/js/dashboard-web.js`, `src/js/publico.js`) + F5 (tests de contrato de grupo, correcciones de UI/backend y contrato público). `npm test` **793/793, 193 suites, 0 fallos**, `CACHE_NAME` **v301**.
> **Pendiente operativo/manual:** backend ya subido a GAS; verificar en producción 1:1 (F2/F3) y grupos (F4/F5); columnas aditivas en hojas si faltan (`WebPublicaciones`: `documents_json`, `media_folder_id`, `origen_tipo`; `Animales`: `portada_url`, `portada_alt`, `galeria`, `videos`, `documentos_internos`). Contrato público para `main` en `TRANSFERIR_A_MAIN.md` §A.2.1 (sin ejecutar en `main`).
> **Referencia:** [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md), [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md).
> **Verificación previa (C3, estática):** prerender con/sin `ficha` correcto en plantilla, bloques/visibilidad, lectura y SEO/viewport; responsive por reglas CSS (719/900, grids fluidos). Cubierto por tests y fixtures, incluido render de grupo (F4/F5). Pendiente: pasada visual manual 360/1280 en producción. Precedencia `ficha.tags/cta` frente a base ya implementada (`ficha > base`); pendiente hacerla visible en UI (F2).

---

## 1. Estado actual (resumen)

### 1.1 Arquitectura y módulos
- **UI/entrada:** `src/index.html` (`#page-web`), `src/js/dashboard.js` (ruta `web`), `src/js/dashboard-web.js` (delegación `data-action` → `Web.*`), `src/js/web.js` (núcleo: estado, filtros, tablas, selector, formularios, preview, media, completitud, deploy).
- **Modelo/render público:** `src/js/ficha-config.js`, `src/js/publico.js`, `scripts/prerender-publico.js`.
- **API:** `src/js/api.js` (endpoints `web-*`, token en `?token=`).
- **Backend:** `apps-script/WebPublicaciones.gs` (hoja `WebPublicaciones`, composición `webConstruirPublicacion`, slugs/historial, validación, media, canal público, saneado `webSanearHtml`/`webUrlSegura`, normalización `webNormalizarFicha`), `apps-script/Code.gs` (enrutado, auth/autorización, decisión centralizada de deploy `_webAnotarDeploy`).
- **Fichas internas:** gestión de animales en `dashboard.js` (+ módulos) sobre hoja `Animales`; la publicación web de animal se vincula por `origen_id`.

### 1.2 Tipos y ciclo de vida
- **`animal` (derivado, 1:1):** publicación vinculada a una ficha interna (`origen_id` = animal). Puede existir borrador virtual pre-rellenado desde origen; portada por defecto desde foto del animal; bloque ficha/salud compuesto con origen.
- **`animal_grupo` / grupo de adopción conjunta (derivado, 1:N → 1 publicación, objetivo):** publicación vinculada a un **grupo** (`origen_id` = `grupo_id`, solo cuando `grupo_obligatorio=true`). Representa al conjunto: editorial propio + herencia agregada de sus miembros. **No implementado aún** (definido en F4). Los animales sin grupo obligatorio siguen el modelo 1:1.
- **`evento` / `historia` (autónomo):** contenido propio en `WebPublicaciones` (bloque `event`), sin origen animal. Una `historia` puede usarse para narrar una camada no obligatoria sin sustituir las publicaciones 1:1 de sus miembros.
- **Estados:** `borrador | publicado | oculto | retirado` (+ flags). `retirado` = lápida 410 lógica, slug reservado (301 histórico); restauración conserva slug. Completitud autoritativa en backend para publicar.
- **Grupos internos (fichas):** ya existen `grupo`, `grupo_id`, `grupo_obligatorio`, alta de camada y vista de grupo en `Animales`/`dashboard.js`; hoy **no** tienen publicación web asociada.

### 1.3 Flujos UI actuales
- **Pestaña Animales:** lista solo animales con `publicacion_id`; “Nueva publicación” abre selector/picker de animales sin publicación. Acciones: editar/configurar, preview, ver pública, publicar/ocultar, eliminar borrador de config (no publicado/no retirado).
- **Pestaña Eventos e historias:** lista propia; crear/editar, preview, ver, publicar/ocultar, retirar (410) y restaurar.
- **Formularios:** extensos, con `<details>` (contenido, media `url|alt|pie`, datos de dominio, presentación C3, CTA/SEO), slug con check/historial, preview JSON. Publicación de animal incluye bloque/curación de datos del animal y C3; evento incluye datos de evento.

### 1.4 Datos y composición

#### Media existente en el gestor (formulario de publicación)
El gestor web **YA tiene sección de media** en el formulario de creación/edición de publicación. Campos actuales del formulario (IDs de input en `src/js/web.js`):
- `web-cover` / `web-cover-alt`: portada (URL + alt)
- `web-galeria`: galería (formato `url\|alt\|pie` por línea)
- `web-videos`: vídeos (formato `título\|url` por línea)
- `web-iconos`: iconos (formato `icono\|etiqueta\|valor` por línea)
- `web-file-portada`, `web-file-galeria`, `web-file-video`, `web-file-doc`: subida de archivos a Drive
- `web-docs`: documentos de la ficha (formato `nombre\|url` por línea, privados)

**La hoja `WebPublicaciones` debería tener columnas para estos campos:**
| Columna en Sheets | Contenido | Formato | Público |
|-------------------|-----------|---------|---------|
| `coverImage` | Portada | `{"src": "url", "alt": "texto"}` | Sí |
| `gallery` | Galería | `[{"src": "url", "alt": "texto", "pie": "pie"}]` | Sí |
| `videos` | Vídeos | `[{"title": "título", "url": "url", "provider": "youtube"}]` | Sí |
| `icons` | Iconos | `[{"icon": "edad", "label": "Edad", "value": "4 años"}]` | Sí |
| `documents` | Documentos | `[{"nombre": "cartilla", "url": "url_privada"}]` | No (privados) |
| `media_folder_id` | Carpeta Drive | ID de carpeta de la publicación | No |

#### Media en ficha interna de animales (hoja `Animales`)
Como empezáis de cero (hoja `Animales` se puede limpiar), **recomendado añadir columnas de media propia** para que el animal tenga sus propios activos independientes de la publicación:

| Columna en Sheets `Animales` | Contenido | Formato | Público |
|------------------------------|-----------|---------|---------|
| `portada_url` | Foto principal del animal | URL | Sí (heredable) |
| `portada_alt` | Texto alternativo portada | Texto | Sí |
| `galeria` | Galería interna | `[{"src": "url", "alt": "texto", "pie": "pie"}]` | Sí (heredable) |
| `videos` | Vídeos internos | `[{"title": "título", "url": "url", "provider": "youtube"}]` | Sí (heredable) |
| `documentos_internos` | Documentos privados (cartilla, contrato acogida interna) | `[{"nombre": "cartilla", "url": "url_privada"}]` | **No** |

#### Almacenamiento en Drive
- Ficha interna: carpeta `animales/<id-animal>/`
- Publicación: carpeta `publicaciones/<slug>/` o `animales|eventos|historias/<slug-publicacion>/`
- Si se propaga media publicación → ficha interna, se puede reutilizar el mismo `fileId` de Drive sin subir el archivo dos veces.

#### Compositor único `webConstruirPublicacion` (**preview == feed**)
Saneo, SEO/canonical/robots/og derivado, fechas/lectura, `animal` (curado+origen) o `event`; `ficha` **solo en detalle/preview/prerender** (listados ligeros). `ficha_json` normalizado (valores cerrados, máx. 45k).

Slug único por tipo (incluye históricos); completitud y validación repartidas cliente/servidor (backend autoritativo).

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
| **Grupos / adopción conjunta** | Grupos internos (`grupo_id`, `grupo_obligatorio`) sin modelo de publicación; el 1:1 no representa al conjunto. | Si se publica por individuo un grupo conjunto: estados/CTA/slug/retirada contradictorios y contenido duplicado. Si no se contempla: no se puede publicar la adopción conjunta. | **Alto** |
| **Derivación agregada** | Estado/urgente/salud/compatibilidad de un grupo dependen de varios miembros que cambian en el tiempo. | Publicación desactualizada o incoherente (p. ej. un miembro fallece/adoptado); reglas no definidas. | **Alto** |
| **Exclusividad 1:1 ↔ grupo** | Un mismo animal podría acabar con publicación individual y de grupo. | Duplicados en canal/listados y ambigüedad de la unidad canónica. | Alto |

---

## 3. Modelo objetivo

**Principio:** *la ficha interna es la fuente de verdad; la publicación web es una capa de presentación, visibilidad y distribución.*

- **Publicación de animal (derivada, 1:1):** `origen = animal`. Guarda editorial/presentación (`slug`, estado/flags, `seo`, copy/overrides permitidos, selección de media pública, `cta`, `ficha` C3/visibilidad). Datos del animal **heredados (solo lectura en UI)** salvo overrides acordados. Aplica a animales sin grupo obligatorio (o grupo informativo).
- **Publicación de grupo (derivada, 1:1 con el grupo, N miembros) — G1, objetivo:** `origen = grupo` (`grupo_id`), solo para **adopción conjunta** (`grupo_obligatorio=true`). Guarda editorial/presentación propia y compone **herencia agregada** de sus miembros (lista curada, resumen, estado/urgente derivados, media combinada). Es la unidad canónica del conjunto: sus miembros no mantienen publicaciones individuales activas mientras la del grupo esté vigente. (Contrato a cerrar en F0; implementación en F4.)
- **Evento/Historia (autónoma):** contenido propio, sin origen animal ni bloque de ficha animal. Puede narrar una camada no obligatoria sin sustituir publicaciones individuales.
- **Composición única (generalizada):** `payload = normalizar(publicación ⊕ overrides_permitidos ⊕ herencia_whitelist(origen))`, donde `herencia_whitelist` es **simple** (1:1 animal) o **agregada** (grupo, con reglas explícitas por campo). Filtrada por whitelist pública y bloques/visibilidad, con saneado en servidor. **Precedencia:** override publicación > heredado/agregado origen > vacío/default (documentada por campo y por tipo). **`preview == feed`**. Listados sin `ficha` pesada.
- **Reglas:** maestros editables solo en su ficha; nunca exponer campos sensibles ni IDs internos innecesarios; acciones/transiciones explícitas por tipo; contratos aditivos; coherencia de estado (no publicar incoherencias, p. ej. conjunto cerrado/fallecido sin resolución); exclusividad 1:1↔grupo para adopción conjunta.

#### Reglas de media: publicación ↔ ficha interna
| Acción | ¿Se propaga a ficha interna? | ¿Se propaga a publicación? | Nota |
|--------|------------------------------|----------------------------|------|
| Crear publicación desde animal (1:1) | — | Hereda portada, galería y vídeos de la ficha interna por defecto | Pre-relleno automático |
| Crear publicación de grupo (conjunto) | — | Pre-rellena media del grupo desde media de miembros (según regla F0/F4) | Portada/galería propias del grupo; origen de cada asset trazable si aplica |
| Añadir media en la publicación | **Sí, opcional** (checkbox "propagar a ficha interna", 1:1) | Se guarda en la publicación | Reutiliza `fileId` de Drive si existe. En grupo: decidir si propaga al miembro seleccionado o queda solo en publicación (G-D a concretar en F0/F4) |
| Añadir media en la ficha interna | Se guarda en la ficha interna | **No automático** | El gestor puede importar al crear/preparar publicación |
| Borrar media en la publicación | No afecta a la ficha interna | Se borra de la publicación | |
| Borrar media en la ficha interna | Se borra de la ficha | No afecta a la publicación (copia/referencia propia) | Los cambios en miembros pueden exigir refresco de la publicación de grupo |
| Documentos internos de ficha | Privados, nunca viajan al payload público | **No** | Cartilla, contrato acogida interna, etc. |

**Regla de privacidad:** los documentos internos de la ficha **nunca viajan al payload público** ni a la página estática, aunque se propagen/reutilicen. La carpeta de Drive de una publicación de grupo será propia de la publicación (nomenclatura a definir en F0/F3), independiente de las carpetas individuales de miembros.

### UX objetivo (resumen)
| Aspecto | Desktop | Tablet | Móvil |
|---|---|---|---|
| Navegación | Áreas/entradas separadas: **Publicar animales** (individuales y grupos de adopción conjunta) y **Eventos e historias** | Igual, compacto | Vistas separadas, listas en tarjetas |
| Animal (1:1) | Heredados (solo lectura, enlace a ficha) + presentación/SEO; desde ficha o listado | Panel/drawer | Flujo guiado por pasos |
| Grupo (adopción conjunta) | Selección de grupo obligatorio, miembros y agregados heredados en solo lectura + editorial/SEO/media/CTA propios; preview del conjunto | Panel/drawer | Flujo guiado por pasos, resumen de miembros claro |
| Evento/Historia | Formulario editorial propio | Secciones agrupadas | Secciones colapsables/pasos |
| Qué enseñar | Toggles de bloques + preview (incluida ficha configurable C3) | Toggles + preview a demanda | Toggles + preview accesible |
| Acciones/feedback | Explícitas por tipo y origen, completitud por sección, coherencia (p. ej. no publicar conjunto inválido), guardado vs deploy | Igual | Primarias visibles, destructivas secundarias, mensajes junto al campo |

---

## 4. Plan por fases (replanificación integrada: 1:1 + grupos)

> **Replanificación 2026-11-17:** los grupos/camadas de **adopción conjunta** (`grupo_obligatorio`) se interiorizan en todas las fases. **F0–F3 se reabren** para verificar/adaptar el encaje del trabajo 1:1 con el modelo de grupos (sin descartar lo ya hecho); se cierran progresivamente **hasta F4**. **F5** (endurecimiento y QA de 1:1+grupos) queda como fase posterior. Detalle de grupos: [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md). Contrato 1:1: [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md).

| Fase | Objetivo | Estado actual | Verificación/adaptación grupos | Cierre |
|---|---|---|---|---|
| **F0. Contrato unificado** | Cerrar ambigüedades 1:1 + grupos | Base 1:1 documentada. | G-D1…G-D7 y D6–D8 resueltos; inventario, composición agregada, whitelist, derivación (tabla), refresco, exclusividad, acciones y SEO/categoría definidos. | ✅ **Cerrada (2026-11-17).** Contrato unificado en [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md) §10–§11 y [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md). |
| **F1. UX y flujos** | Claridad, menos errores | 1:1 implementada (`web.js`/CSS): tabs Animales/Eventos, contadores, CTA, búsqueda, formularios y acciones. | IA y flujos especificados para grupo: entrada **Publicar grupo** (selector de grupos `grupo_obligatorio` sin publicación vigente), formulario con miembros + datos agregados/heredados en solo lectura y bloque editorial/SEO/media/CTA propio, indicadores de estado web del grupo en fichas de miembros, acciones (editar/preview/publicar/ocultar/retirar/restaurar), avisos de exclusividad (G-D5) y completitud (G-D3/D6). Listado Animales distingue/filtra individual vs grupo; responsive 360/768/1280. 1:1 compatible. | ✅ **Cerrada (2026-11-17, especificación).** Flujos 1:1+grupo definidos sin ambigüedad; implementación UI de grupo en F4. |
| **F2. Fuente de verdad, composición y whitelist** | Seguridad y coherencia | 1:1 implementada en código local (`.gs` F2 subidos): derivación D1, `urgent`, whitelist estricta, retirar/restaurar, `preview == feed`. Pendiente verificación en producción. | Modelo unificado: `override > herencia (simple|agregada) > default`. Reglas de agregación/whitelist de grupo, derivación G-D3, refresco en lectura G-D4 y exclusividad G-D5 documentadas; compositor 1:1 compatible (extensible por `tipo/origen_tipo`). | ✅ **Cerrada (2026-11-17, contrato/verificación de diseño).** Lista para implementar en F4. *Operativo pendiente:* desplegar/verificar 1:1 en producción. |
| **F3. Modelo de datos, persistencia y media** | Sin duplicidad, base aditiva | 1:1 cerrada en código local: `documents_json`/`media_folder_id`, media interna, pre-relleno, propagación opt-in, overrides limpios. Pendiente desplegar/verificar. | Esquema aditivo definido: `origen_tipo` y `tipo="animal_grupo"` con `origen_id=grupo_id` (G-D1/G-D2), reutilización de columnas JSON existentes para editorial/overrides/agregados; carpeta Drive propia por publicación de grupo; persistencia solo editorial/overrides (agregados recalculados G-D4); pre-relleno desde miembros. Compatibilidad con 1:1 y empezar de cero. | ✅ **Cerrada (2026-11-17, diseño aditivo).** Lista para aplicar en F4. *Operativo pendiente:* desplegar/verificar 1:1 en producción. |
| **F4. Implementación end-to-end de grupos** | Adopción conjunta publicable | **Implementada en código local (2026-11-18):** backend (origen grupo/miembros, agregación, derivación G-D3, compositor/whitelist, validación, CRUD/acciones, exclusividad G-D5, refresco en lectura G-D4, endpoints `web-grupos*`), API, gestor UI (pestaña/listado/formulario/acciones), canal/feed/detalle/sitemap/resumen y render público/prerender de grupo/miembros. 1:1 preservada. | Verificación de contrato aplicada en implementación; regresión 659/659. | ✅ **Cerrada en código local.** *Operativo pendiente:* desplegar `.gs` en GAS y verificar en producción (ciclo de grupo, exclusividad, canal/estática/SEO) junto con verificación 1:1 F2/F3. |
| **F5. Endurecimiento y QA** | Estabilidad 1:1 + grupos | **Cerrada (2026-11-18):** tests de contrato/bordes de grupo (derivación, urgencia, validez, exclusividad, `preview == feed`, whitelist, ciclo de vida) y de UI de grupo; corrección de `_filaGrupo`/formulario/acciones que faltaban en `web.js`, restauración por `grupo_id`, listado de grupos no obligatorios con publicación y codificación del bloque de grupos del `.gs`. | Contrato público de grupo para `main` en `TRANSFERIR_A_MAIN.md` §A.2.1. | ✅ **Cerrada.** `npm test` 793/793 (193 suites). *Operativo pendiente:* verificación funcional en producción y visual 360/768/1280. |

**Cierre progresivo:** F0 ✅ → F1 ✅ → F2 ✅ → F3 ✅ → F4 ✅ → F5 ✅ (código local). Queda **pendiente operativo/manual**: verificar en producción 1:1 (F2/F3) y grupos (F4/F5) de punta a punta. **No se re-decide lo cerrado de 1:1** salvo ajustes de compatibilidad documentados.

**Dependencias/cautelas:** despliegue manual de `.gs` y cambios en Sheets con respaldo; mantener aditividad y listados ligeros; saneado/whitelist en servidor siempre; `preview == feed`. Desplegar/verificar la base 1:1 (F2/F3) en paralelo al cierre de contrato F0, sin bloquear la definición.

**Entregables de contrato:** [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md) (base 1:1, D1–D8) + [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md) (extensión grupos, G-D1…G-D7). F0 se cierra cuando el contrato 1:1+grupos queda unificado y sin decisiones bloqueantes.

**Estado "empezar de cero":** las columnas nuevas en `Animales` y `WebPublicaciones` son aditivas y pueden crearse vacías. El esquema final (incluido el origen/discriminador de grupo) se fija en F0/F3 antes de implementar F4.

---

## 5. Notas abiertas / decisiones (estado 2026-11-17, replan con grupos)

**Cerradas 1:1 (D1–D5, base a mantener, ver [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md) §8):**
- Mapeo `estado` interno → `estado_publico`: `disponible→en_adopcion`, `en_acogida→en_acogida`, `en_adopcion→reservado`, `adoptado→adoptado`, `fallecido→cerrado/retirada`. Vocabulario público de 5 valores (extensible/validable para estado agregado de grupo en G-D3).
- `urgente` = solo booleano/bandera; nunca estado (en grupo: derivado si algún miembro es urgente, G-D3).
- Retirada = lápida 410 + restaurar (slug reservado), igual para animal/evento/historia y, por extensión, grupo.
- Media interna en `Animales` (`portada_url`, `portada_alt`, `galeria`, `videos`, `documentos_internos`).
- Propagación publicación → ficha: opt-in desactivado por defecto (definir alcance en grupo).

**Pendientes 1:1 (propuesta por defecto, cerrar en F0/F2):**
- **D6:** campos obligatorios para publicar + coherencia de estado (ampliar a grupo: p. ej. ≥1 miembro, coherencia de conjunto).
- **D7:** política de `author` y `animal.contact` públicos.
- **D8:** columna privada `documents_json` separada de `media_json`.
- Precedencia de overrides de `ficha` frente a base: **`ficha > base` implementada**; hacerla visible en UI (F2).

**Decisiones de grupos — cierran F0 y bloquean F4 (ver [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md) §7):**
- **G-D1:** discriminador/origen (`tipo`/`origen_tipo`) y columnas aditivas en `WebPublicaciones` para grupo.
- **G-D2:** identidad estable del grupo (`grupo_id`), unicidad de publicación por grupo y comportamiento ante renombrado/reasignación.
- **G-D3:** derivación de estado público y `urgent` agregado (tabla de casos: todos disponibles/en_acogida, alguno reservado, todos adoptados, adopciones parciales, `fallecido` parcial, grupo inválido) y reglas de coherencia/publicabilidad.
- **G-D4:** refresco ante cambios de miembros (recalcular en composición/lectura, invalidación/marcado desactualizado, o ambos).
- **G-D5:** exclusividad 1:1 ↔ grupo para `grupo_obligatorio` y tratamiento de publicaciones individuales ya existentes (borrador/publicado/oculto/retirado).
- **G-D6:** representación pública de miembros (resumen vs detalle, qué datos entran en whitelist, sin páginas individuales públicas del conjunto).
- **G-D7:** categoría, canónica/slug, SEO y JSON-LD del grupo; compatibilidad de contrato con `main` (`TRANSFERIR_A_MAIN.md`).
