# Plan · Contratos de adopción y acogida (textos e imágenes del documento nuevo)

> **Estado:** implementado y cerrado en código (F-C0…F-C5, 2026-11-18/19). Queda solo la prueba con impresora real (decisión D-C17: sin numeración de página por ahora).
> **Fuentes:** `CONTRATO DE ADOPCION ACTUALIZADO.docx` (3 folios a doble cara, dos imágenes JPEG embebidas) y `contratoacogida EN BLANCO.doc` (una cara, con logo y sello).
> **Alcance:** contrato de adopción, hoja de estipulaciones y contrato de acogida; modelo de datos en las hojas, generación del PDF e impacto visual.

## 0. Resumen

1. El documento nuevo **sustituye** el texto y la estructura del contrato de adopción actual: 20 estipulaciones dentro del contrato, tabla de datos del animal con capa/color/tamaño, importes (100 € y 900 €), cláusula especial para adoptantes mayores de 65 años y bloque de firmas con la firma de la Asociación.
2. Exige **datos que hoy no existen**: `capa`, `color`, `tamaño` y `nombre definitivo` no están en `Animales`; la donación (hoy 50 € fijos) y la indemnización (900 €) no están en `contratos`; la persona responsable del >65 no tiene equivalente (el «tutor» actual es otra figura).
3. Cambia la **estructura legal**: hoy hay un contrato con 10 cláusulas propias **más** un anexo de 13 cláusulas («Términos»), separados y con solapes. El documento nuevo integra las estipulaciones en el contrato y deja una hoja aparte firmada. Hay que decidir qué se conserva de lo actual (periodo de prueba, microchip 15-30 días, seguimiento 1/3/6/12 meses, eutanasia).
4. La acogida tiene **su propio documento** (`contratoacogida EN BLANCO.doc`): es una custodia temporal **por horas**, con responsabilidad civil del acogedor, preaviso de 2 días y una **lista de material** que se entrega y se devuelve. No se parece al contrato de acogida que genera hoy la app (8 condiciones genéricas, sin material, sin firma y sin persistencia): hay que sustituirlo, no adaptarlo.
5. El PDF se genera **imprimiendo HTML** (`_printAsync`), no con un motor de PDF. «Tres folios a doble cara» solo se puede garantizar con control de saltos y revisión en navegador, no con paginación programática.

**Orden recomendado:** cerrar decisiones y textos (F-C0) → columnas y formularios (F-C1) → contrato de adopción (F-C2) → hoja de estipulaciones (F-C3) → acogida (F-C4) → endurecimiento y QA de impresión (F-C5).

---

## 1. Inventario del documento

### 1.1 Estructura y paginación

| # | Bloque | Qué contiene |
|---|---|---|
| 1 | Título | «Contrato de adopción» |
| 2 | Partes intervinientes | Adoptante (nombre, DNI, domicilio, teléfono, email) y Asociación (nombre, CIF, domicilio, dos teléfonos) |
| 3 | Datos de adopción | Tabla de 13 filas, la última con la fotografía |
| 4 | Nota | «Se adjunta hoja de estipulaciones revisada y firmada por el adoptante» |
| 5 | Fecha y firma | «En Irún: / / 2026» + Firma adoptante |
| 6 | Estipulaciones | 1ª a 20ª, con sublistas en 3ª y 19ª |
| 7 | Firma Asociación | Tabla con «En Irún: / / 2026» + Firma Asociación (imagen) |
| 8 | Cláusula especial | Adoptantes mayores de 65 años + tabla de persona responsable + dos firmas |

El propio documento dice «formado por tres folios a doble cara», es decir **6 caras**. Hoy el contrato ocupa 4 páginas variables (con anexo de tutor puede llegar a 5) y el anexo de términos 2 más.

### 1.2 Partes intervinientes (texto literal a reproducir)

- **Adoptante:** «D./Dña. ………, mayor de edad, que actúa en su propio nombre y derecho, con DNI ………, con domicilio en ……… teléfono ………, y correo electrónico ………». El documento añade «Actual propietario y responsable del animal» (ver erratas, §1.8).
- **Asociación:** «ASOCIACIÓN PRO-BIENESTAR ANIMAL, GRUPO NEBAK, con CIF G75203562, con domicilio en la calle Santiago, n.º 27, 1º izquierda, Irun, código postal 20300, y con teléfonos de contacto 625140588 y 600042594».
  - Hoy estos datos salen de `CONFIG.asociacion` (`nombre`, `cif`, `domicilio`, `email`, `telefono`, `registro`, `web`) y se congelan en el contrato (`entidad_*`). El documento fija **dos teléfonos** y no menciona registro ni web.
- **Denominaciones:** «el Adoptante» y «la Asociación» (hoy el PDF usa «el Adoptante» y «la Entidad»).

### 1.3 Datos de adopción (13 filas del documento)

| Fila del documento | ¿Existe en el sistema? | Origen actual |
|---|---|---|
| NOMBRE DEL ANIMAL | Sí | `Animales.nombre` |
| NOMBRE DEFINITIVO | **No** | — (no hay campo; podría ser el nombre tras la adopción) |
| ESPECIE | Sí | `Animales.especie` |
| N.º MICROCHIP | Sí | `Animales.microchip` |
| RAZA | Sí | `Animales.raza` |
| SEXO | Sí | `Animales.sexo` |
| FECHA DE NACIMIENTO | Sí | `Animales.fecha_nacimiento` |
| CAPA | **No** | — |
| COLOR | **No** | — |
| TAMAÑO | **No** | — |
| ESTERILIZACION | Sí | `Animales.esterilizada` (booleano) |
| OTRAS RESEÑAS | Parcial | `Animales.descripcion` (texto libre; hoy se imprime como «Otras reseñas») |
| FOTOGRAFÍA | Sí | `Animales` (portada/foto) → thumbnail de Drive |

### 1.4 Estipulaciones 1ª–20ª: qué introduce cada una

