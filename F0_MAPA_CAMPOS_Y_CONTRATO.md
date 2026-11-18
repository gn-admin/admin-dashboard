# F0 · Mapa de campos y contrato de composición (ficha interna ↔ publicación web)

> **Fase:** F0 del [`PLAN_GESTOR_FICHAS_PUBLICACIONES.md`](PLAN_GESTOR_FICHAS_PUBLICACIONES.md).
> **Fecha:** 2026-11-17 (base 1:1). **Reapertura:** 2026-11-17 para integrar grupos/camadas.
> **Alcance:** inventario real extraído del código (no del plan), contradicciones detectadas y contrato propuesto. **No implementa nada.**
> **Estado:** **REABIERTA.** La base 1:1 (inventario, whitelist, precedencia simple, D1–D5) se mantiene; D6–D8 siguen pendientes de confirmación final y se añade la **extensión de grupos de adopción conjunta** (§11, decisiones G-D1…G-D7). F0 se cierra cuando el contrato 1:1+grupos quede unificado y sin decisiones bloqueantes. Referencia: [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md).

---

## 0. Resumen: lo que hay que decidir antes de tocar código

| # | Hallazgo | Consecuencia hoy |
|---|---|---|
| 1 | **`disponible` no existe como `estado_publico`** | Al abrir la publicación de un animal disponible, el `<select>` no encuentra opción y el navegador marca la **primera** (`en_adopcion`). Se guarda ese valor sin que nadie lo elija. |
| 2 | **`fallecido` tampoco existe como `estado_publico`** | Un animal fallecido puede seguir con la publicación en `publicado`. Solo se corrige a mano. |
| 3 | **`urgente` tiene tres representaciones** | Booleano `urgente` en `Animales`, valor de `estado_publico`, e icono `urgente` de la ficha. Tres fuentes de verdad para lo mismo. |
| 4 | **La media vive en tres capas** | `media` (publicación), `ficha.gallery/videos/icons` (precedencia sobre `media`) y la foto única del animal. No existen galería/vídeos internos. |
| 5 | **La herencia de salud es parcial y silenciosa** | Se heredan vacunas, esterilizada y microchip; **no** existen campos internos de desparasitado ni necesidades especiales. En la UI no se ve qué es heredado y qué es propio. |
| 6 | **Ciclo de vida asimétrico** | Evento/historia tienen Retirar (410) y Restaurar. Animal solo tiene Ocultar y «Eliminar borrador» (borra la configuración, no la ficha). |

**Regla que ya se cumple y hay que conservar:** los documentos privados se guardan en `media_json`, pero **`webConstruirPublicacion` no los emite** (`apps-script/WebPublicaciones.gs:665-711`). No viajan al canal ni a la página estática.

---

## 1. Fuentes de datos actuales

```
Hoja Animales (maestra)                    Hoja WebPublicaciones (capa web)
  id, nombre, especie, raza, ...             id, tipo, origen_id ──┐
  estado, urgente, foto_*, ...              slug, estado_publicacion, seo_json,
        │                                   media_json, animal_json, ficha_json, ...
        └────────── origen_id ──────────────┘
                                                     │
                                    webConstruirPublicacion()  ← compositor único
                                                     │
                                    payload Publicacion (preview == feed)
```

- **Ficha interna:** hoja `Animales`, gestionada en `src/js/dashboard.js` (formulario `showAnimalForm`, línea ~4818).
- **Publicación:** hoja `WebPublicaciones`; una fila por publicación; animal referenciado por `origen_id`.
- **Composición:** `apps-script/WebPublicaciones.gs:648` (`webConstruirPublicacion`), usada por preview y canal público.
- **Render:** `src/js/publico.js` + `src/js/ficha-config.js`; prerender en `scripts/prerender-publico.js`.

---

## 2. Inventario de la hoja `Animales` (maestra)

Campos realmente leídos/escritos por el panel (`dashboard.js`) y por el compositor (`WebPublicaciones.gs`).

