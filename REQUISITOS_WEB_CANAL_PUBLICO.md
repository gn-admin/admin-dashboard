# Requisitos de la web (`main`) al canal público

> **Alcance:** peticiones concretas al backend/canal público de `admin-dashboard` para poder encender **sección por sección** la web `main` contra datos reales.
> **Origen:** proyecto `main` (sitio estático en GitHub Pages). **Fecha:** 2026-11-21. **Estado:** propuesta, no implementada aquí.
> **Contexto en la web:** Fase 1 ya hecha — `js/data-source.js` + `js/publicaciones-api.js` con todas las secciones en `fake`, y el adaptador del canal ya escrito (`docs/plan-fuente-datos-fake-endpoint.md` en `main`). Lo único que falta para pasar cada sección a `'real'` es lo de este documento.
> **Regla:** mientras una petición no esté resuelta, esa sección de la web sigue con datos locales. No se requiere tocar el front para aprobar nada de aquí.

---

## 1. Cómo se ha verificado

Consultas en vivo contra el Web App (2026-11-21, `nocache=1`):

- `?endpoint=taxonomias`
- `?endpoint=publicaciones&pageSize=50`
- `?endpoint=historias-publicas|eventos-publicos|animales-publicos&pageSize=1` (campo `pagination.total`)

**Resultado:** 7 publicaciones publicadas/listadas.

| Tipo | Nº | Categoría | Nº | Estado | Nº |
|---|---:|---|---:|---|---:|
| `animal` | 4 | `Perros en adopción` | 4 | `en_adopcion` | 3 |
| `historia` | 1 | `Gatos en adopción` | 1 | `reservado` | 1 |
| `evento` | 1 | `Historias` | 1 | `en_acogida` | 1 |
| `animal_grupo` | 1 | `Eventos` | 1 | `programado` | 1 |
| | | | | `publicado` | 1 |

`taxonomias` devuelve:
`type: [animal, animal_grupo, evento, historia]` · `category: [Perros en adopción, Gatos en adopción, Eventos, Historias]` · `status: [en_adopcion, reservado, en_acogida, programado, publicado]` · `species: [perro, gato]`.

---

## 2. Estado por sección de la web

| Sección (`main`) | Consulta que usaría hoy | Resultado | Estado |
|---|---|---|---|
| Historias | `historias-publicas` | 1 | ✅ Cubierta |
| Detalle | `publicacion&slug=` | — | ✅ Cubierta (`redirect`/`gone` incluidos) |
| Gatos en adopción | `animales-publicos&species=gato&status=en_adopcion` | 1 | ✅ Cubierta |
| Perros en adopción | `animales-publicos&species=perro&status=en_adopcion` | 2 | ✅ Cubierta |
| Eventos | `eventos-publicos` | 1 | ✅ Cubierta |
| Acogidas | `animales-publicos&status=en_acogida` | 0 y **excluye grupos** | ⚠️ Parcial → **R1** |
| Adoptados | `animales-publicos&status=adoptado` | 0 | ✅ Cubierta (sin datos) |
| Casos externos | `publicaciones&category=Caso externo` | 0 | ⚠️ Parcial → **R2** |
| Home (destacados) | `publicaciones` (sin filtro) | 7 | ⚠️ Parcial → **R4** |
| Apadrinamiento | — | — | ❌ **Falta** → **R3** |

Notas de la verificación:

- `animal_grupo` **solo** aparece en `?endpoint=publicaciones`; los alias `animales-publicos` / `v1/animales` fuerzan `type=animal` (`_webParamsConTipo` en `Code.gs`).
- El grupo en `en_acogida` (`demo-camada-otono-2026`) lleva categoría `Perros en adopción`, no `Acogidas`: la categoría es editorial, no siempre derivada del estado.
- `status` de `taxonomias` mezcla estados de animales con los de eventos (`programado`, `publicado`).
- Hay 0 filas en acogidas, adoptados, apadrinamiento y casos externos: aunque la consulta exista, encender esas secciones hoy daría listados vacíos.

