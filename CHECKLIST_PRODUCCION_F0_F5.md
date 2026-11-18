# Checklist de verificación en producción — plan F0–F5

> Las fases F0–F5 están **cerradas en código local**. Lo único que falta es validarlas
> sobre el entorno real (el lote `.gs` ya está subido a GAS).
> Contrato: [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md) · Grupos:
> [`F4_GRUPOS_MINIPROPUESTA.md`](F4_GRUPOS_MINIPROPUESTA.md) · Plan:
> [`PLAN_GESTOR_FICHAS_PUBLICACIONES.md`](PLAN_GESTOR_FICHAS_PUBLICACIONES.md) · Estado: [`memory.md`](memory.md).
>
> **Sin secretos:** aquí se usan `<API_URL>` y `<token>`, que se toman del entorno
> (`.env`/config generada). No pegar valores reales en este documento ni en capturas.

## 0. Antes de empezar

- [ ] `npm run build` con el `.env` de producción y la app servida desde el origen real
      (las rutas del front son relativas: `/admin-dashboard/`).
- [ ] Login con un usuario **admin/coordinador** real y con un usuario **sin permisos** para
      comprobar el 403 (los endpoints del gestor exigen token y rol).
- [ ] `GET <API_URL>?endpoint=web-deploy-estado` → responde `version` y el deploy está
      configurado; en el gestor se ve el chip «Deploy automático activo · repo (main)».
- [ ] Columnas aditivas presentes (el backend las crea al vuelo, confirma en el diagnóstico
      del resumen): `WebPublicaciones` → `ficha_json`, `documents_json`, `media_folder_id`,
      `origen_tipo`; `Animales` → `portada_url`, `portada_alt`, `galeria`, `videos`,
      `documentos_internos`.
- [ ] Preparado **contenido de prueba** (un animal con grupo obligatorio, un animal suelto y
      un evento/historia) con slugs que no existan ya en la web pública.
- [ ] Anotar la hora de inicio: cada publicación dispara deploy y la estática tarda **2–4 min**.

## F0 — Contrato 1:1 + grupos

- [ ] `GET ?endpoint=publicaciones` no incluye `borrador` ni `oculto`; sí lo publicado.
- [ ] El listado **no** trae `ficha` (solo detalle, preview y prerender la llevan).
- [ ] Un animal con estado interno `disponible` sale como `en_adopcion`; `en_acogida`,
      `reservado`, `adoptado` y `cerrado` se corresponden con la tabla del contrato.
- [ ] `urgente` llega como bandera `urgent` (nunca como estado) y se pinta en el badge.
- [ ] Con `estado_publico_modo = manual`, el override manda; en `auto`, se deriva del estado
      interno del animal.
- [ ] Un animal `fallecido` no se puede publicar (error legible en el gestor y en el backend).

## F1 — UX y flujos

- [ ] Pestañas **Animales / Grupos / Eventos e historias** con contadores correctos.
- [ ] «Publicar animal» abre el selector solo con animales sin publicación; «Publicar grupo»
      solo con grupos `grupo_obligatorio` sin publicación vigente.
- [ ] Formulario de animal: datos heredados en **solo lectura**, portada heredada visible,
      slug con check y historial, media, presentación (C3) y SEO.
- [ ] Formulario de grupo: miembros en solo lectura con agregados (estado, urgente, salud,
      portada/especie/categoría) y aviso de conflicto si algún miembro tiene publicación
      individual viva.
- [ ] Acciones visibles por estado: publicar / ocultar / retirar / restaurar / eliminar
      borrador, sin ofrecer acciones imposibles (p. ej. publicar una retirada).
- [ ] Responsive real en **360, 768 y 1280**: sin scroll horizontal, tablas en tarjetas,
      botones con diana ≥44 px y menú accesible con teclado.

## F2 — Composición, whitelist y estados

- [ ] `GET ?endpoint=publicacion&slug=<slug>` de un animal: sin IDs internos, sin microchip,
      sin documentos privados, sin datos de la familia; contacto público por defecto.
- [ ] `preview` del gestor y `detalle` público devuelven **el mismo** contenido (mismos
      campos y mismos valores derivados).
- [ ] Cambiar el estado interno del animal (a `adoptado`, por ejemplo) y recargar el canal
      **sin republicar**: el estado público y el bloque agregado se recalculan.
- [ ] Marcar el animal como urgente y comprobar badge y orden en el listado.
- [ ] Ocultar → el slug desaparece del feed; publicar de nuevo → vuelve.
- [ ] Retirar (410) → `status: "gone"`, aparece en `?endpoint=retiradas` y el slug queda
      reservado (no se puede reutilizar en otra publicación). Restaurar → vuelve a `borrador`
      conservando el slug.
- [ ] HTML guardado con `<script>`, `onclick` o `javascript:` sale **limpio** en `contentHtml`.

## F3 — Modelo de datos, persistencia y media

- [ ] Guardar un animal con documentos: van a `documents_json` (no a `media_json`) y **no**
      aparecen en el payload público en ningún nivel.
- [ ] Crear publicación desde animal: se pre-rellenan portada/galería/vídeos de la ficha
      interna y el formulario deja editar sin tocar la ficha salvo que se marque propagar.
- [ ] Propagación **opt-in** apagada por defecto: guardar sin marcar no modifica la ficha del
      animal; al marcarla, reutiliza los mismos `fileId` (no duplica archivos en Drive).
- [ ] Subida de media (`web-media-subir`): la carpeta de la ficha existe una sola vez y el
      archivo aparece con nombre `<tipo>-<original>-<uuid>`.