| Campo | Tipo | Uso actual | ¿Sale hoy al público? | Destino propuesto |
|---|---|---|---|---|
| `id` | texto | Clave y `origen_id` | No | Maestro |
| `nombre` | texto | Ficha, título por defecto, `animal.names` | **Sí** (heredado) | Maestro |
| `especie` | texto | Ficha, filtros, `animal.species` | **Sí** (heredado) | Maestro |
| `raza` | texto | Ficha, `animal.breed` | **Sí** (heredado) | Maestro |
| `sexo` | Macho/Hembra | Ficha, `animal.sex` | **Sí** (heredado) | Maestro |
| `edad` | texto libre | Ficha, `animal.age.label` | **Sí** (heredado) | Maestro (normalizar a `value`+`unit`) |
| `peso` | texto | Ficha interna | No | Maestro |
| `estado` | `disponible`/`en_acogida`/`en_adopcion`/`adoptado`/`fallecido` | Ficha, filtros, `estado_publico` por defecto | Indirecto (se copia al crear) | **Maestro de visibilidad** (ver D1) |
| `urgente` | booleano | Badge y orden (`_esPrioritario`) | **Sí, como estado público** hoy | **Bandera pública** (ver D2) |
| `apadrinable` | booleano | Botón apadrinar | No | Maestro |
| `grupo`, `grupo_id`, `grupo_obligatorio` | texto/bool | Camadas | No | Maestro |
| `fecha_ingreso` | fecha | Ficha | No | Maestro |
| `descripcion` | texto | Ficha interna; **pre-rellena `contenido_html`** al crear | **Sí** (solo al crear) | Maestro; dejar de copiar en cada guardado |
| `microchip` | texto | Ficha; `health.microchipped` | **Sí** (como booleano) | Maestro |
| `esterilizada` | booleano | Ficha; `health.neutered` | **Sí** (heredado) | Maestro |
| `vacunas` | texto (`Pendientes`, `Sí`, `No`…) | Ficha; `health.vaccinated` | **Sí** (como booleano) | Maestro |
| `foto_url` / `foto` | URL/ruta | Portada por defecto | **Sí** (fallback de portada) | Maestro |
| `foto_drive_id` | ID Drive | Portada por defecto | **Sí** (thumbnail) | Maestro (unificar con `foto_url`) |
| `desparasitado` | — | **No existe** | — | Nuevo (ver D4) |
| `necesidades_especiales` | — | **No existe** | — | Nuevo (ver D4) |
| `tamano`, `color`, `temperamento` | — | **No existen** (solo publicación) | — | Nuevo (ver D4) |
| `galeria`, `videos` | — | **No existen** (solo publicación) | — | Nuevo (ver D4) |
| `documentos_internos` | — | **No existe** (hoy en publicación) | **No** (nunca) | Nuevo, privado |

**Lectura:** la ficha interna es maestra de identidad y salud básica; **todo lo demás (presentación, media, compatibilidad, ubicación, contacto) vive solo en la publicación**.

---

## 3. Inventario de la hoja `WebPublicaciones`

### 3.1 Columnas (mapeo real en `WebPublicaciones.gs:337-369`)

| Columna | Tipo | Público | Notas |
|---|---|---|---|
| `id` | texto (`web_...`) | Sí (id) | |
| `tipo` | `animal`/`evento`/`historia` | Sí | |
| `origen_id` | texto | No | Enlace a `Animales` |
| `slug` | texto | Sí | Único por tipo, incluye históricos |
| `estado_publicacion` | `borrador`/`publicado`/`oculto`/`retirado` | Sí (status) | |
| `indexable`, `listed`, `featured`, `orden` | bool/número | Sí | |
| `titulo`, `extracto`, `contenido_html` | texto/HTML | Sí (saneado) | |
| `categoria` | texto | Sí | **Duplica** especie+estado (ver F-04) |
| `estado_publico` | texto | Sí | Vocabulario distinto del interno (ver F-01/F-02) |
| `especie` | texto | No (el payload usa `animal.species`) | Columna redundante (ver F-09) |
| `autor` | texto | **Sí** | Decidir si es público (ver F-12) |
| `tags_json` | JSON array | Sí | Etiquetas base |
| `media_json` | JSON | Parcial | Portada, galería, vídeos, iconos **y documentos privados** |
| `seo_json` | JSON | Sí | |
| `cta_json` | JSON | Sí | |
| `animal_json` | JSON | Sí | Curación del bloque animal |
| `evento_json` | JSON | Sí | Solo eventos |
| `ficha_json` | JSON (máx. 45.000) | Sí, solo detalle | C3 |
| `publicado_en`, `actualizado_en`, `creado_en` | fecha | Sí | Derivadas |
| `slug_historial` | JSON | No | Para 301 |

