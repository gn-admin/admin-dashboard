# Análisis: sugerir animales desde las encuestas (diccionario de etiquetas)

> **Estado: ANÁLISIS, no implementado.** Documento dejado constancia por si en el
> futuro se quiere aplicar. No hay nada de este plan en el código ni en el backend.
> Fecha del análisis: 2026-09-30.

Fuentes: los 3 CSV de respuestas exportados de Google Forms (local, **no versionados**
por contener datos personales):

- `Cuestioanrio de Pre-adopcion (perros) Respuestas_Respuestas de formulario 1.csv`
- `Cuestionario de Pre-adopción (Gatos) (respuestas)_Respuestas de formulario 1.csv`
- `Cuestionario - Acogida (respuestas)_Respuestas de formulario 1.csv`

Objetivo planteado: a partir de lo que la familia responde en la encuesta, **sugerir
qué animales encajan mejor**, sin ocultar animales y sin usar LLM.

---

## 1. Inventario de columnas (CSVs reales)

| | Perros | Gatos | Acogida |
|---|---|---|---|
| Columnas totales | 69 | 46 | 62 |
| Comunes personales (1-13) | idénticas en los 3 → **fuera del diccionario** (y son PII) | | |
| Respuestas parseadas | **80** | 8 | 5 |

Parser CSV con comillas y saltos de línea interiores obligatorio: en *perros*, un
`-split "`n"` da 108 líneas y descompone las columnas (respuestas multilínea).

### 1.1 Estructuradas / casi-cerradas (mayor rendimiento)

| Perros | Gatos | Acogida |
|---|---|---|
| `[14] Tipo de Vivienda` (Piso 55, Chalet 6, Bajón con jardín 6, Duplex, Caserío…) | `[18] niños` (Sí/No + edades) | `[15] Tipo vivienda`, `[17] propia/alquiler` |
| `[15] Nº de metros cuadrados` numérico (90.0, 70.0…) | `[21] alergias` (8× No) | `[26] hijos + edades` |
| `[16] ¿Tiene terraza?` Sí 42 / No 20 (+ «Balcón», «Jardín») | `[32] disponibilidad` Sí 8 | `[29] alergias` |
| `[18] permiso del casero` (24 Sí, 4 No, resto = propietario) | `[45] devolución` Sí 8 | `[38] duración de la acogida` |
| `[26] Nº de hijos` (13× 1, 11× 0, «Dos», «Ninguno») | | `[53] zona exclusiva de adaptación` |
| **`[53] carácter deseado`** → vocabulario casi cerrado: *Tranquilo, Cariñoso, Activo, Independiente, Valiente* (5 términos ≈ 95 % de las respuestas) | | |
| **`[55] Cachorro o adulto`** → Indiferente 25 / Adulto 20 / Cachorro 16 / Joven 5 | | |
| `[61] finalidad` (Para compañía 49…) | | |

### 1.2 Semi-estructuradas (regla de extracción)

- `[51] otros animales en casa` → «No» (20) vs especies citadas (gato, perro, gallinas, conejos, tortuga).
- `[47] ¿Has tenido perro antes?` → prefijo «No…» / «Sí…».
- `[63] tiempo solo en casa` → regex de horas («4 horas», «6-7», «8 a 9h») — **40 % vacío**.
- Acogida `[26] hijos` → «Dos de 16 y 18», «2. Uno de 17 y una de 6» → edad mínima del menor.
- Perros `[14] Tipo de vivienda` → normalizar a `piso|casa|otro` + detectar «jardín» en el texto.

### 1.3 Texto libre de alta señal (diccionario, no regla dura)

- Perros `[52] ¿Qué tipo de perro busca?` → tamaño + hipoalergénico + razas.
- Perros `[35] ¿Qué mira al elegir?` → «hipoalergénico», «tranquilo», «mediano».
- Gatos `[15] ¿Cómo quieres que sea el gato?` → edad/color/sexo («máximo 3 meses», «cachorro»).
- Acogida `[42] raza deseada`.

### 1.4 Descartables

Opinión del cuestionario, sugerencias, medio de conocimiento, toxoplasmosis,
desungulación, alimentación, gastos, finalidad terapéutica. «Quién decide» /
«comparten la decisión» se usan como **bandera de aviso** al evaluador, no como match.

### 1.5 Calidad de datos (condiciona el diseño)

1. **Vacío 25-45 %** en casi todas las claves → `desconocido = neutral`; castigar el vacío falsea el ranking.
2. **Las dicotomías se rompen**: `[18]` recibe «Piso propio», «Somos propietarios» → extractor con sinónimos, no `=== 'Sí'`.
3. **«Niños» no es binario**: gatos `[18]` = «15», «hijos de 19 y 18 años» → umbral de edad (p. ej. <12 ⇒ `con-niños`).
4. **Muestras pequeñas**: gatos n=8, acogida n=5 → no calibrar nada empíricamente sobre ellas; reglas por `survey_id`, calibradas sobre perros (n=80).
5. **Acogida y gatos no tienen `m²` ni terraza** (gatos no tiene siquiera «Tipo de vivienda») → **la matriz de reglas es por formulario, no universal**.
6. Columna **«Nombre o descripción»** (gatos/acogida): la gente **copia el anuncio del animal concreto** que quiere ⇒ además de *encuesta → animales* cabe el flujo inverso *ficha del animal → candidatos*.
7. `[53] carácter` ya es quasi-cerrado → es el campo más rentable de todo el cuestionario.

---

## 2. Lado animal: qué hay y qué falta

**Hay hoy** (fila de `saveAnimal`, `src/js/dashboard.js`): `nombre, especie, raza, edad,
peso, sexo, estado, microchip, descripcion, grupo_id, grupo, grupo_obligatorio,
apadrinable, urgente, esterilizada, vacunas, fecha_ingreso, foto_*`.

