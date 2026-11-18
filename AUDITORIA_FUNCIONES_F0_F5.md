# Auditoría de funciones y fases aplicadas — gestor web

> **Fecha:** 2026-11-18. **Commit auditado:** `f3f1916` (main, desplegado). **SW en producción:** v283.
> **Alcance:** todo el gestor de fichas/publicaciones: backend (`apps-script/WebPublicaciones.gs`, `Code.gs`), API (`src/js/api.js`), UI (`src/js/web.js`, `dashboard-web.js`), render público (`publico.js`, `prerender-publico.js`) y pruebas (`tests/*.test.js`).
> **Método:** lectura completa de los ficheros, inventario automático de funciones/métodos, contraste con las pruebas por nombre y verificación en producción con la sesión de pruebas (solo lecturas: no se publicó ni guardó nada).
> **Columna «En tests»:** referencias **directas por nombre** en `tests/*.js`. Una referencia no equivale a cobertura real y su ausencia no implica que no se ejercite de forma indirecta.

## 0. Resumen ejecutivo

- **Volumen:** 117 funciones en `WebPublicaciones.gs`, 104 métodos en `web.js`, 16 rutas `web-*` en `Code.gs` y 15 llamadas del gestor en `api.js`. 8 suites y 705 pruebas en verde.
- **Producción estaba desactualizada:** antes del push servía `sw` **v267** (16 versiones por detrás). Tras el push, `v283` y `js/web.js` **idéntico byte a byte** al local.
- **Backend al día:** el gestor de producción consulta grupos y recibe agregados (`Cachorros de Oreo`, 4 miembros, estado derivado `en_adopcion`), así que el `.gs` desplegado incluye F4.
- **F0–F5 cumplen**; la exclusividad 1:1 ↔ grupo se aplica ya en **las dos direcciones** (H-1 cerrado el 2026-11-18).
- **Huecos funcionales:** 5 al auditar, **2 abiertos** (refresco/importar y deploy al cambiar miembros); cerrados H-1, H-2 y H-3. Siguen abiertas 2 decisiones (D7 y orden de publicaciones).

## 1. Producción verificada (2026-11-18)

Comprobado con la sesión de pruebas contra `https://gn-admin.github.io/admin-dashboard` y el canal público real. Solo lecturas.

| Comprobación | Antes del push | Después |
|---|---|---|
| Service worker | **v267** (16 versiones por detrás) | **v283** |
| `js/web.js` | desactualizado | **idéntico al local** (133.925 B) |
| `js/publico.js` con grupos | — | sí (referencias a `animal_grupo`) |
| `.gs` en GAS | sin verificar | **al día**: `web-grupos` devuelve `Cachorros de Oreo`, 4 miembros, estado derivado `en_adopcion` |
| Pestañas del gestor | — | Animales (1), Grupos (0 publicaciones, 1 candidato), Eventos e historias (1) |
| Resumen del gestor | — | 1 publicado, 0 borradores, 0 ocultos, 1 retirada, 12 sin configurar, 0 incompletos |
| Canal público | — | `publicaciones` → 1 (`laia`), detalle `laia`, `retiradas` → 1, `taxonomias`, filtro `type=animal_grupo` aceptado |
| Estáticas | — | `sitemap.xml` 2 `<loc>`, `index.json` con `laia` + `prueba-retirada-playwright` (11:19:52Z), `robots.txt` 200, `publico.html` 200 |
| `?endpoint=config` | — | **401** (exige token), aunque el plan §5.3 lo lista como público |
| Chip de estado de deploy | — | no llegó a pintarse en la comprobación: **sin verificar** |

**No verificado en producción:** escrituras (publicar, guardar, ocultar, retirar), subida y borrado de media, ciclo completo de una publicación de grupo, lector de pantalla real y el checklist F0–F5 de punta a punta.

## 2. Inventario — backend `WebPublicaciones.gs` (117 funciones)


**Estado y urgencia**

