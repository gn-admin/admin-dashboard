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
  // Drive simulado: carpetas por nombre dentro de una raíz y ficheros creados.
  const drive = { carpetas: [], archivos: [], seq: 0 };
  function carpetaDrive(nombre, id, padre) {
    const folder = {
      getId: () => id,
      getName: () => nombre,
      getUrl: () => 'https://drive.test/folder/' + id,
      getParents() {
        const padreObj = padre === 'ROOT_MEDIA'
          ? carpetaDrive('media', 'ROOT_MEDIA', null)
          : (padre ? (drive.carpetas.find(x => x.folder.getId() === padre) || {}).folder : null);
        let i = 0;
        const arr = padreObj ? [padreObj] : [];
        return { hasNext: () => i < arr.length, next: () => arr[i++] };
      },
      getFoldersByName(n) {
        const hits = drive.carpetas.filter(c => c.nombre === n && c.padre === id).map(c => c.folder);
        let i = 0;
        return { hasNext: () => i < hits.length, next: () => hits[i++] };
      },
      createFolder(n) {
        const sub = carpetaDrive(n, 'carpeta-' + (++drive.seq), id);
        drive.carpetas.push({ nombre: n, padre: id, folder: sub });
        return sub;
      },
      createFile(blob) {
        const fid = 'file-' + (++drive.seq);
        const file = {
          getId: () => fid,
          getName: () => blob.name,
          getUrl: () => 'https://drive.test/file/' + fid,
          setSharing(acceso, permiso) {
            const registro = drive.archivos.find(a => a.id === fid);
            if (registro) {
              registro.compartido = acceso === 'anyone';
              registro.permiso = permiso;
              registro.orden = (registro.orden || []).concat('permiso:' + acceso);
            }
            return file;
          }
        };
        drive.archivos.push({ id: fid, nombre: blob.name, mime: blob.mime, carpeta: id, compartido: false });
        return file;
      }
    };
    return folder;
  }
  // Propiedades del script, caché y llamadas a GitHub simuladas.
  const props = {};
  const cache = {
    datos: {},
    get(k) { return this.datos[k] || null; },
    put(k, v) { this.datos[k] = v; },
    remove(k) { delete this.datos[k]; }
  };
  const llamadas = [];
  const respuestaGithub = { codigo: 204, texto: '' };

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
      DRIVE_WEB_FOLDER_ID: 'ROOT_MEDIA',
      CONTACT_EMAIL: 'hola@test.es',
      sheets: {
        webPublicaciones: { sheetId: 'SHEET_WEB', sheetName: 'WebPublicaciones' },
        animales: { sheetId: 'SHEET_ANIMALES', sheetName: 'Animales' }
      }
    },
    Logger: { log() {} },
    Utilities: {
      getUuid: () => 'uuid-' + (++seq),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      base64Decode: () => []
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone', PRIVATE: 'private' },
      Permission: { VIEW: 'view', NONE: 'none' },
      getFolderById(id) {
        if (id === 'ROOT_MEDIA') return carpetaDrive('media', 'ROOT_MEDIA', null);
        const c = drive.carpetas.find(x => x.folder.getId() === id);
        if (!c) throw new Error('Carpeta no encontrada');
        return c.folder;
      },
      getFileById(id) {
        const reg = drive.archivos.find(a => a.id === id);
        if (!reg) throw new Error('Archivo no encontrado');
        const carpeta = drive.carpetas.find(c => c.folder.getId() === reg.carpeta);
        return {
          getId: () => reg.id,
          getName: () => reg.nombre,
          setSharing(acceso, permiso) {
            reg.compartido = acceso === 'anyone';
            reg.permiso = permiso;
            reg.orden = (reg.orden || []).concat('permiso:' + acceso);
          },
          setTrashed(v) {
            reg.eliminado = !!v;
            reg.orden = (reg.orden || []).concat('papelera');
          },
          getParents() {
            let i = 0;
            const arr = carpeta ? [carpeta.folder] : [];
            return { hasNext: () => i < arr.length, next: () => arr[i++] };
          }
        };
      }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null) }) },
    CacheService: { getScriptCache: () => cache },
    UrlFetchApp: {
      fetch(url, opts) {
        llamadas.push({ url, opts });
        return {
          getResponseCode: () => respuestaGithub.codigo,
          getContentText: () => respuestaGithub.texto
        };
      }
    },
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
  return { ctx, estado, hojas, drive, props, cache, llamadas, respuestaGithub };
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

function miembro(extra) {
  return animal(Object.assign({ grupo_id: 'grp_1', grupo: 'Camada Luna', grupo_obligatorio: true }, extra || {}));
}