### 3.2 Forma de cada JSON

- **`media`**: `{ coverImage:{src,alt}, gallery:[{src,alt,caption,order}], videos:[{title,url,provider,note}], icons:[{icon,label,value}], documents:[{name,url}] }`
- **`seo`**: `{ metaTitle, metaDescription, canonical, robots, og, twitter }`
- **`animal`**: `{ names[], species, breed, sex[], age{value,unit,label}, size, color, health{vaccinated,dewormed,neutered,microchipped,specialNeeds}, temperament[], compatibility{dogs,cats,kids}, adoption{mode,feeEur,requirements}, foster{temporary,durationLabel}, location{city,province}, contact{email,phone} }`
- **`ficha`** (C3): `{ plantilla, bloques{7}, orden[7], videoModo, mostrarLectura, icons?, gallery?, videos?, tags?, cta? }`
- **`evento`**: `{ kind, startDate, endDate, timezone, location, organizer, audience[], agenda[], registration, milestone }`

---

## 4. Media: estado real y objetivo

### 4.1 Hoy (tres capas + Drive)

| Capa | Dónde se edita | Precedencia | Qué cubre |
|---|---|---|---|
| `media` | Formulario de publicación (`src/js/web.js:621-642`) | Base | Portada, galería, vídeos, iconos, documentos |
| `ficha.gallery/videos/icons` | Bloque «Presentación de la ficha» (C3) | **Gana sobre `media`** | Duplica lo anterior si se rellena |
| Foto del animal | Ficha interna | Fallback de portada | Solo una imagen |

- Subida a Drive por publicación: `animales|eventos|historias/<slug>`; imágenes/vídeos compartidos, documentos privados.
- Entrada por texto con separador `|` (`url|alt|pie`, `título|url`, `icono|etiqueta|valor`, `nombre|url`), propensa a error.

### 4.2 Objetivo propuesto

1. **Una sola capa de media por publicación** (`media`), con `ficha.gallery/videos/icons` tratados como *override* explícito y avisado en UI, no como segunda entrada de datos.
2. **Media interna del animal** en `Animales` (solo si se aprueba D4), reutilizando `fileId` de Drive:
   `portada_url`, `portada_alt`, `galeria`, `videos`, `documentos_internos`.
3. **Documentos privados separados** de `media_json` (columna propia `documents_json` o equivalente) para que ningún serializado accidental los arrastre.
4. **El límite de 45.000 caracteres es solo de `ficha_json`.** La media va en `media_json`, así que **no compite** con ese límite. No hace falta subirlo por añadir galería.

---

## 5. Whitelist pública (lo que sale hoy)

Emitido por `webConstruirPublicacion`:

`id, slug, type, category, status, title, excerpt, publishedAt, updatedAt, coverImage{src,alt}, contentHtml, author, tags[], icons[], gallery[], videos[], featured, listed, url, canonical, seo{metaTitle,metaDescription,ogImage,canonical,robots,og,twitter}, image, imageAlt, dateFormatted, readTime` + `animal` (si `tipo=animal`), `event` (si evento), `ficha` (solo detalle/preview/prerender).

**Nunca salen:** `origen_id`, `estado` interno, `documentos`, `media_folder_id`, `slug_historial`, `creado_en`, `peso`, `grupo*`, `apadrinable`, `fecha_ingreso`, `microchip` (crudo), `vacunas` (crudo), `descripcion` interno (solo si se copió a `contenido_html`).

**Sí salen y conviene decidir:** `author` (¿nombre interno?), `animal.contact.email/phone` (hoy solo se rellena en la publicación, pero es visible y indexable).

---

## 6. Precedencia por campo (contrato propuesto)

