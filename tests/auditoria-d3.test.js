/**
 * D3 (instrumentación): acciones sensibles y del gestor web registran auditoría.
 * Verificación estática sobre el código fuente desplegable (.gs).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const WEB = fs.readFileSync(path.join(RAIZ, 'apps-script', 'WebPublicaciones.gs'), 'utf8');

describe('D3: instrumentación de auditoría (código)', () => {
  it('gestor web audita publicar/cambiar estado, retirar, restaurar y eliminar publicación', () => {
    assert.match(WEB, /registrarAuditoria\(\s*'publicacion_web'/, 'publicacion_web');
    assert.match(WEB, /registrarAuditoria\(\s*'retirar_publicacion'/, 'retirar_publicacion');
    assert.match(WEB, /registrarAuditoria\(\s*'restaurar_publicacion'/, 'restaurar_publicacion');
    assert.match(WEB, /registrarAuditoria\(\s*'eliminar_publicacion'/, 'eliminar_publicacion');
  });

  it('Code.gs audita operaciones sensibles vía _audit en endpoints críticos', () => {
    // La tabla de sensibles incluye borrados, cambios clave y subidas web.
    for (const ep of [
      'delete-animal', 'delete-familia', 'delete-adopcion', 'delete-socio',
      'delete-blacklist', 'delete-contrato', 'blacklist', 'update-blacklist',
      'contratos', 'update-contrato', 'adopciones', 'update-adopcion',
      'send-contrato-email', 'web-media-subir'
    ]) {
      assert.ok(CODE.includes("'" + ep + "':1"), 'endpoint sensible listado: ' + ep);
    }
    assert.match(CODE, /function\s+registrarAuditoria\s*\(/, 'registrarAuditoria existe');
    assert.match(CODE, /_audit\(endpoint,\s*user,\s*body,\s*_r\)/, 'llamadas a _audit');
  });

  it('estados y notas registran auditoría', () => {
    assert.match(CODE, /registrarAuditoria\(\s*'set_estado'/, 'set_estado');
    assert.match(CODE, /registrarAuditoria\(\s*'set_nota'/, 'set_nota');
  });
});