function filaGrupo(extra) {
  return fila(Object.assign({
    id: 'web_g1',
    tipo: 'animal_grupo',
    origen_tipo: 'grupo',
    origen_id: 'grp_1',
    slug: 'camada-luna',
    titulo: 'Camada Luna',
    extracto: 'Dos cachorros buscan familia juntos',
    contenido_html: '<p>Luna y Sol son dos cachorros que buscan una familia juntos.</p>',
    categoria: 'Perros en adopción',
    estado_publico: 'en_adopcion',
    estado_publico_modo: 'auto',
    animal_json: '{}'
  }, extra || {}));
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

describe('ficha configurable (C3)', () => {
  function alta(b, ficha, cta) {
    return b.ctx.webUpsertAnimal({
      animal_id: 'ani_1', titulo: 'Luna busca familia', slug: 'luna',
      estado_publicacion: 'publicado', categoria: 'Perros en adopción',
      estado_publico: 'en_adopcion',
      contenido_html: '<p>Luna es una perra sociable y juguetona que busca una familia responsable.</p>',
      seo: { metaDescription: 'Luna en adopción' },
      ficha: ficha, cta: cta
    });
  }

  it('guarda la ficha normalizada y solo viaja en detalle/preview', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const r = alta(b, {
      plantilla: 'historia',
      bloques: { galeria: false, datos: 'false' },
      mostrarLectura: false,
      cta: { label: 'Quiero adoptar', url: 'https://web.test/adoptar', kind: 'adopcion' }
    }, { label: 'Quiero adoptar', url: 'https://web.test/adoptar', kind: 'adopcion' });
    assert.equal(r.status, 'success');

    const guardada = JSON.parse(b.estado.publicaciones[0].ficha_json);
    assert.equal(guardada.plantilla, 'historia');
    assert.equal(guardada.bloques.galeria, false);
    assert.equal(guardada.bloques.datos, false);
    assert.equal(guardada.bloques.videos, true);
    assert.equal(guardada.mostrarLectura, false);
    assert.equal(guardada.cta.kind, 'adopcion');

    const lista = b.ctx.webListarPublicas({ pageSize: 50 });
    assert.equal(lista.data[0].ficha, undefined, 'los listados no cargan la ficha');
    const detalle = b.ctx.webPublicacionPublica('luna');
    assert.equal(detalle.data.ficha.plantilla, 'historia');
    assert.equal(detalle.data.ficha.videoModo, 'enlace');
    assert.equal(detalle.data.ficha.orden.length, 7);
    assert.equal(detalle.data.ficha.bloques.contenido, true);
    assert.equal(detalle.data.cta.kind, 'adopcion');
    assert.equal(b.ctx.webPreviewAnimal('ani_1').data.ficha.plantilla, 'historia');
  });

  it('normaliza orden, videoModo y etiquetas propias', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const r = alta(b, {
      orden: ['cta', 'datos', 'raro', 'cta'],
      videoModo: 'embed',
      tags: ['perro', ' perro ', 'x'.repeat(60), 'gato']
    });
    assert.equal(r.status, 'success');
    const f = JSON.parse(b.estado.publicaciones[0].ficha_json);
    assert.deepEqual(f.orden.slice(0, 3), ['cta', 'datos', 'etiquetas']);
    assert.equal(f.orden.length, 7);
    assert.equal(f.videoModo, 'embed');
    assert.deepEqual(f.tags, ['perro', 'x'.repeat(40), 'gato']);
    const detalle = b.ctx.webPublicacionPublica('luna').data;
    assert.equal(detalle.ficha.videoModo, 'embed');
    assert.deepEqual(plano(detalle.ficha.tags), ['perro', 'x'.repeat(40), 'gato']);
  });

  it('webFichaSegura completa fichas antiguas y descarta vídeos inseguros', () => {
    const b = crearBackend();
    const legacy = b.ctx.webFichaSegura({
      plantilla: 'ficha',
      videos: [{ url: 'javascript:alert(1)' }, { url: 'https://youtu.be/abc123XYZ' }]
    });
    assert.equal(legacy.orden.length, 7);
    assert.equal(legacy.videoModo, 'enlace');
    assert.equal(legacy.bloques.contenido, true);
    assert.equal(legacy.videos.length, 1);
    assert.equal(legacy.videos[0].url, 'https://youtu.be/abc123XYZ');
  });

  it('cierra valores no válidos y rechaza fichas que no son objeto', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const r = alta(b, { plantilla: 'otra', bloques: { cta: 'no' }, cta: { label: 'Ver', url: 'https://x', kind: 'raro' } });
    assert.equal(r.status, 'success');
    const f = JSON.parse(b.estado.publicaciones[0].ficha_json);
    assert.equal(f.plantilla, 'ficha');
    assert.equal(f.bloques.cta, true);
    assert.equal(f.cta.kind, 'url');

    const malo = b.ctx.webUpsertAnimal({ animal_id: 'ani_1', ficha: ['no'] });
    assert.equal(malo.status, 'error');
  });

  it('sin ficha el payload no cambia (compatibilidad)', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const r = alta(b, null);
    assert.equal(r.status, 'success');
    assert.equal(b.estado.publicaciones[0].ficha_json, '');
    assert.equal(b.ctx.webPublicacionPublica('luna').data.ficha, undefined);
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

    // 410 lógico en el canal y fuera del feed y del sitemap.
    const detalle = b.ctx.webPublicacionPublica('historia-de-luna');
    assert.equal(detalle.status, 'gone');
    assert.equal(detalle.code, 'gone');
    assert.equal(detalle.data.slug, 'historia-de-luna');
    assert.equal(b.ctx.webListarPublicas({}).data.length, 0);
    assert.deepEqual(plano(b.ctx.webSitemap().data), []);

    // El gestor no las esconde ni las cuenta como borradores.
    const listado = b.ctx.webListarEventos({}).data;
    assert.equal(listado.length, 1);
    assert.equal(listado[0].estado_publicacion, 'retirado');
    assert.equal(b.ctx.webListarEventos({ estado_publicacion: 'retirado' }).data.length, 1);
    assert.equal(b.ctx.webListarEventos({ estado_publicacion: 'publicado' }).data.length, 0);
    const resumen = b.ctx.webResumen().data.totales;
    assert.equal(resumen.retirados, 1);
    assert.equal(resumen.borradores, 0);
    assert.equal(resumen.publicados, 0);
    assert.equal(resumen.incompletas, 0);

    // Endpoint público que alimenta las páginas estáticas de retirada.
    const retiradas = b.ctx.webRetiradas();
    assert.equal(retiradas.status, 'success');
    assert.equal(retiradas.data.length, 1);
    assert.equal(retiradas.data[0].slug, 'historia-de-luna');
    assert.equal(retiradas.data[0].tipo, 'historia');
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

describe('gestor web: media en una carpeta por ficha', () => {
  function publicada(b, extra) {
    const alta = b.ctx.webUpsertEvento(Object.assign({
      tipo: 'historia', titulo: 'Luna', slug: 'luna', categoria: 'Historias',
      contenido_html: '<p>Luna llegó al refugio en invierno y hoy vive con una familia que la adoptó; esta es su historia completa.</p>', extracto: 'Luna',
      media: { coverImage: { src: 'https://x/luna.jpg', alt: 'Luna' } },
      estado_publicacion: 'publicado'
    }, extra || {}), { email: 'x@y.es' });
    assert.equal(alta.status, 'success', JSON.stringify(alta));
    return alta.data.id;
  }

  it('crea la carpeta tipo-slug una vez y la reutiliza', () => {
    const b = crearBackend();
    const id = publicada(b);

    const portada = b.ctx.webSubirMedia({
      publicacion_id: id, tipo: 'portada', archivo_base64: 'QUJD',
      nombre: 'Foto Principal.JPG', mime_type: 'image/jpeg'
    });
    assert.equal(portada.status, 'success');
    assert.equal(portada.data.carpeta, 'historias/luna');
    assert.ok(b.drive.carpetas.some(c => c.nombre === 'historias' && c.padre === 'ROOT_MEDIA'));
    assert.match(portada.data.url, /^https:\/\/drive\.google\.com\/thumbnail\?id=file-/);
    assert.match(portada.data.url, /sz=w1600/);
    assert.match(portada.data.nombre, /^portada-foto-principal-.*\.jpg$/);
    assert.equal(b.drive.archivos[0].compartido, true);

    const galeria = b.ctx.webSubirMedia({
      publicacion_id: id, tipo: 'galeria', archivo_base64: 'QUJD',
      nombre: 'Otra foto.png', mime_type: 'image/png'
    });
    assert.equal(galeria.data.carpeta_id, portada.data.carpeta_id);
    assert.equal(b.drive.carpetas.filter(c => c.nombre === 'luna').length, 1);
    assert.equal(b.drive.carpetas.length, 2);
    assert.equal(b.drive.archivos.length, 2);
    assert.equal(b.drive.archivos[1].carpeta, portada.data.carpeta_id);
  });

  it('separa la media por tipo de publicación', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    const animal = b.ctx.webSubirMedia({
      publicacion_id: 'web_1', tipo: 'portada', archivo_base64: 'QUJD',
      nombre: 'luna.jpg', mime_type: 'image/jpeg'
    });
    assert.equal(animal.status, 'success');
    assert.equal(animal.data.carpeta, 'animales/luna');
    const historia = publicada(b);
    const otra = b.ctx.webSubirMedia({
      publicacion_id: historia, tipo: 'portada', archivo_base64: 'QUJD',
      nombre: 'luna.jpg', mime_type: 'image/jpeg'
    });
    assert.equal(otra.data.carpeta, 'historias/luna');
    assert.notEqual(otra.data.carpeta_id, animal.data.carpeta_id);
    assert.ok(b.drive.carpetas.some(c => c.nombre === 'animales' && c.padre === 'ROOT_MEDIA'));
    assert.ok(b.drive.carpetas.some(c => c.nombre === 'historias' && c.padre === 'ROOT_MEDIA'));
  });

  it('los documentos van a la misma carpeta y no usan thumbnail', () => {
    const b = crearBackend();
    const id = publicada(b);
    const doc = b.ctx.webSubirMedia({
      publicacion_id: id, tipo: 'documento', archivo_base64: 'QUJD',
      nombre: 'Contrato adopción.pdf', mime_type: 'application/pdf'
    });
    assert.equal(doc.status, 'success');
    assert.match(doc.data.nombre, /^documento-contrato-adopcion-.*\.pdf$/);
    assert.match(doc.data.url, /^https:\/\/drive\.test\/file\//);
    assert.match(doc.data.download, /export=download/);
    // Los documentos no se publican: el fichero queda privado.
    assert.equal(b.drive.archivos[0].compartido, false);
  });

  it('rechaza tipos, tamaños y publicaciones inexistentes', () => {
    const b = crearBackend();
    const id = publicada(b);

    const pdfPortada = b.ctx.webSubirMedia({ publicacion_id: id, tipo: 'portada', archivo_base64: 'QUJD', nombre: 'x.pdf', mime_type: 'application/pdf' });
    assert.equal(pdfPortada.status, 'error');
    assert.match(pdfPortada.error, /no permitido/);

    const videoEnGaleria = b.ctx.webSubirMedia({ publicacion_id: id, tipo: 'galeria', archivo_base64: 'QUJD', nombre: 'x.mp4', mime_type: 'video/mp4' });
    assert.equal(videoEnGaleria.status, 'error');

    const grande = b.ctx.webSubirMedia({ publicacion_id: id, tipo: 'portada', archivo_base64: 'A'.repeat(7 * 1024 * 1024), nombre: 'x.jpg', mime_type: 'image/jpeg' });
    assert.equal(grande.status, 'error');
    assert.match(grande.error, /demasiado grande/);

    const sinPub = b.ctx.webSubirMedia({ publicacion_id: 'nope', tipo: 'portada', archivo_base64: 'QUJD', nombre: 'x.jpg', mime_type: 'image/jpeg' });
    assert.equal(sinPub.status, 'error');

    assert.equal(b.drive.carpetas.length, 0);
    assert.equal(b.drive.archivos.length, 0);
  });

  it('sin DRIVE_WEB_FOLDER_ID avisa y no sube nada', () => {
    const b = crearBackend();
    const id = publicada(b);
    b.ctx.CONFIG.DRIVE_WEB_FOLDER_ID = '';
    const r = b.ctx.webSubirMedia({ publicacion_id: id, tipo: 'portada', archivo_base64: 'QUJD', nombre: 'x.jpg', mime_type: 'image/jpeg' });
    assert.equal(r.status, 'error');
    assert.match(r.error, /DRIVE_WEB_FOLDER_ID/);
    assert.equal(b.drive.archivos.length, 0);
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

describe('media: borrado de archivos en Drive', () => {
  function subida(b, extra) {
    return b.ctx.webSubirMedia(Object.assign({
      publicacion_id: 'web_1', tipo: 'portada', archivo_base64: 'QUJD',
      nombre: 'x.jpg', mime_type: 'image/jpeg'
    }, extra || {}));
  }

  it('borra el archivo de la carpeta de la ficha (papelera)', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    const up = subida(b);
    const r = b.ctx.webEliminarMedia({ publicacion_id: 'web_1', file_id: up.data.fileId });
    assert.equal(r.status, 'success');
    assert.equal(r.data.eliminado, true);
    assert.equal(r.data.nombre, up.data.nombre);
    assert.equal(b.drive.archivos[0].eliminado, true);
  });

  it('rechaza archivos de otra publicación', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    b.estado.publicaciones.push(fila({ id: 'web_ev', tipo: 'evento', origen_id: '', slug: 'fiesta' }));
    const animalFile = subida(b);
    b.ctx.webSubirMedia({
      publicacion_id: 'web_ev', tipo: 'portada', archivo_base64: 'QUJD',
      nombre: 'fiesta.jpg', mime_type: 'image/jpeg'
    });
    const r = b.ctx.webEliminarMedia({ publicacion_id: 'web_ev', file_id: animalFile.data.fileId });
    assert.equal(r.status, 'error');
    assert.match(r.error, /no pertenece/);
    assert.equal(b.drive.archivos[0].eliminado, undefined);
  });

  it('no cae al árbol si la publicación no tiene carpeta de media', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    b.estado.publicaciones.push(fila({ id: 'web_sin', slug: 'sin-media' }));
    const up = subida(b);
    const r = b.ctx.webEliminarMedia({ publicacion_id: 'web_sin', file_id: up.data.fileId });
    assert.equal(r.status, 'error');
    assert.match(r.error, /no tiene carpeta de media/);
    assert.equal(b.drive.archivos[0].eliminado, undefined, 'no debe tocar el archivo de otra ficha');
  });

  it('revoca el permiso público antes de mandar el archivo a la papelera', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    const up = subida(b);
    assert.equal(b.drive.archivos[0].compartido, true, 'la imagen se sube compartida');
    const r = b.ctx.webEliminarMedia({ publicacion_id: 'web_1', file_id: up.data.fileId });
    assert.equal(r.status, 'success');
    assert.equal(b.drive.archivos[0].compartido, false, 'el enlace deja de ser público');
    assert.equal(b.drive.archivos[0].eliminado, true);
    assert.deepEqual(b.drive.archivos[0].orden.slice(-2), ['permiso:private', 'papelera']);
  });

  it('sin publicación solo borra dentro del árbol de media', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    const up = subida(b);
    const ok = b.ctx.webEliminarMedia({ file_id: up.data.fileId });
    assert.equal(ok.status, 'success');

    b.drive.archivos.push({ id: 'file-ajeno', nombre: 'otro.jpg', mime: 'image/jpeg', carpeta: 'OTRA_CARPETA' });
    const ko = b.ctx.webEliminarMedia({ file_id: 'file-ajeno' });
    assert.equal(ko.status, 'error');
    assert.match(ko.error, /no pertenece/);
    assert.equal(b.drive.archivos[1].eliminado, undefined);
  });

  it('valida publicación, archivo y raíz configurada', () => {
    const b = crearBackend();
    b.estado.publicaciones.push(fila());
    const up = subida(b);
    assert.match(b.ctx.webEliminarMedia({}).error, /file_id/);
    assert.match(b.ctx.webEliminarMedia({ publicacion_id: 'nope', file_id: up.data.fileId }).error, /no encontrada/i);
    assert.match(b.ctx.webEliminarMedia({ file_id: 'no-existe' }).error, /No se pudo borrar/);
    b.ctx.CONFIG.DRIVE_WEB_FOLDER_ID = '';
    assert.match(b.ctx.webEliminarMedia({ file_id: up.data.fileId }).error, /DRIVE_WEB_FOLDER_ID/);
  });
});

