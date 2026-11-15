/**
 * C3 · saneado del HTML público (`webSanearHtml` en
 * apps-script/WebPublicaciones.gs).
 *
 * El gestor guarda el HTML tal cual; el payload público sale saneado con lista
 * blanca de etiquetas/atributos. Aquí se prueba la función cargando el `.gs`
 * real en un sandbox `vm` con las utilidades mínimas.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let ctx;

before(() => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'WebPublicaciones.gs'), 'utf8');
  ctx = {
    // Utilidades que en Apps Script viven en Code.gs.
    webTexto: (v) => (v === undefined || v === null ? '' : String(v).trim()),
    webParseJson: (v, d) => { try { return JSON.parse(v); } catch (e) { return d; } },
    webArray: (v) => (Array.isArray(v) ? v : []),
    CONFIG: { sheets: {} },
    Logger: { log() {} },
    PropertiesService: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fuente, ctx, { filename: 'WebPublicaciones.gs' });
});

const sanear = (html) => ctx.webSanearHtml(html);

describe('webSanearHtml (lista blanca)', () => {
  it('sin contenido devuelve cadena vacía', () => {
    assert.equal(sanear(''), '');
    assert.equal(sanear(null), '');
    assert.equal(sanear(undefined), '');
  });

  it('conserva el marcado normal del gestor', () => {
    const html = '<p>Hola <strong>mundo</strong> y <em>familia</em></p><ul><li>uno</li><li>dos</li></ul>';
    assert.equal(sanear(html), html);
  });

  it('quita enlaces con atributos peligrosos y deja los seguros', () => {
    assert.equal(
      sanear('<a href="https://example.org/adopta" title="Adopta" onclick="alert(1)">Adopta</a>'),
      '<a href="https://example.org/adopta" title="Adopta">Adopta</a>'
    );
    assert.equal(sanear('<a href="https://x.es" target="_blank" rel="x">x</a>'), '<a href="https://x.es">x</a>');
  });

  it('rechaza javascript:, data: y entidades numéricas en href/src', () => {
    assert.equal(sanear('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
    assert.equal(sanear('<a href="JaVaScRiPt:alert(1)">x</a>'), '<a>x</a>');
    assert.equal(sanear('<a href="&#106;avascript:alert(1)">x</a>'), '<a>x</a>');
    assert.equal(sanear('<img src="data:image/svg+xml;base64,AAA" alt="x">'), '<img alt="x">');
    assert.equal(sanear('<img src="javascript:alert(1)" alt="x">'), '<img alt="x">');
  });

  it('acepta rutas relativas, anclas, mailto y tel', () => {
    assert.equal(sanear('<a href="/adopta">ir</a>'), '<a href="/adopta">ir</a>');
    assert.equal(sanear('<a href="#top">arriba</a>'), '<a href="#top">arriba</a>');
    assert.equal(sanear('<a href="mailto:info@x.es">mail</a>'), '<a href="mailto:info@x.es">mail</a>');
    assert.equal(sanear('<img src="assets/foto.jpg" alt="Foto">'), '<img src="assets/foto.jpg" alt="Foto">');
  });

  it('elimina scripts, estilos, iframes y formularios con su contenido', () => {
    assert.equal(sanear('<p>a</p><script>alert(1)</script><p>b</p>'), '<p>a</p><p>b</p>');
    assert.equal(sanear('<style>p{display:none}</style><p>x</p>'), '<p>x</p>');
    assert.equal(sanear('<iframe src="https://youtube.com/embed/x"></iframe><p>x</p>'), '<p>x</p>');
    assert.equal(sanear('<form action="/x"><input name="a"><button>Enviar</button></form><p>x</p>'), '<p>x</p>');
    assert.equal(sanear('<svg><script>alert(1)</script></svg><p>x</p>'), '<p>x</p>');
  });

  it('descarta etiquetas desconocidas pero conserva su texto', () => {
    assert.equal(sanear('<div class="x">hola</div>'), 'hola');
    assert.equal(sanear('<p>a<custom-tag>b</custom-tag></p>'), '<p>ab</p>');
  });

  it('no deja atributos on* en ninguna etiqueta', () => {
    const r = sanear('<p onmouseover="alert(1)">x</p><img src="/a.jpg" onerror="alert(1)" alt="a">');
    assert.equal(r, '<p>x</p><img src="/a.jpg" alt="a">');
  });

  it('acepta dimensiones y colspan numéricos y descarta el resto', () => {
    assert.equal(sanear('<img src="/a.jpg" width="320" height="auto" alt="a">'), '<img src="/a.jpg" width="320" alt="a">');
    assert.equal(sanear('<table><tr><td colspan="2">a</td></tr></table>'), '<table><tr><td colspan="2">a</td></tr></table>');
    assert.equal(sanear('<td colspan="2;alert(1)">a</td>'), '<td>a</td>');
  });

  it('escapa un `<` que no abre etiqueta', () => {
    assert.equal(sanear('<p>3 < 4</p>'), '<p>3 &lt; 4</p>');
  });

  it('el payload público sale saneado (integración)', () => {
    const pub = ctx.webConstruirPublicacion({
      tipo: 'evento',
      slug: 'jornada',
      titulo: 'Jornada',
      extracto: 'Resumen',
      contenido_html: '<p onclick="a()">Hola <strong>familia</strong></p><script>alert(1)</script><a href="javascript:1">x</a>'
    }, null);
    assert.equal(pub.contentHtml, '<p>Hola <strong>familia</strong></p><a>x</a>');
  });

  it('es idempotente', () => {
    const sucio = '<p onclick="x">a</p><script>b()</script><a href="javascript:1">c</a><img src="/a.png" alt="z">';
    const una = sanear(sucio);
    assert.equal(sanear(una), una);
  });
});