| Campo del payload | Override publicación | Herencia ficha interna | Default |
|---|---|---|---|
| `title` | `titulo` | — | — |
| `excerpt` | `extracto` | — | `''` |
| `contentHtml` | `contenido_html` | — (hoy copia `descripcion` solo al crear) | `''` |
| `status` | `estado_publico` | **derivado de `estado`** (ver D1) | — |
| `coverImage.src` | `media.coverImage.src` | `foto_url` / `foto_drive_id` | `''` |
| `coverImage.alt` | `media.coverImage.alt` | `nombre` | `titulo` |
| `gallery` | `ficha.gallery` → `media.gallery` | `galeria` (si D4) | `[]` |
| `videos` | `ficha.videos` → `media.videos` | `videos` (si D4) | `[]` |
| `icons` | `ficha.icons` → `media.icons` | — | `[]` |
| `tags` | `ficha.tags` → `tags_json` | — | `[]` |
| `cta` | `ficha.cta` → `cta_json` | — | `null` |
| `animal.names` | `animal.names` | `nombre` | `[]` |
| `animal.species/breed` | `animal.*` | `especie`/`raza` | `''` |
| `animal.sex` | `animal.sex` | `sexo` | `[]` |
| `animal.age` | `animal.age` | `edad` (texto → label) | — |
| `animal.health.vaccinated` | `health.vaccinated` | `vacunas` | `false` |
| `animal.health.neutered` | `health.neutered` | `esterilizada` | `false` |
| `animal.health.microchipped` | `health.microchipped` | `microchip` (no vacío) | `false` |
| `animal.health.dewormed` | `health.dewormed` | **sin fuente interna** | `false` |
| `animal.health.specialNeeds` | `health.specialNeeds` | **sin fuente interna** | `false` |
| `animal.size/color/temperament/compatibility/adoption/foster/location/contact` | `animal.*` | **sin fuente interna** | vacío |

**Regla de oro:** *override publicación > herencia ficha > default*, y **cada campo heredado debe verse como heredado en la UI** (valor atenuado + «heredado de la ficha» + enlace), con opción de sobrescribir.

---

## 7. Contradicciones detectadas (con referencia)

| ID | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| **F-01** | `disponible` no está en `estado_publico`; el select cae en `en_adopcion` | `src/js/web.js:615` vs `src/js/dashboard.js:4838` | **Alta** |
| **F-02** | `fallecido` no está en `estado_publico`; la publicación puede seguir viva | ídem | **Alta** |
| **F-03** | `urgente` es booleano, estado público e icono | `dashboard.js:4836`, `web.js:615`, `web.js:629` | Alta |
| **F-04** | `categoria` es manual pero se deduce de especie+estado (`Perros en adopción`, `Acogidas`, `Adoptados`) | `web.js:611` | Media |
| **F-05** | Salud heredada parcial y sin marca visual; `dewormed`/`specialNeeds` sin fuente | `WebPublicaciones.gs:611-617` | Media |
| **F-06** | Media en 3 capas (media / ficha / foto animal) con precedencia no visible | `ficha-config.js:38`, `web.js:621` | Media |
| **F-07** | Animal sin Retirar/Restaurar; evento sí | `web.js:363-370` vs `383-393` | Media |
| **F-08** | Portada heredada no aparece en el campo «Portada» (vacío) pero sí se pinta en la web | `web.js:624` + `WebPublicaciones.gs:656` | Media |
| **F-09** | `especie` duplicada en `WebPublicaciones` y en `Animales` | `WebPublicaciones.gs:355` | Baja |
| **F-10** | Documentos privados comparten `media_json` con media pública | `web.js:754` + `WebPublicaciones.gs:658` | **Alta** (riesgo de fuga futura) |
| **F-11** | Completitud no valida coherencia estado interno ↔ público | `WebPublicaciones.gs:571-586` | Media |
| **F-12** | `author` y `animal.contact` son públicos sin decisión explícita | `WebPublicaciones.gs:677`, `:623` | Media |

---

## 8. Decisiones pendientes (🔴)

Cada una lleva **recomendación**; basta confirmar o cambiar.

> **Estado 2026-11-17:** **D1–D5 aprobadas** (mapeo recomendado, lápida 410, media interna, opt-in desactivado, `urgente` como bandera). **D6–D8** quedan como propuesta por defecto: no bloquean F1 y se confirman al entrar en F2/F3.

### D1 · Mapeo `estado` interno → `estado_publico` ✅ APROBADA
**Recomendado:** reducir el vocabulario público a 5 valores y derivarlo del interno, permitiendo override manual:

| `estado` interno | `estado_publico` derivado |
|---|---|
| `disponible` | `en_adopcion` |
| `en_acogida` | `en_acogida` |
| `en_adopcion` (reservado) | `reservado` |
| `adoptado` | `adoptado` + aviso de ocultar/retirar |
| `fallecido` | **retirada** (ver D3) |