describe('deploy automático (workflow_dispatch desde Apps Script)', () => {
  it('el backend no dispara: el router es el único punto de disparo', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
    const r = b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'oculto' }, { email: 'x@y.es' });
    assert.equal(r.status, 'success');
    assert.equal(r.data.estado_publicacion, 'oculto');
    // El estado solo dice lo que cambió: sin campos de diagnóstico.
    assert.deepEqual(Object.keys(r.data).sort(), ['animal_id', 'estado_publicacion', 'id']);
    assert.equal(r.data.deploy, undefined);
    assert.equal(b.llamadas.length, 0);
  });

  it('sin token devuelve el motivo y nunca lanza', () => {
    const b = crearBackend();
    const r = b.ctx.webDispararDeploy('estado');
    assert.equal(r.disparado, false);
    assert.match(r.error, /GITHUB_DEPLOY_TOKEN/);
    assert.equal(b.llamadas.length, 0);
  });

  it('manda workflow_dispatch con el ref y el token configurados', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    const r = b.ctx.webDispararDeploy('estado');
    assert.equal(r.disparado, true);
    assert.equal(b.llamadas.length, 1);
    assert.match(b.llamadas[0].url, /repos\/gn-admin\/admin-dashboard\/actions\/workflows\/deploy\.yml\/dispatches$/);
    assert.equal(b.llamadas[0].opts.method, 'post');
    assert.equal(b.llamadas[0].opts.headers.Authorization, 'Bearer ghp_prueba');
    assert.deepEqual(plano(JSON.parse(b.llamadas[0].opts.payload)), { ref: 'main' });
  });

  it('retirar un evento tampoco dispara desde el backend (lo hace el router)', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    b.estado.publicaciones.push(fila({ id: 'web_ev', tipo: 'evento', origen_id: '', slug: 'fiesta' }));
    const r = b.ctx.webArchivarEvento({ id: 'web_ev' }, { email: 'x@y.es' });
    assert.equal(r.status, 'success');
    assert.equal(r.data.estado_publicacion, 'retirado');
    assert.equal(r.data.deploy, undefined);
    assert.equal(b.llamadas.length, 0);
  });

  it('no repite el dispatch dentro de la ventana de deduplicación', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    const uno = b.ctx.webDispararDeploy('estado');
    const dos = b.ctx.webDispararDeploy('estado');
    assert.equal(uno.disparado, true);
    assert.equal(dos.disparado, false);
    assert.equal(dos.motivo, 'en_cola');
    assert.equal(b.llamadas.length, 1);
  });

  it('el disparo manual ignora la caché y puede repetirse', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    assert.equal(b.ctx.webDispararDeploy('manual', { forzar: true }).disparado, true);
    assert.equal(b.ctx.webDispararDeploy('manual', { forzar: true }).disparado, true);
    assert.equal(b.llamadas.length, 2);
  });

  it('un error de GitHub no lanza y devuelve el código', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    b.respuestaGithub.codigo = 403;
    const r = b.ctx.webDispararDeploy('estado');
    assert.equal(r.disparado, false);
    assert.equal(r.codigo, 403);
  });

  it('borrar un borrador no dispara nada', () => {
    const b = crearBackend();
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    b.estado.publicaciones.push(fila({ id: 'web_draft', estado_publicacion: 'borrador' }));
    const r = b.ctx.webEliminarAnimal({ animal_id: '' }, null);
    assert.equal(r.status, 'error');
    assert.equal(b.llamadas.length, 0);
  });

  it('expone si está configurado sin filtrar el token', () => {
    const b = crearBackend();
    const sin = b.ctx.webDeployEstado();
    assert.equal(sin.data.configurado, false);
    b.props.GITHUB_DEPLOY_TOKEN = 'ghp_prueba';
    const con = b.ctx.webDeployEstado();
    assert.equal(con.data.configurado, true);
    assert.equal(JSON.stringify(con).indexOf('ghp_prueba'), -1);
    // Marcador para detectar implementaciones antiguas desde el panel.
    assert.equal(con.data.version, '2026-11-15.6');
  });
});

