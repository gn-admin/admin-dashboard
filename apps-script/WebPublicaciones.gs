/**
 * GESTOR WEB · capa de publicaciones
 * ---------------------------------------------------------------------------
 * Una sola hoja (`CONFIG.sheets.webPublicaciones`) guarda la capa pública:
 * los animales se referencian por `origen_id` (fila de `Animales`) y los
 * eventos/historias viven aquí como contenido propio.
 *
 * Un único compositor (`webConstruirPublicacion`) genera el payload
 * `Publicacion` y se reutiliza en la previsualización del gestor y en el
 * canal público, para que preview === feed (riesgo de inconsistencia, §9).
 *
 * Tipos: animal | evento | historia
 * Estados de publicación: borrador | publicado | oculto
 */

var WEB_TIPOS = ['animal', 'animal_grupo', 'evento', 'historia'];
var WEB_ESTADOS = ['borrador', 'publicado', 'oculto', 'retirado'];
// Vocabulario público de estado del animal (D1). `urgente` no es un estado:
// viaja como bandera booleana (`urgent`) y se pinta como badge/orden.
var WEB_ESTADOS_PUBLICOS = ['en_adopcion', 'en_acogida', 'reservado', 'adoptado', 'cerrado'];
var WEB_ESTADO_PUBLICO_POR_INTERNO = {
  disponible: 'en_adopcion',
  en_acogida: 'en_acogida',
  en_adopcion: 'reservado',
  reservado: 'reservado',
  adoptado: 'adoptado',
  fallecido: 'cerrado'
};
var WEB_PAGE_SIZE_DEF = 12;
var WEB_PAGE_SIZE_MAX = 50;      // canal publico
var WEB_ADMIN_PAGE_SIZE_MAX = 500; // listado del gestor (admin)

// Ficha configurable (C3): valores cerrados y límite de celda de Sheets.
var WEB_FICHA_PLANTILLAS = ['ficha', 'historia'];
var WEB_FICHA_BLOQUES = ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta'];
var WEB_FICHA_ORDEN_DEF = ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta'];
var WEB_FICHA_VIDEO_MODOS = ['enlace', 'embed'];
var WEB_FICHA_CTA_KINDS = ['adopcion', 'acogida', 'contacto', 'url'];
var WEB_FICHA_MAX_CHARS = 45000;

// ==================== HELPERS BÁSICOS ====================

function webSinAcentos(valor) {
  var mapa = {
    'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
    'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
    'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
    'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o',
    'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
    'ñ': 'n', 'ç': 'c'
  };
  return String(valor == null ? '' : valor)
    .toLowerCase()
    .replace(/[áàäâãåéèëêíìïîóòöôõúùüûñç]/g, function (c) { return mapa[c] || c; });
}

/** Minúsculas, sin acentos, separado por guiones, máximo 80 caracteres. */
function webNormalizarSlug(valor) {
  var s = webSinAcentos(valor).trim();
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/g, '');
  return s;
}

function webSlugValido(slug) {
  return !!slug && slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function webBool(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto !== false;
  if (typeof valor === 'boolean') return valor;
  var s = String(valor).toLowerCase().trim();
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  if (s === 'true' || s === '1' || s === 'si' || s === 'yes') return true;
  return !!valor;
}

function webParseJson(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  if (typeof valor === 'object') return valor;
  try {
    var o = JSON.parse(String(valor));
    return (o === undefined || o === null) ? porDefecto : o;
  } catch (e) { return porDefecto; }
}

function webArray(valor) {
  if (Array.isArray(valor)) return valor;
  if (valor === undefined || valor === null || valor === '') return [];
  if (typeof valor === 'string') {
    return valor.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
  }
  return [];
}

function webTexto(valor) {
  return String(valor == null ? '' : valor).trim();
}

/** Estado público derivado del estado interno del animal (D1). */
function webEstadoPublicoDerivado(estadoInterno) {
  var e = webTexto(estadoInterno).toLowerCase();
  return WEB_ESTADO_PUBLICO_POR_INTERNO[e] || '';
}

/** Derivado según origen: animal individual o grupo (agregado, G-D3). */
function webEstadoPublicoDerivadoOrigen(publicacion, origen) {
  var p = publicacion || {};
  if (p.tipo === 'animal_grupo' || (origen && Array.isArray(origen.miembros))) {
    return webEstadoGrupoDerivado((origen && origen.miembros) || []);
  }
  return webEstadoPublicoDerivado(origen && origen.estado);
}

/**
 * Modo del estado público: `auto` (manda el origen) o `manual` (override explícito).
 * Compatibilidad filas antiguas: auto si vacío/`urgente`/coincide con derivado.
 * Sin origen derivable (evento/historia) es manual.
 */
function webModoEstadoPublico(publicacion, origen) {
  var p = publicacion || {};
  var modo = webTexto(p.estado_publico_modo).toLowerCase();
  if (modo === 'auto' || modo === 'manual') {
    if (modo === 'manual' && WEB_ESTADOS_PUBLICOS.indexOf(webTexto(p.estado_publico)) === -1) return 'auto';
    return modo;
  }
  if (!origen || (p.tipo !== 'animal' && p.tipo !== 'animal_grupo')) return 'manual';
  var guardado = webTexto(p.estado_publico);
  var derivado = webEstadoPublicoDerivadoOrigen(p, origen);
  if (!guardado || guardado === 'urgente' || guardado === derivado) return 'auto';
  return 'manual';
}

/** Estado público efectivo: override manual válido > derivado del origen. */
function webEstadoPublicoEfectivo(publicacion, origen) {
  var p = publicacion || {};
  var guardado = webTexto(p.estado_publico);
  if (!origen || (p.tipo !== 'animal' && p.tipo !== 'animal_grupo')) return guardado;
  if (webModoEstadoPublico(p, origen) === 'manual' && WEB_ESTADOS_PUBLICOS.indexOf(guardado) !== -1) return guardado;
  return webEstadoPublicoDerivadoOrigen(p, origen);
}

/** `urgente` es solo una bandera y solo si el animal sigue necesitando hogar. */
function webAnimalUrgente(origen) {
  if (!origen || !webBool(origen.urgente, false)) return false;
  var estado = webTexto(origen.estado).toLowerCase();
  return estado === 'disponible' || estado === 'en_acogida';
}

function webUrgenteEfectivo(publicacion, origen) {
  var p = publicacion || {};
  if (p.tipo === 'animal_grupo' || (origen && Array.isArray(origen.miembros))) {
    return webGrupoUrgente((origen && origen.miembros) || []);
  }
  return webAnimalUrgente(origen);
}


/** Copia solo las claves permitidas de un objeto plano (whitelist pública). */
function webObjetoCampos(obj, campos) {
  var out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  (campos || []).forEach(function (k) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  });
  return out;
}

/** Lista de textos acotada: sin objetos colados desde la hoja o el cliente. */
function webListaTextos(valor, max, longitud) {
  return webArray(valor).map(function (x) {
    return webTexto(x).slice(0, longitud || 80);
  }).filter(function (x) { return !!x; }).slice(0, max || 30);
}

function webIsoFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    try { return valor.toISOString(); } catch (e) { return ''; }
  }
  var s = String(valor).trim();
  if (!s) return '';
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    try { return d.toISOString(); } catch (e2) { return s; }
  }
  return s;
}

function webFechaLegible(valor) {
  if (!valor) return '';
  var d = new Date(String(valor));
  if (isNaN(d.getTime())) return String(valor);
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
}

/** Tiempo de lectura aproximado (200 palabras/minuto) sin etiquetas HTML. */
function webTiempoLectura(html) {
  var texto = String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!texto) return 1;
  return Math.max(1, Math.round(texto.split(' ').length / 200));
}

function webAhora() {
  try { return new Date().toISOString(); } catch (e) { return ''; }
}

// ==================== SANEADO DE HTML (C3) ====================
// El gestor admite HTML en `contenido_html`. Se sanea con lista blanca al
// construir el payload público (detalle, listados y prerender): lo guardado no
// se toca (reversible) y lo publicado nunca lleva scripts, estilos, formularios
// ni atributos de evento.
var WEB_HTML_ETIQUETAS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'figure', 'figcaption', 'img', 'hr', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub'];
var WEB_HTML_VACIAS = ['br', 'hr', 'img'];
var WEB_HTML_ATRIBUTOS = { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] };
// Solo las que arrastran contenido peligroso: el resto de etiquetas no
// permitidas se descarta igualmente en el paso de la lista blanca.
var WEB_HTML_PROHIBIDAS = 'script|style|iframe|object|embed|applet|svg|math|form|noscript|template|textarea';

/** `true` si la URL se puede usar como `href`/`src` (relativa, http(s), mailto o tel). */
function webUrlSegura(valor) {
  var u = String(valor === undefined || valor === null ? '' : valor).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!u) return '';
  if (u.indexOf('&#') !== -1) return ''; // entidades numéricas: `&#106;avascript:`
  var esquema = u.match(/^([a-z][a-z0-9+.\-]*):/i);
  if (esquema) return /^(https?|mailto|tel)$/i.test(esquema[1]) ? u : '';
  return u;
}

/** Copia un objeto plano sin arrastrar prototipos (filas de Sheets). */
function webClonarPlano(obj) {
  var copia = {};
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) copia[k] = obj[k];
  return copia;
}

/** Galería con URL segura y solo las claves públicas de cada imagen. */
function webGaleriaSegura(lista) {
  var out = [];
  (Array.isArray(lista) ? lista : []).forEach(function (g, idx) {
    if (typeof g === 'string') {
      var directa = webUrlSegura(g);
      if (directa) out.push({ src: directa, alt: '', caption: '', order: idx });
      return;
    }
    if (!g || typeof g !== 'object') return;
    var src = webUrlSegura(g.src || g.url);
    if (!src) return;
    var pedido = Number(g.order);
    out.push({
      src: src,
      alt: webTexto(g.alt).slice(0, 160),
      caption: webTexto(g.caption || g.pie).slice(0, 240),
      order: (g.order !== undefined && g.order !== null && g.order !== '' && !isNaN(pedido)) ? pedido : idx
    });
  });
  return out;
}

/** Vídeos con URL segura y solo las claves públicas de cada vídeo. */
function webVideosSeguros(lista) {
  var out = [];
  (Array.isArray(lista) ? lista : []).forEach(function (v) {
    if (!v || typeof v !== 'object') return;
    var url = webUrlSegura(v.url);
    if (!url) return;
    out.push({
      title: webTexto(v.title || v.titulo).slice(0, 120),
      url: url,
      provider: webTexto(v.provider).slice(0, 40),
      note: webTexto(v.note || v.nota).slice(0, 240)
    });
  });
  return out;
}

/** Iconos públicos: `icon`, `label`, `value`; nada más sale al payload. */
function webIconosSeguros(lista) {
  var out = [];
  (Array.isArray(lista) ? lista : []).forEach(function (i) {
    if (!i || typeof i !== 'object') return;
    var icon = webTexto(i.icon).slice(0, 40);
    var label = webTexto(i.label).slice(0, 80);
    var value = webTexto(i.value).slice(0, 120);
    if (icon || label || value) out.push({ icon: icon, label: label, value: value });
  });
  return out.slice(0, 30);
}

/** Etiquetas públicas acotadas y sin duplicados. */
function webTagsSeguras(tags) {
  var out = [];
  (Array.isArray(tags) ? tags : []).forEach(function (t) {
    var v = webTexto(t).slice(0, 40);
    if (v && out.indexOf(v) === -1) out.push(v);
  });
  return out.slice(0, 20);
}

/** Ficha configurable con galería, vídeos y CTA saneados (sin tocar el resto). */
function webFichaSegura(ficha) {
  if (!ficha || typeof ficha !== 'object') return ficha;
  // Normaliza al vuelo las fichas antiguas (orden/videoModo/tags/bloques) y
  // conserva claves desconocidas por si el contrato crece.
  var normalizada = webNormalizarFicha(ficha) || ficha;
  var copia = webClonarPlano(normalizada);
  if (typeof ficha === 'object' && !Array.isArray(ficha)) {
    Object.keys(ficha).forEach(function (k) {
      if (!(k in copia)) copia[k] = webClonarPlano(ficha[k]);
    });
  }
  if (Array.isArray(copia.gallery)) copia.gallery = webGaleriaSegura(copia.gallery);
  if (Array.isArray(copia.videos)) copia.videos = webVideosSeguros(copia.videos);
  if (copia.cta && typeof copia.cta === 'object') {
    var url = webUrlSegura(copia.cta.url);
    if (!url) delete copia.cta;
    else { copia.cta = webClonarPlano(copia.cta); copia.cta.url = url; }
  }
  return copia;
}

function webEscaparAtributo(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Atributos permitidos de una etiqueta, ya filtrados y escapados. */
function webHtmlAtributos(tag, resto) {
  var permitidos = WEB_HTML_ATRIBUTOS[tag];
  if (!permitidos) return '';
  var salida = [];
  var re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  var m;
  while ((m = re.exec(resto)) !== null) {
    var nombre = String(m[1]).toLowerCase();
    if (permitidos.indexOf(nombre) === -1) continue;
    var valor = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
    if (valor === undefined) continue;
    if (nombre === 'href' || nombre === 'src') {
      valor = webUrlSegura(valor);
      if (!valor) continue;
    }
    if (nombre === 'width' || nombre === 'height' || nombre === 'colspan' || nombre === 'rowspan') {
      if (!/^\d{1,4}$/.test(String(valor).trim())) continue;
    }
    salida.push(nombre + '="' + webEscaparAtributo(valor) + '"');
  }
  return salida.length ? ' ' + salida.join(' ') : '';
}

/**
 * Saneado de HTML con lista blanca: conserva solo etiquetas y atributos
 * conocidos y descarta el resto (la etiqueta se quita, su texto se queda).
 * Es idempotente: sanear dos veces da el mismo resultado.
 */
function webSanearHtml(html) {
  var s = String(html === undefined || html === null ? '' : html);
  if (!s) return '';

  // 1. Bloques peligrosos con su contenido (script, style, iframe, svg...).
  var bloque = new RegExp('<(' + WEB_HTML_PROHIBIDAS + ')\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>', 'gi');
  var antes;
  do { antes = s; s = s.replace(bloque, ''); } while (s !== antes);

  // 2. Comentarios y etiquetas sueltas de la lista prohibida.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(new RegExp('<\\/?(?:' + WEB_HTML_PROHIBIDAS + ')\\b[^>]*>', 'gi'), '');

  // 3. Etiquetas permitidas (sin atributos de evento) y resto descartado.
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, function (todo, cierre, nombre, resto) {
    var tag = String(nombre).toLowerCase();
    if (WEB_HTML_ETIQUETAS.indexOf(tag) === -1) return '';
    if (cierre) return WEB_HTML_VACIAS.indexOf(tag) === -1 ? '</' + tag + '>' : '';
    return '<' + tag + webHtmlAtributos(tag, resto) + '>';
  });

  // 4. Un `<` que no abre etiqueta se escapa para que no arrastre el texto.
  return s.replace(/<(?![a-zA-Z\/])/g, '&lt;');
}

function webUuid() {
  try { return Utilities.getUuid(); } catch (e) { return 'web_' + new Date().getTime(); }
}

// ==================== ORIGEN / HOJA ====================

/** Config tal cual viene de CONFIG (sin comprobar la hoja). */
function webConfigWeb() {
  var cfg = (typeof CONFIG !== 'undefined' && CONFIG.sheets) ? CONFIG.sheets.webPublicaciones : null;
  if (!cfg || !cfg.sheetId || String(cfg.sheetId).indexOf('REEMPLAZAR_') === 0) return null;
  return cfg;
}

/**
 * ¿Existe la hoja configurada? Se exige el nombre, salvo que el documento tenga
 * una única pestaña ("Hoja 1"): ahí no hay ambigüedad y se acepta, igual que
 * getSheet(). Con dos o más pestañas nunca se adivina.
 */
function webHojaExiste(cfg) {
  if (!cfg || !cfg.sheetId || !cfg.sheetName) return false;
  try {
    var ss = SpreadsheetApp.openById(cfg.sheetId);
    return !!ss.getSheetByName(cfg.sheetName) || ss.getSheets().length === 1;
  } catch (e) {
    return false;
  }
}