Valores públicos finales: `en_adopcion`, `en_acogida`, `reservado`, `adoptado`, `cerrado`. Se mantiene compatibilidad: publicaciones existentes con `urgente` se leen como `en_adopcion` + bandera.

### D2 · Semántica de `urgente` ✅ APROBADA
**Recomendado:** `urgente` es **solo booleano** en `Animales`. En la web se pinta como badge/chip y ordena primero (`_esPrioritario`), nunca como estado. Se elimina `urgente` del `<select>` de estado público y se retira el icono duplicado (o el icono se genera solo desde el booleano).

### D3 · Retirada de un animal ✅ APROBADA
**Recomendado:** misma semántica que eventos: `retirado` → lápida 410 con slug reservado y opción Restaurar. `fallecido` propone retirada automática (con confirmación). No liberar el slug (rompería 301 e indexación).
*Alternativa:* liberar slug y borrar la fila; más simple pero peor para SEO y enlaces compartidos.

### D4 · Media interna del animal ✅ APROBADA
**Recomendado:** añadir en `Animales` las columnas `portada_url`, `portada_alt`, `galeria`, `videos`, `documentos_internos`. La galería/vídeos internos **pre-rellenan** la publicación al crearla; los documentos internos **nunca** salen.
*Alternativa mínima:* dejar solo la foto actual y no añadir media interna hasta que haya volumen.

### D5 · Propagación publicación → ficha ✅ APROBADA
**Recomendado:** checkbox **desactivado por defecto** («Guardar también en la ficha del animal»), reutilizando `fileId`. Evita que editar la web altere la ficha maestra sin querer. La propagación ficha → publicación solo ocurre al crear (pre-relleno), nunca al guardar.

### D6 · Campos obligatorios para publicar (propuesta por defecto)
**Recomendado:** mantener los 6 actuales (`titulo`, `slug`, `categoria`, `estado_publico`, contenido ≥ 40, portada —con fallback de foto—, `metaDescription` o extracto) y añadir **coherencia de estado** (no permitir `publicado` si interno es `fallecido`). La portada con fallback debería mostrarse en el formulario (F-08), no bloquear.

### D7 · Contacto y autor públicos (propuesta por defecto)
**Recomendado:** `animal.contact` sale de la configuración de la asociación (email/teléfono públicos), no de datos del tutor; `author` se deja vacío por defecto o se usa el nombre de la asociación. Confirmar.

### D8 · Dónde guardar documentos privados (propuesta por defecto)
**Recomendado:** columna propia `documents_json` (privada) y **eliminarlos de `media_json`**. El compositor deja de poder arrastrarlos aunque alguien serialice `media` entero.

---

## 9. Matriz de acciones por tipo (estado actual y objetivo)

| Acción | Animal | Evento | Historia | Nota |
|---|---|---|---|---|
| Crear desde ficha | Sí (picker) | — | — | Pre-relleno actual: título, descripción, estado |
| Crear desde cero | — | Sí | Sí | |
| Editar | Sí | Sí | Sí | |
| Preview | Sí | Sí | Sí | `preview == feed` |
| Publicar | Sí | Sí | Sí | Completitud backend |
| Ocultar | Sí | Sí | Sí | |
| Retirar (410) | **No** → objetivo Sí (D3) | Sí | Sí | Lápida + slug reservado |
| Restaurar | **No** → objetivo Sí (D3) | Sí | Sí | Vuelve a `borrador` |
| Eliminar configuración | Sí (solo borrador/oculto) | No | No | No toca `Animales` |
| Ver estado web en ficha interna | **No** → objetivo Sí (F2) | — | — | Chip + enlace + completitud |

---

## 10. Criterio de salida de F0 (reabierta: 1:1 + grupos) — CERRADA