describe('F2: ficha interna como fuente, estado público y whitelist', () => {
  it('deriva el estado público del interno y respeta el override manual', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    assert.equal(b.ctx.webEstadoPublicoDerivado('disponible'), 'en_adopcion');
    assert.equal(b.ctx.webEstadoPublicoDerivado('en_acogida'), 'en_acogida');
    assert.equal(b.ctx.webEstadoPublicoDerivado('en_adopcion'), 'reservado');
    assert.equal(b.ctx.webEstadoPublicoDerivado('adoptado'), 'adoptado');
    assert.equal(b.ctx.webEstadoPublicoDerivado('fallecido'), 'cerrado');
    const base = b.ctx.webFilaAPublicacion(fila());
    assert.equal(b.ctx.webEstadoPublicoEfectivo(base, b.estado.animales[0]), 'en_adopcion');
    const manual = b.ctx.webFilaAPublicacion(fila({ estado_publico_modo: 'manual', estado_publico: 'reservado' }));
    assert.equal(b.ctx.webEstadoPublicoEfectivo(manual, b.estado.animales[0]), 'reservado');
    // Valor legado: `urgente` no es estado; se trata como automático.
    const legado = b.ctx.webFilaAPublicacion(fila({ estado_publico: 'urgente' }));
    assert.equal(b.ctx.webEstadoPublicoEfectivo(legado, b.estado.animales[0]), 'en_adopcion');
  });

  it('urgente viaja como bandera y solo si el animal sigue necesitando hogar', () => {
    const b = crearBackend();
    assert.equal(b.ctx.webAnimalUrgente(animal({ urgente: true })), true);
    assert.equal(b.ctx.webAnimalUrgente(animal({ urgente: true, estado: 'en_adopcion' })), false);
    assert.equal(b.ctx.webAnimalUrgente(animal({ urgente: true, estado: 'adoptado' })), false);
    assert.equal(b.ctx.webAnimalUrgente(animal()), false);
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila()), animal({ urgente: true }));
    assert.equal(p.urgent, true);
    assert.equal(p.status, 'en_adopcion');
  });

  it('aplica whitelist estricta: no emite campos internos ni documentos privados', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const filaMala = fila({
      animal_json: JSON.stringify({
        names: ['Luna', 'Nube'], species: 'Perro', breed: 'Mestiza', sex: ['hembra'],
        age: { value: '2', unit: 'años', label: '2 años', interno: 'secreto' },
        size: 'mediano', color: 'negro', temperament: ['sociable', 'dormilón'],
        health: { vaccinated: true, dewormed: false, neutered: true, microchipped: true, specialNeeds: false, interno: 'secreto' },
        compatibility: { dogs: 'Sí', cats: '', kids: 'No', interno: 'secreto' },
        adoption: { mode: 'presencial', feeEur: '20', requirements: 'X', interno: 'secreto' },
        foster: { temporary: true, durationLabel: '3 meses', interno: 'secreto' },
        location: { city: 'Madrid', province: 'Madrid', interno: 'secreto' },
        contact: { email: 'a@b.es', phone: '600', interno: 'secreto' },
        interno: 'secreto'
      }),
      media_json: JSON.stringify({
        coverImage: { src: 'https://x.test/portada.jpg', alt: '' },
        gallery: [{ src: 'https://x.test/1.jpg', alt: 'a', caption: 'c', interno: 'secreto' }],
        videos: [{ title: 'v', url: 'https://x.test/v.mp4', provider: 'youtube', note: 'n', interno: 'secreto' }],
        icons: [{ icon: 'edad', label: 'Edad', value: '2', interno: 'secreto' }],
        documents: [{ name: 'cartilla-privada', url: 'https://x.test/cartilla.pdf' }]
      })
    });
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(filaMala), b.estado.animales[0]);
    assert.equal(p.animal.age.interno, undefined);
    assert.equal(p.animal.health.interno, undefined);
    assert.equal(p.animal.compatibility.interno, undefined);
    assert.equal(p.animal.adoption.interno, undefined);
    assert.equal(p.animal.foster.interno, undefined);
    assert.equal(p.animal.location.interno, undefined);
    assert.equal(p.animal.contact.interno, undefined);
    assert.equal(p.gallery[0].interno, undefined);
    assert.equal(p.videos[0].interno, undefined);
    assert.equal(p.icons[0].interno, undefined);
    assert.equal(p.documents, undefined);
    assert.equal(JSON.stringify(p).indexOf('cartilla-privada'), -1);
    assert.equal(JSON.stringify(p).indexOf('secreto'), -1);
  });

  it('el contacto vacío usa el de la asociación y nunca datos internos', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(fila()), b.estado.animales[0]);
    assert.equal(p.animal.contact.email, 'hola@test.es');
  });

  it('no permite publicar un animal fallecido', () => {
    const b = crearBackend();
    b.estado.animales.push(animal({ estado: 'fallecido' }));
    b.estado.publicaciones.push(fila());
    const r = b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'publicado' }, { email: 'x@y.es' });
    assert.equal(r.status, 'warning');
    assert.ok(r.data.some(f => f.campo === 'estado_publicacion'));
  });

  it('guarda el modo automático o manual al crear la publicación', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    const base = { animal_id: 'ani_1', titulo: 'Luna', slug: 'luna', categoria: 'Perros en adopción', contenido_html: '<p>Texto suficientemente largo para publicar la ficha.</p>', seo: { metaDescription: 'Luna en adopción' } };
    const auto = b.ctx.webUpsertAnimal(Object.assign({}, base, { estado_publicacion: 'publicado', estado_publico: 'auto' }));
    assert.equal(auto.status, 'success', JSON.stringify(auto));
    assert.equal(b.estado.publicaciones[0].estado_publico_modo, 'auto');
    assert.equal(b.estado.publicaciones[0].estado_publico, 'en_adopcion');
    const manual = b.ctx.webUpsertAnimal(Object.assign({}, base, { estado_publico: 'reservado', estado_publico_modo: 'manual' }));
    assert.equal(manual.status, 'success', JSON.stringify(manual));
    assert.equal(b.estado.publicaciones[0].estado_publico_modo, 'manual');
    assert.equal(b.estado.publicaciones[0].estado_publico, 'reservado');
    const p = b.ctx.webConstruirPublicacion(b.ctx.webFilaAPublicacion(b.estado.publicaciones[0]), b.estado.animales[0]);
    assert.equal(p.status, 'reservado');
  });

  it('retira y restaura una publicación de animal conservando el slug (410)', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila());
    const retirada = b.ctx.webArchivarAnimal({ animal_id: 'ani_1' }, { email: 'x@y.es' });
    assert.equal(retirada.status, 'success');
    assert.equal(retirada.data.estado_publicacion, 'retirado');
    assert.equal(b.estado.publicaciones.length, 1);
    assert.equal(b.ctx.webPublicacionPublica('luna').status, 'gone');
    const restaurada = b.ctx.webRestaurarAnimal({ animal_id: 'ani_1' }, { email: 'x@y.es' });
    assert.equal(restaurada.status, 'success');
    assert.equal(restaurada.data.estado_publicacion, 'borrador');
    assert.equal(b.estado.publicaciones[0].slug, 'luna');
  });
});

