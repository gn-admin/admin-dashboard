/**
 * C3 · vídeo embebido con click-to-load (`src/js/publico-embed.js`).
 * Sin red: solo se valida la construcción segura de fachada e iframe.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Embed = require('../src/js/publico-embed.js');

describe('PublicoEmbed.info', () => {
  it('reconoce YouTube en sus formatos habituales', () => {
    ['https://youtu.be/abc123XYZ',
      'https://www.youtube.com/watch?v=abc123XYZ',
      'https://www.youtube.com/watch?feature=share&v=abc123XYZ',
      'https://www.youtube.com/shorts/abc123XYZ',
      'https://www.youtube.com/embed/abc123XYZ',
      'https://www.youtube-nocookie.com/embed/abc123XYZ'
    ].forEach(url => {
      const info = Embed.info(url);
      assert.ok(info, url);
      assert.equal(info.provider, 'youtube');
      assert.equal(info.id, 'abc123XYZ');
      assert.match(info.embedUrl, /^https:\/\/www\.youtube-nocookie\.com\/embed\/abc123XYZ\?autoplay=1/);
    });
  });

  it('reconoce Vimeo y su player', () => {
    const info = Embed.info('https://vimeo.com/123456789');
    assert.equal(info.provider, 'vimeo');
    assert.equal(info.embedUrl, 'https://player.vimeo.com/video/123456789?autoplay=1');
    assert.equal(Embed.info('https://player.vimeo.com/video/123456789').provider, 'vimeo');
  });

  it('rechaza dominios ajenos y esquemas peligrosos', () => {
    ['https://ejemplo.test/video.mp4', 'javascript:alert(1)', 'data:text/html,x', '', null]
      .forEach(url => {
        assert.equal(Embed.info(url), null);
        assert.equal(Embed.embedPermitido(url), false);
      });
  });
});

describe('PublicoEmbed.fachada / iframeHtml', () => {
  it('la fachada no incluye iframe ni peticiones externas', () => {
    const html = Embed.fachada('https://youtu.be/abc123XYZ', 'Luna <jugando>');
    assert.match(html, /class="pub-embed"/);
    assert.match(html, /data-video-url="https:\/\/www\.youtube-nocookie\.com\/embed\/abc123XYZ\?autoplay=1&amp;rel=0"/);
    assert.match(html, /class="pub-embed-play"/);
    assert.match(html, /Luna &lt;jugando&gt;/);
    assert.doesNotMatch(html, /<iframe/);
    assert.doesNotMatch(html, /https:\/\/www\.youtube\.com/);
  });

  it('el iframe usa solo URLs construidas desde el id validado', () => {
    const html = Embed.iframeHtml(Embed.info('https://vimeo.com/123456789'), 'Vídeo');
    assert.match(html, /src="https:\/\/player\.vimeo\.com\/video\/123456789\?autoplay=1"/);
    assert.match(html, /allowfullscreen/);
    assert.match(html, /loading="lazy"/);
  });
});

describe('PublicoEmbed.montar', () => {
  function contenedorFalso(url) {
    const estado = { html: '', foco: false };
    const boton = { getAttribute: () => 'Reproducir vídeo: Luna' };
    const frame = { focus: () => { estado.foco = true; } };
    return {
      estado,
      getAttribute: k => (k === 'data-video-url' ? url : null),
      querySelector: sel => (sel === '.pub-embed-play' ? boton : (sel === 'iframe' ? frame : null)),
      set innerHTML(v) { estado.html = v; },
      get innerHTML() { return estado.html; }
    };
  }

  it('sustituye la fachada por el iframe solo con una URL permitida', () => {
    const c = contenedorFalso('https://www.youtube-nocookie.com/embed/abc123XYZ?autoplay=1&rel=0');
    assert.equal(Embed.montar(c), true);
    assert.match(c.estado.html, /<iframe/);
    assert.match(c.estado.html, /youtube-nocookie\.com\/embed\/abc123XYZ/);
    assert.equal(c.estado.foco, true);
  });

  it('no monta nada si la URL no es de un proveedor conocido', () => {
    const c = contenedorFalso('https://ejemplo.test/x');
    assert.equal(Embed.montar(c), false);
    assert.equal(c.estado.html, '');
  });
});