| # | Contenido | ¿Está hoy? |
|---|---|---|
| 1ª | Adopción hasta la muerte del animal | No como tal (hoy «durante toda su vida») |
| 2ª | Exclusivamente como animal de compañía | Sí (cláusula 1) |
| 3ª | Prohibiciones (caza, experimentación, peleas, cría, guarda, fincas, circos, cine/TV, perro policía) — lista de 9 | Parcial (hoy agrupa 6) |
| 4ª | No atado ni encerrado (jaulas, habitaciones, terrazas, patios, garajes) | Sí |
| 5ª | **PPP**: licencia, seguro, registro municipal, bozal y correa no extensible | **No** |
| 6ª | Refugio de lluvia/frío/sol y espacio suficiente | **No** |
| 7ª | Prohibición de maltrato (Ley de Protección Animal y Código Penal) | Parcial |
| 8ª | Alimentación, higiene, asistencia veterinaria, cuidado y respeto | Sí (repartido) |
| 9ª | **Gatos**: esterilización en fecha adecuada + informe veterinario sellado con nº de colegiado | Parcial (hoy «si procede») |
| 10ª | Compañía, afecto, ejercicio diario | Sí |
| 11ª | No regalar/vender/ceder; no abandonar; fallecimiento del adoptante y nuevo contrato | Parcial (no la parte de fallecimiento) |
| 12ª | Desaparición (robo, pérdida) notificada | Sí |
| 13ª | Cambio de teléfono/domicilio | Sí |
| 14ª | Devolución a la Asociación sin reclamar gastos | Parcial |
| 15ª | Visitas sin previo aviso | Parcial (hoy «seguimiento») |
| 16ª | Incumplimiento → resolución, retirada inmediata, denuncia, **defunción notificada en 12 h por burofax**, autopsia | **No** en su mayoría |
| 17ª | **Donación de 100 €** | Sí el campo, pero por defecto **50 €** |
| 18ª | **900 €** si desaparición o muerte por dolo/negligencia | **No** |
| 19ª | **Perros**: esterilización salvo justificación veterinaria o edad insuficiente | **No** |
| 20ª | Capacidad de obrar, consentimiento, «tres folios a doble cara» | Parcial |

### 1.5 Cláusula especial (adoptantes mayores de 65 años)

Texto propio + tabla de la persona responsable designada (**nombre completo, DNI/NIE, teléfono, email, dirección**) + firmas del adoptante y de esa persona. Requiere:
- marcar que el adoptante es mayor de 65 (dato nuevo),
- bloques de la persona responsable (5 campos + firma),
- firma adicional en el PDF.

El «tutor / persona de apoyo» actual (`f2_*`) **no es lo mismo**: aquel asume el cuidado si el adoptante no puede, este asume la custodia tras el fallecimiento y se compromete a avisar en 48 h.

### 1.6 Firmas y fechas

- Fecha: «En Irún: / / 2026» (ciudad fija en el documento; hoy es `ct-ciudad` editable).
- Firma del adoptante (hoy canvas → dataURL).
- Firma de la Asociación: en el documento es **una imagen**; hoy es un sello generado con el logo o una firma dibujada en el modal.
- Cláusula 65: firmas del adoptante y de la persona responsable.

### 1.7 Imágenes embebidas

El `.docx` contiene **dos JPEG** en base64:
1. una junto a «Firma Asociación» (aparentemente la firma/estampa de la entidad),
2. otra descrita por el extractor como «imagen que contiene dibujo, animal» (probablemente el sello o un adorno con el logo).

El fichero que tenemos es **texto extraído**; para reutilizarlas hay que sacarlas del `.docx` original (`word/media/`) y confirmar con la asociación cuál es el logo, cuál la firma y cuál el sello, en qué resolución y si autorizan su uso en el PDF. No deben incrustarse como base64 en el código: van a `assets/` (o Drive, como el logo actual).

**Ya extraídas a `src/assets/contratos/`** (ver §6.2):

| Fichero | Origen | Tamaño | Uso |
|---|---|---|---|
| `logo-nebak-horizontal.jpg` | `.doc` de acogida (`logo nebak pequeño`) | 450×147, 300 dpi | Cabecera del contrato (4 cm → ~286 dpi) |
| `sello-nebak.jpg` | `.doc` de acogida (`SELO NEBAK MODIFICADO`) | 197×196, 300 dpi | Sello del pie (≤2,5 cm → ~200 dpi) |
| `emblema-nebak.jpg` | cabecera del `.docx` de adopción | 1344×1300, 300 dpi | Emblema en alta para imprimir grande (mismo motivo, otra versión) |

El `.docx` de adopción trae además una **firma manuscrita** (`word/media/image2.jpeg`, 247×123) junto al logo en el bloque de firmas. No se copia al repo: el repositorio es público y una firma personal no debe versionarse; si el PDF la necesita, va a Drive o a un secreto, no a `git` (ver D-C2).

### 1.8 Erratas y decisiones de redacción detectadas

- «Actual propietario y responsable del animal, quien en adelante será denominado como el Adoptante» → contradictorio (el adoptante no es el propietario previo; lo es la Asociación). **Corregir antes de reproducir.**
- «¡Indicios de que ha existido dolo o negligencia por parte de! Adoptante» (signos de exclamación sueltos).
- «El Adoptante se compromete **con este contrato a** esterilizarlo» / «se compromete con este contrato a proporcionar» (repetición).
- Mayúsculas inconsistentes: «La Asociación», «el Adoptante», «La cantidad».
- 3ª empieza con viñetas dobles («- - 1.»), 19ª mezcla numeración y viñetas.
- «En Irún: / / 2026» deja el año fijo.
- **Recomendación:** corregir ortografía y estilo al maquetar, con revisión de la asociación, y congelar el texto en una **versión** (`documento_version`) para no invalidar contratos ya firmados.

---

## 2. Estado actual del sistema

### 2.1 Documentos que se generan hoy

| Documento | Función | Páginas aprox. | Datos |
|---|---|---|---|
| Contrato de adopción | `PdfExport._buildContracto` | 4 (+1 con tutor) | Entidad, reunidos/exponen, datos animal (10), adoptante (5), anexo tutor, 10 cláusulas, firmas + sello |
| Términos de adopción (anexo) | `PdfExport._buildTerminosAdopcion` + `Dashboard._terminosAdopcionCuerpo` | 2 | 13 cláusulas + firma del adoptante + sello, «Versión 1.0 (2026/11/10)» |
| Contrato de acogida (opcional) | `PdfExport._buildContratoAcogida` | 1–2 | Familia, animal, fechas, 8 condiciones, firmas |
| Memoria anual | `PdfExport._buildMemoria` | variable | — |