describe('grupos · derivación agregada del estado público (G-D3)', () => {
  const casos = [
    { nombre: 'todos disponibles', estados: ['disponible', 'disponible'], esperado: 'en_adopcion' },
    { nombre: 'todos en acogida', estados: ['en_acogida', 'en_acogida'], esperado: 'en_acogida' },
    { nombre: 'disponible y acogida', estados: ['disponible', 'en_acogida'], esperado: 'en_acogida' },
    { nombre: 'algún reservado', estados: ['disponible', 'en_adopcion'], esperado: 'reservado' },
    { nombre: 'todos adoptados', estados: ['adoptado', 'adoptado'], esperado: 'adoptado' },
    { nombre: 'adopción parcial', estados: ['adoptado', 'disponible'], esperado: 'cerrado' },
    { nombre: 'algún fallecido', estados: ['fallecido', 'disponible'], esperado: 'cerrado' },
    { nombre: 'estado inconsistente', estados: ['desconocido', 'disponible'], esperado: 'cerrado' }
  ];

  casos.forEach(caso => {
    it(`deriva "${caso.esperado}" con ${caso.nombre}`, () => {
      const b = crearBackend();
      assert.equal(b.ctx.webEstadoGrupoDerivado(caso.estados.map(estado => ({ estado }))), caso.esperado);
    });
  });

  it('un grupo vacío queda cerrado y no es publicable', () => {
    const b = crearBackend();
    assert.equal(b.ctx.webEstadoGrupoDerivado([]), 'cerrado');
    assert.equal(b.ctx.webGrupoValidoParaPublicar([]), false);
  });

  it('fallecido, adopción parcial o conjunto inválido no son publicables', () => {
    const b = crearBackend();
    assert.equal(b.ctx.webGrupoValidoParaPublicar([{ estado: 'fallecido' }]), false);
    assert.equal(b.ctx.webGrupoValidoParaPublicar([{ estado: 'adoptado' }, { estado: 'disponible' }]), false);
    assert.equal(b.ctx.webGrupoValidoParaPublicar([{ estado: 'desconocido' }]), false);
    assert.equal(b.ctx.webGrupoValidoParaPublicar([{ estado: 'disponible' }, { estado: 'en_acogida' }]), true);
  });

  it('la urgencia se agrega: basta un miembro prioritario', () => {
    const b = crearBackend();
    assert.equal(b.ctx.webGrupoUrgente([{ estado: 'disponible' }, { estado: 'disponible' }]), false);
    assert.equal(b.ctx.webGrupoUrgente([{ estado: 'disponible' }, { estado: 'disponible', urgente: true }]), true);
  });

  it('la portada y la especie se heredan de los miembros', () => {
    const b = crearBackend();
    const miembros = [animal({ id: 'ani_1', foto_drive_id: 'FOTO_A', especie: 'perro' }), animal({ id: 'ani_2', foto_drive_id: '', especie: 'perro' })];
    assert.equal(b.ctx.webPortadaGrupo(miembros), 'https://drive.google.com/thumbnail?id=FOTO_A&sz=w1200');
    assert.equal(b.ctx.webEspecieGrupo(miembros), 'perro');
    assert.equal(b.ctx.webCategoriaGrupoDerivada('en_adopcion', miembros), 'Perros en adopción');
    assert.equal(b.ctx.webCategoriaGrupoDerivada('en_acogida', miembros), 'Acogidas');
  });
});

