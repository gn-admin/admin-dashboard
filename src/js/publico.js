/**
 * Visor público de publicaciones (sin sesión).
 * ---------------------------------------------------------------------------
 * Consume el canal público del Gestor web (`endpoint=publicaciones` y
 * `endpoint=publicacion&slug=...`) mediante JSONP, porque Apps Script no
 * permite cabeceras CORS.
 *
 * La página sirve de referencia de lo que la web pública debe renderizar:
 * listado con filtros/paginación, detalle completo (`contentHtml`, media,
 * `animal`/`event`, CTA) y metadatos SEO aplicados (title, description,
 * canonical, robots, OG/Twitter y JSON-LD).
 */

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23EAF5EE'/%3E%3Ccircle cx='200' cy='128' r='34' fill='%23cfe3d6'/%3E%3Cellipse cx='200' cy='206' rx='58' ry='42' fill='%23cfe3d6'/%3E%3C/svg%3E";

const Publico = {
  params: { type: '', category: '', species: '', q: '', page: 1, pageSize: 12 },
  filtros: { type: [], category: [], status: [], species: [] },
  items: [],
  paginacion: null,
  _req: 0,

  // ==================== LÓGICA PURA ====================

  esc(valor) {
    if (valor == null) return '';
    return String(valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /** Solo URLs http(s), relativas o mailto/tel: evita `javascript:` y `data:`. */
  urlSegura(valor) {
    const s = String(valor == null ? '' : valor).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^mailto:|^tel:/i.test(s)) return s;
    // Cualquier otro esquema (javascript:, data:, vbscript...) se descarta.
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
    // Sin esquema es una ruta relativa: assets/x.jpg, ../x, /x, #ancla.
    return s;
  },

  fecha(valor) {
    if (!valor) return '';
    const s = String(valor);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  },

  estadoTexto(estado) {
    const m = {
      en_adopcion: 'En adopción', en_acogida: 'En acogida', adoptado: 'Adoptado',
      reservado: 'Reservado', urgente: 'Urgente', cerrado: 'Cerrado',
      activo: 'Activo', programado: 'Programado', finalizado: 'Finalizado', cancelado: 'Cancelado'
    };
    return m[estado] || String(estado || '').replace(/_/g, ' ');
  },

  /** '#/publicacion/luna' -> { vista:'detalle', slug:'luna' }. */
  rutaDesdeHash(hash) {
    const h = String(hash || '').replace(/^#\/?/, '').trim();
    if (h.indexOf('publicacion/') === 0) {
      let slug = h.slice('publicacion/'.length);
      try { slug = decodeURIComponent(slug); } catch (e) {}
      return { vista: 'detalle', slug: slug };
    }
    return { vista: 'lista', slug: '' };
  },

  /** Slug vigente cuando el backend responde con `redirect` (301). */
  slugRedirigido(res) {
    const r = res && res.redirect;
    if (!r) return '';
    if (r.slug) return String(r.slug);
    const m = String(r.to || '').match(/\/([^/?#]+)\s*$/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  },

  metaDe(pub) {
    const seo = (pub && pub.seo) || {};
    const cover = (pub && pub.coverImage && pub.coverImage.src) || (pub && pub.image) || '';
    return {
      title: seo.metaTitle || (pub && pub.title) || 'Publicaciones · Grupo Nebak',
      description: seo.metaDescription || (pub && pub.excerpt) || 'Animales en adopción, acogidas, eventos e historias de Grupo Nebak.',
      // `url` es la ruta relativa del visor, no una URL absoluta: nunca sirve
      // como canonical/og:url (con base GitHub Pages el backend manda "").
      canonical: seo.canonical || (pub && pub.canonical) || '',
      robots: seo.robots || 'index,follow',
      image: seo.ogImage || cover || '',
      type: 'article'
    };
  },

  jsonLd(pub) {
    if (!pub) return null;
    const url = this.urlSegura((pub.seo && pub.seo.canonical) || pub.canonical || pub.url) || '';
    const cover = this.urlSegura((pub.coverImage && pub.coverImage.src) || pub.image);
    const base = {
      '@context': 'https://schema.org',
      '@type': pub.type === 'evento' ? 'Event' : (pub.type === 'historia' ? 'BlogPosting' : 'Article'),
      name: pub.title || '',
      headline: pub.title || '',
      description: pub.excerpt || (pub.seo && pub.seo.metaDescription) || '',
      image: cover || undefined,
      datePublished: pub.publishedAt || undefined,
      dateModified: pub.updatedAt || pub.publishedAt || undefined,
      inLanguage: 'es-ES',
      mainEntityOfPage: url ? { '@type': 'WebPage', '@id': url } : undefined
    };
    if (pub.type === 'evento' && pub.event) {
      const loc = pub.event.location || {};
      const org = pub.event.organizer || {};
      base.startDate = pub.event.startDate || undefined;
      base.endDate = pub.event.endDate || undefined;
      base.eventStatus = 'https://schema.org/EventScheduled';
      if (loc.name || loc.city) {
        base.location = {
          '@type': 'Place',
          name: loc.name || loc.city || '',
          address: { '@type': 'PostalAddress', streetAddress: loc.address || '', addressLocality: loc.city || '' }
        };
      }
      if (org.name) base.organizer = { '@type': 'Organization', name: org.name };
    }
    if (pub.type === 'animal' && pub.animal) {
      base.about = {
        '@type': 'Thing',
        name: (pub.animal.names || []).join(', '),
        description: [pub.animal.species, pub.animal.breed].filter(Boolean).join(' · ')
      };
    }
    return base;
  },

  // ==================== ARRANQUE / NAVEGACIÓN ====================

  iniciar() {
    this._bind();
    window.addEventListener('hashchange', () => this.rutear());
    this.rutear();
  },

  rutear() {
    const r = this.rutaDesdeHash(typeof location !== 'undefined' ? location.hash : '');
    if (r.vista === 'detalle') this.cargarDetalle(r.slug);
    else this.cargarLista();
  },

  _contenedor() {
    return document.getElementById('pub-contenido');
  },

  _bind() {
    const cont = this._contenedor();
    if (!cont) return;
    cont.addEventListener('submit', e => {
      const form = e.target.closest('[data-pub-search]');
      if (!form) return;
      e.preventDefault();
      const input = form.querySelector('input');
      this.params.q = input ? input.value.trim() : '';
      this.params.page = 1;
      this.cargarLista();
    });
    cont.addEventListener('change', e => {
      const campo = e.target.closest('[data-pub-filtro]');
      if (!campo) return;
      const clave = campo.dataset.pubFiltro;
      if (clave) this.params[clave] = campo.value;
      this.params.page = 1;
      this.cargarLista();
    });
    cont.addEventListener('click', e => {
      const btn = e.target.closest('[data-pub-page]');
      if (btn) {
        const p = Number(btn.dataset.pubPage);
        if (!p) return;
        this.params.page = p;
        this.cargarLista();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const limpiar = e.target.closest('[data-pub-limpiar]');
      if (limpiar) {
        this.params = { type: '', category: '', species: '', q: '', page: 1, pageSize: 12 };
        this.cargarLista();
      }
    });
    document.addEventListener('error', ev => {
      const img = ev.target;
      if (img && img.tagName === 'IMG' && !img.dataset.fb) {
        img.dataset.fb = '1';
        img.src = PLACEHOLDER_IMG;
      }
    }, true);
  },

  // ==================== CANAL PÚBLICO (JSONP) ====================

  jsonp(params) {
    return new Promise((resolve, reject) => {
      const base = (typeof CONFIG !== 'undefined' && CONFIG.apiUrl) ? CONFIG.apiUrl : '';
      if (!base) { reject(new Error('Falta API_URL en la configuración del panel.')); return; }
      const cb = '__gnPub' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const script = document.createElement('script');
      let terminado = false;
      const limpiar = () => {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      const terminar = (fn, valor) => {
        if (terminado) return;
        terminado = true;
        limpiar();
        fn(valor);
      };
      const timer = setTimeout(() => terminar(reject, new Error('El servidor tardó demasiado en responder.')), 25000);
      window[cb] = data => terminar(resolve, data);
      script.onerror = () => terminar(reject, new Error('No se pudo conectar con el servidor de publicaciones.'));
      const qs = new URLSearchParams(Object.assign({}, params, { callback: cb }));
      script.src = base + (base.indexOf('?') === -1 ? '?' : '&') + qs.toString();
      script.async = true;
      document.head.appendChild(script);
    });
  },

  async cargarLista() {
    const req = ++this._req;
    const cont = this._contenedor();
    if (!cont) return;
    cont.innerHTML = `<div class="pub-estado" role="status"><span class="pub-spinner" aria-hidden="true"></span><p>Cargando publicaciones...</p></div>`;
    try {
      const params = { endpoint: 'publicaciones' };
      Object.keys(this.params).forEach(k => {
        if (this.params[k] !== '' && this.params[k] !== null && this.params[k] !== undefined) params[k] = this.params[k];
      });
      const res = await this.jsonp(params);
      if (req !== this._req) return;
      if (!res || res.status === 'error' || res.status === 'warning') throw new Error((res && (res.error || res.detail)) || 'No se pudieron cargar las publicaciones.');
      this.filtros = res.filters || this.filtros;
      this.items = res.data || [];
      this.paginacion = res.pagination || null;
      this.renderLista();
    } catch (err) {
      if (req !== this._req) return;
      this.estadoError(err.message);
    }
  },

  async cargarDetalle(slug) {
    const req = ++this._req;
    const cont = this._contenedor();
    if (!cont) return;
    cont.innerHTML = `<div class="pub-estado" role="status"><span class="pub-spinner" aria-hidden="true"></span><p>Cargando publicación...</p></div>`;
    try {
      const res = await this.jsonp({ endpoint: 'publicacion', slug: slug });
      if (req !== this._req) return;
      if (res && res.status === 'warning') {
        this.estadoError(res.error || 'Canal público sin configurar.');
        return;
      }
      if (!res || res.status === 'error' || !res.data) {
        this.renderNoDisponible((res && res.error) || 'Esta publicación no está disponible.');
        return;
      }
      // Slug antiguo: se muestra la ficha actual con la URL nueva (301).
      const actual = this.slugRedirigido(res);
      if (actual && actual !== slug) {
        try { history.replaceState(null, '', '#/publicacion/' + encodeURIComponent(actual)); } catch (e) {}
      }
      this.renderDetalle(res.data);
    } catch (err) {
      if (req !== this._req) return;
      this.estadoError(err.message);
    }
  },

  // ==================== ESTADOS ====================

  estadoError(msg) {
    const cont = this._contenedor();
    if (!cont) return;
    const sinCanal = /sin configurar|no configurado/i.test(String(msg || ''));
    // Una página de error no debe indexarse.
    this.aplicarSeo(null, 'noindex,nofollow');
    cont.innerHTML = `<div class="pub-error">
      <h1>${sinCanal ? 'Canal público sin activar' : 'No se pudieron cargar las publicaciones'}</h1>
      <p>${this.esc(sinCanal ? 'El gestor web aún no está configurado en el backend. Configura la hoja de publicaciones para ver contenido aquí.' : (msg || 'Error desconocido'))}</p>
      <button type="button" class="pub-btn" id="pub-reintentar">Reintentar</button>
    </div>`;
    const btn = document.getElementById('pub-reintentar');
    if (btn) btn.addEventListener('click', () => this.rutear());
  },

  renderNoDisponible(msg) {
    const cont = this._contenedor();
    if (!cont) return;
    this.aplicarSeo(null, 'noindex,nofollow');
    cont.innerHTML = `<div class="pub-error">
      <h1>Publicación no disponible</h1>
      <p>${this.esc(msg || 'Puede que se haya retirado o que el enlace no sea correcto.')}</p>
      <a class="pub-btn" href="#/">Ver todas las publicaciones</a>
    </div>`;
  },

  // ==================== LISTADO ====================

  renderLista() {
    const cont = this._contenedor();
    if (!cont) return;
    const total = this.paginacion ? this.paginacion.total : this.items.length;
    const pag = this.paginacion || { page: 1, totalPages: 1 };
    const opciones = (lista, actual) => (lista || []).map(v => `<option value="${this.esc(v)}" ${actual === v ? 'selected' : ''}>${this.esc(this._etiquetaFiltro(v))}</option>`).join('');

    const hayFiltros = !!(this.params.q || this.params.type || this.params.category || this.params.species);
    const tarjetas = this.items.length
      ? this.items.map(p => this._card(p)).join('')
      : `<div class="pub-error"><h1>${hayFiltros ? 'Sin resultados' : 'Todavía no hay publicaciones'}</h1><p>${hayFiltros ? 'No hay contenido que coincida con estos filtros. Prueba a limpiarlos.' : 'Cuando se publique contenido desde el panel aparecerá aquí.'}</p></div>`;

    cont.innerHTML = `
      <section class="pub-hero-lista">
        <p class="pub-eyebrow">Grupo Nebak</p>
        <h1 class="pub-titulo">Publicaciones</h1>
        <p class="pub-lead">Animales en adopción, acogidas, eventos e historias de Grupo Nebak.</p>
      </section>
      <form class="pub-toolbar" data-pub-search role="search">
        <div class="pub-field" style="flex:2 1 240px">
          <label for="pub-q">Buscar</label>
          <input id="pub-q" type="search" name="q" value="${this.esc(this.params.q)}" placeholder="Título, texto, etiqueta...">
        </div>
        <div class="pub-field">
          <label for="pub-type">Tipo</label>
          <select id="pub-type" data-pub-filtro="type">
            <option value="">Todos</option>
            ${opciones(this.filtros.type, this.params.type)}
          </select>
        </div>
        <div class="pub-field">
          <label for="pub-category">Categoría</label>
          <select id="pub-category" data-pub-filtro="category">
            <option value="">Todas</option>
            ${opciones(this.filtros.category, this.params.category)}
          </select>
        </div>
        <div class="pub-field">
          <label for="pub-species">Especie</label>
          <select id="pub-species" data-pub-filtro="species">
            <option value="">Todas</option>
            ${opciones(this.filtros.species, this.params.species)}
          </select>
        </div>
        <div class="pub-toolbar-actions">
          <button type="submit" class="pub-btn">Buscar</button>
          <button type="button" class="pub-btn pub-btn--ghost" data-pub-limpiar>Limpiar</button>
        </div>
      </form>
      <p class="pub-count">${total} ${total === 1 ? 'publicación' : 'publicaciones'}</p>
      <div class="pub-grid">${tarjetas}</div>
      ${pag.totalPages > 1 ? `<nav class="pub-pager" aria-label="Paginación">
        <button type="button" class="pub-btn pub-btn--ghost" data-pub-page="${pag.page - 1}" ${pag.page <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${pag.page} de ${pag.totalPages}</span>
        <button type="button" class="pub-btn pub-btn--ghost" data-pub-page="${pag.page + 1}" ${pag.page >= pag.totalPages ? 'disabled' : ''}>Siguiente</button>
      </nav>` : ''}`;

    this.aplicarSeo(null);
  },

  _etiquetaFiltro(valor) {
    const m = { animal: 'Animales', evento: 'Eventos', historia: 'Historias', gato: 'Gatos', perro: 'Perros', otros: 'Otros' };
    return m[valor] || valor;
  },

  _card(p) {
    const img = this.urlSegura((p.coverImage && p.coverImage.src) || p.image);
    const alt = (p.coverImage && p.coverImage.alt) || p.title || '';
    const animal = p.animal ? [p.animal.species, p.animal.age && p.animal.age.label].filter(Boolean).join(' · ') : '';
    const meta = [this.fecha(p.publishedAt), animal].filter(Boolean).join(' · ');
    return `<a class="pub-card" href="#/publicacion/${encodeURIComponent(p.slug || '')}">
      <div class="pub-card-media${img ? '' : ' pub-card-media--vacia'}">${img ? `<img src="${this.esc(img)}" alt="${this.esc(alt)}" loading="lazy">` : '<span>Sin imagen</span>'}</div>
      <div class="pub-card-body">
        ${p.category ? `<span class="pub-tag">${this.esc(p.category)}</span>` : ''}
        ${meta ? `<p class="pub-card-meta">${this.esc(meta)}</p>` : ''}
        <h2>${this.esc(p.title)}</h2>
        ${p.excerpt ? `<p class="pub-card-excerpt">${this.esc(p.excerpt)}</p>` : ''}
        <span class="pub-card-link">Ver ficha →</span>
      </div>
    </a>`;
  },

  // ==================== DETALLE ====================

  renderDetalle(p) {
    const cont = this._contenedor();
    if (!cont) return;
    const img = this.urlSegura((p.coverImage && p.coverImage.src) || p.image);
    const alt = (p.coverImage && p.coverImage.alt) || p.title || '';
    const estado = p.status ? `<span class="pub-tag pub-tag--estado">${this.esc(this.estadoTexto(p.status))}</span>` : '';
    const cta = (p.cta && this.urlSegura(p.cta.url))
      ? `<a class="pub-btn" href="${this.esc(this.urlSegura(p.cta.url))}" rel="noopener">${this.esc(p.cta.label || 'Ver más')}</a>`
      : '';
    const etiquetas = (p.tags || []).filter(Boolean).map(t => `<span class="pub-chip">${this.esc(t)}</span>`).join('');
    const hechos = (p.icons || []).filter(i => i && (i.label || i.value)).map(i => {
      const meta = this._icono(i.label || '', i.icon || '', p);
      return `<article class="pub-fact ${meta.tone}">
        <div class="pub-fact-icon" aria-hidden="true">${meta.svg}</div>
        <div class="pub-fact-copy"><h3>${this.esc(i.label || i.icon || '')}</h3><p>${this.esc(i.value || '')}</p></div>
      </article>`;
    }).join('');
    const galeria = (p.gallery || [])
      .map((g, i) => ({
        src: this.urlSegura(g && g.src),
        alt: (g && (g.alt || g.caption)) || ((p.title ? p.title + ' ' : 'Imagen ') + (i + 1))
      }))
      .filter(g => g.src)
      .map(g => `<img src="${this.esc(g.src)}" alt="${this.esc(g.alt)}" loading="lazy">`).join('');
    const videos = (p.videos || []).filter(v => v && this.urlSegura(v.url)).map(v => `
      <a href="${this.esc(this.urlSegura(v.url))}" target="_blank" rel="noopener noreferrer">
        <span>${this.esc(v.title || 'Ver vídeo')}</span>
        <span aria-hidden="true">${this.esc((v.provider || 'vídeo').toUpperCase())} ↗</span>
      </a>`).join('');

    const acciones = cta
      ? `<div class="pub-acciones">${cta}<a class="pub-btn pub-btn--ghost" href="#/">Ver todas las publicaciones</a></div>`
      : '';
    const metaLinea = [
      estado,
      p.publishedAt ? `<span>${this.esc(this.fecha(p.publishedAt))}</span>` : '',
      p.readTime ? `<span>${this.esc(String(p.readTime))} min de lectura</span>` : '',
      p.author ? `<span>${this.esc(p.author)}</span>` : ''
    ].filter(Boolean).join('');

    cont.innerHTML = `
      <a class="pub-back" href="#/">← Todas las publicaciones</a>
      <article class="pub-detalle">
        <header class="pub-ficha-hero">
          <div class="pub-ficha-copy">
            <p class="pub-eyebrow">${this.esc(p.category || 'Ficha')}</p>
            <h1>${this.esc(p.title)}</h1>
            ${p.excerpt ? `<p class="pub-lead">${this.esc(p.excerpt)}</p>` : ''}
            ${metaLinea ? `<div class="pub-meta">${metaLinea}</div>` : ''}
            ${acciones}
          </div>
          ${img ? `<div class="pub-ficha-media"><img src="${this.esc(img)}" alt="${this.esc(alt)}" fetchpriority="high"></div>` : ''}
        </header>
        ${hechos ? `<section class="pub-section" aria-label="Datos destacados"><div class="pub-section-head"><h2>Datos destacados</h2></div><div class="pub-facts-grid">${hechos}</div></section>` : ''}
        ${etiquetas ? `<div class="pub-etiquetas">${etiquetas}</div>` : ''}
        <section class="pub-section">
          <div class="pub-section-head"><h2>Sobre este caso</h2></div>
          <div class="pub-body pub-html">${p.contentHtml || ''}</div>
        </section>
        ${galeria ? `<section class="pub-section" aria-label="Galería de imágenes"><div class="pub-section-head"><h2>Galería</h2></div><div class="pub-galeria">${galeria}</div></section>` : ''}
        ${videos ? `<section class="pub-section" aria-label="Vídeos"><div class="pub-section-head"><h2>Vídeo</h2></div><div class="pub-videos">${videos}</div></section>` : ''}
        ${p.animal ? this._bloqueAnimal(p.animal) : ''}
        ${p.event ? this._bloqueEvento(p.event) : ''}
        ${cta ? `<div class="pub-cta pub-cta--final">${cta}<a class="pub-btn pub-btn--ghost" href="#/">Ver todas las publicaciones</a></div>` : ''}
      </article>`;

    this.aplicarSeo(p);
  },

  // Icono y tono de cada dato destacado, calcado de la ficha de nueva-version.
  _icono(label, icon, pub) {
    const l = String([label, icon, pub && pub.title, pub && pub.category].join(' '))
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const svg = contenido => `<svg viewBox="0 0 24 24" aria-hidden="true">${contenido}</svg>`;
    const paw = svg('<ellipse class="fill-soft" cx="12" cy="15.2" rx="4.8" ry="3.8"/><circle cx="7.6" cy="9.2" r="1.7"/><circle cx="12" cy="7.8" r="1.8"/><circle cx="16.4" cy="9.2" r="1.7"/><path d="M7.2 15.1c0-2.8 2.2-4.6 4.8-4.6s4.8 1.8 4.8 4.6c0 2.3-2.1 4.1-4.8 4.1s-4.8-1.8-4.8-4.1Z"/><path d="M10.2 15.1c.5-.7 1.1-1 1.8-1s1.3.3 1.8 1"/>');
    const home = svg('<path class="fill-soft" d="M7.5 11.2 12 7.8l4.5 3.4V18h-9z"/><path d="M4.2 11.6 12 5.5l7.8 6.1"/><path d="M7.2 10.8V18.5h9.6v-7.7"/><path d="M12 12.2c.8-1 2.2-1 3 0 .8 1 .5 2.2-.5 3.1L12 17.5l-2.5-2.2c-1-.9-1.3-2.1-.5-3.1.8-1 2.2-1 3 0Z"/>');
    const pin = svg('<path class="fill-soft" d="M12 20s6-5.1 6-10.1A6 6 0 0 0 6 9.9C6 14.9 12 20 12 20Z"/><circle cx="12" cy="10" r="2.4"/>');
    const clock = svg('<circle class="fill-soft" cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="7.5"/><path d="M12 7.4v5l3.2 1.9"/>');
    const heart = svg('<path class="fill-soft" d="M12 18.4 6.4 13a4 4 0 0 1 5.6-5.7l.9.9.9-.9A4 4 0 0 1 19.4 13Z"/><path d="M12 18.4 6.4 13a4 4 0 0 1 5.6-5.7l.9.9.9-.9A4 4 0 0 1 19.4 13Z"/>');
    const doc = svg('<path class="fill-soft" d="M7.5 4h6.2l2.8 2.8V20H7.5z"/><path d="M7 3.8h6.8L17 7v13.2H7z"/><path d="M13.8 3.8v3.6H17"/><path d="M9.5 11h5M9.5 14h5M9.5 17h3.4"/>');
    const alert = svg('<path class="fill-soft" d="M12 4.2 3.8 18.8h16.4z"/><path d="M12 4.2 3.8 18.8h16.4z"/><path d="M12 9v4.8"/><circle cx="12" cy="16.6" r=".9"/>');
    const people = svg('<circle class="fill-soft" cx="9" cy="8.6" r="2.6"/><circle cx="9" cy="8.6" r="2.6"/><path d="M4.6 18.4a4.5 4.5 0 0 1 8.8 0"/><path d="M14.2 11.2a2.2 2.2 0 1 0 0-4.4"/><path d="M14.8 18.4c.2-1.8 1.5-3.1 3.3-3.4"/>');
    const mail = svg('<rect class="fill-soft" x="4.2" y="6.6" width="15.6" height="10.8" rx="2.4"/><rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="m5 7.5 7 5 7-5"/>');
    if (/urgente|prioridad|alert/.test(l)) return { svg: alert, tone: 'tone-peach' };
    if (/zona|ubic|lugar|irun|gipuz/.test(l)) return { svg: pin, tone: 'tone-sky' };
    if (/duracion|tiempo|plazo|fecha|edad/.test(l)) return { svg: clock, tone: 'tone-sun' };
    if (/hogar|casa|acog|familia|estado|final feliz|adoptad/.test(l)) return { svg: home, tone: 'tone-mint' };
    if (/contact|correo|email|telefono/.test(l)) return { svg: mail, tone: 'tone-sky' };
    if (/vinculo|junt|conjunt|herman|duo|trio|grupo|person/.test(l)) return { svg: people, tone: 'tone-green' };
    if (/proceso|seguim|apoyo|cuidado|requisit/.test(l)) return { svg: doc, tone: 'tone-leaf' };
    if (/especie|gato|perro|animal/.test(l)) return { svg: paw, tone: 'tone-green' };
    return { svg: heart, tone: 'tone-mint' };
  },

  _bloqueAnimal(a) {
    const salud = a.health || {};
    const chipsSalud = [
      ['vaccinated', 'Vacunado'], ['dewormed', 'Desparasitado'], ['neutered', 'Esterilizado'],
      ['microchipped', 'Microchip'], ['specialNeeds', 'Necesidades especiales']
    ].map(([k, label]) => `<span class="pub-chip${salud[k] ? '' : ' pub-chip--off'}">${label}</span>`).join('');
    const temperamento = (a.temperament || []).map(t => `<span class="pub-chip">${this.esc(t)}</span>`).join('');
    const compat = a.compatibility || {};
    const adop = a.adoption || {};
    const acogida = a.foster || {};
    const loc = a.location || {};
    const contacto = a.contact || {};
    const filas = [];
    const push = (label, valor, html) => { if (valor || html) filas.push(`<dt>${label}</dt><dd>${html || this.esc(valor)}</dd>`); };

    push('Nombre', (a.names || []).join(', '));
    push('Especie', a.species);
    push('Raza', a.breed);
    push('Sexo', (a.sex || []).join(', '));
    push('Edad', (a.age && a.age.label) || (a.age && a.age.value));
    push('Tamaño', a.size);
    push('Color', a.color);
    const compatTexto = [
      compat.dogs ? 'Perros: ' + compat.dogs : '',
      compat.cats ? 'Gatos: ' + compat.cats : '',
      compat.kids ? 'Niños: ' + compat.kids : ''
    ].filter(Boolean).join(' · ');
    push('Compatibilidad', compatTexto);
    push('Adopción', [adop.mode, adop.feeEur ? adop.feeEur + ' €' : ''].filter(Boolean).join(' · '));
    push('Requisitos', adop.requirements);
    push('Acogida temporal', acogida.temporary ? ('Sí' + (acogida.durationLabel ? ' · ' + acogida.durationLabel : '')) : '');
    push('Ubicación', [loc.city, loc.province].filter(Boolean).join(', '));
    push('Contacto', '', [
      contacto.email ? `<a href="mailto:${this.esc(contacto.email)}">${this.esc(contacto.email)}</a>` : '',
      contacto.phone ? `<a href="tel:${this.esc(String(contacto.phone).replace(/\s+/g, ''))}">${this.esc(contacto.phone)}</a>` : ''
    ].filter(Boolean).join(' · '));

    return `<section class="pub-bloque">
      <h2>Ficha del animal</h2>
      <dl class="pub-dl">${filas.join('')}</dl>
      <h3 class="pub-subtitulo">Salud</h3>
      <div class="pub-chips">${chipsSalud}</div>
      ${temperamento ? `<h3 class="pub-subtitulo">Temperamento</h3><div class="pub-chips">${temperamento}</div>` : ''}
    </section>`;
  },

  _bloqueEvento(ev) {
    const loc = ev.location || {};
    const org = ev.organizer || {};
    const reg = ev.registration || {};
    const filas = [];
    const push = (label, valor, html) => { if (valor || html) filas.push(`<dt>${label}</dt><dd>${html || this.esc(valor)}</dd>`); };
    push('Tipo', ev.kind || 'Evento');
    push('Inicio', this.fecha(ev.startDate));
    push('Fin', this.fecha(ev.endDate));
    push('Lugar', [loc.name, loc.address, loc.city].filter(Boolean).join(' · '));
    push('Online', '', loc.onlineUrl && this.urlSegura(loc.onlineUrl) ? `<a href="${this.esc(this.urlSegura(loc.onlineUrl))}" target="_blank" rel="noopener noreferrer">Acceso online</a>` : '');
    push('Organiza', org.name);
    push('Contacto', '', org.contactEmail ? `<a href="mailto:${this.esc(org.contactEmail)}">${this.esc(org.contactEmail)}</a>` : '');
    push('Público', (ev.audience || []).join(', '));
    const inscripcion = (reg.required || this.urlSegura(reg.url)) && this.urlSegura(reg.url)
      ? `<div class="pub-cta"><a class="pub-btn" href="${this.esc(this.urlSegura(reg.url))}" target="_blank" rel="noopener noreferrer">${this.esc(reg.label || 'Inscribirse')}</a></div>`
      : '';
    return `<section class="pub-bloque">
      <h2>Datos del evento</h2>
      <dl class="pub-dl">${filas.join('')}</dl>
      ${inscripcion}
    </section>`;
  },

  // ==================== SEO ====================

  aplicarSeo(pub, robotsForzado) {
    const meta = this.metaDe(pub);
    // En una ficha sin canonical (p. ej. base de GitHub Pages) no se emite;
    // en el listado sí vale la propia página.
    const canonica = meta.canonical
      ? (this.urlSegura(meta.canonical) || '')
      : ((pub || typeof location === 'undefined') ? '' : location.origin + location.pathname);
    document.title = meta.title;
    this._meta('name', 'description', meta.description);
    this._meta('name', 'robots', robotsForzado || meta.robots);
    this._meta('property', 'og:title', meta.title);
    this._meta('property', 'og:description', meta.description);
    this._meta('property', 'og:type', pub && pub.type === 'evento' ? 'article' : 'website');
    this._meta('property', 'og:url', canonica);
    this._meta('property', 'og:image', meta.image);
    this._meta('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary');
    this._meta('name', 'twitter:title', meta.title);
    this._meta('name', 'twitter:description', meta.description);
    this._meta('name', 'twitter:image', meta.image);
    const link = document.querySelector('link[rel="canonical"]');
    if (link) {
      if (canonica) link.setAttribute('href', canonica);
      else link.remove();
    }
    this._jsonLd(pub);
  },

  _meta(atributo, clave, valor) {
    let el = document.head.querySelector(`meta[${atributo}="${clave}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(atributo, clave);
      document.head.appendChild(el);
    }
    el.setAttribute('content', valor == null ? '' : String(valor));
  },

  _jsonLd(pub) {
    const previo = document.getElementById('pub-jsonld');
    if (previo) previo.remove();
    const data = this.jsonLd(pub);
    if (!data) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'pub-jsonld';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Publico.iniciar());
  } else {
    Publico.iniciar();
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Publico;