**Base 1:1 (conservada y confirmada):**
- [x] Inventario de campos de `Animales` y `WebPublicaciones`.
- [x] Whitelist pública real y lista de lo que nunca sale.
- [x] Precedencia por campo documentada (herencia simple).
- [x] Contradicciones identificadas con referencia de código.
- [x] **D1–D5 cerradas** (2026-11-17).
- [x] **D6 confirmada:** campos obligatorios para publicar (título, slug válido, categoría, estado público, descripción ≥ 40, portada — con fallback/heredada —, meta descripción o extracto) + coherencia de estado (no publicar `fallecido`/conjunto inválido). En grupo: además ≥1 miembro válido y coherencia del conjunto.
- [x] **D7 confirmada:** `author` vacío o nombre de la asociación por defecto; `animal.contact` público desde configuración de la asociación (no datos de tutor), salvo override explícito permitido.
- [x] **D8 confirmada:** documentos privados en `documents_json` (columna aditiva), fuera de `media_json` y nunca en payload público.
- [x] Columnas nuevas 1:1 decididas (§1.4 del plan) y matriz de acciones 1:1 aprobada.

**Extensión grupos (cerrada por contrato, ver §11):**
- [x] Inventario de origen de grupo (`grupo`, `grupo_id`, `grupo_obligatorio`, miembros) y su relación con `WebPublicaciones`.
- [x] **G-D1:** `tipo = "animal_grupo"`, `origen_tipo = "grupo"` (aditivo), `origen_id = grupo_id`. Columnas aditivas según §11.2.
- [x] **G-D2:** `grupo_id` identificador estable/canónico; unicidad: a lo sumo 1 publicación por `grupo_id`. Renombrar el grupo no cambia `grupo_id`; cambios de miembros se reflejan por refresco (G-D4).
- [x] **G-D3:** tabla de derivación de estado público y `urgent` agregado definida (§11.4).
- [x] **G-D4:** refresco = recalcular agregados/derivación en cada composición/lectura (estado siempre fresco desde miembros).
- [x] **G-D5:** exclusividad para `grupo_obligatorio` activa: no puede haber publicaciones individuales **publicadas** de sus miembros; al activar/publicar grupo se exige resolver conflictos (ocultar/retirar/eliminar borrador individual). Borradores individuales no bloquean pero se advierten.
- [x] **G-D6:** whitelist y representación pública de miembros definida (§11.3, §11.6).
- [x] **G-D7:** categoría/slug/canónica/SEO/JSON-LD definidos (§11.7), contrato aditivo compatible con `main`.
- [x] Precedencia/composición agregada documentada: `override publicación > herencia_agregada(miembros) > vacío/default`.
- [x] Matriz de acciones ampliada a `animal_grupo` (§11.5).

**F0 cerrada (2026-11-17, contrato unificado 1:1+grupos).** Implementación sujeta a F1–F4 y a ajustes menores si surgen incompatibilidades técnicas documentadas.

---

## 11. Extensión F4 — Grupos/camadas (contrato cerrado)

> Basado en [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md). Decisiones G-D1…G-D7 resueltas (2026-11-17) para habilitar F1–F4.

### 11.1 Origen interno: grupos en `Animales`

- Campos relevantes: `grupo` (nombre), `grupo_id` (identificador), `grupo_obligatorio` (adopción conjunta). Gestión existente en `dashboard.js` (alta de camada, vista/gestión de grupo).
- **Unidad publicable (G1):** grupos con `grupo_obligatorio = true` → 1 publicación de grupo exclusiva. Grupos/camadas no obligatorios → publicaciones 1:1 por animal; opcional `historia` editorial del conjunto.
- **G-D2 (identidad):** `grupo_id` es el identificador **estable y canónico** del grupo. Unicidad: como máximo **1 publicación** por `grupo_id`. Renombrar el grupo (`grupo`/nombre) no altera `grupo_id` ni la vinculación. Alta/baja de miembros se refleja por refresco (G-D4); si el grupo deja de ser válido para adopción conjunta, la publicación pasa a revisión/bloqueo según G-D3.

### 11.2 Publicación de grupo (modelo) — G-D1

