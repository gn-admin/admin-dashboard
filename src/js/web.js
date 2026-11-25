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

// Categorías públicas canónicas. «Caso externo» tiene que coincidir letra a letra
// con `WEB_CATEGORIA_CASO_EXTERNO` del backend: el filtro del canal compara
// exacto y una mayúscula de más parte la sección en dos (R2).
const CATEGORIAS_PUBLICAS = [
  'Gatos en adopción', 'Perros en adopción', 'Acogidas', 'Adoptados', 'Cerrados',
  'Caso externo', 'Eventos', 'Historias'
];

const Web = {
  tab: 'animal',
  animales: [],
  grupos: [],
  eventos: [],
  resumen: null,
  error: '',
  _filtros: { q: '', estado: '' },
  _ultimoPreview: null,
  _mediaIgnorados: 0,
  _deployEstado: null,
  _secundarioCargado: false,

  // ==================== LÓGICA PURA ====================

  /** Copia de las categorías canónicas, para selects y sugerencias del gestor. */
  categoriasPublicas() {
    return CATEGORIAS_PUBLICAS.slice();
  },

  /**
   * Bloque `sponsor` del payload (R3). La cuota admite coma decimal; vacía o
   * inválida viaja como `null` (el backend decide si se publica, según el check
   * y el estado del animal) y las notas se acotan a lo que acepta el backend.
   */
  sponsorDeFormulario(eur, notas) {
    const crudo = String(eur == null ? '' : eur).replace(',', '.').trim();
    const n = Number(crudo);
    return {
      monthlyEur: (crudo === '' || !isFinite(n) || n < 0) ? null : n,
      notes: String(notas == null ? '' : notas).trim().slice(0, 200)
    };
  },

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
    const carpeta = { animal: 'animales', animal_grupo: 'animales', evento: 'eventos', historia: 'historias' }[tipo] || 'publicaciones';
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

  /** Guía para rellenar el SEO sin conocimientos técnicos. */
  _seoGuiaHtml(d) {
    const p = d || {};
    const titulo = this._esc(String(p.titulo || 'Título público').slice(0, 70));
    const extracto = this._esc(String(p.extracto || 'Resumen de la ficha').slice(0, 160));
    return `<div class="web-seo-guia">
      <p class="web-seo-guia-titulo">${Icons.search} SEO básico: no hace falta tocar nada</p>
      <p>La web ya genera estos datos sola. Si no sabes qué poner, deja los campos vacíos o con el valor automático:</p>
      <ul>
        <li><b>Título SEO</b> → título público: <i>${titulo}</i></li>
        <li><b>Descripción SEO</b> → extracto: <i>${extracto}</i></li>
        <li><b>URL canónica</b> → dominio + slug de la ficha.</li>
        <li><b>Imagen para redes</b> → portada de la publicación.</li>
        <li><b>Robots</b> → indexable si está marcada «Indexable»; si no, noindex.</li>
      </ul>
      <p>Escribe en los campos solo si quieres cambiar el resultado automático. Evita repetir palabras clave, listas de términos o textos genéricos.</p>
    </div>`;
  },

  /** Separador visual entre lo imprescindible y los datos opcionales. */
  _avanzadoIntroHtml() {
    return `<div class="web-avanzado-intro">
      <p class="web-avanzado-titulo">Avanzado <span class="web-avanzado-pill">Opcional</span></p>
      <p class="web-nota">Para publicar basta con lo de arriba. Abre solo lo que necesites: media extra, ficha, CTA, etiquetas o SEO.</p>
    </div>`;
  },

  /** Portada en la zona básica: URL, alt y subida directa. */
  _portadaBasicaHtml(prefix, cover, id, hint) {
    const c = cover || {};
    return `<div class="form-row">
      <div class="form-group"><label for="${prefix}-cover">Portada (URL)</label><input type="text" id="${prefix}-cover" class="form-input" value="${this._esc(c.src || '')}" placeholder="https://..."><p class="web-slug-hint">Opcional: ${this._esc(hint || 'si está vacía, la publicación se muestra sin portada nueva.')}</p></div>
      <div class="form-group"><label for="${prefix}-cover-alt">Texto alternativo</label><input type="text" id="${prefix}-cover-alt" class="form-input" value="${this._esc(c.alt || '')}" placeholder="Ej: Luna, perra mestiza, sentada en el jardín"><p class="web-slug-hint">Describe la imagen en una frase.</p></div>
    </div>
    <div class="form-group"><label for="${prefix}-file-portada">Subir portada</label><input type="file" id="${prefix}-file-portada" class="form-input" accept="image/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="portada" data-carg1="${prefix}" data-carg2="${this._esc(id || '')}"></div>`;
  },

  estadoLabel(estado) {
    const m = { publicado: 'Publicado', borrador: 'Borrador', oculto: 'Oculto', retirado: 'Retirado', sin_publicar: 'Sin publicar' };
    return m[estado] || 'Sin publicar';
  },

  /** Vocabulario público del animal (D1). `urgente` nunca es estado. */
  _estadoPublicoLabel(estado) {
    const m = { en_adopcion: 'En adopción', en_acogida: 'En acogida', reservado: 'Reservado', adoptado: 'Adoptado', cerrado: 'Cerrado' };
    return m[estado] || String(estado || '').replace(/_/g, ' ') || 'En adopción';
  },

  _heredadoItem(nombre, valor) {
    return `<div class="web-heredado-item"><span class="web-heredado-clave">${this._esc(nombre)}</span><span class="web-heredado-valor">${this._esc(valor || '—')}</span></div>`;
  },

  _heredadoBool(valor, si, no) {
    const normalizado = String(valor == null ? '' : valor).toLowerCase();
    if (!normalizado) return 'Sin dato';
    if (normalizado === 'no' || normalizado === 'false' || normalizado === '0') return no;
    return si;
  },

  estadoCls(estado) {
    const m = { publicado: 'aprobada', borrador: 'pendiente', oculto: 'descartada', retirado: 'descartada' };
    return m[estado] || '';
  },

  /** Animales que YA tienen publicación web (es lo único que se lista). */
  publicacionesAnimales(lista) {
    return (lista || []).filter(a => a && a.publicacion_id);
  },

  /**
   * Candidatos del selector "Nueva publicación": animales sin publicación y
   * que no pertenecen a un grupo con publicación viva (exclusividad 1:1; si
   * salieran sueltos, el backend los rechazaría al publicar).
   */
  animalesSinPublicacion(lista) {
    return (lista || []).filter(a => a && !a.publicacion_id && !a.grupo_publicado);
  },

  /** Miembros de un grupo ya publicado: no se ofrecen sueltos, pero se avisa. */
  animalesEnGrupoVigente(lista) {
    return (lista || []).filter(a => a && !a.publicacion_id && !!a.grupo_publicado);
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
    // Primer pintado: solo lo que necesita la pestaña inicial (Animales) y el
    // resumen. Grupos y eventos se cargan después, en segundo plano, para no
    // bloquear la primera pintura con las cuatro llamadas en paralelo.
    await this.cargarEsencial();
    el.innerHTML = this._html();
    if (typeof Dashboard !== 'undefined' && Dashboard.injectIcons) Dashboard.injectIcons();
    this._cargarEstadoDeploy();
    if (!this.error) {
      this.cargarSecundario().then((ok) => {
        if (!ok) return;
        const cont = document.getElementById('page-web');
        if (!cont) return;
        this._actualizarContadoresTabs();
        if (this.tab !== 'animal') {
          const listado = document.getElementById('web-listado');
          if (listado) listado.innerHTML = this._tabla();
          if (typeof Dashboard !== 'undefined' && Dashboard.injectIcons) Dashboard.injectIcons();
        }
      }).catch(() => {});
    }
  },

  async cargarEsencial() {
    this.error = '';
    this.grupos = [];
    this.eventos = [];
    this._secundarioCargado = false;
    try {
      const [resumen, animales] = await Promise.all([
        API.getWebResumen(),
        API.getWebAnimales({ pageSize: 200 })
      ]);
      this.resumen = resumen.data || null;
      this.animales = animales.data || [];
    } catch (err) {
      this.error = (typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : String((err && err.message) || err);
      this.animales = [];
      this.resumen = null;
      this.grupos = [];
      this.eventos = [];
      this._secundarioCargado = false;
    }
  },

  async cargarSecundario() {
    try {
      const [eventos, grupos] = await Promise.all([
        API.getWebEventos(),
        typeof API.getWebGrupos === 'function' ? API.getWebGrupos({}) : Promise.resolve({ data: [] })
      ]);
      this.eventos = eventos.data || [];
      this.grupos = (grupos && grupos.data) ? grupos.data : (Array.isArray(grupos) ? grupos : []);
      this._secundarioCargado = true;
      return true;
    } catch (err) {
      return false;
    }
  },

  async cargar() {
    this.error = '';
    try {
      const [resumen, animales, eventos, grupos] = await Promise.all([
        API.getWebResumen(),
        API.getWebAnimales({ pageSize: 200 }),
        API.getWebEventos(),
        typeof API.getWebGrupos === 'function' ? API.getWebGrupos({}) : Promise.resolve({ data: [] })
      ]);
      this.resumen = resumen.data || null;
      this.animales = animales.data || [];
      this.eventos = eventos.data || [];
      this.grupos = (grupos && grupos.data) ? grupos.data : (Array.isArray(grupos) ? grupos : []);
      this._secundarioCargado = true;
    } catch (err) {
      this.error = (typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : String((err && err.message) || err);
      this.animales = [];
      this.grupos = [];
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
    const t = (this.resumen && this.resumen.totales) || {};
    const pendientes = Number(t.incompletas) || 0;
    const c = this._contadoresTab();
    return `<div class="page-list-container">
      <section class="web-page-head">
        <div class="web-page-copy">
          <span class="web-page-eyebrow">Contenido público</span>
          <h2 class="web-page-title">Publicaciones</h2>
          <p class="web-page-sub">Cura las fichas que ve la web: animal, grupo, evento o historia. Lo que no publicas no sale del canal.</p>
        </div>
        <div class="web-page-summary" aria-label="Resumen de publicaciones">
          <span class="web-summary-pill is-live"><b>${Number(t.publicados) || 0}</b> visibles</span>
          <span class="web-summary-pill"><b>${Number(t.borradores) || 0}</b> borradores</span>
          <span class="web-summary-pill ${pendientes ? 'is-warn' : ''}"><b>${pendientes}</b> con pendientes</span>
        </div>
      </section>
      ${this._statsHtml()}
      <div class="web-tabs" role="tablist" aria-label="Contenido publicable">
        <button type="button" role="tab" id="web-tab-animal" aria-controls="web-panel" class="web-tab ${this.tab === 'animal' ? 'active' : ''}" aria-selected="${this.tab === 'animal'}" data-action="cambiarTabWeb" data-arg0="animal"><span class="web-tab-icon" aria-hidden="true">${Icons.paw}</span><span class="web-tab-label">Animales</span><span class="web-tab-count" aria-hidden="true">${c.animal.total}</span><span class="sr-only">, ${c.animal.total} ${c.animal.total === 1 ? 'publicación' : 'publicaciones'}</span></button>
        <button type="button" role="tab" id="web-tab-grupo" aria-controls="web-panel" class="web-tab ${this.tab === 'grupo' ? 'active' : ''}" aria-selected="${this.tab === 'grupo'}" data-action="cambiarTabWeb" data-arg0="grupo"><span class="web-tab-icon" aria-hidden="true">${Icons.users || Icons.paw}</span><span class="web-tab-label">Grupos</span><span class="web-tab-count" aria-hidden="true">${c.grupo.total}</span><span class="sr-only">, ${c.grupo.total} ${c.grupo.total === 1 ? 'publicación' : 'publicaciones'}</span></button>
        <button type="button" role="tab" id="web-tab-evento" aria-controls="web-panel" class="web-tab ${this.tab === 'evento' ? 'active' : ''}" aria-selected="${this.tab === 'evento'}" data-action="cambiarTabWeb" data-arg0="evento"><span class="web-tab-icon" aria-hidden="true">${Icons.calendar}</span><span class="web-tab-label">Eventos e historias</span><span class="web-tab-count" aria-hidden="true">${c.evento.total}</span><span class="sr-only">, ${c.evento.total} ${c.evento.total === 1 ? 'publicación' : 'publicaciones'}</span></button>
      </div>
      <div class="web-panel" id="web-panel" role="tabpanel" aria-labelledby="web-tab-${this.tab}">
      <div class="filters-bar web-toolbar">
        <div class="web-filter">
          <label for="web-buscar">Buscar</label>
          <div class="search-box"><span class="search-icon" aria-hidden="true"></span><input id="web-buscar" type="text" aria-label="${this.tab === 'animal' ? 'Buscar por nombre, título o slug' : (this.tab === 'grupo' ? 'Buscar por grupo, miembros o slug' : 'Buscar por título, slug o categoría')}" placeholder="${this.tab === 'animal' ? 'Nombre o slug...' : (this.tab === 'grupo' ? 'Grupo o miembro...' : 'Título o categoría...')}" value="${this._esc(this._filtros.q)}" data-input="onWebSearch"></div>
        </div>
        <div class="web-filter">
          <label for="web-estado">Estado</label>
          <select id="web-estado" aria-label="Filtrar por estado de publicación" data-change="onWebEstadoFilter" data-cpass="value">
            <option value="">Todos los estados</option>
            ${['publicado', 'borrador', 'oculto', 'retirado'].map(e => `<option value="${e}" ${this._filtros.estado === e ? 'selected' : ''}>${this.estadoLabel(e)}</option>`).join('')}
          </select>
        </div>
        <div class="web-acciones">
          ${this.tab === 'animal'
            ? `<button type="button" class="btn btn-primary btn-sm" data-action="nuevaPublicacionWeb">${Icons.plus} Publicar animal</button>`
            : (this.tab === 'grupo'
              ? `<button type="button" class="btn btn-primary btn-sm" data-action="nuevaPublicacionGrupoWeb">${Icons.plus} Publicar grupo</button>`
              : `<button type="button" class="btn btn-primary btn-sm" data-action="abrirEventoWeb">${Icons.plus} Nuevo evento/historia</button>`)}
          <button type="button" class="btn btn-outline-green btn-sm" data-action="recargarWeb">${Icons.refresh} Actualizar</button>
          <button type="button" class="btn btn-outline-green btn-sm" data-action="regenerarWeb" data-pass="el" title="Lanza el despliegue de GitHub Pages ahora">${Icons.refresh} Regenerar web</button>
          <a class="btn btn-outline-green btn-sm" href="publico.html" target="_blank" rel="noopener">${Icons.eye} Ver web pública</a>
        </div>
      </div>
      ${this._avisoPublicados()}
      <div id="web-deploy-estado" class="web-deploy-estado" aria-live="polite"></div>
      <div id="web-listado" class="web-lista">${this._tabla()}</div>
      <p class="web-nota">La guía SEO de cada ficha explica qué se rellena solo. La previsualización muestra exactamente el payload que entregará el canal público.</p>
      </div>
    </div>
    <div class="page-detail-container"></div>`;
  },

  /** Texto del chip de estado del deploy (puro, para poder testearlo). */
  estadoDeployTexto(data) {
    if (!data) return { texto: 'Estado del deploy automático: no disponible (backend sin `web-deploy-estado`)', ok: false };
    if (data.configurado) {
      return { texto: 'Deploy automático activo · ' + (data.repo || 'repo') + ' (' + (data.ref || 'main') + ')', ok: true };
    }
    return { texto: 'Deploy automático sin configurar: falta GITHUB_DEPLOY_TOKEN en Apps Script', ok: false };
  },

  /** Mensaje del botón «Regenerar web» a partir de la respuesta del backend. */
  mensajeDeployManual(res) {
    const r = res || {};
    if (r.ok === false) {
      const motivo = r.error || (r.codigo ? 'GitHub respondió ' + r.codigo : 'sin detalle');
      return { texto: 'No se pudo lanzar el deploy (' + motivo + '). La web no se actualizará hasta el próximo despliegue.', tipo: 'warning' };
    }
    if (r.disparado === false) return { texto: 'Ya hay un despliegue en marcha: la web se actualizará en 2–3 min', tipo: undefined };
    return { texto: 'Deploy lanzado. La web se actualizará en 2–3 min', tipo: undefined };
  },

  _pintarChipDeploy() {
    const cont = document.getElementById('web-deploy-estado');
    if (!cont) return false;
    const info = this.estadoDeployTexto(this._deployEstado);
    cont.innerHTML = `<span class="web-deploy-chip ${info.ok ? 'ok' : 'ko'}">${this._esc(info.texto)}</span>`;
    return true;
  },

  async _cargarEstadoDeploy(intento) {
    if (typeof API.estadoDeployWeb !== 'function') {
      this._deployEstado = null;
      this._pintarChipDeploy();
      return null;
    }
    const res = await API.estadoDeployWeb();
    this._deployEstado = (res && res.data) || null;
    // El panel monta la página en varios pasos: si el chip aún no está en el
    // DOM, se reintenta un par de veces en vez de quedarse vacío.
    if (!this._pintarChipDeploy() && (intento || 0) < 4) {
      await new Promise(r => setTimeout(r, 300));
      return this._cargarEstadoDeploy((intento || 0) + 1);
    }
    return this._deployEstado;
  },

  /** Botón «Regenerar web»: dispara el workflow y cuenta el resultado. */
  async regenerarWeb(el) {
    const boton = el && el.tagName ? el : null;
    if (boton) { boton.disabled = true; boton.setAttribute('aria-busy', 'true'); }
    this._snack('Lanzando el despliegue de la web…');
    try {
      const res = await API.dispararDeployWeb();
      const aviso = this.mensajeDeployManual(res);
      this._snack(aviso.texto, aviso.tipo);
      await this._cargarEstadoDeploy();
    } catch (err) {
      this._snackErr(err, 'No se pudo lanzar el deploy: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    } finally {
      if (boton) { boton.disabled = false; boton.removeAttribute('aria-busy'); }
    }
  },

  /** Aviso cuando nada está visible en la web: explica el siguiente paso. */
  _avisoPublicados() {
    const t = (this.resumen && this.resumen.totales) || {};
    if (Number(t.publicados) > 0) return '';
    return `<div class="web-aviso"><span aria-hidden="true">ℹ️</span><span>Todavía no hay nada visible en la web. Pulsa <b>Publicar animal</b> para elegir un animal (o crea un <b>evento/historia</b> desde su pestaña) y publica para que aparezca en <a href="publico.html" target="_blank" rel="noopener">la web pública</a>.</span></div>`;
  },

  /** Contadores por pestaña: lo que lista cada una (no el total global del resumen). */
  _contadoresTab() {
    const cuenta = lista => {
      const out = { total: 0, publicado: 0, borrador: 0, oculto: 0, retirado: 0 };
      (lista || []).forEach(x => {
        if (!x) return;
        out.total += 1;
        const e = x.estado_publicacion || 'borrador';
        if (Object.prototype.hasOwnProperty.call(out, e)) out[e] += 1;
      });
      return out;
    };
    return {
      animal: cuenta(this.publicacionesAnimales(this.animales)),
      grupo: cuenta((this.grupos || []).filter(g => g && g.publicacion_id)),
      evento: cuenta(this.eventos)
    };
  },

  _statsHtml() {
    const t = (this.resumen && this.resumen.totales) || {};
    const card = (label, valor, icono, extra, tone) => `<div class="stat-card web-stat web-stat--${tone || 'green'}"><div class="stat-card-icon ${tone || 'green'}">${icono}</div><div class="stat-card-info"><div class="stat-card-label">${label}</div><div class="stat-card-value">${Number(valor) || 0}</div>${extra ? `<div class="stat-card-change">${extra}</div>` : ''}</div></div>`;
    return `<div class="stats-grid web-stats" style="margin-bottom:16px">
      ${card('Publicados', t.publicados, Icons.checkCircle, 'Visibles en la web', 'green')}
      ${card('Borradores', t.borradores, Icons.fileText, 'En preparación', 'blue')}
      ${card('Ocultos', t.ocultos, Icons.eye, 'Fuera de la web', 'gray')}
      ${card('Retiradas', t.retirados, Icons.trash, 'Enlace retirado (410)', 'red')}
      ${card('Sin configurar', t.sin_publicar, Icons.alertTriangle, 'Animales sin ficha web', 'amber')}
      ${card('Incompletos', t.incompletas, Icons.alertTriangle, (Number(t.sin_seo) || 0) + ' sin SEO/descripción', 'amber')}
    </div>`;
  },

  _tablaCard(titulo, sub, total, tabla) {
    return `<div class="card web-table-card">
      <div class="web-list-head">
        <div><h3 class="web-list-title">${this._esc(titulo)}</h3><p class="web-list-sub">${this._esc(sub)}</p></div>
        <span class="web-list-count" aria-label="${total} ${total === 1 ? 'publicación' : 'publicaciones'}">${total}</span>
      </div>
      <div class="card-body-flush">${tabla}</div>
    </div>`;
  },

  _tabla() {
    const q = this._filtros.q.toLowerCase();
    if (this.tab === 'animal') {
      const filas = this.publicacionesAnimales(this.animales).filter(a => {
        if (this._filtros.estado && a.estado_publicacion !== this._filtros.estado) return false;
        if (!q) return true;
        return ((a.nombre || '') + ' ' + (a.titulo || '') + ' ' + (a.slug || '') + ' ' + (a.especie || '')).toLowerCase().includes(q);
      });
      if (!filas.length) return this._sinPublicaciones();
      return this._tablaCard('Animales publicables', 'Fichas individuales con o sin publicación web.', filas.length, `<table class="data-table web-tabla"><thead><tr><th scope="col">Animal</th><th scope="col">Estado web</th><th scope="col">Slug</th><th scope="col">Completitud</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${filas.map(a => this._filaAnimal(a)).join('')}</tbody></table>`);
    }
    if (this.tab === 'grupo') {
      const filas = (this.grupos || []).filter(g => {
        // mostrar grupos con publicación o grupos obligatorios candidatos
        if (!g.publicacion_id && !g.grupo_obligatorio) return false;
        if (this._filtros.estado && (g.estado_publicacion || 'sin_publicar') !== this._filtros.estado) return false;
        if (!q) return true;
        return ((g.nombre || '') + ' ' + (g.titulo || '') + ' ' + (g.slug || '') + ' ' + (g.miembros_nombres || []).join(' ')).toLowerCase().includes(q);
      });
      if (!filas.length) return this._vacio('No hay grupos de adopción conjunta', 'Crea una publicación para un grupo con adopción conjunta.', 'nuevaPublicacionGrupoWeb', 'Publicar grupo');
      return this._tablaCard('Grupos de adopción conjunta', 'Publicaciones que agrupan varios animales.', filas.length, `<table class="data-table web-tabla"><thead><tr><th scope="col">Grupo</th><th scope="col">Miembros</th><th scope="col">Estado web</th><th scope="col">Slug</th><th scope="col">Completitud</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${filas.map(g => this._filaGrupo(g)).join('')}</tbody></table>`);
    }
    const filas = this.eventos.filter(e => {
      if (this._filtros.estado && e.estado_publicacion !== this._filtros.estado) return false;
      if (!q) return true;
      return ((e.titulo || '') + ' ' + (e.slug || '') + ' ' + (e.categoria || '')).toLowerCase().includes(q);
    });
    if (!filas.length) return this._vacio('No hay eventos ni historias', 'Crea el primero con el botón "Nuevo evento/historia".', 'abrirEventoWeb', 'Nuevo evento/historia');
    return this._tablaCard('Eventos e historias', 'Agenda, noticias y relatos del refugio.', filas.length, `<table class="data-table web-tabla"><thead><tr><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col">Estado web</th><th scope="col">Slug</th><th scope="col">Completitud</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${filas.map(e => this._filaEvento(e)).join('')}</tbody></table>`);
  },

  _filaAnimal(a) {
    const faltan = (a.completitud && a.completitud.faltan) || [];
    const retirado = a.estado_publicacion === 'retirado';
    const publicoEfectivo = a.estado_publico_efectivo || a.estado_publico || '';
    return `<tr>
      <td data-label="Animal"><b>${this._esc(a.nombre || '—')}</b>${a.urgente ? ' <span class="urgente-badge">Urgente</span>' : ''}<div class="web-sub">${this._esc(a.especie || '')}</div></td>
      <td data-label="Estado web"><span class="estado-badge ${this.estadoCls(a.estado_publicacion)}">${this._esc(this.estadoLabel(a.estado_publicacion))}</span>${publicoEfectivo ? `<div class="web-sub">${this._esc(this._estadoPublicoLabel(publicoEfectivo))}</div>` : ''}${a.featured ? ' <span class="chip-neutral">Destacado</span>' : ''}</td>
      <td data-label="Slug">${a.slug ? `<code>${this._esc(a.slug)}</code>` : '<span class="web-sub">sin slug</span>'}</td>
      <td data-label="Completitud">${this._chips(faltan)}</td>
      <td data-label="Acciones" class="table-actions">
        ${retirado
          ? `<span class="web-sub" title="Enlace retirado (410); el slug sigue reservado">Enlace 410 · slug reservado</span>
        <button type="button" class="btn btn-outline-green btn-sm" data-action="restaurarWebAnimal" data-arg0="${this._esc(a.animal_id)}" data-arg1="${this._esc(a.nombre || '')}">Restaurar</button>`
          : `<button type="button" class="btn btn-outline-green btn-sm" data-action="abrirAnimalWeb" data-arg0="${this._esc(a.animal_id)}">${Icons.pencil} ${a.publicacion_id ? 'Editar' : 'Configurar'}</button>
        ${a.publicacion_id
          ? (a.estado_publicacion === 'publicado'
            ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="cambiarEstadoWeb" data-arg0="animal" data-arg1="${this._esc(a.animal_id)}" data-arg2="oculto">Ocultar</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-action="cambiarEstadoWeb" data-arg0="animal" data-arg1="${this._esc(a.animal_id)}" data-arg2="publicado">Publicar</button>`)
          : ''}
        <details class="action-menu">
          <summary class="btn btn-outline-green btn-sm" aria-label="Más acciones" title="Más acciones">⋮</summary>
          <div class="action-menu-list">
            ${a.publicacion_id ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="previewWeb" data-arg0="animal" data-arg1="${this._esc(a.animal_id)}">${Icons.eye} Preview</button>` : ''}
            ${a.estado_publicacion === 'publicado' && a.slug ? `<a class="btn btn-outline-green btn-sm" href="publico.html#/publicacion/${encodeURIComponent(a.slug)}" target="_blank" rel="noopener">${Icons.eye} Ver ficha</a>
            <button type="button" class="btn btn-outline-green btn-sm" data-action="copiarEnlaceWeb" data-arg0="${this._esc(a.slug)}" data-arg1="${this._esc(a.nombre || '')}" title="Copiar el enlace de la página estática canónica">${Icons.clipboard} Copiar enlace</button>` : ''}
            ${a.publicacion_id && a.estado_publicacion !== 'publicado'
              ? `<button type="button" class="btn btn-danger btn-sm" data-action="retirarWebAnimal" data-arg0="${this._esc(a.animal_id)}" data-arg1="${this._esc(a.nombre || '')}" title="Retirar (410): el enlace pasa a lápida y el slug queda reservado">${Icons.trash} Retirar</button>` : ''}
            ${a.publicacion_id && a.estado_publicacion !== 'publicado'
              ? `<button type="button" class="btn btn-danger btn-sm" data-action="eliminarWebAnimal" data-arg0="${this._esc(a.animal_id)}" data-arg1="${this._esc(a.nombre || '')}" title="Eliminar publicación web (solo configuración, la ficha del animal no se modifica)">${Icons.trash} Eliminar borrador</button>`
              : ''}
          </div>
        </details>`}
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
          ? `<span class="web-sub" title="Enlace retirado (410); el slug sigue reservado">Enlace 410 · slug reservado</span>
        <button type="button" class="btn btn-outline-green btn-sm" data-action="restaurarWebEvento" data-arg0="${this._esc(e.id)}" data-arg1="${this._esc(e.titulo || '')}">Restaurar</button>`
          : `<button type="button" class="btn btn-outline-green btn-sm" data-action="abrirEventoWeb" data-arg0="${this._esc(e.id)}">${Icons.pencil} Editar</button>
        ${e.estado_publicacion === 'publicado'
          ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="cambiarEstadoWeb" data-arg0="evento" data-arg1="${this._esc(e.id)}" data-arg2="oculto">Ocultar</button>`
          : `<button type="button" class="btn btn-primary btn-sm" data-action="cambiarEstadoWeb" data-arg0="evento" data-arg1="${this._esc(e.id)}" data-arg2="publicado">Publicar</button>`}
        <details class="action-menu">
          <summary class="btn btn-outline-green btn-sm" aria-label="Más acciones" title="Más acciones">⋮</summary>
          <div class="action-menu-list">
            <button type="button" class="btn btn-outline-green btn-sm" data-action="previewWeb" data-arg0="evento" data-arg1="${this._esc(e.id)}">${Icons.eye} Preview</button>
            ${e.estado_publicacion === 'publicado' && e.slug ? `<a class="btn btn-outline-green btn-sm" href="publico.html#/publicacion/${encodeURIComponent(e.slug)}" target="_blank" rel="noopener">${Icons.eye} Ver ficha</a>
            <button type="button" class="btn btn-outline-green btn-sm" data-action="copiarEnlaceWeb" data-arg0="${this._esc(e.slug)}" data-arg1="${this._esc(e.titulo || '')}" title="Copiar el enlace de la página estática canónica">${Icons.clipboard} Copiar enlace</button>` : ''}
            <button type="button" class="btn btn-danger btn-sm" data-action="archivarWeb" data-arg0="${this._esc(e.id)}" aria-label="Retirar ${this._esc(e.titulo || 'publicación')}" title="Retirar (410)">${Icons.trash}</button>
          </div>
        </details>`}
      </td>
    </tr>`;
  },

  _filaGrupo(g) {
    const faltan = (g && g.completitud && g.completitud.faltan) || [];
    const retirado = g.estado_publicacion === 'retirado';
    const publicado = g.estado_publicacion === 'publicado';
    const estadoPublico = g.estado_publico || '';
    const nombres = Array.isArray(g.miembros_nombres) ? g.miembros_nombres : [];
    const miembros = nombres.length ? nombres : [];
    const conflicto = !!g.conflicto_individual_publicado;
    return `<tr>
      <td data-label="Grupo"><b>${this._esc(g.nombre || '—')}</b>${g.urgente ? ' <span class="urgente-badge">Urgente</span>' : ''}<div class="web-sub">${Number(g.miembros_count) || 0} miembro${Number(g.miembros_count) === 1 ? '' : 's'}</div></td>
      <td data-label="Miembros"><span class="web-sub">${this._esc(miembros.join(', ') || '—')}</span>${conflicto ? '<div class="web-sub">Hay publicaciones individuales publicadas: resuélvelas para publicar el grupo.</div>' : ''}</td>
      <td data-label="Estado web"><span class="estado-badge ${this.estadoCls(g.estado_publicacion)}">${this._esc(this.estadoLabel(g.estado_publicacion))}</span>${estadoPublico ? `<div class="web-sub">${this._esc(this._estadoPublicoLabel(estadoPublico))}</div>` : ''}</td>
      <td data-label="Slug">${g.slug ? `<code>${this._esc(g.slug)}</code>` : '<span class="web-sub">sin slug</span>'}</td>
      <td data-label="Completitud">${this._chips(faltan)}</td>
      <td data-label="Acciones" class="table-actions">
        ${retirado
          ? `<span class="web-sub" title="Enlace retirado (410); el slug sigue reservado">Enlace 410 · slug reservado</span>
        <button type="button" class="btn btn-outline-green btn-sm" data-action="restaurarWebGrupo" data-arg0="${this._esc(g.grupo_id)}" data-arg1="${this._esc(g.nombre || '')}">Restaurar</button>`
          : `<button type="button" class="btn btn-outline-green btn-sm" data-action="abrirGrupoWeb" data-arg0="${this._esc(g.grupo_id)}">${Icons.pencil} ${g.publicacion_id ? 'Editar' : 'Configurar'}</button>
        ${g.publicacion_id
          ? (publicado
            ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="ocultarWebGrupo" data-arg0="${this._esc(g.grupo_id)}">Ocultar</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-action="publicarWebGrupo" data-arg0="${this._esc(g.grupo_id)}">Publicar</button>`)
          : ''}
        <details class="action-menu">
          <summary class="btn btn-outline-green btn-sm" aria-label="Más acciones" title="Más acciones">⋮</summary>
          <div class="action-menu-list">
            ${g.publicacion_id ? `<button type="button" class="btn btn-outline-green btn-sm" data-action="previewWebGrupo" data-arg0="${this._esc(g.grupo_id)}">${Icons.eye} Preview</button>` : ''}
            ${publicado && g.slug ? `<a class="btn btn-outline-green btn-sm" href="publico.html#/publicacion/${encodeURIComponent(g.slug)}" target="_blank" rel="noopener">${Icons.eye} Ver ficha</a>
            <button type="button" class="btn btn-outline-green btn-sm" data-action="copiarEnlaceWeb" data-arg0="${this._esc(g.slug)}" data-arg1="${this._esc(g.nombre || '')}" title="Copiar el enlace de la página estática canónica">${Icons.clipboard} Copiar enlace</button>` : ''}
            ${g.publicacion_id && !publicado
              ? `<button type="button" class="btn btn-danger btn-sm" data-action="retirarWebGrupo" data-arg0="${this._esc(g.grupo_id)}" data-arg1="${this._esc(g.nombre || '')}" title="Retirar (410): el enlace pasa a lápida y el slug queda reservado">${Icons.trash} Retirar</button>` : ''}
            ${g.publicacion_id && !publicado && !retirado
              ? `<button type="button" class="btn btn-danger btn-sm" data-action="eliminarWebGrupo" data-arg0="${this._esc(g.grupo_id)}" data-arg1="${this._esc(g.nombre || '')}" title="Eliminar la publicación web del grupo (los animales y sus fichas no se modifican)">${Icons.trash} Eliminar borrador</button>`
              : ''}
          </div>
        </details>`}
      </td>
    </tr>`;
  },

  _chips(faltan) {
    if (!faltan || !faltan.length) return `<span class="estado-badge aprobada">Completa</span>`;
    return `<span class="web-chips">${faltan.map(f => `<span class="web-chip-missing">${this._esc(this._campoLabel(f))}</span>`).join('')}</span>`;
  },

  /** Etiqueta legible de un campo que impide publicar. */
  _campoLabel(campo) {
    const labels = {
      titulo: 'Título', slug: 'Slug', categoria: 'Categoría', estado_publico: 'Estado',
      estado_publicacion: 'Estado de publicación', contenido: 'Descripción', contenido_html: 'Descripción',
      imagen: 'Imagen', coverImage: 'Portada', seo: 'SEO', 'seo.metaDescription': 'Meta descripción',
      publicacion: 'Sin configurar', miembros: 'Miembros'
    };
    return labels[campo] || campo;
  },

  /** Campos que impiden publicar una ficha (los calcula el backend). */
  _faltantesPublicacion(fila) {
    const faltan = (fila && fila.completitud && fila.completitud.faltan) || [];
    return faltan.map(f => this._campoLabel(f));
  },

  _vacio(titulo, texto, accion, accionTexto) {
    return `<div class="empty-state empty-state-illustrated"><div class="empty-state-icon">${Icons.eye}</div><h3>${this._esc(titulo)}</h3><p>${this._esc(texto)}</p>${accion ? `<button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" data-action="${this._esc(accion)}">${Icons.plus} ${this._esc(accionTexto || 'Crear')}</button>` : ''}</div>`;
  },

  /** Listado de animales vacío: no hay publicaciones (las internas no se listan). */
  _sinPublicaciones() {
    const n = this.animalesSinPublicacion(this.animales).length;
    return `<div class="empty-state empty-state-illustrated">
      <div class="empty-state-icon">${Icons.eye}</div>
      <h3>Sin publicaciones de animales</h3>
      <p>${n ? `Hay ${n} animal${n === 1 ? '' : 'es'} sin publicación web. Elige cuál publicar.` : 'Cuando des de alta un animal podrás crear su publicación web desde aquí.'}</p>
      ${n ? `<button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" data-action="nuevaPublicacionWeb">${Icons.plus} Publicar animal</button>` : ''}
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
    this.tab = (tab === 'evento' || tab === 'grupo') ? tab : 'animal';
    this._filtros.estado = '';
    const finish = () => {
      const el = document.getElementById('page-web');
      if (el) el.innerHTML = this._html();
      if (typeof Dashboard !== 'undefined' && Dashboard.injectIcons) Dashboard.injectIcons();
      const activo = document.getElementById('web-tab-' + this.tab);
      if (activo && typeof activo.focus === 'function') activo.focus();
    };
    if (!this._secundarioCargado && (this.tab === 'grupo' || this.tab === 'evento')) {
      this.cargarSecundario().then(finish);
    } else {
      finish();
    }
  },

  _actualizarContadoresTabs() {
    const c = this._contadoresTab();
    const mapa = { animal: c.animal.total, grupo: c.grupo.total, evento: c.evento.total };
    Object.keys(mapa).forEach((k) => {
      const btn = document.getElementById('web-tab-' + k);
      if (!btn) return;
      const total = mapa[k];
      const count = btn.querySelector('.web-tab-count');
      if (count) count.textContent = total;
      const sr = btn.querySelector('.sr-only');
      if (sr) sr.textContent = `, ${total} ${total === 1 ? 'publicación' : 'publicaciones'}`;
    });
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
        ${this._pickerAvisoGrupo()}
        <div class="search-box"><span class="search-icon" aria-hidden="true"></span><input type="search" aria-label="Buscar animal sin publicación" placeholder="Buscar por nombre o especie..." data-input="onPickerWebBuscar"></div>
        <div id="web-picker-lista" class="web-picker-lista">${this._pickerLista()}</div>
      </div>`;
  },

  /** Aviso del selector: miembros de grupos ya publicados (exclusividad 1:1). */
  _pickerAvisoGrupo() {
    const bloqueados = this.animalesEnGrupoVigente(this.animales);
    if (!bloqueados.length) return '';
    const grupos = [...new Set(bloqueados.map(a => a.grupo_publicado).filter(Boolean))];
    const nombres = grupos.slice(0, 3).map(g => `«${this._esc(g)}»`).join(', ');
    const resto = grupos.length > 3 ? ` y ${grupos.length - 3} más` : '';
    const n = bloqueados.length;
    const sujeto = n === 1 ? '1 animal no aparece' : `${n} animales no aparecen`;
    const poseedor = grupos.length === 1 ? 'su grupo' : 'sus grupos';
    const verbo = grupos.length === 1 ? 'ya tiene' : 'ya tienen';
    const pronombre = n === 1 ? 'publicarlo' : 'publicarlos';
    return `<p class="web-picker-aviso" role="status">${sujeto} aquí porque ${poseedor} ${nombres}${resto} ${verbo} publicación publicada. Oculta o retira la del grupo para ${pronombre} por separado.</p>`;
  },

  /** Lista de candidatos del selector (solo animales sin publicación). */
  _pickerLista() {
    const q = String(this._pickerQ || '').toLowerCase();
    const libres = this.animalesSinPublicacion(this.animales).filter(a => {
      if (!q) return true;
      return ((a.nombre || '') + ' ' + (a.especie || '') + ' ' + (a.raza || '')).toLowerCase().includes(q);
    });
    if (!libres.length) {
      if (q) return `<p class="web-picker-vacio">Ningún animal sin publicar coincide con la búsqueda.</p>`;
      const enGrupo = this.animalesEnGrupoVigente(this.animales).length;
      return `<p class="web-picker-vacio">${enGrupo ? 'No quedan animales sueltos: los que faltan pertenecen a grupos que ya tienen publicación.' : 'No quedan animales sin publicación web.'}</p>`;
    }
    return libres.map(a => `<div class="web-picker-item">
        <div class="web-picker-datos">
          <b>${this._esc(a.nombre || '—')}</b>
          <span class="web-sub">${this._esc([a.especie, a.estado].filter(Boolean).join(' · '))}</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="crearPublicacionWeb" data-arg0="${this._esc(a.animal_id)}" aria-label="Crear publicación de ${this._esc(a.nombre || 'este animal')}">${(typeof Icons !== 'undefined' && Icons.plus) ? Icons.plus : ''} Crear</button>
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
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) {
      Dashboard.showFormModal('Publicación web', '<div class="modal-loading" role="status" aria-label="Cargando"><div class="page-skeleton"></div><p class="web-sub" style="text-align:center;margin-top:12px">Cargando la publicación…</p></div>');
    }
    try {
      const res = await API.getWebAnimal(animalId);
      const d = res.data || {};
      const origen = res.origen || {};
      const faltan = (res.completitud && res.completitud.faltan) ? res.completitud.faltan.map(f => f.campo) : [];
      this._mostrarFormAnimal(d, origen, faltan);
    } catch (err) {
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      this._snackErr(err, 'No se pudo abrir la publicación web');
    }
  },

  /** Editor visual reutilizable para las descripciones HTML de Publicaciones. */
  _editorHtml(id, label, value, placeholder) {
    const contenido = String(value || '');
    const visualId = id + '-visual';
    const labelId = id + '-label';
    return `<div class="form-group html-editor-field">
      <div class="html-editor-head">
        <label class="form-label" id="${labelId}" for="${visualId}">${label}</label>
        <button type="button" class="html-editor-btn html-editor-mode" data-pass="el" data-action="htmlEditorToggle" data-arg0="${id}" aria-pressed="false" aria-controls="${visualId}" title="Ver el código HTML">HTML</button>
      </div>
      <div class="html-editor" data-html-editor data-editor-id="${id}">
        <div class="html-editor-toolbar" role="toolbar" aria-label="Formato de la descripción">
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="bold" data-arg1="${id}" title="Negrita (Ctrl+B)" aria-label="Negrita"><strong>B</strong></button>
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="italic" data-arg1="${id}" title="Cursiva (Ctrl+I)" aria-label="Cursiva"><em>I</em></button>
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="underline" data-arg1="${id}" title="Subrayado (Ctrl+U)" aria-label="Subrayado"><u>U</u></button>
          <span class="html-editor-sep" aria-hidden="true"></span>
          <select class="html-editor-select" data-change="htmlEditorBlock" data-cpass="value" data-carg0="${id}" aria-label="Formato del párrafo" title="Formato del párrafo"><option value="">Formato</option><option value="p">Texto normal</option><option value="h2">Título</option><option value="h3">Subtítulo</option></select>
          <span class="html-editor-sep" aria-hidden="true"></span>
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="insertUnorderedList" data-arg1="${id}" title="Lista con viñetas" aria-label="Lista con viñetas">• Lista</button>
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="insertOrderedList" data-arg1="${id}" title="Lista numerada" aria-label="Lista numerada">1. Lista</button>
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="createLink" data-arg1="${id}" title="Insertar enlace" aria-label="Insertar enlace">Enlace</button>
          <button type="button" class="html-editor-btn" data-pass="el" data-action="htmlEditorCmd" data-arg0="removeFormat" data-arg1="${id}" title="Quitar formato" aria-label="Quitar formato">Limpiar</button>
        </div>
        <div id="${visualId}" class="html-editor-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${labelId}" data-placeholder="${this._esc(placeholder || '')}" data-input="htmlEditorInput" data-arg0="${id}" spellcheck="true"></div>
        <textarea id="${id}" class="form-input html-editor-source" rows="8" hidden aria-label="${label} en HTML">${this._esc(contenido)}</textarea>
      </div>
      <p class="html-editor-help" data-html-editor-help>Selecciona texto y usa la barra. El botón «HTML» muestra el código.</p>
    </div>`;
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
    const sponsor = animal.sponsor || {};
    const foster = animal.foster || {};
    const loc = animal.location || {};
    const contacto = animal.contact || {};
    const health = animal.health || {};
    this._webFichaForm = d.ficha || d.ficha_json || null;

    const html = `<form data-submit="saveWebAnimal" data-sarg0="${this._esc(d.origen_id || origen.id || '')}">
      <p class="web-form-nivel"><span>Básico</span> Datos para publicar</p>
      <p class="web-nota">Ficha pública de <b>${this._esc(origen.nombre || '')}</b>. Los datos de identidad y salud salen de la ficha interna y no se editan aquí; puedes sobrescribir lo que admite override.</p>
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
            ${CATEGORIAS_PUBLICAS.map(c => `<option ${d.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="web-estado-publico">Estado público *</label>
          <select id="web-estado-publico" class="form-input">
            <option value="auto" ${d.estado_publico_modo === 'manual' ? '' : 'selected'}>Automático · ${this._esc(this._estadoPublicoLabel((d.estado_publico_efectivo || d.estado_publico_derivado || origen.estado_publico_derivado || 'en_adopcion')))}</option>
            ${['en_adopcion', 'en_acogida', 'reservado', 'adoptado', 'cerrado'].map(e => `<option value="${e}" ${d.estado_publico_modo === 'manual' && (d.estado_publico_efectivo || d.estado_publico) === e ? 'selected' : ''}>${this._esc(this._estadoPublicoLabel(e))}</option>`).join('')}
          </select>
          <p class="web-slug-hint">Automático: cambia solo cuando cambia la ficha del animal. Elige un valor para fijarlo (override manual).</p>
        </div>
      </div>
      <div class="form-group"><label for="web-extracto">Extracto</label><textarea id="web-extracto" class="form-input" rows="2" placeholder="Resumen corto para listados y buscador">${this._esc(d.extracto || '')}</textarea></div>
      ${this._editorHtml('web-contenido', 'Descripción pública *', d.contenido_html, '<p>Texto de la ficha pública...</p>')}
      ${this._portadaBasicaHtml('web', cover, d.id, 'si está vacía se usa la foto de la ficha del animal.')}
      ${this._avanzadoIntroHtml()}

      <details class="detail-collapse"><summary>${Icons.fileText} Media extra (galería, vídeos, iconos)</summary>
        <div class="detail-collapse-body">
          <div class="form-group"><label for="web-galeria">Galería (url|alt|pie por línea; alt y pie opcionales)</label><textarea id="web-galeria" class="form-input" rows="3">${this._esc(this.mediaTextoGaleria(gallery))}</textarea></div>
          <div class="form-group"><label for="web-videos">Vídeos (título|url por línea)</label><textarea id="web-videos" class="form-input" rows="2">${this._esc(videos.map(v => (v.title || '') + '|' + (v.url || '')).join('\n'))}</textarea></div>
          <div class="form-group"><label for="web-iconos">Iconos (icono|etiqueta|valor por línea)</label><textarea id="web-iconos" class="form-input" rows="2" placeholder="vacuna|Vacunado|Sí">${this._esc(icons.map(i => (i.icon || '') + '|' + (i.label || '') + '|' + (i.value || '')).join('\n'))}</textarea><p class="web-slug-hint">Claves de icono: edad, ubicacion, caracter, salud, adopcion, acogida, contacto, urgente, hogar.</p></div>
          <div class="form-group"><label for="web-file-galeria">Subir a la galería</label><input type="file" id="web-file-galeria" class="form-input" accept="image/*" multiple data-change="subirMediaWeb" data-cpass="el" data-carg0="galeria" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
          <div class="form-row">
            <div class="form-group"><label for="web-file-video">Subir vídeo</label><input type="file" id="web-file-video" class="form-input" accept="video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="video" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
            <div class="form-group"><label for="web-file-doc">Subir documento</label><input type="file" id="web-file-doc" class="form-input" accept="application/pdf,image/*,video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="documento" data-carg1="web" data-carg2="${this._esc(d.id || '')}"></div>
          </div>
          <div class="form-group"><label for="web-docs">Documentos de la ficha (nombre|url por línea)</label><textarea id="web-docs" class="form-input" rows="2">${this._esc(docsTexto)}</textarea></div>
          <div class="web-media-lista" id="web-media-lista" aria-live="polite"></div>
          <p class="web-nota">Los archivos se guardan en Drive, en la carpeta «${this._esc(carpetaFicha)}». Se comparten las imágenes y los vídeos (los usa la web), no la carpeta; los documentos quedan privados. La portada, la galería y los vídeos se enlazan solos. Los enlaces de carpeta de Drive se ignoran: pega el enlace del archivo.${d.id ? '' : ' Guarda la publicación para poder subir archivos.'}</p>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.paw} Ficha pública del animal</summary>
        <div class="detail-collapse-body">
          <div class="web-heredado">
            <p class="web-heredado-titulo">Datos heredados de la ficha interna (solo lectura)</p>
            <div class="web-heredado-grid">
              ${this._heredadoItem('Nombre', origen.nombre)}
              ${this._heredadoItem('Especie', origen.especie)}
              ${this._heredadoItem('Raza', origen.raza)}
              ${this._heredadoItem('Sexo', origen.sexo)}
              ${this._heredadoItem('Edad', origen.edad)}
              ${this._heredadoItem('Estado interno', origen.estado)}
              ${this._heredadoItem('Estado web automático', this._estadoPublicoLabel(origen.estado_publico_derivado))}
              ${this._heredadoItem('Vacunas', this._heredadoBool(origen.vacunas, 'Sí', 'No'))}
              ${this._heredadoItem('Esterilizado/a', origen.esterilizada ? 'Sí' : 'No')}
              ${this._heredadoItem('Microchip', origen.microchip ? 'Sí' : 'No')}
              ${this._heredadoItem('Desparasitado', origen.desparasitado ? 'Sí' : 'Sin dato')}
              ${this._heredadoItem('Necesidades especiales', origen.necesidades_especiales || 'Sin dato')}
            </div>
            <p class="web-nota">Estos valores salen solos del maestro de animales. No se editan aquí. <button type="button" class="btn btn-outline-green btn-sm" data-action="irFichaAnimalDesdeWeb" data-arg0="${this._esc(d.origen_id || origen.id || '')}">${Icons.eye} Ver ficha interna</button></p>
          </div>
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
            <div class="form-group"><label for="web-adop-fee">Tasa (€)</label><input type="number" id="web-adop-fee" class="form-input" value="${this._esc(adop.feeEur == null ? '' : adop.feeEur)}" step="0.01" min="0" inputmode="decimal"></div>
          </div>
          <div class="form-group"><label for="web-adop-req">Requisitos de adopción</label><textarea id="web-adop-req" class="form-input" rows="2">${this._esc(adop.requirements || '')}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label for="web-sponsor-eur">Apadrinamiento · cuota mensual (€)</label><input type="number" id="web-sponsor-eur" class="form-input" value="${this._esc(sponsor.monthlyEur == null ? '' : sponsor.monthlyEur)}" step="0.01" min="0" inputmode="decimal" placeholder="Ej: 15"></div>
            <div class="form-group"><label for="web-sponsor-notas">Apadrinamiento · notas públicas</label><input type="text" id="web-sponsor-notas" class="form-input" value="${this._esc(sponsor.notes || '')}" placeholder="Apadrinas su alimentación y cuidados"></div>
          </div>
          <p class="web-nota">El apadrinamiento solo se publica si el animal tiene marcado «apadrinable» y está disponible o en acogida.</p>
          <div class="form-row">
            <div class="form-group"><label for="web-foster-temp">Acogida temporal</label>
              <input type="checkbox" id="web-foster-temp" ${foster.temporary ? 'checked' : ''}></div>
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
          <div class="form-row">
            ${[['vaccinated', 'Vacunado', this._heredadoBool(origen.vacunas, 'Sí', 'No')], ['dewormed', 'Desparasitado', this._heredadoBool(origen.desparasitado, 'Sí', 'No')], ['neutered', 'Esterilizado', this._heredadoBool(origen.esterilizada, 'Sí', 'No')], ['microchipped', 'Microchip', this._heredadoBool(origen.microchip, 'Sí', 'No')], ['specialNeeds', 'Necesidades especiales', this._heredadoBool(origen.necesidades_especiales, 'Sí', 'No')]].map(([k, label, heredado]) => `<div class="form-group"><label for="web-health-${k}">${label}</label>
              <select id="web-health-${k}" class="form-input">
                <option value="" ${health[k] === undefined ? 'selected' : ''}>Heredar</option>
                <option value="si" ${health[k] === true ? 'selected' : ''}>Sí</option>
                <option value="no" ${health[k] === false ? 'selected' : ''}>No</option>
              </select><p class="web-slug-hint">Heredado: ${this._esc(heredado)}</p></div>`).join('')}
          </div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} Presentación de la ficha</summary>
        <div class="detail-collapse-body">${this._fichaPresentacionHtml('web-', this._webFichaForm)}</div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} CTA y etiquetas</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="web-cta-label">CTA · etiqueta</label><input type="text" id="web-cta-label" class="form-input" value="${this._esc(cta.label || '')}" placeholder="Quiero adoptar"></div>
            <div class="form-group"><label for="web-cta-url">CTA · URL</label><input type="text" id="web-cta-url" class="form-input" value="${this._esc(cta.url || '')}" placeholder="https://..."></div>
            <div class="form-group"><label for="web-cta-kind">CTA · intención</label>
              <select id="web-cta-kind" class="form-input">
                <option value="" ${cta.kind ? '' : 'selected'}>Enlace normal</option>
                ${['adopcion', 'acogida', 'contacto'].map(k => `<option value="${k}" ${cta.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select></div>
          </div>
          <div class="form-group"><label for="web-tags">Etiquetas (separadas por comas)</label><input type="text" id="web-tags" class="form-input" value="${this._esc((d.tags || []).join(', '))}" placeholder="perro, adopcion"></div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.search} SEO (opcional)</summary>
        <div class="detail-collapse-body">
          ${this._seoGuiaHtml(d)}
          <div class="form-group"><label for="web-seo-title">Meta title</label><input type="text" id="web-seo-title" class="form-input" value="${this._esc(this.seoTitle(d))}" maxlength="70" placeholder="${this._esc(d.titulo || 'Título público')}"><p class="web-slug-hint">Vacío = título público. Ideal: 50–60 caracteres.</p></div>
          <div class="form-group"><label for="web-seo-desc">Meta description</label><textarea id="web-seo-desc" class="form-input" rows="2" maxlength="160" placeholder="${this._esc(String(d.extracto || 'Ej: Luna busca una familia tranquila. Adopción responsable en Bizkaia.').slice(0, 160))}">${this._esc(seo.metaDescription || '')}</textarea><p class="web-slug-hint">Vacío = extracto. Ideal: 140–160 caracteres.</p></div>
          <details class="detail-collapse detail-collapse-inner"><summary>Avanzado SEO · indexación, visibilidad y orden</summary>
            <div class="detail-collapse-body">
              <p class="web-nota">Déjalo como está salvo que necesites ocultar la ficha de Google o de los listados.</p>
              <div class="form-row">
                <div class="form-group"><label><input type="checkbox" id="web-indexable" ${d.indexable !== false ? 'checked' : ''}> Indexable (aparece en sitemap)</label></div>
                <div class="form-group"><label><input type="checkbox" id="web-listed" ${d.listed !== false ? 'checked' : ''}> Visible en listados</label></div>
                <div class="form-group"><label><input type="checkbox" id="web-featured" ${d.featured ? 'checked' : ''}> Destacado</label></div>
                <div class="form-group"><label for="web-orden">Orden</label><input type="number" id="web-orden" class="form-input" value="${Number(d.orden) || 0}"></div>
              </div>
            </div>
          </details>
        </div>
      </details>

      ${faltan.length ? `<p class="web-nota">Pendiente para publicar: ${faltan.map(f => this._esc(f)).join(', ')}.</p>` : ''}
      <div class="form-group"><label style="display:flex;align-items:flex-start;gap:8px"><input type="checkbox" id="web-propagar-ficha" ${''}> <span>Guardar también esta portada/galería/vídeos y documentos en la ficha interna del animal <span class="web-sub">(opcional, desactivado por defecto; reutiliza los mismos archivos)</span></span></label></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar publicación</button></div>
    </form>`;
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) Dashboard.showFormModal('Publicación web · ' + (origen.nombre || 'Animal'), html);
    this._pintarMediaFormulario('web');
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
    // Documentos privados (D8): van en `documents_json`, no dentro de `media_json`.
    const mediaOut = {
      coverImage: { src: norm(txt('web-cover'), 'portada'), alt },
      gallery: galeria,
      videos: videos,
      icons: this.parseIconos(v('web-iconos') ? v('web-iconos').value : '')
    };
    const data = {
      estado_publicacion: txt('web-estado') || 'borrador',
      slug: this.normalizarSlug(txt('web-slug') || txt('web-titulo')),
      titulo: txt('web-titulo'),
      categoria: txt('web-categoria'),
      // `auto` = derivar de la ficha; el resto es override manual.
      estado_publico: txt('web-estado-publico') === 'auto' ? '' : txt('web-estado-publico'),
      estado_publico_modo: txt('web-estado-publico') === 'auto' ? 'auto' : 'manual',
      extracto: txt('web-extracto'),
      contenido_html: v('web-contenido') ? v('web-contenido').value : '',
      indexable: checked('web-indexable'),
      listed: checked('web-listed'),
      featured: checked('web-featured'),
      orden: Number(txt('web-orden')) || 0,
      media: mediaOut,
      documents: documentos,
      tags: this.parseLista(txt('web-tags')),
      cta: txt('web-cta-label') && txt('web-cta-url')
        ? Object.assign({ label: txt('web-cta-label'), url: txt('web-cta-url') }, txt('web-cta-kind') ? { kind: txt('web-cta-kind') } : {})
        : null,
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
        sponsor: this.sponsorDeFormulario(txt('web-sponsor-eur'), txt('web-sponsor-notas')),
        foster: { temporary: checked('web-foster-temp'), durationLabel: txt('web-foster-dur') },
        location: { city: txt('web-loc-city'), province: txt('web-loc-prov') },
        contact: { email: txt('web-contact-email'), phone: txt('web-contact-tel') },
        health: (() => {
          const salud = {};
          [['vaccinated', 'web-health-vaccinated'], ['dewormed', 'web-health-dewormed'],
            ['neutered', 'web-health-neutered'], ['microchipped', 'web-health-microchipped'],
            ['specialNeeds', 'web-health-specialNeeds']].forEach(([k, id]) => {
            const val = txt(id);
            if (val === 'si') salud[k] = true;
            else if (val === 'no') salud[k] = false;
          });
          return salud;
        })()
      }
    };
    const ficha = this._leerFichaPresentacion('web-');
    if (ficha) data.ficha = ficha;
    return data;
  },

  /**
   * Ficha configurable (C3) desde los controles: conserva los extras del JSON
   * avanzado y no envía nada si no había ficha y todo sigue por defecto.
   */
  _fichaPresentacion(previa, cfg) {
    const FC = typeof FichaConfig !== 'undefined' ? FichaConfig : null;
    const norm = FC && typeof FC.normalizarFicha === 'function' ? FC.normalizarFicha(cfg) : cfg;
    if (!norm) return undefined;
    const base = FC && typeof FC.normalizarFicha === 'function' ? FC.normalizarFicha(previa) : previa;
    const out = {
      plantilla: norm.plantilla,
      bloques: norm.bloques,
      orden: norm.orden,
      videoModo: norm.videoModo === 'embed' ? 'embed' : 'enlace',
      mostrarLectura: norm.mostrarLectura
    };
    ['icons', 'gallery', 'videos', 'cta'].forEach(k => { if (base && base[k]) out[k] = base[k]; });
    // Etiquetas propias: vacío = heredar las de la publicación (no se envía).
    if (Array.isArray(norm.tags) && norm.tags.length) out.tags = norm.tags;
    const ordenDef = (FC && FC.ORDEN_DEF ? FC.ORDEN_DEF : ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta']).join(',');
    const porDefecto = out.plantilla === 'ficha' && out.mostrarLectura && out.videoModo === 'enlace' &&
      Object.keys(out.bloques || {}).every(k => out.bloques[k] === true) &&
      out.orden.join(',') === ordenDef && !out.tags;
    if (!base && porDefecto) return undefined;
    return out;
  },

  _leerFichaPresentacion(prefijo) {
    const el = id => document.getElementById(prefijo + id);
    const bloques = {};
    [['datos', 'bloque-datos'], ['etiquetas', 'bloque-etiquetas'], ['contenido', 'bloque-contenido'],
      ['galeria', 'bloque-galeria'], ['videos', 'bloque-videos'], ['fichaAnimal', 'bloque-animal'],
      ['cta', 'bloque-cta']]
      .forEach(([clave, id]) => { const c = el(id); bloques[clave] = c ? !!c.checked : true; });
    const sel = el('ficha-plantilla');
    const lectura = el('ficha-lectura');
    const modo = el('ficha-video-modo');
    const tagsInput = el('ficha-tags');
    const ordenInput = el('ficha-orden');
    let orden;
    if (ordenInput && ordenInput.value) {
      try { orden = JSON.parse(ordenInput.value); } catch (e) { orden = undefined; }
    }
    return this._fichaPresentacion(this._webFichaForm, {
      plantilla: sel && sel.value === 'historia' ? 'historia' : 'ficha',
      bloques: bloques,
      orden: orden,
      videoModo: modo && modo.value === 'embed' ? 'embed' : 'enlace',
      mostrarLectura: lectura ? !!lectura.checked : true,
      tags: tagsInput ? this.parseLista(tagsInput.value) : []
    });
  },

  /** Sube/baja un bloque en el orden de la ficha (botones ↑/↓ del gestor). */
  moverFichaBloque(el, dir) {
    const prefijo = (el && el.getAttribute && el.getAttribute('data-prefijo')) || 'web-';
    const lista = document.getElementById(prefijo + 'ficha-orden-lista');
    const input = document.getElementById(prefijo + 'ficha-orden');
    if (!lista || !input) return;
    const filas = Array.from(lista.querySelectorAll('[data-bloque]'));
    const fila = el && el.closest ? el.closest('[data-bloque]') : null;
    const idx = filas.indexOf(fila);
    const nuevo = idx + Number(dir || 0);
    if (idx < 0 || nuevo < 0 || nuevo >= filas.length) return;
    if (nuevo > idx) filas[nuevo].after(fila); else filas[nuevo].before(fila);
    const orden = Array.from(lista.querySelectorAll('[data-bloque]')).map(f => f.getAttribute('data-bloque'));
    input.value = JSON.stringify(orden);
    Array.from(lista.querySelectorAll('[data-bloque]')).forEach((f, i) => {
      const arriba = f.querySelector('[data-mover="-1"]');
      const abajo = f.querySelector('[data-mover="1"]');
      if (arriba) arriba.disabled = i === 0;
      if (abajo) abajo.disabled = i === lista.querySelectorAll('[data-bloque]').length - 1;
    });
  },

  /** Controles de presentación de la ficha (plantilla, bloques, orden, vídeo y lectura). */
  _fichaPresentacionHtml(prefijo, ficha, incluirAnimal) {
    const FC = typeof FichaConfig !== 'undefined' ? FichaConfig : null;
    const cfg = (FC && typeof FC.normalizarFicha === 'function' ? FC.normalizarFicha(ficha) : ficha) || {};
    const def = (FC && FC.BLOQUES_DEF) || { datos: true, etiquetas: true, contenido: true, galeria: true, videos: true, fichaAnimal: true, cta: true };
    const b = Object.assign({}, def, cfg.bloques || {});
    const orden = (FC && typeof FC.normalizarOrden === 'function' ? FC.normalizarOrden(cfg.orden) : (FC && FC.ORDEN_DEF) || Object.keys(def));
    const labels = {
      datos: 'Datos destacados',
      etiquetas: 'Etiquetas',
      contenido: 'Sobre este caso',
      galeria: 'Galería',
      videos: 'Vídeos',
      fichaAnimal: 'Ficha del animal',
      cta: 'Botones CTA'
    };
    const ids = { datos: 'datos', etiquetas: 'etiquetas', contenido: 'contenido', galeria: 'galeria', videos: 'videos', fichaAnimal: 'animal', cta: 'cta' };
    const bloques = orden.filter(k => incluirAnimal !== false || k !== 'fichaAnimal');
    const videoModo = cfg.videoModo === 'embed' ? 'embed' : 'enlace';
    const tags = Array.isArray(cfg.tags) ? cfg.tags.join(', ') : '';
    return `<div class="form-group"><label for="${prefijo}ficha-plantilla">Plantilla de la ficha</label>
        <select id="${prefijo}ficha-plantilla" class="form-input">
          <option value="ficha" ${cfg.plantilla !== 'historia' ? 'selected' : ''}>Ficha (datos y animal)</option>
          <option value="historia" ${cfg.plantilla === 'historia' ? 'selected' : ''}>Historia (sin ficha de animal)</option>
        </select></div>
      <div class="form-group"><label>Bloques y orden</label>
        <div class="web-bloques-orden" id="${prefijo}ficha-orden-lista">
          ${bloques.map((k, i) => `<div class="web-bloque-fila" data-bloque="${this._esc(k)}">
            <label class="web-bloque-check"><input type="checkbox" id="${prefijo}bloque-${ids[k] || k}" ${b[k] !== false ? 'checked' : ''}> ${labels[k] || k}</label>
            <span class="web-bloque-controles">
              <button type="button" class="btn btn-outline-green btn-sm" data-action="moverFichaBloque" data-pass="el" data-arg0="-1" data-prefijo="${this._esc(prefijo)}" data-mover="-1" aria-label="Subir ${labels[k] || k}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn btn-outline-green btn-sm" data-action="moverFichaBloque" data-pass="el" data-arg0="1" data-prefijo="${this._esc(prefijo)}" data-mover="1" aria-label="Bajar ${labels[k] || k}" ${i === bloques.length - 1 ? 'disabled' : ''}>↓</button>
            </span>
          </div>`).join('')}
        </div>
        <input type="hidden" id="${prefijo}ficha-orden" value="${this._esc(JSON.stringify(orden))}">
      </div>
      <div class="form-row">
        <div class="form-group"><label for="${prefijo}ficha-video-modo">Vídeos</label>
          <select id="${prefijo}ficha-video-modo" class="form-input">
            <option value="enlace" ${videoModo !== 'embed' ? 'selected' : ''}>Enlace externo (sin cookies)</option>
            <option value="embed" ${videoModo === 'embed' ? 'selected' : ''}>Reproductor integrado (click-to-load)</option>
          </select></div>
        <div class="form-group"><label for="${prefijo}ficha-tags">Etiquetas de la ficha (vacío = heredar)</label>
          <input type="text" id="${prefijo}ficha-tags" class="form-input" value="${this._esc(tags)}" placeholder="perro, adopcion"></div>
      </div>
      <div class="form-group"><label><input type="checkbox" id="${prefijo}ficha-lectura" ${cfg.mostrarLectura !== false ? 'checked' : ''}> Mostrar tiempo de lectura</label></div>
      <p class="web-slug-hint">El orden manda en la ficha y en el prerender; los listados no cargan la ficha. Si no tocas nada se mantiene el comportamiento actual.</p>`;
  },

  _leerArchivoBase64(file) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result || ''));
      lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
      lector.readAsDataURL(file);
    });
  },

  /** Identificador de un archivo de Drive a partir de su enlace. */
  driveFileId(url) {
    const s = String(url || '');
    let m = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  },

  /**
   * Archivos de Drive enlazados en el formulario, para poder borrarlos.
   * `campos`: {cover, galeria, videos, docs} con el texto tal cual está.
   */
  extraerMediaFormulario(campos) {
    const c = campos || {};
    const salida = [];
    const vistos = {};
    const push = (url, tipo, etiqueta) => {
      const fileId = this.driveFileId(url);
      if (!fileId || vistos[fileId]) return;
      vistos[fileId] = true;
      salida.push({ fileId, url: String(url || ''), tipo, etiqueta: etiqueta || tipo });
    };
    push(c.cover, 'portada', 'Portada');
    String(c.galeria || '').split('\n').forEach(l => push(String(l).split('|')[0], 'galeria', 'Galería'));
    String(c.videos || '').split('\n').forEach(l => push(String(l).split('|')[1], 'video', 'Vídeo'));
    String(c.docs || '').split('\n').forEach(l => {
      const p = String(l).split('|');
      push(p[1] || p[0], 'documento', (p[0] || 'Documento').trim());
    });
    return salida;
  },

  /** Quita de un texto multilínea las líneas que apuntan a un archivo. */
  quitarMediaDeTexto(texto, fileId) {
    return String(texto || '').split('\n')
      .filter(l => this.driveFileId(l) !== fileId)
      .join('\n');
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
      this._pintarMediaFormulario(prefijo);
      this._snack('Archivo(s) subidos a la carpeta de la ficha');
    } catch (err) {
      this._snackErr(err, 'No se pudo subir: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  /** Chips con los archivos de Drive enlazados en el formulario. */
  _mediaFormularioHtml(prefijo) {
    const v = sufijo => { const el = document.getElementById(prefijo + sufijo); return el ? String(el.value || '') : ''; };
    const lista = this.extraerMediaFormulario({ cover: v('-cover'), galeria: v('-galeria'), videos: v('-videos'), docs: v('-docs') });
    if (!lista.length) return '';
    return '<p class="web-media-titulo">Archivos en Drive de esta ficha</p>' + lista.map(m =>
      `<span class="web-media-chip">${this._esc(m.etiqueta)}<button type="button" class="web-media-chip-x" data-action="borrarMediaWeb" data-pass="el" data-file-id="${this._esc(m.fileId)}" data-prefijo="${this._esc(prefijo)}" aria-label="Borrar ${this._esc(m.etiqueta)} de Drive">×</button></span>`
    ).join('');
  },

  _pintarMediaFormulario(prefijo) {
    const cont = document.getElementById(prefijo + '-media-lista');
    if (cont) cont.innerHTML = this._mediaFormularioHtml(prefijo);
  },

  /** Borra el archivo de Drive y lo quita de los campos del formulario. */
  async borrarMediaWeb(el) {
    const fileId = el && el.getAttribute('data-file-id');
    const prefijo = (el && el.getAttribute('data-prefijo')) || 'web';
    if (!fileId) return;
    if (typeof window !== 'undefined' && window.confirm && !window.confirm('¿Borrar este archivo de Drive? No se puede deshacer.')) return;
    try {
      await API.eliminarMediaWeb(fileId);
      ['-cover', '-galeria', '-videos', '-docs'].forEach(sufijo => {
        const campo = document.getElementById(prefijo + sufijo);
        if (!campo) return;
        campo.value = sufijo === '-cover'
          ? (this.driveFileId(campo.value) === fileId ? '' : campo.value)
          : this.quitarMediaDeTexto(campo.value, fileId);
      });
      this._pintarMediaFormulario(prefijo);
      this._snack('Archivo borrado de Drive. Guarda la publicación para quitar el enlace.');
    } catch (err) {
      this._snackErr(err, 'No se pudo borrar el archivo: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async guardarAnimal(e, animalId) {
    if (e && e.preventDefault) e.preventDefault();
    const fin = (typeof Dashboard !== 'undefined' && Dashboard._guardando) ? Dashboard._guardando(e && e.target) : () => {};
    if (!fin) return;
    const datos = this._leerFormAnimal();
    const propagar = !!document.getElementById('web-propagar-ficha') && document.getElementById('web-propagar-ficha').checked;
    const ignorados = this._mediaIgnorados;
    if (!datos.titulo) { this._snack('Falta el título público', 'warning'); fin(); return; }
    try {
      const res = await API.saveWebAnimal({ animal_id: animalId, ...datos });
      if (propagar) {
        try { await this._propagarMediaAFicha(animalId, datos, res); }
        catch (errProp) { this._snack('Publicación guardada, pero no se pudo actualizar la ficha interna: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(errProp) : ''), 'warning'); }
      }
      fin();
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      const aviso = this.avisoDeploy(res, ignorados
        ? 'Publicación guardada; se ignoraron ' + ignorados + ' enlace(s) de carpeta de Drive'
        : (propagar ? 'Publicación guardada y ficha interna actualizada' : 'Publicación guardada'));
      this._snack(aviso.texto, aviso.tipo || (ignorados ? 'warning' : undefined));
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
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) {
      Dashboard.showFormModal('Publicación web', '<div class="modal-loading" role="status" aria-label="Cargando"><div class="page-skeleton"></div><p class="web-sub" style="text-align:center;margin-top:12px">Cargando la publicación…</p></div>');
    }
    try {
      const res = await API.getWebEvento(id);
      this._mostrarFormEvento(res.data || {}, (res.completitud && res.completitud.faltan) ? res.completitud.faltan.map(f => f.campo) : []);
    } catch (err) {
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
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

    const html = `<form data-submit="saveWebEvento" data-sarg0="${this._esc(d.id || '')}">
      <p class="web-form-nivel"><span>Básico</span> Datos para publicar</p>
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
        <div class="form-group"><label for="we-categoria">Categoría *</label><input type="text" id="we-categoria" class="form-input" list="we-categorias" value="${this._esc(d.categoria || (d.tipo === 'historia' ? 'Historias' : 'Eventos'))}"><datalist id="we-categorias">${CATEGORIAS_PUBLICAS.map(c => `<option value="${c}">`).join('')}</datalist></div>
        <div class="form-group"><label for="we-estado-publico">Estado público</label><input type="text" id="we-estado-publico" class="form-input" value="${this._esc(d.estado_publico || (d.tipo === 'historia' ? 'publicado' : 'programado'))}" placeholder="programado / activo / finalizado"></div>
      </div>
      <div class="form-group"><label for="we-extracto">Extracto</label><textarea id="we-extracto" class="form-input" rows="2">${this._esc(d.extracto || '')}</textarea></div>
      ${this._editorHtml('we-contenido', 'Contenido *', d.contenido_html, '<p>Cuenta la historia, el evento o la novedad...</p>')}
      ${this._portadaBasicaHtml('we', cover, d.id, 'si está vacía, no se añade una portada nueva.')}
      ${this._avanzadoIntroHtml()}

      <details class="detail-collapse"><summary>${Icons.fileText} Media extra (galería y documentos)</summary>
        <div class="detail-collapse-body">
          <div class="form-group"><label for="we-galeria">Galería (url|alt|pie por línea; alt y pie opcionales)</label><textarea id="we-galeria" class="form-input" rows="2">${this._esc(this.mediaTextoGaleria(gallery))}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label for="we-file-galeria">Subir a la galería</label><input type="file" id="we-file-galeria" class="form-input" accept="image/*" multiple data-change="subirMediaWeb" data-cpass="el" data-carg0="galeria" data-carg1="we" data-carg2="${this._esc(d.id || '')}"></div>
            <div class="form-group"><label for="we-file-doc">Subir documento</label><input type="file" id="we-file-doc" class="form-input" accept="application/pdf,image/*,video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="documento" data-carg1="we" data-carg2="${this._esc(d.id || '')}"></div>
          </div>
          <div class="form-group"><label for="we-docs">Documentos (nombre|url por línea)</label><textarea id="we-docs" class="form-input" rows="2">${this._esc(docsTexto)}</textarea></div>
          <div class="web-media-lista" id="we-media-lista" aria-live="polite"></div>
          <p class="web-nota">Los archivos se guardan en Drive, en la carpeta «${this._esc(carpetaFicha)}». Se comparten las imágenes y los vídeos, no la carpeta; los documentos quedan privados. Los enlaces de carpeta de Drive se ignoran: pega el enlace del archivo.${d.id ? '' : ' Guarda la publicación para poder subir archivos.'}</p>
        </div>
      </details>

      <details class="detail-collapse" id="we-event-details"><summary>${Icons.calendar} Datos del evento</summary>
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

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} Presentación de la ficha</summary>
        <div class="detail-collapse-body">${this._fichaPresentacionHtml('we-', this._webFichaForm, false)}</div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} CTA y etiquetas</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="we-cta-label">CTA · etiqueta</label><input type="text" id="we-cta-label" class="form-input" value="${this._esc(cta.label || '')}"></div>
            <div class="form-group"><label for="we-cta-url">CTA · URL</label><input type="text" id="we-cta-url" class="form-input" value="${this._esc(cta.url || '')}"></div>
            <div class="form-group"><label for="we-cta-kind">CTA · intención</label>
              <select id="we-cta-kind" class="form-input">
                <option value="" ${cta.kind ? '' : 'selected'}>Enlace normal</option>
                ${['adopcion', 'acogida', 'contacto'].map(k => `<option value="${k}" ${cta.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select></div>
          </div>
          <div class="form-group"><label for="we-tags">Etiquetas (separadas por comas)</label><input type="text" id="we-tags" class="form-input" value="${this._esc((d.tags || []).join(', '))}"></div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.search} SEO (opcional)</summary>
        <div class="detail-collapse-body">
          ${this._seoGuiaHtml(d)}
          <div class="form-group"><label for="we-seo-title">Meta title</label><input type="text" id="we-seo-title" class="form-input" value="${this._esc(this.seoTitle(d))}" maxlength="70" placeholder="${this._esc(d.titulo || 'Título público')}"><p class="web-slug-hint">Vacío = título público. Ideal: 50–60 caracteres.</p></div>
          <div class="form-group"><label for="we-seo-desc">Meta description</label><textarea id="we-seo-desc" class="form-input" rows="2" maxlength="160" placeholder="${this._esc(String(d.extracto || 'Ej: Jornada de puertas abiertas para conocer a los animales del refugio.').slice(0, 160))}">${this._esc(seo.metaDescription || '')}</textarea><p class="web-slug-hint">Vacío = extracto. Ideal: 140–160 caracteres.</p></div>
          <details class="detail-collapse detail-collapse-inner"><summary>Avanzado SEO · indexación y visibilidad</summary>
            <div class="detail-collapse-body">
              <p class="web-nota">Déjalo como está salvo que necesites ocultar la ficha de Google o de los listados.</p>
              <div class="form-row">
                <div class="form-group"><label><input type="checkbox" id="we-indexable" ${d.indexable !== false ? 'checked' : ''}> Indexable</label></div>
                <div class="form-group"><label><input type="checkbox" id="we-listed" ${d.listed !== false ? 'checked' : ''}> Visible en listados</label></div>
                <div class="form-group"><label><input type="checkbox" id="we-featured" ${d.featured ? 'checked' : ''}> Destacado</label></div>
              </div>
            </div>
          </details>
        </div>
      </details>

      ${faltan && faltan.length ? `<p class="web-nota">Pendiente para publicar: ${faltan.map(f => this._esc(f)).join(', ')}.</p>` : ''}
      <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar publicación</button></div>
    </form>`;
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) Dashboard.showFormModal((d.tipo === 'historia' ? 'Historia web' : 'Evento web') + (d.id ? '' : ' · nueva'), html);
    this._pintarMediaFormulario('we');
  },

  async _propagarMediaAFicha(animalId, datos, res) {
    if (!animalId || typeof API === 'undefined' || typeof API.updateAnimal !== 'function') return;
    const media = (datos && datos.media) || {};
    const cover = media.coverImage || {};
    const galeria = Array.isArray(media.gallery) ? media.gallery : [];
    const videos = Array.isArray(media.videos) ? media.videos : [];
    const documentos = Array.isArray(datos.documents) ? datos.documents : (Array.isArray(media.documents) ? media.documents : []);
    const actualiza = {};
    if (cover.src) { actualiza.portada_url = cover.src; actualiza.portada_alt = cover.alt || ''; }
    if (galeria.length) actualiza.galeria = JSON.stringify(galeria);
    if (videos.length) actualiza.videos = JSON.stringify(videos);
    if (documentos.length) actualiza.documentos_internos = JSON.stringify(documentos);
    if (!Object.keys(actualiza).length) return;
    await API.updateAnimal(animalId, actualiza);
    if (typeof Dashboard !== 'undefined' && Dashboard._byId && Array.isArray(Dashboard.animales)) {
      const a = Dashboard._byId(Dashboard.animales, animalId);
      if (a) Object.assign(a, actualiza);
    }
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
    const mediaOut = {
      coverImage: { src: norm(txt('we-cover'), 'portada'), alt },
      gallery: galeria
    };
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
      media: mediaOut,
      documents: documentos,
      tags: this.parseLista(txt('we-tags')),
      cta: txt('we-cta-label') && txt('we-cta-url')
        ? Object.assign({ label: txt('we-cta-label'), url: txt('we-cta-url') }, txt('we-cta-kind') ? { kind: txt('we-cta-kind') } : {})
        : null,
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
    const ficha = this._leerFichaPresentacion('we-');
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
      const res = await API.saveWebEvento({ id: id || undefined, ...datos });
      fin();
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      const aviso = this.avisoDeploy(res, ignorados
        ? 'Publicación guardada; se ignoraron ' + ignorados + ' enlace(s) de carpeta de Drive'
        : 'Publicación guardada');
      this._snack(aviso.texto, aviso.tipo || (ignorados ? 'warning' : undefined));
      await this.recargar();
    } catch (err) {
      fin();
      this._snackErr(err, 'No se pudo guardar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  // ==================== GRUPOS / CAMADAS (adopción conjunta) ====================

  /** Selector de grupos sin publicación web: crea el borrador virtual y abre el formulario. */
  async nuevaPublicacionGrupo() {
    try {
      const res = await API.getWebGrupos({ todos: '1' });
      const grupos = ((res && res.data) || []).filter(g => g && !g.publicacion_id);
      const html = this._pickerGrupoHtml(grupos);
      if (typeof Dashboard !== 'undefined' && Dashboard.showInfoModal) {
        Dashboard.showInfoModal('Publicar grupo', html);
      }
    } catch (err) {
      this._snackErr(err, 'No se pudieron cargar los grupos: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  _pickerGrupoHtml(grupos) {
    const lista = Array.isArray(grupos) ? grupos.filter(g => g && !g.publicacion_id) : [];
    if (!lista.length) {
      return `<p class="web-picker-vacio">No quedan grupos sin publicación web. Los grupos se crean al dar de alta animales con el mismo <b>Grupo / Camada</b>.</p>`;
    }
    return `<p class="web-nota">Solo grupos sin publicación web (${lista.length}). Los miembros y sus datos internos no se exponen: la ficha pública solo muestra el resumen permitido.</p>
      <div class="web-picker-lista">${lista.map(g => `<div class="web-picker-item">
        <div class="web-picker-datos">
          <b>${this._esc(g.nombre || '—')}</b>
          <span class="web-sub">${Number(g.miembros_count) || 0} miembro${Number(g.miembros_count) === 1 ? '' : 's'}${g.grupo_obligatorio ? ' · grupo obligatorio' : ''}${g.urgente ? ' · urgente' : ''}</span>
          <span class="web-sub">${this._esc((g.miembros_nombres || []).join(', ') || '—')}</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="abrirGrupoWeb" data-arg0="${this._esc(g.grupo_id)}">${Icons.plus} Crear</button>
      </div>`).join('')}</div>`;
  },

  async abrirGrupo(grupoId) {
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) {
      Dashboard.showFormModal('Publicación web', '<div class="modal-loading" role="status" aria-label="Cargando"><div class="page-skeleton"></div><p class="web-sub" style="text-align:center;margin-top:12px">Cargando la publicación…</p></div>');
    }
    try {
      const res = await API.getWebGrupo(grupoId);
      const d = res.data || {};
      const origen = res.origen || {};
      const faltan = (res.completitud && res.completitud.faltan) ? res.completitud.faltan.map(f => f.campo) : [];
      this._mostrarFormGrupo(d, origen, faltan);
    } catch (err) {
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      this._snackErr(err, 'No se pudo abrir la publicación del grupo');
    }
  },

  _mostrarFormGrupo(d, origen, faltan) {
    const media = d.media || {};
    const seo = d.seo || {};
    const group = d.group || d.animal || {};
    const cover = media.coverImage || {};
    const gallery = Array.isArray(media.gallery) ? media.gallery : [];
    const icons = Array.isArray(media.icons) ? media.icons : [];
    const videos = Array.isArray(media.videos) ? media.videos : [];
    const documents = Array.isArray(media.documents) ? media.documents : [];
    const docsTexto = documents.map(x => (x.name || '') + '|' + (x.url || '')).join('\n');
    const carpetaFicha = this._carpetaFicha('animal_grupo', d.slug);
    const cta = d.cta || {};
    const compat = group.compatibility || {};
    const adop = group.adoption || {};
    const foster = group.foster || {};
    const loc = group.location || {};
    const contacto = group.contact || {};
    const miembros = Array.isArray(origen.miembros) ? origen.miembros : [];
    const modoAuto = d.estado_publico_modo !== 'manual';
    const derivado = d.estado_publico_derivado || origen.estado_publico_derivado || 'en_adopcion';
    this._webFichaForm = d.ficha || d.ficha_json || null;

    const html = `<form data-submit="guardarGrupoWeb" data-sarg0="${this._esc(d.origen_id || origen.id || '')}">
      <p class="web-form-nivel"><span>Básico</span> Datos para publicar</p>
      <p class="web-nota">Ficha pública del grupo <b>${this._esc(origen.nombre || d.titulo || '')}</b> · ${Number(origen.miembros_count) || miembros.length} miembro${(Number(origen.miembros_count) || miembros.length) === 1 ? '' : 's'}. Los datos de cada animal salen de su ficha interna y aquí solo se edita la presentación conjunta.</p>
      <div class="form-row">
        <div class="form-group"><label for="wg-estado">Estado de publicación *</label>
          <select id="wg-estado" class="form-input">
            ${['borrador', 'publicado', 'oculto'].map(e => `<option value="${e}" ${(d.estado_publicacion || 'borrador') === e ? 'selected' : ''}>${this.estadoLabel(e)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="wg-slug">Slug *</label>
          <input type="text" id="wg-slug" class="form-input" value="${this._esc(d.slug || '')}" placeholder="camada-luna" data-change="onWebSlugChange" data-cpass="el" data-carg0="${this._esc(d.id || '')}" data-carg1="animal_grupo">
          <p id="web-slug-hint" class="web-slug-hint"></p>${this.historialSlugHtml(d.slug_historial)}</div>
      </div>
      <div class="form-group"><label for="wg-titulo">Título público *</label><input type="text" id="wg-titulo" class="form-input" value="${this._esc(d.titulo || origen.nombre || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label for="wg-categoria">Categoría pública *</label>
          <select id="wg-categoria" class="form-input">
            <option value="">Seleccionar...</option>
            ${['Gatos en adopción', 'Perros en adopción', 'Acogidas', 'Adoptados', 'Cerrados', 'En adopción'].map(c => `<option ${d.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="wg-estado-publico">Estado público *</label>
          <select id="wg-estado-publico" class="form-input">
            <option value="auto" ${modoAuto ? 'selected' : ''}>Automático · ${this._esc(this._estadoPublicoLabel(derivado))}</option>
            ${['en_adopcion', 'en_acogida', 'reservado', 'adoptado', 'cerrado'].map(e => `<option value="${e}" ${!modoAuto && (d.estado_publico_efectivo || d.estado_publico) === e ? 'selected' : ''}>${this._esc(this._estadoPublicoLabel(e))}</option>`).join('')}
          </select>
          <p class="web-slug-hint">Automático: se agrega de los estados de los miembros (todos adoptados, alguno reservado, etc.). Elige un valor para fijarlo.</p>
        </div>
      </div>
      <div class="form-group"><label for="wg-extracto">Extracto</label><textarea id="wg-extracto" class="form-input" rows="2" placeholder="Resumen corto para listados y buscador">${this._esc(d.extracto || '')}</textarea></div>
      ${this._editorHtml('wg-contenido', 'Descripción pública *', d.contenido_html, '<p>Historia del grupo, cómo son y qué buscan...</p>')}
      ${this._portadaBasicaHtml('wg', cover, d.id, 'si está vacía se usa la primera foto disponible de los miembros.')}
      ${this._avanzadoIntroHtml()}

      <details class="detail-collapse"><summary>${Icons.fileText} Media extra (galería, vídeos, iconos)</summary>
        <div class="detail-collapse-body">
          <div class="form-group"><label for="wg-galeria">Galería (url|alt|pie por línea; alt y pie opcionales)</label><textarea id="wg-galeria" class="form-input" rows="3">${this._esc(this.mediaTextoGaleria(gallery))}</textarea></div>
          <div class="form-group"><label for="wg-videos">Vídeos (título|url por línea)</label><textarea id="wg-videos" class="form-input" rows="2">${this._esc(videos.map(v => (v.title || '') + '|' + (v.url || '')).join('\n'))}</textarea></div>
          <div class="form-group"><label for="wg-iconos">Iconos (icono|etiqueta|valor por línea)</label><textarea id="wg-iconos" class="form-input" rows="2" placeholder="vacuna|Vacunado|Sí">${this._esc(icons.map(i => (i.icon || '') + '|' + (i.label || '') + '|' + (i.value || '')).join('\n'))}</textarea><p class="web-slug-hint">Claves de icono: edad, ubicacion, caracter, salud, adopcion, acogida, contacto, urgente, hogar.</p></div>
          <div class="form-group"><label for="wg-file-galeria">Subir a la galería</label><input type="file" id="wg-file-galeria" class="form-input" accept="image/*" multiple data-change="subirMediaWeb" data-cpass="el" data-carg0="galeria" data-carg1="wg" data-carg2="${this._esc(d.id || '')}"></div>
          <div class="form-row">
            <div class="form-group"><label for="wg-file-video">Subir vídeo</label><input type="file" id="wg-file-video" class="form-input" accept="video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="video" data-carg1="wg" data-carg2="${this._esc(d.id || '')}"></div>
            <div class="form-group"><label for="wg-file-doc">Subir documento</label><input type="file" id="wg-file-doc" class="form-input" accept="application/pdf,image/*,video/*" data-change="subirMediaWeb" data-cpass="el" data-carg0="documento" data-carg1="wg" data-carg2="${this._esc(d.id || '')}"></div>
          </div>
          <div class="form-group"><label for="wg-docs">Documentos de la ficha (nombre|url por línea)</label><textarea id="wg-docs" class="form-input" rows="2">${this._esc(docsTexto)}</textarea></div>
          <div class="web-media-lista" id="wg-media-lista" aria-live="polite"></div>
          <p class="web-nota">Los archivos se guardan en Drive, en la carpeta «${this._esc(carpetaFicha)}». Se comparten las imágenes y los vídeos (los usa la web), no la carpeta; los documentos quedan privados. Los enlaces de carpeta de Drive se ignoran: pega el enlace del archivo.${d.id ? '' : ' Guarda la publicación para poder subir archivos.'}</p>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.users || Icons.paw} Miembros del grupo (solo lectura)</summary>
        <div class="detail-collapse-body">
          <div class="web-heredado">
            <p class="web-heredado-titulo">Resumen público de los miembros (sale de la ficha interna)</p>
            <div class="web-heredado-grid">
              ${miembros.map(m => this._heredadoItem(m.nombre, [m.especie, m.raza, m.edad].filter(Boolean).join(' · '))).join('') || '<p class="web-sub">El grupo no tiene miembros.</p>'}
            </div>
            <p class="web-nota">Estado público derivado: <b>${this._esc(this._estadoPublicoLabel(derivado))}</b>${origen.urgente ? ' · urgente' : ''}. Los miembros se añaden o quitan desde la ficha interna de cada animal; aquí solo se publica el conjunto.</p>
          </div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.paw} Presentación conjunta del grupo</summary>
        <div class="detail-collapse-body">
          <div class="form-group"><label for="wg-temperamento">Temperamento del grupo (separado por comas)</label><input type="text" id="wg-temperamento" class="form-input" value="${this._esc((group.temperament || []).join(', '))}"></div>
          <div class="form-row">
            <div class="form-group"><label for="wg-compat-perros">Compatibilidad con perros</label><input type="text" id="wg-compat-perros" class="form-input" value="${this._esc(compat.dogs || '')}"></div>
            <div class="form-group"><label for="wg-compat-gatos">Compatibilidad con gatos</label><input type="text" id="wg-compat-gatos" class="form-input" value="${this._esc(compat.cats || '')}"></div>
            <div class="form-group"><label for="wg-compat-ninos">Compatibilidad con niños</label><input type="text" id="wg-compat-ninos" class="form-input" value="${this._esc(compat.kids || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="wg-adop-mode">Modalidad de adopción</label><input type="text" id="wg-adop-mode" class="form-input" value="${this._esc(adop.mode || '')}" placeholder="conjunta / presencial"></div>
            <div class="form-group"><label for="wg-adop-fee">Tasa (€)</label><input type="number" id="wg-adop-fee" class="form-input" value="${this._esc(adop.feeEur == null ? '' : adop.feeEur)}" step="0.01" min="0" inputmode="decimal"></div>
          </div>
          <div class="form-group"><label for="wg-adop-req">Requisitos de adopción</label><textarea id="wg-adop-req" class="form-input" rows="2">${this._esc(adop.requirements || '')}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label for="wg-foster-temp">Acogida temporal</label>
              <input type="checkbox" id="wg-foster-temp" ${foster.temporary ? 'checked' : ''}></div>
            <div class="form-group"><label for="wg-foster-dur">Duración de la acogida</label><input type="text" id="wg-foster-dur" class="form-input" value="${this._esc(foster.durationLabel || '')}" placeholder="Ej: 3 meses"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="wg-loc-city">Ciudad</label><input type="text" id="wg-loc-city" class="form-input" value="${this._esc(loc.city || '')}"></div>
            <div class="form-group"><label for="wg-loc-prov">Provincia</label><input type="text" id="wg-loc-prov" class="form-input" value="${this._esc(loc.province || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="wg-contact-email">Email de contacto</label><input type="email" id="wg-contact-email" class="form-input" value="${this._esc(contacto.email || '')}"></div>
            <div class="form-group"><label for="wg-contact-tel">Teléfono de contacto</label><input type="text" id="wg-contact-tel" class="form-input" value="${this._esc(contacto.phone || '')}"></div>
          </div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} Presentación de la ficha</summary>
        <div class="detail-collapse-body">${this._fichaPresentacionHtml('wg-', this._webFichaForm, false)}</div>
      </details>

      <details class="detail-collapse"><summary>${Icons.settings || Icons.fileText} CTA y etiquetas</summary>
        <div class="detail-collapse-body">
          <div class="form-row">
            <div class="form-group"><label for="wg-cta-label">CTA · etiqueta</label><input type="text" id="wg-cta-label" class="form-input" value="${this._esc(cta.label || '')}" placeholder="Quiero adoptar al grupo"></div>
            <div class="form-group"><label for="wg-cta-url">CTA · URL</label><input type="text" id="wg-cta-url" class="form-input" value="${this._esc(cta.url || '')}" placeholder="https://..."></div>
            <div class="form-group"><label for="wg-cta-kind">CTA · intención</label>
              <select id="wg-cta-kind" class="form-input">
                <option value="" ${cta.kind ? '' : 'selected'}>Enlace normal</option>
                ${['adopcion', 'acogida', 'contacto'].map(k => `<option value="${k}" ${cta.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select></div>
          </div>
          <div class="form-group"><label for="wg-tags">Etiquetas (separadas por comas)</label><input type="text" id="wg-tags" class="form-input" value="${this._esc((d.tags || []).join(', '))}" placeholder="camada, adopcion conjunta"></div>
        </div>
      </details>

      <details class="detail-collapse"><summary>${Icons.search} SEO (opcional)</summary>
        <div class="detail-collapse-body">
          ${this._seoGuiaHtml(d)}
          <div class="form-group"><label for="wg-seo-title">Meta title</label><input type="text" id="wg-seo-title" class="form-input" value="${this._esc(this.seoTitle(d))}" maxlength="70" placeholder="${this._esc(d.titulo || 'Título público')}"><p class="web-slug-hint">Vacío = título público. Ideal: 50–60 caracteres.</p></div>
          <div class="form-group"><label for="wg-seo-desc">Meta description</label><textarea id="wg-seo-desc" class="form-input" rows="2" maxlength="160" placeholder="${this._esc(String(d.extracto || 'Ej: Camada Luna, tres cachorros sociables que buscan familia.').slice(0, 160))}">${this._esc(seo.metaDescription || '')}</textarea><p class="web-slug-hint">Vacío = extracto. Ideal: 140–160 caracteres.</p></div>
          <details class="detail-collapse detail-collapse-inner"><summary>Avanzado SEO · indexación, visibilidad y orden</summary>
            <div class="detail-collapse-body">
              <p class="web-nota">Déjalo como está salvo que necesites ocultar la ficha de Google o de los listados.</p>
              <div class="form-row">
                <div class="form-group"><label><input type="checkbox" id="wg-indexable" ${d.indexable !== false ? 'checked' : ''}> Indexable (aparece en sitemap)</label></div>
                <div class="form-group"><label><input type="checkbox" id="wg-listed" ${d.listed !== false ? 'checked' : ''}> Visible en listados</label></div>
                <div class="form-group"><label><input type="checkbox" id="wg-featured" ${d.featured ? 'checked' : ''}> Destacado</label></div>
                <div class="form-group"><label for="wg-orden">Orden</label><input type="number" id="wg-orden" class="form-input" value="${Number(d.orden) || 0}"></div>
              </div>
            </div>
          </details>
        </div>
      </details>

      ${faltan.length ? `<p class="web-nota">Pendiente para publicar: ${faltan.map(f => this._esc(this._campoLabel(f))).join(', ')}.</p>` : ''}
      <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar publicación</button></div>
    </form>`;
    if (typeof Dashboard !== 'undefined' && Dashboard.showFormModal) Dashboard.showFormModal('Publicación web · ' + (origen.nombre || 'Grupo'), html);
    this._pintarMediaFormulario('wg');
  },

  _leerFormGrupo() {
    const v = id => document.getElementById(id);
    const txt = id => (v(id) ? String(v(id).value || '').trim() : '');
    const checked = id => !!(v(id) && v(id).checked);
    const alt = txt('wg-cover-alt') || txt('wg-titulo');
    this._mediaIgnorados = 0;
    const norm = (valor, tipo) => {
      const url = this.normalizarMediaUrl(valor, tipo);
      if (!url && String(valor || '').trim()) this._mediaIgnorados += 1;
      return url;
    };
    const galeria = this.parseGaleria(v('wg-galeria') ? v('wg-galeria').value : '', alt)
      .map(g => Object.assign({}, g, { src: norm(g.src, 'galeria') })).filter(g => g.src);
    const videos = this.parseVideos(v('wg-videos') ? v('wg-videos').value : '')
      .map(vid => Object.assign({}, vid, { url: norm(vid.url, 'video') })).filter(vid => vid.url);
    const documentos = this.parseDocumentos(v('wg-docs') ? v('wg-docs').value : '')
      .map(doc => Object.assign({}, doc, { url: norm(doc.url, 'documento') })).filter(doc => doc.url);
    const data = {
      estado_publicacion: txt('wg-estado') || 'borrador',
      slug: this.normalizarSlug(txt('wg-slug') || txt('wg-titulo')),
      titulo: txt('wg-titulo'),
      categoria: txt('wg-categoria'),
      estado_publico: txt('wg-estado-publico') === 'auto' ? '' : txt('wg-estado-publico'),
      estado_publico_modo: txt('wg-estado-publico') === 'auto' ? 'auto' : 'manual',
      extracto: txt('wg-extracto'),
      contenido_html: v('wg-contenido') ? v('wg-contenido').value : '',
      indexable: checked('wg-indexable'),
      listed: checked('wg-listed'),
      featured: checked('wg-featured'),
      orden: Number(txt('wg-orden')) || 0,
      media: {
        coverImage: { src: norm(txt('wg-cover'), 'portada'), alt },
        gallery: galeria,
        videos: videos,
        icons: this.parseIconos(v('wg-iconos') ? v('wg-iconos').value : '')
      },
      documents: documentos,
      tags: this.parseLista(txt('wg-tags')),
      cta: txt('wg-cta-label') && txt('wg-cta-url')
        ? Object.assign({ label: txt('wg-cta-label'), url: txt('wg-cta-url') }, txt('wg-cta-kind') ? { kind: txt('wg-cta-kind') } : {})
        : null,
      seo: {
        metaTitle: txt('wg-seo-title'),
        metaDescription: txt('wg-seo-desc')
      },
      animal: {
        temperament: this.parseLista(txt('wg-temperamento')),
        compatibility: { dogs: txt('wg-compat-perros'), cats: txt('wg-compat-gatos'), kids: txt('wg-compat-ninos') },
        adoption: { mode: txt('wg-adop-mode'), feeEur: txt('wg-adop-fee'), requirements: txt('wg-adop-req') },
        foster: { temporary: checked('wg-foster-temp'), durationLabel: txt('wg-foster-dur') },
        location: { city: txt('wg-loc-city'), province: txt('wg-loc-prov') },
        contact: { email: txt('wg-contact-email'), phone: txt('wg-contact-tel') }
      }
    };
    const ficha = this._leerFichaPresentacion('wg-');
    if (ficha) data.ficha = ficha;
    return data;
  },

  async guardarGrupo(e, grupoId) {
    if (e && e.preventDefault) e.preventDefault();
    const fin = (typeof Dashboard !== 'undefined' && Dashboard._guardando) ? Dashboard._guardando(e && e.target) : () => {};
    if (!fin) return;
    const datos = this._leerFormGrupo();
    const ignorados = this._mediaIgnorados;
    if (!datos.titulo) { this._snack('Falta el título público del grupo', 'warning'); fin(); return; }
    if (!grupoId) { this._snack('Falta el grupo a publicar', 'warning'); fin(); return; }
    try {
      const res = await API.saveWebGrupo({ grupo_id: grupoId, ...datos });
      fin();
      if (typeof Dashboard !== 'undefined' && Dashboard.closeFormModal) Dashboard.closeFormModal();
      const aviso = this.avisoDeploy(res, ignorados
        ? 'Publicación del grupo guardada; se ignoraron ' + ignorados + ' enlace(s) de carpeta de Drive'
        : 'Publicación del grupo guardada');
      this._snack(aviso.texto, aviso.tipo || (ignorados ? 'warning' : undefined));
      await this.recargar();
    } catch (err) {
      fin();
      this._snackErr(err, 'No se pudo guardar el grupo: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async previewGrupo(grupoId) {
    try {
      const res = await API.previewWebGrupo(grupoId);
      this._ultimoPreview = res.data || null;
      const json = JSON.stringify(this._ultimoPreview, null, 2);
      const titulo = (this._ultimoPreview && this._ultimoPreview.title) || 'Grupo';
      const html = `<p class="web-nota">Este es el objeto <code>Publicacion</code> que entregará <code>/api/publicaciones/:slug</code> para el grupo.</p>
        <pre class="web-preview-json">${this._esc(json)}</pre>
        <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="copiarPreviewWeb">Copiar JSON</button><button type="button" class="btn btn-primary" data-action="closeInfoModal">Cerrar</button></div>`;
      if (typeof Dashboard !== 'undefined' && Dashboard.showInfoModal) Dashboard.showInfoModal('Previsualización · ' + titulo, html);
    } catch (err) {
      this._snackErr(err, 'No se pudo generar la previsualización del grupo');
    }
  },

  async _cambiarEstadoGrupo(grupoId, estado) {
    const fila = (this.grupos || []).find(g => String(g.grupo_id) === String(grupoId));
    if (!fila || !fila.publicacion_id) {
      this._snack('Configura primero la publicación web del grupo', 'warning');
      return this.abrirGrupo(grupoId);
    }
    if (estado === 'publicado') {
      if (fila.conflicto_individual_publicado) {
        this._snack('No se puede publicar el grupo: hay publicaciones individuales publicadas de sus miembros. Ocúltalas o retíralas primero.', 'warning');
        return;
      }
      const faltan = this._faltantesPublicacion(fila);
      if (faltan.length) {
        this._snack('Antes de publicar falta: ' + faltan.join(', '), 'warning');
        return this.abrirGrupo(grupoId);
      }
    }
    try {
      const res = await API.setWebGrupoEstado(grupoId, estado);
      const base = estado === 'publicado' ? 'Grupo publicado en la web' : 'Publicación del grupo ocultada';
      const aviso = this.avisoDeploy(res, base);
      this._snack(aviso.texto, aviso.tipo);
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo cambiar el estado del grupo: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  publicarGrupo(grupoId) { return this._cambiarEstadoGrupo(grupoId, 'publicado'); },
  ocultarGrupo(grupoId) { return this._cambiarEstadoGrupo(grupoId, 'oculto'); },

  async retirarGrupo(grupoId, nombre) {
    const nombreTxt = nombre || 'este grupo';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Retirar la publicación web de ${nombreTxt}? Dejará de estar disponible y su enlace responderá como retirado (410); el slug no se podrá reutilizar.`,
        'Retirar',
        'Retirar'
      );
      if (!ok) return;
    }
    try {
      const res = await API.retirarWebGrupo(grupoId);
      const aviso = this.avisoDeploy(res, 'Publicación del grupo retirada (410)');
      this._snack(aviso.texto, aviso.tipo);
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo retirar el grupo: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async restaurarGrupo(grupoId, nombre) {
    const nombreTxt = nombre || 'este grupo';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Restaurar la publicación de ${nombreTxt}? Volverá a borrador (no publicada) manteniendo su slug.`,
        'Restaurar',
        'Restaurar'
      );
      if (!ok) return;
    }
    try {
      const res = await API.restaurarWebGrupo(grupoId);
      const aviso = this.avisoDeploy(res, 'Publicación del grupo restaurada a borrador');
      this._snack(aviso.texto, aviso.tipo);
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo restaurar el grupo: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async eliminarGrupo(grupoId, nombre) {
    const nombreTxt = nombre || 'este grupo';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Eliminar la publicación web (borrador/configuración) de ${nombreTxt}? Se borra solo en Publicaciones web; los animales y sus fichas se mantienen.`,
        'Eliminar',
        'Eliminar borrador'
      );
      if (!ok) return;
    }
    try {
      await API.deleteWebGrupo(grupoId);
      this._snack('Publicación web del grupo eliminada (los animales no se han modificado)');
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo eliminar el grupo: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  // ==================== ESTADO / PREVIEW / SLUG ====================

  /**
   * Aviso de una acción a partir de `data.deploy` del backend. Si el disparo
   * del deploy falló, el gestor lo dice en vez de fingir que la web ya se está
   * actualizando. Sin `data.deploy` (backend antiguo) deja el texto base.
   */
  avisoDeploy(res, base) {
    const texto = String(base || '');
    const d = (res && res.data && res.data.deploy) || null;
    if (!d) return { texto, tipo: undefined };
    if (d.ok === false) {
      const motivo = d.error || (d.codigo ? 'GitHub respondió ' + d.codigo : 'sin detalle');
      return {
        texto: texto + ', pero el deploy automático no se ha lanzado (' + motivo + '). La web sigue con la versión anterior: relánzalo desde GitHub Actions.',
        tipo: 'warning'
      };
    }
    if (d.disparado === false) {
      return { texto: texto + '. Ya hay un despliegue en marcha: la página SEO se actualizará en 2–3 min', tipo: undefined };
    }
    return { texto: texto + '. Regenerando la página SEO (2–3 min)', tipo: undefined };
  },

  async cambiarEstado(tipo, identificador, estado) {
    if (tipo === 'animal') {
      const fila = (this.animales || []).find(a => String(a.animal_id) === String(identificador));
      if (fila && !fila.publicacion_id) {
        this._snack('Configura primero la publicación web de este animal', 'warning');
        return this.abrirAnimal(identificador);
      }
      if (estado === 'publicado' && fila) {
        const faltan = this._faltantesPublicacion(fila);
        if (faltan.length) {
          this._snack('Antes de publicar falta: ' + faltan.join(', '), 'warning');
          return this.abrirAnimal(identificador);
        }
      }
      try {
        const res = await API.setWebAnimalEstado(identificador, estado);
        const base = estado === 'publicado' ? 'Publicado en la web' : (estado === 'retirado' ? 'Publicación retirada' : 'Publicación ocultada');
        const aviso = this.avisoDeploy(res, base);
        this._snack(aviso.texto, aviso.tipo);
        await this.recargar();
      } catch (err) {
        this._snackErr(err, 'No se pudo cambiar el estado: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
      }
      return;
    }
    const fila = (this.eventos || []).find(e => String(e.id) === String(identificador));
    if (estado === 'publicado' && fila) {
      const faltan = this._faltantesPublicacion(fila);
      if (faltan.length) {
        this._snack('Antes de publicar falta: ' + faltan.join(', '), 'warning');
        return this.abrirEvento(identificador);
      }
    }
    try {
      const res = await API.setWebEventoEstado(identificador, estado);
      const base = estado === 'publicado' ? 'Publicado en la web' : (estado === 'retirado' ? 'Publicación retirada' : 'Publicación ocultada');
      const aviso = this.avisoDeploy(res, base);
      this._snack(aviso.texto, aviso.tipo);
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
      const res = await API.deleteWebEvento(id);
      const aviso = this.avisoDeploy(res, 'Publicación retirada (410)');
      this._snack(aviso.texto, aviso.tipo);
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo archivar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },


  async restaurarWebEvento(id, titulo) {
    const nombreTxt = titulo || 'esta publicación';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Restaurar ${nombreTxt}? Volverá a borrador (no publicada) manteniendo su slug; podrás revisarla y publicarla de nuevo.`,
        'Restaurar',
        'Restaurar'
      );
      if (!ok) return;
    }
    try {
      const res = await API.restaurarWebEvento(id);
      const aviso = this.avisoDeploy(res, 'Publicación restaurada a borrador');
      this._snack(aviso.texto, aviso.tipo);
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

  async retirarWebAnimal(animalId, nombre) {
    const nombreTxt = nombre || 'este animal';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Retirar la publicación web de ${nombreTxt}? Dejará de estar disponible y su enlace responderá como retirado (410); el slug no se podrá reutilizar.`,
        'Retirar',
        'Retirar'
      );
      if (!ok) return;
    }
    try {
      const res = await API.retirarWebAnimal(animalId);
      const aviso = this.avisoDeploy(res, 'Publicación retirada (410)');
      this._snack(aviso.texto, aviso.tipo);
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo retirar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
    }
  },

  async restaurarWebAnimal(animalId, nombre) {
    const nombreTxt = nombre || 'este animal';
    if (typeof Dashboard !== 'undefined' && Dashboard._confirm) {
      const ok = await Dashboard._confirm(
        `¿Restaurar la publicación web de ${nombreTxt}? Volverá a borrador (no publicada) manteniendo su slug.`,
        'Restaurar',
        'Restaurar'
      );
      if (!ok) return;
    }
    try {
      const res = await API.restaurarWebAnimal(animalId);
      const aviso = this.avisoDeploy(res, 'Publicación restaurada a borrador');
      this._snack(aviso.texto, aviso.tipo);
      await this.recargar();
    } catch (err) {
      this._snackErr(err, 'No se pudo restaurar: ' + ((typeof Dashboard !== 'undefined' && Dashboard._errMsg) ? Dashboard._errMsg(err) : ''));
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
    this.copiarTexto(JSON.stringify(this._ultimoPreview || {}, null, 2),
      () => this._snack('JSON copiado'),
      () => this._snack('No se pudo copiar', 'warning'));
  },

  /** URL canónica de la página estática de una publicación. */
  urlPublicaEstatica(slug) {
    const s = String(slug || '').trim();
    if (!s) return '';
    const ruta = 'publicaciones/' + encodeURIComponent(s) + '.html';
    try {
      return new URL(ruta, location.href).href;
    } catch (e) {
      return ruta;
    }
  },

  /** Copia al portapapeles con la API moderna; si no existe, con un textarea. */
  copiarTexto(texto, ok, fallo) {
    const listo = typeof ok === 'function' ? ok : () => {};
    const error = typeof fallo === 'function' ? fallo : () => {};
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(texto).then(listo, error);
        return;
      }
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const bien = document.execCommand('copy');
      document.body.removeChild(area);
      bien ? listo() : error();
    } catch (e) {
      error(e);
    }
  },

  /** Copia el enlace público (página estática canónica) de una publicación. */
  copiarEnlaceWeb(slug, titulo) {
    const url = this.urlPublicaEstatica(slug);
    if (!url) { this._snack('Esta publicación todavía no tiene slug', 'warning'); return; }
    this.copiarTexto(url,
      () => this._snack('Enlace copiado' + (titulo ? ': ' + titulo : '')),
      () => this._snack('No se pudo copiar el enlace', 'warning'));
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
    const det = document.querySelector('#form-body #we-event-details') || document.querySelector('#form-body details.detail-collapse');
    if (det) {
      if (valor === 'historia') det.removeAttribute('open');
      else det.setAttribute('open', '');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Web;

// Menús de acción (overflow menu): cierre al hacer clic fuera o al ejecutar una
// acción/enlace, y posición acotada al viewport para que no se salgan en móvil.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  const MARGEN_MENU = 8;

  // Un ancestro con transformación, contención o `content-visibility` fija el
  // `position: fixed`; hay que descontar su origen para acertar en el viewport.
  const contenedorFijo = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (cs.transform !== 'none' || cs.translate !== 'none' || cs.rotate !== 'none' || cs.scale !== 'none' ||
          cs.perspective !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none' ||
          cs.willChange !== 'auto' || cs.contain !== 'none' || cs.contentVisibility !== 'visible' ||
          cs.containerType !== 'normal') {
        return p;
      }
      p = p.parentElement;
    }
    return null;
  };

  const posicionarMenu = (menu) => {
    const lista = menu.querySelector('.action-menu-list');
    if (!lista) return;
    const r = menu.getBoundingClientRect();
    // Medir ya en modo `fixed` para que el ancho no cambie al recolocar.
    lista.style.position = 'fixed';
    lista.style.right = 'auto';
    lista.style.left = '0px';
    lista.style.top = '0px';
    const ancho = lista.offsetWidth;
    const alto = lista.offsetHeight;
    const maxIzq = Math.max(MARGEN_MENU, window.innerWidth - ancho - MARGEN_MENU);
    const izq = Math.min(Math.max(r.left, MARGEN_MENU), maxIzq);
    let arriba = r.bottom + 4;
    if (arriba + alto > window.innerHeight - MARGEN_MENU) {
      arriba = Math.max(MARGEN_MENU, r.top - alto - 4);
    }
    const base = contenedorFijo(menu);
    const origen = base ? base.getBoundingClientRect() : { left: 0, top: 0 };
    lista.style.left = (izq - origen.left) + 'px';
    lista.style.top = (arriba - origen.top) + 'px';
  };

  const limpiarMenu = (menu) => {
    const lista = menu.querySelector('.action-menu-list');
    if (!lista) return;
    lista.style.position = '';
    lista.style.right = '';
    lista.style.left = '';
    lista.style.top = '';
  };

  document.addEventListener('toggle', (e) => {
    const menu = e.target;
    if (!menu || !menu.matches || !menu.matches('details.action-menu')) return;
    if (menu.open) posicionarMenu(menu); else limpiarMenu(menu);
  }, true);

  document.addEventListener('click', (e) => {
    const openMenus = document.querySelectorAll('details.action-menu[open]');
    openMenus.forEach((m) => {
      const list = m.querySelector('.action-menu-list');
      const insideList = !!(list && e.target && list.contains(e.target));
      // Fuera del menú: cierra. Dentro de la lista (botón o enlace): cierra tras la acción.
      if (!m.contains(e.target) || insideList) m.removeAttribute('open');
    });
  });

  // Si la página o la tabla se desplazan, el menú abierto sigue a su botón;
  // se cierra solo cuando el botón sale del viewport.
  let rafScroll = 0;
  document.addEventListener('scroll', () => {
    if (rafScroll) return;
    rafScroll = requestAnimationFrame(() => {
      rafScroll = 0;
      document.querySelectorAll('details.action-menu[open]').forEach((m) => {
        const r = m.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) m.removeAttribute('open');
        else posicionarMenu(m);
      });
    });
  }, true);
  window.addEventListener('resize', () => {
    document.querySelectorAll('details.action-menu[open]').forEach((m) => {
      if (m.open) posicionarMenu(m);
    });
  });
}