### 2.2 Datos y de dónde salen

- **Animal:** `Animales` (nombre, especie, raza, sexo, edad, fecha_nacimiento, peso, esterilizada, microchip, descripcion, foto). El contrato **congela una copia** (`animal`, `especie`, `raza`, `edad`, `animal_sexo`, `animal_microchip`, `animal_fecha_nacimiento`, `animal_peso`, `animal_esterilizada`, `animal_descripcion`, `animal_foto`) y, si falta, cae a la ficha viva (`Dashboard._contratoAnimalDatos`).
- **Adoptante:** solicitud/adopción (`p.adoptante`, `p.email`, `p.telefono`) + campos del formulario (`f1_*`).
- **Entidad:** `CONFIG.asociacion` y `CONFIG.contacto`, congelado en `entidad_*`.
- **Contrato:** hoja `contratos`, columnas usadas hoy: `id`, `adopcion_id`, `animal`, `animal_id`, `fecha`, `ciudad`, `donacion_adoptante`, `f1_nombre`, `f1_dni`, `f1_direccion`, `f1_email`, `f1_telefono`, `f1_firma`, `f2_*` (nombre, dni, relacion, direccion, email, telefono, rol, firma), `entidad_firma`, `terminos_aceptados`, `terminos_version`, `terminos_fecha`, `estado`, `creado`, `entidad_*`, y las copias del animal.
  - **No hay esquema versionado** de esta hoja en el repo (`Config.gs` está en `.gitignore`): el primer paso técnico será volcar las cabeceras reales.

### 2.3 Flujo actual

`abrirContrato` (modal con vista del documento + formulario) → `guardarContrato` (firma en canvas, sube foto si se pide, copia datos del animal, `API.createContrato`) → estado de la adopción a «Contrato firmado» y del animal a «adoptado» → `send-contrato-email` (HTML de `construirEmailContrato`, **sin PDF adjunto**) → impresión bajo demanda con `PdfExport.exportContracto` y `exportTerminosAdopcion`.

### 2.4 Acogida actual

`exportContratoAcogida` genera un documento **al vuelo** desde el caso (familia + animal + fase), sin persistencia, sin firma, sin envío y marcado como «documento opcional». No tiene textos legales equivalentes a los de adopción.

---

## 3. Brechas (documento → sistema)

| Bloque del documento | Hoy | Brecha | Acción propuesta |
|---|---|---|---|
| Datos animal (13 filas) | 9 de 13 | `nombre_definitivo`, `capa`, `color`, `tamaño` | Columnas nuevas + formulario de animal |
| Partes: Asociación | Datos en `CONFIG` + congelado | Dos teléfonos, sin registro/web en el texto | Ajustar plantilla y `CONFIG.asociacion` |
| Partes: Adoptante | 5 campos | Texto «propietario del animal» incorrecto | Corrección de texto |
| Importes | `donacion_adoptante` (50 por defecto) | 100 € por defecto + 900 € de indemnización | Nuevos campos y valores |
| 20 estipulaciones | 10 (contrato) + 13 (anexo), con solapes | Reescritura completa y deduplicación | Texto único en un módulo |
| PPP (5ª) | No | Cláusula condicional por animal | Campo/derivación (`ppp` o `potencialmente_peligroso`) |
| Gato (9ª) / Perro (19ª) | Parcial | Cláusulas por especie | Condicional por `especie` |
| Defunción 12 h + autopsia (16ª) | No | Texto nuevo | Texto |
| Persona responsable >65 | No | 5 campos + firma + marca de edad | Bloque nuevo en formulario y hoja |
| Firma Asociación | Sello generado o canvas | Imagen real del documento | Decidir (D-C2) |
| Hoja de estipulaciones firmada | Anexo de 13 cláusulas | Texto nuevo + firma | Reutilizar anexo con versión |
| «Tres folios a doble cara» | Libre | Sin control de paginación | Reglas de impresión + QA |
| Acogida | 8 condiciones propias, al vuelo | El documento real es otro (custodia por horas, material, responsabilidad) y no se persiste | Reescribir según §6 y persistir (F-C4) |

### 3.1 Cláusulas actuales que el documento nuevo no recoge

| Cláusula actual | ¿Se mantiene? |
|---|---|
| Periodo de prueba 15–30 días | **Decisión** (no está en el documento) |
| Seguimiento a 1, 3, 6 y 12 meses | **Decisión** (el documento habla de visitas sin aviso) |
| Microchip a nombre de la entidad durante la adaptación | **Decisión** (no está) |
| Información veterinaria / eutanasia | **Decisión** (no está) |
| Datos personales (RGPD) | **Recomendado mantener** como anexo, aunque no esté en el documento |
| Prohibición de cesión | Se mantiene (11ª) |

---

## 4. Impacto en las hojas (modelo de datos)

### 4.1 `Animales`

| Columna nueva | Tipo | Uso | Obligatoria |
|---|---|---|---|
| `capa` | texto | contrato; opcional en ficha pública | No |
| `color` | texto | contrato; opcional en ficha pública | No |
| `tamano` | texto (`pequeño/mediano/grande`) | contrato; ya existe `size` en el bloque público de la publicación | No |

- Aditivas al final, sin backfill (los 11 animales actuales quedan vacíos).
- Afectan a: formulario de animal, ficha interna, `_contratoAnimalDatos`, backup y exportaciones.
- **No** afectan a `webNormalizarFicha` ni a la validación de publicación; si se quieren en la web, es un cambio aparte en el bloque `animal` (decisión D-C6).
- `nombre_definitivo`: decidir si es del animal (renombrado tras adopción) o del contrato. Recomendación: **del contrato** (snapshot), para no perder el nombre con el que se publicó.

### 4.2 `contratos`

Columnas que usa hoy el contrato (las crea `appendToSheet`/`updateSheetRow` al primer guardado; no hay migración):