/** Config operativa: null si falta el ID o si la pestaña no existe. */
function webSheetConfig() {
  var cfg = webConfigWeb();
  if (!cfg) return null;
  return webHojaExiste(cfg) ? cfg : null;
}

/**
 * Aviso que distingue "hoja sin configurar" de "sin publicaciones".
 * `null` = canal listo (puede estar simplemente vacío).
 */
function webDiagnostico() {
  if (!webConfigWeb()) {
    return {
      status: 'warning',
      code: 'sheet_missing',
      error: 'Hoja WebPublicaciones sin configurar: crea la hoja y rellena SHEET_WEB_PUBLICACIONES_ID'
    };
  }
  if (!webConfigWeb().sheetName) {
    return {
      status: 'warning',
      code: 'sheet_missing',
      error: 'Hoja WebPublicaciones sin configurar: falta el nombre de la hoja (sheetName)'
    };
  }
  if (!webSheetConfig()) {
    var cfg = webConfigWeb();
    return {
      status: 'warning',
      code: 'sheet_not_found',
      error: 'Hoja WebPublicaciones sin configurar: no existe la pestaña "' + (cfg.sheetName || 'WebPublicaciones') + '" o no se puede abrir el spreadsheet. Renombra la pestaña con ese nombre exacto'
    };
  }
  return null;
}

function webFilasWeb() {
  var cfg = webSheetConfig();
  if (!cfg) return [];
  return readSheet(cfg).map(webFilaAPublicacion);
}

function webFilaAPublicacion(fila) {
  var f = fila || {};
  var media = webParseJson(f.media_json, {});
  if (media && typeof media === 'object' && !Array.isArray(media)) {
    var docsCol = webParseJson(f.documents_json, null);
    if ((!media.documents || !media.documents.length) && Array.isArray(docsCol)) media.documents = docsCol;
  }
  return {
    _row: f._row,
    id: webTexto(f.id),
    tipo: webTexto(f.tipo) || 'animal',
    origen_tipo: webTexto(f.origen_tipo) || (webTexto(f.tipo) === 'animal_grupo' ? 'grupo' : ''),
    origen_id: webTexto(f.origen_id),
    slug: webNormalizarSlug(f.slug),
    estado_publicacion: WEB_ESTADOS.indexOf(webTexto(f.estado_publicacion)) !== -1 ? webTexto(f.estado_publicacion) : 'borrador',
    indexable: webBool(f.indexable, true),
    listed: webBool(f.listed, true),
    featured: webBool(f.featured, false),
    orden: Number(f.orden || 0) || 0,
    titulo: webTexto(f.titulo),
    extracto: webTexto(f.extracto),
    contenido_html: String(f.contenido_html || ''),
    categoria: webTexto(f.categoria),
    estado_publico: webTexto(f.estado_publico),
    estado_publico_modo: webTexto(f.estado_publico_modo).toLowerCase(),
    especie: webTexto(f.especie),
    autor: webTexto(f.autor),
    tags: webArray(webParseJson(f.tags_json, [])),
    media: media || {},
    media_folder_id: webTexto(f.media_folder_id),
    seo: webParseJson(f.seo_json, {}),
    cta: webParseJson(f.cta_json, null),
    animal: webParseJson(f.animal_json, null),
    evento: webParseJson(f.evento_json, null),
    ficha: webParseJson(f.ficha_json, null),
    publicado_en: webIsoFecha(f.publicado_en),
    actualizado_en: webIsoFecha(f.actualizado_en),
    creado_en: webIsoFecha(f.creado_en),
    slug_historial: webHistorial(f.slug_historial)
  };
}

/** Historial de slugs: acepta [{slug,fecha}] o ['slug'] y normaliza. */
function webHistorial(valor) {
  var arr = webParseJson(valor, []);
  if (!Array.isArray(arr)) return [];
  return arr.map(function (x) {
    if (typeof x === 'string') return { slug: webNormalizarSlug(x), fecha: '' };
    return { slug: webNormalizarSlug(x && x.slug), fecha: (x && x.fecha) ? webIsoFecha(x.fecha) : '' };
  }).filter(function (x) { return !!x.slug; });
}

/**
 * Historial al cambiar de slug: conserva los anteriores (para redirigir) y
 * elimina el actual. Si el slug vuelve a uno antiguo, deja de ser historico.
 */
function webHistorialDeCambio(previa, slugNuevo) {
  var hist = (previa && Array.isArray(previa.slug_historial)) ? previa.slug_historial.slice() : [];
  if (previa && previa.slug && previa.slug !== slugNuevo) {
    var existe = false;
    for (var i = 0; i < hist.length; i++) if (hist[i].slug === previa.slug) { existe = true; break; }
    if (!existe) hist.push({ slug: previa.slug, fecha: webAhora() });
  }
  return hist.filter(function (h) { return h.slug && h.slug !== slugNuevo; });
}

/** ¿El slug pedido es el actual de la publicación o uno de su historial? */
function webSlugCoincide(pub, slug) {
  if (!pub) return false;
  if (pub.slug === slug) return true;
  var hist = pub.slug_historial || [];
  for (var i = 0; i < hist.length; i++) if (hist[i].slug === slug) return true;
  return false;
}

/** Booleano estricto de la ficha: solo `true`/`false` (mismas reglas que el gestor). */
function webFichaBool(valor, porDefecto) {
  if (valor === true || valor === false) return valor;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  return porDefecto;
}

/**
 * Orden de bloques: solo claves conocidas, sin duplicados y completo (añade
 * los bloques que falten en el orden por defecto).
 */
function webFichaOrden(orden) {
  var out = [];
  (Array.isArray(orden) ? orden : []).forEach(function (item) {
    var k = webTexto(item).slice(0, 30);
    if (WEB_FICHA_BLOQUES.indexOf(k) === -1) return;
    if (out.indexOf(k) !== -1) return;
    out.push(k);
  });
  WEB_FICHA_ORDEN_DEF.forEach(function (k) { if (out.indexOf(k) === -1) out.push(k); });
  return out;
}

/** Etiquetas propias de la ficha: máximo 20, 40 caracteres y sin duplicados. */
function webFichaTags(tags) {
  var out = [];
  var src = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',') : []);
  for (var i = 0; i < src.length && out.length < 20; i++) {
    var v = webTexto(src[i]).slice(0, 40);
    if (!v || out.indexOf(v) !== -1) continue;
    out.push(v);
  }
  return out;
}

/**
 * Ficha configurable (C3): normaliza el objeto `ficha` con las mismas reglas
 * que `src/js/ficha-config.js` (valores cerrados, listas y longitudes acotadas).
 * Devuelve `null` cuando no hay ficha o el valor no es un objeto.
 */
function webNormalizarFicha(valor) {
  var f = (valor && typeof valor === 'object' && !Array.isArray(valor)) ? valor : webParseJson(valor, null);
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;

  var plantilla = webTexto(f.plantilla).toLowerCase();
  var bloquesIn = (f.bloques && typeof f.bloques === 'object' && !Array.isArray(f.bloques)) ? f.bloques : {};
  var bloques = {};
  WEB_FICHA_BLOQUES.forEach(function (k) { bloques[k] = webFichaBool(bloquesIn[k], true); });
  var videoModo = webTexto(f.videoModo).toLowerCase();

  var out = {
    plantilla: WEB_FICHA_PLANTILLAS.indexOf(plantilla) !== -1 ? plantilla : 'ficha',
    bloques: bloques,
    orden: webFichaOrden(f.orden),
    videoModo: WEB_FICHA_VIDEO_MODOS.indexOf(videoModo) !== -1 ? videoModo : 'enlace',
    mostrarLectura: webFichaBool(f.mostrarLectura, true)
  };

  if (Array.isArray(f.icons)) {
    out.icons = f.icons.map(function (i) {
      if (!i || typeof i !== 'object') return null;
      var icon = webTexto(i.icon).slice(0, 40);
      var label = webTexto(i.label).slice(0, 80);
      var value = webTexto(i.value).slice(0, 120);
      return (icon || label || value) ? { icon: icon, label: label, value: value } : null;
    }).filter(function (x) { return !!x; }).slice(0, 30);
  }
  if (Array.isArray(f.gallery)) {
    out.gallery = f.gallery.map(function (g, idx) {
      if (!g) return null;
      var src = webTexto(typeof g === 'string' ? g : (g.src || g.url)).slice(0, 500);
      if (!src) return null;
      var pedido = Number(g.order);
      return {
        src: src,
        alt: webTexto(g.alt).slice(0, 160),
        caption: webTexto(g.caption || g.pie).slice(0, 240),
        order: (g.order !== undefined && g.order !== null && g.order !== '' && !isNaN(pedido)) ? pedido : idx
      };
    }).filter(function (x) { return !!x; }).slice(0, 30);
  }
  if (Array.isArray(f.videos)) {
    out.videos = f.videos.map(function (v) {
      if (!v || typeof v !== 'object') return null;
      var url = webTexto(v.url).slice(0, 500);
      if (!url) return null;
      return {
        title: webTexto(v.title || v.titulo).slice(0, 120),
        url: url,
        provider: webTexto(v.provider).slice(0, 40),
        note: webTexto(v.note || v.nota).slice(0, 240)
      };
    }).filter(function (x) { return !!x; }).slice(0, 10);
  }
  if (f.tags !== undefined && f.tags !== null) out.tags = webFichaTags(f.tags);
  if (f.cta && typeof f.cta === 'object' && !Array.isArray(f.cta)) {
    var label = webTexto(f.cta.label || f.cta.texto).slice(0, 80);
    var urlCta = webTexto(f.cta.url).slice(0, 500);
    var kind = webTexto(f.cta.kind).toLowerCase();
    if (WEB_FICHA_CTA_KINDS.indexOf(kind) === -1) kind = (urlCta || label) ? 'url' : '';
    if (label || urlCta || kind) out.cta = { label: label, url: urlCta, kind: kind || 'url' };
  }

  return out;
}

function webMapaAnimales() {
  var mapa = {};
  var cfg = CONFIG.sheets && CONFIG.sheets.animales;
  if (!cfg) return mapa;
  readSheet(cfg).forEach(function (a) {
    if (a && a.id !== undefined && a.id !== null) mapa[String(a.id)] = a;
  });
  return mapa;
}

/** Foto del animal como cover por defecto (misma normalización que el panel). */
function webFotoOrigen(animal) {
  if (!animal) return '';
  // D4: portada interna propia si existe; si no, foto heredada histórica.
  var directa = webTexto(animal.portada_url || animal.foto_url || animal.foto);
  if (directa) {
    var m = directa.match(/\/d\/([A-Za-z0-9_-]{10,})/) || directa.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    return directa;
  }
  var fileId = webTexto(animal.foto_drive_id);
  if (fileId) return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200';
  return '';
}

// ==================== GRUPOS / CAMADAS (adopción conjunta, G1) ====================

function webMapaGrupos() {
  var grupos = {};
  readSheet(CONFIG.sheets.animales).forEach(function (a) {
    if (!a || a.id === undefined || a.id === null) return;
    var gid = webTexto(a.grupo_id || a.grupo);
    if (!gid) return;
    var key = String(gid);
    if (!grupos[key]) {
      grupos[key] = {
        id: key,
        nombre: webTexto(a.grupo) || key,
        grupo_obligatorio: webBool(a.grupo_obligatorio, false),
        miembros: []
      };
    }
    if (!grupos[key].grupo_obligatorio && webBool(a.grupo_obligatorio, false)) grupos[key].grupo_obligatorio = true;
    if (webTexto(a.grupo)) grupos[key].nombre = webTexto(a.grupo);
    grupos[key].miembros.push(a);
  });
  return grupos;
}

function webMiembrosDeGrupo(grupoId, mapaAnimales) {
  var gid = String(grupoId || '');
  if (!gid) return [];
  var out = [];
  var src = mapaAnimales ? Object.keys(mapaAnimales).map(function (k) { return mapaAnimales[k]; }) : readSheet(CONFIG.sheets.animales);
  src.forEach(function (a) {
    if (!a) return;
    var ag = webTexto(a.grupo_id || a.grupo);
    if (ag && String(ag) === gid) out.push(a);
  });
  return out;
}

function webGrupoInfo(grupoId) {
  var g = webMapaGrupos()[String(grupoId)];
  return g || null;
}

/**
 * Publicación de grupo vigente (estado `publicado`) a la que pertenece un
 * animal, si la hay. Es la mitad que faltaba de la exclusividad 1:1:
 * `webUpsertGrupo` y `webEstadoGrupoPub` ya impiden activar el grupo mientras
 * un miembro tenga publicación individual publicada; esto impide publicar el
 * individuo cuando el grupo manda, y da el aviso con nombre y slug.
 */
function webGrupoVigenteDeAnimal(animal, filas) {
  var a = animal || null;
  var gid = a ? webTexto(a.grupo_id || a.grupo) : '';
  if (!gid) return null;
  var pubs = Array.isArray(filas) ? filas : webFilasWeb();
  for (var i = 0; i < pubs.length; i++) {
    var p = pubs[i];
    if (!p || p.tipo !== 'animal_grupo') continue;
    if (String(p.origen_id) !== String(gid)) continue;
    if (p.estado_publicacion !== 'publicado') continue;
    var g = webGrupoInfo(gid);
    return {
      grupo_id: String(gid),
      nombre: webTexto(g && g.nombre) || webTexto(a.grupo) || String(gid),
      publicacion_id: p.id,
      slug: p.slug
    };
  }
  return null;
}

/**
 * Grupo del animal con el estado de su publicación web, para la ficha interna
 * (H-3). Sin grupo devuelve `null`.
 */
function webGrupoResumenDeAnimal(animal) {
  var a = animal || null;
  var gid = a ? webTexto(a.grupo_id || a.grupo) : '';
  if (!gid) return null;
  var g = webGrupoInfo(gid);
  var pub = webPublicacionDeOrigen('animal_grupo', gid);
  return {
    id: String(gid),
    nombre: webTexto(g && g.nombre) || webTexto(a.grupo) || String(gid),
    estado_publicacion: (pub && pub.estado_publicacion) || 'sin_publicar'
  };
}

/** Mensaje único del conflicto de exclusividad, con la salida posible. */
function webErrorExclusividadGrupo(conf) {
  return 'No se puede publicar la ficha individual: el animal forma parte del grupo \u00ab' + conf.nombre
    + '\u00bb, que ya tiene publicación publicada' + (conf.slug ? ' (' + conf.slug + ')' : '')
    + '. Oculta o retira la publicación del grupo para publicarlo por separado.';
}

function webEstadoGrupoDerivado(miembros) {
  var ms = Array.isArray(miembros) ? miembros : [];
  if (!ms.length) return 'cerrado';
  var estados = ms.map(function (a) { return webTexto(a.estado).toLowerCase(); });
  var algunoFallecido = estados.some(function (e) { return e === 'fallecido'; });
  var algunoAdoptado = estados.some(function (e) { return e === 'adoptado'; });
  var todosAdoptado = estados.every(function (e) { return e === 'adoptado'; });
  var algunoReservado = estados.some(function (e) { return e === 'en_adopcion' || e === 'reservado'; });
  var todosAcogidaODisp = estados.every(function (e) { return e === 'disponible' || e === 'en_acogida'; });
  var todosAcogida = estados.every(function (e) { return e === 'en_acogida'; });
  var todosDisponible = estados.every(function (e) { return e === 'disponible'; });

  if (algunoFallecido) return 'cerrado';
  if (algunoAdoptado && !todosAdoptado) return 'cerrado'; // adopción parcial: conjunto inválido
  if (todosAdoptado) return 'adoptado';
  if (algunoReservado) return 'reservado';
  if (todosAcogida) return 'en_acogida';
  if (todosDisponible) return 'en_adopcion';
  if (todosAcogidaODisp) return 'en_acogida';
  return 'cerrado';
}

function webGrupoValidoParaPublicar(miembros) {
  var ms = Array.isArray(miembros) ? miembros : [];
  if (!ms.length) return false;
  var der = webEstadoGrupoDerivado(ms);
  if (der === 'cerrado') {
    // cerrado derivado por fallecido/parcial/vacío/inconsistente => no publicable
    return false;
  }
  return true;
}

