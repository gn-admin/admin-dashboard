/**
 * «Me gusta» del visor público.
 * ---------------------------------------------------------------------------
 * Guarda en `localStorage` un resumen de cada ficha marcada (slug, título,
 * tipo, portada, categoría y fechas del evento), así la sección «Me gusta»
 * puede listarlas al volver a navegar sin pedir nada al canal.
 *
 * No hay cuentas: cada navegador guarda lo suyo. Si el almacenamiento está
 * bloqueado (modo privado), todo funciona en memoria y no se pierde la vista.
 */
(function (raiz) {
  'use strict';

  const CLAVE = 'gn:publico:me-gusta';
  const MAX = 300;

  function almacen(store) {
    if (store) return store;
    try { return raiz && raiz.localStorage ? raiz.localStorage : null; } catch (e) { return null; }
  }

  /** Lista guardada, de la más reciente a la más antigua. Nunca lanza. */
  function leer(store) {
    const s = almacen(store);
    if (!s) return [];
    try {
      const datos = JSON.parse(s.getItem(CLAVE) || '[]');
      if (!Array.isArray(datos)) return [];
      return datos
        .filter(x => x && x.slug)
        .map(x => Object.assign({}, x, { slug: String(x.slug) }));
    } catch (e) {
      return [];
    }
  }

  function escribir(lista, store) {
    const s = almacen(store);
    if (!s) return false;
    try {
      s.setItem(CLAVE, JSON.stringify((lista || []).slice(0, MAX)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function tiene(slug, store) {
    const clave = String(slug || '');
    return !!clave && leer(store).some(x => x.slug === clave);
  }

  function quitar(slug, store) {
    const clave = String(slug || '');
    const lista = leer(store).filter(x => x.slug !== clave);
    escribir(lista, store);
    return lista;
  }

  /**
   * Marca o desmarca. Devuelve `{ guardado, lista }` para pintar el botón sin
   * releer el almacenamiento.
   */
  function alternar(item, store) {
    const actual = leer(store);
    if (!item || !item.slug) return { guardado: false, lista: actual };
    const slug = String(item.slug);
    const ya = actual.some(x => x.slug === slug);
    const lista = ya
      ? actual.filter(x => x.slug !== slug)
      : [Object.assign({}, item, { slug })].concat(actual);
    escribir(lista, store);
    return { guardado: !ya, lista };
  }

  const API = { CLAVE, MAX, leer, escribir, tiene, quitar, alternar };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.PublicoFavoritos = API;
  if (typeof document === 'undefined') return;

  /** Avisa al visor para que repinte la sección «Me gusta» si está abierta. */
  function avisarCambio() {
    try { document.dispatchEvent(new CustomEvent('publico:favoritos')); } catch (e) { /* sin CustomEvent */ }
  }

  function pintar(btn, guardado) {
    if (!btn.hasAttribute('data-texto-normal')) {
      btn.setAttribute('data-texto-normal', btn.textContent.trim() || '♡ Me gusta');
      btn.setAttribute('data-texto-activo', btn.getAttribute('data-texto-activo') || '♥ Guardado');
    }
    btn.setAttribute('aria-pressed', guardado ? 'true' : 'false');
    btn.textContent = guardado
      ? btn.getAttribute('data-texto-activo')
      : btn.getAttribute('data-texto-normal');
  }

  document.addEventListener('click', (evento) => {
    const btn = evento.target && evento.target.closest
      ? evento.target.closest('[data-favorito]')
      : null;
    if (!btn) return;
    evento.preventDefault();
    let item = null;
    try { item = JSON.parse(btn.getAttribute('data-ficha') || 'null'); } catch (e) { item = null; }
    if (!item || !item.slug) item = { slug: btn.getAttribute('data-slug') || '' };
    if (!item.slug) return;
    pintar(btn, alternar(item, null).guardado);
    avisarCambio();
  });
})(typeof window !== 'undefined' ? window : null);
