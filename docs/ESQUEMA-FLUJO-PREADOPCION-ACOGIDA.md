# Esquema de flujo: Pre-adopción y Pre-acogida (modelo acordado)

> Documento de diseño acordado (fase de análisis). NO implementar todavía.
> Complementa a `PROGRESO.md`. Sin datos sensibles.

## 1) Modelo de negocio

Dos vías paralelas que comparten el mismo patrón y las mismas entidades base:

```
ENCUESTA (solicitud) → aprobada → CANDIDATURA (asignar animal) → elegir → REGISTRO con fases → estado final / devolución
```

- **Adopción**: permanente.
- **Acogida**: temporal, con marca visible (el animal en acogida sigue siendo adoptable).

## 2) Entidades

### Contacto (persona)
- id, nombre, email, teléfono, DNI, dirección, ciudad.
- `fuente`: encuesta (auto-creado) o manual.
- `encuestas[]` (ids `survey_id::id`), `adopciones[]`, `acogidas[]`.
- `blacklist?`: motivo + fecha + activo.
- Si entra a mano sin encuesta previa: sin historial de encuestas.

### Encuesta / Solicitud
- id `survey_id::id`.
- estado: `pendiente → en_proceso → aprobada → finalizada` (+ `descartada`).
- Según tipo:
  - **Pre-adopción (perros/gatos)**: concursa contra animales `disponible` **+ `en_acogida` (marcado con badge)**.
  - **Pre-acogida**: concursa contra animales **para acoger** (los no `en_acogida` y no `adoptado`).
- `animal_id` (asignado al pasar a candidata), `contacto_id`.

### Animal
- id (ficha), datos, estado:
  - `disponible`
  - `en_acogida` → adoptable con marca "En acogida"
  - `adoptado`
  - `devuelto` (histórico; en UI vuelve a seleccionable)
- `candidatos[]` (ids de encuestas aprobadas asignadas).
- `historial[]` = timeline mixto: acogidas y adopciones por las que pasó (quién, fechas, motivo de cambios).

### Candidatura (relación Solicitud ↔ Animal)
- `solicitud_id`, `animal_id`, `fecha`.
- `tipo`: `adopcion` | `acogida`.
- `estado`: `en_lista` | `elegido` | `descartado`.
- Al no ser elegido el candidato queda `en_lista` (espera), no se borra.

### Adopción
- `animal_id`, `contacto_id`, `solicitud_id`, `fecha`.
- fases: `adaptación → adoptado`.
- `resultado`: `adoptada` | `devuelta` (+ fecha y motivo en devolución).
- Permite `acogida_id` origen cuando llega desde acogida (historial enlazado).

### Acogida (temporal)
- `animal_id`, `contacto_id`, `solicitud_id`, `fecha`.
- fases: `entrega → en casa → finalizada`.
- `resultado`: `finalizada` (con motivo/fecha) | `devuelta`.

## 3) Relaciones

- Contacto **1─N** encuestas.
- Animal **1─N** candidaturas (adopción o acogida).
- Contacto **1─N** adopciones y **1─N** acogidas (historial completo).
- Adopción opcionalmente **1─1** acogida origen (transición acogida → adopción, misma persona + mismo animal).

## 4) Flujo de estados

```
PRE-ADOPCIÓN (perros/gatos)             PRE-ACOGIDA
────────────────────────               ────────────
pendiente → en_proceso → aprobada      pendiente → en_proceso → aprobada
       │                                    │
       └ asignar animal (adoptables)        └ asignar animal (para acoger)
            │                                    │
       CANDIDATURA (tipo=adopcion)         CANDIDATURA (tipo=acogida)
            │                                    │
         elegir candidato                     elegir acogedor
            ▼                                    ▼
       ADOPCIÓN                              ACOGIDA
   adaptación → adoptado              entrega → en casa → finalizada
       │                                    │
       └ devolución (días/meses)            ├─ finalizada → animal `disponible`
           → devuelta                      └─ pasar a ADOPCIÓN (mismo animal+contacto:
           → animal `disponible`                cierra acogida, abre adopción, guarda origen)
           → historial intacto
           → recomendación futura / blacklist
```

