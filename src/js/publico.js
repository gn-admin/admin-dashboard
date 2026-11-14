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
      <h1 class="pub-titulo">Publicaciones</h1>
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
    return `<a class="pub-card" href="#/publicacion/${encodeURIComponent(p.slug || '')}">
      <div class="pub-card-media${img ? '' : ' pub-card-media--vacia'}">${img ? `<img src="${this.esc(img)}" alt="${this.esc(alt)}" loading="lazy">` : '<span>Sin imagen</span>'}</div>
      <div class="pub-card-body">
        ${p.category ? `<span class="pub-tag">${this.esc(p.category)}</span>` : ''}
        <h2>${this.esc(p.title)}</h2>
        ${p.excerpt ? `<p>${this.esc(p.excerpt)}</p>` : ''}
        <div class="pub-card-meta">${this.esc(this.fecha(p.publishedAt))}${animal ? ' · ' + this.esc(animal) : ''}</div>
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
      ? `<div class="pub-cta"><a class="pub-btn" href="${this.esc(this.urlSegura(p.cta.url))}" rel="noopener">${this.esc(p.cta.label || 'Ver más')}</a></div>`
      : '';
    const etiquetas = (p.tags || []).filter(Boolean).map(t => `<span class="pub-chip">${this.esc(t)}</span>`).join('');
    const iconos = (p.icons || []).filter(i => i && (i.label || i.value)).map(i => `
      <dt>${this.esc(i.label || i.icon)}</dt><dd>${this.esc(i.value)}</dd>`).join('');
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

    cont.innerHTML = `
      <a class="pub-back" href="#/">← Todas las publicaciones</a>
      <article class="pub-detalle">
        ${img ? `<div class="pub-hero"><img src="${this.esc(img)}" alt="${this.esc(alt)}" fetchpriority="high"></div>` : ''}
        <div class="pub-detalle-cuerpo">
          <div class="pub-etiquetas">
            ${p.category ? `<span class="pub-tag">${this.esc(p.category)}</span>` : ''}
            ${estado}
          </div>
          <h1>${this.esc(p.title)}</h1>
          ${p.excerpt ? `<p class="pub-lead">${this.esc(p.excerpt)}</p>` : ''}
          <div class="pub-meta">
            ${p.publishedAt ? `<span>${this.esc(this.fecha(p.publishedAt))}</span>` : ''}
            ${p.readTime ? `<span>${this.esc(String(p.readTime))} min de lectura</span>` : ''}
            ${p.author ? `<span>${this.esc(p.author)}</span>` : ''}
          </div>
          ${etiquetas ? `<div class="pub-chips">${etiquetas}</div>` : ''}
          ${iconos ? `<dl class="pub-dl">${iconos}</dl>` : ''}
          <div class="pub-html">${p.contentHtml || ''}</div>
          ${galeria ? `<div class="pub-galeria">${galeria}</div>` : ''}
          ${videos ? `<div class="pub-videos">${videos}</div>` : ''}
          ${p.animal ? this._bloqueAnimal(p.animal) : ''}
          ${p.event ? this._bloqueEvento(p.event) : ''}
          ${cta}
        </div>
      </article>`;

    this.aplicarSeo(p);
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
