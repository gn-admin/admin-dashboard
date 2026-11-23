/**
 * Tests del generador de configuración (`scripts/gen-config.js`):
 *  - cada `sheetName` sale de `SHEET_<CLAVE>_TAB` cuando la clave está definida;
 *  - si la clave falta o está vacía, se usa el nombre actual como valor por
 *    defecto (así un `.env` incompleto no renombra pestañas ni rompe la hoja).
 *
 * Se ejecuta el generador real como proceso hijo contra un directorio temporal
 * (`GEN_CONFIG_OUT_DIR`), de modo que nunca se sobrescriben `src/js/config.js`
 * ni `apps-script/Config.gs` del repositorio.
 * Ejecutar: npm test
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const temporales = [];

after(() => {
  for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true });
});

function generar(variables) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-gen-config-'));
  temporales.push(out);
  const resultado = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'gen-config.js')], {
    cwd: RAIZ,
    env: { ...process.env, GEN_CONFIG_OUT_DIR: out, ...variables },
    encoding: 'utf8'
  });
  assert.equal(resultado.status, 0, 'el generador debe terminar bien: ' + (resultado.stderr || ''));
  const gs = fs.readFileSync(path.join(out, 'apps-script', 'Config.gs'), 'utf8');
  assert.ok(gs.includes('var CONFIG'), 'debe generar el Config.gs del backend');
  return gs;
}

/** sheetName de una entrada del bloque `sheets`. */
function pestana(gs, clave) {
  const m = gs.match(new RegExp(clave + ":\\s*\\{\\s*sheetId:\\s*'[^']*',\\s*sheetName:\\s*'([^']*)'"));
  return m ? m[1] : null;
}

/** sheetName de una encuesta (clave entrecomillada, con name/formId delante). */
function pestanaEncuesta(gs, id) {
  const i = gs.indexOf("'" + id + "':");
  assert.notEqual(i, -1, 'debe existir la encuesta ' + id);
  const m = gs.slice(i).match(/sheetName:\s*'([^']*)'/);
  return m ? m[1] : null;
}

describe('gen-config: pestañas por .env', () => {
  it('usa el nombre actual cuando la clave TAB falta o está vacía', () => {
    const gs = generar({ SHEET_GRUPOS_TAB: '', SHEET_ESTADOS_TAB: '' });
    assert.equal(pestana(gs, 'grupos'), 'Grupos');
    assert.equal(pestana(gs, 'estados'), 'Estados');
    assert.equal(pestana(gs, 'familias'), 'Familias');
    assert.equal(pestana(gs, 'animales'), 'Animales');
    assert.equal(pestanaEncuesta(gs, 'pre-adopcion-perros'), 'Respuestas de formulario 1');
  });

  it('respeta SHEET_<CLAVE>_TAB cuando se define', () => {
    const gs = generar({
      SHEET_GRUPOS_TAB: 'Hoja renombrada',
      SHEET_ESTADOS_TAB: 'Estados 2026',
      SHEET_PERROS_TAB: 'Respuestas de formulario 7'
    });
    assert.equal(pestana(gs, 'grupos'), 'Hoja renombrada');
    assert.equal(pestana(gs, 'estados'), 'Estados 2026');
    assert.equal(pestanaEncuesta(gs, 'pre-adopcion-perros'), 'Respuestas de formulario 7');
    // El resto sigue con su valor por defecto: no se contagia entre claves.
    assert.equal(pestana(gs, 'familias'), 'Familias');
    assert.equal(pestana(gs, 'animales'), 'Animales');
  });

  it('deriva la clave TAB de las filas de sheetsBlock (SHEET_*_ID -> SHEET_*_TAB)', () => {
    const gs = generar({ SHEET_AUDITORIA_TAB: 'Auditoria 2026' });
    assert.equal(pestana(gs, 'auditoria'), 'Auditoria 2026');
  });

  it('no deja sheetName literales en el generador', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'scripts', 'gen-config.js'), 'utf8');
    const literales = fuente
      .split(/\r?\n/)
      .filter(l => /sheetName:\s*'/.test(l) && !/env\(/.test(l));
    assert.deepEqual(literales, [], 'todo sheetName debe venir de env() con valor por defecto');
  });
});