| Función | Línea | En tests |
|---|---|---|
| `webEstadoPublicoDerivado` | 101 | sí (5) |
| `webModoEstadoPublico` | 120 | — |
| `webEstadoPublicoEfectivo` | 135 | sí (3) |
| `webAnimalUrgente` | 144 | sí (4) |
| `webUrgenteEfectivo` | 150 | — |

**Saneado y composición**

| Función | Línea | En tests |
|---|---|---|
| `webSinAcentos` | 43 | — |
| `webNormalizarSlug` | 58 | sí (1) |
| `webSlugValido` | 65 | — |
| `webUrlSegura` | 222 | sí (1) |
| `webGaleriaSegura` | 239 | — |
| `webVideosSeguros` | 262 | — |
| `webIconosSeguros` | 279 | — |
| `webTagsSeguras` | 292 | — |
| `webFichaSegura` | 302 | sí (2) |
| `webEscaparAtributo` | 323 | — |
| `webHtmlAtributos` | 329 | — |
| `webSanearHtml` | 357 | sí (4) |
| `webBloqueAnimal` | 905 | — |
| `webBloqueEvento` | 955 | — |
| `webConstruirPublicacion` | 981 | sí (17) |

**Datos, hoja y ficha**

| Función | Línea | En tests |
|---|---|---|
| `webBool` | 69 | — |
| `webParseJson` | 78 | sí (1) |
| `webArray` | 87 | sí (1) |
| `webTexto` | 96 | sí (1) |
| `webObjetoCampos` | 160 | — |
| `webListaTextos` | 170 | — |
| `webIsoFecha` | 176 | — |
| `webFechaLegible` | 190 | — |
| `webTiempoLectura` | 199 | — |
| `webAhora` | 205 | — |
| `webClonarPlano` | 232 | — |
| `webUuid` | 382 | — |
| `webConfigWeb` | 389 | — |
| `webHojaExiste` | 400 | — |
| `webSheetConfig` | 411 | — |
| `webDiagnostico` | 421 | — |
| `webFilasWeb` | 447 | — |
| `webFilaAPublicacion` | 453 | sí (16) |
| `webHistorial` | 496 | sí (1) |
| `webHistorialDeCambio` | 509 | — |
| `webFichaBool` | 520 | — |
| `webFichaOrden` | 531 | — |
| `webFichaTags` | 544 | — |
| `webNormalizarFicha` | 560 | — |
| `webMapaAnimales` | 626 | — |
| `webFotoOrigen` | 637 | — |
| `webPublicacionPorId` | 833 | sí (3) |
| `webPublicacionDeOrigen` | 839 | sí (2) |
| `webSlugOcupado` | 852 | sí (1) |
| `webValidarPublicacion` | 872 | sí (2) |
| `webSlugCheck` | 1835 | sí (5) |
| `webResumen` | 1862 | sí (3) |

**Grupos (agregación)**

| Función | Línea | En tests |
|---|---|---|
| `webEstadoPublicoDerivadoOrigen` | 107 | — |
| `webMapaGrupos` | 653 | — |
| `webMiembrosDeGrupo` | 675 | — |
| `webGrupoInfo` | 688 | — |
| `webGrupoValidoParaPublicar` | 715 | sí (5) |
| `webGrupoUrgente` | 726 | sí (2) |
| `webPortadaGrupo` | 734 | sí (1) |
| `webMiembrosResumen` | 743 | — |
| `webEspecieGrupo` | 757 | sí (1) |
| `webCategoriaGrupoDerivada` | 767 | sí (2) |
| `webBloqueGrupo` | 777 | — |

**Animales (CRUD)**

| Función | Línea | En tests |
|---|---|---|
| `webListarAnimales` | 1086 | sí (1) |
| `webGetAnimal` | 1147 | — |
| `webUpsertAnimal` | 1206 | sí (13) |
| `webEstadoAnimal` | 1332 | sí (5) |
| `webEliminarAnimal` | 1361 | sí (1) |
| `webArchivarAnimal` | 1381 | sí (1) |
| `webRestaurarAnimal` | 1396 | sí (1) |
| `webPreviewAnimal` | 1410 | sí (2) |

**Grupos (CRUD)**