function webGrupoUrgente(miembros) {
  var ms = Array.isArray(miembros) ? miembros : [];
  for (var i = 0; i < ms.length; i++) {
    if (webAnimalUrgente(ms[i])) return true;
  }
  return false;
}

function webPortadaGrupo(miembros) {
  var ms = Array.isArray(miembros) ? miembros : [];
  for (var i = 0; i < ms.length; i++) {
    var f = webFotoOrigen(ms[i]);
    if (f) return f;
  }
  return '';
}

function webMiembrosResumen(miembros) {
  return (Array.isArray(miembros) ? miembros : []).map(function (a) {
    return {
      nombre: webTexto(a.nombre),
      especie: webTexto(a.especie),
      raza: webTexto(a.raza),
      sexo: webTexto(a.sexo),
      edad: webTexto(a.edad),
      size: webTexto(a.tamano || a['tamano'] || ''),
      foto: webUrlSegura(webFotoOrigen(a)) || ''
    };
  }).filter(function (m) { return !!m.nombre; });
}

function webEspecieGrupo(miembros) {
  var set = {};
  (Array.isArray(miembros) ? miembros : []).forEach(function (a) {
    var e = webTexto(a.especie);
    if (e) set[e] = true;
  });
  var arr = Object.keys(set);
  return arr.length === 1 ? arr[0] : (arr.join(', ') || '');
}

function webCategoriaGrupoDerivada(estadoEf, miembros) {
  if (estadoEf === 'en_acogida') return 'Acogidas';
  if (estadoEf === 'adoptado') return 'Adoptados';
  if (estadoEf === 'cerrado') return 'Cerrados';
  var esp = webEspecieGrupo(miembros).toLowerCase();
  if (esp.indexOf('perr') !== -1) return 'Perros en adopción';
  if (esp.indexOf('gat') !== -1) return 'Gatos en adopción';
  return 'En adopción';
}

function webBloqueGrupo(curado, grupo, miembros) {
  var c = curado || {};
  var ms = Array.isArray(miembros) ? miembros : [];
  var resumen = webMiembrosResumen(ms);
  var anySpecial = ms.some(function (a) { return webTexto(a.necesidades_especiales); });
  var healthAgg = {
    vaccinated: ms.length ? ms.every(function (a) { return webTexto(a.vacunas).toLowerCase() === 'sí' || webTexto(a.vacunas).toLowerCase() === 'si' || webBool(a.vacunas, false); }) : false,
    dewormed: ms.length ? ms.every(function (a) { return webTexto(a.desparasitado).toLowerCase() === 'sí' || webTexto(a.desparasitado).toLowerCase() === 'si' || webBool(a.desparasitado, false); }) : false,
    neutered: ms.length ? ms.every(function (a) { return webBool(a.esterilizada, false); }) : false,
    microchipped: ms.length ? ms.every(function (a) { return !!webTexto(a.microchip); }) : false,
    specialNeeds: anySpecial
  };
  var sexoSet = {};
  ms.forEach(function (a) { var s = webTexto(a.sexo); if (s) sexoSet[s] = true; });
  var edadParts = [];
  ms.forEach(function (a) { var e = webTexto(a.edad); if (e) edadParts.push(e); });
  var edadLabel = edadParts.length ? (Array.from ? Array.from(new Set(edadParts)) : edadParts.filter(function(v,i,arr){return arr.indexOf(v)===i;})).join(', ') : '';
  return {
    groupName: webTexto(grupo && grupo.nombre),
    count: ms.length,
    members: resumen,
    species: webEspecieGrupo(ms),
    sex: Object.keys(sexoSet),
    age: { value: '', unit: '', label: edadLabel },
    size: '',
    color: '',
    health: healthAgg,
    temperament: webListaTextos(c.temperament, 10, 40),
    compatibility: webObjetoCampos(c.compatibility, ['dogs', 'cats', 'kids']),
    adoption: webObjetoCampos(c.adoption, ['mode', 'feeEur', 'includes', 'requirements']),
    foster: webObjetoCampos(c.foster, ['temporary', 'reason', 'durationLabel', 'expensesPolicy']),
    location: webObjetoCampos(c.location, ['name', 'city', 'province', 'shelter']),
    contact: webObjetoCampos(c.contact, ['email', 'phone'])
  };
}

function webOrigenDePublicacion(publicacion, mapaAnimales, mapaGrupos) {
  if (!publicacion) return null;
  if (publicacion.tipo === 'animal') {
    var m = mapaAnimales || webMapaAnimales();
    return m[String(publicacion.origen_id)] || null;
  }
  if (publicacion.tipo === 'animal_grupo') {
    var mg = mapaGrupos || webMapaGrupos();
    var g = mg[String(publicacion.origen_id)] || null;
    if (!g) return null;
    var miembros = (Array.isArray(g.miembros) && g.miembros.length) ? g.miembros : webMiembrosDeGrupo(publicacion.origen_id, mapaAnimales);
    return Object.assign({}, g, { miembros: miembros });
  }
  return null;
}

function webOrigen(publicacion, mapaAnimales, mapaGrupos) {
  return webOrigenDePublicacion(publicacion, mapaAnimales, mapaGrupos);
}

function webPublicacionPorId(id) {
  var filas = webFilasWeb();
  for (var i = 0; i < filas.length; i++) if (String(filas[i].id) === String(id)) return filas[i];
  return null;
}

function webPublicacionDeOrigen(tipo, origenId) {
  var filas = webFilasWeb();
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].tipo === tipo && String(filas[i].origen_id) === String(origenId)) return filas[i];
  }
  return null;
}

/**
 * Slug único por tipo, contando tambien los slugs historicos: reutilizar uno
 * antiguo romperia la redireccion 301 que ya apunta a la ficha actual.
 * Ignora la propia publicación al editar.
 */
function webSlugOcupado(tipo, slug, idActual) {
  var s = webNormalizarSlug(slug);
  if (!s) return false;
  var filas = webFilasWeb();
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].tipo !== tipo) continue;
    if (idActual && String(filas[i].id) === String(idActual)) continue;
    if (filas[i].slug === s) return true;
    var hist = filas[i].slug_historial || [];
    for (var k = 0; k < hist.length; k++) if (hist[k].slug === s) return true;
  }
  return false;
}

// ==================== VALIDACIÓN Y COMPOSICIÓN ====================

/**
 * Reglas mínimas para publicar. Devuelve { ok, faltan:[{campo, mensaje}] }.
 * `publicado` exige todo; borrador/oculto solo avisa (no bloquea guardar).
 */
function webValidarPublicacion(publicacion, origen) {
  var faltan = [];
  var p = publicacion || {};
  var o = origen || null;
  var esGrupo = p.tipo === 'animal_grupo' || (o && Array.isArray(o.miembros));
  var estadoPublico = (p.tipo === 'animal' || p.tipo === 'animal_grupo' || o) ? webEstadoPublicoEfectivo(p, o) : webTexto(p.estado_publico);
  if (!webTexto(p.titulo)) faltan.push({ campo: 'titulo', mensaje: 'Falta el título público' });
  if (!webTexto(p.slug) || !webSlugValido(p.slug)) faltan.push({ campo: 'slug', mensaje: 'El slug no es válido' });
  if (!webTexto(p.categoria)) faltan.push({ campo: 'categoria', mensaje: 'Falta la categoría pública' });
  if (!webTexto(estadoPublico)) faltan.push({ campo: 'estado_publico', mensaje: 'Falta el estado público' });
  var contenido = webTexto(p.contenido_html);
  if (!contenido || contenido.length < 40) faltan.push({ campo: 'contenido_html', mensaje: 'La descripción pública es demasiado corta' });
  var cover = (p.media && p.media.coverImage && p.media.coverImage.src) || (esGrupo ? webPortadaGrupo((o && o.miembros) || []) : webFotoOrigen(o));
  if (!cover) faltan.push({ campo: 'coverImage', mensaje: 'Falta la imagen de portada' });
  var seo = p.seo || {};
  if (!webTexto(seo.metaDescription) && !webTexto(p.extracto)) faltan.push({ campo: 'seo.metaDescription', mensaje: 'Falta la meta descripción (o un extracto)' });

  if (p.tipo === 'animal_grupo' || esGrupo) {
    var miembros = (o && o.miembros) || [];
    if (!miembros.length) faltan.push({ campo: 'miembros', mensaje: 'El grupo no tiene miembros' });
    if (!webGrupoValidoParaPublicar(miembros)) {
      if (webTexto(p.estado_publicacion).toLowerCase() === 'publicado') {
        faltan.push({ campo: 'estado_publicacion', mensaje: 'El grupo no es válido para publicar (miembros fallecidos, adopción parcial o conjunto inválido): revisa el grupo u oculta/retira la publicación' });
      }
    }
  } else if (o && webTexto(o.estado).toLowerCase() === 'fallecido' && webTexto(p.estado_publicacion).toLowerCase() === 'publicado') {
    // D6: un animal fallecido no puede seguir publicado.
    faltan.push({ campo: 'estado_publicacion', mensaje: 'El animal está fallecido: oculta o retira su publicación web' });
  }
  return { ok: faltan.length === 0, faltan: faltan };
}


function webBloqueAnimal(curado, origen) {
  var c = curado || {};
  var o = origen || {};
  var salud = c.health || {};
  var edad = c.age || {};
  var vacunas = webTexto(o.vacunas);
  var sexo = webTexto(o.sexo).toLowerCase();
  var sexos = webListaTextos(c.sex, 5, 30);
  if (!sexos.length && sexo) sexos = [sexo === 'm' || sexo === 'macho' ? 'macho' : (sexo === 'h' || sexo === 'hembra' ? 'hembra' : sexo)];
  var nombres = webListaTextos(c.names, 10, 80);
  if (!nombres.length && o.nombre) nombres = [webTexto(o.nombre).slice(0, 80)];
  var compat = webObjetoCampos(c.compatibility, ['dogs', 'cats', 'kids']);
  var adopcion = webObjetoCampos(c.adoption, ['mode', 'feeEur', 'requirements']);
  var acogida = webObjetoCampos(c.foster, ['temporary', 'durationLabel']);
  var ubicacion = webObjetoCampos(c.location, ['city', 'province']);
  var contacto = webObjetoCampos(c.contact, ['email', 'phone']);
  // D7: si la publicación no fija contacto, se usa el de la asociación; nunca
  // se rellena con datos internos del animal.
  if (!webTexto(contacto.email) && !webTexto(contacto.phone)) {
    var emailAsoc = webTexto(typeof CONFIG !== 'undefined' ? CONFIG.CONTACT_EMAIL : '');
    if (emailAsoc) contacto.email = emailAsoc;
  }
  return {
    names: nombres,
    species: webTexto(c.species) || webTexto(o.especie),
    breed: webTexto(c.breed) || webTexto(o.raza),
    sex: sexos,
    age: {
      value: (edad.value !== undefined && edad.value !== null && edad.value !== '') ? webTexto(edad.value).slice(0, 40) : webTexto(o.edad),
      unit: webTexto(edad.unit).slice(0, 20),
      label: webTexto(edad.label).slice(0, 80) || webTexto(o.edad)
    },
    size: webTexto(c.size),
    color: webTexto(c.color),
    health: {
      vaccinated: salud.vaccinated !== undefined ? webBool(salud.vaccinated, false) : (!!vacunas && vacunas.toLowerCase() !== 'no'),
      dewormed: webBool(salud.dewormed, false),
      neutered: salud.neutered !== undefined ? webBool(salud.neutered, false) : webBool(o.esterilizada, false),
      microchipped: salud.microchipped !== undefined ? webBool(salud.microchipped, false) : !!webTexto(o.microchip),
      specialNeeds: webBool(salud.specialNeeds, false)
    },
    temperament: webListaTextos(c.temperament, 20, 60),
    compatibility: compat,
    adoption: adopcion,
    foster: acogida,
    location: ubicacion,
    contact: contacto
  };
}

function webBloqueEvento(curado) {
  var c = curado || {};
  var agenda = Array.isArray(c.agenda) ? c.agenda.map(function (item) {
    if (!item || typeof item !== 'object') return null;
    var salida = webObjetoCampos(item, ['time', 'title', 'description']);
    return (webTexto(salida.time) || webTexto(salida.title) || webTexto(salida.description)) ? salida : null;
  }).filter(function (x) { return !!x; }).slice(0, 50) : [];
  return {
    kind: webTexto(c.kind),
    startDate: webIsoFecha(c.startDate),
    endDate: webIsoFecha(c.endDate),
    timezone: webTexto(c.timezone) || 'Europe/Madrid',
    location: webObjetoCampos(c.location, ['name', 'address', 'city', 'onlineUrl']),
    organizer: webObjetoCampos(c.organizer, ['name', 'contactEmail', 'phone']),
    audience: webListaTextos(c.audience, 20, 80),
    agenda: agenda,
    registration: webObjetoCampos(c.registration, ['required', 'url', 'label']),
    milestone: webObjetoCampos(c.milestone, ['title', 'date', 'description'])
  };
}

/**
 * Composición ÚNICA del contrato `Publicacion`.
 * La usan `web-animales-preview` y el canal público: mismo objeto.
 * `opts.ficha` (o tercer arg true) incluye `ficha` (solo detalle/preview/prerender, no listados).
 */
function webConstruirPublicacion(publicacion, origen, opts) {
  var incluirFicha = opts === true || !!(opts && opts.ficha);
  var p = publicacion || {};
  var media = p.media || {};
  var seoIn = p.seo || {};
  var esGrupo = p.tipo === 'animal_grupo';
  var cover = media.coverImage || {};
  // Las URLs de portada, galería, vídeos y CTA pasan por la misma lista blanca
  // que el HTML: si no son seguras se descartan (la ficha se pinta sin ellas).
  var srcFallback = esGrupo ? webUrlSegura(webPortadaGrupo((origen && origen.miembros) || [])) : webUrlSegura(webFotoOrigen(origen));
  var src = webUrlSegura(webTexto(cover.src)) || srcFallback;
  var alt = webTexto(cover.alt) || webTexto(p.titulo) || webTexto(origen && (origen.nombre || origen.groupName));
  var gallery = webGaleriaSegura(media.gallery);
  var videos = webVideosSeguros(media.videos);
  var icons = Array.isArray(media.icons) ? media.icons : [];
  var dominio = webDominioPublico();
  var ruta = webRutaPublica(p.tipo, p.slug);
  var canonical = webTexto(seoIn.canonical) || (dominio ? dominio + ruta : '');


  var out = {
    id: p.id || '',
    slug: p.slug || '',
    type: p.tipo || 'animal',
    category: p.categoria || '',
    status: webEstadoPublicoEfectivo(p, origen),
    title: p.titulo || '',
    excerpt: p.extracto || '',
    publishedAt: p.publicado_en || '',
    updatedAt: p.actualizado_en || '',
    coverImage: { src: src, alt: alt },
    contentHtml: webSanearHtml(p.contenido_html || ''),
    author: p.autor || '',
    tags: webTagsSeguras(p.tags),
    icons: webIconosSeguros(icons),
    gallery: gallery,
    videos: videos,
    featured: !!p.featured,
    listed: p.listed !== false,
    url: ruta,
    canonical: canonical,
    // `urgente` es solo una bandera (D2), derivada del origen (animal o grupo).
    urgent: webUrgenteEfectivo(p, origen),
    isGroup: !!esGrupo,

    seo: {
      metaTitle: webTexto(seoIn.metaTitle) || webTexto(p.titulo),
      metaDescription: webTexto(seoIn.metaDescription) || webTexto(p.extracto),
      ogImage: webTexto(seoIn.ogImage) || src,
      canonical: canonical,
      robots: webTexto(seoIn.robots) || (p.indexable ? 'index,follow' : 'noindex,follow'),
      og: seoIn.og || null,
      twitter: seoIn.twitter || null
    },
    // Compatibilidad con el render actual (`image`, `dateFormatted`, `readTime`).
    image: src,
    imageAlt: alt,
    dateFormatted: webFechaLegible(p.publicado_en),
    readTime: webTiempoLectura(p.contenido_html)
  };

  var ctaUrl = webUrlSegura(p.cta && p.cta.url);
  if (p.cta && webTexto(p.cta.label) && ctaUrl) {
    out.cta = { label: webTexto(p.cta.label), url: ctaUrl };
    var kindCta = webTexto(p.cta.kind).toLowerCase();
    if (WEB_FICHA_CTA_KINDS.indexOf(kindCta) !== -1) out.cta.kind = kindCta;
  }
  if (p.tipo === 'animal') out.animal = webBloqueAnimal(p.animal || {}, origen || {});
  if (p.tipo === 'animal_grupo') {
    var miembros = (origen && origen.miembros) || [];
    var gInfo = origen || {};
    out.group = webBloqueGrupo(p.animal || {}, gInfo, miembros);
    out.animal = out.group; // compatibilidad de consumidores que leen bloque animal
  }
  if (p.tipo === 'evento') out.event = webBloqueEvento(p.evento || {});
  if (incluirFicha && p.ficha && typeof p.ficha === 'object') out.ficha = webFichaSegura(p.ficha);
  return out;

}