- [ ] Pegar un enlace de Drive: fichero → se normaliza (thumbnail/vista); enlace de carpeta →
      se rechaza con aviso.
- [ ] Borrar media (`web-media-eliminar`): el archivo va a la papelera y el campo se limpia.
- [ ] Guardar dos veces la misma publicación no duplica filas ni campos (idempotente).

## F4 — Grupos (adopción conjunta)

- [ ] Crear publicación de grupo desde un grupo `grupo_obligatorio` con 2+ miembros: aparece
      en la pestaña **Grupos** con su completitud.
- [ ] Derivación agregada: todos `disponible` → `en_adopcion`; disponible + acogida →
      `en_acogida`; algún `reservado` → `reservado`; todos `adoptado` → `adoptado`;
      mezcla inválida / algún `fallecido` → `cerrado` y **no publicable** (con motivo).
- [ ] `urgent` de grupo = sí si algún miembro es prioritario.
- [ ] **Exclusividad:** con el grupo publicado vigente no se puede publicar una ficha
      individual de un miembro; si ya existía, el gestor avisa y la resuelve al activar el grupo.
- [ ] Detalle y estática del grupo muestran el bloque de miembros (nombres y datos públicos,
      sin IDs ni documentos) y el enlace «Quiero adoptar» correcto.
- [ ] Ciclo completo del grupo: publicar → aparece en feed/sitemap/estática con canónica
      `publicaciones/<slug>.html`; ocultar → sale; retirar → 410 + lápida; restaurar →
      `borrador` con el mismo slug.
- [ ] Una sola publicación por grupo (no se puede crear una segunda).

## F5 — Endurecimiento y QA final

- [ ] `sitemap.xml` incluye solo fichas indexables y **no** las lápidas ni las redirecciones.
- [ ] `robots.txt` apunta al sitemap y permite `/publico.html` y `/publicaciones/`.
- [ ] `publicaciones/index.json` lista los slugs generados; el visor no declara canónica a una
      estática que aún no existe (espera el deploy, 2–4 min).
- [ ] Redirección 301 de un slug histórico: página de paso `noindex,follow` con canónica al
      destino y `Location` 301 en el canal.
- [ ] SEO de una ficha: `title`, `description`, `canonical` **único**, OG/Twitter, un solo
      bloque JSON-LD válido y `mainEntityOfPage` = canónica.
- [ ] Compartir: en el visor y en la estática, «Compartir» copia la URL canónica y muestra
      «Enlace copiado»; en el gestor, «Copiar enlace» solo en publicadas con slug.
- [ ] Lector de pantalla (NVDA o VoiceOver): el aviso se anuncia sin mover el foco; con el
      aviso vacío no queda hueco entre los botones.
- [ ] Regresión 1:1 y grupos a 360/768/1280 sobre el entorno real, incluido el visor público y
      una página estática.
- [ ] Sin errores nuevos en consola ni en la pestaña de red (404 de imágenes o `index.json`
      antes del primer deploy pueden ser esperados; anotarlos).

## Móvil y tablet — toda la gestión, no solo mirarla

El gestor es una PWA: no hay ninguna función que exija escritorio. Repetir estas
comprobaciones en **tablet (768–1024, vertical y horizontal)** y en **móvil
(360–430)** con las acciones reales, al menos una vez por cada fase de arriba.

- [ ] Navegación completa: menú lateral / «Más» y barra inferior llegan a todas
      las páginas del rol, marcan la activa y no dejan nada inalcanzable por falta
      de sitio en la barra.
- [ ] Login y cierre de sesión tecleando en el móvil; al enfocar un campo el
      teclado no lo tapa (formularios con scroll suficiente).
- [ ] Animales: abrir ficha, editar y guardar; el formulario largo se recorre sin
      saltos, `details` desplegables incluidos.
- [ ] Publicaciones: crear / editar / preview / publicar / ocultar / retirar /
      restaurar / eliminar desde las tarjetas de fila, sin scroll horizontal.
- [ ] Grupos: crear, editar (miembros en solo lectura), preview, publicar y
      retirar desde el dispositivo.
- [ ] Media: subir portada y galería desde cámara o galería del dispositivo, ver
      el chip del archivo y borrarlo con «×».
- [ ] Selector «Publicar animal» / «Publicar grupo»: buscar, seleccionar y crear
      con el teclado abierto, sin quedarse sin ver la lista.
- [ ] Snackbar: se lee entero, aparece **por encima de la barra inferior** (con
      *safe area*), no tapa acciones y se anuncia al lector de pantalla.
- [ ] Modales, preview y confirmaciones: cabecera y botones alcanzables con el
      pulgar, cierre visible y foco de vuelta al botón que los abrió.
- [ ] Tablas convertidas en tarjetas: no se pierde ningún dato (estado, slug,
      completitud, acciones) ni aparece scroll lateral.
- [ ] Zonas táctiles ≥44 px en pestañas, menú y acciones principales; las acciones
      secundarias de fila (`.btn-sm`, ~36–40 px) cumplen al menos el mínimo AA de
      24 px y no se solapan entre sí.
- [ ] Girar el dispositivo en mitad de un formulario no pierde lo escrito.

## Cierre

- [ ] Limpieza del contenido de prueba (retirar u ocultar y eliminar borradores) y volver a
      desplegar para que no queden lápidas de prueba.
- [ ] Anotar en `memory.md` el resultado y, si algo falla, abrir incidencia con: endpoint,
      payload (sin datos personales), hora y slug.

| Fecha | Entorno | Fases | Resultado | Notas |
|---|---|---|---|---|
|  | producción |  |  |  |