| Columna | Tipo | Origen |
|---|---|---|
| `nombre_definitivo` | texto | formulario del contrato |
| `animal_capa` / `animal_color` / `animal_tamano` | texto | snapshot del animal |
| `donacion_adoptante` | número | formulario (100 por defecto) |
| `indemnizacion_importe` | número | formulario (900 por defecto) |
| `adoptante_mayor_65` | booleano | formulario |
| `responsable_nombre` / `_dni` / `_telefono` / `_email` / `_direccion` / `_firma` | texto | formulario (cláusula 65) |
| `terminos_version` / `terminos_fecha` / `terminos_aceptados` | texto/fecha/booleano | firma |
| `tipo` | `adopcion` \| `acogida` | unifica las copias de acogida en la misma hoja |
| `acogida_id` | texto | solo copias de acogida |
| `datos_json` | texto | snapshot completo de la acogida (partes, material, marcas…) |
| `pdf_url` / `pdf_file_id` | texto | PDF firmado escaneado, privado en Drive |

- **Límite de celda:** las firmas se reducen a 256×256/0.85 y el snapshot de acogida viaja en `datos_json`; no se ha alcanzado el límite de 50.000 caracteres con los datos reales probados.
- Las columnas se crean solas en el primer guardado: un contrato antiguo o una hoja sin la columna no rompe el alta.

### 4.3 Acogida

- `Animales`: `capa` (compartida con el contrato de adopción), `marcas`, `pasaporte`.
- `familias`: `provincia` y `codigo_postal` se leen de la encuesta/ficha; `nif`/`dni` según lo que traiga la solicitud.
- `contratos`: la acogida **se persiste** como una fila más con `tipo: 'acogida'`, `acogida_id` y el snapshot completo en `datos_json` (`nif`, `poblacion`, `provincia`, `codigo_postal`, `material`, `marcas`, `pasaporte`, `otros_rasgos`).
- `acogidas`: `material`, `material_otros`, `material_devuelto`, `material_devuelto_en` y `fecha_fin_prevista` (columnas aditivas) son la fuente para el material prestado; la copia del contrato se refresca al guardarlo, así que ficha y PDF no divergen. El cierre del caso añade `desenlace` (`finalizada`/`anulada`), `fecha_cierre` y `motivo_cierre` (columnas aditivas); el caso **no se borra**, queda como historial.

### 4.4 Efectos colaterales a revisar

- `_dataForUser` y permisos (`contratos` es admin-only en `Code.gs`; coordinación no lo ve).
- `Backup.gs` y exportaciones CSV.
- `construirEmailContrato` (asunto y cuerpo actuales: «Contrato de adopcion y terminos»).
- `saveLocal` del panel: hoy los contratos se cachean en `localStorage` — con más PII (DNI, firma, dirección del responsable) hay que revisar retención y limpieza.
- Tests: `tests/pdf-export.test.js`, `tests/dashboard.test.js` y los que fijan el contrato de `contratos`.

### 4.5 Privacidad

DNI, domicilio, firma y datos de la persona responsable son **datos personales**. Reglas que ya aplican y hay que mantener: nunca al canal público (`PLAN_SEGURIDAD.md` excluye contratos), no en logs, no en URLs, y el contrato firmado no se reescribe (snapshot + versión).

### 4.6 Persistencia: BBDD primero, PDF bajo demanda

El contrato **no se guarda como PDF**: la fuente de verdad es una fila de la hoja `contratos`. El PDF se genera al vuelo solo para verlo, descargarlo o imprimirlo.

- **Adopción:** `guardarContrato` valida firmas y arma el objeto `c` → `API.createContrato(c)` → `POST ?endpoint=contratos` → `appendToSheet(CONFIG.sheets.contratos, body)`. Después actualiza la adopción a «Contrato firmado» y el animal a `adoptado`.
- **Acogida:** `guardarContratoAcogida`, `guardarIdentidadContratoAcogida`, `guardarMaterialAcogida` y `descargarContratoAcogida` pasan por `_guardarContratoAcogida`, que construye `_contratoAcogidaFila` (`tipo: 'acogida'`, `acogida_id`, `datos_json`) y llama a `API.createContrato`. La fila se reutiliza (mismo `id`) al reguardar: `appendToSheet` hace upsert por `id` y no duplica.
- **Sin red:** la copia local se guarda igual y la operación se encola (`createContrato`/`deleteContrato`); al volver la conexión se reintenta con el mismo `id`.
- **PDF firmado escaneado:** es opcional y distinto del PDF generado. Se sube con `upload-contrato-pdf` a una carpeta privada de Drive y se enlaza desde `pdf_url`/`pdf_file_id` de la fila; el fichero no se comparte.
- **Firma:** el contrato de adopción captura las firmas en canvas y las guarda en la fila. La acogida se imprime para firmar en papel (el modal lo dice) y el escaneado firmado se adjunta después; no hay firma digital de acogida que persistir.
- **Cierre, no borrado:** los casos de adopción y acogida no se borran desde la interfaz. Al cerrarlos (`anulado`, `devuelto`, `finalizada`) la fila y su contrato (con el PDF firmado) se conservan como historial del animal y de la familia. `deleteContratoCascade` queda solo para reparaciones manuales y manda el PDF privado a la papelera.
- **Verificación:** `tests/contratos-persistencia.test.js` (POST `contratos` de adopción y acogida + borrado con PDF) y `tests/dashboard.test.js` (la copia de acogida llama a `API.createContrato`, reutiliza `id`, conserva el PDF y encola si falla).

---

## 5. Impacto visual y de PDF

### 5.1 Maqueta objetivo

- **A4**, márgenes 2 cm, cuerpo 10,5 pt / interlineado 1,5, justificado.
- Cabecera con logo + nombre de la asociación + «Contrato de adopción».
- Tabla de datos del animal a dos columnas con **fotografía 3×4 cm** al lado (hoy 125 px).
- Bloques: partes → datos → estipulaciones (numeradas, con sublistas) → firma adoptante → firma Asociación → cláusula 65 (página propia si aplica).
- Pie con CIF y «Página X de Y» (implica control de saltos; en impresión HTML se puede con contadores CSS, con resultados distintos por navegador).

### 5.2 Cómo se genera el PDF

Hoy `_printAsync` construye un HTML y abre el diálogo de impresión (el usuario «guarda como PDF»). Opciones:

| Opción | Pros | Contras |
|---|---|---|
| **Mantener impresión HTML** (recomendado) | Sin dependencias, texto seleccionable, mismo motor que la vista previa | Márgenes/paginación dependen del navegador; «3 folios» no garantizable |
| PDF binario (pdf-lib/jsPDF) | Control exacto de páginas y saltos | +150–300 KB, hay que reimplementar maquetación, tablas y fuentes; no resuelve la firma |