| Función | Línea | En tests |
|---|---|---|
| `webEstadoGrupoDerivado` | 693 | sí (2) |
| `webListarGrupos` | 1421 | sí (3) |
| `webGetGrupo` | 1466 | — |
| `webUpsertGrupo` | 1497 | sí (6) |
| `webEstadoGrupoPub` | 1578 | sí (2) |
| `webArchivarGrupo` | 1604 | sí (1) |
| `webRestaurarGrupo` | 1605 | sí (2) |
| `webEliminarGrupo` | 1617 | sí (2) |
| `webPreviewGrupo` | 1627 | sí (4) |

**Eventos (CRUD)**

| Función | Línea | En tests |
|---|---|---|
| `webListarEventos` | 1637 | sí (3) |
| `webPreviewEvento` | 1674 | — |
| `webGetEvento` | 1680 | — |
| `webUpsertEvento` | 1688 | sí (3) |
| `webEstadoEvento` | 1774 | sí (1) |
| `webArchivarEvento` | 1799 | sí (3) |
| `webRestaurarEvento` | 1816 | sí (1) |

**Media (Drive)**

| Función | Línea | En tests |
|---|---|---|
| `webBytesAprox` | 1939 | — |
| `webRaizMedia` | 1950 | — |
| `webCarpetaTipo` | 1959 | — |
| `webRutaCarpeta` | 1966 | — |
| `webCarpetaPublicacion` | 1977 | — |
| `webExtensionMedia` | 1999 | — |
| `webNombreArchivo` | 2012 | — |
| `webSubirMedia` | 2024 | sí (12) |
| `webEliminarMedia` | 2087 | sí (8) |
| `webBuscarCarpetaFicha` | 2128 | — |
| `webCarpetaEnArbolMedia` | 2146 | — |

**Deploy**

| Función | Línea | En tests |
|---|---|---|
| `webDeployPropiedades` | 2170 | — |
| `webDeployConfig` | 2174 | — |
| `webDeployEstado` | 2190 | sí (2) |
| `webDeployProbar` | 2241 | — |

**Canal público**

| Función | Línea | En tests |
|---|---|---|
| `webPublicacionBaseUrl` | 1061 | — |
| `webDominioPublico` | 1070 | — |
| `webRutaPublica` | 1077 | — |
| `webPublicables` | 2249 | — |
| `webRetiradas` | 2259 | sí (1) |
| `webListarPublicas` | 2276 | sí (17) |
| `webProyeccionCard` | 2356 | — |
| `webPublicacionPublica` | 2366 | sí (16) |
| `webRedirects` | 2422 | sí (3) |
| `webTaxonomias` | 2444 | sí (1) |
| `webConfigPublica` | 2458 | — |
| `webSitemap` | 2476 | sí (5) |

**Núcleo**

| Función | Línea | En tests |
|---|---|---|
| `webOrigenDePublicacion` | 813 | — |
| `webOrigen` | 829 | — |
| `webDispararDeploy` | 2200 | sí (9) |


## 3. Inventario — frontend `src/js/web.js` (104 métodos)

**Formulario de animal**

| Método | Línea | En tests |
|---|---|---|
| `abrirAnimal` | 664 | — |
| `_mostrarFormAnimal` | 676 | sí (1) |
| `_leerFormAnimal` | 844 | — |
| `guardarAnimal` | 1181 | — |
| `abrirParaAnimal` | 2086 | — |

**Formulario de evento**

| Método | Línea | En tests |
|---|---|---|
| `abrirEvento` | 1210 | — |
| `_mostrarFormEvento` | 1223 | — |
| `_leerFormEvento` | 1361 | — |
| `guardarEvento` | 1420 | — |
| `onChangeTipo` | 2090 | — |

**Formulario de grupo**

| Método | Línea | En tests |
|---|---|---|
| `nuevaPublicacionGrupo` | 1445 | sí (1) |
| `_pickerGrupoHtml` | 1458 | sí (2) |
| `abrirGrupo` | 1474 | sí (2) |
| `_mostrarFormGrupo` | 1486 | — |
| `_leerFormGrupo` | 1636 | — |
| `guardarGrupo` | 1695 | sí (1) |
| `previewGrupo` | 1718 | sí (1) |

