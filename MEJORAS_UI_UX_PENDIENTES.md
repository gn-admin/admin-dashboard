# Mejoras de UI/UX pendientes

Backlog de interfaz y experiencia **congelado a propósito**: primero se cierra la
lógica del gestor, después se aplica esto de una vez. Sirve para no perder lo
detectado y para no mezclar refactors visuales con cambios de comportamiento.

- **Origen:** QA del gestor a 390 / 768 / 900 / 1280 px con la sesión de pruebas
  (`gn.test.coordinador@example.test`).
- **Verificado contra el código** (`src/js/web.js`, `src/js/dashboard.js`,
  `src/index.html`, `src/css/styles.css`) el 2026-11-18. Cuando una ficha lleva
  archivo y línea, la comprobación es de código; cuando lleva medidas, es del
  navegador. Estado del service worker: v283.
- **Regla mientras haya lógica en curso:** no se toca nada de esta lista salvo
  que sea una regresión (algo que se rompa y bloquee el uso).

## Cómo leer cada ficha

**Dónde** (selector o archivo), **evidencia** (medida o referencia real, no
impresión), **coste** (S ≈ media sesión, M ≈ una sesión, L ≈ varias) y
**dependencias** si las tiene.

Severidades:

- **S1** defecto visible o medido que estorba al usar el gestor.
- **S2** fricción o inconsistencia que se nota pero se puede esquivar.
- **S3** pulido, coherencia a futuro o decisión pendiente.

---

## A. Defectos medidos

### A1 · El formulario de publicación es un scroll larguísimo — S1 · coste M

- **Dónde:** formulario de publicación de animal (`src/js/web.js`, `<details>`
  de las líneas 725, 749, 808 y 812), a 390 px.
- **Evidencia:** 3.533 px de scroll dentro de un cuerpo de 710 px. Tiene **cuatro
  bloques plegables** (Media, Ficha pública, Presentación, CTA y SEO) y los
  campos sueltos de arriba; aun así «Guardar publicación» queda lejísimos.
- **Propuesta:** abrir por defecto solo los bloques con cambios o incompletos,
  resumen de una línea por bloque cerrado e índice pegajoso; alternativa:
  dividir en 2–3 pasos.
- **Ojo:** cambia el orden de tabulación y el estado de foco; hacerlo junto con
  la validación (B1).

### A2 · La barra de acciones tapa contenido al hacer scroll — S1 · coste S

- **Dónde:** `.modal-body--form .form-actions` (`position: sticky`).
- **Evidencia:** a 390 px la barra ocupa 698–819 px y el contenido del formulario
  sigue por debajo; el texto desaparece bajo el pie mientras se desplaza.
- **Propuesta:** sombra o borde superior que aparezca solo al quedar pegada
  (`IntersectionObserver`) y `scroll-margin-bottom` en los campos para que el
  foco no los deje justo debajo del pie.
- **Nota:** el aire inferior ya está resuelto (`padding-bottom: 16px` hasta
  1023 px y con punteros gruesos).

### A3 · Seis botones por fila en una columna de ~152 px — S2 · coste S/M

- **Dónde:** `td.table-actions` de `.web-tabla` (`src/js/web.js` 420–432).
- **Evidencia:** una fila de animal puede llevar **Preview, Ver ficha, Copiar
  enlace, Publicar/Ocultar, Retirar y Eliminar borrador**; a 768 px la columna
  queda en ~152 px y los botones caen en vertical, estirando la fila.
- **Propuesta:** menú de acciones (botón «⋯» con `aria-expanded`) para las
  secundarias y dejar visible solo la principal.

### A4 · Etiquetas del modo tarjeta a ancho fijo — S2 · coste S

- **Dónde:** `.card .data-table td::before { flex: 0 0 42% }`.
- **Evidencia:** a 390 px los valores largos se parten mucho («Estado web — Sin
  configurar» en tres líneas). El contador de grupo ya está arreglado aparte.
- **Propuesta:** etiqueta encima del valor (lista de dos líneas) o
  `flex: 0 1 auto` con `min-width: 30%`.