Con impresión HTML, el objetivo realista es **«3 caras si el contenido cabe; 4-6 con la cláusula 65»** y verificarlo en Chrome con la ficha real.

### 5.3 Imágenes

- **Logo**: `src/assets/icons/logo-nebak.jpg` (192×192, emblema redondo de la web) y `src/assets/contratos/logo-nebak-horizontal.jpg` (450×147, logotipo horizontal del `.doc` de acogida).
- **Sello**: `src/assets/contratos/sello-nebak.jpg` (197×196, idéntico al emblema de la web) y `src/assets/contratos/emblema-nebak.jpg` (1344×1300, versión de la cabecera del `.docx` de adopción).
- **Fotografía del animal**: thumbnail de Drive (ya).
- **Firma del adoptante** y de la persona responsable: canvas (ya).
- **Firma/sello de la Asociación**: decidir entre (a) imagen del documento, (b) sello generado actual, (c) firma dibujada por quien firma. Hoy conviven las tres.

### 5.4 Reglas de impresión y accesibilidad

`break-inside: avoid` en tablas y bloques de firma, `break-before: page` antes de la cláusula 65, sin imágenes de fondo, contraste AA (tokens actuales), `alt` en todas las imágenes, y texto real (no imagen) para que sea seleccionable y accesible.

---

## 6. Contrato de acogida (`contratoacogida EN BLANCO.doc`)

### 6.1 Qué es

Documento Word de **una cara**, maquetado como formulario con espacios en blanco. Título: «CONTRATO DE ACOGIDA TEMPORAL DE UN ANIMAL DE COMPAÑÍA». No es una acogida larga por fases como la que modela la app: es una **custodia temporal por horas**, con préstamo de material y responsabilidad civil del acogedor.

### 6.2 Estructura literal

1. Recuadro «FOTO ANIMAL» arriba a la izquierda.
2. Título.
3. Datos del acogedor, en texto continuo con huecos: «Con domicilio en ______ / Población ______ Provincia ______ Cód. Postal ______ / N.I.F ______ Teléfonos ______».
   - **No hay campo de nombre** en el texto visible (sí NIF y teléfonos). Hay que confirmarlo: el PDF debería llevar «D./Dña. ______ con DNI ______».
4. «Con fecha ______ acojo temporalmente al siguiente animal:».
5. Parrilla de datos del animal: **Nombre, Sexo, Edad, Capa, Marcas, Esterilizado SÍ/NO, Microchip número, Pasaporte número, Otros rasgos distintivos**.
6. Condiciones (nueve párrafos):
   1. cuidados adecuados durante las horas bajo tutela, hasta la finalización del contrato;
   2. responsabilidad del acogedor por cualquier accidente o daño causado por el animal mientras esté fuera de la Asociación;
   3. prohibición de que el animal vague libremente y obligación de evitar molestias o daños a personas y animales;
   4. prohibición de uso con ánimo de lucro;
   5. la Asociación o quien la represente puede retirar al animal si se incumple alguna cláusula;
   6. notificar cambios de dirección y teléfono;
   7. preaviso de **dos días** para finalizar la acogida;
   8. la Asociación puede cancelar el contrato si hay compromiso de adopción, con **dos días** de antelación;
   9. entrega de material, que debe devolverse en buen estado al terminar.
7. Aceptación de todos los términos y **renuncia a denunciar el contrato por mala interpretación** (ver D-C16).
8. Firmas: «Firma o sello Asociación Grupo Nebak» y «Firma Casa de Acogida».
9. Pie: C/ Santiago 27 1º izq., 20300 Irun (Guipúzcoa), 625 14 05 88 / 600 04 25 94.
10. Imágenes incrustadas: `logo nebak pequeño` y `SELO NEBAK MODIFICADO` (Adobe Photoshop 7.0) → ya extraídas a `src/assets/contratos/logo-nebak-horizontal.jpg` (450×147) y `src/assets/contratos/sello-nebak.jpg` (197×196); el emblema de la cabecera del documento de adopción, en alta, está en `emblema-nebak.jpg` (1344×1300).

### 6.3 Material entregado (checklist del documento)

Jaula varikennel/transportín · Bebedero para jaula · Collar · Correa · Bozal · Abrigo · Comedero/Bebedero · Cartilla de identificación y vacunación · Otros.

Es un dato **operativo**, no solo visual: sirve para reclamar la devolución. Debe guardarse con la acogida (lista de ítems marcados + observaciones), no solo imprimirse.

### 6.4 Brecha con lo implementado hoy

| Concepto | Documento real | App hoy | Acción |
|---|---|---|---|
| Vigencia | Por horas («las horas que pase bajo mi tutela») | Fases Entrega / En casa / Finalizada | Decidir modelo (D-C13) |
| Responsabilidad civil | Explícita, a cargo del acogedor | No | Añadir al texto |
| Material prestado | Checklist de 9 ítems + devolución | No | Campo + PDF |
| Preaviso | 2 días para ambas partes | No | Añadir |
| Cancelación por adopción | 2 días | No | Añadir |
| Firma de la casa de acogida | Sí | No | Firma en canvas |
| Capa / marcas / pasaporte / otros rasgos | Sí | Capa no; marcas y pasaporte no | Columnas nuevas |
| Nombre del acogedor | Ausente en el texto | Sí (`familias`) | Añadirlo al PDF |
| Logo y sello | Imágenes reales | Sello generado | Reutilizar assets |
| Renuncia a denunciar | Sí | No | Revisar legalidad (D-C16) |

### 6.5 Impacto en hojas

- `Animales`: `capa`, `marcas`, `pasaporte` (los dos últimos se añadieron en el cierre de pendientes y se ven en la ficha).
- `familias`: `provincia`, `codigo_postal`; hoy `ubicacion` es texto libre.
- `contratos`: la acogida se persiste como fila con `tipo: 'acogida'`, `acogida_id` y el snapshot completo en `datos_json`; no necesita columnas nuevas para material, marcas o partes.
- `acogidas`: `material`, `material_otros`, `material_devuelto`, `material_devuelto_en` y `fecha_fin_prevista` (columnas aditivas) guardan el material y su devolución; la copia del contrato se refresca al guardarlo. Al cerrar, `desenlace`, `fecha_cierre` y `motivo_cierre` dejan el resultado en el historial sin borrar la fila.