function webPublicacionBaseUrl() {
  var base = webTexto(typeof CONFIG !== 'undefined' ? CONFIG.PUBLIC_WEB_BASE_URL : '');
  return base ? base.replace(/\/+$/g, '') : '';
}

/**
 * Dominio público real para canonical/sitemap. Mientras la base sea la demo de
 * GitHub Pages devuelve '' (allí las rutas `/animales/<slug>` aún no existen).
 */
function webDominioPublico() {
  var base = webPublicacionBaseUrl();
  if (!base) return '';
  if (/^https?:\/\/[^/]*github\.io(\/|$)/i.test(base)) return '';
  return base;
}

function webRutaPublica(tipo, slug) {
  if (!slug) return '';
  if (tipo === 'animal' || tipo === 'animal_grupo') return '/animales/' + slug;
  if (tipo === 'evento') return '/eventos/' + slug;
  return '/historias/' + slug;
}

// ==================== GESTOR · ANIMALES ====================

function webListarAnimales(params) {
  params = params || {};
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var animales = readSheet(CONFIG.sheets.animales);
  var filasWeb = webFilasWeb();
  var mapaPub = {};
  filasWeb.forEach(function (p) { if (p.tipo === 'animal') mapaPub[String(p.origen_id)] = p; });
  // Grupos con publicación viva: sus miembros no se ofrecen como ficha suelta.
  var gruposVigentes = {};
  filasWeb.forEach(function (p) {
    if (p.tipo === 'animal_grupo' && p.estado_publicacion === 'publicado') gruposVigentes[String(p.origen_id)] = true;
  });

  var q = webTexto(params.q).toLowerCase();
  var estadoFiltro = webTexto(params.estado_publicacion);
  var publicado = params.publicado === undefined || params.publicado === '' ? '' : String(params.publicado);

  var filas = animales.map(function (a) {
    var pub = mapaPub[String(a.id)] || null;
    var origen = a;
    var valida = pub ? webValidarPublicacion(pub, origen) : { ok: false, faltan: [{ campo: 'publicacion', mensaje: 'Sin publicación web' }] };
    var gid = webTexto(a.grupo_id || a.grupo);
    return {
      animal_id: String(a.id),
      publicacion_id: pub ? pub.id : '',
      grupo_id: gid,
      grupo_nombre: webTexto(a.grupo),
      grupo_publicado: (gid && gruposVigentes[String(gid)]) ? (webTexto(a.grupo) || String(gid)) : '',
      nombre: webTexto(a.nombre),
      especie: webTexto(a.especie),
      estado_animal: webTexto(a.estado),
      estado_publico: pub ? webEstadoPublicoEfectivo(pub, a) : webEstadoPublicoDerivado(a.estado),
      estado_publico_modo: pub ? webModoEstadoPublico(pub, a) : 'auto',
      urgente: webAnimalUrgente(a),
      slug: pub ? pub.slug : '',
      titulo: pub ? pub.titulo : '',
      categoria: pub ? pub.categoria : '',
      estado_publicacion: pub ? pub.estado_publicacion : 'sin_publicar',
      indexable: pub ? pub.indexable : false,
      listed: pub ? pub.listed : false,
      featured: pub ? pub.featured : false,
      orden: pub ? pub.orden : 0,
      actualizado_en: pub ? pub.actualizado_en : '',
      completitud: { ok: valida.ok, faltan: valida.faltan.map(function (f) { return f.campo; }) }
    };
  });

  if (q) {
    filas = filas.filter(function (f) {
      return (f.nombre + ' ' + f.titulo + ' ' + f.slug + ' ' + f.especie).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (estadoFiltro) filas = filas.filter(function (f) { return f.estado_publicacion === estadoFiltro; });
  if (publicado !== '') {
    var quieroPublicado = webBool(publicado, false);
    filas = filas.filter(function (f) { return (f.estado_publicacion === 'publicado') === quieroPublicado; });
  }
  filas.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });

  var page = Math.max(1, parseInt(params.page, 10) || 1);
  var pageSize = Math.min(WEB_ADMIN_PAGE_SIZE_MAX, Math.max(1, parseInt(params.pageSize, 10) || 200));
  var total = filas.length;
  var data = filas.slice((page - 1) * pageSize, page * pageSize);
  return {
    status: 'success',
    data: data,
    pagination: { page: page, pageSize: pageSize, total: total, totalPages: Math.ceil(total / pageSize) || 1 }
  };
}

function webGetAnimal(animalId) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var a = webMapaAnimales()[String(animalId)];
  if (!a) return { status: 'error', error: 'Animal no encontrado' };
  var pub = webPublicacionDeOrigen('animal', animalId);
  var esVirtual = false;
  if (!pub) {
    esVirtual = true;
    var galeriaInt = webParseJson(a.galeria, []);
    var videosInt = webParseJson(a.videos, []);
    var portadaInt = webTexto(a.portada_url || a.foto_url || a.foto || webFotoOrigen(a));
    pub = {
      id: '', tipo: 'animal', origen_id: String(animalId), slug: webNormalizarSlug(a.nombre),
      estado_publicacion: 'borrador', indexable: true, listed: true, featured: false, orden: 0,
      titulo: webTexto(a.nombre), extracto: '', contenido_html: webTexto(a.descripcion),
      categoria: '', estado_publico: webEstadoPublicoDerivado(a.estado), estado_publico_modo: 'auto',
      especie: webTexto(a.especie),
      autor: '', tags: [],
      media: {
        coverImage: portadaInt ? { src: portadaInt, alt: webTexto(a.portada_alt) || webTexto(a.nombre) } : {},
        gallery: Array.isArray(galeriaInt) ? galeriaInt : [],
        videos: Array.isArray(videosInt) ? videosInt : [],
        icons: []
      },
      seo: {}, cta: null, animal: {}, evento: null, ficha: null,
      publicado_en: '', actualizado_en: '', creado_en: ''
    };
  }
  var modo = webModoEstadoPublico(pub, a);
  var efectivo = webEstadoPublicoEfectivo(pub, a);
  var data = Object.assign({}, pub, {
    estado_publico_modo: modo,
    estado_publico_efectivo: efectivo,
    estado_publico_derivado: webEstadoPublicoDerivado(a.estado),
    urgente: webAnimalUrgente(a)
  });
  return {
    status: 'success',
    data: data,
    virtual: esVirtual,
    origen: {
      id: String(a.id), nombre: webTexto(a.nombre), especie: webTexto(a.especie),
      raza: webTexto(a.raza), sexo: webTexto(a.sexo), edad: webTexto(a.edad),
      estado: webTexto(a.estado), estado_publico_derivado: webEstadoPublicoDerivado(a.estado),
      urgente: webAnimalUrgente(a), descripcion: webTexto(a.descripcion), foto: webFotoOrigen(a),
      portada_url: webTexto(a.portada_url || a.foto_url || a.foto),
      portada_alt: webTexto(a.portada_alt),
      vacunas: webTexto(a.vacunas), esterilizada: webBool(a.esterilizada, false),
      microchip: webTexto(a.microchip), desparasitado: webTexto(a.desparasitado),
      necesidades_especiales: webTexto(a.necesidades_especiales),
      galeria: webParseJson(a.galeria, []),
      videos: webParseJson(a.videos, []),
      documentos_internos: webParseJson(a.documentos_internos, [])
    },
    grupo: webGrupoResumenDeAnimal(a),
    completitud: webValidarPublicacion(pub, a)
  };
}

function webUpsertAnimal(body) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var animalId = webTexto(body && body.animal_id);
  if (!animalId) return { status: 'error', error: 'Falta animal_id' };
  var a = webMapaAnimales()[animalId];
  if (!a) return { status: 'error', error: 'Animal no encontrado' };

  var previa = webPublicacionDeOrigen('animal', animalId);
  var slug = webNormalizarSlug(body.slug || body.titulo || a.nombre);
  if (!webSlugValido(slug)) return { status: 'error', error: 'Slug no válido' };
  if (webSlugOcupado('animal', slug, previa && previa.id)) {
    return { status: 'error', error: 'El slug "' + slug + '" ya está en uso por otra publicación' };
  }

  var fichaVal = (body && (body.ficha !== undefined || body.ficha_json !== undefined))
    ? (body.ficha !== undefined ? body.ficha : body.ficha_json)
    : (previa ? previa.ficha : null);
  var fichaNorm = webNormalizarFicha(fichaVal);
  if (fichaVal && !fichaNorm) return { status: 'error', error: 'La ficha configurable debe ser un objeto JSON' };
  if (fichaNorm && JSON.stringify(fichaNorm).length > WEB_FICHA_MAX_CHARS) {
    return { status: 'error', error: 'La ficha configurable supera el máximo de ' + WEB_FICHA_MAX_CHARS + ' caracteres' };
  }
  function webLimpio(obj, raiz) {
    if (Array.isArray(obj)) return obj.length ? obj : undefined;
    if (!obj || typeof obj !== 'object') return (obj === '' || obj === null || obj === undefined) ? undefined : obj;
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'string') { var t = webTexto(v); if (t !== '') out[k] = v; return; }
      if (typeof v === 'boolean' || typeof v === 'number') { out[k] = v; return; }
      if (Array.isArray(v)) { if (v.length) out[k] = v; return; }
      if (typeof v === 'object') { var limpio = webLimpio(v, false); if (limpio && Object.keys(limpio).length) out[k] = limpio; return; }
    });
    return Object.keys(out).length ? out : undefined;
  }
  var animalCurado = webLimpio(body.animal || {}, true) || {};
  // No persistir contacto vacío si solo caerá al de la asociación (se inyecta al componer).
  if (animalCurado.contact && !webTexto(animalCurado.contact.email) && !webTexto(animalCurado.contact.phone)) delete animalCurado.contact;
  var registro = {
    id: (previa && previa.id) || ('web_' + webUuid()),
    tipo: 'animal',
    origen_id: animalId,
    slug: slug,
    estado_publicacion: WEB_ESTADOS.indexOf(webTexto(body.estado_publicacion)) !== -1 ? webTexto(body.estado_publicacion) : 'borrador',
    indexable: webBool(body.indexable, true),
    listed: webBool(body.listed, true),
    featured: webBool(body.featured, false),
    orden: Number(body.orden || 0) || 0,
    titulo: webTexto(body.titulo) || webTexto(a.nombre),
    extracto: webTexto(body.extracto),
    contenido_html: String(body.contenido_html || ''),
    categoria: webTexto(body.categoria),
    estado_publico: '',
    estado_publico_modo: 'auto',
    especie: webTexto(a.especie),
    autor: webTexto(body.autor),
    tags_json: JSON.stringify(webTagsSeguras(webArray(body.tags))),
    media_json: JSON.stringify((function (m) { var x = (m && typeof m === 'object' && !Array.isArray(m)) ? JSON.parse(JSON.stringify(m)) : {}; delete x.documents; delete x.folderId; return x; })(body.media || {})),
    documents_json: JSON.stringify((body.media && body.media.documents) || webParseJson(body.documents_json, body.documents || [])),
    media_folder_id: webTexto((body.media && body.media.folderId) || body.media_folder_id || ''),
    seo_json: JSON.stringify(body.seo || {}),
    cta_json: JSON.stringify(body.cta || null),
    animal_json: JSON.stringify(animalCurado),
    evento_json: '',
    ficha_json: fichaNorm ? JSON.stringify(fichaNorm) : '',
    publicado_en: previa && previa.publicado_en ? previa.publicado_en : '',
    actualizado_en: webAhora(),
    creado_en: (previa && previa.creado_en) || webAhora()
  };
  // Estado público: `auto` lo deriva de la ficha interna; un valor del
  // vocabulario público es un override manual explícito (D1).
  var estadoIn = webTexto(body.estado_publico);
  var modoIn = webTexto(body.estado_publico_modo).toLowerCase();
  if (modoIn === 'manual' && WEB_ESTADOS_PUBLICOS.indexOf(estadoIn) === -1) modoIn = 'auto';
  if (estadoIn === 'auto' || estadoIn === 'urgente') modoIn = 'auto';
  if (modoIn !== 'manual' && modoIn !== 'auto') {
    modoIn = WEB_ESTADOS_PUBLICOS.indexOf(estadoIn) !== -1 ? 'manual' : 'auto';
  }
  var estadoEf = (modoIn === 'manual') ? estadoIn : webEstadoPublicoDerivado(a.estado);
  var categoria = webTexto(body.categoria);
  if (!categoria) {
    var esp = webTexto(a.especie).toLowerCase();
    if (estadoEf === 'en_acogida') categoria = 'Acogidas';
    else if (estadoEf === 'adoptado') categoria = 'Adoptados';
    else if (estadoEf === 'cerrado') categoria = 'Cerrados';
    else if (esp.indexOf('perr') !== -1) categoria = 'Perros en adopción';
    else if (esp.indexOf('gat') !== -1) categoria = 'Gatos en adopción';
    else categoria = 'En adopción';
  }
  registro.estado_publico_modo = modoIn;
  registro.estado_publico = estadoEf;
  registro.categoria = categoria;
  registro.especie = webTexto(a.especie);
  if (registro.estado_publicacion === 'publicado' && !registro.publicado_en) registro.publicado_en = webAhora();
  registro.slug_historial = JSON.stringify(webHistorialDeCambio(previa, slug));

  if (registro.estado_publicacion === 'publicado') {
    // Exclusividad 1:1 con el grupo, en el sentido que faltaba (H-1).
    var grupoVigenteAnimal = webGrupoVigenteDeAnimal(a);
    if (grupoVigenteAnimal) return { status: 'warning', error: webErrorExclusividadGrupo(grupoVigenteAnimal) };
    var check = webValidarPublicacion(webFilaAPublicacion(registro), a);
    if (!check.ok) {
      return {
        status: 'warning',
        error: 'No se puede publicar: completa los campos obligatorios',
        detail: check.faltan.map(function (f) { return f.mensaje; }).join(' · '),
        data: check.faltan
      };
    }
  }

  var guardado;
  try {
    if (previa && previa.id) {
      guardado = updateSheetRow(cfg, previa.id, registro);
      if (!guardado) return { status: 'error', error: 'No se encontró la publicación a actualizar' };
    } else {
      guardado = appendToSheet(cfg, registro);
    }
  } catch (err) {
    return { status: 'error', error: 'No se pudo guardar la publicación', detail: err.message };
  }
  // El deploy lo dispara el router (`Code.gs` → `_webAnotarDeploy`) con el
  // estado resultante: aquí no se llama a GitHub para no tener dos lógicas.
  return { status: 'success', data: webFilaAPublicacion(registro), guardado: guardado };
}

