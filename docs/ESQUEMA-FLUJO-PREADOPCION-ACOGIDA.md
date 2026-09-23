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