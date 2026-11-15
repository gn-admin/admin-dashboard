/**
 * Resolución de roles (D1): denegación por defecto y compatibilidad segura.
 *
 * Carga `apps-script/Roles.gs` y `apps-script/Auth.gs` reales para fijar el
 * contrato de no listado/revocado/normalización y el fallback de Auth.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ROLES_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Roles.gs'), 'utf8');
const AUTH_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Auth.gs'), 'utf8');

function contextoRoles(sobrescribir = {}) {
  const ctx = Object.assign({
    CONFIG: { ROLES: { ADMIN: 'admin' }, ADMIN_EMAILS: [] },
    Logger: { log: () => {} },
  }, sobrescribir);
  vm.createContext(ctx);
  vm.runInContext(ROLES_GS, ctx);
  return ctx;
}

describe('Roles.gs: resolución segura de roles', () => {
  it('usuario no listado -> sin_acceso (denegación por defecto)', () => {
    const ctx = contextoRoles();
    assert.equal(ctx.resolverRolUsuario('uid', 'nadie@example.test'), 'sin_acceso');
  });

  it('usuario revocado (activo:false) -> sin_acceso', () => {
    const ctx = contextoRoles();
    assert.equal(ctx.resolverRolUsuario('uid', 'gn.test.revocado@example.test'), 'sin_acceso');
  });

  it('usuarios de prueba activos resuelven su rol', () => {
    const ctx = contextoRoles();
    assert.equal(ctx.resolverRolUsuario('uid', 'gn.test.admin@example.test'), 'admin');
    assert.equal(ctx.resolverRolUsuario('uid', 'gn.test.coordinador@example.test'), 'coordinador');
    assert.equal(ctx.resolverRolUsuario('uid', 'gn.test.voluntario@example.test'), 'voluntario');
    assert.equal(ctx.resolverRolUsuario('uid', 'gn.test.tesoreria@example.test'), 'tesoreria');
    assert.equal(ctx.resolverRolUsuario('uid', 'gn.test.consulta@example.test'), 'consulta');
  });

  it('normaliza email (mayúsculas/espacios)', () => {
    const ctx = contextoRoles();
    assert.equal(ctx.resolverRolUsuario('uid', '  GN.TEST.ADMIN@EXAMPLE.TEST  '), 'admin');
  });

  it('sin email -> null (rechazo)', () => {
    const ctx = contextoRoles();
    assert.equal(ctx.resolverRolUsuario('uid', ''), null);
    assert.equal(ctx.resolverRolUsuario('uid', null), null);
  });

  it('config segura por defecto: sin compatibilidad admin-vacío y rol por defecto sin_acceso', () => {
    const ctx = contextoRoles();
    assert.equal(ctx.COMPATIBILIDAD_TODOS_ADMIN_SI_VACIO, false);
    assert.equal(ctx.ROL_POR_DEFECTO_USUARIO_NO_LISTADO, 'sin_acceso');
  });
});

describe('Auth.gs: getUserRole (denegación por defecto)', () => {
  it('usa resolverRolUsuario si existe y nunca devuelve vacío', () => {
    const ctx = {
      CONFIG: { ROLES: { ADMIN: 'admin' }, ADMIN_EMAILS: [] },
      Logger: { log: () => {} },
    };
    vm.createContext(ctx);
    vm.runInContext(ROLES_GS, ctx);
    vm.runInContext(AUTH_GS, ctx);
    assert.equal(ctx.getUserRole('uid', 'nadie@example.test'), 'sin_acceso');
    assert.equal(ctx.getUserRole('uid', 'gn.test.revocado@example.test'), 'sin_acceso');
    assert.equal(ctx.getUserRole('uid', 'gn.test.admin@example.test'), 'admin');
  });

  it('fallback sin Roles.gs: solo ADMIN_EMAILS y sin admins configurados -> sin_acceso', () => {
    const ctx = {
      CONFIG: { ROLES: { ADMIN: 'admin' }, ADMIN_EMAILS: [] },
      Logger: { log: () => {} },
    };
    vm.createContext(ctx);
    vm.runInContext(AUTH_GS, ctx); // sin resolverRolUsuario
    assert.equal(ctx.getUserRole('uid', 'nadie@example.test'), 'sin_acceso');
  });

  it('fallback sin Roles.gs: admin reconocido por ADMIN_EMAILS', () => {
    const ctx = {
      CONFIG: { ROLES: { ADMIN: 'admin' }, ADMIN_EMAILS: ['admin@example.test'] },
      Logger: { log: () => {} },
    };
    vm.createContext(ctx);
    vm.runInContext(AUTH_GS, ctx);
    assert.equal(ctx.getUserRole('uid', 'Admin@example.test'), 'admin');
    assert.equal(ctx.getUserRole('uid', 'otro@example.test'), 'sin_acceso');
  });

  it('ante error inesperado devuelve sin_acceso', () => {
    const ctx = {
      CONFIG: null, // provoca error al leer ADMIN_EMAILS
      Logger: { log: () => {} },
      resolverRolUsuario: () => { throw new Error('boom'); },
    };
    vm.createContext(ctx);
    vm.runInContext(AUTH_GS, ctx);
    assert.equal(ctx.getUserRole('uid', 'x@example.test'), 'sin_acceso');
  });
});