**Media**

| Método | Línea | En tests |
|---|---|---|
| `normalizarMediaUrl` | 62 | sí (10) |
| `mediaTextoGaleria` | 77 | sí (2) |
| `_carpetaFicha` | 89 | sí (5) |
| `parseGaleria` | 95 | sí (5) |
| `parseIconos` | 111 | sí (2) |
| `parseVideos` | 120 | sí (2) |
| `parseDocumentos` | 129 | sí (2) |
| `_leerArchivoBase64` | 1045 | — |
| `driveFileId` | 1055 | sí (5) |
| `extraerMediaFormulario` | 1067 | sí (1) |
| `quitarMediaDeTexto` | 1088 | sí (2) |
| `_campoMedia` | 1094 | — |
| `_anadirMedia` | 1100 | sí (5) |
| `subirMediaWeb` | 1121 | — |
| `_mediaFormularioHtml` | 1145 | — |
| `_pintarMediaFormulario` | 1154 | — |
| `borrarMediaWeb` | 1160 | — |
| `_propagarMediaAFicha` | 1341 | — |

**Ficha C3**

| Método | Línea | En tests |
|---|---|---|
| `_fichaPresentacion` | 924 | sí (7) |
| `_leerFichaPresentacion` | 947 | — |
| `moverFichaBloque` | 974 | sí (1) |
| `_fichaPresentacionHtml` | 996 | sí (2) |

**Ciclo de vida y acciones**

| Método | Línea | En tests |
|---|---|---|
| `crearPublicacion` | 647 | — |
| `_cambiarEstadoGrupo` | 1733 | — |
| `publicarGrupo` | 1761 | sí (1) |
| `ocultarGrupo` | 1762 | sí (1) |
| `retirarGrupo` | 1764 | sí (1) |
| `restaurarGrupo` | 1784 | sí (1) |
| `eliminarGrupo` | 1804 | sí (1) |
| `cambiarEstado` | 1847 | — |
| `archivar` | 1891 | — |
| `restaurarWebEvento` | 1907 | sí (1) |
| `eliminarWebAnimal` | 1926 | — |
| `retirarWebAnimal` | 1945 | sí (1) |
| `restaurarWebAnimal` | 1965 | sí (1) |

**Preview y compartir**

| Método | Línea | En tests |
|---|---|---|
| `preview` | 1985 | sí (17) |
| `copiarPreview` | 2000 | — |
| `urlPublicaEstatica` | 2007 | sí (2) |
| `copiarTexto` | 2019 | — |
| `copiarEnlaceWeb` | 2044 | sí (1) |
| `historialSlugHtml` | 2053 | — |
| `validarSlugInput` | 2060 | — |

**Listado, filtros y estado**

| Método | Línea | En tests |
|---|---|---|
| `normalizarSlug` | 26 | sí (9) |
| `slugValido` | 34 | sí (8) |
| `completitud` | 43 | sí (17) |
| `parseLista` | 138 | sí (3) |
| `seoTitle` | 146 | sí (7) |
| `estadoLabel` | 152 | sí (6) |
| `_estadoPublicoLabel` | 158 | sí (3) |
| `_heredadoItem` | 163 | — |
| `_heredadoBool` | 167 | — |
| `estadoCls` | 174 | sí (5) |
| `publicacionesAnimales` | 180 | sí (3) |
| `animalesSinPublicacion` | 185 | sí (3) |
| `render` | 191 | sí (1) |
| `cargar` | 205 | sí (3) |
| `_html` | 226 | sí (3) |
| `estadoDeployTexto` | 275 | sí (3) |
| `mensajeDeployManual` | 284 | sí (4) |
| `_pintarChipDeploy` | 294 | — |
| `_cargarEstadoDeploy` | 302 | — |
| `regenerarWeb` | 320 | — |
| `_avisoPublicados` | 337 | sí (4) |
| `_contadoresTab` | 344 | sí (2) |
| `_statsHtml` | 362 | sí (1) |
| `_tabla` | 375 | — |
| `_filaAnimal` | 406 | sí (1) |
| `_filaEvento` | 437 | sí (1) |
| `_filaGrupo` | 461 | sí (4) |
| `_chips` | 497 | — |
| `_campoLabel` | 503 | sí (1) |
| `_faltantesPublicacion` | 514 | sí (3) |
| `_vacio` | 519 | — |
| `_sinPublicaciones` | 524 | — |
| `_esc` | 534 | sí (11) |
| `_snack` | 540 | — |
| `_snackErr` | 544 | sí (5) |
| `cambiarTab` | 551 | — |
| `buscar` | 561 | sí (1) |
| `filtrarEstado` | 567 | — |
| `nuevaPublicacion` | 575 | — |
| `cerrarPicker` | 595 | — |
| `filtrarPicker` | 605 | — |
| `_pickerHtml` | 611 | — |
| `_pickerLista` | 629 | sí (6) |
| `recargar` | 652 | — |
| `avisoDeploy` | 1830 | sí (6) |