---

## 3. Peticiones

### R3 · Apadrinamiento (bloqueante, sin equivalente hoy)

**Necesita la web:** una sección `apadrinamiento` que liste animales apadrinables y su ficha con importe/detalles.

**Situación actual:** `Animales.apadrinable` existe y el gestor ya tiene el flujo (`src/js/dashboard.js`, `_esApadrinable`: check + estado `disponible`/`en_acogida`), pero `F0_MAPA_CAMPOS_Y_CONTRATO.md` §5 lo lista en **“Nunca salen”**: no viaja al payload público y no hay filtro.

**Contrato propuesto (mínimo, aditivo):**

1. **Payload** — añadir bloque de nivel superior en `webConstruirPublicacion` (solo `type: animal`):

```json
"sponsor": {
  "available": true,
  "monthlyEur": 10,
  "notes": "Apadrinas su alimentación y cuidados"
}
```

   - `available` se deriva de `Animales.apadrinable` aplicando la regla ya existente (`_esApadrinable`): verdadero solo si el animal es apadrinable y su estado es `disponible` o `en_acogida`. `false`/`null` si no aplica.
   - `monthlyEur` y `notes` son override editorial (publicación), opcionales.
   - **No** exponer `apadrinable` en crudo ni `estado` interno (se mantiene la whitelist actual).

2. **Filtro** — `?endpoint=animales-publicos&sponsor=1` (y `sponsor=0`):

```
GET ?endpoint=animales-publicos&sponsor=1&pageSize=24&sort=-publishedAt
→ {status:"success", pagination:{total:N}, data:[{ …, sponsor:{available:true,…} }]}
```

   - Añadir `sponsor` a la clave de caché `_webKeyParams` (`Code.gs`), o las respuestas cacheadas se mezclarían con/sin filtro.

3. **Alternativa si se prefiere no tocar el compositor:** publicar los apadrinables con `category:"Apadrinamiento"` (columna editorial) y que la web filtre por `category`. Es menos correcto (la categoría y el estado se pisan) y no aporta el bloque `sponsor`, pero desbloquea la sección sin cambios de backend.

**Criterios de aceptación:**

- [ ] Un animal publicado con `apadrinable=true` y estado `disponible` o `en_acogida` aparece con `sponsor.available=true`.
- [ ] `animales-publicos&sponsor=1` lo incluye; `sponsor=0` lo excluye; sin parámetro no cambia nada.
- [ ] Un animal `adoptado` con `apadrinable=true` devuelve `sponsor.available=false` y no aparece en `sponsor=1`.
- [ ] `preview == feed` también para `sponsor`.
- [ ] Ningún campo interno (`apadrinable`, `origen_id`, `estado`) aparece en el payload.

**Mientras tanto en la web:** sección en `fake` (no existe aún en el front; se creará con el bloque `sponsor` cuando R3 esté aprobado).

---

### R2 · Casos externos (valor de categoría)

**Necesita la web:** listar los casos de animales que no gestiona la asociación, con el mismo formato de ficha.

**Situación actual:** no hay `type` ni categoría derivada para ellos. El filtro `category` compara **exacto** con la columna editorial (`webListarPublicas`), así que funcionaría si existe una fila publicada con `categoria = "Caso externo"`. Con 0 filas no se puede confirmar el circuito completo.

**Lo que se pide (decisión + garantía, no código nuevo):**

1. Fijar el valor canónico **`Caso externo`** (misma grafía y acentos que usa hoy la web en `data/blog-posts.json`) y documentarlo en el catálogo de categorías.
2. Confirmar que la categoría editorial **no se re-deriva** al guardar/publicar para `type: historia` (hoy `webCategoriaGrupoDerivada` solo actúa en grupos; verificar que en alta de historia se respeta el valor).
3. Si el caso externo representa a un animal con ficha interna, decidir si va como `animal` (y entonces la categoría derivada lo pisaría) o como `historia` con categoría editorial. **Recomendado: `historia`**, porque no es un animal en adopción de la asociación.
4. (Opcional) Permitir el valor en el `<select>` de categoría del gestor para evitar erratas.