| Aspecto | Decisión |
|---|---|
| **Tipo / origen** | `tipo = "animal_grupo"`, `origen_tipo = "grupo"` (columna aditiva), `origen_id = <grupo_id>` |
| **Cardinalidad** | 1 publicación por grupo obligatorio; exclusiva respecto a individuales activas de sus miembros (G-D5) |
| **Composición** | `normalizar(publicación_grupo ⊕ herencia_agregada(miembros))`, whitelist estricta, `preview == feed` |
| **Precedencia** | `override publicación > herencia_agregada(miembros) > vacío/default` |
| **Estados publicación** | `borrador | publicado | oculto | retirado` (misma semántica que 1:1/evento/historia) |
| **Slug/SEO** | Único y reservado (espacio global coherente con el canal), histórico 301, retirada 410 + restaurar; canónica `publicaciones/<slug>.html` |
| **Columnas aditivas (`WebPublicaciones`)** | `origen_tipo` (texto). Reutiliza columnas existentes (`tipo`, `origen_id`, `estado_*`, `slug*`, `titulo`, `extracto`, `contenido_html`, `categoria`, `media_json`, `documents_json`, `media_folder_id`, `seo_json`, `cta_json`, `ficha_json`, `animal_json` para agregados/overrides de grupo o equivalente JSON de grupo — a concretar en F3/F4 manteniendo aditividad). No exponer en payload. |

### 11.3 Herencia agregada y whitelist pública de grupo (G-D6)

| Campo/dato | Fuente | Regla | Público |
|---|---|---|---|
| **Miembros (resumen)** | Fichas internas | Lista curada por miembro: `nombre`, `especie`, `raza`, `sexo`, `edad` (etiqueta), `size`, `foto/portada` (src+alt si existe). Sin IDs internos, sin `grupo_id` interno expuesto, sin datos sensibles. Orden estable. | Sí |
| **Resumen conjunto** | Agregado | `species`/`breed` combinados (único o lista), `age` como etiqueta resumida/rango si procede, recuento de miembros. | Sí |
| **Estado y urgencia** | Derivado (G-D3) + override manual | `status`/`estado_publico` y bandera `urgent` según §11.4. | Sí |
| **Salud/compatibilidad** | Miembros + override publicación | Agregación **conservadora**: `specialNeeds=true` si algún miembro lo requiere; vacunado/desparasitado/esterilizado/microchip solo si aplican al conjunto o se muestran por miembro en el resumen (detalle en payload de grupo, sin prometer de más). Compatibilidad/temperamento: intersección o listado resumido. | Sí (whitelist) |
| **Media** | Publicación (+ pre-relleno desde miembros) | Portada y galería/vídeos propios del grupo; pre-relleno al crear desde media de miembros. | Sí |
| **Documentos** | `documents_json` | Privados. | **No** (nunca) |
| **Editorial/SEO/CTA/ficha C3** | Publicación | Título, extracto, contenido, categoría, tags, `ficha`, `cta`, `seo`, flags, fechas. Contacto público por D7. | Sí (según whitelist existente) |

**Nunca público:** `origen_id`, `origen_tipo`, `grupo_id`, estados internos crudos, `documents_json`, `media_folder_id`, `slug_historial`, datos de tutor, notas/IDs internos.

### 11.4 Derivación de estado agregado y coherencia (G-D3, D6)

| Situación de miembros (conjunto) | `estado_publico` derivado (`auto`) | `urgent` | Publicable / notas |
|---|---|---|---|
| Todos `disponible` | `en_adopcion` | si algún miembro prioritario | Sí, si completitud OK |
| Todos `en_acogida` o mezcla `disponible`+`en_acogida` (ninguno reservado/adoptado/fallecido) | `en_acogida` | si algún miembro prioritario | Sí, si completitud OK |
| Algún miembro `en_adopcion` interno (**reservado**) y ninguno `fallecido`/adoptado parcial que invalide | `reservado` | si algún miembro prioritario | Sí (conjunto reservado) |
| Todos `adoptado` | `adoptado` | `false` (salvo regla explícita, por defecto no) | Sí como estado informativo; se recomienda ocultar/retirar |
| **Adopción parcial** (alguno adoptado y otros no, conjunto ya no adoptable junto) | `cerrado` | según miembros activos | **No publicable como disponible**; revisión obligatoria (ajustar grupo o retirar) |
| **Algún `fallecido`** o grupo vacío/inválido (sin miembros válidos para conjunto) | `cerrado` | `false` | **No publicable** en `publicado`; proponer retirada (410) con confirmación |
| Mezcla no cubierta / inconsistente | `cerrado` | calculado pero irrelevante | **No publicable** hasta resolver |