## 4. Rutas y endpoints

**Backend (`Code.gs`), 16 rutas del gestor** (todas exigen token; la autorización por rol la aplica el router):

`web-animales`, `web-animales-estado`, `web-animales-preview`, `web-grupos`, `web-grupos-estado`, `web-grupos-preview`, `web-eventos`, `web-eventos-estado`, `web-eventos-preview`, `web-media-subir`, `web-media-eliminar`, `web-deploy`, `web-deploy-estado`, `web-deploy-cuerpo`, `web-resumen`, `web-slug-check`.

**Cliente (`api.js`), 15 llamadas** usadas desde `web.js`: las 12 de datos (animales/grupos/eventos × lista, estado, preview), `web-resumen`, `web-slug-check`, `web-media-subir`, `web-media-eliminar`, `web-deploy`, `web-deploy-estado`.

**Canal público:** `publicaciones`, `publicacion`, `retiradas`, `sitemap`, `redirects`, `taxonomias` (+ alias `/api` y `/v1`). `config` responde **401** hoy, no es público.

## 5. Verificación por fase

### F0 — Contrato 1:1 + grupos

| Requisito | Dónde | Estado |
|---|---|---|
| Taxonomía y estados (`borrador/publicado/oculto/retirado`) | `WEB_ESTADOS`, `webFilaAPublicacion` (453) | ✅ |
| Derivación de estado público y `urgent` | `webEstadoPublicoDerivado` (101), `webEstadoPublicoEfectivo` (135), `webUrgenteEfectivo` (150) | ✅ |
| `preview == feed` | `webConstruirPublicacion` (981) en preview y canal | ✅ |
| Slug único + historial + 301 | `webSlugOcupado` (852), `webHistorial` (496), `webRedirects` (2422) | ✅ |
| Whitelist y saneado | `webBloqueAnimal` (905), `webBloqueEvento` (955), `webSanearHtml` (357), `webUrlSegura` (222) | ✅ |
| Exclusividad 1:1 ↔ grupo | `webEstadoGrupoPub` (1564) + `webGrupoVigenteDeAnimal`, `webEstadoAnimal`, `webUpsertAnimal`, `webPublicables` | ✅ **dos direcciones** (H-1) |

### F1 — UX y flujos

| Requisito | Dónde | Estado |
|---|---|---|
| Pestañas con contadores | `_contadoresTab` (web.js 344) | ✅ |
| Selector de animales sin publicación | `animalesSinPublicacion` (185), `animalesEnGrupoVigente`, `_pickerAvisoGrupo`, `_pickerLista` (629) | ✅ excluye y avisa (H-2) |
| Selector de grupos | `nuevaPublicacionGrupo` (1445), `_pickerGrupoHtml` (1458) | ✅ |
| Formularios con heredados en solo lectura | `_mostrarFormAnimal` (676), `_mostrarFormGrupo` (1486) | ✅ |
| Acciones por estado | `_filaAnimal` (406), `_filaGrupo` (461), `_filaEvento` (437) | ✅ |
| Formularios largos / fatiga en móvil | — | ⚠️ anotado en `MEJORAS_UI_UX_PENDIENTES.md` (A1) |

