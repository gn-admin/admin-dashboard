/**
 * Visor público: lógica pura (rutas, SEO, JSON-LD, saneado de URLs).
 * Sin DOM ni red. Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Publico = require('../src/js/publico.js');

describe('Publico.rutaDesdeHash', () => {
  it('lista por defecto', () => {
    assert.deepEqual(Publico.rutaDesdeHash(''), { vista: 'lista', slug: '' });
    assert.deepEqual(Publico.rutaDesdeHash('#'), { vista: 'lista', slug: '' });
    assert.deepEqual(Publico.rutaDesdeHash('#/'), { vista: 'lista', slug: '' });
    assert.deepEqual(Publico.rutaDesdeHash('#/cualquier-cosa'), { vista: 'lista', slug: '' });
  });

  it('detalle por slug', () => {
    assert.deepEqual(Publico.rutaDesdeHash('#/publicacion/luna-en-adopcion'), { vista: 'detalle', slug: 'luna-en-adopcion' });
  });

  it('decodifica slugs con caracteres escapados', () => {
    assert.equal(Publico.rutaDesdeHash('#/publicacion/luna%20gato').slug, 'luna gato');
  });

  it('tolera entradas raras', () => {
    assert.deepEqual(Publico.rutaDesdeHash(null), { vista: 'lista', slug: '' });
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