### 6.6 Visual

Una cara (dos como máximo), con líneas de relleno y casillas, foto arriba a la izquierda, firmas al pie y pie de página con dirección y teléfonos. Es una maqueta **distinta** de la del contrato de adopción: conviene reescribir `_buildContratoAcogida`, no reutilizar `_buildContracto`. Las casillas deben ser caracteres (☐/☒) o recuadros CSS, no imágenes, para que impriman bien en blanco y negro.

### 6.7 Decisión de fondo

El documento real describe una **acogida temporal corta**; la app tiene un módulo de acogidas por fases pensado para estancias largas. Hay que elegir (D-C13):

- (a) el PDF replica el documento real y se usa en toda acogida — **recomendado**, es el que firman; las fases quedan como estado interno;
- (b) dos variantes (corta = documento real; larga = texto nuevo por fases);
- (c) sustituir el modelo por el corto.

En cualquier caso, el texto debe validarlo la asociación antes de publicarlo.

---

## 7. Plan por fases

| Fase | Objetivo | Entregable | Pruebas |
|---|---|---|---|
| **F-C0** | Cerrar textos y decisiones D-C1…D-C12; extraer imágenes del `.docx` — **hecha** | Documento de texto definitivo + assets | Revisión de la asociación |
| **F-C1** | Datos: columnas en `Animales` y `contratos`, campos en formularios, snapshot | Hojas actualizadas y app guardando | Tests de mapeo y de contrato guardado |
| **F-C2** | Contrato de adopción nuevo: maqueta, 20 estipulaciones, cláusulas condicionales (PPP, gato/perro), importes, firma Asociación | `_buildContracto` nuevo + vista previa en el modal | Tests de HTML (campos, condicionales, importes) |
| **F-C3** | Hoja de estipulaciones firmada (anexo) con el texto nuevo y versión — **hecha** | `_buildTerminosAdopcion` reescrito | Tests de anexo y de versión |
| **F-C4** | Cláusula 65 + contrato de acogida según el `.doc` real + persistencia/envío — **hecha** | Formulario, hoja, PDF y email | Tests de condicionales, de material y de acogida |
| **F-C5** | Endurecimiento: tamaños de celda, privacidad, backup, impresión real — **hecha**: paginación A4 medida, falta la prueba en papel | Checklist de impresión y límites documentados | QA en Chrome (A4, 3–6 caras), revisión de PII |

**Estado (2026-11-18):** F-C1 hecha para `capa`, `color` y `tamano` (formulario de animal, hoja `Animales`, ficha interna y copia congelada en `contratos` con `animal_capa`, `animal_color` y `animal_tamano`) y para `nombre_definitivo` (campo «Nombre definitivo» en el formulario de firma y columna `nombre_definitivo` en `contratos`, que es dato del contrato y no de la ficha). Sin migración: las columnas las crea el backend al primer guardado. F-C1 queda cerrada con los importes: `donacion_adoptante` por defecto 100 € (antes 50) e `indemnizacion_importe` por defecto 900 €, editables en el formulario de firma y con columna aditiva en `contratos`.

**F-C2 hecha (2026-11-18):** el contrato de adopción se maqueta con las 20 estipulaciones del documento en `src/js/contrato-textos.js` (`ContratoTextos`, versión 2.0), que es la fuente única del modal (`_contratoTerminosHtml`) y del PDF (`_buildContracto`): los dos renderizadores solo cambian el envoltorio y rellenan los marcadores `{donacion}`/`{indemnizacion}`. El documento gana partes intervinientes, tabla de datos de adopción con nombre definitivo, capa, color y tamaño (sin peso), nota de hoja de estipulaciones y firmas de adoptante, tutor y asociación con sello; los contratos antiguos sin copia congelada caen a la ficha viva y, sin importes guardados, a 100 € y 900 €. Las erratas del `.docx` quedan corregidas al pasar al PDF. La acogida no se toca: `_buildContratoAcogida` y `_terminosAdopcionCuerpo` siguen en su versión anterior hasta F-C3/F-C4.

**F-C3 hecha (2026-11-18):** el anexo es ya la hoja de estipulaciones que el contrato anuncia, no un documento con texto propio. `_terminosAdopcionCuerpo` bebe de `ContratoTextos` (versión 2.0 y fecha del propio módulo), de modo que la hoja y el contrato comparten redacción, importes y versión; se retiran las 13 cláusulas de `_terminosAdopcionClausulas`. La hoja añade cabecera, ficha de adoptante/animal/fecha/documento, párrafo de aceptación, datos de la entidad con sello, las 20 estipulaciones y firma del adoptante y del tutor cuando lo haya. El PDF del anexo (`_buildTerminosAdopcion`) reutiliza ese cuerpo y estrena estilos de estipulaciones y listas; el fichero pasa a `Estipulaciones-Adopcion-*.pdf`. El registro de la firma guarda ya la versión del módulo (`terminos_version` 2.0, antes '1.0' fijo), así que la aceptación queda fechada con el texto que realmente se firmó. Queda pendiente para F-C4 la acogida y para F-C5 el QA de impresión.

**F-C4 hecha (2026-11-18):** el contrato de acogida se reescribe con el texto literal de `contratoacogida EN BLANCO.doc`, que vive en `src/js/acogida-textos.js` (ocho condiciones con preaviso de dos días, material de nueve ítems con casillas, renuncia a denunciar, firmas de la entidad y de la casa de acogida, pie con la dirección y los teléfonos) y con la maqueta de formulario del original: foto, partes con NIF/población/provincia/CP/teléfonos, parrilla del animal con capa, marcas, pasaporte y otros rasgos, y material marcado cuando la copia guardada lo trae. El modal reutiliza el mismo cuerpo (`_contratoAcogidaBody`) con las clases equivalentes en `styles.css`. La copia del contrato gana esos campos sin columnas nuevas (`nif`, `poblacion`, `provincia`, `codigo_postal`, `material`, `marcas`, `pasaporte`, `otros_rasgos` dentro de `datos_json`). La cláusula de mayores de 65 se añade al contrato de adopción como bloque condicional (`ContratoTextos.clausula65`, texto literal del `.docx`) con su tabla de persona responsable y dos firmas: página propia en el PDF, bloque en el modal y casilla más cinco campos en el formulario de firma, guardados en columnas aditivas de `contratos`. Los textos de adopción no se reescriben. Queda pendiente editar el material desde la app (hoy sale en blanco, como el formulario de papel) y el QA de impresión de F-C5.