## 5) Disposiciones del animal

| Estado | Sección de selección | Badge |
|---|---|---|
| `disponible` | adopción ✅ · acogida ✅ | — |
| `en_acogida` | adopción ✅ (marcado) · acogida ❌ | En acogida |
| `adoptado` | — | Adoptado |
| `devuelto` | vuelve a seleccionable (como disponible) | Historial conservado |

## 6) Reglas de selección por tipo de encuesta

- **Pre-adopción** → `disponible` + `en_acogida` (con marca visible).
- **Pre-acogida** → `disponible` (opcional: filtros por especie/tamaño/espacio).

## 7) Decisiones pendientes a fijar en implementación

- Identidad del contacto: unificar por email (regla para duplicados / encuestas sin email).
- Candidatos no elegidos: quedan `en_lista` (espera), no se eliminan.
- "Reservado": el animal solo se marcar `reservado` cuando existe acogida/adopción en marcha; si cae, vuelve a `disponible`.
- Devoluciones: marca `devuelta` con fecha/motivo, sin borrar filas (historial intacto).
- Backfill: mapear los casos activos actuales al modelo sin perder las `descartadas`.

## 8) Viabilidad (stack actual)

- Viable: las relaciones son campos ID en hojas (`solicitud_id`, `animal_id`, `contacto_id`, `tipo`, `acogida_id`).
- El patrón de pipeline ya existe en Adopciones (stepper + `avanzarFase` en `src/js/dashboard.js`).
- La hoja `actividad` ya permite timeline por caso.
- Estados de animal actuales ya incluyen `en_acogida` (`dashboard.js`).
- No toca la lógica actual de estados/notas (`survey_id::id`).

## 9) Ampliación acordada: grupos conjuntos, camadas y especies

> Simplicidad buscada: un solo concepto reutilizable, sin entidades extra.

### Grupo = concepto único en la ficha Animal
- `grupo_id`: los animales que comparten valor forman un **conjunto** (camada, pareja, trío...).
- `grupo_obligatorio` (`true`/`false`):
  - `true` → conjunto **inseparable** (vínculo obligatorio).
  - `false`/ausente → se entregan juntos por defecto (**ideal conjunta**) pero permiten separarse.
  - Sin `grupo_id` → adquisición libre (comportamiento actual).
- La **camada es un caso particular de grupo**: sus miembros comparten `grupo_id`, con modo por defecto `preferente`. Si una camada no puede dividirse, se marca `obligatorio`. No se crea entidad nueva.

### Estados
- Los estados siguen siendo **por individuo** (`disponible`, `en_acogida`, `adoptado`, `devuelto`) → nada que sincronizar.
- El estado del grupo es **derivado** (completa / parcial / agotada) solo con fines de UI y selección.

### Impacto en el caso (adopción/acogida)
- Se mantiene **1 solicitud → 1 animal** (el pipeline actual no se toca).
- Al asignar, cada caso hereda `grupo_id` de su animal; los casos del mismo grupo se muestran juntos en UI (con la nota "Se entrega junto con X").
- **Selector "asignar animal"**:
  - `obligatorio` → al elegir uno, los compañeros entran solos y no se pueden quitar.
  - `preferente` → preseleccionados, pero desmarcables (opción de separar).
- **Devolución** (regla simple):
  - `preferente`/libre → individual: vuelve a `disponible` solo el individuo.
  - `obligatorio` → se devuelve **el grupo entero** (misma fecha/motivo en todos); un botón "devolver grupo", porque un vínculo obligatorio no puede continuar separado en esa familia.

