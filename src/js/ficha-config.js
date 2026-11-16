/**
 * C3 · configuración de ficha pública v1.1.
 *
 * Helpers puros de normalización/validación del objeto `ficha` (aditivo).
 * Los comparten el gestor (`src/js/web.js`), el visor y el prerender
 * (`src/js/publico.js`), y replican las mismas reglas que el backend
 * (`webNormalizarFicha` en `apps-script/WebPublicaciones.gs`).
 *
 * Reglas clave:
 * - Ausencia de `ficha` => comportamiento actual (no forzar estructura).
 * - Listados/secciones (20+ ítems) NO deben incluir la ficha completa: solo detalle/prerender.
 * - Valores cerrados y saneado defensivo; mantener compatibilidad con datos antiguos.
 * - Precedencia: si `ficha` define `icons`, `gallery`, `videos`, `tags` o `cta`,
 *   prevalecen sobre los campos base de la publicación.
 * - Orden de bloques: `ficha.orden` se valida, deduplica y completa con los
 *   bloques que falten en el orden por defecto.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FichaConfig = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PLANTILLAS = ['ficha', 'historia'];
  const CTA_KINDS = ['adopcion', 'acogida', 'contacto', 'url'];
  const VIDEO_MODOS = ['enlace', 'embed'];
  // Orden por defecto: reproduce el layout histórico del visor.
  const ORDEN_DEF = ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta'];
  const BLOQUES_DEF = {
    datos: true,
    etiquetas: true,
    contenido: true,
    galeria: true,
    videos: true,
    fichaAnimal: true,
    cta: true
  };
  const CAMPOS_PRECEDENCIA = ['icons', 'gallery', 'videos', 'tags', 'cta'];

  function esObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function txt(v, max) {
    if (v == null) return '';
    let s = String(v).trim();
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }
  function bool(v, def) {
    if (v === true || v === false) return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return def;
  }

  function normalizarBloques(b) {
    const src = esObj(b) ? b : {};
    const out = {};
    for (const k of Object.keys(BLOQUES_DEF)) out[k] = bool(src[k], BLOQUES_DEF[k]);
    return out;
  }

  /** Orden cerrado: solo claves conocidas, sin duplicados y completo. */
  function normalizarOrden(orden) {
    const out = [];
    const src = Array.isArray(orden) ? orden : [];
    for (const item of src) {
      const k = txt(item, 30);
      if (!Object.prototype.hasOwnProperty.call(BLOQUES_DEF, k)) continue;
      if (out.includes(k)) continue;
      out.push(k);
    }
    for (const k of ORDEN_DEF) if (!out.includes(k)) out.push(k);
    return out;
  }

  /** Etiquetas propias de la ficha: máximo 20, 40 caracteres y sin duplicados. */
  function normalizarTags(tags) {
    const src = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',') : []);
    const out = [];
    for (const item of src) {
      const v = txt(item, 40);
      if (!v || out.includes(v)) continue;
      out.push(v);
      if (out.length >= 20) break;
    }
    return out;
  }

  function normalizarIcono(item) {
    if (!esObj(item)) return null;
    const label = txt(item.label, 80);
    const value = txt(item.value, 120);
    const icon = txt(item.icon, 40);
    if (!label && !value && !icon) return null;
    return { icon, label, value };
  }

  function normalizarGaleriaItem(item, idx) {
    if (!item) return null;
    if (typeof item === 'string') {
      const src = txt(item, 500);
      return src ? { src, alt: '', caption: '', order: idx } : null;
    }
    if (!esObj(item)) return null;
    const src = txt(item.src || item.url, 500);
    if (!src) return null;
    return {
      src,
      alt: txt(item.alt, 160),
      caption: txt(item.caption || item.pie, 240),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : idx
    };
  }

  function normalizarVideo(item) {
    if (!esObj(item)) return null;
    const url = txt(item.url, 500);
    if (!url) return null;
    return {
      title: txt(item.title || item.titulo, 120),
      url,
      provider: txt(item.provider, 40),
      note: txt(item.note || item.nota, 240)
    };
  }

  function normalizarCta(cta) {
    if (!esObj(cta)) return null;
    const label = txt(cta.label || cta.texto, 80);
    const url = txt(cta.url, 500);
    const kindRaw = txt(cta.kind, 20).toLowerCase();
    const kind = CTA_KINDS.includes(kindRaw) ? kindRaw : (url || label ? 'url' : '');
    if (!label && !url && !kind) return null;
    return { label, url, kind: kind || 'url' };
  }

  /**
   * Normaliza la configuración de ficha.
   * @param {*} ficha - objeto o JSON string; null/undefined => null (sin ficha, compat actual)
   * @returns {object|null}
   */
  function normalizarFicha(ficha) {
    let f = ficha;
    if (typeof f === 'string') {
      try { f = JSON.parse(f); } catch (e) { return null; }
    }
    if (!esObj(f)) return null;

    const plantillaRaw = txt(f.plantilla, 20).toLowerCase();
    const plantilla = PLANTILLAS.includes(plantillaRaw) ? plantillaRaw : 'ficha';
    const modoRaw = txt(f.videoModo, 10).toLowerCase();
    const out = {
      plantilla,
      bloques: normalizarBloques(f.bloques),
      orden: normalizarOrden(f.orden),
      videoModo: VIDEO_MODOS.includes(modoRaw) ? modoRaw : 'enlace',
      mostrarLectura: bool(f.mostrarLectura, true)
    };

    // Campos opcionales enriquecidos (compatibles con extensiones futuras).
    // Su presencia activa la precedencia sobre los campos base.
    if (Array.isArray(f.icons)) {
      out.icons = f.icons.map(normalizarIcono).filter(Boolean).slice(0, 30);
    }
    if (Array.isArray(f.gallery)) {
      out.gallery = f.gallery.map(normalizarGaleriaItem).filter(Boolean).slice(0, 30);
    }
    if (Array.isArray(f.videos)) {
      out.videos = f.videos.map(normalizarVideo).filter(Boolean).slice(0, 10);
    }
    if (f.tags !== undefined && f.tags !== null) {
      out.tags = normalizarTags(f.tags);
    }
    const cta = normalizarCta(f.cta);
    if (cta) out.cta = cta;

    return out;
  }

  /**
   * Bloques realmente activos: la plantilla `historia` nunca pinta la ficha
   * del animal, aunque el bloque estuviera marcado.
   */
  function bloquesEfectivos(cfg) {
    const out = Object.assign({}, BLOQUES_DEF, (cfg && cfg.bloques) || {});
    if (cfg && cfg.plantilla === 'historia') out.fichaAnimal = false;
    return out;
  }

  /**
   * Campos base con la precedencia aplicada: si la ficha define un campo,
   * se usa el de la ficha (aunque sea una lista vacía); si no, el base.
   */
  function camposEfectivos(pub, cfg) {
    const p = pub || {};
    const out = {};
    CAMPOS_PRECEDENCIA.forEach(k => {
      out[k] = (cfg && Object.prototype.hasOwnProperty.call(cfg, k)) ? cfg[k] : p[k];
    });
    return out;
  }

  /**
   * Valida estructura básica. No sustituye el saneado del backend.
   * @returns {{ok:boolean, errores:string[], ficha:object|null}}
   */
  function validarFicha(ficha) {
    const errores = [];
    let f = ficha;
    if (typeof f === 'string') {
      try { f = JSON.parse(f); } catch (e) { return { ok: false, errores: ['ficha_json no es JSON válido'], ficha: null }; }
    }
    if (f == null) return { ok: true, errores: [], ficha: null };
    if (!esObj(f)) return { ok: false, errores: ['ficha debe ser un objeto'], ficha: null };

    if (f.plantilla != null && !PLANTILLAS.includes(txt(f.plantilla, 20).toLowerCase())) {
      errores.push('plantilla no válida');
    }
    if (f.videoModo != null && !VIDEO_MODOS.includes(txt(f.videoModo, 10).toLowerCase())) {
      errores.push('videoModo no válido');
    }
    if (f.cta != null && !esObj(f.cta)) errores.push('cta debe ser un objeto');
    if (esObj(f.cta) && f.cta.kind != null && !CTA_KINDS.includes(txt(f.cta.kind, 20).toLowerCase())) {
      errores.push('cta.kind no válido');
    }
    if (f.orden != null && !Array.isArray(f.orden)) errores.push('orden debe ser una lista');
    if (Array.isArray(f.orden)) {
      const desconocidos = f.orden.filter(k => !Object.prototype.hasOwnProperty.call(BLOQUES_DEF, txt(k, 30)));
      if (desconocidos.length) errores.push('orden contiene bloques desconocidos');
    }

    const norm = normalizarFicha(f);
    return { ok: errores.length === 0, errores, ficha: norm };
  }

  /**
   * Regla de rendimiento: la ficha completa se incluye solo en detalle/prerender.
   * En listados/feeds (20+ ítems) NO debe adjuntarse para evitar lecturas/coste extra.
   */
  function fichaParaListado(_ficha) { return null; }
  function fichaParaDetalle(ficha) { return normalizarFicha(ficha); }

  return {
    PLANTILLAS,
    CTA_KINDS,
    VIDEO_MODOS,
    ORDEN_DEF,
    BLOQUES_DEF,
    CAMPOS_PRECEDENCIA,
    normalizarFicha,
    validarFicha,
    normalizarBloques,
    normalizarOrden,
    normalizarTags,
    normalizarCta,
    bloquesEfectivos,
    camposEfectivos,
    fichaParaListado,
    fichaParaDetalle
  };
});