### A5 · Estadísticas del gestor ocupan casi dos pantallas — S2 · coste S

- **Dónde:** `.web-stats` en `@media (max-width: 720px)` (2 columnas); las seis
  tarjetas se generan en `src/js/web.js` ~366–371.
- **Evidencia:** Publicados, Borradores, Ocultos, Retiradas, Sin configurar e
  Incompletos empujan la lista de publicaciones por debajo del primer scroll.
- **Propuesta:** fila horizontal desplazable o chip compacto con el número
  primero.

### A6 · Preview del JSON con mucho scroll vertical — S2 · coste S/M

- **Dónde:** `.web-preview-json` (`max-height: 60vh`, `src/css/styles.css` 8300).
- **Evidencia:** a 390 px son 2.199 px de contenido dentro del `<pre>`; el scroll
  lateral ya está resuelto (`pre-wrap`).
- **Propuesta:** plegar objetos por nivel, resaltar claves, o mostrar un resumen
  (slug, estado, campos publicados) y el JSON completo tras «Ver JSON».
  Mantener «Copiar JSON».

### A7 · El pie del preview no queda fijo y el botón roza el borde — S2 · coste S

- **Dónde:** modal de previsualización (`src/js/web.js` 1725 y 1992): las
  acciones son un `.form-actions` **dentro del `.modal-body`**, no un
  `.modal-footer`, así que no reciben el área segura del pie.
- **Evidencia (390 px):** a scroll 0 el botón «Cerrar» acaba en 842 px con la caja
  del modal en 836 (recortado por `overflow: hidden`); hay que desplazar 22 px
  para verlo entero y aun así queda a 2 px del borde inferior.
- **Propuesta:** usar `.modal-footer` (o el patrón de pie del resto de modales,
  con `env(safe-area-inset-bottom)`) y no meter acciones en el cuerpo.

---

## B. Formularios, errores y validación

### B1 · Los errores no se asocian al campo — S1 · coste M

- **Dónde:** todo el panel (`aria-invalid` = 0 y `aria-describedby` = 0 en `src/`).
- **Evidencia:** hay mensajes de error, pero el input no queda marcado como
  inválido ni enlazado a su texto; un lector de pantalla lee el campo como
  válido y el error solo se anuncia si cae en una región viva.
- **Propuesta:** helper único que pinte `.form-error` con `id`, añada
  `aria-invalid="true"` y `aria-describedby` al control, y devuelva el foco al
  primer campo con error al intentar guardar.

### B2 · `autocomplete` / `inputmode` casi sin usar — S2 · coste S

- **Dónde:** 2 apariciones de `autocomplete=` y 6 de `inputmode` en `src/`.
- **Evidencia:** teléfono, email de contacto, DNI, importes y fechas no piden el
  teclado adecuado ni dejan que el navegador rellene.
- **Propuesta:** repasar por tipo de campo (`inputmode="tel|numeric|decimal"`,
  `autocomplete="tel|email|name"`, `type="date"` donde toque).

### B3 · Validación nativa mezclada con la propia — S2 · coste S

- **Dónde:** `novalidate` = 0 en el código.
- **Evidencia:** conviven mensajes del navegador (en el idioma del sistema) con
  los del panel (en español).
- **Propuesta:** `novalidate` + validación propia con mensajes en español, junto
  con B1.

### B4 · Confirmaciones: modal propio con dos fugas — S2 · coste S

- **Dónde:** `#confirm-modal` (`src/index.html` 357) y `Dashboard._confirm`
  (`src/js/dashboard.js` ~1419), con 34 usos ya migrados.
- **Evidencia:** el modal propio existe, tiene título, texto, etiqueta de botón y
  captura de foco. Quedan **dos `window.confirm` nativos**: borrar media
  (`src/js/web.js` 1164) y el respaldo cuando falta el modal
  (`src/js/dashboard.js` 1421).
- **Propuesta:** migrar esos dos, y revisar que todos los call sites destructivos
  usan `_confirm` con etiqueta explícita («Retirar», no «Confirmar»).

---

## C. Diálogos, foco y teclado

