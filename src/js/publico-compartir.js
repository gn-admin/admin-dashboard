/**
 * Compartir la ficha pública.
 *
 * Usa la Web Share API cuando está disponible y, si no, copia la URL
 * canónica (la página estática que genera el prerender). Se carga tanto en
 * el visor SPA como en las páginas estáticas, que no ejecutan `publico.js`.
 */
(() => {
  'use strict';

  /** Copia con la API moderna y, si no existe, con el textarea temporal. */
  function copiar(texto) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise((resolve, reject) => {
      try {
        const area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (ok) resolve(); else reject(new Error('copy'));
      } catch (err) {
        reject(err);
      }
    });
  }

  let temporizador = 0;

  /**
   * Muestra la confirmación en el aviso visible junto al botón (se apaga solo)
   * y, si el marcado no lo trae, en el propio texto del botón.
   */
  function avisar(btn, texto) {
    const cont = btn.parentElement;
    const aviso = cont && cont.querySelector('.pub-compartir-aviso');
    if (!aviso) {
      const original = btn.textContent;
      btn.textContent = texto;
      setTimeout(() => { btn.textContent = original; }, 3000);
      return;
    }
    aviso.textContent = texto;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { aviso.textContent = ''; }, 4000);
  }

  function compartir(btn) {
    const url = btn.getAttribute('data-url') || location.href;
    const title = btn.getAttribute('data-title') || document.title;
    const confirmar = () => avisar(btn, 'Enlace copiado');
    const fallar = () => avisar(btn, 'No se pudo copiar');
    if (navigator.share) {
      navigator.share({ title, url }).catch(err => {
        if (err && err.name === 'AbortError') return; // cancelado por la persona
        copiar(url).then(confirmar, fallar);
      });
      return;
    }
    copiar(url).then(confirmar, fallar);
  }

  document.addEventListener('click', evento => {
    const btn = evento.target && evento.target.closest
      ? evento.target.closest('[data-compartir]')
      : null;
    if (!btn) return;
    evento.preventDefault();
    compartir(btn);
  });
})();
