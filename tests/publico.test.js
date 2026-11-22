/**
 * Visor público: lógica pura (rutas, SEO, JSON-LD, saneado de URLs).
 * Sin DOM ni red. Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Publico = require('../src/js/publico.js');

describe('Publico.rutaDesdeHash', () => {
  it('lista por defecto: la portada es Animales', () => {
    assert.deepEqual(Publico.rutaDesdeHash(''), { vista: 'lista', slug: '', tipo: 'animal' });
    assert.deepEqual(Publico.rutaDesdeHash('#'), { vista: 'lista', slug: '', tipo: 'animal' });
    assert.deepEqual(Publico.rutaDesdeHash('#/'), { vista: 'lista', slug: '', tipo: 'animal' });
    assert.deepEqual(Publico.rutaDesdeHash('#/cualquier-cosa'), { vista: 'lista', slug: '', tipo: 'animal' });
  });

  it('cada sección tiene su ruta', () => {
    assert.equal(Publico.rutaDesdeHash('#/animales').tipo, 'animal');
    assert.equal(Publico.rutaDesdeHash('#/grupos').tipo, 'animal_grupo');
    assert.equal(Publico.rutaDesdeHash('#/eventos').tipo, 'evento');
    assert.equal(Publico.rutaDesdeHash('#/historias').tipo, 'historia');
    assert.equal(Publico.rutaDesdeHash('#/eventos/2027').tipo, 'evento');
  });

  it('detalle por slug', () => {
    assert.deepEqual(Publico.rutaDesdeHash('#/publicacion/luna-en-adopcion'), { vista: 'detalle', slug: 'luna-en-adopcion' });
  });

  it('decodifica slugs con caracteres escapados', () => {
    assert.equal(Publico.rutaDesdeHash('#/publicacion/luna%20gato').slug, 'luna gato');
  });

  it('tolera entradas raras', () => {
    assert.deepEqual(Publico.rutaDesdeHash(null), { vista: 'lista', slug: '', tipo: 'animal' });
    assert.equal(Publico.rutaDesdeHash('#/publicacion/').slug, '');
  });
});

describe('Publico.slugRedirigido: slug antiguo -> slug actual', () => {
  it('usa el slug que devuelve el backend', () => {
    assert.equal(Publico.slugRedirigido({ redirect: { slug: 'luna-2026', to: '/animales/luna-2026' } }), 'luna-2026');
  });

  it('deduce el slug desde la ruta si no viene el campo slug', () => {
    assert.equal(Publico.slugRedirigido({ redirect: { to: '/animales/luna-2026' } }), 'luna-2026');
    assert.equal(Publico.slugRedirigido({ redirect: { to: '/historias/historia%20luna' } }), 'historia luna');
  });

  it('sin redirección no hay destino', () => {
    assert.equal(Publico.slugRedirigido({ status: 'success', data: {} }), '');
    assert.equal(Publico.slugRedirigido({ redirect: {} }), '');
    assert.equal(Publico.slugRedirigido(null), '');
  });
});

describe('Publico.metaDe: SEO de la publicación', () => {
  const pub = {
    title: 'Luna busca familia',
    excerpt: 'Perra sociable',
    slug: 'luna',
    canonical: 'https://web.test/animales/luna',
    coverImage: { src: 'https://web.test/luna.jpg', alt: 'Luna' },
    seo: {
      metaTitle: 'Luna, perra en adopción | Grupo Nebak',
      metaDescription: 'Luna busca una familia responsable.',
      canonical: 'https://web.test/animales/luna',
      robots: 'index,follow',
      ogImage: 'https://web.test/og-luna.jpg'
    }
  };

  it('prioriza los metadatos de la publicación', () => {
    const m = Publico.metaDe(pub);
    assert.equal(m.title, 'Luna, perra en adopción | Grupo Nebak');
    assert.equal(m.description, 'Luna busca una familia responsable.');
    assert.equal(m.canonical, 'https://web.test/animales/luna');
    assert.equal(m.robots, 'index,follow');
    assert.equal(m.image, 'https://web.test/og-luna.jpg');
  });

  it('usa respaldos cuando faltan metadatos', () => {
    const m = Publico.metaDe({ title: 'Milo', excerpt: 'Gato tranquilo', coverImage: { src: 'https://x/milo.jpg' } });
    assert.equal(m.title, 'Milo');
    assert.equal(m.description, 'Gato tranquilo');
    assert.equal(m.image, 'https://x/milo.jpg');
    assert.equal(m.robots, 'index,follow');
  });

  it('la ruta relativa no se usa como canonical', () => {
    const m = Publico.metaDe({ slug: 'luna', url: '/animales/luna', canonical: '', seo: {} });
    assert.equal(m.canonical, '');
  });

  it('sin publicación devuelve los valores por defecto del sitio', () => {
    const m = Publico.metaDe(null);
    assert.match(m.title, /Grupo Nebak/);
    assert.match(m.description, /Grupo Nebak/);
    assert.equal(m.canonical, '');
  });

  it('respeta noindex de la publicación', () => {
    const m = Publico.metaDe({ title: 'Oculta', seo: { robots: 'noindex,nofollow' } });
    assert.equal(m.robots, 'noindex,nofollow');
  });
});

describe('Publico.urlEstatica', () => {
  it('apunta a la página estática del prerender (canónica única)', () => {
    const previo = global.location;
    global.location = { origin: 'https://gn-admin.github.io', pathname: '/admin-dashboard/publico.html' };
    try {
      assert.equal(Publico.urlEstatica('laia'), 'https://gn-admin.github.io/admin-dashboard/publicaciones/laia.html');
      assert.equal(Publico.urlEstatica(''), '');
      assert.equal(Publico.urlEstatica(null), '');
    } finally {
      global.location = previo;
    }
  });
});

describe('Publico.urlCompartir: enlace canónico para compartir', () => {
  const conLocation = fn => {
    const previo = global.location;
    global.location = { origin: 'https://gn-admin.github.io', pathname: '/admin-dashboard/publico.html' };
    try { return fn(); } finally { global.location = previo; }
  };

  it('prefiere la canónica del payload', () => {
    assert.equal(Publico.urlCompartir({
      slug: 'laia',
      seo: { canonical: 'https://gruponebak.net/animales/laia' }
    }), 'https://gruponebak.net/animales/laia');
  });

  it('sin canónica usa la página estática del visor', () => {
    conLocation(() => assert.equal(Publico.urlCompartir({ slug: 'laia', seo: {} }),
      'https://gn-admin.github.io/admin-dashboard/publicaciones/laia.html'));
  });

  it('sin slug no ofrece enlace', () => {
    assert.equal(Publico.urlCompartir({}), '');
    assert.equal(Publico.urlCompartir(null), '');
  });
});

describe('Publico.htmlDetalle: aviso de compartir accesible', () => {
  const conLocation = fn => {
    const previo = global.location;
    global.location = { origin: 'https://gn-admin.github.io', pathname: '/admin-dashboard/publico.html' };
    try { return fn(); } finally { global.location = previo; }
  };
  const pub = { slug: 'laia', title: 'Laia', seo: {} };
  const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'css', 'publico.css'), 'utf8').replace(/\r/g, '');
  const regla = selector => {
    const m = CSS.match(new RegExp(selector + '\\s*\\{([^}]*)\\}'));
    assert.ok(m, 'No existe la regla ' + selector);
    return m[1];
  };

  it('pinta la región viva vacía y atómica junto al botón Compartir', () => {
    const html = conLocation(() => Publico.htmlDetalle(pub));
    assert.match(html, /data-compartir[^>]*>Compartir<\/button>/);
    assert.match(html, /<span class="pub-compartir-aviso" role="status" aria-live="polite" aria-atomic="true"><\/span>/);
  });

  // Regresión: con display:none el aviso vacío sale del árbol de accesibilidad y
  // el lector deja de anunciarlo. Vacío debe seguir renderizado y sin ocupar sitio.
  it('la región viva nunca se oculta con display:none', () => {
    assert.doesNotMatch(regla('\\.pub-compartir-aviso'), /display:\s*none/);
    const vacia = regla('\\.pub-compartir-aviso:empty');
    assert.doesNotMatch(vacia, /display:\s*none/);
    assert.match(vacia, /position:\s*absolute/);
    assert.match(vacia, /clip-path/);
    assert.match(vacia, /pointer-events:\s*none/);
  });
});

describe('Publico.canonicaFicha: solo cuando la estática existe', () => {
  const conLocation = fn => {
    const previo = global.location;
    global.location = { origin: 'https://gn-admin.github.io', pathname: '/admin-dashboard/publico.html', search: '' };
    try { return fn(); } finally { global.location = previo; }
  };

  it('sin índice cargado mantiene la canónica estática', () => {
    const previo = Publico._indice;
    Publico._indice = null;
    try {
      conLocation(() => assert.equal(Publico.canonicaFicha({ slug: 'laia' }),
        'https://gn-admin.github.io/admin-dashboard/publicaciones/laia.html'));
    } finally { Publico._indice = previo; }
  });

  it('con la página ya generada usa la estática', () => {
    const previo = Publico._indice;
    Publico._indice = new Set(['laia']);
    try {
      conLocation(() => assert.equal(Publico.canonicaFicha({ slug: 'laia' }),
        'https://gn-admin.github.io/admin-dashboard/publicaciones/laia.html'));
    } finally { Publico._indice = previo; }
  });

  it('si aún no se ha generado no declara canonical (evita apuntar a un 404)', () => {
    const previo = Publico._indice;
    Publico._indice = new Set(['otra']);
    try {
      conLocation(() => assert.equal(Publico.canonicaFicha({ slug: 'laia' }), ''));
    } finally { Publico._indice = previo; }
  });

  it('sin publicación no hay canónica', () => {
    assert.equal(Publico.canonicaFicha(null), '');
    assert.equal(Publico.canonicaFicha({}), '');
  });
});

describe('Publico.jsonLd', () => {
  it('animal -> Article con about y fechas', () => {
    const ld = Publico.jsonLd({
      type: 'animal', title: 'Luna', excerpt: 'Perra sociable', publishedAt: '2026-11-01T10:00:00.000Z',
      canonical: 'https://web.test/animales/luna',
      coverImage: { src: 'https://web.test/luna.jpg' },
      animal: { names: ['Luna'], species: 'perro', breed: 'Mestiza' }
    });
    assert.equal(ld['@type'], 'Article');
    assert.equal(ld.name, 'Luna');
    assert.equal(ld.datePublished, '2026-11-01T10:00:00.000Z');
    assert.equal(ld.inLanguage, 'es-ES');
    assert.equal(ld.about.species, undefined);
    assert.equal(ld.about.name, 'Luna');
    assert.match(ld.about.description, /perro/);
    assert.equal(ld.mainEntityOfPage['@id'], 'https://web.test/animales/luna');
  });

  it('evento -> Event con inicio y lugar', () => {
    const ld = Publico.jsonLd({
      type: 'evento', title: 'Jornada de puertas abiertas', publishedAt: '2026-11-02T10:00:00.000Z',
      event: {
        startDate: '2026-12-01',
        endDate: '2026-12-01',
        location: { name: 'Refugio', address: 'Calle 1', city: 'Murcia' },
        organizer: { name: 'Grupo Nebak' }
      }
    });
    assert.equal(ld['@type'], 'Event');
    assert.equal(ld.startDate, '2026-12-01');
    assert.equal(ld.location['@type'], 'Place');
    assert.equal(ld.location.address.addressLocality, 'Murcia');
    assert.equal(ld.organizer.name, 'Grupo Nebak');
  });

  it('historia -> BlogPosting', () => {
    const ld = Publico.jsonLd({ type: 'historia', title: 'La historia de Luna' });
    assert.equal(ld['@type'], 'BlogPosting');
  });

  it('sin publicación no genera JSON-LD', () => {
    assert.equal(Publico.jsonLd(null), null);
  });
});

describe('Publico.urlSegura', () => {
  it('acepta http(s), relativas y mailto/tel', () => {
    assert.equal(Publico.urlSegura('https://x.es/a'), 'https://x.es/a');
    assert.equal(Publico.urlSegura('/animales/luna'), '/animales/luna');
    assert.equal(Publico.urlSegura('./foto.jpg'), './foto.jpg');
    assert.equal(Publico.urlSegura('assets/animales/luna.jpg'), 'assets/animales/luna.jpg');
    assert.equal(Publico.urlSegura('mailto:a@b.es'), 'mailto:a@b.es');
    assert.equal(Publico.urlSegura('tel:+34600000000'), 'tel:+34600000000');
  });

  it('bloquea javascript: y esquemas raros', () => {
    assert.equal(Publico.urlSegura('javascript:alert(1)'), '');
    assert.equal(Publico.urlSegura('data:text/html,<b>x</b>'), '');
    assert.equal(Publico.urlSegura('  '), '');
    assert.equal(Publico.urlSegura(null), '');
  });
});

describe('Publico.telLink: dos números no rompen el enlace', () => {
  it('el href lleva el primero y el texto, los dos', () => {
    assert.equal(
      Publico.telLink('625140588 y 600042594'),
      '<a href="tel:625140588">625140588 y 600042594</a>'
    );
  });

  it('respeta el prefijo y los separadores del primer número', () => {
    assert.equal(Publico.telLink('+34 600 123 456'), '<a href="tel:+34600123456">+34 600 123 456</a>');
    assert.equal(Publico.telLink('600-123-456, 600-654-321'), '<a href="tel:600123456">600-123-456, 600-654-321</a>');
    assert.equal(Publico.telLink('600 123 456 / 600 654 321'), '<a href="tel:600123456">600 123 456 / 600 654 321</a>');
  });

  it('sin teléfono no pinta enlace y escapa el texto suelto', () => {
    assert.equal(Publico.telLink(''), '');
    assert.equal(Publico.telLink(null), '');
    assert.equal(Publico.telLink('   '), '');
    assert.equal(Publico.telLink('sin número'), 'sin número');
  });
});

describe('Publico.fecha', () => {
  it('formatea ISO y fechas sin hora sin desplazar el día', () => {
    assert.match(Publico.fecha('2026-11-01T10:00:00.000Z'), /2026/);
    assert.match(Publico.fecha('2026-12-01'), /1 de diciembre de 2026/);
  });

  it('valores vacíos o inválidos devuelven cadena vacía', () => {
    assert.equal(Publico.fecha(''), '');
    assert.equal(Publico.fecha(null), '');
    assert.equal(Publico.fecha('no es fecha'), '');
  });
});

describe('Publico.htmlDetalle: ficha configurable (C3)', () => {
  const base = {
    title: 'Luna busca familia',
    excerpt: 'Perra sociable',
    category: 'Perros en adopción',
    contentHtml: '<p>Luna es una perra sociable.</p>',
    publishedAt: '2026-11-01T10:00:00.000Z',
    readTime: 4,
    icons: [{ label: 'Edad', value: '2 años' }],
    gallery: [{ src: 'https://x/1.jpg', alt: 'Luna', caption: 'En el parque' }],
    videos: [{ title: 'Luna jugando', url: 'https://youtu.be/abc' }],
    tags: ['perro'],
    cta: { label: 'Quiero adoptar', url: 'https://x/adoptar', kind: 'adopcion' }
  };

  it('sin ficha mantiene el comportamiento actual', () => {
    const html = Publico.htmlDetalle(base);
    assert.match(html, /pub-detalle--ficha/);
    assert.match(html, /Datos destacados/);
    assert.match(html, /Galería/);
    assert.match(html, /Vídeo/);
    assert.match(html, /pub-chip/);
    assert.match(html, /min de lectura/);
    assert.match(html, /Quiero adoptar/);
  });

  it('respeta plantilla, bloques y tiempo de lectura', () => {
    const html = Publico.htmlDetalle(Object.assign({}, base, {
      ficha: {
        plantilla: 'historia',
        bloques: { datos: false, galeria: false, videos: false, etiquetas: false, cta: false },
        mostrarLectura: false
      }
    }));
    assert.match(html, /pub-detalle--historia/);
    assert.doesNotMatch(html, /Datos destacados/);
    assert.doesNotMatch(html, /Galería/);
    assert.doesNotMatch(html, /Vídeo/);
    assert.doesNotMatch(html, /pub-chip/);
    assert.doesNotMatch(html, /min de lectura/);
    assert.match(html, /Luna es una perra sociable/);
  });

  it('el bloque «contenido» se puede ocultar sin quitar el resto', () => {
    const html = Publico.htmlDetalle(Object.assign({}, base, { ficha: { bloques: { contenido: false } } }));
    assert.doesNotMatch(html, /Sobre este caso/);
    assert.match(html, /Datos destacados/);
  });

  it('respeta el orden de bloques configurado en la ficha', () => {
    const html = Publico.htmlDetalle(Object.assign({}, base, {
      ficha: { orden: ['galeria', 'datos', 'cta', 'contenido'] }
    }));
    const galeria = html.indexOf('Galería');
    const datos = html.indexOf('Datos destacados');
    const contenido = html.indexOf('Sobre este caso');
    assert.ok(galeria > 0 && datos > 0 && contenido > 0);
    assert.ok(galeria < datos, 'la galería va antes que los datos');
    assert.ok(datos < contenido, 'los datos van antes del contenido');
  });

  it('la ficha prevalece sobre los campos base de la publicación', () => {
    const html = Publico.htmlDetalle(Object.assign({}, base, {
      ficha: {
        tags: ['propia'],
        cta: { label: 'CTA propio', url: 'https://x/propio', kind: 'url' },
        gallery: []
      }
    }));
    assert.match(html, /propia/);
    assert.doesNotMatch(html, /pub-chip">perro</);
    assert.match(html, /CTA propio/);
    assert.doesNotMatch(html, /Quiero adoptar/);
    assert.doesNotMatch(html, /Galería/); // galería vacía explícita
  });

  it('plantilla historia nunca pinta la ficha del animal', () => {
    const html = Publico.htmlDetalle(Object.assign({}, base, {
      animal: { names: ['Luna'], species: 'Perro' },
      ficha: { plantilla: 'historia', bloques: { fichaAnimal: true } }
    }));
    assert.doesNotMatch(html, /Ficha del animal/);
  });

  it('vídeo en modo enlace por defecto y fachada click-to-load en modo embed', () => {
    const enlace = Publico.htmlDetalle(base);
    assert.match(enlace, /href="https:\/\/youtu\.be\/abc"/);
    assert.doesNotMatch(enlace, /pub-embed/);

    const embed = Publico.htmlDetalle(Object.assign({}, base, {
      videos: [{ title: 'Luna jugando', url: 'https://youtu.be/abc123XYZ' }],
      ficha: { videoModo: 'embed' }
    }));
    assert.match(embed, /class="pub-embed"/);
    assert.match(embed, /data-video-url="https:\/\/www\.youtube-nocookie\.com\/embed\/abc123XYZ\?autoplay=1&amp;rel=0"/);
    assert.doesNotMatch(embed, /<iframe/);
    assert.doesNotMatch(embed, /href="https:\/\/youtu\.be\/abc123XYZ"/);
  });

  it('en modo embed, un vídeo no reconocido mantiene el enlace externo', () => {
    const html = Publico.htmlDetalle(Object.assign({}, base, {
      videos: [{ title: 'Archivo', url: 'https://ejemplo.test/v.mp4' }],
      ficha: { videoModo: 'embed' }
    }));
    assert.doesNotMatch(html, /pub-embed/);
    assert.match(html, /href="https:\/\/ejemplo\.test\/v\.mp4"/);
  });
});

describe('Publico.peticion: diagnóstico cuando falla el canal', () => {
  it('conserva el motivo del fetch y del JSONP en el error', async () => {
    const cfg = global.CONFIG;
    const fetchOrig = global.fetch;
    const jsonpOrig = Publico.jsonp;
    global.CONFIG = { apiUrl: 'https://api.test/exec' };
    global.fetch = async () => { throw new Error('Failed to fetch'); };
    Publico.jsonp = async () => { throw new Error('No se pudo conectar con el servidor de publicaciones.'); };
    try {
      await assert.rejects(
        Publico.peticion({ endpoint: 'publicaciones' }),
        /fetch: Failed to fetch[\s\S]*JSONP|No se pudo conectar con el servidor de publicaciones/
      );
    } finally {
      global.fetch = fetchOrig;
      Publico.jsonp = jsonpOrig;
      if (cfg === undefined) delete global.CONFIG; else global.CONFIG = cfg;
    }
  });

  it('usa el JSON del fetch sin pasar por JSONP', async () => {
    const cfg = global.CONFIG;
    const fetchOrig = global.fetch;
    const jsonpOrig = Publico.jsonp;
    let jsonpLlamado = false;
    global.CONFIG = { apiUrl: 'https://api.test/exec' };
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'success', data: [] }) });
    Publico.jsonp = async () => { jsonpLlamado = true; return { status: 'error' }; };
    try {
      const res = await Publico.peticion({ endpoint: 'publicaciones' });
      assert.equal(res.status, 'success');
      assert.equal(jsonpLlamado, false);
    } finally {
      global.fetch = fetchOrig;
      Publico.jsonp = jsonpOrig;
      if (cfg === undefined) delete global.CONFIG; else global.CONFIG = cfg;
    }
  });
});

describe('Publico.estadoTexto / esc', () => {
  it('traduce estados públicos', () => {
    assert.equal(Publico.estadoTexto('en_adopcion'), 'En adopción');
    assert.equal(Publico.estadoTexto('programado'), 'Programado');
    assert.equal(Publico.estadoTexto('otro_estado'), 'otro estado');
  });

  it('escapa HTML de los campos', () => {
    assert.equal(Publico.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(Publico.esc(null), '');
  });
});

describe('Publico: agenda de eventos (sort=startDate, desde, event.pasado)', () => {
  const evento = (extra) => Object.assign({
    slug: 'jornada',
    type: 'evento',
    title: 'Jornada de puertas abiertas',
    category: 'Eventos',
    excerpt: 'Ven a conocer el refugio',
    coverImage: { src: 'https://x/a.jpg', alt: 'Jornada' },
    publishedAt: '2026-11-01T10:00:00.000Z',
    event: { startDate: '2027-03-21', endDate: '2027-03-22', pasado: false }
  }, extra);

  it('la tarjeta del evento se fecha por su día, no por el de publicación', () => {
    const html = Publico._card(evento({}));
    assert.match(html, /21 de marzo de 2027 – 22 de marzo de 2027/);
    assert.doesNotMatch(html, /1 de noviembre de 2026/);
    assert.doesNotMatch(html, /Ya celebrado/);
  });

  it('la tarjeta marca «Ya celebrado» cuando el evento pasó', () => {
    const html = Publico._card(evento({ event: { startDate: '2025-01-10', pasado: true } }));
    assert.match(html, /pub-tag--pasado">Ya celebrado/);
    assert.match(html, /10 de enero de 2025/);
  });

  it('una publicación que no es evento sigue mostrando su fecha de publicación', () => {
    const html = Publico._card({ slug: 'luna', type: 'animal', title: 'Luna', publishedAt: '2026-11-01T10:00:00.000Z' });
    assert.match(html, /1 de noviembre de 2026/);
    assert.doesNotMatch(html, /pub-tag--pasado/);
  });

  it('la ficha del evento avisa si es próximo o si ya se celebró', () => {
    assert.match(Publico.htmlDetalle(evento({})), /Próximo evento · 21 de marzo de 2027 – 22 de marzo de 2027/);
    const pasado = Publico.htmlDetalle(evento({ event: { startDate: '2025-01-10', pasado: true } }));
    assert.match(pasado, /Ya celebrado · 10 de enero de 2025/);
  });

  it('sin `event.pasado` en el payload no inventa estado', () => {
    const html = Publico.htmlDetalle(evento({ event: { startDate: '2027-03-21' } }));
    assert.doesNotMatch(html, /pub-evento-estado/);
    assert.match(html, /Datos del evento/);
  });

  it('la petición lleva `sort` y `desde` solo cuando se eligen', () => {
    const conParams = (p) => Publico.parametrosCanal.call({
      params: Object.assign({ type: '', category: '', species: '', q: '', desde: '', sort: '', page: 1, pageSize: 12 }, p)
    });
    const base = conParams({});
    assert.equal(base.endpoint, 'publicaciones');
    assert.equal(base.desde, undefined);
    assert.equal(base.sort, undefined);
    const agenda = conParams({ type: 'evento', sort: 'startDate', desde: 'hoy' });
    assert.equal(agenda.type, 'evento');
    assert.equal(agenda.sort, 'startDate');
    assert.equal(agenda.desde, 'hoy');
  });
});

describe('Publico: secciones con pestañas (una página por tipo)', () => {
  const comoPublico = (tipo) => Object.assign(Object.create(Publico), { params: { type: tipo } });

  it('enlaza las cuatro secciones y marca la activa', () => {
    const html = Publico._tabs.call(comoPublico('evento'));
    assert.match(html, /href="#\/animales"/);
    assert.match(html, /href="#\/grupos"/);
    assert.match(html, /href="#\/eventos"/);
    assert.match(html, /href="#\/historias"/);
    assert.match(html, /pub-tab pub-tab--activa" href="#\/eventos" data-pub-tab="evento" aria-current="page"/);
    assert.equal((html.match(/pub-tab--activa/g) || []).length, 1);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  });

  it('sin tipo configurado la sección activa es Animales', () => {
    assert.equal(Publico.seccionActiva.call(comoPublico('')).etiqueta, 'Animales');
    assert.equal(Publico.seccionActiva.call(comoPublico('animaleS')).etiqueta, 'Animales');
    assert.equal(Publico.seccionActiva.call(comoPublico('historia')).etiqueta, 'Historias');
    assert.equal(Publico.seccionActiva.call(comoPublico('animal_grupo')).etiqueta, 'Grupos');
  });

  it('cada sección manda su `type` al canal', () => {
    const params = (tipo) => Publico.parametrosCanal.call(comoPublico(tipo));
    assert.equal(params('animal').type, 'animal');
    assert.equal(params('animal_grupo').type, 'animal_grupo');
    assert.equal(params('evento').type, 'evento');
    assert.equal(params('historia').type, 'historia');
  });
});

describe('Publico: la vuelta desde una ficha respeta su sección', () => {
  it('un evento vuelve a Eventos y un animal a Animales', () => {
    const evento = Publico.htmlDetalle({ slug: 'jornada', type: 'evento', title: 'Jornada', event: { startDate: '2027-03-21', pasado: false } });
    assert.match(evento, /class="pub-back" href="#\/eventos"/);
    assert.doesNotMatch(evento, /href="#\/"/);
    const conCta = Publico.htmlDetalle({ slug: 'jornada', type: 'evento', title: 'Jornada', cta: { label: 'Inscribirme', url: 'https://x/i' }, event: { startDate: '2027-03-21' } });
    assert.ok((conCta.match(/href="#\/eventos"/g) || []).length >= 3);
    assert.doesNotMatch(conCta, /href="#\/"/);
    const animal = Publico.htmlDetalle({ slug: 'luna', type: 'animal', title: 'Luna', animal: { species: 'perro' } });
    assert.match(animal, /class="pub-back" href="#\/animales"/);
  });

  it('un tipo desconocido cae en la portada (Animales)', () => {
    const html = Publico.htmlDetalle({ slug: 'x', title: 'X' });
    assert.match(html, /class="pub-back" href="#\/animales"/);
  });
});
