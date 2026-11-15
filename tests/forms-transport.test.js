/**
 * C4 (spike): helpers de transporte de formularios (sin runtime productivo).
 * Verifica construcción/aplanado de payload; el envío iframe requiere DOM real.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const FT = require('../src/js/forms-transport.js');

describe('FormsTransport (C4 spike)', () => {
  it('aplana campos anidados y arrays', () => {
    const out = FT.aplanarCampos({ nombre: 'Ana', contacto: { email: 'a@b.c' }, tags: ['x', 'y'] });
    assert.equal(out.nombre, 'Ana');
    assert.equal(out['contacto[email]'], 'a@b.c');
    assert.equal(out.tags, 'x,y');
  });

  it('buildPayload incluye metadatos y campos aplanados', () => {
    const p = FT.buildPayload({
      form_type: 'contacto',
      concepto: 'Info',
      page_url: 'https://example.test/p',
      privacy_accepted: true,
      recaptcha: { token: 'tok', action: 'submit' },
      fields: { nombre: 'Ana', tel: '123' }
    });
    assert.equal(p.endpoint, 'forms-submit');
    assert.equal(p.form_type, 'contacto');
    assert.equal(p.concepto, 'Info');
    assert.equal(p.page_url, 'https://example.test/p');
    assert.equal(p.privacy_accepted, 'true');
    assert.equal(p.recaptcha_token, 'tok');
    assert.equal(p.recaptcha_action, 'submit');
    assert.equal(p['fields[nombre]'], 'Ana');
    assert.equal(p['fields[tel]'], '123');
  });

  it('buildPayload tolera datos vacíos y normaliza privacy', () => {
    const p = FT.buildPayload({});
    assert.equal(p.endpoint, 'forms-submit');
    assert.equal(p.privacy_accepted, 'false');
    assert.equal(p.form_type, undefined); // vacíos opcionales eliminados
  });

  it('submitViaIframe sin document devuelve resultado controlado', async () => {
    const res = await FT.submitViaIframe('https://example.test/exec', {}, { document: null });
    assert.equal(res.ok, false);
    assert.equal(res.transport, 'iframe');
  });
});
