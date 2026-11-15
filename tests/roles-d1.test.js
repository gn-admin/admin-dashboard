/**
 * Autorización por rol (D1): denegación por defecto y matriz de permisos.
 *
 * Se carga el `apps-script/Code.gs` real en un contexto aislado y se ejercitan
 * las funciones puras de autorización (`_role`, `_canReadEndpoint`,
 * `_canWriteEndpoint`, `_dataForUser`) y el perfil minimizado de `sin_acceso`.
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

  it('solo puede leer su perfil', () => {
    assert.equal(ctx._canReadEndpoint('user-profile', user), true);
    for (const endpoint of ['animales', 'familias', 'adopciones', 'socios', 'blacklist', 'gastos', 'donaciones', 'inventario', 'actividad', 'surveys', 'web-resumen']) {
      assert.equal(ctx._canReadEndpoint(endpoint, user), false, endpoint);
    }
  });

  it('no puede escribir en ningún endpoint', () => {
    for (const endpoint of ['animales', 'update-animal', 'delete-animal', 'familias', 'web-crear-evento', 'web-actualizar-evento', 'actividad']) {
      assert.equal(ctx._canWriteEndpoint(endpoint, user), false, endpoint);
    }
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

  it('un rol desconocido no lee ni escribe', () => {
    assert.equal(puedeLeer('gestor', 'animales'), false);
    assert.equal(puedeEscribir('gestor', 'animales'), false);
  });
});