function webEstadoAnimal(body, user) {
  var animalId = webTexto(body && body.animal_id);
  if (!animalId) return { status: 'error', error: 'Falta animal_id' };
  var estado = webTexto(body.estado_publicacion);
  if (WEB_ESTADOS.indexOf(estado) === -1) return { status: 'error', error: 'Estado de publicación no válido' };
  var previa = webPublicacionDeOrigen('animal', animalId);
  if (!previa) return { status: 'error', error: 'Este animal aún no tiene publicación web. Abre "Publicación web" para configurarla.' };
  var a = webMapaAnimales()[animalId];
  if (estado === 'publicado') {
    var grupoVigenteAnimal = webGrupoVigenteDeAnimal(a);
    if (grupoVigenteAnimal) return { status: 'warning', error: webErrorExclusividadGrupo(grupoVigenteAnimal) };
    var check = webValidarPublicacion(Object.assign({}, previa, { estado_publicacion: 'publicado' }), a);
    if (!check.ok) {
      return {
        status: 'warning',
        error: 'No se puede publicar todavía',
        detail: check.faltan.map(function (f) { return f.mensaje; }).join(' · '),
        data: check.faltan
      };
    }
  }
  var cambios = { estado_publicacion: estado, actualizado_en: webAhora() };
  if (estado === 'publicado' && !previa.publicado_en) cambios.publicado_en = webAhora();
  var ok = updateSheetRow(webSheetConfig(), previa.id, cambios);
  if (!ok) return { status: 'error', error: 'No se encontró la publicación a actualizar' };
  try { registrarAuditoria('publicacion_web', 'web_animales', previa.id, user, { estado: estado, slug: previa.slug }); } catch (e) {}
  // Ocultar, publicar o retirar cambia las páginas estáticas: el deploy lo
  // dispara el router al leer `estado_publicacion` de esta respuesta.
  return { status: 'success', data: { id: previa.id, animal_id: animalId, estado_publicacion: estado } };
}

function webEliminarAnimal(body, user) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var animalId = webTexto(body && body.animal_id);
  if (!animalId) return { status: 'error', error: 'Falta animal_id' };
  var previa = webPublicacionDeOrigen('animal', animalId);
  if (!previa) return { status: 'error', error: 'Este animal no tiene publicación web para eliminar' };
  if (previa.estado_publicacion === 'publicado') {
    return { status: 'error', error: 'No se puede eliminar una publicación publicada. Ocúltala antes.' };
  }
  if (previa.estado_publicacion === 'retirado') {
    return { status: 'error', error: 'No se puede eliminar una publicación retirada.' };
  }
  var slug = previa.slug;
  var ok = deleteSheetRow(cfg, previa.id);
  if (!ok) return { status: 'error', error: 'No se pudo eliminar la publicación web' };
  try { registrarAuditoria('eliminar_publicacion', 'web_animal', previa.id, user, { slug: slug, animal_id: animalId }); } catch (e) {}
  return { status: 'success', success: true, data: { id: previa.id, animal_id: animalId, eliminado: true } };
}

function webArchivarAnimal(body, user) {
  var animalId = webTexto(body && body.animal_id);
  if (!animalId) return { status: 'error', error: 'Falta animal_id' };
  var previa = webPublicacionDeOrigen('animal', animalId);
  if (!previa) return { status: 'error', error: 'Este animal aún no tiene publicación web' };
  if (previa.estado_publicacion === 'retirado') {
    return { status: 'success', success: true, data: { id: previa.id, animal_id: animalId, estado_publicacion: 'retirado', slug: previa.slug } };
  }
  // Lápida 410: se conserva la fila y el slug para que el enlace no vuelva a usarse.
  var cambios = { estado_publicacion: 'retirado', listed: false, indexable: false, actualizado_en: webAhora() };
  if (!updateSheetRow(webSheetConfig(), previa.id, cambios)) return { status: 'error', error: 'No se encontró la publicación a retirar' };
  try { registrarAuditoria('retirar_publicacion', 'web_animal', previa.id, user, { slug: previa.slug, animal_id: animalId }); } catch (e) {}
  return { status: 'success', success: true, data: { id: previa.id, animal_id: animalId, estado_publicacion: 'retirado', slug: previa.slug } };
}

function webRestaurarAnimal(body, user) {
  var animalId = webTexto(body && body.animal_id);
  if (!animalId) return { status: 'error', error: 'Falta animal_id' };
  var previa = webPublicacionDeOrigen('animal', animalId);
  if (!previa) return { status: 'error', error: 'Este animal no tiene publicación web que restaurar' };
  if (previa.estado_publicacion !== 'retirado') {
    return { status: 'success', success: true, data: { id: previa.id, animal_id: animalId, estado_publicacion: previa.estado_publicacion, slug: previa.slug } };
  }
  var cambios = { estado_publicacion: 'borrador', listed: true, indexable: true, actualizado_en: webAhora() };
  if (!updateSheetRow(webSheetConfig(), previa.id, cambios)) return { status: 'error', error: 'No se encontró la publicación a restaurar' };
  try { registrarAuditoria('restaurar_publicacion', 'web_animal', previa.id, user, { slug: previa.slug, estado: 'borrador' }); } catch (e) {}
  return { status: 'success', success: true, data: { id: previa.id, animal_id: animalId, estado_publicacion: 'borrador', slug: previa.slug } };
}

function webPreviewAnimal(animalId) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var pub = webPublicacionDeOrigen('animal', animalId);
  if (!pub) return { status: 'error', error: 'Este animal aún no tiene configuración web' };
  var a = webMapaAnimales()[String(animalId)] || null;
  return { status: 'success', data: webConstruirPublicacion(pub, a, { ficha: true }) };
}

// ==================== GESTOR — GRUPOS (adopción conjunta) ====================

function webListarGrupos(params) {
  params = params || {};
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var mapaGrupos = webMapaGrupos();
  var filasPubs = webFilasWeb();
  var mapaPub = {};
  filasPubs.forEach(function (p) { if (p.tipo === 'animal_grupo') mapaPub[String(p.origen_id)] = p; });
  var mapaPubAnimal = {};
  filasPubs.forEach(function (p) { if (p.tipo === 'animal') mapaPubAnimal[String(p.origen_id)] = p; });
  var q = webTexto(params.q).toLowerCase();
  var soloObligatorios = (params.todos === '1' || params.todos === true) ? false : true;
  var grupos = Object.keys(mapaGrupos).map(function (id) {
    var g = mapaGrupos[id];
    var pub = mapaPub[String(id)] || null;
    // Por defecto solo los grupos obligatorios y los que ya tienen publicación:
    // un grupo no obligatorio sin publicar no es candidato del gestor web.
    if (soloObligatorios && !g.grupo_obligatorio && !pub) return null;
    var miembros = g.miembros || [];
    var origen = Object.assign({}, g, { miembros: miembros });
    var valida = pub ? webValidarPublicacion(pub, origen) : { ok: false, faltan: [{ campo: 'publicacion', mensaje: 'Sin publicación web' }] };
    var conflictoIndividual = miembros.some(function (a) {
      var pa = mapaPubAnimal[String(a.id)];
      return pa && pa.estado_publicacion === 'publicado';
    });
    return {
      grupo_id: String(id), nombre: webTexto(g.nombre) || String(id), grupo_obligatorio: !!g.grupo_obligatorio,
      miembros_count: miembros.length, miembros_nombres: miembros.map(function (a) { return webTexto(a.nombre); }).filter(Boolean),
      publicacion_id: pub ? pub.id : '', slug: pub ? pub.slug : '', titulo: pub ? pub.titulo : '', categoria: pub ? pub.categoria : '',
      estado_publicacion: pub ? pub.estado_publicacion : 'sin_publicar',
      estado_publico: pub ? webEstadoPublicoEfectivo(pub, origen) : webEstadoGrupoDerivado(miembros),
      estado_publico_modo: pub ? webModoEstadoPublico(pub, origen) : 'auto',
      urgente: webGrupoUrgente(miembros),
      indexable: pub ? pub.indexable : false, listed: pub ? pub.listed : false, featured: pub ? pub.featured : false,
      actualizado_en: pub ? pub.actualizado_en : '', conflicto_individual_publicado: conflictoIndividual,
      completitud: { ok: valida.ok, faltan: valida.faltan.map(function (f) { return f.campo; }) }
    };
  }).filter(function (x) { return !!x; });
  if (q) grupos = grupos.filter(function (g) { return (g.nombre + ' ' + g.titulo + ' ' + g.slug + ' ' + (g.miembros_nombres || []).join(' ')).toLowerCase().indexOf(q) !== -1; });
  var estadoFiltro = webTexto(params.estado_publicacion);
  if (estadoFiltro) grupos = grupos.filter(function (g) { return g.estado_publicacion === estadoFiltro; });
  grupos.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
  return { status: 'success', data: grupos, pagination: { page: 1, pageSize: grupos.length || 1, total: grupos.length, totalPages: 1 } };
}

function webGetGrupo(grupoId) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var g = webGrupoInfo(grupoId);
  if (!g) return { status: 'error', error: 'Grupo no encontrado' };
  var miembros = g.miembros || [];
  var origen = Object.assign({}, g, { miembros: miembros });
  var pub = webPublicacionDeOrigen('animal_grupo', grupoId);
  var esVirtual = false;
  if (!pub) {
    esVirtual = true;
    var portada = webPortadaGrupo(miembros);
    var gal = [];
    miembros.forEach(function (a) { var ga = webParseJson(a.galeria, []); if (Array.isArray(ga)) gal = gal.concat(ga); });
    pub = {
      id: '', tipo: 'animal_grupo', origen_tipo: 'grupo', origen_id: String(grupoId), slug: webNormalizarSlug(g.nombre),
      estado_publicacion: 'borrador', indexable: true, listed: true, featured: false, orden: 0,
      titulo: webTexto(g.nombre), extracto: '', contenido_html: '',
      categoria: webCategoriaGrupoDerivada(webEstadoGrupoDerivado(miembros), miembros),
      estado_publico: webEstadoGrupoDerivado(miembros), estado_publico_modo: 'auto',
      especie: webEspecieGrupo(miembros), autor: '', tags: [],
      media: { coverImage: portada ? { src: portada, alt: webTexto(g.nombre) } : {}, gallery: gal.slice(0, 20), videos: [], icons: [] },
      seo: {}, cta: null, animal: {}, evento: null, ficha: null, publicado_en: '', actualizado_en: '', creado_en: ''
    };
  }
  var modo = webModoEstadoPublico(pub, origen);
  var efectivo = webEstadoPublicoEfectivo(pub, origen);
  var data = Object.assign({}, pub, { estado_publico_modo: modo, estado_publico_efectivo: efectivo, estado_publico_derivado: webEstadoGrupoDerivado(miembros), urgente: webGrupoUrgente(miembros) });
  return { status: 'success', data: data, virtual: esVirtual, origen: { id: String(g.id), nombre: webTexto(g.nombre), grupo_obligatorio: !!g.grupo_obligatorio, estado_publico_derivado: webEstadoGrupoDerivado(miembros), urgente: webGrupoUrgente(miembros), miembros: webMiembrosResumen(miembros), miembros_count: miembros.length }, completitud: webValidarPublicacion(pub, origen) };
}

function webUpsertGrupo(body) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var grupoId = webTexto(body && (body.grupo_id || body.origen_id));
  if (!grupoId) return { status: 'error', error: 'Falta grupo_id' };
  var g = webGrupoInfo(grupoId);
  if (!g) return { status: 'error', error: 'Grupo no encontrado' };
  var miembros = g.miembros || [];
  var origen = Object.assign({}, g, { miembros: miembros });
  var previa = webPublicacionDeOrigen('animal_grupo', grupoId);
  var slug = webNormalizarSlug(body.slug || body.titulo || g.nombre);
  if (!webSlugValido(slug)) return { status: 'error', error: 'Slug no válido' };
  if (webSlugOcupado('animal_grupo', slug, previa && previa.id)) return { status: 'error', error: 'El slug "' + slug + '" ya está en uso por otra publicación' };
  var fichaVal = (body && (body.ficha !== undefined || body.ficha_json !== undefined)) ? (body.ficha !== undefined ? body.ficha : body.ficha_json) : (previa ? previa.ficha : null);
  var fichaNorm = webNormalizarFicha(fichaVal);
  if (fichaVal && !fichaNorm) return { status: 'error', error: 'La ficha configurable debe ser un objeto JSON' };
  if (fichaNorm && JSON.stringify(fichaNorm).length > WEB_FICHA_MAX_CHARS) return { status: 'error', error: 'La ficha configurable supera el máximo de ' + WEB_FICHA_MAX_CHARS + ' caracteres' };
  function webLimpioG(obj) {
    if (Array.isArray(obj)) return obj.length ? obj : undefined;
    if (!obj || typeof obj !== 'object') return (obj === '' || obj === null || obj === undefined) ? undefined : obj;
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'string') { if (webTexto(v) !== '') out[k] = v; return; }
      if (typeof v === 'boolean' || typeof v === 'number') { out[k] = v; return; }
      if (Array.isArray(v)) { if (v.length) out[k] = v; return; }
      if (typeof v === 'object') { var limpio = webLimpioG(v); if (limpio && Object.keys(limpio).length) out[k] = limpio; return; }
    });
    return Object.keys(out).length ? out : undefined;
  }
  var curado = webLimpioG(body.animal || body.grupo || {}) || {};
  var registro = {
    id: (previa && previa.id) || ('web_' + webUuid()), tipo: 'animal_grupo', origen_tipo: 'grupo', origen_id: String(grupoId), slug: slug,
    estado_publicacion: WEB_ESTADOS.indexOf(webTexto(body.estado_publicacion)) !== -1 ? webTexto(body.estado_publicacion) : 'borrador',
    indexable: webBool(body.indexable, true), listed: webBool(body.listed, true), featured: webBool(body.featured, false), orden: Number(body.orden || 0) || 0,
    titulo: webTexto(body.titulo) || webTexto(g.nombre), extracto: webTexto(body.extracto), contenido_html: String(body.contenido_html || ''),
    categoria: webTexto(body.categoria), estado_publico: '', estado_publico_modo: 'auto', especie: webEspecieGrupo(miembros), autor: webTexto(body.autor),
    tags_json: JSON.stringify(webTagsSeguras(webArray(body.tags))),
    media_json: JSON.stringify((function (m) { var x = (m && typeof m === 'object' && !Array.isArray(m)) ? JSON.parse(JSON.stringify(m)) : {}; delete x.documents; delete x.folderId; return x; })(body.media || {})),
    documents_json: JSON.stringify((body.media && body.media.documents) || webParseJson(body.documents_json, body.documents || [])),
    media_folder_id: webTexto((body.media && body.media.folderId) || body.media_folder_id || ''),
    seo_json: JSON.stringify(body.seo || {}), cta_json: JSON.stringify(body.cta || null),
    animal_json: JSON.stringify(curado), evento_json: '', ficha_json: fichaNorm ? JSON.stringify(fichaNorm) : '',
    publicado_en: previa && previa.publicado_en ? previa.publicado_en : '', actualizado_en: webAhora(), creado_en: (previa && previa.creado_en) || webAhora()
  };
  var estadoIn = webTexto(body.estado_publico);
  var modoIn = webTexto(body.estado_publico_modo).toLowerCase();
  if (modoIn === 'manual' && WEB_ESTADOS_PUBLICOS.indexOf(estadoIn) === -1) modoIn = 'auto';
  if (estadoIn === 'auto' || estadoIn === 'urgente') modoIn = 'auto';
  if (modoIn !== 'manual' && modoIn !== 'auto') { modoIn = WEB_ESTADOS_PUBLICOS.indexOf(estadoIn) !== -1 ? 'manual' : 'auto'; }
  var estadoEf = (modoIn === 'manual') ? estadoIn : webEstadoGrupoDerivado(miembros);
  var categoria = webTexto(body.categoria);
  if (!categoria) categoria = webCategoriaGrupoDerivada(estadoEf, miembros);
  registro.estado_publico_modo = modoIn; registro.estado_publico = estadoEf; registro.categoria = categoria; registro.especie = webEspecieGrupo(miembros);
  if (registro.estado_publicacion === 'publicado' && !registro.publicado_en) registro.publicado_en = webAhora();
  registro.slug_historial = JSON.stringify(webHistorialDeCambio(previa, slug));

  var estPub = registro.estado_publicacion;
  if (estPub === 'publicado' || estPub === 'oculto') {
    var pubs = webFilasWeb();
    var conflicto = [];
    miembros.forEach(function (a) {
      for (var i = 0; i < pubs.length; i++) {
        if (pubs[i].tipo === 'animal' && String(pubs[i].origen_id) === String(a.id) && pubs[i].estado_publicacion === 'publicado') conflicto.push(webTexto(a.nombre) || String(a.id));
      }
    });
    if (conflicto.length) return { status: 'warning', error: 'No se puede activar la publicación del grupo: hay publicaciones individuales publicadas de miembros (' + conflicto.join(', ') + '). Ocúltalas o retíralas primero.' };
  }
  if (registro.estado_publicacion === 'publicado') {
    var check = webValidarPublicacion(webFilaAPublicacion(registro), origen);
    if (!check.ok) return { status: 'warning', error: 'No se puede publicar: completa los campos obligatorios', detail: check.faltan.map(function (f) { return f.mensaje; }).join(' · '), data: check.faltan };
  }
  var guardado;
  try {
    if (previa && previa.id) { guardado = updateSheetRow(cfg, previa.id, registro); if (!guardado) return { status: 'error', error: 'No se encontró la publicación a actualizar' }; }
    else { guardado = appendToSheet(cfg, registro); }
  } catch (err) { return { status: 'error', error: 'No se pudo guardar la publicación: ' + String(err && err.message || err) }; }
  return { status: 'success', data: guardado, completitud: webValidarPublicacion(webFilaAPublicacion(guardado), origen) };
}

