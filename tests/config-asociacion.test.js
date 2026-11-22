/**
 * Datos de la asociación en el contrato: `scripts/gen-config.js` y su uso.
 *
 * En el despliegue las variables llegan como `${{ secrets.X || vars.X }}`: si no
 * existen, la variable queda definida pero VACÍA. Esta prueba genera la config
 * con valores vacíos (o solo espacios) y comprueba que el párrafo «Y, de la otra
 * parte, …» del contrato sigue completo, además de que los valores reales se usan
 * en el modelo y en la vista imprimible.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Modelo = require('../src/js/contrato-modelo.js');

const RAIZ = path.join(__dirname, '..');
const CLAVES = ['ASOCIACION_NOMBRE', 'ASOCIACION_CIF', 'ASOCIACION_DOMICILIO', 'CONTACTO_TELEFONO'];

// Datos del documento de la asociación, los mismos en todas las pruebas.
const DOCUMENTO = {
  ASOCIACION_NOMBRE: 'Asociación Pro-Bienestar Animal, Grupo Nebak',
  ASOCIACION_CIF: 'G75203562',
  ASOCIACION_DOMICILIO: 'calle Santiago, n.º 27, 1º izquierda, Irun, código postal 20300',
  CONTACTO_TELEFONO: '625140588 y 600042594'
};

// Se ejecuta el generador real en una copia temporal para no tocar la config
// del proyecto (ni la que acaba de generar el despliegue).
function generar(valores) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-config-'));
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, 'scripts', 'gen-config.js'), path.join(tmp, 'scripts', 'gen-config.js'));
  const env = Object.assign({}, process.env);
  CLAVES.forEach((k) => { env[k] = valores[k] !== undefined ? valores[k] : ''; });
  execFileSync(process.execPath, [path.join(tmp, 'scripts', 'gen-config.js')], { cwd: tmp, env, stdio: 'pipe' });
  return require(path.join(tmp, 'src', 'js', 'config.js'));
}

/** Modelo del contrato para una entidad dada, con el párrafo y el pie. */
function contrato(asociacion) {
  const modelo = Modelo.construir({
    c: { f1_nombre: 'Ana' },
    animal: { nombre: 'Luna' },
    entidad: asociacion,
    fecha: '15/01/2026'
  });
  return {
    modelo,
    parrafo: modelo.bloques.find(b => b.tipo === 'parrafo' && /^Y, de la otra parte/.test(b.texto)),
    pie: modelo.bloques.find(b => b.tipo === 'pie')
  };
}

describe('config: datos de la asociación en el contrato', () => {
  it('con ASOCIACION_* vacíos mantiene el nombre por defecto y no inventa CIF', () => {
    const cfg = generar({});
    assert.equal(cfg.asociacion.nombre, 'Asociación Grupo Nebak');
    assert.equal(cfg.asociacion.cif, '');
    assert.equal(cfg.asociacion.domicilio, '');
  });

  it('usa los valores configurados en el párrafo completo', () => {
    const cfg = generar(DOCUMENTO);
    assert.equal(cfg.asociacion.cif, 'G75203562');
    const { parrafo } = contrato(cfg.asociacion);
    assert.match(parrafo.texto, /^Y, de la otra parte, Asociación Pro-Bienestar Animal, Grupo Nebak, con CIF G75203562, con domicilio en calle Santiago/);
    assert.match(parrafo.texto, /que en adelante será denominada como la Asociación\.$/);
  });

  // Una sola regla para todos los campos de la entidad: la config del
  // despliegue manda sobre la copia congelada del contrato, que solo rellena lo
  // que la config no define. Los teléfonos del párrafo salen de CONTACTO_TELEFONO.
  it('la config manda sobre la copia congelada del contrato', () => {
    const cfg = generar(DOCUMENTO);
    const PdfExport = require('../src/js/pdf-export.js');
    global.CONFIG = cfg;
    let ent;
    try {
      // Copia congelada de un contrato antiguo, con los datos de entonces.
      ent = PdfExport._entidadDatos({
        entidad_nombre: 'Asociación Grupo Nebak',
        entidad_cif: 'G00000000',
        entidad_domicilio: 'Irún',
        entidad_email: 'viejo@example.test',
        entidad_telefono: '600000000'
      });
    } finally {
      delete global.CONFIG;
    }
    assert.equal(ent.nombre, 'Asociación Pro-Bienestar Animal, Grupo Nebak');
    assert.equal(ent.cif, 'G75203562');
    assert.match(ent.domicilio, /^calle Santiago/);
    assert.equal(ent.telefono, '625140588 y 600042594');
    // Lo que la config no define sigue saliendo de la copia del contrato.
    assert.equal(ent.email, 'viejo@example.test');
    const { parrafo } = contrato(ent);
    assert.match(parrafo.texto, /^Y, de la otra parte, Asociación Pro-Bienestar Animal, Grupo Nebak, con CIF G75203562, con domicilio en calle Santiago/);
    assert.match(parrafo.texto, /y con teléfonos de contacto 625140588 y 600042594, que en adelante será denominada como la Asociación\.$/);
  });

  // La vista imprimible (papel) sale del mismo modelo: tiene que llevar los
  // datos configurados, no solo el PDF del servidor.
  it('la vista imprimible lleva nombre, CIF, domicilio y teléfonos de la config', () => {
    const cfg = generar(DOCUMENTO);
    const PdfExport = require('../src/js/pdf-export.js');
    const entidad = Object.assign({}, cfg.asociacion, { telefono: cfg.contacto.telefono });
    // Solo el texto visible: sin estilos ni etiquetas.
    const visible = PdfExport._htmlContrato(contrato(entidad).modelo)
      .replace(/<style>[\s\S]*?<\/style>/i, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    [
      'Asociación Pro-Bienestar Animal, Grupo Nebak',
      'G75203562',
      'calle Santiago, n.º 27',
      '625140588 y 600042594'
    ].forEach((t) => assert.ok(visible.includes(t), 'falta «' + t + '» en la vista imprimible'));
  });

  it('con el nombre en blanco el párrafo de la asociación sigue completo', () => {
    const cfg = generar({ ASOCIACION_NOMBRE: '   ' });
    const { parrafo, pie } = contrato(cfg.asociacion);
    assert.equal(parrafo.texto, 'Y, de la otra parte, la Asociación.');
    assert.doesNotMatch(parrafo.texto, /,\s*,|undefined|null/);
    assert.equal(pie.texto, 'Generado por Grupo Nebak · 15/01/2026');
  });
});