**F-C5 hecha (2026-11-18; queda la prueba en papel):** el QA se hace imprimiendo de verdad en A4 (Edge headless, `--print-to-pdf`) y contando caras. El contrato de adopción son cuatro caras y, con la cláusula de mayores de 65, cinco, con la cláusula empezando página propia y sin página en blanco cuando no se marca. El contrato de acogida salía en dos caras —las firmas y el pie se iban solos a la segunda— así que la maqueta se aprieta hasta caber en una sola: condiciones a 8,5 pt con interlineado 1,25, material a 7,8 pt, líneas de firma de 34 px, foto de 100×112 y márgenes internos más cortos, más `break-inside:avoid` en parrilla del animal, material, firmas y pie. Probado con datos largos (nombre compuesto, domicilio de 108 caracteres, email largo, capa y marcas descriptivas, los nueve ítems de material marcados) y con una descripción de ficha de 780 caracteres: la hoja mide 934 y 952 px frente a los 985 que caben en la cara, porque el recuadro de «otros rasgos» se limita a tres líneas (`-webkit-line-clamp`), como el recuadro del formulario de papel, y la descripción completa sigue en la ficha del animal. Los tests de `tests/pdf-export.test.js` sujetan el A4, los `break-inside` y ese recorte. Falta la prueba con la impresora real (márgenes de la máquina, que el sello y las firmas caigan dentro) y decidir si los contratos de más de una cara llevan numeración de página, que hoy no se puede hacer con contadores de `@page` en Chrome sin soporte de margin boxes.

**Pendientes cerrados (2026-11-18, `v296`; pruebas: 780):** con F-C0…F-C5 en pie se cierran los restos que quedaban abiertos del plan.

- **Material editable y persistido (D-C7, D-C15):** el modal del contrato de acogida gana un bloque «Material prestado» con las ocho casillas del `.doc`, el texto de «Otros (detallar)», la devolución prevista, la casilla «Material devuelto» y su fecha. `guardarMaterialAcogida` escribe en la fila de `acogidas` (`material`, `material_otros`, `material_devuelto`, `material_devuelto_en`, `fecha_fin_prevista`, columnas aditivas) y refresca la copia congelada del contrato, así que la ficha y el PDF no pueden contar cosas distintas. «Otros» solo sale marcado si hay texto, y la línea del documento imprime ese texto en vez de los guiones. Las listas se aceptan como array o como texto separado, porque la hoja las devuelve de las dos formas.
- **Marcas y pasaporte en la ficha:** el formulario de animal incorpora `marcas` y `pasaporte`, se ven en la ficha interna y el contrato de acogida los toma de la ficha viva (con `c.animal_marcas`/`c.animal_pasaporte` como respaldo de las copias antiguas). Sin migración: las columnas las crea el backend al primer guardado.
- **Firma de la Asociación (D-C2):** el sello deja de dibujarse con CSS y pasa a ser la imagen real `src/assets/contratos/sello-nebak.jpg` en el modal, en la hoja de estipulaciones y en los dos PDF; se puede sustituir por otra imagen subida (`gn_sello_url` en localStorage) para el día que la asociación cambie el sello. Las rutas relativas se resuelven a absolutas antes de imprimir, porque la ventana de impresión se abre en blanco.
- **PDF firmado escaneado (D-C10):** bloque «PDF firmado» en la ficha del contrato (adopción y acogida) y endpoint nuevo `upload-contrato-pdf` en `apps-script/Code.gs` (`API.uploadContratoPdf`). Se guarda en la subcarpeta «Contratos» de los documentos y **sin `setSharing`**, al revés que `uploadDocumento`: un contrato lleva DNI y firmas y no puede quedar con enlace de cualquiera. Solo acepta `application/pdf` hasta 10 MB y el nombre del fichero en Drive es un uuid con la extensión, sin datos personales. La URL y el `fileId` se guardan en `pdf_url`/`pdf_file_id` del contrato.
- **Cláusulas legacy en el anexo (D-C5):** las cuatro condiciones que no están en el `.docx` (periodo de prueba y devolución, seguimiento a 1/3/6/12 meses, microchip y registro, protección de datos) viven en `ContratoTextos.anexo` y se imprimen al final de la hoja de estipulaciones, que pasa a versión **2.1**; la firma guarda esa versión, así que el registro de aceptación sigue coincidiendo con el texto firmado.
- **Cierre, no borrado (2026-11-19):** los casos de adopción y acogida no se borran desde la interfaz; se cierran con resultado y motivo (`anulado`, `devuelto`, `finalizada`) y la fila, su contrato y el PDF firmado se conservan como historial. `deleteContratoCascade` queda para reparaciones manuales y para anular una firma, y manda el PDF privado a la papelera para no dejarlo accesible. Tests: `tests/contratos-persistencia.test.js`, los nuevos casos de `tests/dashboard.test.js` y la prueba E2E `e2e/acogidas-cerrar.e2e.mjs` (API simulada para el flujo de cierre y pasada de solo lectura contra el backend real).

Cada fase es independiente y se puede parar entre ellas; F-C1 no cambia el PDF y F-C2 no necesita la acogida.

---

## 8. Decisiones a cerrar antes de tocar código