function webEstadoGrupoPub(body, user) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var grupoId = webTexto(body && (body.grupo_id || body.origen_id));
  var estado = webTexto(body && body.estado_publicacion).toLowerCase();
  if (!grupoId) return { status: 'error', error: 'Falta grupo_id' };
  if (WEB_ESTADOS.indexOf(estado) === -1) return { status: 'error', error: 'Estado de publicación no válido' };
  var previa = webPublicacionDeOrigen('animal_grupo', grupoId);
  if (!previa) return { status: 'error', error: 'El grupo no tiene publicación web. Guárdala primero.' };
  var g = webGrupoInfo(grupoId);
  if (!g) return { status: 'error', error: 'Grupo no encontrado' };
  var origen = Object.assign({}, g, { miembros: g.miembros || [] });
  if (estado === 'publicado' || estado === 'oculto') {
    var pubs = webFilasWeb();
    var conflicto = [];
    (g.miembros || []).forEach(function (a) { for (var i = 0; i < pubs.length; i++) { if (pubs[i].tipo === 'animal' && String(pubs[i].origen_id) === String(a.id) && pubs[i].estado_publicacion === 'publicado') conflicto.push(webTexto(a.nombre) || String(a.id)); } });
    if (conflicto.length) return { status: 'warning', error: 'Conflicto con publicaciones individuales publicadas: ' + conflicto.join(', ') + '. Resuélvelas primero.' };
  }
  if (estado === 'publicado') {
    var check = webValidarPublicacion(previa, origen);
    if (!check.ok) return { status: 'warning', error: 'No se puede publicar: completa los campos obligatorios', detail: check.faltan.map(function (f) { return f.mensaje; }).join(' · '), data: check.faltan };
  }
  var cambios = { estado_publicacion: estado, actualizado_en: webAhora() };
  if (estado === 'publicado' && !previa.publicado_en) cambios.publicado_en = webAhora();
  return { status: 'success', data: updateSheetRow(cfg, previa.id, cambios) };
}
function webArchivarGrupo(body, user) { return webEstadoGrupoPub(Object.assign({}, body || {}, { estado_publicacion: 'retirado' }), user); }
function webRestaurarGrupo(body, user) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var id = webTexto(body && body.id);
  var grupoId = webTexto(body && (body.grupo_id || body.origen_id));
  var previa = id ? webPublicacionPorId(id) : (grupoId ? webPublicacionDeOrigen('animal_grupo', grupoId) : null);
  if (!previa) return { status: 'error', error: 'Publicación no encontrada' };
  if (previa.tipo !== 'animal_grupo') return { status: 'error', error: 'Solo las publicaciones de grupo se restauran desde aquí' };
  if (previa.estado_publicacion !== 'retirado') return { status: 'error', error: 'Solo se puede restaurar una publicación retirada' };
  var guardado = updateSheetRow(cfg, previa.id, { estado_publicacion: 'borrador', actualizado_en: webAhora() });
  return { status: 'success', success: true, data: { id: previa.id, estado_publicacion: 'borrador', slug: previa.slug } };
}
function webEliminarGrupo(body, user) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var grupoId = webTexto(body && (body.grupo_id || body.origen_id));
  var previa = webPublicacionDeOrigen('animal_grupo', grupoId);
  if (!previa) return { status: 'error', error: 'El grupo no tiene publicación web' };
  if (previa.estado_publicacion === 'publicado' || previa.estado_publicacion === 'retirado') return { status: 'error', error: 'No se puede eliminar una publicación publicada o retirada' };
  try { deleteSheetRow(cfg, previa.id); } catch (e) { return { status: 'error', error: 'No se pudo eliminar' }; }
  return { status: 'success', success: true };
}
function webPreviewGrupo(grupoId) {
  var res = webGetGrupo(grupoId);
  if (res.status !== 'success') return res;
  var g = webGrupoInfo(grupoId);
  var origen = g ? Object.assign({}, g, { miembros: g.miembros || [] }) : null;
  return { status: 'success', data: webConstruirPublicacion(res.data, origen, { ficha: true }) };
}

// ==================== GESTOR · EVENTOS E HISTORIAS ====================

function webListarEventos(params) {
  params = params || {};
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var q = webTexto(params.q).toLowerCase();
  var estadoFiltro = webTexto(params.estado_publicacion);
  var tipoFiltro = webTexto(params.tipo);

  // Las retiradas se listan como lapida (410) para poder verlas y depurarlas;
  // el filtro de estado decide si se quieren solo ellas.
  var filas = webFilasWeb().filter(function (p) {
    return p.tipo === 'evento' || p.tipo === 'historia';
  });
  if (tipoFiltro) filas = filas.filter(function (p) { return p.tipo === tipoFiltro; });
  if (estadoFiltro) filas = filas.filter(function (p) { return p.estado_publicacion === estadoFiltro; });
  if (q) {
    filas = filas.filter(function (p) {
      return (p.titulo + ' ' + p.slug + ' ' + p.categoria).toLowerCase().indexOf(q) !== -1;
    });
  }
  filas.sort(function (a, b) {
    var da = a.publicado_en || a.actualizado_en || '';
    var db = b.publicado_en || b.actualizado_en || '';
    return String(db).localeCompare(String(da));
  });
  var data = filas.map(function (p) {
    var check = webValidarPublicacion(p, null);
    return {
      id: p.id, tipo: p.tipo, slug: p.slug, titulo: p.titulo, categoria: p.categoria,
      estado_publicacion: p.estado_publicacion, indexable: p.indexable, listed: p.listed,
      featured: p.featured, orden: p.orden, publicado_en: p.publicado_en, actualizado_en: p.actualizado_en,
      completitud: { ok: check.ok, faltan: check.faltan.map(function (f) { return f.campo; }) }
    };
  });
  return { status: 'success', data: data };
}

function webPreviewEvento(id) {
  var pub = webPublicacionPorId(id);
  if (!pub) return { status: 'error', error: 'Publicación no encontrada' };
  return { status: 'success', data: webConstruirPublicacion(pub, null, { ficha: true }) };
}

function webGetEvento(id) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var pub = webPublicacionPorId(id);
  if (!pub || (pub.tipo !== 'evento' && pub.tipo !== 'historia')) return { status: 'error', error: 'Publicación no encontrada' };
  return { status: 'success', data: pub, completitud: webValidarPublicacion(pub, null) };
}

function webUpsertEvento(body, user) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var id = webTexto(body && body.id);
  var previa = id ? webPublicacionPorId(id) : null;
  if (id && !previa) return { status: 'error', error: 'Publicación no encontrada' };
  if (previa && previa.tipo === 'animal') return { status: 'error', error: 'Los animales se gestionan desde su ficha' };

  var tipo = webTexto(body.tipo);
  if (tipo !== 'evento' && tipo !== 'historia') tipo = previa ? previa.tipo : 'evento';
  var titulo = webTexto(body.titulo);
  if (!titulo) return { status: 'error', error: 'Falta el título' };
  var slug = webNormalizarSlug(body.slug || titulo);
  if (!webSlugValido(slug)) return { status: 'error', error: 'Slug no válido' };
  if (webSlugOcupado(tipo, slug, previa && previa.id)) {
    return { status: 'error', error: 'El slug "' + slug + '" ya está en uso por otra publicación' };
  }

  var fichaVal = (body && (body.ficha !== undefined || body.ficha_json !== undefined))
    ? (body.ficha !== undefined ? body.ficha : body.ficha_json)
    : (previa ? previa.ficha : null);
  var fichaNorm = webNormalizarFicha(fichaVal);
  if (fichaVal && !fichaNorm) return { status: 'error', error: 'La ficha configurable debe ser un objeto JSON' };
  if (fichaNorm && JSON.stringify(fichaNorm).length > WEB_FICHA_MAX_CHARS) {
    return { status: 'error', error: 'La ficha configurable supera el máximo de ' + WEB_FICHA_MAX_CHARS + ' caracteres' };
  }
  var registro = {
    id: (previa && previa.id) || ('web_' + webUuid()),
    tipo: tipo,
    origen_id: '',
    slug: slug,
    estado_publicacion: WEB_ESTADOS.indexOf(webTexto(body.estado_publicacion)) !== -1 ? webTexto(body.estado_publicacion) : 'borrador',
    indexable: webBool(body.indexable, true),
    listed: webBool(body.listed, true),
    featured: webBool(body.featured, false),
    orden: Number(body.orden || 0) || 0,
    titulo: titulo,
    extracto: webTexto(body.extracto),
    contenido_html: String(body.contenido_html || ''),
    categoria: webTexto(body.categoria) || (tipo === 'evento' ? 'Eventos' : 'Historias'),
    estado_publico: webTexto(body.estado_publico) || (tipo === 'evento' ? 'programado' : 'publicado'),
    especie: '',
    autor: webTexto(body.autor),
    tags_json: JSON.stringify(webTagsSeguras(webArray(body.tags))),
    media_json: JSON.stringify((function (m) { var x = (m && typeof m === 'object' && !Array.isArray(m)) ? JSON.parse(JSON.stringify(m)) : {}; delete x.documents; delete x.folderId; return x; })(body.media || {})),
    documents_json: JSON.stringify((body.media && body.media.documents) || webParseJson(body.documents_json, body.documents || [])),
    media_folder_id: webTexto((body.media && body.media.folderId) || body.media_folder_id || ''),
    seo_json: JSON.stringify(body.seo || {}),
    cta_json: JSON.stringify(body.cta || null),
    animal_json: '',
    evento_json: JSON.stringify(body.event || {}),
    ficha_json: fichaNorm ? JSON.stringify(fichaNorm) : '',
    publicado_en: previa && previa.publicado_en ? previa.publicado_en : '',
    actualizado_en: webAhora(),
    creado_en: (previa && previa.creado_en) || webAhora()
  };
  if (registro.estado_publicacion === 'publicado' && !registro.publicado_en) registro.publicado_en = webAhora();
  registro.slug_historial = JSON.stringify(webHistorialDeCambio(previa, slug));

  if (registro.estado_publicacion === 'publicado') {
    var check = webValidarPublicacion(webFilaAPublicacion(registro), null);
    if (!check.ok) {
      return {
        status: 'warning',
        error: 'No se puede publicar: completa los campos obligatorios',
        detail: check.faltan.map(function (f) { return f.mensaje; }).join(' · '),
        data: check.faltan
      };
    }
  }

  try {
    if (previa && previa.id) {
      if (!updateSheetRow(cfg, previa.id, registro)) return { status: 'error', error: 'No se encontró la publicación a actualizar' };
    } else {
      appendToSheet(cfg, registro);
    }
  } catch (err) {
    return { status: 'error', error: 'No se pudo guardar la publicación', detail: err.message };
  }
  try { registrarAuditoria('publicacion_web', 'web_' + tipo, registro.id, user, { estado: registro.estado_publicacion, slug: registro.slug }); } catch (e) {}
  // El deploy lo dispara el router (`Code.gs` → `_webAnotarDeploy`) con el
  // estado resultante: aquí no se llama a GitHub para no tener dos lógicas.
  return { status: 'success', data: webFilaAPublicacion(registro) };
}

function webEstadoEvento(body, user) {
  var id = webTexto(body && body.id);
  if (!id) return { status: 'error', error: 'Falta id' };
  var estado = webTexto(body.estado_publicacion);
  if (WEB_ESTADOS.indexOf(estado) === -1) return { status: 'error', error: 'Estado de publicación no válido' };
  var previa = webPublicacionPorId(id);
  if (!previa) return { status: 'error', error: 'Publicación no encontrada' };
  if (estado === 'publicado') {
    var check = webValidarPublicacion(previa, null);
    if (!check.ok) {
      return {
        status: 'warning',
        error: 'No se puede publicar todavía',
        detail: check.faltan.map(function (f) { return f.mensaje; }).join(' · '),
        data: check.faltan
      };
    }
  }
  var cambios = { estado_publicacion: estado, actualizado_en: webAhora() };
  if (estado === 'publicado' && !previa.publicado_en) cambios.publicado_en = webAhora();
  if (!updateSheetRow(webSheetConfig(), id, cambios)) return { status: 'error', error: 'No se encontró la publicación a actualizar' };
  try { registrarAuditoria('publicacion_web', 'web_' + previa.tipo, id, user, { estado: estado, slug: previa.slug }); } catch (e) {}
  return { status: 'success', data: { id: id, estado_publicacion: estado } };
}

function webArchivarEvento(body, user) {
  var id = webTexto(body && body.id);
  if (!id) return { status: 'error', error: 'Falta id' };
  var previa = webPublicacionPorId(id);
  if (!previa) return { status: 'error', error: 'Publicación no encontrada' };
  if (previa.tipo === 'animal') return { status: 'error', error: 'Los animales no se archivan desde aquí' };
  if (previa.estado_publicacion === 'retirado') {
    return { status: 'success', success: true, data: { id: id, estado_publicacion: 'retirado', slug: previa.slug } };
  }
  // No se borra la fila: el slug queda como lapida para responder 410 (gone)
  // y para que no se pueda reutilizar en otra publicacion.
  var cambios = { estado_publicacion: 'retirado', listed: false, indexable: false, actualizado_en: webAhora() };
  if (!updateSheetRow(webSheetConfig(), id, cambios)) return { status: 'error', error: 'No se encontró la publicación a retirar' };
  try { registrarAuditoria('retirar_publicacion', 'web_' + previa.tipo, id, user, { slug: previa.slug }); } catch (e) {}
  return { status: 'success', success: true, data: { id: id, estado_publicacion: 'retirado', slug: previa.slug } };
}

function webRestaurarEvento(body, user) {
  var id = webTexto(body && body.id);
  if (!id) return { status: 'error', error: 'Falta id' };
  var previa = webPublicacionPorId(id);
  if (!previa) return { status: 'error', error: 'Publicación no encontrada' };
  if (previa.tipo === 'animal') return { status: 'error', error: 'Los animales no se restauran desde aquí' };
  if (previa.estado_publicacion !== 'retirado') {
    return { status: 'success', success: true, data: { id: id, estado_publicacion: previa.estado_publicacion, slug: previa.slug } };
  }
  var cambios = { estado_publicacion: 'borrador', listed: true, indexable: true, actualizado_en: webAhora() };
  if (!updateSheetRow(webSheetConfig(), id, cambios)) return { status: 'error', error: 'No se encontró la publicación a restaurar' };
  try { registrarAuditoria('restaurar_publicacion', 'web_' + previa.tipo, id, user, { slug: previa.slug, estado: 'borrador' }); } catch (e) {}
  // Restaurar quita la lápida: el router lo trata como cambio de lo publicado
  // aunque el estado resultante sea `borrador`.
  return { status: 'success', success: true, data: { id: id, estado_publicacion: 'borrador', slug: previa.slug } };
}

// ==================== UTILIDADES DEL GESTOR ====================

function webSlugCheck(params) {
  var tipo = webTexto(params.tipo) || 'animal';
  if (WEB_TIPOS.indexOf(tipo) === -1) return { status: 'error', error: 'Tipo no válido' };
  var normalizado = webNormalizarSlug(params.slug);
  var conflicto = null;
  var filas = webFilasWeb();
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].tipo !== tipo) continue;
    if (params.id && String(filas[i].id) === String(params.id)) continue;
    if (filas[i].slug === normalizado) { conflicto = { id: filas[i].id, titulo: filas[i].titulo }; break; }
    var hist = filas[i].slug_historial || [];
    for (var k = 0; k < hist.length; k++) {
      if (hist[k].slug === normalizado) { conflicto = { id: filas[i].id, titulo: filas[i].titulo, historico: true }; break; }
    }
    if (conflicto) break;
  }
  return {
    status: 'success',
    data: {
      disponible: !!normalizado && webSlugValido(normalizado) && !conflicto,
      normalizado: normalizado,
      valido: webSlugValido(normalizado),
      conflicto: conflicto
    }
  };
}

