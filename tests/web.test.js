/**
 * Gestor web · lógica pura del frontend (sin DOM ni red).
 * Cubre slug, completitud, parsers de media y el contrato de payload.
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Web = require('../src/js/web.js');

describe('Web.categoriasPublicas', () => {
  it('incluye «Caso externo» una sola vez, con la grafía del backend', () => {
    const lista = Web.categoriasPublicas();
    assert.equal(lista.filter(c => c === 'Caso externo').length, 1);
    assert.ok(lista.includes('Historias'));
    assert.ok(lista.includes('Eventos'));
  });

  it('devuelve una copia: quien la use no puede alterar el catálogo', () => {
    const lista = Web.categoriasPublicas();
    lista.push('Otra');
    assert.equal(Web.categoriasPublicas().includes('Otra'), false);
  });
});

describe('Web.sponsorDeFormulario', () => {
  it('acepta número y coma decimal', () => {
    assert.equal(Web.sponsorDeFormulario('15', 'Apadrinas su comida').monthlyEur, 15);
    assert.equal(Web.sponsorDeFormulario('15,5', '').monthlyEur, 15.5);
    assert.equal(Web.sponsorDeFormulario(' 20 ', '').monthlyEur, 20);
  });

  it('vacía o inválida viaja como null, no como 0', () => {
    assert.equal(Web.sponsorDeFormulario('', 'notas').monthlyEur, null);
    assert.equal(Web.sponsorDeFormulario('mucho', '').monthlyEur, null);
    assert.equal(Web.sponsorDeFormulario('-3', '').monthlyEur, null);
  });

  it('recorta las notas y las deja vacías si no hay', () => {
    assert.equal(Web.sponsorDeFormulario('', '  hola  ').notes, 'hola');
    assert.equal(Web.sponsorDeFormulario(null, null).notes, '');
    assert.equal(Web.sponsorDeFormulario('', 'x'.repeat(300)).notes.length, 200);
  });
});

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

describe('exclusividad 1:1 con grupo publicado (H-1, H-2)', () => {
  const lista = [
    { animal_id: 'a1', nombre: 'Luna' },
    { animal_id: 'a2', nombre: 'Sol', grupo_id: 'grp_1', grupo_publicado: 'Camada Luna' },
    { animal_id: 'a3', nombre: 'Nube', publicacion_id: 'p1' }
  ];

  it('no ofrece sueltos los miembros de un grupo publicado', () => {
    assert.deepEqual(Web.animalesSinPublicacion(lista).map(a => a.animal_id), ['a1']);
  });

  it('los identifica aparte para poder avisar', () => {
    assert.deepEqual(Web.animalesEnGrupoVigente(lista).map(a => a.animal_id), ['a2']);
    assert.deepEqual(Web.animalesEnGrupoVigente(null), []);
  });

  it('un miembro con publicación propia no se ofrece ni se avisa', () => {
    const mixta = [{ animal_id: 'a4', publicacion_id: 'p9', grupo_publicado: 'Camada Luna' }];
    assert.deepEqual(Web.animalesSinPublicacion(mixta), []);
    assert.deepEqual(Web.animalesEnGrupoVigente(mixta), []);
  });

  it('el selector avisa con el nombre del grupo y no lista al miembro', () => {
    Web.animales = lista;
    Web._pickerQ = '';
    const dialogo = Web._pickerHtml();
    assert.match(dialogo, /web-picker-aviso/);
    assert.match(dialogo, /Camada Luna/);
    assert.match(dialogo, /Oculta o retira/);
    const listado = Web._pickerLista();
    assert.doesNotMatch(listado, /Sol/);
    assert.match(listado, /Luna/);
  });

  it('sin candidatos sueltos, el vacío explica el motivo', () => {
    Web.animales = [{ animal_id: 'a2', nombre: 'Sol', grupo_publicado: 'Camada Luna' }];
    Web._pickerQ = '';
    assert.match(Web._pickerLista(), /pertenecen a grupos que ya tienen publicación/);
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

  it('envía orden, modo de vídeo y etiquetas propias', () => {
    const f = Web._fichaPresentacion(null, porDefecto({
      orden: ['galeria', 'datos', 'cta'],
      videoModo: 'embed',
      tags: ['propia', 'perro']
    }));
    assert.equal(f.videoModo, 'embed');
    assert.deepEqual(f.tags, ['propia', 'perro']);
    assert.equal(f.orden[0], 'galeria');
    assert.ok(f.orden.includes('contenido'), 'el orden se completa con los bloques que falten');
  });

  it('sin etiquetas propias no se envía override (se heredan las de la publicación)', () => {
    const previa = porDefecto({ tags: ['anterior'] });
    const f = Web._fichaPresentacion(previa, porDefecto({ tags: [] }));
    assert.equal(f.tags, undefined);
  });

  it('el formulario ofrece bloques (incluido contenido), orden, vídeo y etiquetas', () => {
    const html = Web._fichaPresentacionHtml('web-', null, true);
    assert.match(html, /bloque-datos/);
    assert.match(html, /bloque-contenido/);
    assert.match(html, /bloque-animal/);
    assert.match(html, /ficha-orden-lista/);
    assert.match(html, /moverFichaBloque/);
    assert.match(html, /ficha-video-modo/);
    assert.match(html, /valor="embed"|value="embed"/);
    assert.match(html, /ficha-tags/);
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

  it('acepta los objetos {campo, mensaje} que manda el backend', () => {
    assert.deepEqual(
      Web._faltantesPublicacion({ completitud: { faltan: [{ campo: 'titulo', mensaje: 'Falta el título público' }, { campo: 'coverImage', mensaje: 'Falta la imagen de portada' }] } }),
      ['Título', 'Portada']
    );
    assert.equal(Web._campoLabel({ campo: 'seo.metaDescription', mensaje: 'x' }), 'Meta descripción');
  });

  it('los chips de completitud no pintan [object Object]', () => {
    const html = Web._chips([{ campo: 'titulo' }, { campo: 'slug' }]);
    assert.match(html, /Título/);
    assert.match(html, /Slug/);
    assert.doesNotMatch(html, /\[object Object\]/);
  });
});

describe('Web: ficha interna como fuente (F2)', () => {
  it('traduce el vocabulario público y nunca trata urgente como estado', () => {
    assert.equal(Web._estadoPublicoLabel('en_adopcion'), 'En adopción');
    assert.equal(Web._estadoPublicoLabel('cerrado'), 'Cerrado');
    assert.equal(Web._estadoPublicoLabel('urgente'), 'urgente');
  });

  it('la fila retirada de un animal permite restaurar y no publicar directo', () => {
    const ctx = Object.assign({}, Web);
    const html = ctx._filaAnimal({
      animal_id: 'a1', nombre: 'Luna', especie: 'perro', publicacion_id: 'web_1',
      slug: 'luna', estado_publicacion: 'retirado', estado_publico_efectivo: 'cerrado',
      completitud: { faltan: [] }
    });
    assert.match(html, /Retirado/);
    assert.match(html, /slug sigue reservado/);
    assert.match(html, /data-action="restaurarWebAnimal"/);
    assert.doesNotMatch(html, /data-action="retirarWebAnimal"/);
    assert.doesNotMatch(html, /data-action="cambiarEstadoWeb"[^>]*data-arg2="publicado"/);
  });

  it('el formulario deriva el estado, elimina urgente del select y muestra los heredados', () => {
    const prevD = global.Dashboard;
    const prevI = global.Icons;
    const prevDoc = global.document;
    global.Dashboard = { showFormModal: (titulo, contenido) => { global.Dashboard._ultimoHtml = contenido; }, _esc: x => String(x == null ? '' : x) };
    global.Icons = { fileText: 'i', paw: 'i', search: 'i', settings: 'i', eye: 'i', pencil: 'i', trash: 'i', plus: 'i', refresh: 'i', clipboard: 'i' };
    global.document = { getElementById: () => null };
    let html = '';
    try {
      Web._mostrarFormAnimal({
        id: '', tipo: 'animal', origen_id: 'a1', slug: '', titulo: '', estado_publicacion: 'borrador',
        estado_publico_modo: 'auto', estado_publico: 'en_adopcion', estado_publico_derivado: 'en_adopcion',
        categoria: '', media: {}, animal: {}, seo: {}, cta: null, tags: [], indexable: true, listed: true, featured: false, orden: 0
      }, {
        id: 'a1', nombre: 'Luna', especie: 'Perro', raza: 'Mestiza', sexo: 'Hembra', edad: '2 años',
        estado: 'disponible', estado_publico_derivado: 'en_adopcion', urgente: true, vacunas: 'Sí',
        esterilizada: true, microchip: '941000000000001', foto: ''
      }, []);
      html = global.Dashboard._ultimoHtml || '';
    } finally {
      if (prevD === undefined) delete global.Dashboard; else global.Dashboard = prevD;
      if (prevI === undefined) delete global.Icons; else global.Icons = prevI;
      if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
    }
    assert.match(html, /value="auto"/);
    assert.match(html, /Automático · En adopción/);
    assert.doesNotMatch(html, /value="urgente"/);
    assert.match(html, /Datos heredados de la ficha interna/);
    assert.match(html, /Estado web automático/);
    assert.match(html, /Heredado: Sí/);
    assert.match(html, /web-form-nivel/);
    assert.match(html, /web-avanzado-intro/);
    assert.match(html, /SEO básico/);
    assert.match(html, /id="web-cover"/);
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

describe('Web: contadores por pestaña', () => {
  it('cuenta solo lo que lista cada pestaña', () => {
    const ctx = Object.assign({}, Web, {
      animales: [
        { animal_id: '1', publicacion_id: 'w1', estado_publicacion: 'publicado' },
        { animal_id: '2', publicacion_id: 'w2', estado_publicacion: 'borrador' },
        { animal_id: '3', publicacion_id: '', estado_publicacion: 'publicado' }
      ],
      eventos: [
        { id: 'w3', estado_publicacion: 'publicado' },
        { id: 'w4', estado_publicacion: 'retirado' },
        { id: 'w5', estado_publicacion: 'oculto' }
      ]
    });
    const c = ctx._contadoresTab();
    assert.deepEqual(c.animal, { total: 2, publicado: 1, borrador: 1, oculto: 0, retirado: 0 });
    assert.deepEqual(c.evento, { total: 3, publicado: 1, borrador: 0, oculto: 1, retirado: 1 });
  });

  it('sin estado cuenta como borrador y tolera listas nulas', () => {
    const ctx = Object.assign({}, Web, {
      animales: [{ animal_id: '1', publicacion_id: 'w1' }],
      eventos: null
    });
    const c = ctx._contadoresTab();
    assert.equal(c.animal.total, 1);
    assert.equal(c.animal.borrador, 1);
    assert.equal(c.evento.total, 0);
  });

  it('los textos de la pestaña activa cambian por tipo', () => {
    const previo = global.Icons;
    global.Icons = { plus: 'i', refresh: 'i', eye: 'i', trash: 'i', checkCircle: 'i', fileText: 'i', alertTriangle: 'i' };
    try {
      const base = { animales: [], eventos: [], _filtros: { q: '', estado: '' }, resumen: null };
      const htmlAnimal = Object.assign({}, Web, base, { tab: 'animal' })._html();
      const htmlEvento = Object.assign({}, Web, base, { tab: 'evento' })._html();
      assert.match(htmlAnimal, /Publicar animal/);
      assert.match(htmlEvento, /Nuevo evento\/historia/);
      assert.match(htmlAnimal, /Buscar por nombre/);
      assert.match(htmlEvento, /Buscar por título, slug o categoría/);
    } finally {
      if (previo === undefined) delete global.Icons;
      else global.Icons = previo;
    }
  });
});

describe('Web: enlace público para compartir', () => {
  it('construye la URL de la página estática canónica', () => {
    const previo = global.location;
    global.location = { href: 'https://gn-admin.github.io/admin-dashboard/index.html#web' };
    try {
      assert.equal(Web.urlPublicaEstatica('laia'),
        'https://gn-admin.github.io/admin-dashboard/publicaciones/laia.html');
      assert.equal(Web.urlPublicaEstatica(''), '');
    } finally {
      global.location = previo;
    }
  });
});

describe('Web: grupos de adopción conjunta (gestor)', () => {
  const conIconos = fn => {
    const previo = global.Icons;
    global.Icons = { plus: 'i', refresh: 'i', eye: 'i', trash: 'i', pencil: 'i', checkCircle: 'i', fileText: 'i', alertTriangle: 'i', users: 'i', paw: 'i', search: 'i', settings: 'i', clipboard: 'i' };
    try { return fn(); } finally {
      if (previo === undefined) delete global.Icons;
      else global.Icons = previo;
    }
  };

  const grupo = extra => Object.assign({
    grupo_id: 'grp_1',
    nombre: 'Camada Luna',
    grupo_obligatorio: true,
    miembros_count: 2,
    miembros_nombres: ['Luna', 'Sol'],
    publicacion_id: 'web_g1',
    slug: 'camada-luna',
    titulo: 'Camada Luna',
    estado_publicacion: 'publicado',
    estado_publico: 'en_adopcion',
    urgente: false,
    completitud: { ok: true, faltan: [] }
  }, extra || {});

  it('la carpeta de media de un grupo vive con los animales', () => {
    assert.equal(Web._carpetaFicha('animal_grupo', 'camada-luna'), 'animales/camada-luna');
  });

  it('el selector solo ofrece grupos sin publicación', () => {
    const html = conIconos(() => Web._pickerGrupoHtml([
      grupo({ publicacion_id: '' }),
      grupo({ grupo_id: 'grp_2', nombre: 'Camada Sol', publicacion_id: 'web_g2' })
    ]));
    assert.match(html, /Camada Luna/);
    assert.doesNotMatch(html, /Camada Sol/);
    assert.match(html, /abrirGrupoWeb/);
  });

  it('sin grupos candidatos explica cómo se crean', () => {
    const html = Web._pickerGrupoHtml([]);
    assert.match(html, /No quedan grupos sin publicación web/);
    assert.match(html, /Grupo \/ Camada/);
  });

  it('la fila de grupo muestra miembros, estado y acciones', () => {
    const html = conIconos(() => Web._filaGrupo(grupo()));
    assert.match(html, /Camada Luna/);
    assert.match(html, /Luna, Sol/);
    assert.match(html, /En adopción/);
    assert.match(html, /camada-luna/);
    assert.match(html, /previewWebGrupo/);
    assert.match(html, /ocultarWebGrupo/);
    assert.match(html, /Ver ficha/);
    assert.match(html, /copiarEnlaceWeb/);
    assert.match(html, /data-arg0="camada-luna"/);
  });

  it('un grupo sin publicar se configura desde la fila', () => {
    const html = conIconos(() => Web._filaGrupo(grupo({ publicacion_id: '', estado_publicacion: 'sin_publicar', slug: '', completitud: { ok: false, faltan: ['publicacion'] } })));
    assert.match(html, /Configurar/);
    assert.match(html, /Sin configurar/);
    assert.doesNotMatch(html, /previewWebGrupo/);
  });

  it('un grupo retirado ofrece restaurar y no publicar', () => {
    const html = conIconos(() => Web._filaGrupo(grupo({ estado_publicacion: 'retirado' })));
    assert.match(html, /restaurarWebGrupo/);
    assert.match(html, /Enlace retirado \(410\)/);
    assert.doesNotMatch(html, /ocultarWebGrupo/);
  });

  it('avisa del conflicto con publicaciones individuales', () => {
    const html = conIconos(() => Web._filaGrupo(grupo({ conflicto_individual_publicado: true })));
    assert.match(html, /publicaciones individuales publicadas/);
  });

  it('la pestaña de grupos pinta su botón y su vacío', () => {
    const html = conIconos(() => Object.assign({}, Web, {
      tab: 'grupo', grupos: [], animales: [], eventos: [], resumen: null, _filtros: { q: '', estado: '' }
    })._html());
    assert.match(html, /Publicar grupo/);
    assert.match(html, /Buscar por grupo/);
    assert.match(html, /No hay grupos de adopción conjunta/);
  });

  it('todas las acciones delegadas de grupo existen en Web', () => {
    const DashboardWeb = require('../src/js/dashboard-web.js');
    const acciones = {
      nuevaPublicacionGrupoWeb: 'nuevaPublicacionGrupo',
      abrirGrupoWeb: 'abrirGrupo',
      editarWebGrupo: 'abrirGrupo',
      guardarGrupoWeb: 'guardarGrupo',
      previewWebGrupo: 'previewGrupo',
      publicarWebGrupo: 'publicarGrupo',
      ocultarWebGrupo: 'ocultarGrupo',
      retirarWebGrupo: 'retirarGrupo',
      restaurarWebGrupo: 'restaurarGrupo',
      eliminarWebGrupo: 'eliminarGrupo'
    };
    Object.keys(acciones).forEach(accion => {
      assert.equal(typeof DashboardWeb[accion], 'function', 'falta la acción delegada ' + accion);
      assert.equal(typeof Web[acciones[accion]], 'function', 'falta Web.' + acciones[accion]);
    });
  });
});
