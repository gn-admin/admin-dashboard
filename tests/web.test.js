/**
 * Gestor web · lógica pura del frontend (sin DOM ni red).
 * Cubre slug, completitud, parsers de media y el contrato de payload.
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Web = require('../src/js/web.js');

describe('Web.normalizarSlug', () => {
  it('quita acentos, mayúsculas y signos', () => {
    assert.equal(Web.normalizarSlug('Luna en Adopción!!'), 'luna-en-adopcion');
    assert.equal(Web.normalizarSlug('  Gató  Pérez  '), 'gato-perez');
  });

  it('colapsa separadores y recorta guiones', () => {
    assert.equal(Web.normalizarSlug('---perro   joven---'), 'perro-joven');
    assert.equal(Web.normalizarSlug('a/b_c.d'), 'a-b-c-d');
  });

  it('vacío o solo símbolos devuelve cadena vacía', () => {
    assert.equal(Web.normalizarSlug(''), '');
    assert.equal(Web.normalizarSlug(null), '');
    assert.equal(Web.normalizarSlug('¿¡!?'), '');
  });

  it('limita a 80 caracteres sin terminar en guion', () => {
    const largo = Web.normalizarSlug('a'.repeat(120));
    assert.equal(largo.length, 80);
  });
});

describe('Web: publicaciones frente a fichas internas', () => {
  const lista = [
    { animal_id: 'a1', nombre: 'Luna', publicacion_id: 'p1' },
    { animal_id: 'a2', nombre: 'Nube' },
    { animal_id: 'a3', nombre: 'Laia', publicacion_id: 'p2' },
    null
  ];

  it('publicacionesAnimales solo devuelve las que ya tienen publicación', () => {
    assert.deepEqual(Web.publicacionesAnimales(lista).map(a => a.animal_id), ['a1', 'a3']);
  });

  it('animalesSinPublicacion devuelve las internas (candidatas del selector)', () => {
    assert.deepEqual(Web.animalesSinPublicacion(lista).map(a => a.animal_id), ['a2']);
  });

  it('tolera listas nulas o vacías', () => {
    assert.deepEqual(Web.publicacionesAnimales(null), []);
    assert.deepEqual(Web.animalesSinPublicacion(undefined), []);
  });
});

describe('Web._pickerLista', () => {
  it('solo lista animales sin publicación y filtra por búsqueda', () => {
    Web.animales = [
      { animal_id: 'a1', nombre: 'Luna', especie: 'perro' },
      { animal_id: 'a2', nombre: 'Laia', publicacion_id: 'p1' },
      { animal_id: 'a3', nombre: 'Nube', especie: 'gato' }
    ];
    Web._pickerQ = '';
    const html = Web._pickerLista();
    assert.match(html, /Luna/);
    assert.match(html, /Nube/);
    assert.doesNotMatch(html, /Laia/);
    assert.match(html, /crearPublicacionWeb/);

    Web._pickerQ = 'nub';
    assert.match(Web._pickerLista(), /Nube/);
    assert.doesNotMatch(Web._pickerLista(), /Luna/);

    Web._pickerQ = 'zzz';
    assert.match(Web._pickerLista(), /Ningún animal sin publicar coincide/);
  });

  it('sin candidatos lo dice y no ofrece botones', () => {
    Web.animales = [{ animal_id: 'a2', nombre: 'Laia', publicacion_id: 'p1' }];
    Web._pickerQ = '';
    const html = Web._pickerLista();
    assert.match(html, /No quedan animales sin publicación web/);
    assert.doesNotMatch(html, /crearPublicacionWeb/);
  });
});

describe('Web.seoTitle', () => {
  it('respeta el meta título guardado', () => {
    assert.equal(Web.seoTitle({ titulo: 'Laia', seo: { metaTitle: 'Laia, border collie en adopción' } }), 'Laia, border collie en adopción');
  });

  it('cae al título cuando el meta título está vacío', () => {
    assert.equal(Web.seoTitle({ titulo: 'Jornada de puertas abiertas', seo: { metaTitle: '' } }), 'Jornada de puertas abiertas');
    assert.equal(Web.seoTitle({ titulo: 'Jornada de puertas abiertas', seo: { metaTitle: '   ' } }), 'Jornada de puertas abiertas');
    assert.equal(Web.seoTitle({ titulo: 'Jornada de puertas abiertas' }), 'Jornada de puertas abiertas');
  });

  it('tolera publicaciones sin datos', () => {
    assert.equal(Web.seoTitle(null), '');
    assert.equal(Web.seoTitle({}), '');
  });
});

describe('Web._avisoPublicados', () => {
  it('avisa y enlaza a la web cuando no hay nada publicado', () => {
    Web.resumen = { totales: { publicados: 0 } };
    const html = Web._avisoPublicados();
    assert.match(html, /Todavía no hay nada visible/);
    assert.match(html, /publico\.html/);
  });

  it('no muestra aviso si ya hay publicaciones', () => {
    Web.resumen = { totales: { publicados: 2 } };
    assert.equal(Web._avisoPublicados(), '');
    Web.resumen = null;
    assert.match(Web._avisoPublicados(), /Todavía no hay nada visible/);
  });
});

describe('Web.slugValido', () => {
  it('acepta slugs normalizados', () => {
    assert.equal(Web.slugValido('luna-en-adopcion'), true);
    assert.equal(Web.slugValido('luna-2026'), true);
  });

  it('rechaza vacíos, guiones sueltos y acentos', () => {
    assert.equal(Web.slugValido(''), false);
    assert.equal(Web.slugValido('luna--gato'), false);
    assert.equal(Web.slugValido('-luna'), false);
    assert.equal(Web.slugValido('luna adopcion'), false);
    assert.equal(Web.slugValido('luna-adopción'), false);
  });
});

describe('Web.completitud', () => {
  const completa = {
    titulo: 'Luna busca familia',
    slug: 'luna-busca-familia',
    categoria: 'Perros en adopción',
    contenido_html: '<p>Luna es una perra sociable que busca una familia responsable.</p>',
    extracto: 'Perra sociable',
    media: { coverImage: { src: 'https://x/luna.jpg' } },
    seo: { metaDescription: 'Luna, perra sociable en adopción' }
  };

  it('sin pendientes devuelve lista vacía', () => {
    assert.deepEqual(Web.completitud(completa), []);
  });

  it('detecta cada campo que impide publicar', () => {
    const faltan = Web.completitud({});
    assert.ok(faltan.includes('titulo'));
    assert.ok(faltan.includes('slug'));
    assert.ok(faltan.includes('categoria'));
    assert.ok(faltan.includes('contenido'));
    assert.ok(faltan.includes('imagen'));
    assert.ok(faltan.includes('seo'));
  });

  it('usa el extracto como respaldo de la meta descripción', () => {
    const p = { ...completa, seo: {} };
    assert.equal(Web.completitud(p).includes('seo'), false);
  });

  it('una descripción demasiado corta se considera pendiente', () => {
    const p = { ...completa, contenido_html: 'Muy corta' };
    assert.ok(Web.completitud(p).includes('contenido'));
  });
});

describe('Web.parseGaleria / parseIconos / parseVideos / parseLista', () => {
  it('galería: una URL por línea con orden y alt', () => {
    const g = Web.parseGaleria('https://a.jpg\n\n https://b.jpg ', 'Luna');
    assert.equal(g.length, 2);
    assert.deepEqual(g[0], { src: 'https://a.jpg', alt: 'Luna 1', caption: '', order: 0 });
    assert.deepEqual(g[1], { src: 'https://b.jpg', alt: 'Luna 2', caption: '', order: 1 });
  });

  it('iconos: icono|etiqueta|valor y descarta líneas incompletas', () => {
    const i = Web.parseIconos('vacuna|Vacunado|Sí\nsoloetiqueta\n|Chip|Sí');
    assert.deepEqual(i[0], { icon: 'vacuna', label: 'Vacunado', value: 'Sí' });
    assert.deepEqual(i[1], { icon: '', label: 'Chip', value: 'Sí' });
    assert.equal(i.length, 2);
  });

  it('vídeos: título|url con proveedor detectado', () => {
    const v = Web.parseVideos('Presentación|https://youtu.be/abc\nVimeo|https://vimeo.com/1\ninvalido');
    assert.equal(v.length, 2);
    assert.equal(v[0].provider, 'youtube');
    assert.equal(v[1].provider, 'vimeo');
  });

  it('listas por comas', () => {
    assert.deepEqual(Web.parseLista(' sociable, juguetón ,, tranquilo '), ['sociable', 'juguetón', 'tranquilo']);
    assert.deepEqual(Web.parseLista(''), []);
  });
});

describe('Web.estadoLabel / estadoCls', () => {
  it('traduce estados de publicación a etiqueta y clase', () => {
    assert.equal(Web.estadoLabel('publicado'), 'Publicado');
    assert.equal(Web.estadoLabel('borrador'), 'Borrador');
    assert.equal(Web.estadoLabel('oculto'), 'Oculto');
    assert.equal(Web.estadoLabel('sin_publicar'), 'Sin publicar');
    assert.equal(Web.estadoLabel('otro'), 'Sin publicar');
  });

  it('clases de badge coherentes con el panel', () => {
    assert.equal(Web.estadoCls('publicado'), 'aprobada');
    assert.equal(Web.estadoCls('borrador'), 'pendiente');
    assert.equal(Web.estadoCls('oculto'), 'descartada');
    assert.equal(Web.estadoCls('sin_publicar'), '');
  });
});

describe('Web.normalizarMediaUrl', () => {
  const fichero = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view?usp=sharing';

  it('convierte un fichero de Drive en thumbnail (portada w1200, galería w1600)', () => {
    assert.equal(Web.normalizarMediaUrl(fichero, 'portada'),
      'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrS&sz=w1200');
    assert.equal(Web.normalizarMediaUrl(fichero, 'galeria'),
      'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrS&sz=w1600');
  });

  it('vídeo y documento se quedan como vista del fichero', () => {
    assert.equal(Web.normalizarMediaUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrS', 'video'),
      'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view');
    assert.equal(Web.normalizarMediaUrl(fichero, 'documento'),
      'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view');
  });

  it('rechaza enlaces de carpeta y esquemas peligrosos', () => {
    assert.equal(Web.normalizarMediaUrl('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrS?usp=sharing', 'galeria'), '');
    assert.equal(Web.normalizarMediaUrl('javascript:alert(1)', 'galeria'), '');
    assert.equal(Web.normalizarMediaUrl('data:image/png;base64,AAA', 'galeria'), '');
  });

  it('respeta URLs normales y rutas relativas', () => {
    assert.equal(Web.normalizarMediaUrl(' https://x/y.jpg ', 'galeria'), 'https://x/y.jpg');
    assert.equal(Web.normalizarMediaUrl('assets/fotos/x.jpg', 'galeria'), 'assets/fotos/x.jpg');
  });
});

describe('Web.parseGaleria', () => {
  it('acepta url, url|alt y url|alt|pie', () => {
    const g = Web.parseGaleria('https://x/1.jpg\nhttps://x/2.jpg|Laia jugando\nhttps://x/3.jpg|Laia|En el parque', 'Laia');
    assert.equal(g.length, 3);
    assert.equal(g[0].src, 'https://x/1.jpg');
    assert.equal(g[0].alt, 'Laia 1');
    assert.equal(g[0].caption, '');
    assert.equal(g[1].alt, 'Laia jugando');
    assert.equal(g[2].alt, 'Laia');
    assert.equal(g[2].caption, 'En el parque');
  });

  it('conserva los pipes dentro del pie y descarta líneas sin URL', () => {
    const g = Web.parseGaleria(' |Solo alt\nhttps://x/1.jpg|Alt|Antes | después', '');
    assert.equal(g.length, 1);
    assert.equal(g[0].caption, 'Antes | después');
  });
});

describe('Web.mediaTextoGaleria / _carpetaFicha', () => {
  it('serializa solo los campos presentes', () => {
    assert.equal(Web.mediaTextoGaleria([
      { src: 'a' }, { src: 'b', alt: 'Alt' }, { src: 'c', alt: 'Alt', caption: 'Pie' }
    ]), 'a\nb|Alt\nc|Alt|Pie');
  });

  it('agrupa la carpeta por tipo', () => {
    assert.equal(Web._carpetaFicha('animal', 'laia'), 'animales/laia');
    assert.equal(Web._carpetaFicha('historia', 'luna'), 'historias/luna');
    assert.equal(Web._carpetaFicha('otro', ''), 'publicaciones/sin-slug');
  });
});

describe('Web.parseDocumentos', () => {
  it('lee nombre|url, descarta líneas sin URL y pone nombre por defecto', () => {
    const docs = Web.parseDocumentos('Contrato|https://x/a.pdf\n\n|https://x/sin-nombre.pdf\nSolo nombre\nActa | https://x/b.pdf');
    assert.deepEqual(docs, [
      { name: 'Contrato', url: 'https://x/a.pdf' },
      { name: 'Documento', url: 'https://x/sin-nombre.pdf' },
      { name: 'Acta', url: 'https://x/b.pdf' }
    ]);
  });
});

describe('Web._anadirMedia', () => {
  it('rellena portada, galería, vídeo y documentos', () => {
    const previo = global.document;
    const alt = { value: '' };
    global.document = { getElementById: id => (id === 'web-cover-alt' ? alt : null) };
    try {
      const ctx = Object.assign({}, Web);
      const portada = { value: '' };
      ctx._anadirMedia(portada, 'portada', { url: 'https://x/p.jpg' }, 'foto.jpg', 'web');
      assert.equal(portada.value, 'https://x/p.jpg');
      assert.equal(alt.value, 'foto');

      const galeria = { value: 'https://x/1.jpg' };
      ctx._anadirMedia(galeria, 'galeria', { url: 'https://x/2.jpg' }, 'dos.jpg', 'web');
      assert.equal(galeria.value, 'https://x/1.jpg\nhttps://x/2.jpg');

      const video = { value: '' };
      ctx._anadirMedia(video, 'video', { url: 'https://x/v.mp4', nombre: 'video.mp4' }, 'Mi vídeo.mp4', 'web');
      assert.equal(video.value, 'Mi vídeo|https://x/v.mp4');

      const docs = { value: '' };
      ctx._anadirMedia(docs, 'documento', { url: 'https://x/d.pdf', nombre: 'documento-d.pdf' }, 'd.pdf', 'web');
      assert.equal(docs.value, 'documento-d.pdf|https://x/d.pdf');
    } finally {
      if (previo === undefined) delete global.document;
      else global.document = previo;
    }
  });
});

describe('Web: retiradas en el gestor', () => {
  it('el resumen tiene tarjeta propia y no las suma a borradores', () => {
    const ctx = Object.assign({}, Web, { resumen: { totales: { publicados: 1, borradores: 0, ocultos: 0, retirados: 3, sin_publicar: 0, incompletas: 0, sin_seo: 0 } } });
    const previo = global.Icons;
    global.Icons = { checkCircle: 'i', fileText: 'i', eye: 'i', trash: 'i', alertTriangle: 'i' };
    let html = '';
    try {
      html = ctx._statsHtml();
    } finally {
      if (previo === undefined) delete global.Icons;
      else global.Icons = previo;
    }
    assert.match(html, /Retiradas/);
    assert.match(html, /Enlace retirado \(410\)/);
  });

  it('la fila retirada se ve, permite restaurar y no ofrece retirar ni publicar directo', () => {
    const ctx = Object.assign({}, Web);
    const html = ctx._filaEvento({
      id: 'web_1', tipo: 'historia', titulo: 'Historia retirada', slug: 'historia-retirada',
      categoria: '', estado_publicacion: 'retirado', completitud: { faltan: [] }
    });
    assert.match(html, /Retirado/);
    assert.match(html, /slug sigue reservado/);
    assert.match(html, /data-action="restaurarWebEvento"/);
    assert.match(html, />Restaurar</);
    assert.doesNotMatch(html, /data-action="archivarWeb"/);
    assert.doesNotMatch(html, /data-action="cambiarEstadoWeb"[^>]*data-arg2="publicado"/);
  });
});

describe('Web._fichaPresentacion (C3)', () => {
  global.FichaConfig = require('../src/js/ficha-config.js');
  const porDefecto = extra => Object.assign({
    plantilla: 'ficha',
    bloques: { datos: true, galeria: true, videos: true, fichaAnimal: true, etiquetas: true, cta: true },
    mostrarLectura: true
  }, extra || {});

  it('sin ficha previa y todo por defecto no envía nada', () => {
    assert.equal(Web._fichaPresentacion(null, porDefecto()), undefined);
  });

  it('envía plantilla y bloques cuando cambian', () => {
    const f = Web._fichaPresentacion(null, porDefecto({ plantilla: 'historia', bloques: { galeria: false }, mostrarLectura: false }));
    assert.equal(f.plantilla, 'historia');
    assert.equal(f.bloques.galeria, false);
    assert.equal(f.bloques.datos, true);
    assert.equal(f.mostrarLectura, false);
  });

  it('conserva los extras del JSON avanzado (iconos, galería, cta)', () => {
    const previa = porDefecto({ icons: [{ icon: 'edad', label: 'Edad', value: '2 años' }], cta: { label: 'Ver', url: 'https://x', kind: 'url' } });
    const f = Web._fichaPresentacion(previa, porDefecto({ plantilla: 'historia' }));
    assert.equal(f.plantilla, 'historia');
    assert.equal(f.icons.length, 1);
    assert.equal(f.cta.kind, 'url');
  });

  it('en evento/historia no ofrece el bloque de ficha del animal', () => {
    const html = Web._fichaPresentacionHtml('we-', null, false);
    assert.doesNotMatch(html, /bloque-animal/);
    assert.match(html, /bloque-datos/);
  });

  it('con ficha previa, volver a los valores por defecto sí se envía', () => {
    const previa = porDefecto({ plantilla: 'historia' });
    const f = Web._fichaPresentacion(previa, porDefecto());
    assert.equal(f.plantilla, 'ficha');
  });
});

describe('Web: publicar solo fichas completas', () => {
  it('sin faltantes no bloquea', () => {
    assert.deepEqual(Web._faltantesPublicacion({ completitud: { ok: true, faltan: [] } }), []);
    assert.deepEqual(Web._faltantesPublicacion(null), []);
  });

  it('traduce los campos del backend a etiquetas legibles', () => {
    const faltan = Web._faltantesPublicacion({ completitud: { faltan: ['titulo', 'coverImage', 'contenido_html', 'seo.metaDescription', 'estado_publico'] } });
    assert.deepEqual(faltan, ['Título', 'Portada', 'Descripción', 'Meta descripción', 'Estado']);
  });

  it('un campo desconocido se muestra tal cual', () => {
    assert.equal(Web._campoLabel('raro'), 'raro');
  });
});

describe('Web: helpers de escape', () => {
  it('escapa HTML cuando no hay Dashboard cargado', () => {
    assert.equal(Web._esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    assert.equal(Web._esc(null), '');
  });
});

describe('Web: aviso del deploy automático', () => {
  it('sin data.deploy deja el texto base', () => {
    assert.deepEqual(Web.avisoDeploy({ data: {} }, 'Publicado en la web'), { texto: 'Publicado en la web', tipo: undefined });
    assert.deepEqual(Web.avisoDeploy(null, 'Publicado en la web'), { texto: 'Publicado en la web', tipo: undefined });
  });

  it('deploy disparado avisa de regeneración inmediata', () => {
    const a = Web.avisoDeploy({ data: { deploy: { ok: true, disparado: true } } }, 'Publicado en la web');
    assert.match(a.texto, /Regenerando la página SEO \(2–3 min\)/);
    assert.doesNotMatch(a.texto, /30 minutos/);
    assert.equal(a.tipo, undefined);
  });

  it('deploy en cola no promete un segundo run', () => {
    const a = Web.avisoDeploy({ data: { deploy: { ok: true, disparado: false, motivo: 'en_cola' } } }, 'Publicación ocultada');
    assert.match(a.texto, /Ya hay un despliegue en marcha/);
    assert.equal(a.tipo, undefined);
  });

  it('si el deploy falla lo dice con el motivo y en warning', () => {
    const a = Web.avisoDeploy({ data: { deploy: { ok: false, error: 'Deploy automático sin configurar (falta GITHUB_DEPLOY_TOKEN)' } } }, 'Publicado en la web');
    assert.equal(a.tipo, 'warning');
    assert.match(a.texto, /no se ha lanzado/);
    assert.match(a.texto, /GITHUB_DEPLOY_TOKEN/);
    assert.match(a.texto, /GitHub Actions/);
    assert.match(a.texto, /^Publicado en la web/);
  });

  it('usa el código HTTP si no hay mensaje', () => {
    const a = Web.avisoDeploy({ data: { deploy: { ok: false, codigo: 403 } } }, 'Publicación retirada (410)');
    assert.equal(a.tipo, 'warning');
    assert.match(a.texto, /403/);
  });
});

describe('Web: botón «Regenerar web»', () => {
  it('describe el estado de configuración del deploy', () => {
    const activo = Web.estadoDeployTexto({ configurado: true, repo: 'gn-admin/admin-dashboard', ref: 'main' });
    assert.equal(activo.ok, true);
    assert.match(activo.texto, /Deploy automático activo/);
    assert.match(activo.texto, /admin-dashboard/);

    const sinToken = Web.estadoDeployTexto({ configurado: false });
    assert.equal(sinToken.ok, false);
    assert.match(sinToken.texto, /GITHUB_DEPLOY_TOKEN/);

    const sinBackend = Web.estadoDeployTexto(null);
    assert.equal(sinBackend.ok, false);
    assert.match(sinBackend.texto, /no disponible/);
  });

  it('cuenta el resultado del disparo manual', () => {
    const ok = Web.mensajeDeployManual({ ok: true, disparado: true, codigo: 204 });
    assert.match(ok.texto, /Deploy lanzado/);
    assert.match(ok.texto, /2–3 min/);
    assert.equal(ok.tipo, undefined);

    const enCola = Web.mensajeDeployManual({ ok: true, disparado: false, motivo: 'en_cola' });
    assert.match(enCola.texto, /Ya hay un despliegue en marcha/);

    const fallo = Web.mensajeDeployManual({ ok: false, error: 'GitHub respondió 401' });
    assert.equal(fallo.tipo, 'warning');
    assert.match(fallo.texto, /No se pudo lanzar el deploy/);
    assert.match(fallo.texto, /401/);

    const sinMensaje = Web.mensajeDeployManual({ ok: false, codigo: 404 });
    assert.match(sinMensaje.texto, /404/);
  });
});

describe('Web: media de Drive enlazada en el formulario', () => {
  it('saca el identificador de los enlaces de Drive', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUv';
    assert.equal(Web.driveFileId('https://drive.google.com/thumbnail?id=' + id + '&sz=w1200'), id);
    assert.equal(Web.driveFileId('https://drive.google.com/uc?id=' + id + '&export=download'), id);
    assert.equal(Web.driveFileId('https://drive.google.com/file/d/' + id + '/view'), id);
    assert.equal(Web.driveFileId('https://ejemplo.es/foto.jpg'), '');
    assert.equal(Web.driveFileId(null), '');
  });

  it('lista portada, galería, vídeos y documentos sin repetir', () => {
    const a = '1AbCdEfGhIjKlMnOpQrStUv';
    const b = '1ZzYyXxWwVvUuTtSsRrQqPp';
    const c = '1QqWwEeRrTtYyUuIiOoPpAa';
    const lista = Web.extraerMediaFormulario({
      cover: 'https://drive.google.com/thumbnail?id=' + a + '&sz=w1200',
      galeria: 'https://drive.google.com/thumbnail?id=' + b + '&sz=w1600|Alt\nhttps://drive.google.com/thumbnail?id=' + a + '&sz=w1600',
      videos: 'Presentación|https://drive.google.com/file/d/' + c + '/view',
      docs: 'Contrato|https://drive.google.com/uc?id=' + c + '&export=download'
    });
    assert.deepEqual(lista.map(m => m.tipo), ['portada', 'galeria', 'video']);
    assert.deepEqual(lista.map(m => m.fileId), [a, b, c]);
    assert.equal(lista[2].etiqueta, 'Vídeo');
  });

  it('quita del texto solo las líneas del archivo borrado', () => {
    const a = '1AbCdEfGhIjKlMnOpQrStUv';
    const b = '1ZzYyXxWwVvUuTtSsRrQqPp';
    const texto = 'https://drive.google.com/thumbnail?id=' + a + '&sz=w1200|Uno\nhttps://drive.google.com/thumbnail?id=' + b + '&sz=w1200|Dos';
    const limpio = Web.quitarMediaDeTexto(texto, a);
    assert.equal(limpio, 'https://drive.google.com/thumbnail?id=' + b + '&sz=w1200|Dos');
    assert.equal(Web.quitarMediaDeTexto('', a), '');
  });
});
