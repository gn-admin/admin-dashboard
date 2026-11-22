/**
 * Compartir la ficha pública.
 *
 * Abre el panel de redes de la ficha y copia la URL canónica (la página
 * estática que genera el prerender). Se carga tanto en el visor SPA como en
 * las páginas estáticas, que no ejecutan `publico.js`.
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

  /** Abre o cierra el panel de redes junto al botón «Compartir». */
  function alternarPanel(btn) {
    const cont = btn.parentElement;
    const panel = cont && cont.querySelector('.pub-share');
    if (!panel) return;
    const abierto = !panel.hasAttribute('hidden');
    cerrarPaneles(panel);
    panel.toggleAttribute('hidden', abierto);
    btn.setAttribute('aria-expanded', abierto ? 'false' : 'true');
  }

  function cerrarPaneles(excepto) {
    document.querySelectorAll('.pub-share').forEach(panel => {
      if (panel === excepto || panel.hasAttribute('hidden')) return;
      panel.setAttribute('hidden', '');
      const btn = panel.parentElement && panel.parentElement.querySelector('[data-share-toggle]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', evento => {
    const el = evento.target && evento.target.closest ? evento.target : null;
    const hay = (sel) => !!(el && el.closest && el.closest(sel));

    if (hay('[data-copiar]')) {
      evento.preventDefault();
      const btn = el.closest('[data-copiar]');
      const url = btn.getAttribute('data-url') || location.href;
      copiar(url).then(() => avisar(btn, 'Enlace copiado'), () => avisar(btn, 'No se pudo copiar'));
      return;
    }

    if (hay('[data-share-toggle]')) {
      evento.preventDefault();
      alternarPanel(el.closest('[data-share-toggle]'));
      return;
    }

    // Un clic dentro del panel no lo cierra; cualquier otro clic, sí.
    if (!hay('.pub-share')) cerrarPaneles(null);
  });

  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape') cerrarPaneles(null);
  });
})();