### C1 · Confirmaciones sin `role="alertdialog"` — S2 · coste S

- **Dónde:** `#confirm-modal` declara `role="dialog" aria-modal="true"`;
  `role="alertdialog"` no aparece en `src/`.
- **Evidencia:** las confirmaciones destructivas se anuncian como diálogo normal,
  sin la carga de alerta que sí tienen otros paneles.
- **Propuesta:** `role="alertdialog"` en el modal de confirmación (y en el de
  borrado), con el foco inicial en «Cancelar».

### C2 · Foco en diálogos anidados — S2 · coste S

- **Dónde:** el selector de publicación/media (`src/js/web.js` 614–616,
  `web-picker-dialog` con `aria-modal="true"`) se abre sobre el formulario.
- **Evidencia:** la restauración de foco por modal existe (fases anteriores),
  pero no está probada en dos niveles.
- **Propuesta:** prueba manual de teclado (Tab, Escape, volver) y ajuste si el
  foco vuelve al contenedor en lugar del botón que abrió.

### C3 · Las tablas no se recorren con teclado — S3 · coste M

- **Dónde:** `_filaAnimal` (`src/js/web.js` 411): el nombre va en un `<b>`, no es
  foco ni enlace.
- **Evidencia:** para abrir una ficha hay que tabular hasta los botones de la
  fila; no se puede llegar al nombre.
- **Propuesta:** decidir si el gestor necesita patrón de rejilla o basta con que
  el nombre sea un botón/enlace que abra la publicación.

---

## D. Móvil y tablet restantes

### D1 · Orden visual y de tabulación en formularios a 2 columnas — S2 · coste S

- **Dónde:** formulario de publicación a 768 px (Ciudad/Provincia, Vacunado/
  Desparasitado…), `.form-row`.
- **Evidencia:** dos columnas a partir de 768 px; hay que confirmar que el orden
  del DOM coincide con el visual en cada bloque.
- **Propuesta:** auditar con Tab en 768 y reordenar el marcado si hiciera falta.

### D2 · Filtros y acciones del gestor apilados a 390 — S3 · coste S

- **Evidencia:** buscador, selector de estado y tres botones de acción ocupan casi
  una pantalla antes de la lista.
- **Propuesta:** acciones en un menú y filtros en una fila desplazable.

### D3 · Botones de 36 px en escritorio fino — S3 · coste S

- **Evidencia:** `.btn-sm` mide 36 px a 768/1280 con puntero fino; en táctil sube a
  44 px por la regla `(max-width: 767px), (pointer: coarse)`. No incumple AA
  (mínimo 24 px), pero es pequeño para tablet con ratón.
- **Propuesta:** subir `.btn-sm` a 40 px y revisar la escala completa (36/40/44)
  de una vez.

---

## E. Sistema de diseño y temas

### E1 · No hay tema oscuro — S3 · coste L (decisión primero)

- **Evidencia:** 0 apariciones de `prefers-color-scheme` y de `data-theme`.
- **Propuesta:** decidir si se quiere. Si sí, hay que tokenizar los colores en
  crudo (hay muchos `rgb()` y hex sueltos en `styles.css`) y añadir un selector.

### E2 · `styles.css` con 8.422 líneas y parches por fase — S3 · coste L

- **Evidencia:** reglas del mismo componente repartidas en varios bloques; el
  ajuste de esta semana acabó con dos declaraciones duplicadas del mismo valor
  (se quitaron en `d72c009`).
- **Propuesta:** separar tokens, base, componentes y módulos; borrar duplicados y
  reglas muertas. Hacerlo **después** de la lógica, porque toca todo.

### E3 · Escala de espaciados y radios sin norma escrita — S3 · coste M

- **Evidencia:** en `styles.css` conviven `padding: 10px` (36 usos), `12px` (40),
  `14px` (20) y `16px` (17), y radios de 10 px (38), 12 px (16) y 16 px (4) en
  componentes equivalentes.
- **Propuesta:** fijar una escala corta (4/8/12/16/24) y aplicarla por componente,
  no a ciegas.