- `esterilizada` y `vacunas` **no son editables** desde el formulario (se arrastran del registro existente).
- `edad` y `peso` son texto → derivables: `peso` → tamaño (p. ej. <10 / <25 / ≥25 kg),
  `edad` → `cachorro|joven|adulto|senior` (parcial).
- `descripcion` está contaminada en el alta de camada (`descripcion: 'Camada: ' + grupo`) → ruido si se usa como corpus.

**Falta** (lo que el diccionario tendría que cubrir): `tamaño`, `caracter`,
`convive_con (niños/perros/gatos)`, `nivel_energia`, `hipoalergenico`,
`necesita-exterior`, `medicacion`.

---

## 3. Taxonomía propuesta (lista cerrada, ~18 etiquetas)

| Bloque | Etiquetas | Origen |
|---|---|---|
| Derivadas ya | `urgente`, `disponible`, `en_acogida`, `en_grupo`/`grupo-obligatorio`, `macho`/`hembra`, especie | ficha, sin tocar nada |
| Derivadas de texto | `cachorro`, `joven`, `adulto`, `senior` (de `edad`), `tamaño-pequeño/mediano/grande` (de `peso`) | reglas puras |
| Nuevas manuales (chips) | `con-niños`, `con-perros`, `con-gatos`, `hipoalergenico`, `nivel-bajo/medio/alto`, `necesita-exterior`, `tranquilo`, `activo`, `cariñoso`, `independiente` | columna nueva |

Decisión de diseño: **un único campo `etiquetas` (JSON array) + chips editables**,
no 8 columnas nuevas → menos migración en Sheets y compatible con la auto-creación de
columnas del backend.

---

## 4. Matriz encuesta → animal (por `survey_id`)

| # | Origen | Regla | Tipo |
|---|---|---|---|
| R1 | 3 formularios: alergias = Sí | exige `hipoalergenico` | `exige` |
| R2 | perros `[26]` / gatos `[18]` / acogida `[26]`: menor <12 | exige `con-niños` | `exige` |
| R3 | perros `[51]` / gatos `[23]` / acogida `[52]`: hay gato | exige `con-gatos`; si hay perro, `con-perros` | `exige-uno-de` |
| R4 | perros `[14]+[16]`: piso sin terraza/jardín y m² < 60 | penaliza `nivel-alto`, `necesita-exterior` | `penaliza` |
| R5 | perros `[55]` / gatos `[15]`: edad deseada | exige `cachorro`/`adulto` («Indiferente» = sin regla, 31 %) | `exige` |
| R6 | perros `[53]` / acogida `[41]`: carácter | intersecta con `tranquilo/activo/cariñoso/independiente` | `compatible-con` |
| R7 | perros `[63]` / acogida `[36]`: horas solo ≥ 6 | penaliza `cachorro` + `nivel-alto` | `penaliza` |
| R8 | perros `[18]`: alquiler sin permiso del casero | **aviso al evaluador** (no altera el ranking) | `bandera` |
| R9 | gatos `[15]` / perros `[52]`: raza/tamaño citados | intersecta con `raza`/`tamaño` | `compatible-con` |
| R10 | acogida `[38]`: duración | regla del caso, no del animal | `bandera` |

**Motor**: puntuación visible con motivo por regla (`+2 con-niños`, `−1 nivel-alto en piso pequeño`);
**nunca ocultar** animales incompatibles → badge «no encaja (alergias)» y siguen listados.
Vacío = 0 (neutral).

---

## 5. Extracción texto → etiquetas (sin LLM)

- Diccionario de sinónimos **por campo** (lista cerrada de términos por etiqueta) +
  normalización con el precedente de `_normGrupo` (`src/js/dashboard.js`).
- Orden de reglas: **negación antes que afirmación** («no tengo animales» ≠ «gato»).
- Métrica: corpus de las 80 respuestas de perros → % de filas con ≥1 etiqueta extraída
  (objetivo ≥70 % en `[53]`, `[55]`, `[14]`, `[51]`).
- LLM descartado de momento (PWA sin dependencias). Si se retoma: endpoint `POST etiquetas`
  en Apps Script con la clave en `ScriptProperties` (**nunca** en el bundle del front).
  El texto de las encuestas contiene datos personales → revisar RGPD antes de enviarlo fuera.
- Prueba de humo ya hecha: 3 grupos de sinónimos (vivienda, carácter, edad) cubren la
  mayoría de las respuestas de perros.

---

## 6. Bloqueos, fases y decisiones abiertas

**Bloqueador general**: publicar `Code.gs`/`Config.gs` con auto-creación de columnas;
si no, `updateSheetRow` borraría la columna `etiquetas`.

| Fase | Contenido | Dependencias |
|---|---|---|
| 0 | **`raza` opcional** (hoy `required` solo en HTML) | ninguna → `dashboard.js:2751`, guía `1194/1201`, guards `2294`, `1438`, `2988`, `2993` |
| 1 | Taxonomía + etiquetas derivadas (sin backend) | ninguna |
| 2 | Extractor de texto + chips `etiquetas` | `Code.gs` publicado |
| 3 | Scoring en `_renderAssignForm` con motivo visible + tests (extractor y scoring = funciones puras) | fases 1-2 |

**Decisiones pendientes de quien decida el proyecto**:

1. ¿Un único campo `etiquetas` o campos sueltos (`convive_ninos`, `nivel_energia`…)?
2. Umbral de «niños pequeños»: ¿<12 años? ¿<7?
3. ¿Empieza la Fase 0 (`raza` opcional) ahora, o se espera a publicar `Code.gs`?
4. ¿Se quiere también el flujo inverso (desde la ficha del animal, ver qué candidaturas encajan)?