describe('grupos · preview == feed y whitelist del payload (G-D6)', () => {
  let b;
  beforeEach(() => {
    b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1', nombre: 'Luna', estado: 'disponible', urgente: true }));
    b.estado.animales.push(miembro({ id: 'ani_2', nombre: 'Sol', estado: 'disponible', urgente: false }));
    b.estado.publicaciones.push(filaGrupo({ documents_json: '[{"name":"cartilla-privada"}]' }));
  });

  it('preview, feed y detalle público devuelven el mismo objeto', () => {
    const feed = b.ctx.webListarPublicas({ type: 'animal_grupo' });
    const preview = b.ctx.webPreviewGrupo('grp_1');
    const detalle = b.ctx.webPublicacionPublica('camada-luna');
    assert.equal(feed.status, 'success');
    assert.equal(preview.status, 'success');
    assert.equal(detalle.status, 'success');
    assert.equal(feed.data.length, 1);
    assert.deepEqual(plano(preview.data), plano(feed.data[0]));
    assert.deepEqual(plano(detalle.data), plano(feed.data[0]));
  });

  it('el payload de grupo es aditivo y compatible con `animal`', () => {
    const p = b.ctx.webPreviewGrupo('grp_1').data;
    assert.equal(p.isGroup, true);
    assert.equal(p.type, 'animal_grupo');
    assert.equal(p.group.groupName, 'Camada Luna');
    assert.equal(p.group.count, 2);
    assert.deepEqual(plano(p.animal), plano(p.group));
    assert.equal(p.urgent, true);
    assert.equal(p.status, 'en_adopcion');
    assert.equal(p.url, '/animales/camada-luna');
  });

  it('los miembros resumen no exponen IDs ni datos internos', () => {
    const p = b.ctx.webPreviewGrupo('grp_1').data;
    assert.deepEqual(Object.keys(p.group.members[0]).sort(), ['edad', 'especie', 'foto', 'nombre', 'raza', 'sexo', 'size']);
    assert.equal(p.group.members[0].nombre, 'Luna');
    assert.equal(p.group.members[0].id, undefined);
    assert.equal(p.origen_id, undefined);
    assert.equal(p.grupo_id, undefined);
    assert.equal(JSON.stringify(p).indexOf('941000000000001'), -1);
    assert.equal(JSON.stringify(p).indexOf('cartilla-privada'), -1);
  });

  it('la salud agregada exige que todos los miembros cumplan', () => {
    b.estado.animales[1] = miembro({ id: 'ani_2', nombre: 'Sol', estado: 'disponible', vacunas: 'No', microchip: '' });
    const p = b.ctx.webPreviewGrupo('grp_1').data;
    assert.equal(p.group.health.vaccinated, false);
    assert.equal(p.group.health.microchipped, false);
    assert.equal(p.group.members.length, 2);
  });
});