function webResumen() {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var filas = webFilasWeb();
  var mapa = webMapaAnimales();
  var mapaGruposAll = webMapaGrupos();
  var resumen = {
    animal: { total: 0, publicados: 0, borradores: 0, ocultos: 0, retirados: 0, sin_publicar: 0 },
    animal_grupo: { total: 0, publicados: 0, borradores: 0, ocultos: 0, retirados: 0, sin_publicar: 0 },
    evento: { total: 0, publicados: 0, borradores: 0, ocultos: 0, retirados: 0 },
    historia: { total: 0, publicados: 0, borradores: 0, ocultos: 0, retirados: 0 }
  };

  Object.keys(mapa).forEach(function (id) {
    var pub = null;
    for (var i = 0; i < filas.length; i++) if (filas[i].tipo === 'animal' && String(filas[i].origen_id) === String(id)) { pub = filas[i]; break; }
    resumen.animal.total++;
    if (!pub) resumen.animal.sin_publicar++;
    else if (pub.estado_publicacion === 'publicado') resumen.animal.publicados++;
    else if (pub.estado_publicacion === 'oculto') resumen.animal.ocultos++;
    else if (pub.estado_publicacion === 'retirado') resumen.animal.retirados++;
    else resumen.animal.borradores++;
  });
  Object.keys(mapaGruposAll).forEach(function (id) {
    var g = mapaGruposAll[id];
    if (!g || !g.grupo_obligatorio) return;
    var pub = null;
    for (var j = 0; j < filas.length; j++) if (filas[j].tipo === 'animal_grupo' && String(filas[j].origen_id) === String(id)) { pub = filas[j]; break; }
    resumen.animal_grupo.total++;
    if (!pub) resumen.animal_grupo.sin_publicar++;
    else if (pub.estado_publicacion === 'publicado') resumen.animal_grupo.publicados++;
    else if (pub.estado_publicacion === 'oculto') resumen.animal_grupo.ocultos++;
    else if (pub.estado_publicacion === 'retirado') resumen.animal_grupo.retirados++;
    else resumen.animal_grupo.borradores++;
  });
  filas.forEach(function (p) {
    if (p.tipo === 'animal' || p.tipo === 'animal_grupo') return;
    var r = resumen[p.tipo] || resumen.historia;
    r.total++;
    if (p.estado_publicacion === 'publicado') r.publicados++;
    else if (p.estado_publicacion === 'oculto') r.ocultos++;
    else if (p.estado_publicacion === 'retirado') r.retirados++;
    else r.borradores++;
  });

  var incompletas = 0;
  var sinSeo = 0;
  filas.forEach(function (p) {
    // Una retirada no se puede completar: no debe engordar los pendientes.
    if (p.estado_publicacion === 'retirado') return;
    var origen = webOrigenDePublicacion(p, mapa, webMapaGrupos());
    if (!webValidarPublicacion(p, origen).ok) incompletas++;

    if (!webTexto((p.seo || {}).metaDescription) && !p.extracto) sinSeo++;
  });

  return {
    status: 'success',
    data: {
      resumen: resumen,
      totales: {
        publicados: resumen.animal.publicados + resumen.animal_grupo.publicados + resumen.evento.publicados + resumen.historia.publicados,
        borradores: resumen.animal.borradores + resumen.animal_grupo.borradores + resumen.evento.borradores + resumen.historia.borradores,
        ocultos: resumen.animal.ocultos + resumen.animal_grupo.ocultos + resumen.evento.ocultos + resumen.historia.ocultos,
        retirados: resumen.animal.retirados + resumen.animal_grupo.retirados + resumen.evento.retirados + resumen.historia.retirados,
        sin_publicar: resumen.animal.sin_publicar + resumen.animal_grupo.sin_publicar,
        incompletas: incompletas,
        sin_seo: sinSeo
      },
      generado_en: webAhora()
    }
  };
}

// ==================== MEDIA · UNA CARPETA POR FICHA ====================

/** Tamaño aproximado del binario de un base64 (sin decodificarlo). */
function webBytesAprox(base64) {
  var limpio = String(base64 || '').replace(/\s+/g, '');
  if (!limpio) return 0;
  var pad = limpio.slice(-2) === '==' ? 2 : (limpio.slice(-1) === '=' ? 1 : 0);
  return Math.floor((limpio.length * 3) / 4) - pad;
}

/**
 * Raíz de media de la web (`CONFIG.DRIVE_WEB_FOLDER_ID`). Esa carpeta no se
 * comparte: cada archivo se publica por separado (ANYONE_WITH_LINK).
 */
function webRaizMedia() {
  var id = webTexto(typeof CONFIG !== 'undefined' ? CONFIG.DRIVE_WEB_FOLDER_ID : '');
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (err) { return null; }
}

var WEB_CARPETAS_TIPO = { animal: 'animales', animal_grupo: 'animales', evento: 'eventos', historia: 'historias' };

/** Carpeta de tipo dentro de la raíz (animales, eventos, historias). */
function webCarpetaTipo(raiz, tipo) {
  var nombre = WEB_CARPETAS_TIPO[tipo] || 'publicaciones';
  var it = raiz.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : raiz.createFolder(nombre);
}

/** Ruta visible de la carpeta de una ficha: `<tipo>/<slug>`. */
function webRutaCarpeta(p) {
  var tipo = webTexto(p && p.tipo);
  var carpeta = WEB_CARPETAS_TIPO[tipo] || 'publicaciones';
  return carpeta + '/' + (webTexto(p && p.slug) || webTexto(p && p.id) || 'sin-slug');
}

/**
 * Carpeta de la ficha dentro de la raíz de media. Se busca por nombre y se
 * crea si no existe, así la ficha siempre tiene la misma carpeta aunque se
 * suba desde otra sesión o se recargue el gestor.
 */
function webCarpetaPublicacion(p) {
  if (!p || !p.id) return { error: 'Falta la publicación' };
  var raiz = webRaizMedia();
  if (!raiz) return { error: 'DRIVE_WEB_FOLDER_ID no configurado en Config.gs' };
  try {
    var carpetaTipo = webCarpetaTipo(raiz, webTexto(p.tipo));
    var slug = webTexto(p.slug) || webTexto(p.id) || 'sin-slug';
    var it = carpetaTipo.getFoldersByName(slug);
    var carpeta = it.hasNext() ? it.next() : carpetaTipo.createFolder(slug);
    return { folder: carpeta, folderId: carpeta.getId(), nombre: webRutaCarpeta(p) };
  } catch (err) {
    return { error: 'No se pudo abrir la carpeta de la ficha: ' + err.message };
  }
}

var WEB_MEDIA_TIPOS = {
  portada: { prefijo: 'portada', mimes: ['image/'], maxBytes: 5 * 1024 * 1024 },
  galeria: { prefijo: 'galeria', mimes: ['image/'], maxBytes: 5 * 1024 * 1024 },
  video: { prefijo: 'video', mimes: ['video/'], maxBytes: 15 * 1024 * 1024 },
  documento: { prefijo: 'documento', mimes: ['application/pdf', 'image/', 'video/'], maxBytes: 10 * 1024 * 1024 }
};

function webExtensionMedia(mime) {
  var m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return '.pdf';
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m.indexOf('video/webm') === 0) return '.webm';
  if (m.indexOf('video/') === 0) return '.mp4';
  return '.bin';
}

/** Nombre ordenado y sin acentos: `<tipo>-<original>-<uuid corto><ext>`. */
function webNombreArchivo(tipo, original, mime) {
  var def = WEB_MEDIA_TIPOS[tipo] || WEB_MEDIA_TIPOS.documento;
  var base = String(original || '').replace(/\.[^.]+$/, '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'archivo';
  return def.prefijo + '-' + base + '-' + String(Utilities.getUuid()).slice(0, 8) + webExtensionMedia(mime);
}

/**
 * Sube una imagen, vídeo o documento a la carpeta de la ficha.
 * `tipo`: portada | galeria | video | documento.
 */
function webSubirMedia(body) {
  body = body || {};
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var p = webPublicacionPorId(body.publicacion_id);
  if (!p) return { status: 'error', error: 'Publicación no encontrada' };
  var tipo = webTexto(body.tipo) || 'documento';
  var def = WEB_MEDIA_TIPOS[tipo];
  if (!def) return { status: 'error', error: 'Tipo de media no válido (portada, galeria, video o documento)' };

  var base64 = String(body.archivo_base64 || '');
  var coma = base64.indexOf(',');
  if (base64.indexOf('data:') === 0 && coma !== -1) base64 = base64.substring(coma + 1);
  base64 = base64.replace(/\s+/g, '');
  if (!base64) return { status: 'error', error: 'Falta archivo_base64' };

  if (webBytesAprox(base64) > def.maxBytes) {
    return { status: 'error', error: 'Archivo demasiado grande (máx. ' + Math.round(def.maxBytes / 1024 / 1024) + ' MB)' };
  }

  var mime = String(body.mime_type || '').toLowerCase();
  var permitido = def.mimes.some(function (prefijo) { return mime.indexOf(prefijo) === 0; });
  if (!permitido) return { status: 'error', error: 'Tipo de archivo no permitido para «' + tipo + '»' };

  var carpeta = webCarpetaPublicacion(p);
  if (carpeta.error) return { status: 'error', error: carpeta.error };

  try {
    var nombre = webNombreArchivo(tipo, body.nombre, mime);
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, nombre);
    var file = carpeta.folder.createFile(blob);
    // Imágenes y vídeos se comparten (los consume la web); los documentos no.
    // Ni la raíz ni la carpeta de la ficha se comparten.
    if (mime.indexOf('image/') === 0 || mime.indexOf('video/') === 0) {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    return {
      status: 'success',
      data: {
        fileId: file.getId(),
        nombre: nombre,
        tipo: tipo,
        carpeta: carpeta.nombre,
        carpeta_id: carpeta.folderId,
        carpeta_url: carpeta.folder.getUrl(),
        url: mime.indexOf('image/') === 0
          ? 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600'
          : file.getUrl(),
        download: 'https://drive.google.com/uc?id=' + file.getId() + '&export=download'
      }
    };
  } catch (err) {
    Logger.log('webSubirMedia error: ' + err.message);
    return { status: 'error', error: 'Error subiendo a Drive: ' + err.message };
  }
}

/**
 * Borra (a la papelera) un archivo de la media de la web. Con
 * `publicacion_id` solo se acepta si el archivo está en la carpeta de esa
 * ficha; sin publicación, si está dentro del árbol de `DRIVE_WEB_FOLDER_ID`.
 * Nunca se puede borrar nada ajeno a la carpeta de media.
 */
function webEliminarMedia(body) {
  var cfg = webSheetConfig();
  if (!cfg) return webDiagnostico();
  var fileId = webTexto(body && (body.file_id || body.fileId));
  if (!fileId) return { status: 'error', error: 'Falta file_id' };
  var raiz = webRaizMedia();
  if (!raiz) return { status: 'error', error: 'DRIVE_WEB_FOLDER_ID no configurado en Config.gs' };

  var carpetaFichaId = '';
  var publicacionId = webTexto(body && body.publicacion_id);
  if (publicacionId) {
    var p = webPublicacionPorId(publicacionId);
    if (!p) return { status: 'error', error: 'Publicación no encontrada' };
    var carpeta = webBuscarCarpetaFicha(p);
    if (carpeta.error) return { status: 'error', error: carpeta.error };
    // Sin carpeta no hay nada que borrar en esta ficha. No se cae al chequeo
    // del árbol: eso dejaría borrar archivos de otras publicaciones pasando
    // el id de una ficha que nunca subió media.
    if (!carpeta.folderId) return { status: 'error', error: 'La publicación no tiene carpeta de media: no hay archivos que borrar' };
    carpetaFichaId = carpeta.folderId;
  }

  try {
    var file = DriveApp.getFileById(fileId);
    var dentro = false;
    var padres = file.getParents();
    while (padres.hasNext()) {
      var padre = padres.next();
      if (carpetaFichaId) {
        if (padre.getId() === carpetaFichaId) dentro = true;
      } else if (webCarpetaEnArbolMedia(padre, raiz.getId(), 0)) {
        dentro = true;
      }
      if (dentro) break;
    }
    if (!dentro) return { status: 'error', error: 'El archivo no pertenece a la carpeta de esta publicación' };
    var nombre = file.getName();
    // Imágenes y vídeos se comparten al subirlos (ANYONE_WITH_LINK) y la
    // papelera no quita el permiso: se revoca antes, para que «eliminar»
    // deje de servir el archivo desde su URL.
    try {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    } catch (errPermiso) {
      Logger.log('webEliminarMedia permiso: ' + errPermiso.message);
    }
    file.setTrashed(true);
    return { status: 'success', success: true, data: { fileId: fileId, nombre: nombre, eliminado: true } };
  } catch (err) {
    return { status: 'error', error: 'No se pudo borrar el archivo: ' + err.message };
  }
}

/** Carpeta de la ficha sin crearla (para comprobar antes de borrar). */
function webBuscarCarpetaFicha(p) {
  var raiz = webRaizMedia();
  if (!raiz) return { error: 'DRIVE_WEB_FOLDER_ID no configurado en Config.gs' };
  try {
    var nombreTipo = WEB_CARPETAS_TIPO[webTexto(p && p.tipo)] || 'publicaciones';
    var itTipo = raiz.getFoldersByName(nombreTipo);
    if (!itTipo.hasNext()) return { folderId: '', nombre: webRutaCarpeta(p) };
    var carpetaTipo = itTipo.next();
    var slug = webTexto(p && p.slug) || webTexto(p && p.id) || 'sin-slug';
    var it = carpetaTipo.getFoldersByName(slug);
    if (!it.hasNext()) return { folderId: '', nombre: webRutaCarpeta(p) };
    return { folderId: it.next().getId(), nombre: webRutaCarpeta(p) };
  } catch (err) {
    return { error: 'No se pudo abrir la carpeta de la ficha: ' + err.message };
  }
}

/** ¿La carpeta cuelga del árbol de la raíz de media? (máx. 4 niveles). */
function webCarpetaEnArbolMedia(carpeta, raizId, nivel) {
  if (!carpeta || !raizId) return false;
  nivel = nivel || 0;
  if (nivel > 4) return false;
  if (carpeta.getId() === raizId) return true;
  var padres = carpeta.getParents();
  while (padres.hasNext()) {
    if (webCarpetaEnArbolMedia(padres.next(), raizId, nivel + 1)) return true;
  }
  return false;
}

// ==================== DESPLIEGUE AUTOMÁTICO ====================
//
// El cron de GitHub Pages no es puntual (puede retrasarse horas o no llegar),
// así que publicar, editar o retirar dispara el workflow por API. El token
// vive en las propiedades del script (`GITHUB_DEPLOY_TOKEN`), nunca en el repo.

var WEB_DEPLOY_DEFECTOS = { repo: 'gn-admin/admin-dashboard', ref: 'main', workflow: 'deploy.yml' };
// Marcador de versión del backend: `web-deploy-estado` lo devuelve para poder
// distinguir si el panel habla con una implementación antigua.
var WEB_DEPLOY_VERSION = '2026-11-15.6';
var WEB_DEPLOY_DEDUPE_SEG = 60;

function webDeployPropiedades() {
  try { return PropertiesService.getScriptProperties(); } catch (err) { return null; }
}

function webDeployConfig() {
  var props = webDeployPropiedades();
  var leer = function (clave, defecto) {
    var v = '';
    try { v = props ? webTexto(props.getProperty(clave)) : ''; } catch (err) { v = ''; }
    return v || defecto;
  };
  return {
    token: leer('GITHUB_DEPLOY_TOKEN', ''),
    repo: leer('GITHUB_DEPLOY_REPO', WEB_DEPLOY_DEFECTOS.repo),
    ref: leer('GITHUB_DEPLOY_REF', WEB_DEPLOY_DEFECTOS.ref),
    workflow: leer('GITHUB_DEPLOY_WORKFLOW', WEB_DEPLOY_DEFECTOS.workflow)
  };
}

/** Estado de la configuración del deploy (nunca devuelve el token). */
function webDeployEstado() {
  var cfg = webDeployConfig();
  return { status: 'success', data: { configurado: !!cfg.token, repo: cfg.repo, ref: cfg.ref, workflow: cfg.workflow, version: WEB_DEPLOY_VERSION } };
}

/**
 * Lanza `workflow_dispatch` del deploy de Pages. Nunca lanza excepción: si
 * falta el token o GitHub falla se devuelve el motivo y la acción principal
 * (publicar, guardar, retirar) sigue siendo un éxito.
 */
function webDispararDeploy(motivo, opciones) {
  opciones = opciones || {};
  var cfg = webDeployConfig();
  if (!cfg.token) return { ok: false, disparado: false, error: 'Deploy automático sin configurar (falta GITHUB_DEPLOY_TOKEN)' };

  try {
    var cache = CacheService.getScriptCache();
    if (cache && !opciones.forzar) {
      if (cache.get('web-deploy')) return { ok: true, disparado: false, motivo: 'en_cola' };
      cache.put('web-deploy', '1', WEB_DEPLOY_DEDUPE_SEG);
    }
  } catch (err) { /* sin caché se sigue: mejor un deploy de más que ninguno */ }

  var url = 'https://api.github.com/repos/' + cfg.repo + '/actions/workflows/' + cfg.workflow + '/dispatches';
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + cfg.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      payload: JSON.stringify({ ref: cfg.ref }),
      muteHttpExceptions: true
    });
    var codigo = res.getResponseCode();
    if (codigo >= 200 && codigo < 300) return { ok: true, disparado: true, codigo: codigo };
    Logger.log('webDispararDeploy ' + codigo + ': ' + String(res.getContentText()).slice(0, 300));
    return { ok: false, disparado: false, codigo: codigo, error: 'GitHub respondió ' + codigo };
  } catch (err) {
    Logger.log('webDispararDeploy error: ' + err.message);
    return { ok: false, disparado: false, error: 'No se pudo llamar a GitHub: ' + err.message };
  }
}