### Especies domésticas (más allá de perro/gato)
- Ficha Animal: `tipo` pasa a `especie` (perro, gato, conejo, cobaya, hurón, ave, reptil...) + `raza`. Enum extensible, no hardcodeado.
- Encuestas de pre-adopción perros/gatos se conservan; para otras especies la opción más simple: **encuesta genérica** "Pre-adopción otras especies" (misma plantilla + campo `especie` en el Form). Pre-acogida ya es genérica (vale cualquier especie).
- Hub móvil: 4ª tarjeta para otras especies (el resto no cambia).
- "Animales" y reportes: filtro por `especie`.
- El grupo **no se restringe por especie** (hay parejas entre especies válidas e inseparables).

### Decisiones pendientes (ampliación)
- Devolución de un `obligatorio`: ¿siempre grupo entero, o permitir "reubicar pareja en otra familia sin devolver"? Hacia implementación, se plantea **devolver el grupo** (simple y coherente con "no separables").

## 10) Contratos / carta de compromiso (acordada)

> Salida formal del caso: documento con datos de la persona, firma(s) y PDF.

### Hoja nueva "Contratos"
- `id`, `tipo` (`adopcion`|`acogida`), `caso_id`, `contacto_id`.
- Datos de la persona **no se duplican**: se traen de `Contacto` (nombre, DNI, email, teléfono, dirección).
- `firma1_url`, `fecha_firma1`.
- `segundo_contacto?`: campo condicional "¿requiere segunda persona de referencia?" (checkbox + motivo):
  - `motivo`: `menor_edad` | `edad_avanzada`.
    - `menor_edad` → **tutor legal obligatorio**.
    - `edad_avanzada` → **persona de continuidad/sucesora**: primer contacto y quien recibiría al animal si el titular mayor ya no puede ocuparse (evitar devolución). Sin componente legal, solo garantía de continuidad.
  - `nombre`, `dni`, `parentesco`, `telefono` (primer contacto), `firma2_url`, `fecha_firma2`.
- `estado`: `borrador` | `firmado` | `pdf_generado`.
- `pdf_url` (enlace al PDF en Drive).

### Firma (mobile-first, sin librerías)
- **Canvas de dibujo** sobre el detalle del caso (dedo/ratón) → imagen.
- Si hay segundo contacto: 2º canvas con su firma.

### Salida PDF
- Botón **"Generar contrato"** en el caso → `PdfService.gs` rellena la **plantilla/esquema fijo de la asociación** (cabecera, cláusulas, huecos) con los datos + firma1/firma2 incrustadas, produce el PDF y lo guarda en **Google Drive** (URL en la fila).
- Cubre ambos escenarios que se pidieron: PDF autocontenido **o** seguir un esquema predefinido (la plantilla es el esquema).

### Impacto
- No se toca estados/notas ni pipelines. Se añade un paso **"Firmar contrato"** a las fases existentes (`adaptación`/`entrega`), visible como acción en el detalle del caso (incluido móvil).
- Asunciones confirmadas: firma canvas ✅; segunda persona dual (menor/edad avanzada) ✅. Asumido hasta fijar en implementación: plantilla PDF fija de la asociación y guardado de firmas+PDF en Drive.

## 11) Modal de "Procesos" (guía de uso en el panel)

> Modal informativo (solo UI, sin tocar lógica) que explica los pasos. Se abre desde un botón de ayuda en el dashboard y desde "Más".

Contenido en 3 secciones:

- **Crear un animal (alta de ficha)**: campos básicos; `especie` + `raza` (enum extensible); opcionalmente `grupo_id` (+ `grupo_obligatorio`) si forma parte de una camada/conjunto.
- **Proceso de adopción**: encuesta (perros/gatos/otras especies) → aprobada → candidatura (tipo `adopcion`) → elegir candidato → fases `adaptación → adoptado` → devolución posible (con motivo/historial).
- **Proceso de acogida**: encuesta pre-acogida → aprobada → candidatura (tipo `acogida`) → `entrega → en casa → finalizada` → el animal vuelve a `disponible` o **pasa a adopción** (misma persona+animal, se guarda el origen).

- Reutiliza el mismo contenido que este esquema; sirve como guía rápida para el equipo dentro de la app.