describe('grupos · gestor, exclusividad y ciclo de vida (G-D5, G1)', () => {
  it('crea una única publicación por grupo con estado derivado y slug normalizado', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    const base = {
      grupo_id: 'grp_1',
      titulo: 'Camada Luna',
      slug: 'Camada Luna',
      extracto: 'Dos cachorros buscan familia juntos',
      contenido_html: '<p>Luna y Sol son dos cachorros que buscan una familia juntos.</p>',
      estado_publicacion: 'borrador'
    };
    const alta = b.ctx.webUpsertGrupo(base);
    assert.equal(alta.status, 'success', JSON.stringify(alta));
    assert.equal(alta.data.tipo, 'animal_grupo');
    assert.equal(alta.data.origen_tipo, 'grupo');
    assert.equal(alta.data.origen_id, 'grp_1');
    assert.equal(alta.data.slug, 'camada-luna');
    assert.equal(alta.data.estado_publico, 'en_adopcion');
    assert.equal(alta.data.categoria, 'Perros en adopción');
    assert.equal(alta.completitud.ok, true);

    const editada = b.ctx.webUpsertGrupo(Object.assign({}, base, { slug: 'camada-luna-2026' }));
    assert.equal(editada.status, 'success', JSON.stringify(editada));
    assert.equal(b.estado.publicaciones.filter(p => p.tipo === 'animal_grupo').length, 1);
    assert.deepEqual(plano(b.ctx.webHistorial(b.estado.publicaciones[0].slug_historial).map(h => h.slug)), ['camada-luna']);
  });

  it('el modo manual fija el estado público sin cambiarlo por derivación', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    const r = b.ctx.webUpsertGrupo({
      grupo_id: 'grp_1',
      titulo: 'Camada Luna',
      slug: 'camada-luna',
      extracto: 'Dos cachorros buscan familia juntos',
      contenido_html: '<p>Luna y Sol son dos cachorros que buscan una familia juntos.</p>',
      estado_publicacion: 'borrador',
      estado_publico: 'reservado',
      estado_publico_modo: 'manual'
    });
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.equal(r.data.estado_publico_modo, 'manual');
    assert.equal(r.data.estado_publico, 'reservado');
  });

  it('no publica un grupo con fallecidos, adopción parcial o miembros vacíos', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1', estado: 'fallecido' }), miembro({ id: 'ani_2', nombre: 'Sol', estado: 'disponible' }));
    const r = b.ctx.webUpsertGrupo({
      grupo_id: 'grp_1',
      titulo: 'Camada Luna',
      slug: 'camada-luna',
      extracto: 'Dos cachorros buscan familia juntos',
      contenido_html: '<p>Luna y Sol son dos cachorros que buscan una familia juntos.</p>',
      estado_publicacion: 'publicado'
    });
    assert.equal(r.status, 'warning');
    assert.ok(r.data.some(f => f.campo === 'estado_publicacion'));
  });

  it('exige completitud para publicar (título, slug, categoría, contenido, portada y meta)', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    const r = b.ctx.webUpsertGrupo({ grupo_id: 'grp_1', slug: 'camada-luna', estado_publicacion: 'publicado' });
    assert.equal(r.status, 'warning');
    const campos = r.data.map(f => f.campo);
    assert.ok(campos.includes('contenido_html'));
    assert.ok(campos.includes('seo.metaDescription'));
  });

  it('impide publicar el grupo mientras un miembro tiene publicación individual publicada', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1', tipo: 'animal', origen_id: 'ani_1', slug: 'luna' }));
    const base = {
      grupo_id: 'grp_1',
      titulo: 'Camada Luna',
      slug: 'camada-luna',
      extracto: 'Dos cachorros buscan familia juntos',
      contenido_html: '<p>Luna y Sol son dos cachorros que buscan una familia juntos.</p>'
    };
    const borrador = b.ctx.webUpsertGrupo(Object.assign({}, base, { estado_publicacion: 'borrador' }));
    assert.equal(borrador.status, 'success', JSON.stringify(borrador));
    const guardado = b.ctx.webPublicacionDeOrigen('animal_grupo', 'grp_1');
    assert.equal(b.ctx.webEstadoGrupoPub({ grupo_id: 'grp_1', estado_publicacion: 'publicado' }).status, 'warning');
    b.estado.publicaciones.find(p => p.id === 'web_ani1').estado_publicacion = 'oculto';
    const publicado = b.ctx.webEstadoGrupoPub({ grupo_id: 'grp_1', estado_publicacion: 'publicado' });
    assert.equal(publicado.status, 'success', JSON.stringify(publicado));
    assert.equal(b.ctx.webPublicacionPorId(guardado.id).estado_publicacion, 'publicado');
  });

  it('el listado de grupos marca conflicto, sin publicar y completitud', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.animales.push(miembro({ id: 'ani_3', grupo_id: 'grp_2', grupo: 'Camada Sol', grupo_obligatorio: false }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1', tipo: 'animal', origen_id: 'ani_1', slug: 'luna' }));

    const porDefecto = b.ctx.webListarGrupos({});
    assert.equal(porDefecto.data.length, 1);
    assert.equal(porDefecto.data[0].grupo_id, 'grp_1');
    assert.equal(porDefecto.data[0].estado_publicacion, 'sin_publicar');
    assert.equal(porDefecto.data[0].conflicto_individual_publicado, true);
    assert.deepEqual(plano(porDefecto.data[0].completitud.faltan), ['publicacion']);

    const todos = b.ctx.webListarGrupos({ todos: '1' });
    assert.equal(todos.data.length, 2);

    // Un grupo no obligatorio que ya tiene publicación sí aparece en el listado normal.
    b.estado.publicaciones.push(filaGrupo({ id: 'web_g2', origen_id: 'grp_2', slug: 'camada-sol', titulo: 'Camada Sol', categoria: 'Perros en adopción' }));
    const conPublicacion = b.ctx.webListarGrupos({});
    assert.ok(conPublicacion.data.some(g => g.grupo_id === 'grp_2' && g.publicacion_id === 'web_g2'), JSON.stringify(conPublicacion.data));
  });

  it('retira con lápida 410 y restaura conservando el slug', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(filaGrupo());
    assert.equal(b.ctx.webListarPublicas({ type: 'animal_grupo' }).data.length, 1);

    const retirada = b.ctx.webArchivarGrupo({ grupo_id: 'grp_1' }, { email: 'x@y.es' });
    assert.equal(retirada.status, 'success', JSON.stringify(retirada));
    assert.equal(retirada.data.estado_publicacion, 'retirado');
    assert.equal(b.ctx.webListarPublicas({ type: 'animal_grupo' }).data.length, 0);
    assert.equal(b.ctx.webPublicacionPublica('camada-luna').status, 'gone');

    const restaurada = b.ctx.webRestaurarGrupo({ grupo_id: 'grp_1' }, { email: 'x@y.es' });
    assert.equal(restaurada.status, 'success', JSON.stringify(restaurada));
    assert.equal(restaurada.data.estado_publicacion, 'borrador');
    assert.equal(b.estado.publicaciones[0].slug, 'camada-luna');
    assert.equal(b.estado.publicaciones.length, 1);
  });

  it('solo restaura publicaciones de grupo desde el endpoint de grupos', () => {
    const b = crearBackend();
    b.estado.animales.push(animal());
    b.estado.publicaciones.push(fila({ estado_publicacion: 'retirado' }));
    const r = b.ctx.webRestaurarGrupo({ id: 'web_1' }, {});
    assert.equal(r.status, 'error');
  });

  it('no permite eliminar una publicación de grupo publicada o retirada', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(filaGrupo());
    assert.equal(b.ctx.webEliminarGrupo({ grupo_id: 'grp_1' }, {}).status, 'error');
    b.estado.publicaciones[0].estado_publicacion = 'borrador';
    assert.equal(b.ctx.webEliminarGrupo({ grupo_id: 'grp_1' }, {}).status, 'success');
    assert.equal(b.estado.publicaciones.length, 0);
  });
});