### F2 — Fuente de verdad, composición y whitelist

| Requisito | Dónde | Estado |
|---|---|---|
| Estado web visible en la ficha interna | `_webEstadoChipHtml` + `_webGrupoLineaHtml` (dashboard.js); `webGrupoResumenDeAnimal` en `webGetAnimal` | ✅ animal y grupo (H-3) |
| Retirar/restaurar en los tres tipos | `webEstado*`, `webRestaurar*` + UI | ✅ |
| Ficha C3 con orden y precedencia `ficha > base` | `webNormalizarFicha` (560), `_fichaPresentacion` (924), `moverFichaBloque` (974) | ✅ |
| Precedencia visible en UI | — | ⚠️ solo «Heredado: …» en selects |
| Política de `author`/`contact` (D7) | `autor` guardado; contacto cae al de la asociación | ⚠️ **abierta** |

### F3 — Datos, persistencia y media

| Requisito | Dónde | Estado |
|---|---|---|
| Documentos privados separados | `documents_json` (4 usos backend), fuera del payload (1252) | ✅ |
| Media interna y pre-relleno | `portada_url`/`galeria`/`videos`; `webFotoOrigen` (637) | ✅ |
| Propagación opt-in publicación → ficha | `_propagarMediaAFicha` (web.js 1341) | ✅ |
| Ficha → publicación bajo demanda | — | ❌ no existe (H-4) |
| Carpeta por ficha y borrado | `webCarpetaPublicacion` (1977), `webSubirMedia` (2024), `webEliminarMedia` (2087) | ✅ (sin test directo) |

### F4 — Grupos (G1)

| Requisito | Dónde | Estado |
|---|---|---|
| Tipo `animal_grupo` con `origen_tipo=grupo` | `webUpsertGrupo` (1497) | ✅ |
| Agregación (estado, urgente, portada, miembros) | `webEstadoGrupoDerivado` (693), `webGrupoUrgente` (726), `webPortadaGrupo` (734), `webMiembrosResumen` (743) | ✅ |
| Publicabilidad del conjunto | `webGrupoValidoParaPublicar` (715), `webValidarPublicacion` (872) | ✅ |
| Exclusividad al activar el grupo | `webEstadoGrupoPub` (1564) | ✅ |
| Exclusividad al publicar el individuo | `webGrupoVigenteDeAnimal` en `webEstadoAnimal`/`webUpsertAnimal` + dedupe en `webPublicables` | ✅ (H-1) |
| Render público y prerender del grupo | `webBloqueGrupo` (777), `publico.js`, `prerender-publico.js` | ✅ |
| Refresco tras cambios de miembros | recomposición en lectura | ⚠️ estática hasta el cron (H-5) |

### F5 — Endurecimiento y QA

| Requisito | Dónde | Estado |
|---|---|---|
| Tests de contrato 1:1 y grupo | `web-backend.test.js`, `web.test.js` | ✅ 705/705 |
| Saneado idempotente y URLs | `tests/saneado-html.test.js` | ✅ |
| Sitemap/robots/estáticas | `scripts/prerender-publico.js`, `tests/prerender.test.js` | ✅ |
| Compartir y canónica única | `compartir` + `urlPublicaEstatica` (2007) | ✅ |
| Accesibilidad de regiones vivas | `tests/diseno.test.js`, `tests/publico.test.js` | ✅ (sin lector real) |
| Regresión móvil/tablet | medidas 390/768/900/1280 | ✅ en local |
| QA completo en producción | checklist F0–F5 | ⏳ pendiente |

## 6. Hallazgos priorizados

