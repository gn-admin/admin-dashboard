/**
 * C3 (propuesta, Fase 1 en preparación): configuración de ficha pública v1.1.
 *
 * Helpers puros de normalización/validación del objeto `ficha` (aditivo).
 * No se usa aún en runtime: base para cuando se apruebe C3.
 *
 * Reglas clave:
 * - Ausencia de `ficha` => comportamiento actual (no forzar estructura).
 * - Listados/secciones (20+ ítems) NO deben incluir la ficha completa: solo detalle/prerender.
 * - Valores cerrados y saneado defensivo; mantener compatibilidad con datos antiguos.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FichaConfig = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PLANTILLAS = ['ficha', 'historia'];
  const CTA_KINDS = ['adopcion', 'acogida', 'contacto', 'url'];
  const BLOQUES_DEF = {
    datos: true,
    galeria: true,
    videos: true,
    fichaAnimal: true,
    etiquetas: true,
    cta: true
  };

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
   * Normaliza la configuración de ficha propuesta.
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
    const out = {
      plantilla,
      bloques: normalizarBloques(f.bloques),
      mostrarLectura: bool(f.mostrarLectura, true)
    };

    // Campos opcionales enriquecidos (compatibles con extensiones futuras)
    if (Array.isArray(f.icons)) {
      out.icons = f.icons.map(normalizarIcono).filter(Boolean).slice(0, 30);
    }
    if (Array.isArray(f.gallery)) {
      out.gallery = f.gallery.map(normalizarGaleriaItem).filter(Boolean).slice(0, 30);
    }
    if (Array.isArray(f.videos)) {
      out.videos = f.videos.map(normalizarVideo).filter(Boolean).slice(0, 10);
    }
    const cta = normalizarCta(f.cta);
    if (cta) out.cta = cta;

    return out;
  }

  /**
   * Valida estructura básica (propuesta). No sustituye saneado/decisiones finales.
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
    if (f.cta != null && !esObj(f.cta)) errores.push('cta debe ser un objeto');
    if (esObj(f.cta) && f.cta.kind != null && !CTA_KINDS.includes(txt(f.cta.kind, 20).toLowerCase())) {
      errores.push('cta.kind no válido');
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
    BLOQUES_DEF,
    normalizarFicha,
    validarFicha,
    normalizarBloques,
    normalizarCta,
    fichaParaListado,
    fichaParaDetalle
  };
});