---

## F. Rendimiento percibido y feedback

### F1 · Arranque en frío del gestor web tarda unos segundos — S2 · coste S/M

- **Evidencia:** tras borrar caché y service worker, en las pruebas de esta semana
  el módulo Web tardó ~3 s en pintar filas (observación de las esperas, sin
  instrumentación); durante ese rato se ve estructura sin datos.
- **Propuesta:** esqueleto específico de tabla (existe `.page-skeleton`),
  `aria-busy` en el contenedor mientras carga y aviso si pasa de 3 s.

### F2 · Sin control de cambios sin guardar — S3 · coste M

- **Dónde:** el único `beforeunload` del panel es `flushPendingOps`
  (`src/js/dashboard.js` 75), que vacía la cola de operaciones; no vigila
  formularios.
- **Evidencia:** cerrar el modal de publicación con cambios no avisa de nada.
- **Propuesta:** marcar el bloque modificado y confirmar al cerrar con cambios
  pendientes (relacionado con A1).

---

## G. Contenido y microcopy

### G1 · Textos de ayuda con formatos distintos — S3 · coste S

- **Dónde:** `src/js/web.js` 803 (`Heredado: …` bajo los selects) y 749–760
  (grid de datos heredados con «Sin dato» / «—»).
- **Evidencia:** conviven «Heredado: Sí», «Heredado: Sin dato» y valores «—» para
  el mismo concepto de dato ausente.
- **Propuesta:** un único formato para «heredado» y para «vacío», y una línea de
  ayuda como máximo por campo.

### G2 · Avisos de despliegue con tiempos — S3 · coste S

- **Dónde:** `src/js/web.js` 290, 291, 1842 y 1844 («en 2–3 min»).
- **Propuesta:** confirmar el tiempo real y, si varía, quitar el número o enlazar
  al estado del deploy.

---

## H. Deuda de marcado detectada

### H1 · Prefijo `we-` para la lista de media de eventos — S3 · coste S

- **Dónde:** `src/js/web.js` 744 (`web-media-lista`), 1274 (`we-media-lista`),
  1556 (`wg-media-lista`); los pinta `_pintarMediaFormulario(prefijo)` (1154) con
  los prefijos `'web'`, `'we'` y `'wg'` (841, 1338, 1633).
- **Evidencia:** funciona, pero el prefijo del formulario de eventos es `we` donde
  el resto usa `web`/`wg`; invita a errores al buscar el id.
- **Propuesta:** renombrar a `web-media-lista`, `wevento-media-lista` y
  `wgrupo-media-lista` (o un `data-prefijo` único) en una sola pasada.

### H2 · `aria-live` que se reescribe entero — S3 · coste S

- **Dónde:** `_pintarMediaFormulario` (1154) hace `cont.innerHTML = ...` sobre la
  región viva de los tres formularios.
- **Evidencia:** cada cambio reemplaza la lista completa, así que el anuncio
  puede repetir todos los archivos o no oírse, según el lector.
- **Propuesta:** región viva aparte que anuncie solo el cambio («3 archivos
  añadidos», «Portada borrada») y dejar la lista sin `aria-live`.

---

## Lo que queda fuera de este documento

- **Lógica y funcionalidad** (filtros nuevos, acciones en lote, flujos de
  grupos): va antes que todo esto, por decisión del equipo.
- **El port al proyecto `main`**: entrega externa, ver `TRANSFERIR_A_MAIN.md`.
- **Pruebas con lector de pantalla real** (NVDA/VoiceOver): no se han hecho; lo
  comprobado es el árbol de accesibilidad y medidas del DOM. Conviene una pasada
  al cerrar el bloque B.

## Orden sugerido cuando se retome

1. **A1–A2 + B1–B3** (formulario: altura, pie pegajoso, errores asociados).
2. **B4 + C1–C2** (confirmaciones: dos fugas, `alertdialog`, foco anidado).
3. **A3–A7, D1–D3** (tablas, preview, tarjetas y feedback de carga).
4. **E1–E3** (tema y consolidación de CSS), al final porque toca todo.
