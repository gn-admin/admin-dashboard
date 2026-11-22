/**
 * Autorización por rol (D1): denegación por defecto y matriz de permisos.
 *
 * Se carga el `apps-script/Code.gs` real en un contexto aislado y se ejercitan
 * las funciones puras de autorización (`_role`, `_canReadEndpoint`,
 * `_canWriteEndpoint`, `_dataForUser`) y el perfil minimizado de `sin_acceso`.
 * La matriz de cada rol se comprueba además contra **todos** los endpoints del
 * despachador (se leen del `switch`), para que uno nuevo no se cuele abierto.
 * No sustituye a las pruebas en vivo: fija el contrato para que un cambio en
 * `Code.gs` no abra permisos por accidente.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const CODE_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');

/** Endpoints del `switch` de una función del despachador. */
function endpointsDe(nombre) {
  const inicio = CODE_GS.indexOf('function ' + nombre + '(');
  assert.ok(inicio !== -1, 'no existe ' + nombre + ' en Code.gs');
  const resto = CODE_GS.slice(inicio + 1);
  const bloque = resto.slice(0, resto.indexOf('\nfunction '));
  return Array.from(new Set((bloque.match(/case '[^']+'/g) || []).map(s => s.slice(6, -1))));
}

const LEER = endpointsDe('handleGet');
const ESCRIBIR = endpointsDe('handlePost');

function crearEntorno() {
  const ctx = {
    CONFIG: {
      ROLES: { ADMIN: 'admin', COORDINADOR: 'coordinador', VOLUNTARIO: 'voluntario', TESORERIA: 'tesoreria', CONSULTA: 'consulta' },
      ADMIN_EMAILS: [],
      sheets: {},
    },
    // DataFilter real depende de las hojas; para autorización basta con un
    // stub que devuelva lo que recibe (no es lo que se está probando aquí).
    filterDataByRole: (data) => data,
    Logger: { log: () => {} },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(texto) {
        return {
          texto,
          setMimeType() { return this; },
          getContent() { return this.texto; }
        };
      }
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_GS, ctx);
  return ctx;
}

const perfil = (role) => ({ uid: 'uid-1', email: 'persona@example.test', name: 'Persona', role });

describe('D1: denegación por defecto', () => {
  it('sin usuario, `_role` cae en sin_acceso (nunca en consulta)', () => {
    const ctx = crearEntorno();
    assert.equal(ctx._role(null), 'sin_acceso');
    assert.equal(ctx._role(undefined), 'sin_acceso');
    assert.equal(ctx._role({}), 'sin_acceso');
  });

  it('normaliza el rol del usuario (mayúsculas y espacios)', () => {
    const ctx = crearEntorno();
    assert.equal(ctx._role({ role: '  Admin ' }), 'admin');
    assert.equal(ctx._role({ role: 'COORDINADOR' }), 'coordinador');
  });

  it('sin usuario no se devuelven datos', () => {
    const ctx = crearEntorno();
    assert.deepEqual([...ctx._dataForUser([{ id: 1 }], null)], []);
  });

  it('admin recibe los datos sin filtrar', () => {
    const ctx = crearEntorno();
    assert.equal(ctx._dataForUser([{ id: 1 }], perfil('admin')).length, 1);
  });
});

describe('D1: rol sin_acceso', () => {
  const ctx = crearEntorno();
  const user = perfil('sin_acceso');

  it('de todos los endpoints de lectura solo puede leer su perfil', () => {
    assert.deepEqual(LEER.filter((ep) => ctx._canReadEndpoint(ep, user)), ['user-profile']);
  });

  it('no puede escribir en ningún endpoint', () => {
    ESCRIBIR.forEach((ep) => assert.equal(ctx._canWriteEndpoint(ep, user), false, ep));
  });

  it('el perfil se minimiza a role + email (sin uid ni nombre)', () => {
    const res = ctx.handleGet('user-profile', user, {});
    const body = JSON.parse(res.getContent());
    assert.equal(body.status, 'success');
    assert.equal(body.role, 'sin_acceso');
    assert.equal(body.email, user.email);
    assert.deepEqual(Object.keys(body).sort(), ['email', 'role', 'status']);
  });

  it('el perfil normal sí incluye uid, nombre y rol', () => {
    const res = ctx.handleGet('user-profile', perfil('voluntario'), {});
    const body = JSON.parse(res.getContent());
    assert.equal(body.uid, 'uid-1');
    assert.equal(body.name, 'Persona');
    assert.equal(body.role, 'voluntario');
  });
});

describe('matriz de lectura/escritura por rol', () => {
  const ctx = crearEntorno();
  const puedeLeer = (role, ep) => ctx._canReadEndpoint(ep, perfil(role));
  const puedeEscribir = (role, ep) => ctx._canWriteEndpoint(ep, perfil(role));

  it('consulta lee pero no escribe', () => {
    assert.equal(puedeLeer('consulta', 'animales'), true);
    assert.equal(puedeLeer('consulta', 'web-resumen'), false);
    assert.equal(puedeEscribir('consulta', 'animales'), false);
    assert.equal(puedeEscribir('consulta', 'actividad'), false);
  });

  it('coordinador lee todo y publica contenido web, sin acciones solo-admin', () => {
    for (const ep of ['animales', 'familias', 'adopciones', 'blacklist', 'gastos', 'actividad', 'web-resumen']) {
      assert.equal(puedeLeer('coordinador', ep), true, ep);
    }
    assert.equal(puedeEscribir('coordinador', 'update-animal'), true);
    assert.equal(puedeEscribir('coordinador', 'web-crear-evento'), true);
    assert.equal(puedeEscribir('coordinador', 'delete-socio'), false);
    assert.equal(puedeEscribir('coordinador', 'blacklist'), false);
  });

  it('voluntario lee lo operativo y no toca datos sensibles ni el gestor web', () => {
    for (const ep of ['animales', 'familias', 'adopciones', 'candidaturas', 'acogidas', 'apadrinamientos', 'actividad']) {
      assert.equal(puedeLeer('voluntario', ep), true, ep);
    }
    for (const ep of ['blacklist', 'contratos', 'donaciones', 'gastos', 'inventario', 'web-resumen']) {
      assert.equal(puedeLeer('voluntario', ep), false, ep);
    }
    assert.equal(puedeEscribir('voluntario', 'animales'), true);
    assert.equal(puedeEscribir('voluntario', 'web-crear-evento'), false);
    assert.equal(puedeEscribir('voluntario', 'delete-animal'), false);
  });

  it('tesoreria se limita a finanzas, inventario y actividad', () => {
    for (const ep of ['donaciones', 'gastos', 'apadrinamientos', 'inventario', 'actividad', 'animales', 'adopciones', 'socios']) {
      assert.equal(puedeLeer('tesoreria', ep), true, ep);
    }
    for (const ep of ['familias', 'candidaturas', 'acogidas', 'contratos', 'blacklist', 'web-resumen']) {
      assert.equal(puedeLeer('tesoreria', ep), false, ep);
    }
    assert.equal(puedeEscribir('tesoreria', 'donaciones'), true);
    assert.equal(puedeEscribir('tesoreria', 'delete-gasto'), true);
    assert.equal(puedeEscribir('tesoreria', 'animales'), false);
    assert.equal(puedeEscribir('tesoreria', 'web-crear-evento'), false);
  });

  it('un rol desconocido no lee ni escribe en ningún endpoint', () => {
    LEER.forEach((ep) => assert.equal(puedeLeer('gestor', ep), false, ep));
    ESCRIBIR.forEach((ep) => assert.equal(puedeEscribir('gestor', ep), false, ep));
  });
});

// Lo mismo, pero pasando por el despachador: un endpoint nuevo que se cuele sin
// permiso aparece aquí sin que haya que acordarse de añadirlo a ninguna lista.
describe('puerta cerrada en todos los endpoints del despachador', () => {
  const ctx = crearEntorno();
  const cuerpo = (res) => JSON.parse(res.getContent());

  it('el despachador se lee completo', () => {
    assert.ok(LEER.length >= 25, 'solo ' + LEER.length + ' endpoints de lectura');
    assert.ok(ESCRIBIR.length >= 25, 'solo ' + ESCRIBIR.length + ' de escritura');
  });

  it('sin acceso, la única lectura que responde es su perfil', () => {
    const permitidos = LEER.filter((ep) => cuerpo(ctx.handleGet(ep, perfil('sin_acceso'), { parameter: {} })).status === 'success');
    assert.deepEqual(permitidos, ['user-profile']);
  });

  it('sin acceso y consulta no ejecutan ningún POST', () => {
    for (const role of ['sin_acceso', 'consulta']) {
      for (const ep of ESCRIBIR) {
        assert.equal(ctx._canWriteEndpoint(ep, perfil(role)), false, role + ' escribe ' + ep);
        const res = cuerpo(ctx.handlePost(ep, perfil(role), { postData: { contents: '{}' } }));
        assert.match(String(res.error), /No autorizado/, role + ' ejecutó ' + ep);
      }
    }
  });

  it('administración llega a todo lo despachado', () => {
    LEER.forEach((ep) => assert.equal(ctx._canReadEndpoint(ep, perfil('admin')), true, 'GET ' + ep));
    ESCRIBIR.forEach((ep) => assert.equal(ctx._canWriteEndpoint(ep, perfil('admin')), true, 'POST ' + ep));
  });

  it('lo que coordinación no escribe no lo escribe ningún rol menor', () => {
    const soloAdmin = ESCRIBIR.filter((ep) => !ctx._canWriteEndpoint(ep, perfil('coordinador')));
    // El correo y el PDF del contrato son las dos puertas que no se abren.
    assert.ok(soloAdmin.includes('send-contrato-email'), 'send-contrato-email debería ser solo-admin');
    assert.ok(soloAdmin.includes('contrato-pdf-preview'), 'contrato-pdf-preview debería ser solo-admin');
    for (const role of ['voluntario', 'tesoreria', 'consulta', 'sin_acceso', 'gestor']) {
      soloAdmin.forEach((ep) => assert.equal(ctx._canWriteEndpoint(ep, perfil(role)), false, role + ' → ' + ep));
    }
  });

  it('el gestor web no se toca fuera de administración y coordinación', () => {
    const webLeer = LEER.filter((ep) => ep.indexOf('web-') === 0);
    const webEscribir = ESCRIBIR.filter((ep) => ep.indexOf('web-') === 0);
    assert.ok(webLeer.length && webEscribir.length, 'no hay endpoints web- en el despachador');
    for (const role of ['voluntario', 'tesoreria', 'consulta']) {
      webLeer.forEach((ep) => assert.equal(ctx._canReadEndpoint(ep, perfil(role)), false, role + ' lee ' + ep));
    }
    webEscribir.forEach((ep) => assert.equal(ctx._canWriteEndpoint(ep, perfil('coordinador')), true, ep));
  });
});