**Alternativa:** crear `type:"caso_externo"`, pero implica tocar `WEB_TIPOS`, gestor, JSON-LD, rutas y `main`: coste alto para el mismo resultado.

**Criterios de aceptación:**

- [ ] `GET ?endpoint=publicaciones&category=Caso%20externo` devuelve las filas marcadas así (probarlo con una fila de prueba publicada).
- [ ] La ficha de detalle responde igual que una historia (sin bloque `animal`).
- [ ] `taxonomias.category` incluye `Caso externo` cuando haya al menos una publicada.

**Mientras tanto en la web:** sección en `fake` y tarjetas fijas en `casos-externos.html`.

---

### R4 · Home: destacados (`featured`)

**Necesita la web:** el carrusel de la home quiere N destacados sin descargar todo el catálogo.

**Situación actual:** `featured` viaja en el payload y está en `webProyeccionCard`, pero **no se filtra** en `webListarPublicas` ni está en `_webKeyParams` (hoy `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` §89 lo da por “disponible”, pero solo como campo del payload).

**Contrato propuesto:**

```
GET ?endpoint=publicaciones&featured=1&pageSize=6&sort=-publishedAt
→ solo publicaciones con featured=true (hoy: 1)
```

- Aceptar `featured=0` (no destacadas) y ausencia = sin filtro.
- Añadir `featured` a `_webKeyParams` para la caché.
- Respetar `listed` y el estado de publicación como ya hace `webPublicables`.

**Criterios de aceptación:**

- [ ] `featured=1` devuelve solo las filas con la bandera y `pagination.total` coherente.
- [ ] Sin el parámetro, la respuesta es idéntica a la actual.
- [ ] `featured=0` devuelve el resto.

**Mientras tanto en la web:** home en `fake` (carrusel fijo); la sección `home` no se enciende.

---

### R1 · Acogidas: incluir grupos (`animal_grupo`)

**Necesita la web:** una sección de acogidas que muestre tanto animales individuales como camadas/grupos en acogida.

**Situación actual:** `?endpoint=animales-publicos` fuerza `type=animal`, así que el grupo `demo-camada-otono-2026` (estado `en_acogida`) **no** aparece. La web podría obtenerlo con `?endpoint=publicaciones&status=en_acogida` (sin `type`), que sí lo incluye; es un rodeo, no un bloqueo.

**Lo que se pide (una de las dos):**

1. Que `animales-publicos` / `v1/animales` incluya también `animal_grupo`, o
2. Un parámetro explícito: `?endpoint=animales-publicos&groups=1`.

Mantener el comportamiento actual si el parámetro no se envía, para no romper consumidores.

**Criterios de aceptación:**

- [ ] `animales-publicos&status=en_acogida` (opción 1) o `...&groups=1` (opción 2) devuelve el grupo además de los individuos.
- [ ] Sin el parámetro, la respuesta actual no cambia (opción 2).
- [ ] El payload del grupo sigue usando `group` + `animal` de compatibilidad.

**Mientras tanto en la web:** acogidas en `fake`; cuando se encienda, puede usar `publicaciones&status=en_acogida` como puente.

---

### R5 · Taxonomías separadas por tipo (mejora, no bloqueante)

**Necesita la web:** construir los chips de filtro sin mezclar vocabularios.

**Situación actual:** `taxonomias.status` devuelve `[en_adopcion, reservado, en_acogida, programado, publicado]`: los dos últimos son estados de evento, no del vocabulario de animales (D1). Un chip “publicado” en el listado de gatos no tiene sentido.

**Propuesta:** `?endpoint=taxonomias&type=animal` (o `statusByType: {animal:[…], evento:[…], historia:[…]}`) manteniendo la respuesta actual si no se envía el parámetro.

**Mientras tanto en la web:** el adaptador filtra los estados conocidos de animales (`en_adopcion`, `en_acogida`, `reservado`, `adoptado`, `cerrado`) y descarta el resto.