describe('exclusividad 1:1 · grupo publicado frente a ficha individual (H-1)', () => {
  function baseAnimal(extra) {
    return Object.assign({
      animal_id: 'ani_1',
      titulo: 'Luna busca familia',
      slug: 'luna',
      categoria: 'Perros en adopción',
      estado_publico: 'en_adopcion',
      contenido_html: '<p>Luna es una perra sociable que busca una familia responsable.</p>',
      seo: { metaDescription: 'Luna en adopción' }
    }, extra || {});
  }

  it('bloquea publicar el individuo mientras su grupo está publicado', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1', estado_publicacion: 'borrador' }), filaGrupo());

    const r = b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'publicado' }, null);
    assert.equal(r.status, 'warning');
    assert.match(r.error, /Camada Luna/);
    assert.match(r.error, /Oculta o retira/);
    assert.equal(b.ctx.webPublicacionPorId('web_ani1').estado_publicacion, 'borrador');
  });

  it('bloquea también el guardado directo como publicado', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(filaGrupo());

    const r = b.ctx.webUpsertAnimal(baseAnimal({ estado_publicacion: 'publicado' }));
    assert.equal(r.status, 'warning');
    assert.match(r.error, /Camada Luna/);
    assert.equal(b.estado.publicaciones.filter(p => p.tipo === 'animal').length, 0);
  });

  it('deja guardar el borrador aunque el grupo esté publicado', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(filaGrupo());

    const r = b.ctx.webUpsertAnimal(baseAnimal({ estado_publicacion: 'borrador' }));
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.equal(r.data.estado_publicacion, 'borrador');
  });

  it('permite publicar el individuo cuando el grupo está oculto o retirado', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1', estado_publicacion: 'borrador' }), filaGrupo({ estado_publicacion: 'oculto' }));

    const oculto = b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'publicado' }, null);
    assert.equal(oculto.status, 'success', JSON.stringify(oculto));

    b.estado.publicaciones.find(p => p.id === 'web_ani1').estado_publicacion = 'borrador';
    b.estado.publicaciones.find(p => p.id === 'web_g1').estado_publicacion = 'retirado';
    const retirado = b.ctx.webEstadoAnimal({ animal_id: 'ani_1', estado_publicacion: 'publicado' }, null);
    assert.equal(retirado.status, 'success', JSON.stringify(retirado));
  });

  it('el canal no sirve dos veces al mismo animal: gana el grupo', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), animal({ id: 'ani_3', nombre: 'Milo', grupo_id: '', grupo: '' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }), filaGrupo(), fila({ id: 'web_ani3', origen_id: 'ani_3', slug: 'milo' }));

    const pubs = plano(b.ctx.webPublicables()).map(p => p.tipo + ':' + p.origen_id).sort();
    assert.deepEqual(pubs, ['animal:ani_3', 'animal_grupo:grp_1']);
  });

  it('sin grupo publicado el canal mantiene la ficha individual', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }), filaGrupo({ estado_publicacion: 'borrador' }));

    const pubs = plano(b.ctx.webPublicables()).map(p => p.tipo + ':' + p.origen_id);
    assert.deepEqual(pubs, ['animal:ani_1']);
  });

  it('el listado del gestor marca grupo y grupo publicado para el selector', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), animal({ id: 'ani_2', nombre: 'Milo', grupo_id: '', grupo: '' }));
    b.estado.publicaciones.push(filaGrupo());

    const filas = plano(b.ctx.webListarAnimales({}).data);
    const luna = filas.find(f => f.animal_id === 'ani_1');
    assert.equal(luna.grupo_id, 'grp_1');
    assert.equal(luna.grupo_publicado, 'Camada Luna');
    const milo = filas.find(f => f.animal_id === 'ani_2');
    assert.equal(milo.grupo_id, '');
    assert.equal(milo.grupo_publicado, '');
  });

  it('el detalle por slug no sirve la ficha individual: redirige al grupo', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }), filaGrupo());

    const r = b.ctx.webPublicacionPublica('luna');
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.ok(r.redirect, 'debe redirigir, no servir la ficha duplicada');
    assert.equal(r.redirect.permanent, true);
    assert.equal(r.redirect.motivo, 'ficha_en_grupo');
    assert.equal(r.redirect.from, '/animales/luna');
    assert.equal(r.redirect.to, '/animales/camada-luna');
    assert.equal(r.data.slug, 'camada-luna');
    assert.equal(r.data.type, 'animal_grupo');
  });

  it('el detalle sigue sirviendo la individual cuando el grupo no está publicado', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }), filaGrupo({ estado_publicacion: 'borrador' }));

    const r = b.ctx.webPublicacionPublica('luna');
    assert.equal(r.status, 'success');
    assert.equal(r.redirect, undefined);
    assert.equal(r.data.slug, 'luna');
  });

  it('el sitemap no lista la ficha individual superada por el grupo', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }), filaGrupo());

    const locs = plano(b.ctx.webSitemap().data).map(u => u.loc).sort();
    assert.deepEqual(locs, ['https://gruponebak.net/animales/camada-luna']);
  });

  it('las redirecciones conservan el enlace de la ficha individual hacia el grupo', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }), filaGrupo());

    const entradas = plano(b.ctx.webRedirects().data);
    const entrada = entradas.find(x => x.slug === 'luna');
    assert.ok(entrada, JSON.stringify(entradas));
    assert.equal(entrada.status, 301);
    assert.equal(entrada.currentSlug, 'camada-luna');
    assert.equal(entrada.motivo, 'ficha_en_grupo');
    assert.equal(entrada.from, 'https://gruponebak.net/animales/luna');
    assert.equal(entrada.to, 'https://gruponebak.net/animales/camada-luna');
  });

  it('sin grupo publicado no hay redirección de la individual', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(miembro({ id: 'ani_1' }));
    b.estado.publicaciones.push(fila({ id: 'web_ani1' }));

    assert.deepEqual(plano(b.ctx.webRedirects().data), []);
    assert.equal(b.ctx.webSitemap().data.length, 1);
  });

  it('la ficha del animal recibe el estado web de su grupo (H-3)', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }), animal({ id: 'ani_2', nombre: 'Milo', grupo_id: '', grupo: '' }));
    b.estado.publicaciones.push(filaGrupo());

    const grupo = plano(b.ctx.webGetAnimal('ani_1').grupo);
    assert.equal(grupo.id, 'grp_1');
    assert.equal(grupo.nombre, 'Camada Luna');
    assert.deepEqual(Object.keys(grupo).sort(), ['estado_publicacion', 'id', 'nombre']);
    assert.equal(grupo.estado_publicacion, 'publicado');
    assert.equal(grupo.publicacion_id, undefined);
    assert.equal(grupo.slug, undefined);
    assert.equal(b.ctx.webGetAnimal('ani_2').grupo, null);
  });

  it('sin publicación de grupo la ficha lo marca como sin_publicar', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }));

    const grupo = plano(b.ctx.webGetAnimal('ani_1').grupo);
    assert.equal(grupo.nombre, 'Camada Luna');
    assert.equal(grupo.estado_publicacion, 'sin_publicar');
    assert.equal(grupo.publicacion_id, undefined);
    assert.equal(grupo.slug, undefined);
  });

  it('un slug histórico de la ficha superada también redirige al grupo', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(
      fila({ id: 'web_ani1', slug_historial: JSON.stringify([{ slug: 'luna-vieja', fecha: '2026-10-01T10:00:00.000Z' }]) }),
      filaGrupo()
    );

    const r = b.ctx.webPublicacionPublica('luna-vieja');
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.ok(r.redirect, 'el slug histórico debe redirigir, no dar 404');
    assert.equal(r.redirect.from, '/animales/luna-vieja');
    assert.equal(r.redirect.to, '/animales/camada-luna');
    assert.equal(r.redirect.motivo, 'ficha_en_grupo');
    assert.equal(r.data.slug, 'camada-luna');
  });

  it('las redirecciones cubren el slug actual y los históricos de la ficha superada', () => {
    const b = crearBackend();
    b.ctx.CONFIG.PUBLIC_WEB_BASE_URL = 'https://gruponebak.net/';
    b.estado.animales.push(miembro({ id: 'ani_1' }), miembro({ id: 'ani_2', nombre: 'Sol' }));
    b.estado.publicaciones.push(
      fila({ id: 'web_ani1', slug_historial: JSON.stringify(['luna-vieja', 'luna-2025']) }),
      filaGrupo()
    );

    const entradas = plano(b.ctx.webRedirects().data).filter(e => e.motivo === 'ficha_en_grupo');
    assert.deepEqual(entradas.map(e => e.slug).sort(), ['luna', 'luna-2025', 'luna-vieja']);
    entradas.forEach(e => {
      assert.equal(e.status, 301);
      assert.equal(e.currentSlug, 'camada-luna');
      assert.equal(e.from, 'https://gruponebak.net/animales/' + e.slug);
      assert.equal(e.to, 'https://gruponebak.net/animales/camada-luna');
    });
  });

  it('sin grupo publicado el slug histórico sigue yendo a la ficha individual', () => {
    const b = crearBackend();
    b.estado.animales.push(miembro({ id: 'ani_1' }));
    b.estado.publicaciones.push(
      fila({ id: 'web_ani1', slug_historial: JSON.stringify(['luna-vieja']) }),
      filaGrupo({ estado_publicacion: 'borrador' })
    );

    const r = b.ctx.webPublicacionPublica('luna-vieja');
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.equal(r.redirect.to, '/animales/luna');
    assert.equal(r.redirect.motivo, undefined);
  });
});