| ID | Hallazgo | Evidencia | Impacto | Coste |
|---|---|---|---|---|
| **H-1** | **Exclusividad 1:1 ↔ grupo invertida**: se puede publicar un individuo cuyo grupo ya está publicado | `webEstadoAnimal` y `webUpsertAnimal` no miran el grupo; `webPublicables` no deduplicaba; única guarda en `webEstadoGrupoPub` | Dos fichas vivas del mismo animal en feed, sitemap y estática | **✅ cerrado** (v284): guardas en las dos direcciones, dedupe en `webPublicables`, detalle con **301 al grupo desde el slug actual y los históricos**, sitemap desde `webPublicables` y `?endpoint=redirects` con una entrada por cada slug |
| **H-2** | El selector de animales ofrece miembros de grupo obligatorio y no avisa | `animalesSinPublicacion` (web.js 185); 0 apariciones de «exclusiv» en `web.js` | Empuja al error de H-1 | **✅ cerrado** (v284) |
| **H-3** | Sin indicador del estado web del grupo en la ficha del miembro | `_webEstadoChipHtml` solo pintaba el del animal | Incertidumbre al editar miembros | **✅ cerrado** (v285; chip corregido en v286) |
| **H-4** | No hay «importar desde ficha» ni refresco manual de la publicación | propagación solo publicación → ficha (`_propagarMediaAFicha` 1341) | Retrabajo si cambia la ficha interna | M |
| **H-5** | Cambiar un miembro no regenera la estática | el deploy se decide en `_webAnotarDeploy` a partir de las rutas del gestor | Web desfasada hasta el cron (30 min), sin aviso | M |
| **H-6** | D7 sin cerrar (`author`/`contact`) | `autor` se guarda; contacto cae al de la asociación | Política pública sin documentar | S |
| **H-7** | Sin orden de publicaciones | campo `orden` en el modelo, sin control en UI | Orden depende de la hoja | S |
| **H-8** | Documentación desalineada | `memory.md` dice «sin pendientes»; plan marca F0–F5 cerradas; §5.3 lista `config` como público y hoy es 401 | Decisiones mal informadas | S |

## 7. Cobertura de pruebas

- **Backend:** 54 de 117 funciones con referencia directa (46 %). Las 63 restantes son, en su mayoría, helpers puros y utilidades de Drive/hoja que se ejercitan de forma indirecta a través de los flujos.
- **Frontend:** 59 de 104 métodos con referencia directa (57 %). Los 45 sin referencia son casi todos render y handlers (`_mostrarForm*`, `_tabla`, `abrir*`, `guardar*`), cubiertos por el contrato de backend y por las pruebas de helpers.
- **Riesgo real de la parte no referenciada:** los `get*` (`webGetAnimal` 1147, `webGetGrupo` 1466, `webGetEvento` 1680), toda la capa de Drive (`webRaizMedia`…`webCarpetaEnArbolMedia`) y `webDeployProbar`.
- **Propuesta mínima:** pruebas de los tres `get*`, de la exclusividad en las dos direcciones y de `webPublicables` con un grupo publicado y un miembro publicado. **Hecho para exclusividad y publicables** (7 casos en `tests/web-backend.test.js` y 5 en `tests/web.test.js`, 2026-11-18); los `get*` siguen pendientes.

## 8. Conclusión y orden recomendado

El gestor está **implementado y coherente con el contrato**. H-1, H-2 y H-3 están cerrados (2026-11-18); lo que falta no es rehacer nada, sino añadir un aviso/acción (H-4), decidir dos cosas (D7 y orden) y terminar la verificación en producción con escrituras reales.

1. ~~**H-1 + H-2** (exclusividad bidireccional y aviso en el selector)~~ — **hecho** (v284); falta subir `WebPublicaciones.gs` a GAS.
2. **H-5** (aviso de «publicación desactualizada» y acción de refresco/deploy).
3. ~~**H-3** (indicador de grupo en el miembro)~~ — **hecho** (v285, chip corregido en v286); falta **H-4** (importar desde ficha).
4. **D7** y orden de publicaciones (H-7).
5. Actualizar `memory.md` y el plan (H-8).
6. Verificación en producción con escrituras y el checklist F0–F5.
7. Después, la lógica nueva, y al final `MEJORAS_UI_UX_PENDIENTES.md`.

> **Método:** el inventario de las secciones 2 y 3 se generó automáticamente desde los ficheros; la columna «En tests» cuenta referencias directas por nombre en `tests/*.js` (una referencia no equivale a cobertura real).
