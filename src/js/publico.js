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

// Runtime del vídeo click-to-load (C3). En el navegador se carga antes que este
// archivo; en Node (prerender y tests) se resuelve con require.
const _PublicoEmbed = (typeof PublicoEmbed !== 'undefined' && PublicoEmbed)
  ? PublicoEmbed
  : (typeof module !== 'undefined' && module.exports
    ? (function () { try { return require('./publico-embed.js'); } catch (e) { return null; } })()
    : null);

// Normalizador compartido con el gestor. En Node (prerender/tests) se resuelve
// con require; en el navegador, `ficha-config.js` se carga antes.
const _FichaConfig = (typeof FichaConfig !== 'undefined' && FichaConfig)
  ? FichaConfig
  : (typeof module !== 'undefined' && module.exports
    ? (function () { try { return require('./ficha-config.js'); } catch (e) { return null; } })()
    : null);

const Publico = {
  params: { type: '', category: '', species: '', q: '', page: 1, pageSize: 12 },
  filtros: { type: [], category: [], status: [], species: [] },
  items: [],
  paginacion: null,
  _req: 0,
  /** Slugs con página estática generada (null = índice aún sin cargar). */
  _indice: null,

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

  /**
   * URL de la página estática que genera el prerender. Es la canónica de la
   * ficha: evita que el visor (hash) y la estática compitan por el contenido.
   */
  urlEstatica(slug) {
    const s = String(slug || '').trim();
    if (!s || typeof location === 'undefined') return '';
    const dir = location.pathname.replace(/[^/]*$/, '');
    return location.origin + dir + 'publicaciones/' + encodeURIComponent(s) + '.html';
  },

  /**
   * URL que se comparte: la canónica de la ficha (página estática en este
   * visor). Si el payload aún no trae canónica, se deriva del slug.
   */
  urlCompartir(pub) {
    const canonica = this.urlSegura((pub && pub.seo && pub.seo.canonical) || (pub && pub.canonical) || '');
    if (canonica) return canonica;
    return this.urlEstatica(pub && pub.slug);
  },

  /**
   * Carga el índice que publica el prerender (`publicaciones/index.json`).
   * Si falla, `_indice` queda a null y se mantiene la canónica estática: es
   * preferible a un canonical inestable.
   */
  async cargarIndice() {
    if (this._indice) return this._indice;
    try {
      const res = await fetch('publicaciones/index.json', { cache: 'no-cache' });
      if (!res.ok) return null;
      const datos = await res.json();
      this._indice = new Set(((datos && datos.publicados) || []).map(String));
    } catch (e) { /* sin índice: comportamiento anterior */ }
    return this._indice;
  },

  /**
   * Canónica de una ficha. Solo apunta a `publicaciones/<slug>.html` cuando el
   * índice confirma que esa página ya se generó; si aún no existe (ficha recién
   * publicada) se omite el canonical en vez de declarar un 404.
   */
  canonicaFicha(pub) {
    if (!pub || !pub.slug) return '';
    if (!this._indice) return this.urlEstatica(pub.slug);
    return this._indice.has(String(pub.slug)) ? this.urlEstatica(pub.slug) : '';
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
    const esGrupo = !!(pub && (pub.isGroup || pub.type === 'animal_grupo'));
    if (esGrupo && (pub.group || pub.animal)) {
      const g = pub.group || pub.animal || {};
      const miembros = Array.isArray(g.members) ? g.members.map(m => m && m.nombre).filter(Boolean) : [];
      base.about = {
        '@type': 'Thing',
        name: g.groupName || pub.title || 'Grupo',
        description: [g.species, (miembros.length ? ('Miembros: ' + miembros.join(', ')) : '')].filter(Boolean).join(' · ')
      };
    } else if (pub.type === 'animal' && pub.animal) {
      base.about = {
        '@type': 'Thing',
        name: (pub.animal.names || []).join(', '),
        description: [pub.animal.species, pub.animal.breed].filter(Boolean).join(' · ')
      };
    }
    return base;
  },

  // ==================== ARRANQUE / NAVEGACIÓN ====================

  async iniciar() {
    this._bind();
    window.addEventListener('hashchange', () => this.rutear());
    await this.cargarIndice();
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

  // ==================== CANAL PÚBLICO (fetch + JSONP de respaldo) ====================

  // Apps Script responde con `Access-Control-Allow-Origin: *`, así que la vía
  // normal es fetch. El JSONP queda solo como respaldo para despliegues
  // antiguos o navegadores que bloquean scripts de terceros.
  async peticion(params) {
    const base = (typeof CONFIG !== 'undefined' && CONFIG.apiUrl) ? CONFIG.apiUrl : '';
    if (!base) throw new Error('Falta API_URL en la configuración del panel.');
    const qs = new URLSearchParams(params);
    const motivos = [];
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    try {
      const res = await fetch(base + (base.indexOf('?') === -1 ? '?' : '&') + qs.toString(), {
        signal: ctrl ? ctrl.signal : undefined,
        cache: 'no-store',
        credentials: 'omit'
      });
      if (res.ok) {
        const texto = await res.text();
        try { return JSON.parse(texto); } catch (e) { motivos.push('fetch: respuesta no JSON'); }
      } else {
        motivos.push('fetch: HTTP ' + res.status);
      }
    } catch (e) {
      motivos.push('fetch: ' + (e && e.name === 'AbortError' ? 'sin respuesta en 20 s' : ((e && e.message) || 'fallo de red')));
    }
    finally { if (timer) clearTimeout(timer); }
    // Si el fetch falla se prueba el respaldo JSONP, pero el motivo original
    // se conserva: es lo que permite diagnosticar un móvil desde la pantalla.
    try {
      return await this.jsonp(params);
    } catch (e2) {
      const sinRed = (typeof navigator !== 'undefined' && navigator.onLine === false) ? ' · sin conexión' : '';
      throw new Error('No se pudo cargar el canal. ' + motivos.join(' · ') + sinRed + ' · ' + ((e2 && e2.message) || 'JSONP: fallo'));
    }
  },

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
      const res = await this.peticion(params);
      if (req !== this._req) return;
      if (!res || res.status === 'error' || res.status === 'warning') {
        const partes = res ? [res.error, res.detail, res.code ? '[' + res.code + ']' : ''].filter(Boolean) : [];
        throw new Error(partes.join(' · ') || 'No se pudieron cargar las publicaciones.');
      }
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
      const res = await this.peticion({ endpoint: 'publicacion', slug: slug });
      if (req !== this._req) return;
      if (res && res.status === 'warning') {
        this.estadoError([res.error, res.detail].filter(Boolean).join(' · ') || 'Canal público sin configurar.');
        return;
      }
      // Publicación retirada (410): la fila se conserva como lápida.
      if (res && res.status === 'gone') {
        this.renderRetirada(res.error);
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

  /** 410 lógico: la publicación existió y se retiró; no vuelve a publicarse. */
  renderRetirada(msg) {
    const cont = this._contenedor();
    if (!cont) return;
    this.aplicarSeo(null, 'noindex,nofollow');
    cont.innerHTML = `<div class="pub-error">
      <h1>Publicación retirada</h1>
      <p>${this.esc(msg || 'Esta ficha ya no está disponible.')}</p>
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
    const m = { animal: 'Animales', animal_grupo: 'Grupos', evento: 'Eventos', historia: 'Historias', gato: 'Gatos', perro: 'Perros', otros: 'Otros' };
    return m[valor] || valor;
  },

  _card(p) {
    const img = this.urlSegura((p.coverImage && p.coverImage.src) || p.image);
    const alt = (p.coverImage && p.coverImage.alt) || p.title || '';
    const esGrupo = !!(p && (p.isGroup || p.type === 'animal_grupo'));
    const g = p.group || (esGrupo ? p.animal : null) || {};
    const animal = esGrupo
      ? [g.species, (g.count ? (g.count + ' miembros') : ''), (g.age && g.age.label)].filter(Boolean).join(' · ')
      : (p.animal ? [p.animal.species, p.animal.age && p.animal.age.label].filter(Boolean).join(' · ') : '');
    const meta = [this.fecha(p.publishedAt), animal].filter(Boolean).join(' · ');
    const urgente = p.urgent ? `<span class="pub-tag pub-tag--urgente">Urgente</span>` : '';
    return `<a class="pub-card" href="#/publicacion/${encodeURIComponent(p.slug || '')}">
      <div class="pub-card-media${img ? '' : ' pub-card-media--vacia'}">${img ? `<img src="${this.esc(img)}" alt="${this.esc(alt)}" loading="lazy">` : '<span>Sin imagen</span>'}</div>
      <div class="pub-card-body">
        ${urgente}${p.category ? `<span class="pub-tag">${this.esc(p.category)}</span>` : ''}
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
    cont.innerHTML = this.htmlDetalle(p);
    this.aplicarSeo(p);
  },

  _normalizarFichaCfg(ficha) {
    const FC = _FichaConfig;
    if (FC && typeof FC.normalizarFicha === 'function') {
      const n = FC.normalizarFicha(ficha);
      if (!n) return null;
      const bloques = typeof FC.bloquesEfectivos === 'function'
        ? FC.bloquesEfectivos(n)
        : Object.assign({}, FC.BLOQUES_DEF || {}, n.bloques || {});
      const orden = typeof FC.normalizarOrden === 'function' ? FC.normalizarOrden(n.orden) : n.orden;
      const out = {
        plantilla: n.plantilla || 'ficha',
        bloques,
        orden: Array.isArray(orden) ? orden : [],
        videoModo: n.videoModo === 'embed' ? 'embed' : 'enlace',
        mostrarLectura: n.mostrarLectura !== false
      };
      // Solo se copian los campos que la ficha define: su ausencia hereda la base.
      ['icons', 'gallery', 'videos', 'tags', 'cta'].forEach(k => {
        if (Object.prototype.hasOwnProperty.call(n, k)) out[k] = n[k];
      });
      return out;
    }
    // Fallback sin FichaConfig (no debería ocurrir: se carga antes).
    let f = ficha;
    if (typeof f === 'string') { try { f = JSON.parse(f); } catch (e) { return null; } }
    if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
    const plantillas = ['ficha', 'historia'];
    const plantilla = plantillas.includes(String(f.plantilla || '').toLowerCase()) ? String(f.plantilla).toLowerCase() : 'ficha';
    const def = { datos: true, etiquetas: true, contenido: true, galeria: true, videos: true, fichaAnimal: plantilla !== 'historia', cta: true };
    const src = f.bloques && typeof f.bloques === 'object' ? f.bloques : {};
    const bloques = {};
    for (const k of Object.keys(def)) {
      const v = src[k];
      bloques[k] = (v === false || v === 'false') ? false : def[k];
    }
    const ordenDef = ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta'];
    const orden = [];
    (Array.isArray(f.orden) ? f.orden : []).forEach(k => {
      const key = String(k || '').trim();
      if (Object.prototype.hasOwnProperty.call(def, key) && !orden.includes(key)) orden.push(key);
    });
    ordenDef.forEach(k => { if (!orden.includes(k)) orden.push(k); });
    const out = {
      plantilla,
      bloques,
      orden,
      videoModo: String(f.videoModo || '').toLowerCase() === 'embed' ? 'embed' : 'enlace',
      mostrarLectura: !(f.mostrarLectura === false || f.mostrarLectura === 'false')
    };
    ['icons', 'gallery', 'videos', 'tags'].forEach(k => { if (Array.isArray(f[k])) out[k] = f[k]; });
    if (f.cta && typeof f.cta === 'object') out.cta = f.cta;
    return out;
  },

  /**
   * HTML de la ficha sin tocar el DOM: lo comparten el visor y el prerender
   * estático (`scripts/prerender-publico.js`).
   *
   * Si hay `ficha`, manda su configuración: bloques, orden, modo de vídeo y
   * campos enriquecidos (`icons`, `gallery`, `videos`, `tags`, `cta`), que
   * prevalecen sobre los campos base de la publicación.
   */
  htmlDetalle(p) {
    p = p || {};
    const cfg = this._normalizarFichaCfg(p.ficha);
    const b = (cfg && cfg.bloques) || { datos: true, etiquetas: true, contenido: true, galeria: true, videos: true, fichaAnimal: true, cta: true };
    const mostrarLectura = cfg ? cfg.mostrarLectura : true;
    const plantilla = (cfg && cfg.plantilla) || 'ficha';
    const videoModo = (cfg && cfg.videoModo) || 'enlace';
    const orden = (cfg && Array.isArray(cfg.orden) && cfg.orden.length)
      ? cfg.orden
      : ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta'];
    const tiene = k => !!(cfg && Object.prototype.hasOwnProperty.call(cfg, k));
    const icons = tiene('icons') ? (cfg.icons || []) : (Array.isArray(p.icons) ? p.icons : []);
    const gallery = tiene('gallery') ? (cfg.gallery || []) : (Array.isArray(p.gallery) ? p.gallery : []);
    const videos = tiene('videos') ? (cfg.videos || []) : (Array.isArray(p.videos) ? p.videos : []);
    const tags = tiene('tags') ? (cfg.tags || []) : (Array.isArray(p.tags) ? p.tags : []);
    const ctaFuente = tiene('cta') ? cfg.cta : p.cta;

    const img = this.urlSegura((p.coverImage && p.coverImage.src) || p.image);
    const alt = (p.coverImage && p.coverImage.alt) || p.title || '';
    const estado = p.status ? `<span class="pub-tag pub-tag--estado">${this.esc(this.estadoTexto(p.status))}</span>` : '';
    const urgente = p.urgent ? `<span class="pub-tag pub-tag--urgente">Urgente</span>` : '';
    const ctaObj = (ctaFuente && this.urlSegura(ctaFuente.url)) ? ctaFuente : null;
    const cta = (b.cta && ctaObj)
      ? `<a class="pub-btn" href="${this.esc(this.urlSegura(ctaObj.url))}" rel="noopener">${this.esc(ctaObj.label || 'Ver más')}</a>`
      : '';
    const etiquetas = (b.etiquetas && tags.length) ? tags.filter(Boolean).map(t => `<span class="pub-chip">${this.esc(t)}</span>`).join('') : '';
    const hechos = (b.datos && icons.length) ? icons.filter(i => i && (i.label || i.value)).map(i => {
      const meta = this._icono(i.label || '', i.icon || '', p);
      return `<article class="pub-fact ${meta.tone}">
        <div class="pub-fact-icon" aria-hidden="true">${meta.svg}</div>
        <div class="pub-fact-copy"><h3>${this.esc(i.label || i.icon || '')}</h3><p>${this.esc(i.value || '')}</p></div>
      </article>`;
    }).join('') : '';
    const galeria = (b.galeria && gallery.length) ? gallery
      .map((g, i) => ({
        src: this.urlSegura(g && g.src),
        alt: (g && (g.alt || g.caption)) || ((p.title ? p.title + ' ' : 'Imagen ') + (i + 1)),
        pie: (g && g.caption) || ''
      }))
      .filter(g => g.src)
      .map(g => `<figure class="pub-figura"><img src="${this.esc(g.src)}" alt="${this.esc(g.alt)}" loading="lazy">${g.pie ? `<figcaption>${this.esc(g.pie)}</figcaption>` : ''}</figure>`).join('') : '';
    const videosHtml = (b.videos && videos.length) ? videos.map(v => {
      const url = this.urlSegura(v && v.url);
      if (!url) return '';
      const titulo = (v && v.title) || 'Vídeo';
      if (videoModo === 'embed' && _PublicoEmbed) {
        const datos = _PublicoEmbed.info(url);
        if (datos) return _PublicoEmbed.fachada(datos, titulo);
      }
      return `
      <a href="${this.esc(url)}" target="_blank" rel="noopener noreferrer">
        <span>${this.esc(titulo)}</span>
        <span aria-hidden="true">${this.esc(String((v && v.provider) || 'vídeo').toUpperCase())} ↗</span>
      </a>`;
    }).filter(Boolean).join('') : '';

    const compartirUrl = this.urlCompartir(p);
    const compartir = compartirUrl
      ? `<button type="button" class="pub-btn pub-btn--ghost" data-compartir data-url="${this.esc(compartirUrl)}" data-title="${this.esc(p.title || '')}">Compartir</button><span class="pub-compartir-aviso" role="status" aria-live="polite" aria-atomic="true"></span>`
      : '';
    const acciones = (cta || compartir)
      ? `<div class="pub-acciones">${cta}${compartir}<a class="pub-btn pub-btn--ghost" href="#/">Ver todas las publicaciones</a></div>`
      : '';
    const metaLinea = [
      urgente,
      estado,
      p.publishedAt ? `<span>${this.esc(this.fecha(p.publishedAt))}</span>` : '',
      (mostrarLectura && p.readTime) ? `<span>${this.esc(String(p.readTime))} min de lectura</span>` : '',
      p.author ? `<span>${this.esc(p.author)}</span>` : ''
    ].filter(Boolean).join('');

    const secciones = {
      datos: hechos ? `<section class="pub-section" aria-label="Datos destacados"><div class="pub-section-head"><h2>Datos destacados</h2></div><div class="pub-facts-grid">${hechos}</div></section>` : '',
      etiquetas: etiquetas ? `<div class="pub-etiquetas">${etiquetas}</div>` : '',
      contenido: (b.contenido && p.contentHtml) ? `<section class="pub-section">
          <div class="pub-section-head"><h2>Sobre este caso</h2></div>
          <div class="pub-body pub-html">${p.contentHtml}</div>
        </section>` : '',
      galeria: galeria ? `<section class="pub-section" aria-label="Galería de imágenes"><div class="pub-section-head"><h2>Galería</h2></div><div class="pub-galeria">${galeria}</div></section>` : '',
      videos: videosHtml ? `<section class="pub-section" aria-label="Vídeos"><div class="pub-section-head"><h2>Vídeo</h2></div><div class="pub-videos">${videosHtml}</div></section>` : '',
      fichaAnimal: (b.fichaAnimal && (p.animal || p.group)) ? ((p.isGroup || p.type === 'animal_grupo') ? this._bloqueGrupo(p.group || p.animal) : this._bloqueAnimal(p.animal)) : '',
      cta: ''
    };

    const cuerpo = [];
    let eventoPintado = false;
    orden.forEach(k => {
      if (k === 'cta') return; // el CTA final cierra la ficha
      if (secciones[k]) cuerpo.push(secciones[k]);
      if (k === 'fichaAnimal' && p.event) { cuerpo.push(this._bloqueEvento(p.event)); eventoPintado = true; }
    });
    if (p.event && !eventoPintado) cuerpo.push(this._bloqueEvento(p.event));

    const ctaFinal = cta
      ? `<div class="pub-cta pub-cta--final">${cta}<a class="pub-btn pub-btn--ghost" href="#/">Ver todas las publicaciones</a></div>`
      : '';

    return `
      <a class="pub-back" href="#/">← Todas las publicaciones</a>
      <article class="pub-detalle pub-detalle--${this.esc(plantilla)}">
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
        ${cuerpo.join('\n')}
        ${ctaFinal}
      </article>`;
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

  _bloqueGrupo(g) {
    if (!g) return '';
    const salud = g.health || {};
    const chipsSalud = [
      ['vaccinated', 'Vacunado'], ['dewormed', 'Desparasitado'], ['neutered', 'Esterilizado'],
      ['microchipped', 'Microchip'], ['specialNeeds', 'Necesidades especiales']
    ].map(([k, label]) => `<span class="pub-chip${salud[k] ? '' : ' pub-chip--off'}">${label}</span>`).join('');
    const temperamento = (g.temperament || []).map(t => `<span class="pub-chip">${this.esc(t)}</span>`).join('');
    const compat = g.compatibility || {};
    const adop = g.adoption || {};
    const acogida = g.foster || {};
    const loc = g.location || {};
    const contacto = g.contact || {};
    const filas = [];
    const push = (label, valor, html) => { if (valor || html) filas.push(`<dt>${label}</dt><dd>${html || this.esc(valor)}</dd>`); };
    const miembros = Array.isArray(g.members) ? g.members : [];

    push('Grupo', g.groupName || '');
    push('Miembros', miembros.length ? String(miembros.length) : '');
    push('Especie', g.species || '');
    push('Sexo', (g.sex || []).join(', '));
    push('Edad', (g.age && g.age.label) || '');
    const compatTexto = [
      compat.dogs ? 'Perros: ' + compat.dogs : '',
      compat.cats ? 'Gatos: ' + compat.cats : '',
      compat.kids ? 'Niños: ' + compat.kids : ''
    ].filter(Boolean).join(' · ');
    push('Compatibilidad', compatTexto);
    push('Adopción', [adop.mode, adop.feeEur ? adop.feeEur + ' €' : ''].filter(Boolean).join(' · '));
    push('Requisitos', adop.requirements);
    push('Acogida temporal', acogida.temporary ? ('Sí' + (acogida.durationLabel ? ' · ' + acogida.durationLabel : '')) : '');
    push('Ubicación', [loc.city, loc.province, loc.name].filter(Boolean).join(', '));
    push('Contacto', '', [
      contacto.email ? `<a href="mailto:${this.esc(contacto.email)}">${this.esc(contacto.email)}</a>` : '',
      contacto.phone ? `<a href="tel:${this.esc(String(contacto.phone).replace(/\s+/g, ''))}">${this.esc(contacto.phone)}</a>` : ''
    ].filter(Boolean).join(' · '));

    const listaMiembros = miembros.map(m => {
      const foto = this.urlSegura(m && m.foto);
      const info = [m && m.especie, m && m.raza, m && m.sexo, m && m.edad].filter(Boolean).join(' · ');
      return `<li class="pub-miembro">${foto ? `<img src="${this.esc(foto)}" alt="${this.esc((m && m.nombre) || '')}" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:8px;margin-right:8px;vertical-align:middle">` : ''}<div style="display:inline-block;vertical-align:middle"><b>${this.esc((m && m.nombre) || '')}</b>${info ? `<div class="pub-sub">${this.esc(info)}</div>` : ''}</div></li>`;
    }).join('');

    return `<section class="pub-bloque">
      <h2>Ficha del grupo (adopción conjunta)</h2>
      <dl class="pub-dl">${filas.join('')}</dl>
      ${listaMiembros ? `<h3 class="pub-subtitulo">Miembros</h3><ul style="list-style:none;padding:0;margin:0;display:grid;gap:8px">${listaMiembros}</ul>` : ''}
      <h3 class="pub-subtitulo">Salud del conjunto</h3>
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
    // Una ficha tiene una única canónica: su página estática del prerender.
    // Así el visor (hash) y la estática no compiten por el mismo contenido.
    // El listado y los estados usan la propia página.
    const esFicha = !!(pub && pub.slug);
    const canonica = meta.canonical
      ? (this.urlSegura(meta.canonical) || '')
      : (esFicha
        ? this.canonicaFicha(pub)
        : ((pub || typeof location === 'undefined') ? '' : location.origin + location.pathname));
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
    this._jsonLd(pub, canonica);
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

  _jsonLd(pub, canonica) {
    const previo = document.getElementById('pub-jsonld');
    if (previo) previo.remove();
    const data = this.jsonLd(pub);
    if (!data) return;
    // El `@id` debe ser la misma URL canónica que declara el documento.
    if (canonica) data.mainEntityOfPage = { '@type': 'WebPage', '@id': canonica };
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
