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
// Sin comentarios: al buscar declaraciones, un comentario que mencione
// "display:none" colaba como si fuera la regla.
const CSS_LIMPIO = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

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
  const i = CSS_LIMPIO.indexOf(selector + ' {');
  assert.ok(i >= 0, 'No existe la regla ' + selector);
  const fin = CSS_LIMPIO.indexOf('}', i);
  const bloque = CSS_LIMPIO.slice(i + selector.length + 2, fin);
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
  { sel: '.toast-error.toast-danger', fg: 'var(--white)', bg: 'var(--danger-hover)' },
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

  it('los toasts warning y neutral usan gris y texto oscuro', () => {
    ['.toast-error.toast-warning', '.toast-error.toast-neutral'].forEach(sel => {
      const d = declaraciones(sel);
      assert.equal(d.background, 'var(--gray-200)', sel);
      assert.equal(d.color, 'var(--gray-800)', sel);
      assert.ok(contraste(d.color, d.background) >= AA, sel);
    });
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
  const SIN_REGLA_PROPIA = new Set(['btn-text', 'idx']);

  it('toda clase usada en JS/HTML de interfaz existe en el CSS', () => {
    const cssClases = new Set([...CSS.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(m => m[1]));
    const usadas = new Set();
    const uiFiles = [
      'js/dashboard.js', 'js/dashboard-actividad.js', 'js/dashboard-finanzas.js',
      'js/dashboard-blacklist.js', 'js/dashboard-web.js', 'js/web.js', 'js/app.js', 'index.html'
    ];
    for (const f of uiFiles) {
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
    for (const f of ['js/dashboard.js', 'js/dashboard-actividad.js', 'js/dashboard-finanzas.js', 'js/dashboard-blacklist.js', 'js/dashboard-web.js', 'js/web.js', 'js/app.js', 'js/pdf-export.js', 'js/carnet-generator.js', 'index.html']) {
      for (const m of leer(f).matchAll(/\bIcons\.([A-Za-z_][A-Za-z0-9_]*)/g)) usados.add(m[1]);
    }
    const sinDefinir = [...usados].filter(n => !(n in iconos));
    assert.deepEqual(sinDefinir, [], 'Iconos usados y no definidos: ' + sinDefinir.join(', '));
  });

  it('todo getElementById literar existe en el HTML o en los templates', () => {
    const html = leer('index.html');
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const js = leer('js/dashboard.js') + leer('js/dashboard-actividad.js') + leer('js/dashboard-finanzas.js') + leer('js/dashboard-blacklist.js') + leer('js/dashboard-web.js') + leer('js/web.js') + leer('js/app.js');
    const jsIds = new Set([...js.matchAll(/id="([a-zA-Z0-9-]+)"/g)].map(m => m[1]));
    for (const m of js.matchAll(/\.id\s*=\s*['"]([a-zA-Z0-9-]+)['"]/g)) jsIds.add(m[1]);
    const buscados = new Set([...js.matchAll(/getElementById\('([a-z0-9-]+)'\)/gi)].map(m => m[1]));
    const ausentes = [...buscados].filter(i => !htmlIds.has(i) && !jsIds.has(i));
    assert.deepEqual(ausentes, [], 'Ids buscados que no existen: ' + ausentes.join(', '));
  });

  it('el service worker precachea todos los JS de interfaz', () => {
    const sw = leer('sw.js');
    const jsUi = [
      'js/config.js', 'js/icons.js', 'js/pwa.js', 'js/auth.js', 'js/api.js',
      'js/dashboard.js', 'js/dashboard-actividad.js', 'js/dashboard-finanzas.js',
      'js/dashboard-blacklist.js', 'js/dashboard-web.js', 'js/web.js', 'js/app.js'
    ];
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
    assert.equal(mf.background_color.toLowerCase(), '#ffffff');
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

  it('el contrato de acogida tiene previsualizacion, guardado y firma en papel', () => {
    assert.match(CSS, /\.acuerdo-preview/);
    assert.match(CSS, /\.acuerdo-preview-actions/);
    assert.match(CSS, /\.acuerdo-preview-btns/);
    assert.match(CSS, /\.acuerdo-preview-chip\.is-saved/);
    assert.match(CSS, /\.contrato-doc-firma-espacio/);
  });
});

describe('regiones vivas del gestor: ocultas sin salir del arbol de accesibilidad', () => {
  const VIVAS = ['.animal-web-estado', '.web-deploy-estado', '.web-media-lista'];

  VIVAS.forEach(sel => {
    it(sel + ' vacio sigue renderizado', () => {
      const vacia = declaraciones(sel + ':empty');
      assert.equal(vacia.display, undefined, sel + ':empty no debe usar display:none');
      assert.equal(vacia.position, 'absolute');
      assert.match(vacia['clip-path'] || '', /inset\(50%\)/);
      assert.equal(vacia['pointer-events'], 'none');
    });
  });

  it('la capa de carga no se oculta con visibility ni display:none', () => {
    assert.match(leer('index.html'), /id="loading"[^>]*role="status"[^>]*aria-live="polite"/);
    const base = declaraciones('.loading-overlay');
    assert.equal(base.display, 'flex');
    assert.equal(base.visibility, undefined, '.loading-overlay no debe usar visibility:hidden');
    assert.equal(base.opacity, '0');
    assert.equal(base['pointer-events'], 'none');
    const activo = declaraciones('.loading-overlay.active');
    assert.equal(activo.opacity, '1');
    assert.equal(activo['pointer-events'], 'auto');
    assert.equal(activo.visibility, undefined);
  });
});

describe('snackbar del gestor: region viva siempre disponible', () => {
  it('el contenedor es una region viva atomica en el HTML inicial', () => {
    assert.match(leer('index.html'),
      /id="error-message"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  });

  // Regresion: con display:none el aviso sale del arbol de accesibilidad al
  // llegar el mensaje y algunos lectores no lo anuncian. Se oculta con opacidad
  // (sin captura de clics) y .active lo devuelve a la vista con animacion.
  it('no se oculta con display:none', () => {
    const base = declaraciones('.toast-error');
    assert.equal(base.display, undefined, '.toast-error no debe usar display:none');
    assert.equal(base.opacity, '0');
    assert.equal(base['pointer-events'], 'none');
    const activo = declaraciones('.toast-error.active');
    assert.equal(activo.opacity, '1');
    assert.equal(activo['pointer-events'], 'auto');
  });
});

describe('CSP: sin handlers inline en el HTML generado', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const fuente = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  it('ningún JS de interfaz genera atributos on*=', () => {
    const ficheros = ['dashboard.js', 'web.js', 'app.js', 'publico.js', 'utils.js'];
    const patron = /\son(click|error|load|focus|blur|change|input|submit|mouseenter|mouseleave)=/g;
    ficheros.forEach(f => {
      const hallazgos = fuente('src/js/' + f).match(patron) || [];
      assert.equal(hallazgos.length, 0, f + ' tiene handlers inline: ' + hallazgos.join(' '));
    });
  });

  it('el reintento de foto de Drive va por data-fallback', () => {
    const js = fuente('src/js/dashboard.js');
    assert.match(js, /data-fallback=/);
    assert.match(js, /addEventListener\('error',[\s\S]{0,400}?\}, true\)/);
  });

  it('el tooltip del gráfico se engancha por delegación y usa su contenedor', () => {
    const js = fuente('src/js/dashboard.js');
    assert.match(js, /addEventListener\('mouseover',[\s\S]{0,200}?_chartTip\(d\)/);
    assert.match(js, /addEventListener\('focusin',[\s\S]{0,200}?_chartTip\(d\)/);
    assert.match(js, /_chartTip\(dot\) \{/);
    assert.match(js, /dash-chart-tooltip/);
    assert.match(fuente('src/css/styles.css'), /\.dash-chart-tooltip\.is-visible/);
  });
});

describe('menú de acciones (overflow): contrato de UI', () => {
  const js = [
    leer('js/dashboard.js'), leer('js/web.js'),
    leer('js/dashboard-finanzas.js'), leer('js/dashboard-blacklist.js')
  ].join('\n');

  it('el CSS lo oculta cerrado y mantiene objetivos táctiles de 44px en móvil', () => {
    assert.match(CSS, /\.action-menu\s*\{\s*position:\s*relative/);
    assert.match(CSS, /\.action-menu:not\(\[open\]\)\s+\.action-menu-list\s*\{\s*display:\s*none/);
    assert.match(CSS, /@media \(max-width:\s*767px\)[\s\S]{0,500}?\.action-menu-list \.btn,[\s\S]{0,200}?min-height:\s*44px/);
  });

  it('los menús usan details/summary con etiqueta accesible y lista de acciones', () => {
    const bloques = js.match(/<details class="action-menu">[\s\S]*?<\/details>/g) || [];
    assert.ok(bloques.length >= 8, 'menús encontrados: ' + bloques.length);
    bloques.forEach((b, i) => {
      assert.match(b, /<summary[^>]*aria-label="Más acciones"/, 'menú ' + i + ' sin etiqueta accesible');
      assert.match(b, /<div class="action-menu-list">/, 'menú ' + i + ' sin lista');
      assert.match(b, /data-action=/, 'menú ' + i + ' sin acciones');
    });
  });

  it('el cierre global cubre clics en enlaces y botones dentro del menú', () => {
    const web = leer('js/web.js');
    assert.match(web, /querySelectorAll\('details\.action-menu\[open\]'\)/);
    assert.match(web, /list\.contains\(e\.target\)/);
    assert.match(web, /removeAttribute\('open'\)/);
  });

  it('un menú sin acciones visibles se oculta completo', () => {
    assert.match(leer('js/dashboard.js'),
      /details\.action-menu'\)\.forEach\(menu =>[\s\S]{0,400}?menu\.style\.display = visibles\.length \? '' : 'none'/);
  });
});

describe('armonía visual: cabeceras de pantalla y dashboard por rol', () => {
  const js = leer('js/dashboard.js');
  const fuentes = js + leer('js/dashboard-finanzas.js') + leer('js/dashboard-blacklist.js') + leer('js/dashboard-actividad.js');

  it('el CSS comparte cabecera, píldoras, toolbar y cabecera de listado', () => {
    assert.match(CSS, /\.screen-head\s*\{/);
    assert.match(CSS, /\.screen-eyebrow\s*\{/);
    assert.match(CSS, /\.screen-title\s*\{/);
    assert.match(CSS, /\.screen-pill\s*\{/);
    assert.match(CSS, /\.screen-toolbar\s*\{/);
    assert.match(CSS, /\.screen-list-head\s*\{/);
    assert.match(CSS, /\.screen-stat--blue/);
  });

  it('las pantallas de gestión usan la cabecera y el resumen compartidos', () => {
    const cabeceras = (fuentes.match(/_screenHead\(\{/g) || []).length;
    assert.ok(cabeceras >= 9, 'cabeceras encontradas: ' + cabeceras);
    assert.match(js, /_screenPill\(this\.animales\.length/);
    assert.match(fuentes, /screen-list-head/);
    assert.match(fuentes, /screen-toolbar/);
  });

  it('cada rol tiene su composición, no solo secciones ocultas', () => {
    ['_paintCoordinadorHome', '_paintVoluntarioHome', '_paintTesoreriaHome', '_paintConsultaHome'].forEach(m => {
      assert.ok(js.includes(m + '(el)'), 'falta ' + m);
    });
    assert.match(js, /rol === 'coordinador'/);
    assert.match(js, /rol === 'voluntario'/);
    assert.match(js, /rol === 'tesoreria'/);
    assert.match(js, /rol === 'consulta'/);
    assert.match(js, /dash-hero--coordinador/);
    assert.match(js, /Prioridad de hoy/);
    assert.match(js, /Movimientos recientes/);
    assert.match(js, /Fichas disponibles/);
    assert.doesNotMatch(js, /dash-role-strip/);
  });

  it('las tablas de gestión se convierten en tarjetas en tablet', () => {
    assert.match(CSS, /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]{0,300}\.card \.data-table:not\(\.web-tabla\)/);
    assert.match(CSS, /\.card \.data-table:not\(\.web-tabla\) td::before/);
  });

  it('los modales no desbordan en horizontal por culpa de un control ancho', () => {
    assert.match(CSS, /\.form-row,\s*\.form-row > \.form-group,\s*\.form-group\s*\{\s*min-width:\s*0/);
    assert.match(CSS, /\.form-group input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)[\s\S]{0,160}?min-width:\s*0/);
    assert.match(CSS, /\.modal-body\s*\{\s*overflow-x:\s*hidden/);
    assert.match(CSS, /\.modal-footer\s*\{[\s\S]{0,160}?flex-wrap:\s*wrap/);
  });
});

describe('editor visual de descripciones HTML de Publicaciones', () => {
  const js = leer('js/dashboard.js');
  const web = leer('js/web.js');

  it('las tres descripciones usan el editor y no un textarea visible', () => {
    ['web-contenido', 'we-contenido', 'wg-contenido'].forEach(id => {
      assert.match(web, new RegExp("_editorHtml\\('" + id + "'"), 'falta el editor de ' + id);
    });
    assert.match(web, /contenteditable="true"/);
    assert.match(web, /class="form-input html-editor-source"[^>]*hidden/);
    assert.doesNotMatch(web, /<textarea id="(?:web|we|wg)-contenido"/);
  });

  it('la barra escribe en el contenteditable y sincroniza el textarea al guardar', () => {
    assert.match(js, /htmlEditorCmd\(btn, cmd, id, arg\)/);
    assert.match(js, /htmlEditorToggle\(btn, id\)/);
    assert.match(js, /_syncHtmlEditors\(form\)/);
    assert.match(js, /_initHtmlEditors\(body\)/);
    assert.match(js, /_sanitizePastedHtml\(html\)/);
    assert.match(web, /data-action="htmlEditorCmd"/);
    assert.match(web, /data-input="htmlEditorInput"/);
  });

  it('el editor tiene estilos propios y modo HTML', () => {
    ['.html-editor-toolbar', '.html-editor-btn', '.html-editor-surface', '.html-editor-source', '.html-editor.is-source']
      .forEach(sel => assert.match(CSS, new RegExp(sel.replace(/\./g, '\\.'))));
    assert.match(CSS, /\.html-editor-surface:empty::before/);
  });
});

describe('editor HTML: piezas simplificadas y tactiles', () => {
  const js = leer('js/dashboard.js');
  const web = leer('js/web.js');

  it('el formato de parrafo es un solo selector', () => {
    assert.match(web, /data-change="htmlEditorBlock"/);
    assert.doesNotMatch(web, /data-arg0="formatBlock"/);
    assert.match(js, /htmlEditorBlock\(block, id\)/);
  });

  it('hay una sola ayuda y cambia con el modo', () => {
    assert.match(web, /class="html-editor-help" data-html-editor-help/);
    assert.doesNotMatch(web, /html-editor-hint/);
    assert.match(js, /querySelector\('\.html-editor-help'\)/);
  });

  it('la seleccion se recupera al tocar la barra', () => {
    assert.match(js, /addEventListener\('selectionchange'/);
    assert.match(js, /_recordarSeleccion\(surface\)/);
    assert.match(js, /_seleccionEditor\(surface\)/);
  });

  it('un editor vacio no guarda relleno como contenido', () => {
    assert.match(js, /_valorHtml\(/);
    assert.match(js, /const soloRelleno = /);
  });

  it('la barra tactil crece a 40px y el texto a 16px', () => {
    assert.match(CSS, /\.html-editor-select\s*\{[\s\S]{0,400}?touch-action: manipulation/);
    assert.match(CSS, /@media \(max-width: 767px\)[\s\S]{0,300}\.html-editor-btn\s*\{[\s\S]{0,80}?min-height: 40px/);
  });
});
