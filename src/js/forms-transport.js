/**
 * C4 (propuesta/spike): transporte de formularios hacia GAS compatible con
 * las limitaciones de GitHub Pages + GAS (sin CORS/preflight fiable en fetch POST).
 *
 * Estrategia: envío clásico de <form> (x-www-form-urlencoded) a un iframe oculto.
 * Nota: la respuesta cross-origin no es legible desde JS; el llamador debe tratar
 * la carga del iframe/timeout como "enviado" y diseñar UX/confirmación acorde.
 * No conectado al runtime productivo (base para prototipo/aprobación de C4).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FormsTransport = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function aplanarCampos(fields, prefijo, out) {
    out = out || {};
    if (!esObj(fields)) return out;
    for (const k of Object.keys(fields)) {
      const v = fields[k];
      const key = prefijo ? prefijo + '[' + k + ']' : k;
      if (v == null) out[key] = '';
      else if (Array.isArray(v)) out[key] = v.map(x => String(x)).join(',');
      else if (esObj(v)) aplanarCampos(v, key, out);
      else out[key] = String(v);
    }
    return out;
  }

  /**
   * Construye el payload plano para envío por formulario.
   * Incluye metadatos mínimos; el token antiabuso (p.ej. reCAPTCHA) viaja como campo.
   */
  function buildPayload(data) {
    const d = esObj(data) ? data : {};
    const out = {
      endpoint: String(d.endpoint || 'forms-submit'),
      form_type: String(d.form_type || d.formType || ''),
      concepto: String(d.concepto || ''),
      page_url: String(d.page_url || d.pageUrl || ''),
      privacy_accepted: d.privacy_accepted ? 'true' : 'false',
      recaptcha_token: String((d.recaptcha && d.recaptcha.token) || d.recaptcha_token || ''),
      recaptcha_action: String((d.recaptcha && d.recaptcha.action) || d.recaptcha_action || '')
    };
    aplanarCampos(d.fields || {}, 'fields', out);
    // Eliminar vacíos opcionales para reducir tamaño/ruido
    for (const k of Object.keys(out)) {
      if (out[k] === '' && k !== 'fields') delete out[k];
    }
    return out;
  }

  function crearElemento(name, attrs, doc) {
    const el = doc.createElement(name);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  /**
   * Envía mediante formulario+iframe oculto (solo navegador).
   * @returns {Promise<{ok:boolean, transport:string, note:string}>}
   */
  function submitViaIframe(actionUrl, data, opts) {
    const o = opts || {};
    const timeoutMs = Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : 15000;
    const doc = o.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return Promise.resolve({ ok: false, transport: 'iframe', note: 'sin document' });
    if (!actionUrl) return Promise.resolve({ ok: false, transport: 'iframe', note: 'sin actionUrl' });

    const payload = buildPayload(data);
    const iframeName = 'forms-transport-' + Math.random().toString(36).slice(2);
    const iframe = crearElemento('iframe', { name: iframeName, title: 'forms-submit', style: 'display:none' }, doc);
    const form = crearElemento('form', { method: 'POST', action: String(actionUrl), target: iframeName, style: 'display:none' }, doc);
    form.setAttribute('accept-charset', 'UTF-8');

    for (const [k, v] of Object.entries(payload)) {
      const input = crearElemento('input', { type: 'hidden', name: k, value: String(v) }, doc);
      form.appendChild(input);
    }

    return new Promise((resolve) => {
      let done = false;
      const cleanup = () => {
        try { form.remove(); } catch (e) {}
        try { iframe.remove(); } catch (e) {}
      };
      const finish = (ok, note) => {
        if (done) return;
        done = true;
        setTimeout(cleanup, 500);
        resolve({ ok, transport: 'iframe', note });
      };
      iframe.addEventListener('load', () => finish(true, 'carga completada (respuesta no legible por CORS)'));
      const t = setTimeout(() => finish(true, 'timeout de espera (envío posiblemente realizado)'), timeoutMs);
      iframe.addEventListener('error', () => { clearTimeout(t); finish(false, 'error de carga'); });

      (doc.body || doc.documentElement).appendChild(iframe);
      (doc.body || doc.documentElement).appendChild(form);
      try { form.submit(); } catch (e) { clearTimeout(t); finish(false, 'no se pudo enviar'); }
    });
  }

  return { buildPayload, aplanarCampos, submitViaIframe };
});