| ID | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D-C1** | ¿Un documento con las estipulaciones dentro, o contrato + anexo firmado? | (a) todo dentro; (b) dentro + hoja aparte firmada | (b), como el documento: contrato con estipulaciones + hoja de estipulaciones firmada, generadas del **mismo** texto |
| **D-C2** | Firma de la Asociación | (a) emblema del documento; (b) sello generado; (c) firma manuscrita del `.docx` (fuera del repo) | (a) como sello + (c) si firma una persona; la manuscrita va a Drive, no a `git` |
| **D-C3** | Importes | 100 € / 900 € fijos o editables | Editables con esos valores por defecto |
| **D-C4** | Persona responsable >65 | (a) bloque nuevo; (b) reutilizar tutor | (a), son figuras distintas |
| **D-C5** | Cláusulas actuales ausentes en el documento | mantener / mover al anexo / retirar | Mantener en el anexo (periodo de prueba, seguimiento, microchip, RGPD) |
| **D-C6** | `capa`/`color`/`tamaño` | solo contrato / también ficha pública | Solo contrato en F-C1; web en fase aparte |
| **D-C7** | Acogida | persistir / seguir al vuelo | Persistir |
| **D-C8** | Firma | canvas (actual) / papel escaneado | Canvas para el PDF; papel sigue valiendo |
| **D-C9** | Versión del documento | fija / con fecha | «2.0 (2026/… )» guardada en el contrato |
| **D-C10** | PDF firmado | no guardar / Drive | Drive + `pdf_url` si la asociación lo quiere archivar |
| **D-C11** | `nombre_definitivo` | del animal / del contrato | Del contrato (snapshot) |
| **D-C12** | Ciudad y año | fijos «En Irún» / editables | Fijos «En Irún» + fecha real |
| **D-C13** | Modelo de acogida | (a) PDF del documento real; (b) dos variantes; (c) sustituir el modelo | (a) + fases como estado interno |
| **D-C14** | Nombre del acogedor | añadirlo al PDF / dejarlo como está | Añadirlo (el documento solo trae NIF y teléfonos) |
| **D-C15** | Material prestado | solo imprimir / guardar y controlar devolución | Guardar (lista + estado) |
| **D-C16** | «Renuncio al derecho de denunciar…» | mantener / retirar | Revisar con la asociación; es una renuncia de derechos |
| **D-C17** | Numeración de páginas en documentos de más de una cara | (a) no numerar; (b) migrar a un motor PDF; (c) pie manual | (a) por ahora: Chrome no soporta *margin boxes* de `@page`; se revisa si se adopta un motor PDF. La prueba con impresora real queda como verificación manual |

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar el texto de contratos ya firmados | Snapshot + `documento_version`; no se reescriben históricos |
| Límite de 50.000 caracteres por celda con firmas/foto | Medir; firmas a Drive o baja resolución |
| PII en `localStorage` y en logs | Revisar `saveLocal`, no registrar payloads |
| «3 folios doble cara» no garantizable desde HTML | QA en Chrome + texto de «páginas orientativas» |
| Erratas legales del documento | Corregir con revisión de la asociación antes de F-C2 |
| Acogida sin texto validado | No publicar hasta revisión |
| Tests de PDF basados en cadenas HTML | Actualizar junto con el texto y fijar los campos clave |
| Impresión en Safari/móvil | Probar y documentar limitaciones |

---

## 10. Anexo A · Mapeo campo a campo (documento → sistema)

| Documento | Variable/columna destino | Notas |
|---|---|---|
| D./Dña. nombre | `f1_nombre` | ya |
| DNI | `f1_dni` | ya |
| Domicilio | `f1_direccion` | ya |
| Teléfono | `f1_telefono` | ya |
| Email | `f1_email` | ya |
| CIF / domicilio / teléfonos asociación | `CONFIG.asociacion` → `entidad_*` | añadir segundo teléfono |
| Nombre del animal | `animal` (snapshot) | ya |
| Nombre definitivo | `nombre_definitivo` | nuevo |
| Especie / raza / sexo / microchip / nacimiento / esterilización | `especie`, `raza`, `animal_sexo`, `animal_microchip`, `animal_fecha_nacimiento`, `animal_esterilizada` | ya |
| Capa / color / tamaño | `animal_capa`, `animal_color`, `animal_tamano` | nuevos |
| Otras reseñas | `animal_descripcion` | ya |
| Fotografía | `animal_foto` | ya |
| Donación 100 € | `donacion_importe` | hoy 50 |
| Indemnización 900 € | `indemnizacion_importe` | nuevo |
| Fecha / lugar | `fecha`, `ciudad` | ya |
| Firma adoptante | `f1_firma` | ya |
| Firma Asociación | `entidad_firma` / asset | decisión D-C2 |
| Mayor de 65 | `adoptante_mayor_65` | nuevo |
| Responsable (5 campos + firma) | `responsable_*` | nuevos |
| Capa / marcas / pasaporte (acogida) | `animal_capa`, `marcas`, `pasaporte` | nuevos |
| Material entregado | `material`, `estado_material` | nuevo (acogida) |
| Firma Casa de Acogida | `firma_familia` | nuevo (acogida) |

## 11. Anexo B · Cláusulas actuales y su destino

| Actual | Destino propuesto |
|---|---|
| Objeto / capacidad / cuidados / salud / prohibiciones / cesión / devolución / incumplimiento | Se integran en las estipulaciones 1ª–20ª |
| Periodo de prueba 15–30 días | Anexo (decisión D-C5) |
| Seguimiento 1/3/6/12 meses | Anexo |
| Microchip a nombre de la entidad | Anexo |
| Información veterinaria / eutanasia | Anexo |
| Datos personales (RGPD) | Anexo (mantener) |

## 12. Anexo C · Preguntas para la asociación

1. ¿La firma y el sello del documento son los definitivos? ¿Autorizan su uso en el PDF?
2. ¿La donación son 100 € siempre o depende del animal? ¿Y los 900 €?
3. ¿El «nombre definitivo» se rellena al firmar o después?
4. ¿Capa, color y tamaño se guardan también en la ficha pública del animal?
5. ¿Se mantienen periodo de prueba, seguimiento y microchip a nombre de la entidad?
6. ¿La cláusula de mayores de 65 se aplica siempre o solo si se marca?
7. ¿El contrato de acogida debe llevar las mismas estipulaciones adaptadas? ¿Se firma y envía?
8. ¿Se archiva el PDF firmado en Drive además de la hoja?
9. ¿Corregimos las erratas del documento antes de maquetar?
10. ¿«En Irún» fijo o ciudad editable?
11. En la acogida, ¿la estancia es por horas/días o por semanas? ¿Se usa también para acogidas largas?
12. El documento de acogida no pide el nombre del acogedor: ¿lo añadimos con DNI?
13. ¿Se controla la devolución del material (checklist) o solo se firma la entrega?
14. La cláusula «renuncio al derecho de denunciar este contrato por mala interpretación»: ¿se mantiene?

---

> **Qué no se hace aquí:** no se toca código, ni hojas, ni textos del panel; no se extraen las imágenes del `.docx` (no está disponible el binario en este entorno, solo el texto); no se decide por la asociación en cuestiones legales.
