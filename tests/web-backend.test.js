/**
 * Gestor web · backend Apps Script (apps-script/WebPublicaciones.gs).
 * Se ejecuta el .gs en un sandbox `vm` con Sheets/GAS simulados para probar
 * reglas de publicityación, slug único, preview == feed y canal público.
 * Sin red ni Google Apps Script real.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FUENTE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'WebPublicaciones.gs'), 'utf8');
// Los objetos creados dentro del sandbox `vm` tienen otro prototipo:
// se normalizan a JSON antes de comparar con deepEqual estricto.
const plano = v => JSON.parse(JSON.stringify(v));

function crearBackend() {
  const estado = { publicaciones: [], animales: [] };
  // Pestañas existentes por spreadsheet (para probar la lectura estricta por nombre).
  const hojas = { SHEET_WEB: ['WebPublicaciones'], SHEET_ANIMALES: ['Animales'] };
  let seq = 0;
  const ctx = {
    SpreadsheetApp: {
      openById(id) {
        const nombres = hojas[id] || [];
        return {
          getSheetByName(nombre) {
            return nombres.indexOf(nombre) !== -1 ? { getName: () => nombre } : null;
          },
          getSheets() {
            return nombres.map(n => ({ getName: () => n }));
          }
        };
      }
    },
    CONFIG: {
      PUBLIC_WEB_BASE_URL: 'https://web.test',
      CONTACT_EMAIL: 'hola@test.es',
      sheets: {
        webPublicaciones: { sheetId: 'SHEET_WEB', sheetName: 'WebPublicaciones' },
        animales: { sheetId: 'SHEET_ANIMALES', sheetName: 'Animales' }
      }
    },
    Logger: { log() {} },
    Utilities: { getUuid: () => 'uuid-' + (++seq) },
    readSheet(cfg) {
      const origen = cfg && cfg.sheetId === 'SHEET_ANIMALES' ? estado.animales : estado.publicaciones;
      return origen.map(f => Object.assign({}, f));
    },
    appendToSheet(cfg, registro) {
      const copia = Object.assign({}, registro);
      if (!copia.id) copia.id = 'uuid-' + (++seq);
      estado.publicaciones.push(copia);
      return copia;
    },
    updateSheetRow(cfg, id, cambios) {
      const i = estado.publicaciones.findIndex(p => String(p.id) === String(id));
      if (i === -1) return null;
      estado.publicaciones[i] = Object.assign({}, estado.publicaciones[i], cambios);
      return estado.publicaciones[i];
    },
    deleteSheetRow(cfg, id) {
      const i = estado.publicaciones.findIndex(p => String(p.id) === String(id));
      if (i === -1) return false;
      estado.publicaciones.splice(i, 1);
      return true;
    },
    registrarAuditoria() {}
  };
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx, { filename: 'WebPublicaciones.gs' });
  return { ctx, estado, hojas };
}

function animal(extra) {
  return Object.assign({
    id: 'ani_1',
    nombre: 'Luna',
    especie: 'perro',
    raza: 'Mestiza',
    sexo: 'hembra',
    edad: '2 años',
    estado: 'disponible',
    descripcion: 'Perra sociable y juguetona que busca familia.',
    foto_drive_id: 'FOTO123',
    vacunas: 'Sí',
    esterilizada: true,
    microchip: '941000000000001'
  }, extra || {});
}

function fila(extra) {
  return Object.assign({
    id: 'web_1',
    tipo: 'animal',
    origen_id: 'ani_1',
    slug: 'luna',
    estado_publicacion: 'publicado',
    indexable: 'true',
    listed: 'true',
    featured: 'false',
    orden: 0,
    titulo: 'Luna busca familia',
    extracto: 'Perra sociable',
    contenido_html: '<p>Luna es una perra sociable y juguetona que busca una familia responsable.</p>',
    categoria: 'Perros en adopción',
    estado_publico: 'en_adopcion',
    especie: 'perro',
    autor: '',
    tags_json: '["perro","adopcion"]',
    media_json: '{}',
    seo_json: '{"metaDescription":"Luna, perra sociable en adopción"}',
    cta_json: '{}',
    animal_json: '{"size":"mediano","temperament":["sociable"]}',
    evento_json: '',
    publicado_en: '2026-11-01T10:00:00.000Z',
    actualizado_en: '2026-11-02T10:00:00.000Z',
    creado_en: '2026-11-01T09:00:00.000Z'
  }, extra || {});
}

describe('slug: normalización, formato y unicidad', () => {
  let b;
  beforeEach(() => {
    b = crearBackend();
    b.estado.publicaciones.push(fila({ id: 'web_ev', tipo: 'evento', origen_id: '', slug: 'fiesta-de-adopcion', titulo: 'Fiesta' }));
  });

  it('normaliza acentos y signos', () => {
    assert.equal(b.ctx.webNormalizarSlug('Fiesta de Adopción!!'), 'fiesta-de-adopcion');
  });

  it('detecta conflicto en el mismo tipo', () => {
    const r = b.ctx.webSlugCheck({ tipo: 'evento', slug: 'Fiesta de adopción' });
    assert.equal(r.data.disponible, false);
    assert.equal(r.data.normalizado, 'fiesta-de-adopcion');
    assert.equal(r.data.conflicto.id, 'web_ev');
  });

  it('el mismo slug en otro tipo no colisiona', () => {
    const r = b.ctx.webSlugCheck({ tipo: 'historia', slug: 'fiesta-de-adopcion' });
    assert.equal(r.data.disponible, true);
  });

  it('ignora la propia publicación al editar', () => {
    const r = b.ctx.webSlugCheck({ tipo: 'evento', slug: 'fiesta-de-adopcion', id: 'web_ev' });
    assert.equal(r.data.disponible, true);
  });

  it('slug inválido no está disponible', () => {
    const r = b.ctx.webSlugCheck({ tipo: 'evento', slug: '¿¡!' });
    assert.equal(r.data.disponible, false);
    assert.equal(r.data.valido, false);
  });
});

describe('validación de publicación', () => {
  it('un borrador vacío acumula todos los mínimos', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    // Sin origen no hay foto de respaldo: la portada también falta.
    const r = b.ctx.webValidarPublicacion({ tipo: 'animal', titulo: '', slug: '', contenido_html: '' }, null);
    assert.equal(r.ok, false);
    const campos = r.faltan.map(f => f.campo);
    ['titulo', 'slug', 'categoria', 'estado_publico', 'contenido_html', 'coverImage', 'seo.metaDescription'].forEach(c => {
      assert.ok(campos.includes(c), 'falta ' + c);
    });
  });

  it('con la ficha completa y foto del animal no hay pendientes', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const r = b.ctx.webValidarPublicacion(b.ctx.webFilaAPublicacion(fila()), b.estado.animales[0]);
    assert.equal(r.ok, true);
    assert.deepEqual(plano(r.faltan), []);
  });
});

describe('composición del contrato Publicacion', () => {
  let b;
  beforeEach(() => {
    b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
  });

  it('rellena la portada desde la foto del animal y la compatibilidad legacy', () => {
    const pub = b.ctx.webFilaAPublicacion(fila());
    const p = b.ctx.webConstruirPublicacion(pub, b.estado.animales[0]);
    assert.equal(p.coverImage.src, 'https://drive.google.com/thumbnail?id=FOTO123&sz=w1200');
    assert.equal(p.image, p.coverImage.src);
    assert.equal(p.imageAlt, 'Luna busca familia');
    assert.equal(p.readTime >= 1, true);
    assert.equal(p.dateFormatted.includes('2026'), true);
    assert.equal(p.url, '/animales/luna');
    assert.equal(p.canonical, 'https://web.test/animales/luna');
  });

  it('bloque animal: datos curados + respaldo del origen', () => {
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila()), b.estado.animales[0]);
    assert.deepEqual(plano(p.animal.names), ['Luna']);
    assert.equal(p.animal.species, 'perro');
    assert.equal(p.animal.breed, 'Mestiza');
    assert.deepEqual(plano(p.animal.sex), ['hembra']);
    assert.equal(p.animal.age.label, '2 años');
    assert.equal(p.animal.size, 'mediano');
    assert.deepEqual(plano(p.animal.temperament), ['sociable']);
    assert.equal(p.animal.health.vaccinated, true);
    assert.equal(p.animal.health.neutered, true);
    assert.equal(p.animal.health.microchipped, true);
  });

  it('SEO: robots según indexable y respaldos de title/description/og', () => {
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila()), b.estado.animales[0]);
    assert.equal(p.seo.metaTitle, 'Luna busca familia');
    assert.equal(p.seo.metaDescription, 'Luna, perra sociable en adopción');
    assert.equal(p.seo.ogImage, p.coverImage.src);
    assert.equal(p.seo.robots, 'index,follow');

    const oculta = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila({ indexable: 'false' })), b.estado.animales[0]);
    assert.equal(oculta.seo.robots, 'noindex,follow');
  });

  it('con base de GitHub Pages no emite canonical de fichas (rutas aún inexistentes)', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gn-admin.github.io/admin-dashboard/';
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila()), b.estado.animales[0]);
    assert.equal(p.canonical, '');
    assert.equal(p.seo.canonical, '');
    assert.equal(p.seo.ogImage, p.coverImage.src);
    assert.deepEqual(plano(b.ctx.webSitemap().data), []);
  });

  it('con dominio propio vuelve a dominio + ruta (sin barra doble)', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila()), b.estado.animales[0]);
    assert.equal(p.canonical, 'https://gruponebak.net/animales/luna');
    assert.equal(p.seo.canonical, 'https://gruponebak.net/animales/luna');
    assert.equal(b.ctx.webSitemap().data[0].loc, 'https://gruponebak.net/animales/luna');
  });

  it('CTA solo se incluye si tiene etiqueta y URL', () => {
    const sin = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila({ cta_json: '{"label":"Adoptar"}' })), b.estado.animales[0]);
    assert.equal(sin.cta, undefined);
    const con = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila({ cta_json: '{"label":"Adoptar","url":"/adopta"}' })), b.estado.animales[0]);
    assert.deepEqual(plano(con.cta), { label: 'Adoptar', url: '/adopta' });
  });

  it('el bloque event existe solo en eventos e historias', () => {
    b.estado.publicaciones.push(fila({
      id: 'web_ev', tipo: 'evento', origen_id: '', slug: 'jornada', titulo: 'Jornada',
      evento_json: '{"kind":"jornada","startDate":"2026-12-01","location":{"city":"Murcia"}}'
    }));
    const ev = b.ctx.webConstruirPublicacion(b.ctx.webPublicacionPorId('web_ev'), null);
    assert.equal(ev.event.kind, 'jornada');
    assert.equal(ev.event.timezone, 'Europe/Madrid');
    assert.equal(ev.event.location.city, 'Murcia');
    assert.equal(ev.animal, undefined);
  });
});

describe('preview del gestor == canal público', () => {
  it('mismo payload en preview y en /publicaciones/:slug', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
    const preview = b.ctx.webPreviewAnimal('ani_1');
    const feed = b.ctx.webPublicacionPublica('luna');
    assert.equal(preview.status, 'success');
    assert.equal(feed.status, 'success');
    assert.deepEqual(plano(preview.data), plano(feed.data));
  });
});

describe('canal público: listado', () => {
  let b;
  beforeEach(() => {
    b = crearBackend();
    b.estado.animales.push(animal(), animal({ id: 'ani_2', nombre: 'Milo', especie: 'gato', foto_drive_id: 'FOTO2', estado: 'en_acogida' }));
    b.estado.publicaciones.push(
      fila(),
      fila({ id: 'web_2', origen_id: 'ani_2', slug: 'milo', titulo: 'Milo', especie: 'gato', categoria: 'Gatos en adopción', publicado_en: '2026-11-05T10:00:00.000Z' }),
      fila({ id: 'web_3', tipo: 'evento', origen_id: '', slug: 'jornada', titulo: 'Jornada', categoria: 'Eventos', estado_publico: 'programado', animal_json: '', evento_json: '{"startDate":"2026-12-01"}' }),
      fila({ id: 'web_4', slug: 'borrador', origen_id: 'ani_2', titulo: 'Borrador', estado_publicacion: 'borrador' }),
      fila({ id: 'web_5', slug: 'oculta', origen_id: 'ani_2', titulo: 'Oculta', estado_publicacion: 'oculto' }),
      fila({ id: 'web_6', slug: 'no-listada', origen_id: 'ani_2', titulo: 'No listada', listed: 'false' })
    );
  });

  it('solo entrega publicadas y listadas', () => {
    const r = b.ctx.webListarPublicas({ pageSize: 50 });
    const slugs = r.data.map(p => p.slug).sort();
    assert.deepEqual(plano(slugs), ['jornada', 'luna', 'milo']);
    assert.equal(r.pagination.total, 3);
    assert.equal(r.pagination.totalPages, 1);
  });

  it('filtra por tipo, especie y categoría', () => {
    assert.deepEqual(plano(b.ctx.webListarPublicas({ type: 'animal' }).data.map(p => p.slug).sort()), ['luna', 'milo']);
    assert.deepEqual(plano(b.ctx.webListarPublicas({ species: 'gato' }).data.map(p => p.slug)), ['milo']);
    assert.deepEqual(plano(b.ctx.webListarPublicas({ category: 'Eventos' }).data.map(p => p.slug)), ['jornada']);
  });

  it('ordena por fecha descendente y pagina', () => {
    const r = b.ctx.webListarPublicas({ pageSize: 2 });
    assert.equal(r.data[0].slug, 'milo');
    assert.equal(r.pagination.totalPages, 2);
    const p2 = b.ctx.webListarPublicas({ pageSize: 2, page: 2 });
    assert.equal(p2.data.length, 1);
  });

  it('expone filtros disponibles y proyección card', () => {
    const r = b.ctx.webListarPublicas({ fields: 'card' });
    assert.ok(r.filters.type.includes('animal'));
    assert.ok(r.filters.type.includes('evento'));
    assert.ok(r.filters.species.includes('perro'));
    const card = r.data[0];
    assert.ok(card.title);
    assert.ok(card.coverImage);
    assert.equal(card.contentHtml, undefined);
  });

  it('404 para no publicado', () => {
    assert.equal(b.ctx.webPublicacionPublica('oculta').status, 'error');
    assert.equal(b.ctx.webPublicacionPublica('no-existe').status, 'error');
  });
});

describe('gestor: listado de animales y resumen', () => {
  let b;
  beforeEach(() => {
    b = crearBackend();
    b.estado.animales.push(animal(), animal({ id: 'ani_2', nombre: 'Milo' }));
    b.estado.publicaciones.push(fila());
  });

  it('marca sin_publicar los animales sin capa web', () => {
    const r = b.ctx.webListarAnimales({});
    assert.equal(r.status, 'success');
    const milo = r.data.find(a => a.animal_id === 'ani_2');
    assert.equal(milo.estado_publicacion, 'sin_publicar');
    assert.ok(milo.completitud.faltan.includes('publicacion'));
    const luna = r.data.find(a => a.animal_id === 'ani_1');
    assert.equal(luna.estado_publicacion, 'publicado');
    assert.equal(luna.slug, 'luna');
  });

  it('resumen cuenta estados y pendientes', () => {
    const r = b.ctx.webResumen();
    assert.equal(r.status, 'success');
    assert.equal(r.data.resumen.animal.total, 2);
    assert.equal(r.data.resumen.animal.publicados, 1);
    assert.equal(r.data.resumen.animal.sin_publicar, 1);
    assert.equal(r.data.totales.publicados, 1);
  });
});

describe('gestor: alta, estado y publicación', () => {
  it('no publica si faltan mínimos', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const r = b.ctx.webUpsertAnimal({ animal_id: 'ani_1', titulo: 'Luna', slug: 'luna', estado_publicacion: 'publicado' });
    assert.equal(r.status, 'warning');
    assert.ok(r.data.length > 0);
  });

  it('guarda borrador y luego publica', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const borrador = b.ctx.webUpsertAnimal({
      animal_id: 'ani_1', titulo: 'Luna busca familia', slug: 'Luna!!!', estado_publicacion: 'borrador',
      categoria: 'Perros en adopción', estado_publico: 'en_adopcion',
      contenido_html: '<p>Luna es una perra sociable que busca una familia responsable.</p>',
      seo: { metaDescription: 'Luna en adopción' }
    });
    assert.equal(borrador.status, 'success');
    assert.equal(borrador.data.slug, 'luna');
    assert.equal(borrador.data.publicado_en, '');

    const publicada = b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'publicado' }, { email: 'x@y.es' });
    assert.equal(publicada.status, 'success');
    assert.equal(publicada.data.estado_publicacion, 'publicado');
    assert.ok(b.ctx.webPublicacionDeOrigen('animal', 'ani_1').publicado_en);
  });

  it('rechaza un slug ya usado por otra publicación', () => {
    const b = crearBackend();
    b.estado.animales.push(animal(), animal({ id: 'ani_2', nombre: 'Milo' }));
    b.estado.publicaciones.push(fila());
    const r = b.ctx.webUpsertAnimal({
      animal_id: 'ani_2', titulo: 'Milo', slug: 'luna', estado_publicacion: 'borrador',
      categoria: 'Gatos', estado_publico: 'en_adopcion',
      contenido_html: '<p>Milo es un gato tranquilo que busca una familia tranquila.</p>',
      seo: { metaDescription: 'Milo en adopción' }
    });
    assert.equal(r.status, 'error');
    assert.match(r.error, /ya está en uso/);
  });

  it('ocultar una publicación la retira del canal público', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
    assert.equal(b.ctx.webPublicacionPublica('luna').status, 'success');
    b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'oculto' }, null);
    assert.equal(b.ctx.webPublicacionPublica('luna').status, 'error');
  });
});

describe('gestor: eventos, historias y sitemap', () => {
  it('crea una historia y la archiva', () => {
    const b = crearBackend();
    const alta = b.ctx.webUpsertEvento({
      tipo: 'historia', titulo: 'La historia de Luna', slug: 'historia-de-luna',
      categoria: 'Historias', contenido_html: '<p>Una historia larga sobre Luna y su nueva familia.</p>',
      extracto: 'La historia de Luna', media: { coverImage: { src: 'https://x/luna.jpg', alt: 'Luna' } },
      estado_publicacion: 'publicado'
    }, { email: 'x@y.es' });
    assert.equal(alta.status, 'success');
    assert.equal(alta.data.tipo, 'historia');
    assert.ok(alta.data.publicado_en);
    const id = alta.data.id;

    const archivo = b.ctx.webArchivarEvento({ id }, { email: 'x@y.es' });
    assert.equal(archivo.status, 'success');
    assert.equal(archivo.data.estado_publicacion, 'retirado');

    // La fila no se borra: queda como lápida con el slug bloqueado.
    const retirada = b.ctx.webPublicacionPorId(id);
    assert.ok(retirada);
    assert.equal(retirada.estado_publicacion, 'retirado');
    assert.equal(retirada.listed, false);
    assert.equal(retirada.indexable, false);
    assert.equal(b.ctx.webSlugOcupado('historia', 'historia-de-luna'), true);

    // 410 lógico en el canal y fuera del feed, del gestor y del sitemap.
    const detalle = b.ctx.webPublicacionPublica('historia-de-luna');
    assert.equal(detalle.status, 'gone');
    assert.equal(detalle.code, 'gone');
    assert.equal(detalle.data.slug, 'historia-de-luna');
    assert.equal(b.ctx.webListarPublicas({}).data.length, 0);
    assert.deepEqual(plano(b.ctx.webSitemap().data), []);
    assert.equal(b.ctx.webListarEventos({}).data.length, 0);
  });

  it('el sitemap solo incluye publicadas e indexables', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(
      fila(),
      fila({ id: 'web_2', slug: 'noindex', origen_id: 'ani_1', indexable: 'false' }),
      fila({ id: 'web_3', slug: 'borrador', origen_id: 'ani_1', estado_publicacion: 'borrador' })
    );
    const r = b.ctx.webSitemap();
    assert.deepEqual(plano(r.data.map(u => u.slug)), ['luna']);
    assert.equal(r.data[0].loc, 'https://web.test/animales/luna');
    assert.ok(r.data[0].lastmod);
  });
});

describe('diagnóstico: hoja sin configurar vs sin publicaciones', () => {
  it('con la hoja configurada y vacía el canal responde success con 0', () => {
    const b = crearBackend();
    const r = b.ctx.webListarPublicas({});
    assert.equal(r.status, 'success');
    assert.equal(r.pagination.total, 0);
    assert.deepEqual(plano(r.data), []);
  });

  it('sin ID configurado avisa en vez de fingir que está vacío', () => {
    const b = crearBackend();
    b.ctx.CONFIG.sheets.webPublicaciones.sheetId = 'REEMPLAZAR_CON_ID_HOJA_WEB_PUBLICACIONES';
    const r = b.ctx.webListarPublicas({});
    assert.equal(r.status, 'warning');
    assert.equal(r.code, 'sheet_missing');
    assert.match(r.error, /sin configurar/);
    assert.equal(r.data, undefined);
  });

  it('si la pestaña no existe no lee la primera hoja del spreadsheet', () => {
    const b = crearBackend();
    b.hojas.SHEET_WEB = ['Hoja 1', 'OtraHoja'];
    b.estado.publicaciones.push(fila());
    const r = b.ctx.webListarPublicas({});
    assert.equal(r.status, 'warning');
    assert.equal(r.code, 'sheet_not_found');
    assert.match(r.error, /no existe la pestaña "WebPublicaciones"/);
    assert.equal(r.data, undefined);
  });

  it('sin nombre de hoja no se usa la primera pestaña', () => {
    const b = crearBackend();
    delete b.ctx.CONFIG.sheets.webPublicaciones.sheetName;
    const r = b.ctx.webListarPublicas({});
    assert.equal(r.status, 'warning');
    assert.equal(r.code, 'sheet_missing');
    assert.match(r.error, /nombre de la hoja/);
  });

  it('acepta la única pestaña del documento aunque se llame Hoja 1', () => {
    const b = crearBackend();
    b.hojas.SHEET_WEB = ['Hoja 1'];
    b.estado.publicaciones.push(fila());
    const r = b.ctx.webListarPublicas({});
    assert.equal(r.status, 'success');
    assert.equal(r.pagination.total, 1);
  });

  it('sitemap, redirects, taxonomías y detalle comparten el aviso', () => {
    const b = crearBackend();
    b.hojas.SHEET_WEB = ['Hoja 1', 'OtraHoja'];
    assert.equal(b.ctx.webSitemap().status, 'warning');
    assert.equal(b.ctx.webRedirects().status, 'warning');
    assert.equal(b.ctx.webTaxonomias().status, 'warning');
    assert.equal(b.ctx.webPublicacionPublica('luna').code, 'sheet_not_found');
  });

  it('el gestor no escribe en otra hoja si falta la pestaña', () => {
    const b = crearBackend();
    b.hojas.SHEET_WEB = ['Hoja 1', 'OtraHoja'];
    b.estado.animales.push(animal());
    const r = b.ctx.webUpsertAnimal({
      animal_id: 'ani_1', titulo: 'Luna', slug: 'luna', estado_publicacion: 'borrador',
      categoria: 'Perros en adopción', estado_publico: 'en_adopcion',
      contenido_html: '<p>Luna es una perra sociable que busca una familia responsable.</p>'
    });
    assert.equal(r.status, 'warning');
    assert.equal(r.code, 'sheet_not_found');
    assert.equal(b.estado.publicaciones.length, 0);
  });

  it('el resumen del gestor distingue la causa', () => {
    const b = crearBackend();
    b.hojas.SHEET_WEB = ['Hoja 1', 'OtraHoja'];
    const r = b.ctx.webResumen();
    assert.equal(r.status, 'warning');
    assert.equal(r.code, 'sheet_not_found');
  });
});

describe('slugs históricos y redirecciones 301', () => {
  function publicarConSlug(b, slug, extra) {
    return b.ctx.webUpsertAnimal(Object.assign({
      animal_id: 'ani_1', titulo: 'Luna busca familia', slug: slug, estado_publicacion: 'publicado',
      categoria: 'Perros en adopción', estado_publico: 'en_adopcion', extracto: 'Perra sociable',
      contenido_html: '<p>Luna es una perra sociable y juguetona que busca una familia responsable.</p>',
      seo: { metaDescription: 'Luna, perra sociable en adopción' }
    }, extra || {}));
  }

  it('al cambiar el slug conserva el anterior y redirige con 301', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());

    const r = publicarConSlug(b, 'luna-2026');
    assert.equal(r.status, 'success');
    assert.deepEqual(plano(r.data.slug_historial).map(h => h.slug), ['luna']);

    const vieja = b.ctx.webPublicacionPublica('luna');
    assert.equal(vieja.status, 'success');
    assert.equal(vieja.redirect.permanent, true);
    assert.equal(vieja.redirect.from, '/animales/luna');
    assert.equal(vieja.redirect.to, '/animales/luna-2026');
    assert.equal(vieja.redirect.slug, 'luna-2026');
    assert.equal(vieja.data.slug, 'luna-2026');

    const mapa = b.ctx.webRedirects();
    assert.equal(mapa.data.length, 1);
    assert.equal(mapa.data[0].from, 'https://web.test/animales/luna');
    assert.equal(mapa.data[0].to, 'https://web.test/animales/luna-2026');
    assert.equal(mapa.data[0].status, 301);
    assert.equal(mapa.data[0].slug, 'luna');
    assert.equal(mapa.data[0].currentSlug, 'luna-2026');
  });

  it('un slug histórico de una publicación oculta no redirige', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila({
      estado_publicacion: 'oculto',
      slug_historial: '[{"slug":"luna-vieja","fecha":"2026-11-01T00:00:00.000Z"}]'
    }));
    assert.equal(b.ctx.webPublicacionPublica('luna-vieja').status, 'error');
    assert.equal(b.ctx.webRedirects().data.length, 0);
  });

  it('no permite reutilizar un slug histórico en otra publicación', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila({ slug_historial: '[{"slug":"luna-vieja","fecha":""}]' }));
    const r = b.ctx.webSlugCheck({ tipo: 'animal', slug: 'luna-vieja' });
    assert.equal(r.data.disponible, false);
    assert.equal(r.data.conflicto.id, 'web_1');
    assert.equal(r.data.conflicto.historico, true);
  });

  it('volver al slug antiguo lo saca del historial y conserva el intermedio', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila({
      slug: 'luna-2026',
      slug_historial: '[{"slug":"luna","fecha":"2026-11-01T00:00:00.000Z"}]'
    }));
    const r = publicarConSlug(b, 'luna');
    assert.equal(r.status, 'success');
    const hist = plano(r.data.slug_historial).map(h => h.slug);
    assert.ok(hist.indexOf('luna') === -1, 'el slug actual no debe figurar en el historial');
    assert.ok(hist.indexOf('luna-2026') !== -1, 'el slug abandonado debe quedar para redirigir');
    assert.equal(b.ctx.webPublicacionPublica('luna-2026').redirect.slug, 'luna');
  });
});
