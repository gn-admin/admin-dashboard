/**
 * Vídeo embebido con click-to-load (C3).
 *
 * Fachada propia: la página no hace ninguna petición al proveedor hasta que la
 * persona pulsa «Reproducir». Entonces se sustituye la fachada por un iframe
 * de `youtube-nocookie` o `player.vimeo.com`. Si la URL no es de un proveedor
 * conocido, el visor mantiene el enlace externo de siempre.
 *
 * UMD: se usa en el navegador (visor y páginas estáticas) y en los tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PublicoEmbed = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RE_YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
  const RE_VIMEO = /vimeo\.com\/(?:video\/)?(\d{5,})/i;

  function esc(valor) {
    if (valor == null) return '';
    return String(valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Identificador y URL de embed de un vídeo conocido; `null` si no lo es. */
  function info(url) {
    const s = String(url == null ? '' : url).trim();
    if (!s) return null;
    const yt = s.match(RE_YOUTUBE);
    if (yt) {
      return {
        provider: 'youtube',
        id: yt[1],
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1&rel=0'
      };
    }
    const vm = s.match(RE_VIMEO);
    if (vm) {
      return {
        provider: 'vimeo',
        id: vm[1],
        embedUrl: 'https://player.vimeo.com/video/' + vm[1] + '?autoplay=1'
      };
    }
    return null;
  }

  function embedPermitido(url) { return !!info(url); }

  /** Fachada sin peticiones externas: botón que carga el iframe al pulsar. */
  function fachada(video, titulo) {
    const datos = typeof video === 'string' ? info(video) : video;
    if (!datos || !datos.embedUrl) return '';
    const texto = String(titulo || 'Vídeo').trim() || 'Vídeo';
    return `<div class="pub-embed" data-video-url="${esc(datos.embedUrl)}" data-video-provider="${esc(datos.provider)}">
      <button type="button" class="pub-embed-play" aria-label="Reproducir vídeo: ${esc(texto)}">
        <span class="pub-embed-icon" aria-hidden="true">▶</span>
        <span class="pub-embed-copy"><strong>${esc(texto)}</strong><small>Reproducir vídeo</small></span>
      </button>
    </div>`;
  }

  function iframeHtml(datos, titulo) {
    if (!datos || !datos.embedUrl) return '';
    return `<iframe class="pub-embed-frame" src="${esc(datos.embedUrl)}" title="${esc(titulo || 'Vídeo')}"
      loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }

  /** Sustituye la fachada por el iframe. Devuelve `true` si lo hizo. */
  function montar(contenedor) {
    if (!contenedor || !contenedor.getAttribute) return false;
    const url = contenedor.getAttribute('data-video-url') || '';
    const datos = info(url);
    if (!datos) return false;
    const boton = contenedor.querySelector('.pub-embed-play');
    const titulo = (boton && boton.getAttribute('aria-label')) || 'Vídeo';
    contenedor.innerHTML = iframeHtml(datos, titulo.replace(/^Reproducir vídeo:\s*/i, ''));
    const frame = contenedor.querySelector('iframe');
    if (frame && typeof frame.focus === 'function') frame.focus();
    return true;
  }

  function iniciar(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || d.__pubEmbedInit) return;
    d.__pubEmbedInit = true;
    d.addEventListener('click', function (e) {
      const boton = e.target && e.target.closest ? e.target.closest('.pub-embed-play') : null;
      if (!boton) return;
      const contenedor = boton.closest('.pub-embed');
      if (!contenedor) return;
      e.preventDefault();
      montar(contenedor);
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { iniciar(document); });
    } else {
      iniciar(document);
    }
  }

  return { info, embedPermitido, fachada, iframeHtml, montar, iniciar };
});