- **Override manual:** permitido cambiar `estado_publico` solo a valores coherentes con el vocabulario (`en_adopcion,en_acogida,reservado,adoptado,cerrado`) pero **nunca** permite publicar un conjunto inválido (`fallecido`/adopción parcial/grupo vacío según reglas) salvo corrección previa del grupo. El modo `auto` es el recomendado.
- **Completitud grupo (D6 ampliado):** título, slug válido, categoría, estado público coherente, descripción ≥ 40, portada (propia o pre-rellenada), meta descripción o extracto, y **≥1 miembro válido**; no publicar si el conjunto es inválido.

### 11.5 Refresco, exclusividad y acciones (G-D4, G-D5)

- **G-D4 (refresco):** los agregados y la derivación (`estado_publico`, `urgent`, resúmenes, salud/compatibilidad) se **recalculan en cada composición/lectura** a partir de las fichas actuales de los miembros. La publicación persiste editorial/overrides; no depende de caché de datos de miembros para coherencia.
- **G-D5 (exclusividad, `grupo_obligatorio`):**
  - Mientras exista una publicación de grupo del `grupo_id` en estado `publicado` u `oculto` (vigente), sus miembros **no** deben tener publicaciones individuales publicadas. Los listados/canal públicos muestran el grupo, no los individuos del conjunto.
  - Al crear/publicar/activar una publicación de grupo: si algún miembro tiene publicación individual `publicado`, la operación se bloquea con aviso y requiere resolver (ocultar o retirar la individual). Si tiene `borrador`/`oculto`, se permite con advertencia y se recomienda retirarla/ocultarla para evitar confusión.
  - Publicaciones individuales `retirado` no bloquean. La gestión de grupo interno (cambiar `grupo_obligatorio`, mover miembros) debe advertir del impacto en la publicación.
- **Matriz de acciones (ampliada):**

| Acción | Animal 1:1 | Grupo (`animal_grupo`) | Evento/Historia |
|---|---|---|---|
| Crear desde origen | Sí (animal sin pub, y sin grupo obligatorio vigente) | Sí (grupo obligatorio sin pub o borrador) | — / desde cero |
| Crear desde cero | — | — | Sí |
| Editar / Preview | Sí | Sí (editorial + vista de miembros/agregados) | Sí |
| Publicar / Ocultar | Sí | Sí (sujeto a G-D3/G-D5) | Sí |
| Retirar (410) / Restaurar | Sí | Sí (slug reservado) | Sí |
| Eliminar borrador/config | Sí (no publicado/retirado) | Sí (no publicado/retirado) | Según tipo |
| Ver estado web en ficha interna | Sí (propia) | Sí (en cada miembro: estado de la publicación del grupo) | — |

### 11.6 Representación pública y payload (G-D6)

- Payload de detalle incluye bloque `group`/`members` whitelisted (resumen por miembro + totales) y datos agregados; sin exponer `origen_id`/`grupo_id`/IDs internos.
- Listado/card público: una sola entrada por la publicación del grupo (no una por miembro) con portada, título, extracto, estado, `urgent`, recuento/etiqueta de conjunto.
- No se generan páginas individuales públicas para miembros cubiertos por un grupo obligatorio publicado/vigente.

### 11.7 Categoría, SEO, JSON-LD y compatibilidad (G-D7)

- **Categoría:** derivada por defecto de composición/estado (`en_acogida`→Acogidas, `adoptado`→Adoptados, `cerrado`→Cerrados, o por especie predominante `Perros/Gatos en adopción` / “En adopción conjunta”), editable como override editorial igual que 1:1.
- **Slug/canónica:** `webNormalizarSlug` desde título (o nombre de grupo como sugerencia), único; `publicaciones/<slug>.html` como canónica estática; 301 por historial.
- **SEO:** `metaTitle`, `metaDescription` (o extracto), OG/Twitter y robots según flags, igual que 1:1.
- **JSON-LD:** `Article`/`BlogPosting` o esquema equivalente compatible que describa el conjunto; `name`/`description`/`image` del grupo y mención de miembros en texto/propiedades si el esquema lo permite sin romper compatibilidad. A concretar en F4 manteniendo validez y sin romper consumidores actuales (contrato aditivo).
- **Compatibilidad `main`:** campos aditivos e ignorables por consumidores desconocidos; la clave de tipo (`animal_grupo` o indicador de grupo) debe ser tolerante en el port (documentar en `TRANSFERIR_A_MAIN.md` cuando se implemente, sin ejecutar cambios en `main`).