---

### R6 · Transporte (recordatorio, ya cubierto)

La web consume el canal con `fetch` y **cae a JSONP** (`&callback=`) porque `ContentService` no puede fijar `Access-Control-Allow-Origin`. No se pide nada nuevo: solo que `callback` y `?endpoint=…` sigan siendo la interfaz estable y que los cambios no rompan el JSONP (`_webSalida`).

---

## 4. Fuera de alcance de esta solicitud

- Escritura o endpoints de gestión desde la web (sigue siendo solo lectura).
- Formularios (`forms/submit`): se tratan aparte en `TRANSFERIR_A_MAIN.md` Parte B.
- Prerender, sitemap, robots y 301/410 físicos: se resuelven en el build de `main` (Parte A.5); el canal ya expone `sitemap`, `redirects` y `retiradas`.
- Cualquier cambio en `main`: lo ejecuta el proyecto `main` al aprobarse cada punto.

---

## 5. Prioridad y orden recomendado

| Orden | Petición | Motivo | Coste estimado |
|---|---|---|---|
| 1 | **R3** apadrinamiento | Única sección sin ninguna vía hoy; requiere decisión de modelo | Medio (compositor + filtro + gestor/override) |
| 2 | **R2** casos externos | Desbloquea la sección con una decisión editorial | Bajo (documentar + verificar) |
| 3 | **R4** `featured` | Home sin descargar el catálogo | Bajo (filtro + clave de caché) |
| 4 | **R1** grupos en acogidas | Hay puente con `publicaciones&status=…` | Bajo |
| 5 | **R5** taxonomías por tipo | Mejora de UI; hay workaround | Bajo |

---

## 6. Pruebas de aceptación (copiar/pegar)

```bash
BASE="https://script.google.com/macros/s/<DEPLOY_ID>/exec"

curl -sSL "$BASE?endpoint=taxonomias&nocache=1"
curl -sSL "$BASE?endpoint=publicaciones&featured=1&nocache=1"          # R4
curl -sSL "$BASE?endpoint=animales-publicos&status=en_acogida&nocache=1" # R1
curl -sSL "$BASE?endpoint=publicaciones&category=Caso%20externo&nocache=1" # R2
curl -sSL "$BASE?endpoint=animales-publicos&sponsor=1&nocache=1"        # R3
```

Comprobar en cada una: `status:"success"`, `pagination.total` esperado y que el payload no gane campos internos.

---

## 7. Qué hará la web al aprobarse cada punto

En `main`, la conmutación ya existe y es de una línea por sección:

```js
// js/data-source.js
sections: {
  apadrinamiento: { mode: 'real' },  // R3
  casosExternos:  { mode: 'real' },  // R2
  home:           { mode: 'real' },  // R4
  acogidas:       { mode: 'real' }   // R1
}
```

No hay que tocar renderizadores: `js/publicaciones-api.js` ya traduce el envelope y compone `publication`. Antes de encender cada sección se comprobará el conteo real: hoy `animales-publicos&status=en_acogida` devuelve 0 porque el único caso es un grupo (R1), y adoptados, apadrinamiento y casos externos no tienen ninguna fila publicada; esas secciones no se activarán hasta que el gestor tenga datos.

---

## 8. Referencias

- Canal: `apps-script/Code.gs` (`handleGetPublico`, `_esEndpointPublico`, `_webKeyParams`, `_webSalida`) y `apps-script/WebPublicaciones.gs` (`webListarPublicas`, `webConstruirPublicacion`, `webBloqueAnimal`, `webPublicacionPublica`, `webTaxonomias`).
- Contrato: `TRANSFERIR_A_MAIN.md` §A.2, `F0_MAPA_CAMPOS_Y_CONTRATO.md` §5 y §6, `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` §5.
- Web: `docs/plan-fuente-datos-fake-endpoint.md`, `js/data-source.js`, `js/publicaciones-api.js` (en `main`).
