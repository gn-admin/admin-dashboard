/**
 * Compartir la ficha pública.
 *
 * Usa la Web Share API cuando está disponible y, si no, copia la URL
 * canónica (la página estática que genera el prerender). Se carga tanto en
 * el visor SPA como en las páginas estáticas, que no ejecutan `publico.js`.
 */
(function () {
  'use strict';

  function copiar(texto) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (ok) resolve(); else reject(new Error('copy'));
      } catch (err) {
        reject(err);
      }
    });
  }

  function avisar(btn, texto) {
    var cont = btn.parentElement;
    var aviso = cont && cont.querySelector('.pub-compartir-aviso');
    if (aviso) {
      aviso.textContent = texto;
      return;
    }
    var original = btn.textContent;
    btn.textContent = texto;
    setTimeout(function () { btn.textContent = original; }, 2400);
  }

  function compartir(btn) {
    var url = btn.getAttribute('data-url') || (typeof location !== 'undefined' ? location.href : '');
    var title = btn.getAttribute('data-title') || (typeof document !== 'undefined' ? document.title : '');
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copiar(url).then(function () { avisar(btn, 'Enlace copiado'); })
          .catch(function () { avisar(btn, 'No se pudo copiar'); });
      });
      return;
    }
    copiar(url).then(function () { avisar(btn, 'Enlace copiado'); })
      .catch(function () { avisar(btn, 'No se pudo copiar'); });
  }

  document.addEventListener('click', function (evento) {
    var btn = evento.target && evento.target.closest
      ? evento.target.closest('[data-compartir]')
      : null;
    if (!btn) return;
    evento.preventDefault();
    compartir(btn);
  });
})();
