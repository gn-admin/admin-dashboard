/**
 * Gate de contrato · pruebas del script de solo lectura.
 * No tocan red real: usan un fetch simulado con la forma del canal.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = 'https://script.test/macros/s/demo/exec';
const VERSION = '2026-11-15.7';

const pubs = [
  {
    slug: 'luna', type: 'animal', status: 'en_adopcion', title: 'Luna',
    featured: true, sponsor: { available: true }, category: 'Perros en adopción',
    coverImage: { src: 'https://cdn.test/luna.jpg', alt: 'Luna' }
  },
  {
    slug: 'milo', type: 'animal', status: 'en_adopcion', title: 'Milo',
    featured: false, sponsor: { available: false }, category: 'Gatos en adopción',
    coverImage: { src: 'https://cdn.test/milo.jpg', alt: 'Milo' }
  },
  {
    slug: 'camada', type: 'animal_grupo', status: 'en_acogida', title: 'Camada',
    featured: false, sponsor: { available: false }, category: 'Acogidas',
    coverImage: { src: 'https://cdn.test/camada.jpg', alt: 'Camada' }, isGroup: true
  },
  {
    slug: 'jornada', type: 'evento', status: 'programado', title: 'Jornada',
    featured: false, category: 'Eventos',
    coverImage: { src: 'https://cdn.test/jornada.jpg', alt: 'Jornada' }
  },
  {
    slug: 'caso', type: 'historia', status: 'publicado', title: 'Caso externo',
    featured: false, category: 'Caso externo',
    coverImage: { src: 'https://cdn.test/caso.jpg', alt: 'Caso' }
  }
];

function reply(payload, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(payload)
  };
}

function detail(slug) {
  if (slug === 'luna') {
    return { status: 'success', data: { slug: 'luna', type: 'animal', title: 'Luna', ficha: { plantilla: 'animal' } } };
  }
  if (slug === 'camada') {
    return { status: 'success', data: { slug: 'camada', type: 'animal_grupo', title: 'Camada', animal: { groupName: 'Camada', members: [] } } };
  }
  if (slug === 'jornada') {
    // `family` es un campo editorial del evento, no un dato interno del animal.
    return { status: 'success', data: { slug: 'jornada', type: 'evento', title: 'Jornada', event: { family: { name: 'Familias invitadas' } } } };
  }
  if (slug === 'caso') {
    return { status: 'success', data: { slug: 'caso', type: 'historia', title: 'Caso externo', ficha: { plantilla: 'historia' } } };
  }
  if (slug === 'retirada') {
    return { status: 'gone', code: 'gone', error: 'Esta publicación se ha retirado' };
  }
  return { status: 'error', error: 'Publicación no encontrada' };
}

function mockFetch(overrides = {}) {
  return async (url) => {
    const u = new URL(url);
    const endpoint = u.searchParams.get('endpoint');
    if (overrides[endpoint]) return overrides[endpoint](u);

    switch (endpoint) {
      case 'config-publica':
        return reply({
          status: 'success',
          data: {
            site: { name: 'Grupo Nebak', url: 'https://web.test' },
            contact: { email: 'hola@web.test', phone: '600000000' },
            seo: { baseUrl: 'https://web.test' }
          }
        });
      case 'config':
        return reply({ error: 'Token no proporcionado' }, 401);
      case 'publicaciones':
      case 'animales-publicos': {
        let data = endpoint === 'animales-publicos'
          ? pubs.filter((p) => p.type === 'animal')
          : pubs.slice();
        const featured = u.searchParams.get('featured');
        const sponsor = u.searchParams.get('sponsor');
        const category = u.searchParams.get('category');
        if (featured === '1') data = data.filter((p) => p.featured === true);
        if (featured === '0') data = data.filter((p) => p.featured === false);
        if (sponsor === '1') data = data.filter((p) => p.sponsor && p.sponsor.available === true);
        if (category) data = data.filter((p) => p.category === category);
        return reply({ status: 'success', data });
      }
      case 'publicacion':
        return reply(detail(u.searchParams.get('slug')));
      case 'taxonomias':
        return reply({ status: 'success', data: { status: ['en_adopcion'], category: ['Perros en adopción'] } });
      case 'sitemap':
        return reply({ status: 'success', data: [{ loc: 'https://web.test/animales/luna' }] });
      case 'redirects':
        return reply({ status: 'success', data: [] });
      case 'retiradas':
        return reply({ status: 'success', data: [] });
      case 'web-resumen':
        return u.searchParams.get('token')
          ? reply({ status: 'success', data: { totales: { publicados: 5 } } })
          : reply({ error: 'Token no proporcionado' }, 401);
      case 'web-deploy-estado':
        return reply({ status: 'success', data: { configurado: true, version: VERSION, repo: 'x', ref: 'main', workflow: 'deploy.yml' } });
      case 'web-deploy-cuerpo':
        return reply({ status: 'success', data: { version: VERSION, construir_con_saneado: true } });
      default:
        return reply({ status: 'error', error: 'Endpoint no encontrado' }, 404);
    }
  };
}

function columnsReport(missingAnimales = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-smoke-'));
  const file = path.join(dir, 'columnas.json');
  fs.writeFileSync(file, JSON.stringify({
    sheets: {
      WebPublicaciones: { missing: [] },
      Animales: { missing: missingAnimales }
    }
  }));
  return { dir, file };
}

async function load() {
  const mod = await import('../scripts/contract-smoke.mjs');
  return mod.runSmoke;
}

test('contract-smoke: PASS solo con todas las evidencias, incluidos evento e historia', async () => {
  const runSmoke = await load();
  const report = columnsReport();
  try {
    const result = await runSmoke({
      base: BASE,
      fetchImpl: mockFetch(),
      env: {},
      token: 'token-de-prueba',
      columnsReport: report.file,
      retiredSlug: 'retirada',
      expectedVersion: VERSION
    });
    const fail = result.results.filter((r) => r.status === 'FAIL');
    const warn = result.results.filter((r) => r.status === 'WARN');
    assert.equal(result.ok, true, 'FAIL: ' + JSON.stringify(fail) + ' WARN: ' + JSON.stringify(warn));
    assert.equal(result.summary.fail, 0);
    assert.equal(result.summary.warn, 0);
    assert.ok(result.results.some((r) => r.id === 'P0-03a-evento' && r.status === 'PASS'));
    assert.ok(result.results.some((r) => r.id === 'P0-03a-historia' && r.status === 'PASS'));
    assert.ok(result.results.some((r) => r.id === 'P0-14' && r.status === 'PASS'));
  } finally {
    fs.rmSync(report.dir, { recursive: true, force: true });
  }
});

test('contract-smoke: sin token ni columnas no hay PASS', async () => {
  const runSmoke = await load();
  const result = await runSmoke({ base: BASE, fetchImpl: mockFetch(), env: {} });
  assert.equal(result.ok, false);
  assert.ok(result.summary.fail > 0);
  assert.ok(result.results.some((r) => r.id === 'P0-12b' && r.status === 'FAIL'));
  assert.ok(result.results.some((r) => r.id === 'P0-13' && r.status === 'FAIL'));
  assert.ok(result.results.some((r) => r.id === 'P0-14' && r.status === 'FAIL'));
});

test('contract-smoke: un WARN bloquea el PASS aunque se pida allowWarnings', async () => {
  const runSmoke = await load();
  const report = columnsReport();
  try {
    const result = await runSmoke({
      base: BASE,
      fetchImpl: mockFetch(),
      env: {},
      token: 'token-de-prueba',
      columnsReport: report.file,
      expectedVersion: VERSION,
      allowWarnings: true
    });
    assert.equal(result.ok, false);
    assert.equal(result.summary.warn, 1);
    assert.ok(result.results.some((r) => r.id === 'P0-11b' && r.status === 'WARN'));
  } finally {
    fs.rmSync(report.dir, { recursive: true, force: true });
  }
});

test('contract-smoke: sitemap vacío en demo es SKIP, no WARN', async () => {
  const runSmoke = await load();
  const report = columnsReport();
  const fetchImpl = mockFetch({
    'config-publica': () => reply({
      status: 'success',
      data: {
        site: { name: 'Grupo Nebak', url: 'https://gn-admin.github.io/admin-dashboard/' },
        contact: { email: 'hola@web.test', phone: '600000000' },
        seo: { baseUrl: 'https://gn-admin.github.io/admin-dashboard/' }
      }
    }),
    sitemap: () => reply({ status: 'success', data: [] })
  });
  try {
    const result = await runSmoke({
      base: BASE,
      fetchImpl,
      env: {},
      token: 'token-de-prueba',
      columnsReport: report.file,
      retiredSlug: 'retirada',
      expectedVersion: VERSION
    });
    assert.equal(result.ok, true);
    assert.equal(result.summary.warn, 0);
    assert.equal(result.summary.skip, 1);
    assert.ok(result.results.some((r) => r.id === 'P0-09b' && r.status === 'SKIP'));
  } finally {
    fs.rmSync(report.dir, { recursive: true, force: true });
  }
});

test('contract-smoke: detecta ficha en el listado y falla P0-02b', async () => {
  const runSmoke = await load();
  const malo = pubs.map((p) => Object.assign({}, p, { ficha: { plantilla: 'animal' } }));
  const fetchImpl = mockFetch({
    publicaciones: () => reply({ status: 'success', data: malo })
  });
  const result = await runSmoke({ base: BASE, fetchImpl, env: {} });
  assert.equal(result.ok, false);
  assert.ok(result.results.some((r) => r.id === 'P0-02b' && r.status === 'FAIL'));
});

test('contract-smoke: exige el informe de columnas y falla si falta una', async () => {
  const runSmoke = await load();
  const report = columnsReport(['galeria']);
  try {
    const result = await runSmoke({
      base: BASE,
      fetchImpl: mockFetch(),
      env: {},
      columnsReport: report.file
    });
    assert.equal(result.ok, false);
    assert.ok(result.results.some((r) => r.id === 'P0-14' && r.status === 'FAIL' && /galeria/.test(r.detail)));
  } finally {
    fs.rmSync(report.dir, { recursive: true, force: true });
  }
});
