/**
 * GESTOR WEB · capa pública de contenido (admin)
 * ---------------------------------------------------------------------------
 * Sección "Web / Contenido público": cura qué se publica en la web
 * (animales, eventos e historias), con estado, completitud, media, CTA y
 * metadatos SEO de la publicación. Consume los endpoints `web-*`.
 *
 * La lógica pura (slug, completitud, parsers) vive aquí sin DOM para poder
 * testearla con `node --test`.
 */

const Web = {
  tab: 'animal',
  animales: [],
  eventos: [],
  resumen: null,
  error: '',
  _filtros: { q: '', estado: '' },
  _ultimoPreview: null,
  _mediaIgnorados: 0,

  // ==================== LÓGICA PURA ====================

  normalizarSlug(valor) {
    const mapa = { 'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a', 'å': 'a', 'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o', 'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ñ': 'n', 'ç': 'c' };
    let s = String(valor == null ? '' : valor).toLowerCase().replace(/[áàäâãåéèëêíìïîóòöôõúùüûñç]/g, c => mapa[c] || c);
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > 80) s = s.slice(0, 80).replace(/-+$/g, '');
    return s;
  },

  slugValido(slug) {
    return !!slug && slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  },

  /**
   * Campos que impiden publicar. Devuelve claves estables para pintar chips.
   * Para animales se combina con lo que ya calcula el backend (portada del
   * animal como respaldo), por eso se acepta `faltan` externo.
   */
  completitud(pub) {
    const p = pub || {};
    const media = p.media || {};
    const faltan = [];
    if (!String(p.titulo || '').trim()) faltan.push('titulo');
    if (!this.slugValido(this.normalizarSlug(p.slug))) faltan.push('slug');
    if (!String(p.categoria || '').trim()) faltan.push('categoria');
    if (String(p.contenido_html || '').trim().length < 40) faltan.push('contenido');
    if (!String((media.coverImage && media.coverImage.src) || p.foto || '').trim()) faltan.push('imagen');
    if (!String((p.seo && p.seo.metaDescription) || p.extracto || '').trim()) faltan.push('seo');
    return faltan;
  },

  /* Convierte texto multilínea en galería `{src,alt,order}`. */
  /**
   * Normaliza un enlace de media pegado en el gestor. Los enlaces de carpeta de
   * Drive se rechazan (no son una imagen y expondrían el listado); un fichero
   * de Drive pasa a thumbnail (imagen) o a vista del fichero (vídeo/documento).
   */
  normalizarMediaUrl(valor, tipo) {
    const s = String(valor == null ? '' : valor).trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return s; // ruta relativa (assets/…)
    if (!/^https?:\/\//i.test(s)) return '';       // data:, javascript:, …
    if (/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders|folderview)/i.test(s)) return '';
    const id = (s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || [])[1] || '';
    if (id) {
      if (tipo === 'video' || tipo === 'documento') return 'https://drive.google.com/file/d/' + id + '/view';
      return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (tipo === 'portada' ? 1200 : 1600);
    }
    return s;
  },

  /** Galería como texto editable: `url|alt|pie` por línea (retrocompatible). */
  mediaTextoGaleria(lista) {
    return (lista || [])
      .map(g => [g && g.src, g && g.alt, g && g.caption].map(x => String(x || '').trim()))
      .filter(p => p[0])
      .map(p => {
        while (p.length > 1 && !p[p.length - 1]) p.pop();
        return p.join('|');
      })
      .join('\n');
  },

  /** Ruta de la carpeta de la ficha dentro de la raíz de media. */
  _carpetaFicha(tipo, slug) {
    const carpeta = { animal: 'animales', evento: 'eventos', historia: 'historias' }[tipo] || 'publicaciones';
    return carpeta + '/' + (slug || 'sin-slug');
  },

  /* "url|alt|pie" por línea -> gallery[] (alt y pie opcionales). */
  parseGaleria(texto, altBase) {
    return String(texto || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map((linea, i) => {
        const partes = linea.split('|').map(x => String(x || '').trim());
        const src = partes[0] || '';
        const alt = partes[1] || '';
        const caption = partes.slice(2).join(' | ').trim();
        return { src, alt: alt || (altBase ? altBase + ' ' : 'Imagen ') + (i + 1), caption, order: i };
      })
      .filter(g => g.src);
  },

  /* "icono|etiqueta|valor" por línea -> icons[] */
  parseIconos(texto) {
    return String(texto || '')
      .split(/\r?\n/)
      .map(l => l.split('|').map(x => String(x || '').trim()))
      .filter(p => p.length >= 2 && (p[0] || p[1]))
      .map(p => ({ icon: p[0] || '', label: p[1] || '', value: p[2] || '' }));
  },

  /* "título|url" por línea -> videos[] */
  parseVideos(texto) {
    return String(texto || '')
      .split(/\r?\n/)
      .map(l => l.split('|').map(x => String(x || '').trim()))
      .filter(p => p.length >= 2 && p[1])
      .map(p => ({ title: p[0] || '', url: p[1], provider: /youtu/.test(p[1]) ? 'youtube' : (/vimeo/.test(p[1]) ? 'vimeo' : '') }));
  },

  /* "nombre|url" por línea -> documents[] (solo gestor; no se publican). */
  parseDocumentos(texto) {
    return String(texto || '')
      .split(/\r?\n/)
      .map(l => l.split('|').map(x => String(x || '').trim()))
      .filter(p => p.length >= 2 && p[1])
      .map(p => ({ name: p[0] || 'Documento', url: p[1] }));
  },

  /* Lista separada por comas. */
  parseLista(texto) {
    return String(texto || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
  },

  /** Meta título SEO: el guardado o, si está vacío, el propio título. */
  seoTitle(pub) {
    const p = pub || {};
    const meta = String((p.seo && p.seo.metaTitle) || '').trim();
    return meta || String(p.titulo || '').trim();
  },

  estadoLabel(estado) {
    const m = { publicado: 'Publicado', borrador: 'Borrador', oculto: 'Oculto', retirado: 'Retirado', sin_publicar: 'Sin publicar' };
    return m[estado] || 'Sin publicar';
  },

  estadoCls(estado) {
    const m = { publicado: 'aprobada', borrador: 'pendiente', oculto: 'descartada', retirado: 'descartada' };
    return m[estado] || '';
  },

  /** Animales que YA tienen publicación web (es lo único que se lista). */
  publicacionesAnimales(lista) {
    return (lista || []).filter(a => a && a.publicacion_id);
  },

  /** Animales sin publicación web: candidatos del selector "Nueva publicación". */
  animalesSinPublicacion(lista) {
    return (lista || []).filter(a => a && !a.publicacion_id);
  },

  // ==================== ACCIONES DE UI (desde Dashboard) ====================

  async render(el) {
    if (!el) return;
    if (typeof Dashboard !== 'undefined' && typeof Dashboard.puedeAccederPagina === 'function' && !Dashboard.puedeAccederPagina('web')) {
      Dashboard._sinPermisoPage(el);
      Dashboard.injectIcons();
      return;
    }
    el.innerHTML = (typeof Dashboard !== 'undefined' && Dashboard._pageSkeleton) ? Dashboard._pageSkeleton('web') : '';
    await this.cargar();
    el.innerHTML = this._html();
    if (typeof Dashboard !== 'undefined' && Dashboard.injectIcons) Dashboard.injectIcons();
  },

  async cargar() {
    this.error = '';
    try {
      const [resumen, animales, eventos] = await Promise.all([
        API.getWebResumen(),
        API.getWebAnimales({ pageSize: 200 }),
        API.getWebEventos()
      ]);
      this.resumen = resumen.data || null;
      this.animales = animales.data || [];
      this.eventos = eventos.data || [];
    } catch (err) {
      this.error = (typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : String((err && err.message) || err);
      this.animales = [];
      this.eventos = [];
    }
  },

  _html() {
    if (this.error) {
      const sinHoja = /sin configurar|no configurado/i.test(this.error);
      return `<div class="empty-state empty-state-illustrated">
        <div class="empty-state-icon">${Icons.alertTriangle}</div>
        <h3>${sinHoja ? 'Gestor web sin activar' : 'No se pudo cargar el gestor web'}</h3>
        <p>${this._esc(sinHoja ? 'Falta la hoja de publicaciones en el backend. Créala y configura SHEET_WEB_PUBLICACIONES_ID; después vuelve a entrar.' : this.error)}</p>
        ${sinHoja && this.error ? `<p class="web-sub">${this._esc(this.error)}</p>` : ''}
        <button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" data-action="loadPage" data-arg0="web">Reintentar</button>
      </div>`;
    }
    return `<div class="page-list-container">
      ${this._statsHtml()}
      <div class="web-tabs" role="tablist" aria-label="Contenido publicable">
        <button type="button" role="tab" class="web-tab ${this.tab === 'animal' ? 'active' : ''}" aria-selected="${this.tab === 'animal'}" data-action="cambiarTabWeb" data-arg0="animal">Animales</button>
        <button type="button" role="tab" class="web-tab ${this.tab === 'evento' ? 'active' : ''}" aria-selected="${this.tab === 'evento'}" data-action="cambiarTabWeb" data-arg0="evento">Eventos e historias</button>
      </div>
      <div class="filters-bar">
        <div class="search-box"><span class="search-icon" aria-hidden="true"></span><input type="text" aria-label="Buscar publicación" placeholder="Buscar por título, slug o nombre..." value="${this._esc(this._filtros.q)}" data-input="onWebSearch"></div>
        <div class="filter-row">
          <select aria-label="Filtrar por estado de publicación" data-change="onWebEstadoFilter" data-cpass="value">
            <option value="">Todos los estados</option>
            ${['publicado', 'borrador', 'oculto', 'retirado'].map(e => `<option value="${e}" ${this._filtros.estado === e ? 'selected' : ''}>${this.estadoLabel(e)}</option>`).join('')}
          </select>
          <div class="web-acciones">
            ${this.tab === 'animal'
              ? `<button type="button" class="btn btn-primary btn-sm" data-action="nuevaPublicacionWeb">${Icons.plus} Nueva publicación</button>`
              : `<button type="button" class="btn btn-primary btn-sm" data-action="abrirEventoWeb">${Icons.plus} Nuevo evento/historia</button>`}
            <button type="button" class="btn btn-outline-green btn-sm" data-action="recargarWeb">${Icons.refresh} Actualizar</button>
            <a class="btn btn-outline-green btn-sm" href="publico.html" target="_blank" rel="noopener">${Icons.eye} Ver web pública</a>
          </div>
        </div>
      </div>
      ${this._avisoPublicados()}
      <div id="web-listado" class="web-lista">${this._tabla()}</div>
      <p class="web-nota">Los campos SEO son los metadatos que la web pública usará al renderizar cada ficha (title, description, canonical, robots, OG). La previsualización muestra exactamente el payload que entregará el canal público.</p>
    </div>
    <div class="page-detail-container"></div>`;
  },

  /** Aviso cuando nada está visible en la web: explica el siguiente paso. */
  _avisoPublicados() {
    const t = (this.resumen && this.resumen.totales) || {};
    if (Number(t.publicados) > 0) return '';
    return `<div class="web-aviso"><span aria-hidden="true">ℹ️</span><span>Todavía no hay nada visible en la web. Pulsa <b>Nueva publicación</b> para elegir un animal (o crea un evento) y publica para que aparezca en <a href="publico.html" target="_blank" rel="noopener">la web pública</a>.</span></div>`;
  },

  _statsHtml() {
    const t = (this.resumen && this.resumen.totales) || {};
    const card = (label, valor, icono, extra) => `<div class="stat-card"><div class="stat-card-icon green">${icono}</div><div class="stat-card-info"><div class="stat-card-label">${label}</div><div class="stat-card-value">${Number(valor) || 0}</div>${extra ? `<div class="stat-card-change">${extra}</div>` : ''}</div></div>`;
    return `<div class="stats-grid web-stats" style="margin-bottom:16px">
      ${card('Publicados', t.publicados, Icons.checkCircle, 'Visibles en la web')}
      ${card('Borradores', t.borradores, Icons.fileText, 'Sin publicar todavía')}
      ${card('Ocultos', t.ocultos, Icons.eye, 'Fuera de la web temporalmente')}
      ${card('Retiradas', t.retirados, Icons.trash, 'Enlace retirado (410)')}
      ${card('Sin configurar', t.sin_publicar, Icons.alertTriangle, 'Animales sin ficha web')}
      ${card('Incompletos', t.incompletas, Icons.alertTriangle, (Number(t.sin_seo) || 0) + ' sin SEO/descripción')}
    </div>`;
  },

  _tabla() {
    const q = this._filtros.q.toLowerCase();
    if (this.tab === 'animal') {
      // Solo publicaciones web: las fichas internas no se listan. Para crear una
      // nueva se usa el selector ("Nueva publicación"), que muestra los animales
      // que todavía no tienen publicación.
      const filas = this.publicacionesAnimales(this.animales).filter(a => {
        if (this._filtros.estado && a.estado_publicacion !== this._filtros.estado) return false;
        if (!q) return true;
        return ((a.nombre || '') + ' ' + (a.titulo || '') + ' ' + (a.slug || '') + ' ' + (a.especie || '')).toLowerCase().includes(q);
      });
      if (!filas.length) return this._sinPublicaciones();
      return `<div class="card"><div class="card-body-flush"><table class="data-table web-tabla"><thead><tr><th scope="col">Animal</th><th scope="col">Estado web</th><th scope="col">Slug</th><th scope="col">Completitud</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${filas.map(a => this._filaAnimal(a)).join('')}</tbody></table></div></div>`;
    }
    const filas = this.eventos.filter(e => {
      if (this._filtros.estado && e.estado_publicacion !== this._filtros.estado) return false;
      if (!q) return true;
      return ((e.titulo || '') + ' ' + (e.slug || '') + ' ' + (e.categoria || '')).toLowerCase().includes(q);
    });
    if (!filas.length) return this._vacio('No hay eventos ni historias', 'Crea el primero con el botón "Nuevo evento/historia".');
    return `<div class="card"><div class="card-body-flush"><table class="data-table web-tabla"><thead><tr><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col">Estado web</th><th scope="col">Slug</th><th scope="col">Completitud</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${filas.map(e => this._filaEvento(e)).join('')}</tbody></table></div></div>`;
  },

  _filaAnimal(a) {
    const faltan = (a.completitud && a.completitud.faltan) || [];
    return `<tr>
      <td data-label="Animal"><b>${this._esc(a.nombre || '—')}</b><div class="web-sub">${this._esc(a.especie || '')}</div></td>
      <td data-label="Estado web"><span class="estado-badge ${this.estadoCls(a.estado_publicacion)}">${this._esc(this.estadoLabel(a.estado_publicacion))}</span>${a.featured ? ' <span class="chip-neutral">Destacado</span>' : ''}</td>
      <td data-label="Slug">${a.slug ? `<code>${this._esc(a.slug)}</code>` : '<span class="web-sub">sin slug</span>'}</td>
      <td data-label="Completitud">${this._chips(faltan)}</td>
      <td data-label="Acciones" class="table-actions">
        <button type="button" class="btn btn-outline-green btn-sm" data-action="abrirAnimalWeb" data-arg0="${this._esc(a.animal_id)}">${Icons.pencil} ${a.publicacion_id ? 'Editar' : 'Configurar'}</button>
        ${a.publicacion_id ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="previewWeb" data-arg0="animal" data-arg1="${this._esc(a.animal_id)}">${Icons.eye} Preview</button>` : ''}
        ${a.estado_publicacion === 'publicado' && a.slug ? `<a class="btn btn-outline-green btn-sm" href="publico.html#/publicacion/${encodeURIComponent(a.slug)}" target="_blank" rel="noopener">${Icons.eye} Ver ficha</a>` : ''}
        ${a.publicacion_id
          ? (a.estado_publicacion === 'publicado'
            ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="cambiarEstadoWeb" data-arg0="animal" data-arg1="${this._esc(a.animal_id)}" data-arg2="oculto">Ocultar</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-action="cambiarEstadoWeb" data-arg0="animal" data-arg1="${this._esc(a.animal_id)}" data-arg2="publicado">Publicar</button>`)
          : ''}
        ${a.publicacion_id && a.estado_publicacion !== 'publicado' && a.estado_publicacion !== 'retirado'
          ? `<button type="button" class="btn btn-danger btn-sm" data-action="eliminarWebAnimal" data-arg0="${this._esc(a.animal_id)}" data-arg1="${this._esc(a.nombre || '')}" title="Eliminar publicación web (solo configuración, la ficha del animal no se modifica)">${Icons.trash} Eliminar borrador</button>`
          : ''}
      </td>
    </tr>`;
  },

  _filaEvento(e) {
    const faltan = (e.completitud && e.completitud.faltan) || [];
    return `<tr>
      <td data-label="Título"><b>${this._esc(e.titulo || '—')}</b><div class="web-sub">${this._esc(e.categoria || '')}</div></td>
      <td data-label="Tipo"><span class="chip-neutral">${this._esc(e.tipo === 'historia' ? 'Historia' : 'Evento')}</span></td>
      <td data-label="Estado web"><span class="estado-badge ${this.estadoCls(e.estado_publicacion)}">${this._esc(this.estadoLabel(e.estado_publicacion))}</span></td>
      <td data-label="Slug">${e.slug ? `<code>${this._esc(e.slug)}</code>` : '<span class="web-sub">sin slug</span>'}</td>
      <td data-label="Completitud">${this._chips(faltan)}</td>
      <td data-label="Acciones" class="table-actions">
        ${e.estado_publicacion === 'retirado'
          ? `<span class="web-sub">Enlace retirado (410); el slug sigue reservado</span>
        <button type="button" class="btn btn-outline-green btn-sm" data-action="restaurarWebEvento" data-arg0="${this._esc(e.id)}" data-arg1="${this._esc(e.titulo || '')}">Restaurar</button>`
          : `<button type="button" class="btn btn-outline-green btn-sm" data-action="abrirEventoWeb" data-arg0="${this._esc(e.id)}">${Icons.pencil} Editar</button>
        <button type="button" class="btn btn-outline-green btn-sm" data-action="previewWeb" data-arg0="evento" data-arg1="${this._esc(e.id)}">${Icons.eye} Preview</button>
        ${e.estado_publicacion === 'publicado' && e.slug ? `<a class="btn btn-outline-green btn-sm" href="publico.html#/publicacion/${encodeURIComponent(e.slug)}" target="_blank" rel="noopener">${Icons.eye} Ver ficha</a>` : ''}
        ${e.estado_publicacion === 'publicado'
          ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="cambiarEstadoWeb" data-arg0="evento" data-arg1="${this._esc(e.id)}" data-arg2="oculto">Ocultar</button>`
          : `<button type="button" class="btn btn-primary btn-sm" data-action="cambiarEstadoWeb" data-arg0="evento" data-arg1="${this._esc(e.id)}" data-arg2="publicado">Publicar</button>`}
        <button type="button" class="btn btn-danger btn-sm" data-action="archivarWeb" data-arg0="${this._esc(e.id)}" aria-label="Retirar ${this._esc(e.titulo || 'publicaciA3n')}" title="Retirar (410)">${Icons.trash}</button>`}}
      </td>
    </tr>`;
  },

  _chips(faltan) {
    const labels = { titulo: 'Título', slug: 'Slug', categoria: 'Categoría', contenido: 'Descripción', imagen: 'Imagen', seo: 'SEO', publicacion: 'Sin configurar' };
    if (!faltan || !faltan.length) return `<span class="estado-badge aprobada">Completa</span>`;
    return faltan.map(f => `<span class="web-chip-missing">${this._esc(labels[f] || f)}</span>`).join(' ');
  },

  _vacio(titulo, texto) {
    return `<div class="empty-state empty-state-illustrated"><div class="empty-state-icon">${Icons.eye}</div><h3>${this._esc(titulo)}</h3><p>${this._esc(texto)}</p></div>`;
  },

  /** Listado de animales vacío: no hay publicaciones (las internas no se listan). */
  _sinPublicaciones() {
    const n = this.animalesSinPublicacion(this.animales).length;
    return `<div class="empty-state empty-state-illustrated">
      <div class="empty-state-icon">${Icons.eye}</div>
      <h3>Sin publicaciones de animales</h3>
      <p>${n ? `Hay ${n} animal${n === 1 ? '' : 'es'} sin publicación web. Elige cuál publicar.` : 'Cuando des de alta un animal podrás crear su publicación web desde aquí.'}</p>
      ${n ? `<button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" data-action="nuevaPublicacionWeb">${Icons.plus} Nueva publicación</button>` : ''}
    </div>`;
  },

  _esc(str) {
    if (typeof Dashboard !== 'undefined' && Dashboard._esc) return Dashboard._esc(str);
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _snack(msg, tipo) {
    if (typeof Dashboard !== 'undefined' && Dashboard.showSnackbar) Dashboard.showSnackbar(msg, tipo || 'success');
  },

  _snackErr(err, msg) {
    if (typeof Dashboard !== 'undefined' && Dashboard._snackErr) Dashboard._snackErr(err, msg);
    else this._snack(msg, 'error');
  },

  // ==================== FILTROS / NAVEGACIÓN ====================

  cambiarTab(tab) {
    this.tab = tab === 'evento' ? 'evento' : 'animal';
    this._filtros.estado = '';
    const el = document.getElementById('page-web');
    if (el) el.innerHTML = this._html();
    if (typeof Dashboard !== 'undefined' && Dashboard.injectIcons) Dashboard.injectIcons();
  },

  buscar(q) {
    this._filtros.q = String(q || '');
    const c = document.getElementById('web-listado');
    if (c) c.innerHTML = this._tabla();
  },

  filtrarEstado(estado) {
    this._filtros.estado = String(estado || '');
    const c = document.getElementById('web-listado');
    if (c) c.innerHTML = this._tabla();
  },

  // ==================== NUEVA PUBLICACIÓN (selector) ====================

  nuevaPublicacion() {
    // El panel de la página se anima con transform: eso rompería position:fixed.
    // El selector vive en <body> (uno solo) para cubrir la pantalla completa.
    let host = document.getElementById('web-picker');
    if (!host) {
      host = document.createElement('div');
      host.id = 'web-picker';
      host.className = 'web-picker';
      document.body.appendChild(host);
    }
    this._pickerQ = '';
    host.innerHTML = this._pickerHtml();
    host.hidden = false;
    document.body.classList.add('web-picker-abierto');
    this._pickerEsc = this._pickerEsc || ((ev) => { if (ev.key === 'Escape') this.cerrarPicker(); });
    document.addEventListener('keydown', this._pickerEsc);
    const input = host.querySelector('input');
    if (input && typeof input.focus === 'function') input.focus();
  },

  cerrarPicker() {
    const host = document.getElementById('web-picker');
    if (host) { host.hidden = true; host.innerHTML = ''; }
    document.body.classList.remove('web-picker-abierto');
    if (this._pickerEsc) {
      document.removeEventListener('keydown', this._pickerEsc);
      this._pickerEsc = null;
    }
  },

  filtrarPicker(q) {
    this._pickerQ = String(q || '');
    const lista = document.getElementById('web-picker-lista');
    if (lista) lista.innerHTML = this._pickerLista();
  },

  _pickerHtml() {
    const total = this.animalesSinPublicacion(this.animales).length;
    const cerrar = (typeof Icons !== 'undefined' && Icons.x) ? Icons.x : '✕';
    return `<div class="web-picker-overlay" data-action="cerrarPickerWeb" aria-hidden="true"></div>
      <div class="web-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="web-picker-titulo">
        <div class="web-picker-head">
          <div>
            <h2 id="web-picker-titulo">Nueva publicación</h2>
            <p class="web-sub">Solo animales sin publicación web (${total}). La ficha interna del animal no se expone.</p>
          </div>
          <button type="button" class="btn btn-outline-green btn-sm" data-action="cerrarPickerWeb" aria-label="Cerrar">${cerrar}</button>
        </div>
        <div class="search-box"><span class="search-icon" aria-hidden="true"></span><input type="search" aria-label="Buscar animal sin publicación" placeholder="Buscar por nombre o especie..." data-input="onPickerWebBuscar"></div>
        <div id="web-picker-lista" class="web-picker-lista">${this._pickerLista()}</div>
      </div>`;
  },

  /** Lista de candidatos del selector (solo animales sin publicación). */
  _pickerLista() {
    const q = String(this._pickerQ || '').toLowerCase();
    const libres = this.animalesSinPublicacion(this.animales).filter(a => {
      if (!q) return true;
      return ((a.nombre || '') + ' ' + (a.especie || '') + ' ' + (a.raza || '')).toLowerCase().includes(q);
    });
    if (!libres.length) {
      return `<p class="web-picker-vacio">${q ? 'Ningún animal sin publicar coincide con la búsqueda.' : 'No quedan animales sin publicación web.'}</p>`;
    }
    return libres.map(a => `<div class="web-picker-item">
        <div class="web-picker-datos">
          <b>${this._esc(a.nombre || '—')}</b>
          <span class="web-sub">${this._esc([a.especie, a.estado].filter(Boolean).join(' · '))}</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="crearPublicacionWeb" data-arg0="${this._esc(a.animal_id)}">Crear publicación</button>
      </div>`).join('');
  },

  async crearPublicacion(animalId) {
    this.cerrarPicker();
    return this.abrirAnimal(animalId);
  },

  async recargar() {
    const el = document.getElementById('page-web');
    if (el) {
      el.innerHTML = (typeof Dashboard !== 'undefined' && Dashboard._pageSkeleton) ? Dashboard._pageSkeleton('web') : '';
      await this.cargar();
      el.innerHTML = this._html();
      if (typeof Dashboard !== 'undefined' && Dashboard.injectIcons) Dashboard.injectIcons();
    }
  },

  // ==================== FORMULARIO: ANIMAL ====================

  async abrirAnimal(animalId) {
    try {
      const res = await API.getWebAnimal(animalId);
      const d = res.data || {};
      const origen = res.origen || {};
      const faltan = (res.completitud && res.completitud.faltan) ? res.completitud.faltan.map(f => f.campo) : [];
      this._mostrarFormAnimal(d, origen, faltan);
    } catch (err) {
      this._snackErr(err, 'No se pudo abrir la publicación web');
    }
  },

  _mostrarFormAnimal(d, origen, faltan) {
    const media = d.media || {};
    const seo = d.seo || {};
    const animal = d.animal || {};
    const cover = media.coverImage || {};
    const gallery = Array.isArray(media.gallery) ? media.gallery : [];
    const icons = Array.isArray(media.icons) ? media.icons : [];
    const videos = Array.isArray(media.videos) ? media.videos : [];
    const documents = Array.isArray(media.documents) ? media.documents : [];
    const docsTexto = documents.map(x => (x.name || '') + '|' + (x.url || '')).join('\n');
    const carpetaFicha = this._carpetaFicha(d.tipo || 'animal', d.slug);
    const cta = d.cta || {};
    const compat = animal.compatibility || {};
    const adop = animal.adoption || {};
    const foster = animal.foster || {};
    const loc = animal.location || {};
    const contacto = animal.contact || {};
    const health = animal.health || {};
    this._webFichaForm = d.ficha || d.ficha_json || null;
    const FC = typeof FichaConfig !== 'undefined' ? FichaConfig : null;
    const fichaNorm = FC && typeof FC.normalizarFicha === 'function' ? FC.normalizarFicha(this._webFichaForm) : this._webFichaForm;
    const fichaTxt = fichaNorm && typeof fichaNorm === 'object'
      ? JSON.stringify(fichaNorm, null, 2)
      : (typeof fichaNorm === 'string' ? fichaNorm : '');

    const html = `<form data-submit="saveWebAnimal" data-sarg0="${this._esc(d.origen_id || origen.id || '')}">
      <p class="web-nota">Ficha pública de <b>${this._esc(origen.nombre || '')}</b>. La ficha interna del animal no se expone: solo lo que rellenes aquí.</p>
      <div class="form-row">
        <div class="form-group"><label for="web-estado">Estado de publicación *</label>
          <select id="web-estado" class="form-input">
            ${['borrador', 'publicado', 'oculto'].map(e => `<option value="${e}" ${(d.estado_publicacion || 'borrador') === e ? 'selected' : ''}>${this.estadoLabel(e)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="web-slug">Slug *</label>
          <input type="text" id="web-slug" class="form-input" value="${this._esc(d.slug || '')}" placeholder="luna-en-adopcion" data-change="onWebSlugChange" data-cpass="el" data-carg0="${this._esc(d.id || '')}" data-carg1="animal">
          <p id="web-slug-hint" class="web-slug-hint"></p>${this.historialSlugHtml(d.slug_historial)}</div>
      </div>
      <div class="form-group"><label for="web-titulo">Título público *</label><input type="text" id="web-titulo" class="form-input" value="${this._esc(d.titulo || origen.nombre || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label for="web-categoria">Categoría pública *</label>
          <select id="web-categoria" class="form-input">
            <option value="">Seleccionar...</option>
            ${['Gatos en adopción', 'Perros en adopción', 'Acogidas', 'Adoptados', 'Caso externo', 'Eventos', 'Historias'].map(c => `<option ${d.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="web-estado-publico">Estado público *</label>
          <select id="web-estado-publico" class="form-input">
            ${['en_adopcion', 'en_acogida', 'adoptado', 'reservado', 'urgente', 'cerrado'].map(e => `<option value="${e}" ${(d.estado_publico || origen.estado) === e ? 'selected' : ''}>${e.replace(/_/g, ' ')}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label for="web-extracto">Extracto</label><textarea id="web-extracto" class="form-input" rows="2" placeholder="Resumen corto para listados y buscador">${this._esc(d.extracto || '')}</textarea></div>
      <div class="form-group"><label for="web-contenido">Descripción pública * (admite HTML)</label><textarea id="web-contenido" class="form-input" rows="6" placeholder="<p>Texto de la ficha pública...</p>">${this._esc(d.contenido_html || '')}</textarea></div>

      <details class="detail-collapse" ${cover.src ? '' : 'open'}><summary>${Icons.fileText} Media (portada, galería, vídeos, iconos)</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="web-cover">Portada (URL)</label><input type="text" id="web-cover" class="form-input" value="${this._esc(cover.src || '')}" placeholder="https://..."></div>
            <div class="form-group"><label for="web-cover-alt">Texto alternativo</label><input type="text" id="web-cover-alt" class="form-input" value="${this._esc(cover.alt || '')}"></div>
          </div>
          <div class="form-group"><label for="web-galeria">Galería (url|alt|pie por línea; alt y pie opcionales)</label><textarea id="web-galeria" class="form-input" rows="3">${this._esc(this.mediaTextoGaleria(gallery))}</textarea></div>
          <div class="form-group"><label for="web-videos">Vídeos (título|url por línea)</label><textarea id="web-videos" class="form-input" rows="2">${this._esc(videos.map(v => (v.title || '') + '|' + (v.url || '')).join('\n'))}</textarea></div>
          <div class="form-group"><label for="web-iconos">Iconos (icono|etiqueta|valor por línea)</label><textarea id="web-iconos" class="form-input" rows="2" placeholder="vacuna|Vacunado|Sí">${this._esc(icons.map(i => (i.icon || '') + '|' + (i.label || '') + '|' + (i.value || '')).join('\n'))}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label for="web-file-portada">Subir portada</label><input type="file" id="web-file-portada" class="form-input" accept="image/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="portada" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
            <div class="form-group"><label for="web-file-galeria">Subir a la galería</label><input type="file" id="web-file-galeria" class="form-input" accept="image/*" multiple data-change="subirMediaWeb" data-cpass="el" data-carg0="galeria" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="web-file-video">Subir vídeo</label><input type="file" id="web-file-video" class="form-input" accept="video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="video" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
            <div class="form-group"><label for="web-file-doc">Subir documento</label><input type="file" id="web-file-doc" class="form-input" accept="application/pdf,image/*,video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="documento" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
          </div>
          <div class="form-group"><label for="web-docs">Documentos de la ficha (nombre|url por línea)</label><textarea id="web-docs" class="form-input" rows="2">${this._esc(docsTexto)}</textarea></div>
          <p class="web-nota">Los archivos se guardan en Drive, en la carpeta «${this._esc(carpetaFicha)}». Se comparten las imágenes y los vídeos (los usa la web), no la carpeta; los documentos quedan privados. La portada, la galería y los vídeos se enlazan solos. Los enlaces de carpeta de Drive se ignoran: pega el enlace del archivo.${d.id ? '' : ' Guarda la publicación para poder subir archivos.'}</p>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.paw} Ficha pública del animal</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="web-size">Tamaño</label><input type="text" id="web-size" class="form-input" value="${this._esc(animal.size || '')}" placeholder="pequeño / mediano / grande"></div>
            <div class="form-group"><label for="web-color">Color</label><input type="text" id="web-color" class="form-input" value="${this._esc(animal.color || '')}"></div>
          </div>
          <div class="form-group"><label for="web-temperamento">Temperamento (separado por comas)</label><input type="text" id="web-temperamento" class="form-input" value="${this._esc((animal.temperament || []).join(', '))}"></div>
          <div class="form-row">
            <div class="form-group"><label for="web-compat-perros">Compatibilidad con perros</label><input type="text" id="web-compat-perros" class="form-input" value="${this._esc(compat.dogs || '')}"></div>
            <div class="form-group"><label for="web-compat-gatos">Compatibilidad con gatos</label><input type="text" id="web-compat-gatos" class="form-input" value="${this._esc(compat.cats || '')}"></div>
            <div class="form-group"><label for="web-compat-ninos">Compatibilidad con niños</label><input type="text" id="web-compat-ninos" class="form-input" value="${this._esc(compat.kids || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="web-adop-mode">Modalidad de adopción</label><input type="text" id="web-adop-mode" class="form-input" value="${this._esc(adop.mode || '')}" placeholder="presencial / a distancia"></div>
            <div class="form-group"><label for="web-adop-fee">Tasa (€)</label><input type="text" id="web-adop-fee" class="form-input" value="${this._esc(adop.feeEur == null ? '' : adop.feeEur)}" inputmode="decimal"></div>
          </div>
          <div class="form-group"><label for="web-adop-req">Requisitos de adopción</label><textarea id="web-adop-req" class="form-input" rows="2">${this._esc(adop.requirements || '')}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label for="web-foster-temp">Acogida temporal</label>
              <select id="web-foster-temp" class="form-input"><option value="no" ${foster.temporary ? '' : 'selected'}>No</option><option value="si" ${foster.temporary ? 'selected' : ''}>Sí</option></select></div>
            <div class="form-group"><label for="web-foster-dur">Duración de la acogida</label><input type="text" id="web-foster-dur" class="form-input" value="${this._esc(foster.durationLabel || '')}" placeholder="Ej: 3 meses"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="web-loc-city">Ciudad</label><input type="text" id="web-loc-city" class="form-input" value="${this._esc(loc.city || '')}"></div>
            <div class="form-group"><label for="web-loc-prov">Provincia</label><input type="text" id="web-loc-prov" class="form-input" value="${this._esc(loc.province || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="web-contact-email">Email de contacto</label><input type="email" id="web-contact-email" class="form-input" value="${this._esc(contacto.email || '')}"></div>
            <div class="form-group"><label for="web-contact-tel">Teléfono de contacto</label><input type="text" id="web-contact-tel" class="form-input" value="${this._esc(contacto.phone || '')}"></div>
          </div>
          <div class="form-group"><label><input type="checkbox" id="web-special-needs" ${health.specialNeeds ? 'checked' : ''}> Necesidades especiales</label></div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} Configuración de ficha (avanzado, C3)</summary>
        <div class="detail-collapse-body">
          <div class="form-group"><label for="web-ficha-json">Ficha configurable (JSON)</label><textarea id="web-ficha-json" class="form-input" rows="6" placeholder='{"plantilla":"ficha","bloques":{"datos":true}}'>${this._esc(fichaTxt)}</textarea><p class="web-slug-hint">Opcional (propuesta C3). Define plantilla/bloques/lectura; se aplica en detalle/prerender y nunca en listados. Déjalo vacío para usar el comportamiento actual.</p></div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.search} CTA y SEO de la publicación</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="web-cta-label">CTA · etiqueta</label><input type="text" id="web-cta-label" class="form-input" value="${this._esc(cta.label || '')}" placeholder="Quiero adoptar"></div>
            <div class="form-group"><label for="web-cta-url">CTA · URL</label><input type="text" id="web-cta-url" class="form-input" value="${this._esc(cta.url || '')}" placeholder="https://..."></div>
          </div>
          <div class="form-group"><label for="web-seo-title">Meta title</label><input type="text" id="web-seo-title" class="form-input" value="${this._esc(this.seoTitle(d))}"><p class="web-slug-hint">Si lo dejas así, se usa el título público.</p></div>
          <div class="form-group"><label for="web-seo-desc">Meta description</label><textarea id="web-seo-desc" class="form-input" rows="2">${this._esc(seo.metaDescription || '')}</textarea><p class="web-slug-hint">Si la dejas vacía se usa el extracto.</p></div>
          <p class="web-nota">El canonical (dominio + ruta), la imagen OG (la portada) y los robots (según «Indexable») se generan solos.</p>
          <div class="form-row">
            <div class="form-group"><label><input type="checkbox" id="web-indexable" ${d.indexable !== false ? 'checked' : ''}> Indexable (aparece en sitemap)</label></div>
            <div class="form-group"><label><input type="checkbox" id="web-listed" ${d.listed !== false ? 'checked' : ''}> Visible en listados</label></div>
            <div class="form-group"><label><input type="checkbox" id="web-featured" ${d.featured ? 'checked' : ''}> Destacado</label></div>
            <div class="form-group"><label for="web-orden">Orden</label><input type="number" id="web-orden" class="form-input" value="${Number(d.orden) || 0}"></div>
          </div>
        </div>
      </details>

      ${faltan.length ? `<p class="web-nota">Pendiente para publicar: ${faltan.map(f => this._esc(f)).join(', ')}.</p>` : ''}
      <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar publicación</button></div>
    </form>`;
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) Dashboard.showFormModal('Publicación web · ' + (origen.nombre || 'Animal'), html);
  },

  _leerFormAnimal() {
    const v = id => document.getElementById(id);
    const txt = id => (v(id) ? String(v(id).value || '').trim() : '');
    const checked = id => !!(v(id) && v(id).checked);
    const alt = txt('web-cover-alt') || txt('web-titulo');
    this._mediaIgnorados = 0;
    const norm = (valor, tipo) => {
      const url = this.normalizarMediaUrl(valor, tipo);
      if (!url && String(valor || '').trim()) this._mediaIgnorados += 1;
      return url;
    };
    const galeria = this.parseGaleria(v('web-galeria') ? v('web-galeria').value : '', alt)
      .map(g => Object.assign({}, g, { src: norm(g.src, 'galeria') })).filter(g => g.src);
    const videos = this.parseVideos(v('web-videos') ? v('web-videos').value : '')
      .map(vid => Object.assign({}, vid, { url: norm(vid.url, 'video') })).filter(vid => vid.url);
    const documentos = this.parseDocumentos(v('web-docs') ? v('web-docs').value : '')
      .map(doc => Object.assign({}, doc, { url: norm(doc.url, 'documento') })).filter(doc => doc.url);
    const data = {
      estado_publicacion: txt('web-estado') || 'borrador',
      slug: this.normalizarSlug(txt('web-slug') || txt('web-titulo')),
      titulo: txt('web-titulo'),
      categoria: txt('web-categoria'),
      estado_publico: txt('web-estado-publico'),
      extracto: txt('web-extracto'),
      contenido_html: v('web-contenido') ? v('web-contenido').value : '',
      indexable: checked('web-indexable'),
      listed: checked('web-listed'),
      featured: checked('web-featured'),
      orden: Number(txt('web-orden')) || 0,
      media: {
        coverImage: { src: norm(txt('web-cover'), 'portada'), alt },
        gallery: galeria,
        videos: videos,
        icons: this.parseIconos(v('web-iconos') ? v('web-iconos').value : ''),
        documents: documentos
      },
      cta: txt('web-cta-label') && txt('web-cta-url') ? { label: txt('web-cta-label'), url: txt('web-cta-url') } : null,
      // Solo lo editable: canonical, OG y robots los deriva el backend.
      seo: {
        metaTitle: txt('web-seo-title'),
        metaDescription: txt('web-seo-desc')
      },
      animal: {
        size: txt('web-size'),
        color: txt('web-color'),
        temperament: this.parseLista(txt('web-temperamento')),
        compatibility: { dogs: txt('web-compat-perros'), cats: txt('web-compat-gatos'), kids: txt('web-compat-ninos') },
        adoption: { mode: txt('web-adop-mode'), feeEur: txt('web-adop-fee'), requirements: txt('web-adop-req') },
        foster: { temporary: txt('web-foster-temp') === 'si', durationLabel: txt('web-foster-dur') },
        location: { city: txt('web-loc-city'), province: txt('web-loc-prov') },
        contact: { email: txt('web-contact-email'), phone: txt('web-contact-tel') },
        health: { specialNeeds: checked('web-special-needs') }
      }
    };
    const ficha = this._leerFichaForm('web-ficha-json');
    if (ficha) data.ficha = ficha;
    return data;
  },

  _leerFichaForm(id) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const raw = String(el.value || '').trim();
    if (!raw) return undefined; // vacío: no enviar (preserva estado servidor)
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
      const FC = typeof FichaConfig !== 'undefined' ? FichaConfig : null;
      if (FC && typeof FC.normalizarFicha === 'function') {
        const n = FC.normalizarFicha(parsed);
        return n || undefined;
      }
      return parsed;
    } catch (e) { /* inválido: ignorar para no romper guardado */ }
    return undefined;
  },

  _leerArchivoBase64(file) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result || ''));
      lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
      lector.readAsDataURL(file);
    });
  },

  _campoMedia(tipo, prefijo) {
    const campos = { portada: prefijo + '-cover', galeria: prefijo + '-galeria', video: prefijo + '-videos', documento: prefijo + '-docs' };
    return campos[tipo] || '';
  },

  /** Añade el resultado de una subida al campo de texto correspondiente. */
  _anadirMedia(campo, tipo, d, nombreOriginal, prefijo) {
    if (!campo) return;
    if (tipo === 'portada') {
      campo.value = d.url || '';
      const alt = document.getElementById(prefijo + '-cover-alt');
      if (alt && !String(alt.value || '').trim()) alt.value = String(nombreOriginal || '').replace(/\.[^.]+$/, '');
      return;
    }
    if (tipo === 'galeria') {
      campo.value = [campo.value, d.url].filter(Boolean).join('\n');
      return;
    }
    if (tipo === 'video') {
      const titulo = String(nombreOriginal || d.nombre || 'Vídeo').replace(/\.[^.]+$/, '');
      campo.value = [campo.value, titulo + '|' + (d.url || '')].filter(Boolean).join('\n');
      return;
    }
    campo.value = [campo.value, (d.nombre || nombreOriginal || 'Documento') + '|' + (d.url || '')].filter(Boolean).join('\n');
  },

  /** Sube los archivos elegidos a la carpeta de la ficha y rellena el campo. */
  async subirMediaWeb(el, tipo, prefijo, publicacionId) {
    const files = Array.from((el && el.files) || []);
    if (!files.length) return;
    const campo = document.getElementById(this._campoMedia(tipo, prefijo));
    if (el) el.value = '';
    if (!publicacionId) { this._snack('Guarda la publicación antes de subir archivos', 'warning'); return; }
    if (!campo) { this._snack('No se encontró el campo de destino', 'error'); return; }
    this._snack('Subiendo ' + files.length + ' archivo(s)…');
    try {
      for (const file of files) {
        const base64 = await this._leerArchivoBase64(file);
        const res = await API.subirMediaWeb(publicacionId, tipo, base64, file.name, file.type || 'application/octet-stream');
        const d = (res && res.data) || {};
        if (!d.url) throw new Error((res && res.error) || 'El backend no devolvió la URL');
        this._anadirMedia(campo, tipo, d, file.name, prefijo);
      }
      this._snack('Archivo(s) subidos a la carpeta de la ficha');
    } catch (err) {
      this._snackErr(err, 'No se pudo subir: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async guardarAnimal(e, animalId) {
    if (e && e.preventDefault) e.preventDefault();
    const fin = (typeof Dashboard !== 'undefined' && Dashboard._guardando) ? Dashboard._guardando(e && e.target) : () => {};
    if (!fin) return;
    const datos = this._leerFormAnimal();
    const ignorados = this._mediaIgnorados;
    if (!datos.titulo) { this._snack('Falta el título público', 'warning'); fin(); return; }
    try {
      await API.saveWebAnimal({ animal_id: animalId, ...datos });
      fin();
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      this._snack(ignorados
        ? 'Publicación guardada; se ignoraron ' + ignorados + ' enlace(s) de carpeta de Drive'
        : 'Publicación guardada', ignorados ? 'warning' : undefined);
      await this.recargar();
    } catch (err) {
      fin();
      this._snackErr(err, 'No se pudo guardar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  // ==================== FORMULARIO: EVENTO / HISTORIA ====================

  async abrirEvento(id) {
    if (!id) {
      this._mostrarFormEvento({ tipo: 'evento', categoria: 'Eventos' });
      return;
    }
    try {
      const res = await API.getWebEvento(id);
      this._mostrarFormEvento(res.data || {}, (res.completitud && res.completitud.faltan) ? res.completitud.faltan.map(f => f.campo) : []);
    } catch (err) {
      this._snackErr(err, 'No se pudo abrir la publicación');
    }
  },

  _mostrarFormEvento(d, faltan) {
    const media = d.media || {};
    const seo = d.seo || {};
    const ev = d.evento || d.event || {};
    const cover = media.coverImage || {};
    const gallery = Array.isArray(media.gallery) ? media.gallery : [];
    const documents = Array.isArray(media.documents) ? media.documents : [];
    const docsTexto = documents.map(x => (x.name || '') + '|' + (x.url || '')).join('\n');
    const carpetaFicha = this._carpetaFicha(d.tipo || 'evento', d.slug);
    const loc = ev.location || {};
    const org = ev.organizer || {};
    const reg = ev.registration || {};
    const cta = d.cta || {};
    const hoy = new Date().toISOString().slice(0, 10);
    this._webFichaForm = d.ficha || d.ficha_json || null;
    const FC = typeof FichaConfig !== 'undefined' ? FichaConfig : null;
    const fichaNorm = FC && typeof FC.normalizarFicha === 'function' ? FC.normalizarFicha(this._webFichaForm) : this._webFichaForm;
    const fichaTxt = fichaNorm && typeof fichaNorm === 'object'
      ? JSON.stringify(fichaNorm, null, 2)
      : (typeof fichaNorm === 'string' ? fichaNorm : '');

    const html = `<form data-submit="saveWebEvento" data-sarg0="${this._esc(d.id || '')}">
      <div class="form-row">
        <div class="form-group"><label for="we-tipo">Tipo de contenido *</label>
          <select id="we-tipo" class="form-input" data-change="onWebTipoChange" data-cpass="value">
            <option value="evento" ${d.tipo !== 'historia' ? 'selected' : ''}>Evento</option>
            <option value="historia" ${d.tipo === 'historia' ? 'selected' : ''}>Historia / blog</option>
          </select></div>
        <div class="form-group"><label for="we-estado">Estado de publicación *</label>
          <select id="we-estado" class="form-input">
            ${['borrador', 'publicado', 'oculto'].map(e => `<option value="${e}" ${(d.estado_publicacion || 'borrador') === e ? 'selected' : ''}>${this.estadoLabel(e)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label for="we-titulo">Título *</label><input type="text" id="we-titulo" class="form-input" value="${this._esc(d.titulo || '')}" required></div>
        <div class="form-group"><label for="we-slug">Slug *</label><input type="text" id="we-slug" class="form-input" value="${this._esc(d.slug || '')}" data-change="onWebSlugChange" data-cpass="el" data-carg0="${this._esc(d.id || '')}" data-carg1="${this._esc(d.tipo || 'evento')}"><p id="web-slug-hint" class="web-slug-hint"></p>${this.historialSlugHtml(d.slug_historial)}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label for="we-categoria">Categoría *</label><input type="text" id="we-categoria" class="form-input" value="${this._esc(d.categoria || (d.tipo === 'historia' ? 'Historias' : 'Eventos'))}"></div>
        <div class="form-group"><label for="we-estado-publico">Estado público</label><input type="text" id="we-estado-publico" class="form-input" value="${this._esc(d.estado_publico || (d.tipo === 'historia' ? 'publicado' : 'programado'))}" placeholder="programado / activo / finalizado"></div>
      </div>
      <div class="form-group"><label for="we-extracto">Extracto</label><textarea id="we-extracto" class="form-input" rows="2">${this._esc(d.extracto || '')}</textarea></div>
      <div class="form-group"><label for="we-contenido">Contenido * (admite HTML)</label><textarea id="we-contenido" class="form-input" rows="6">${this._esc(d.contenido_html || '')}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label for="we-cover">Portada (URL)</label><input type="text" id="we-cover" class="form-input" value="${this._esc(cover.src || '')}"></div>
        <div class="form-group"><label for="we-cover-alt">Texto alternativo</label><input type="text" id="we-cover-alt" class="form-input" value="${this._esc(cover.alt || '')}"></div>
      </div>
      <div class="form-group"><label for="we-galeria">Galería (url|alt|pie por línea; alt y pie opcionales)</label><textarea id="we-galeria" class="form-input" rows="2">${this._esc(this.mediaTextoGaleria(gallery))}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label for="we-file-portada">Subir portada</label><input type="file" id="we-file-portada" class="form-input" accept="image/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="portada" data-carg1="we" data-carg2="${this._esc(d.id || '')}"></div>
        <div class="form-group"><label for="we-file-galeria">Subir a la galería</label><input type="file" id="we-file-galeria" class="form-input" accept="image/*" multiple data-change="subirMediaWeb" data-cpass="el" data-carg0="galeria" data-carg1="we" data-carg2="${this._esc(d.id || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label for="we-file-doc">Subir documento</label><input type="file" id="we-file-doc" class="form-input" accept="application/pdf,image/*,video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="documento" data-carg1="we" data-carg2="${this._esc(d.id || '')}"></div>
      </div>
      <div class="form-group"><label for="we-docs">Documentos (nombre|url por línea)</label><textarea id="we-docs" class="form-input" rows="2">${this._esc(docsTexto)}</textarea></div>
      <p class="web-nota">Los archivos se guardan en Drive, en la carpeta «${this._esc(carpetaFicha)}». Se comparten las imágenes y los vídeos, no la carpeta; los documentos quedan privados. Los enlaces de carpeta de Drive se ignoran: pega el enlace del archivo.${d.id ? '' : ' Guarda la publicación para poder subir archivos.'}</p>

      <details class="detail-collapse" ${d.tipo === 'historia' ? '' : 'open'}><summary>${Icons.calendar} Datos del evento</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="we-kind">Modalidad / tipo</label><input type="text" id="we-kind" class="form-input" value="${this._esc(ev.kind || '')}" placeholder="jornada, mercadillo, puertas abiertas"></div>
            <div class="form-group"><label for="we-timezone">Zona horaria</label><input type="text" id="we-timezone" class="form-input" value="${this._esc(ev.timezone || 'Europe/Madrid')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="we-start">Inicio</label><input type="date" id="we-start" class="form-input" value="${this._esc((ev.startDate || hoy).slice(0, 10))}"></div>
            <div class="form-group"><label for="we-end">Fin</label><input type="date" id="we-end" class="form-input" value="${this._esc((ev.endDate || '').slice(0, 10))}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="we-loc-name">Lugar</label><input type="text" id="we-loc-name" class="form-input" value="${this._esc(loc.name || '')}"></div>
            <div class="form-group"><label for="we-loc-address">Dirección</label><input type="text" id="we-loc-address" class="form-input" value="${this._esc(loc.address || '')}"></div>
            <div class="form-group"><label for="we-loc-city">Ciudad</label><input type="text" id="we-loc-city" class="form-input" value="${this._esc(loc.city || '')}"></div>
            <div class="form-group"><label for="we-loc-online">URL online</label><input type="text" id="we-loc-online" class="form-input" value="${this._esc(loc.onlineUrl || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="we-org-name">Organiza</label><input type="text" id="we-org-name" class="form-input" value="${this._esc(org.name || '')}"></div>
            <div class="form-group"><label for="we-org-email">Email de contacto</label><input type="email" id="we-org-email" class="form-input" value="${this._esc(org.contactEmail || '')}"></div>
            <div class="form-group"><label for="we-org-phone">Teléfono</label><input type="text" id="we-org-phone" class="form-input" value="${this._esc(org.phone || '')}"></div>
          </div>
          <div class="form-group"><label for="we-audience">Público destinatario (separado por comas)</label><input type="text" id="we-audience" class="form-input" value="${this._esc((ev.audience || []).join(', '))}"></div>
          <div class="form-row">
            <div class="form-group"><label><input type="checkbox" id="we-reg-required" ${reg.required ? 'checked' : ''}> Requiere inscripción</label></div>
            <div class="form-group"><label for="we-reg-url">URL de inscripción</label><input type="text" id="we-reg-url" class="form-input" value="${this._esc(reg.url || '')}"></div>
            <div class="form-group"><label for="we-reg-label">Texto del botón</label><input type="text" id="we-reg-label" class="form-input" value="${this._esc(reg.label || '')}"></div>
          </div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} Configuración de ficha (avanzado, C3)</summary>
        <div class="detail-collapse-body">
          <div class="form-group"><label for="we-ficha-json">Ficha configurable (JSON)</label><textarea id="we-ficha-json" class="form-input" rows="6" placeholder='{"plantilla":"historia","bloques":{"datos":true}}'>${this._esc(fichaTxt)}</textarea><p class="web-slug-hint">Opcional (propuesta C3). Define plantilla/bloques/lectura; se aplica en detalle/prerender y nunca en listados. Déjalo vacío para usar el comportamiento actual.</p></div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.search} CTA y SEO de la publicación</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="we-cta-label">CTA · etiqueta</label><input type="text" id="we-cta-label" class="form-input" value="${this._esc(cta.label || '')}"></div>
            <div class="form-group"><label for="we-cta-url">CTA · URL</label><input type="text" id="we-cta-url" class="form-input" value="${this._esc(cta.url || '')}"></div>
          </div>
          <div class="form-group"><label for="we-seo-title">Meta title</label><input type="text" id="we-seo-title" class="form-input" value="${this._esc(this.seoTitle(d))}"><p class="web-slug-hint">Si lo dejas así, se usa el título público.</p></div>
          <div class="form-group"><label for="we-seo-desc">Meta description</label><textarea id="we-seo-desc" class="form-input" rows="2">${this._esc(seo.metaDescription || '')}</textarea><p class="web-slug-hint">Si la dejas vacía se usa el extracto.</p></div>
          <p class="web-nota">El canonical (dominio + ruta), la imagen OG (la portada) y los robots (según «Indexable») se generan solos.</p>
          <div class="form-row">
            <div class="form-group"><label><input type="checkbox" id="we-indexable" ${d.indexable !== false ? 'checked' : ''}> Indexable</label></div>
            <div class="form-group"><label><input type="checkbox" id="we-listed" ${d.listed !== false ? 'checked' : ''}> Visible en listados</label></div>
            <div class="form-group"><label><input type="checkbox" id="we-featured" ${d.featured ? 'checked' : ''}> Destacado</label></div>
          </div>
        </div>
      </details>

      ${faltan && faltan.length ? `<p class="web-nota">Pendiente para publicar: ${faltan.map(f => this._esc(f)).join(', ')}.</p>` : ''}
      <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar publicación</button></div>
    </form>`;
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) Dashboard.showFormModal((d.tipo === 'historia' ? 'Historia web' : 'Evento web') + (d.id ? '' : ' · nueva'), html);
  },

  _leerFormEvento() {
    const v = id => document.getElementById(id);
    const txt = id => (v(id) ? String(v(id).value || '').trim() : '');
    const checked = id => !!(v(id) && v(id).checked);
    const alt = txt('we-cover-alt') || txt('we-titulo');
    const tipo = txt('we-tipo') === 'historia' ? 'historia' : 'evento';
    this._mediaIgnorados = 0;
    const norm = (valor, t) => {
      const url = this.normalizarMediaUrl(valor, t);
      if (!url && String(valor || '').trim()) this._mediaIgnorados += 1;
      return url;
    };
    const galeria = this.parseGaleria(v('we-galeria') ? v('we-galeria').value : '', alt)
      .map(g => Object.assign({}, g, { src: norm(g.src, 'galeria') })).filter(g => g.src);
    const documentos = this.parseDocumentos(v('we-docs') ? v('we-docs').value : '')
      .map(doc => Object.assign({}, doc, { url: norm(doc.url, 'documento') })).filter(doc => doc.url);
    const data = {
      tipo,
      estado_publicacion: txt('we-estado') || 'borrador',
      slug: this.normalizarSlug(txt('we-slug') || txt('we-titulo')),
      titulo: txt('we-titulo'),
      categoria: txt('we-categoria'),
      estado_publico: txt('we-estado-publico'),
      extracto: txt('we-extracto'),
      contenido_html: v('we-contenido') ? v('we-contenido').value : '',
      indexable: checked('we-indexable'),
      listed: checked('we-listed'),
      featured: checked('we-featured'),
      media: {
        coverImage: { src: norm(txt('we-cover'), 'portada'), alt },
        gallery: galeria,
        documents: documentos
      },
      cta: txt('we-cta-label') && txt('we-cta-url') ? { label: txt('we-cta-label'), url: txt('we-cta-url') } : null,
      // Solo lo editable: canonical, OG y robots los deriva el backend.
      seo: {
        metaTitle: txt('we-seo-title'),
        metaDescription: txt('we-seo-desc')
      },
      event: {
        kind: txt('we-kind'),
        startDate: txt('we-start'),
        endDate: txt('we-end'),
        timezone: txt('we-timezone'),
        location: { name: txt('we-loc-name'), address: txt('we-loc-address'), city: txt('we-loc-city'), onlineUrl: txt('we-loc-online') },
        organizer: { name: txt('we-org-name'), contactEmail: txt('we-org-email'), phone: txt('we-org-phone') },
        audience: this.parseLista(txt('we-audience')),
        registration: { required: checked('we-reg-required'), url: txt('we-reg-url'), label: txt('we-reg-label') }
      }
    };
    const ficha = this._leerFichaForm('we-ficha-json');
    if (ficha) data.ficha = ficha;
    return data;
  },

  async guardarEvento(e, id) {
    if (e && e.preventDefault) e.preventDefault();
    const fin = (typeof Dashboard !== 'undefined' && Dashboard._guardando) ? Dashboard._guardando(e && e.target) : () => {};
    if (!fin) return;
    const datos = this._leerFormEvento();
    const ignorados = this._mediaIgnorados;
    if (!datos.titulo) { this._snack('Falta el título', 'warning'); fin(); return; }
    try {
      await API.saveWebEvento({ id: id || undefined, ...datos });
      fin();
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      this._snack(ignorados
        ? 'Publicación guardada; se ignoraron ' + ignorados + ' enlace(s) de carpeta de Drive'
        : 'Publicación guardada', ignorados ? 'warning' : undefined);
      await this.recargar();
    } catch (err) {
      fin();
      this._snackErr(err, 'No se pudo guardar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  // ==================== ESTADO / PREVIEW / SLUG ====================

  async cambiarEstado(tipo, identificador, estado) {
    if (tipo === 'animal') {
      const fila = (this.animales || []).find(a => String(a.animal_id) === String(identificador));
      if (fila && !fila.publicacion_id) {
        this._snack('Configura primero la publicación web de este animal', 'warning');
        return this.abrirAnimal(identificador);
      }
      try {
        await API.setWebAnimalEstado(identificador, estado);
        this._snack(estado === 'publicado' ? 'Publicado en la web' : 'Publicación ocultada');
        await this.recargar();
      } catch (err) {
        this._snackErr(err, 'No se pudo cambiar el estado: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
      }
      return;
    }
    try {
      await API.setWebEventoEstado(identificador, estado);
      this._snack(estado === 'publicado' ? 'Publicado en la web' : 'Publicación ocultada');
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo cambiar el estado: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async archivar(id) {
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm('¿Retirar esta publicación? Dejará de estar disponible en la web y su enlace responderá como retirado (410); el slug no se podrá reutilizar.', 'Retirar', 'Retirar');
      if (!ok) return;
    }
    try {
      await API.deleteWebEvento(id);
      this._snack('Publicación retirada (410)');
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo archivar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },


  async restaurarWebEvento(id, titulo) {
    const nombreTxt = titulo || 'esta publicaciA3n';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `A­Restaurar ${nombreTxt}? VolverA­ a borrador (no publicada) manteniendo su slug; podrA­s revisarla y publicarla de nuevo.`,
        'Restaurar',
        'Restaurar'
      );
      if (!ok) return;
    }
    try {
      await API.restaurarWebEvento(id);
      this._snack('PublicaciA3n restaurada a borrador');
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo restaurar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },
  async eliminarWebAnimal(animalId, nombre) {
    const nombreTxt = nombre || 'este animal';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Eliminar la publicación web (borrador/configuración) de ${nombreTxt}? Se borrará solo en Publicaciones web; la ficha del animal y sus datos se mantienen.`,
        'Eliminar',
        'Eliminar borrador'
      );
      if (!ok) return;
    }
    try {
      await API.deleteWebAnimal(animalId);
      this._snack('Publicación web eliminada (la ficha del animal no se ha modificado)');
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo eliminar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async preview(tipo, id) {
    try {
      const res = tipo === 'animal' ? await API.previewWebAnimal(id) : await API.previewWebEvento(id);
      this._ultimoPreview = res.data || null;
      const json = JSON.stringify(this._ultimoPreview, null, 2);
      const titulo = (this._ultimoPreview && this._ultimoPreview.title) || 'Publicación';
      const html = `<p class="web-nota">Este es el objeto <code>Publicacion</code> que entregará <code>/api/publicaciones/:slug</code>.</p>
        <pre class="web-preview-json">${this._esc(json)}</pre>
        <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="copiarPreviewWeb">Copiar JSON</button><button type="button" class="btn btn-primary" data-action="closeInfoModal">Cerrar</button></div>`;
      if (typeof Dashboard !== 'undefined' && Dashboard.showInfoModal) Dashboard.showInfoModal('Previsualización · ' + titulo, html);
    } catch (err) {
      this._snackErr(err, 'No se pudo generar la previsualización');
    }
  },

  copiarPreview() {
    const json = JSON.stringify(this._ultimoPreview || {}, null, 2);
    try {
      navigator.clipboard.writeText(json).then(() => this._snack('JSON copiado'), () => this._snack('No se pudo copiar', 'warning'));
    } catch (e) {
      this._snack('No se pudo copiar', 'warning');
    }
  },

  /** Slugs anteriores que ya redirigen (301) a esta publicación. */
  historialSlugHtml(hist) {
    const lista = (Array.isArray(hist) ? hist : []).filter(h => h && h.slug);
    if (!lista.length) return '';
    const slugs = lista.map(h => `<code>${this._esc(h.slug)}</code>`).join(', ');
    return `<p class="web-slug-hint web-slug-hist">Slugs anteriores con redirección 301: ${slugs}</p>`;
  },

  async validarSlugInput(el, id, tipo) {
    const hint = document.getElementById('web-slug-hint');
    if (!hint || !el) return;
    const normalizado = this.normalizarSlug(el.value);
    hint.className = 'web-slug-hint';
    hint.textContent = '';
    if (!normalizado) { hint.textContent = 'El slug se generará a partir del título.'; return; }
    if (normalizado !== String(el.value || '').trim()) { el.value = normalizado; }
    hint.textContent = 'Comprobando disponibilidad...';
    try {
      const res = await API.checkWebSlug(tipo === 'animal' ? 'animal' : tipo, normalizado, id || '');
      const d = res.data || {};
      if (d.disponible) {
        hint.textContent = 'Slug disponible';
        hint.classList.add('ok');
      } else {
        hint.textContent = d.conflicto ? ('Ya lo usa «' + (d.conflicto.titulo || d.conflicto.id) + '»') : 'Slug no válido';
        hint.classList.add('ko');
      }
    } catch (err) {
      hint.textContent = 'No se pudo comprobar el slug (se valida al guardar)';
    }
  },

  // ==================== INTEGRACIÓN DESDE LA FICHA DEL ANIMAL ====================

  async abrirParaAnimal(animalId) {
    return this.abrirAnimal(animalId);
  },

  onChangeTipo(valor) {
    const det = document.querySelector('#form-body details.detail-collapse');
    if (det) {
      if (valor === 'historia') det.removeAttribute('open');
      else det.setAttribute('open', '');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Web;
