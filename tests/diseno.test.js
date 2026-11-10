/**
 * Tests de diseno:
 *  1) Contraste WCAG AA de los pares de color ya corregidos (se leen del CSS,
 *     asi si alguien cambia una variable el test avisa).
 *  2) Integridad estatica: clases CSS, ids e iconos usados desde JS/HTML.
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8');
const CSS = leer('css/styles.css');

// --- variables del :root y resolucion de var(--x) ---
const RAIZ_VARS = Object.fromEntries(
  [...CSS.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
);
const resolver = v => {
  const s = String(v).trim();
  const m = s.match(/^var\((--[a-z0-9-]+)\)$/);
  return m ? (RAIZ_VARS[m[1]] || '') : s;
};

// --- declaraciones de una regla concreta ---
const declaraciones = selector => {
  const i = CSS.indexOf(selector + ' {');
  assert.ok(i >= 0, 'No existe la regla ' + selector);
  const fin = CSS.indexOf('}', i);
  const bloque = CSS.slice(i + selector.length + 2, fin);
  return Object.fromEntries([...bloque.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};

// --- contraste WCAG (sRGB relativo) ---
const luminancia = hex => {
  const c = hex.replace('#', '');
  const canales = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
};
const contraste = (fg, bg) => {
  const a = luminancia(resolver(fg)), b = luminancia(resolver(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const AA = 4.5; // texto normal

// Cada par: selector, color de texto y fondo efectivos (el texto puede
// heredarse de la regla base, por eso se declara aqui). `bg` es el fondo
// efectivo: si la regla deja el fondo transparente, es el de la pagina (blanco).
const pares = [
  { sel: '.btn-primary', fg: 'var(--white)', bg: 'var(--primary-hover)' },
  { sel: '.btn-primary:hover:not(:disabled)', fg: 'var(--white)', bg: '#0f6b31' },
  { sel: '.toast-error.toast-success', fg: 'var(--white)', bg: 'var(--primary-hover)' },
  { sel: '.toast-error.toast-error', fg: 'var(--white)', bg: 'var(--danger-hover)' },
  { sel: '.urgente-badge', fg: 'var(--white)', bg: 'var(--danger-hover)' },
  { sel: '.btn-danger', fg: 'var(--white)', bg: 'var(--danger-hover)' },
  { sel: '.btn-danger:hover:not(:disabled)', fg: 'var(--white)', bg: '#a93226' },
  { sel: '.btn-outline-green', fg: 'var(--primary-hover)', bg: 'var(--white)' },
  { sel: '.btn-outline-green:hover:not(:disabled)', fg: 'var(--primary-dark)', bg: 'var(--primary-lighter)' }
];

describe('contraste WCAG AA (pares ya corregidos)', () => {
  pares.forEach(({ sel, fg, bg }) => {
    it(sel + ' cumple 4.5:1', () => {
      const d = declaraciones(sel);
      const declarado = resolver(d.background || '');
      if (declarado && declarado !== 'transparent') {
        assert.equal(declarado, resolver(bg),
          `${sel}: el fondo declarado ya no es ${bg} (es ${d.background}); revisa el par de contraste`);
      } else if (bg !== 'var(--white)') {
        assert.fail(`${sel}: fondo declarado ${declarado || '(ninguno)'} pero el par asume ${bg}`);
      }
      const ratio = contraste(fg, bg);
      assert.ok(ratio >= AA, `${sel}: ${resolver(fg)} sobre ${resolver(bg)} = ${ratio.toFixed(2)}:1 (< 4.5)`);
    });
  });

  it('el toast neutro usa gris y texto oscuro', () => {
    const d = declaraciones('.toast-error.toast-neutral');
    assert.equal(d.background, 'var(--gray-200)');
    assert.equal(d.color, 'var(--gray-800)');
    assert.ok(contraste(d.color, d.background) >= AA);
  });

  it('los hexadecimales siguen siendo los documentados', () => {
    assert.equal(RAIZ_VARS['--primary-hover'], '#15863D');
    assert.equal(RAIZ_VARS['--danger-hover'], '#c0392b');
    assert.equal(RAIZ_VARS['--black'], '#191919');
  });
});

describe('integridad estatica: clases, ids e iconos', () => {
  const okClase = c => /^[a-z][a-z0-9-]*$/i.test(c);
  // Se usa sin regla propia a proposito: .btn-text la estila el selector
  // descendiente #login-submit-btn.loading span.
  const SIN_REGLA_PROPIA = new Set(['btn-text']);

  it('toda clase usada en JS/HTML de interfaz existe en el CSS', () => {
    const cssClases = new Set([...CSS.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(m => m[1]));
    const usadas = new Set();
    for (const f of ['js/dashboard.js', 'js/app.js', 'index.html']) {
      const s = leer(f);
      for (const m of s.matchAll(/class\s*=\s*"([^"]*)"/g)) {
        m[1].split(/\s+/).forEach(c => { if (c && okClase(c) && !c.includes('$')) usadas.add(c); });
      }
      for (const m of s.matchAll(/classList\.(?:add|remove|toggle|contains)\('([^']+)'/g)) {
        if (okClase(m[1])) usadas.add(m[1]);
      }
    }
    const sinRegla = [...usadas].filter(c => !cssClases.has(c) && !SIN_REGLA_PROPIA.has(c));
    assert.deepEqual(sinRegla, [], 'Clases sin regla en styles.css: ' + sinRegla.join(', '));
  });

  it('todo icono usado existe en Icons', () => {
    const iconos = require('../src/js/icons.js');
    const usados = new Set();
    for (const f of ['js/dashboard.js', 'js/app.js', 'js/pdf-export.js', 'js/carnet-generator.js', 'index.html']) {
      for (const m of leer(f).matchAll(/\bIcons\.([A-Za-z_][A-Za-z0-9_]*)/g)) usados.add(m[1]);
    }
    const sinDefinir = [...usados].filter(n => !(n in iconos));
    assert.deepEqual(sinDefinir, [], 'Iconos usados y no definidos: ' + sinDefinir.join(', '));
  });

  it('todo getElementById literar existe en el HTML o en los templates', () => {
    const html = leer('index.html');
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const js = leer('js/dashboard.js') + leer('js/app.js');
    const jsIds = new Set([...js.matchAll(/id="([a-zA-Z0-9-]+)"/g)].map(m => m[1]));
    const buscados = new Set([...js.matchAll(/getElementById\('([a-z0-9-]+)'\)/gi)].map(m => m[1]));
    const ausentes = [...buscados].filter(i => !htmlIds.has(i) && !jsIds.has(i));
    assert.deepEqual(ausentes, [], 'Ids buscados que no existen: ' + ausentes.join(', '));
  });

  it('el service worker precachea todos los JS de interfaz', () => {
    const sw = leer('sw.js');
    const jsUi = ['js/config.js', 'js/icons.js', 'js/pwa.js', 'js/auth.js', 'js/api.js', 'js/dashboard.js', 'js/app.js'];
    const fuera = jsUi.filter(f => !sw.includes(f));
    assert.deepEqual(fuera, [], 'JS sin precachear en sw.js: ' + fuera.join(', '));
  });

  it('el service worker cachea la pantalla offline y los iconos maskable', () => {
    const sw = leer('sw.js');
    ['offline.html', 'icon-maskable-192.png', 'icon-maskable-512.png'].forEach(f => {
      assert.ok(sw.includes(f), 'Falta en el precache del SW: ' + f);
    });
  });

  it('el manifest es instalable (scope, standalone, maskable y atajos)', () => {
    const mf = JSON.parse(leer('manifest.webmanifest'));
    assert.equal(mf.display, 'standalone');
    assert.equal(mf.scope, './');
    assert.ok(Array.isArray(mf.display_override) && mf.display_override.includes('standalone'));
    assert.ok(mf.icons.some(i => i.purpose === 'maskable' && i.sizes === '192x192'));
    assert.ok(mf.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
    assert.ok(Array.isArray(mf.shortcuts) && mf.shortcuts.length >= 3);
    mf.shortcuts.forEach(s => assert.match(s.url, /^\.\/#/));
  });

  it('el HTML declara manifest, apple-touch-icon y titulo de app', () => {
    const html = leer('index.html');
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon" href="assets\/icons\/icon-180\.png"/);
    assert.match(html, /name="apple-mobile-web-app-title"/);
    assert.match(html, /js\/pwa\.js/);
  });

  it('el contrato de adopcion se abre a pantalla completa', () => {
    const html = leer('index.html');
    assert.match(html, /id="contrato-modal"[^>]*modal-overlay--full|modal-overlay--full[^>]*id="contrato-modal"/);
    assert.match(html, /modal-box--full/);
    assert.match(CSS, /\.modal-box--full/);
    assert.match(CSS, /\.contrato-layout/);
    assert.match(CSS, /\.contrato-shell\.doc-open \.contrato-form-pane/);
    assert.match(CSS, /height:\s*100dvh/);
    assert.match(CSS, /\.contrato-doc-back/);
  });

  it('el contrato de acogida tiene previsualizacion y firma en papel', () => {
    assert.match(CSS, /\.acuerdo-preview/);
    assert.match(CSS, /\.acuerdo-preview-actions/);
    assert.match(CSS, /\.contrato-doc-firma-espacio/);
  });
});