/**
 * Prueba manual del deploy, para lanzar desde el editor de Apps Script:
 * seleccionar `webDeployProbar` → Ejecutar → Registro de ejecución. Si el
 * token está bien, devuelve `{"ok":true,"disparado":true,"codigo":204}`.
 */
function webDeployProbar() {
  var resultado = webDispararDeploy('prueba-manual', { forzar: true });
  Logger.log(JSON.stringify(webDeployEstado().data) + ' → ' + JSON.stringify(resultado));
  return resultado;
}

// ==================== CANAL PÚBLICO ====================

function webPublicables() {
  var publicadas = webFilasWeb().filter(function (p) {
    return p.estado_publicacion === 'publicado' && p.listed !== false;
  });
  // Deduplicación por animal: una ficha no puede salir dos veces (individual y
  // en su grupo). Los datos antiguos pueden tener las dos publicadas, y las
  // guardas de escritura solo cubren las transiciones nuevas. Cuando el grupo
  // está publicado, manda el grupo.
  var gruposVigentes = {};
  var hayGrupo = false;
  for (var i = 0; i < publicadas.length; i++) {
    if (publicadas[i].tipo === 'animal_grupo') {
      gruposVigentes[String(publicadas[i].origen_id)] = true;
      hayGrupo = true;
    }
  }
  if (!hayGrupo) return publicadas;
  var mapaAnimales = webMapaAnimales();
  return publicadas.filter(function (p) {
    if (p.tipo !== 'animal') return true;
    var a = mapaAnimales[String(p.origen_id)];
    if (!a) return true;
    var gid = webTexto(a.grupo_id || a.grupo);
    return !(gid && gruposVigentes[String(gid)]);
  });
}

/**
 * Slugs retirados (lapida) con sus slugs historicos. La web los usa para
 * publicar una pagina estatica de retirada (410 logico) en lugar de un 404.
 */
function webRetiradas() {
  var diag = webDiagnostico();
  if (diag) return diag;
  var out = [];
  var vistos = {};
  webFilasWeb().forEach(function (p) {
    if (p.estado_publicacion !== 'retirado') return;
    var slugs = [p.slug].concat((p.slug_historial || []).map(function (h) { return h.slug; }));
    slugs.forEach(function (s) {
      if (!s || vistos[s]) return;
      vistos[s] = true;
      out.push({ slug: s, tipo: p.tipo, retiradoEn: p.actualizado_en || p.publicado_en || '' });
    });
  });
  return { status: 'success', data: out };
}

function webListarPublicas(params) {
  var diag = webDiagnostico();
  if (diag) return diag;
  params = params || {};
  var mapa = webMapaAnimales();
  var mapaGrupos = webMapaGrupos();
  var pubs = webPublicables();
  var todas = pubs.map(function (p) {
    return webConstruirPublicacion(p, webOrigenDePublicacion(p, mapa, mapaGrupos));
  });


  var disponibles = {
    type: [], category: [], status: [], species: []
  };
  var push = function (arr, v) { if (v && arr.indexOf(v) === -1) arr.push(v); };
  todas.forEach(function (p) {
    push(disponibles.type, p.type);
    push(disponibles.category, p.category);
    push(disponibles.status, p.status);
    if (p.animal && p.animal.species) push(disponibles.species, String(p.animal.species).toLowerCase());
  });

  var f = {
    type: webTexto(params.type),
    category: webTexto(params.category),
    status: webTexto(params.status),
    species: webTexto(params.species).toLowerCase(),
    q: webTexto(params.q)
  };
  var data = todas.filter(function (p) {
    if (f.type && p.type !== f.type) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.species && String((p.animal && p.animal.species) || '').toLowerCase() !== f.species) return false;
    if (f.q) {
      var heno = (p.title + ' ' + p.excerpt + ' ' + p.contentHtml + ' ' + (p.tags || []).join(' ')).toLowerCase();
      if (heno.indexOf(f.q.toLowerCase()) === -1) return false;
    }
    return true;
  });

  var orden = webTexto(params.sort) || '-publishedAt';
  var campo = orden.charAt(0) === '-' ? orden.slice(1) : orden;
  var desc = orden.charAt(0) === '-';
  data.sort(function (a, b) {
    // Los urgentes van primero (D2); después se aplica el criterio pedido.
    var ua = a.urgent ? 1 : 0;
    var ub = b.urgent ? 1 : 0;
    if (ua !== ub) return ub - ua;
    var va = campo === 'title' ? a.title : (campo === 'updatedAt' ? a.updatedAt : a.publishedAt);
    var vb = campo === 'title' ? b.title : (campo === 'updatedAt' ? b.updatedAt : b.publishedAt);
    var r = String(va || '').localeCompare(String(vb || ''));
    return desc ? -r : r;
  });

  var page = Math.max(1, parseInt(params.page, 10) || 1);
  var pageSize = Math.min(WEB_PAGE_SIZE_MAX, Math.max(1, parseInt(params.pageSize, 10) || WEB_PAGE_SIZE_DEF));
  var total = data.length;
  var paginadas = data.slice((page - 1) * pageSize, page * pageSize);
  var card = webTexto(params.fields) === 'card';
  if (card) paginadas = paginadas.map(webProyeccionCard);

  return {
    status: 'success',
    endpoint: 'GET /api/publicaciones',
    generatedAt: webAhora(),
    filters: {
      type: disponibles.type,
      category: disponibles.category,
      status: disponibles.status,
      species: disponibles.species,
      q: f.q
    },
    applied: f,
    pagination: { page: page, pageSize: pageSize, total: total, totalPages: Math.ceil(total / pageSize) || 0 },
    data: paginadas
  };
}

function webProyeccionCard(p) {
  return {
    id: p.id, slug: p.slug, type: p.type, category: p.category, status: p.status,
    title: p.title, excerpt: p.excerpt, publishedAt: p.publishedAt, updatedAt: p.updatedAt,
    coverImage: p.coverImage, image: p.image, imageAlt: p.imageAlt,
    url: p.url, featured: p.featured, urgent: !!p.urgent,
    animal: p.animal ? { species: p.animal.species, age: p.animal.age, sex: p.animal.sex } : undefined
  };
}

function webPublicacionPublica(slug) {
  var diag = webDiagnostico();
  if (diag) return diag;
  var s = webNormalizarSlug(slug);
  if (!s) return { status: 'error', error: 'Falta slug' };
  var mapa = webMapaAnimales();
  var mapaGrupos = webMapaGrupos();
  var pubs = webPublicables();
  for (var i = 0; i < pubs.length; i++) {
    if (pubs[i].slug === s) {
      return { status: 'success', data: webConstruirPublicacion(pubs[i], webOrigenDePublicacion(pubs[i], mapa, mapaGrupos), { ficha: true }) };
    }
  }
  // Slug antiguo: se devuelve la ficha actual con la redireccion permanente.
  for (var j = 0; j < pubs.length; j++) {
    var hist = pubs[j].slug_historial || [];
    for (var k = 0; k < hist.length; k++) {
      if (hist[k].slug !== s) continue;
      return {
        status: 'success',
        redirect: {
          from: webRutaPublica(pubs[j].tipo, s),
          to: webRutaPublica(pubs[j].tipo, pubs[j].slug),
          slug: pubs[j].slug,
          permanent: true
        },
        data: webConstruirPublicacion(pubs[j], webOrigenDePublicacion(pubs[j], mapa, mapaGrupos), { ficha: true })
      };
    }
  }

  // Ficha individual superada por la publicación de su grupo (deduplicación
  // de H-1): el detalle no la sirve, pero el enlace se conserva con una 301 al
  // grupo, igual que un slug antiguo. Así ni el canal ni las estáticas pueden
  // publicar al mismo animal dos veces.
  var todas = webFilasWeb();
  for (var d = 0; d < todas.length; d++) {
    var indiv = todas[d];
    if (indiv.tipo !== 'animal' || indiv.estado_publicacion !== 'publicado') continue;
    if (!webSlugCoincide(indiv, s)) continue;
    // El grupo servido (`pubs`) es el que manda; si no está, la individual sigue viva.
    var animalIndiv = mapa[String(indiv.origen_id)];
    var gidIndiv = animalIndiv ? webTexto(animalIndiv.grupo_id || animalIndiv.grupo) : '';
    if (!gidIndiv) continue;
    var grupoServido = null;
    for (var gs = 0; gs < pubs.length; gs++) {
      if (pubs[gs].tipo === 'animal_grupo' && String(pubs[gs].origen_id) === String(gidIndiv)) { grupoServido = pubs[gs]; break; }
    }
    if (!grupoServido) continue;
    return {
      status: 'success',
      redirect: {
        from: webRutaPublica('animal', s),
        to: webRutaPublica('animal_grupo', grupoServido.slug),
        slug: grupoServido.slug,
        permanent: true,
        motivo: 'ficha_en_grupo'
      },
      data: webConstruirPublicacion(grupoServido, webOrigenDePublicacion(grupoServido, mapa, mapaGrupos), { ficha: true })
    };
  }

  // Lapida: el slug existio y se retiro. Se responde `gone` (410 logico) en
  // lugar de un 404, para que la web y los buscadores lo traten como retirado.
  for (var r = 0; r < todas.length; r++) {
    if (todas[r].estado_publicacion !== 'retirado' || !webSlugCoincide(todas[r], s)) continue;
    return {
      status: 'gone',
      code: 'gone',
      error: 'Esta publicación se ha retirado',
      data: { slug: todas[r].slug, tipo: todas[r].tipo, retirado_en: todas[r].actualizado_en || '' }
    };
  }
  return { status: 'error', error: 'Publicación no encontrada' };
}

/** Mapa de redirecciones 301 (slugs antiguos -> slug actual) para la web. */
function webRedirects() {
  var diag = webDiagnostico();
  if (diag) return diag;
  var base = webDominioPublico();
  var out = [];
  var servidas = webPublicables();
  var vistos = {};
  servidas.forEach(function (p) {
    (p.slug_historial || []).forEach(function (h) {
      if (!h.slug || h.slug === p.slug) return;
      vistos[String(h.slug)] = true;
      out.push({
        from: (base || '') + webRutaPublica(p.tipo, h.slug),
        to: (base || '') + webRutaPublica(p.tipo, p.slug),
        status: 301,
        type: p.tipo,
        slug: h.slug,
        currentSlug: p.slug,
        changedAt: h.fecha || ''
      });
    });
  });
  // Fichas individuales superadas por la publicación de su grupo: la web
  // conserva el enlace con una 301 al grupo (mismo tratamiento que un slug
  // antiguo) en lugar de servir al animal dos veces.
  var filas = webFilasWeb();
  var mapaAnimales = webMapaAnimales();
  var individuales = {};
  filas.forEach(function (p) { if (p.tipo === 'animal') individuales[String(p.origen_id)] = p; });
  servidas.forEach(function (g) {
    if (g.tipo !== 'animal_grupo') return;
    webMiembrosDeGrupo(g.origen_id, mapaAnimales).forEach(function (a) {
      var pa = individuales[String(a.id)];
      if (!pa || pa.estado_publicacion !== 'publicado' || !pa.slug || pa.slug === g.slug) return;
      // El slug actual y los históricos de la ficha superada apuntan al grupo.
      var slugs = [{ slug: pa.slug, fecha: pa.actualizado_en }].concat(pa.slug_historial || []);
      slugs.forEach(function (x) {
        if (!x.slug || x.slug === g.slug || vistos[String(x.slug)]) return;
        vistos[String(x.slug)] = true;
        out.push({
          from: (base || '') + webRutaPublica('animal', x.slug),
          to: (base || '') + webRutaPublica('animal_grupo', g.slug),
          status: 301,
          type: 'animal',
          slug: x.slug,
          currentSlug: g.slug,
          motivo: 'ficha_en_grupo',
          changedAt: x.fecha || ''
        });
      });
    });
  });
  return { status: 'success', generatedAt: webAhora(), data: out };
}

function webTaxonomias() {
  var lista = webListarPublicas({ pageSize: WEB_PAGE_SIZE_MAX });
  if (lista.status === 'warning') return lista;
  return {
    status: 'success',
    data: {
      type: lista.filters.type,
      category: lista.filters.category,
      status: lista.filters.status,
      species: lista.filters.species
    }
  };
}

function webConfigPublica() {
  var base = webPublicacionBaseUrl();
  return {
    status: 'success',
    data: {
      site: { name: 'Grupo Nebak', url: base },
      contact: { email: webTexto(typeof CONFIG !== 'undefined' ? CONFIG.CONTACT_EMAIL : ''), phone: '' },
      seo: {
        defaultTitle: 'Grupo Nebak · Protección animal',
        defaultDescription: 'Adopciones, acogidas e historias de la protectora Grupo Nebak.',
        robots: 'index,follow',
        baseUrl: base
      },
      locales: { default: 'es-ES' }
    }
  };
}

function webSitemap() {
  var diag = webDiagnostico();
  if (diag) return diag;
  var base = webDominioPublico();
  if (!base) {
    // Sin dominio real no hay URLs de ficha válidas: mejor un sitemap vacío.
    return { status: 'success', generatedAt: webAhora(), data: [], notice: 'Sin dominio público: la base actual es la demo de GitHub Pages' };
  }
  var mapa = webMapaAnimales();
  // Sale de `webPublicables` (publicado + listado + sin duplicados por grupo):
  // si se leyera la hoja entera, la ficha individual superada por su grupo
  // seguiría entrando en el sitemap y las estáticas duplicarían el animal.
  var urls = webPublicables()
    .filter(function (p) { return p.indexable; })
    .map(function (p) {
      var ruta = webRutaPublica(p.tipo, p.slug);
      return {
        loc: base ? base + ruta : ruta,
        lastmod: p.actualizado_en || p.publicado_en || '',
        changefreq: (p.tipo === 'animal' || p.tipo === 'animal_grupo') ? 'weekly' : 'monthly',

        priority: p.featured ? 0.9 : 0.7,
        type: p.tipo,
        slug: p.slug,
        title: p.titulo
      };
    });
  return { status: 'success', generatedAt: webAhora(), data: urls };
}
