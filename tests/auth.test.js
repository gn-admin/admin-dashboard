/**
 * Tests del mensaje de login (puro, sin DOM ni red).
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Auth = require('../src/js/auth.js');

const SIN_REVELAR = /firebase|gstatic|apikey|api key|auth\/|proyecto|sdk/i;

describe('_msgLogin: el error de login nunca revela el proveedor', () => {
  const crudos = [
    'Firebase: Error (auth/invalid-credential).',
    'Firebase: Error (auth/wrong-password).',
    'Firebase: Error (auth/user-not-found).',
    'Firebase: Error (auth/invalid-email).',
    'Firebase: Error (auth/too-many-requests). Many login attempts...',
    'Firebase: Error (auth/network-request-failed).',
    'Firebase: Error (auth/user-disabled).',
    'Firebase: Error (auth/operation-not-allowed).',
    'Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key).',
    'Failed to load resource: https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
    Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), { code: 'auth/invalid-credential' }),
    Object.assign(new Error('algo raro'), { code: 'auth/quota-exceeded' }),
    new Error('ReferenceError: firebase is not defined'),
    null,
    undefined,
    '',
    { message: 'Firebase: Error (auth/missing-password).' }
  ];

  crudos.forEach((err, i) => {
    it(`no filtra firebase ni codigos internos (caso ${i})`, () => {
      const msg = Auth._msgLogin(err);
      assert.equal(typeof msg, 'string');
      assert.ok(msg.trim().length > 0, 'mensaje vacio');
      assert.ok(!SIN_REVELAR.test(msg), `filtra proveedor: ${msg}`);
      assert.ok(!msg.includes('auth/'), `filtra codigo: ${msg}`);
    });
  });

  it('credenciales invalidas -> mensaje generico de email/contrasena', () => {
    assert.equal(Auth._msgLogin({ code: 'auth/wrong-password' }), 'Email o contrasena incorrectos.');
    assert.equal(Auth._msgLogin({ code: 'auth/user-not-found' }), 'Email o contrasena incorrectos.');
    assert.equal(Auth._msgLogin({ code: 'auth/invalid-credential' }), 'Email o contrasena incorrectos.');
  });

  it('sin error concreto -> mensaje generico', () => {
    assert.equal(Auth._msgLogin(null), 'No se pudo iniciar sesion. Intentalo de nuevo.');
    assert.equal(Auth._msgLogin({}), 'No se pudo iniciar sesion. Intentalo de nuevo.');
    assert.equal(Auth._msgLogin({ code: 'auth/algo-nuevo' }), 'No se pudo iniciar sesion. Intentalo de nuevo.');
  });

  it('demasiados intentos y red tienen mensaje propio', () => {
    assert.match(Auth._msgLogin({ code: 'auth/too-many-requests' }), /Demasiados intentos/);
    assert.match(Auth._msgLogin({ code: 'auth/network-request-failed' }), /conexion/);
  });

  it('email o campos vacios no se confunde con credenciales invalidas', () => {
    assert.match(Auth._msgLogin({ code: 'auth/invalid-email' }), /email y una contrasena/);
    assert.match(Auth._msgLogin({ code: 'auth/missing-password' }), /email y una contrasena/);
  });
});

describe('loginWithEmail: relanza siempre un error sanitizado', () => {
  it('la excepcion del proveedor no llega al llamante', async () => {
    const originalEnsure = Auth._ensureSDK;
    const originalFirebase = global.firebase;
    Auth._ensureSDK = () => Promise.resolve();
    global.firebase = {
      auth: () => ({
        signInWithEmailAndPassword: async () => {
          throw Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), {
            code: 'auth/invalid-credential'
          });
        }
      })
    };
    try {
      await assert.rejects(
        () => Auth.loginWithEmail('a@b.com', 'x'),
        (err) => {
          assert.ok(!SIN_REVELAR.test(err.message), `filtra proveedor: ${err.message}`);
          assert.equal(err.message, 'Email o contrasena incorrectos.');
          return true;
        }
      );
    } finally {
      Auth._ensureSDK = originalEnsure;
      if (originalFirebase === undefined) delete global.firebase;
      else global.firebase = originalFirebase;
    }
  });
});
