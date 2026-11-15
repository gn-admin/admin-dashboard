(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const mod = factory();
    if (root.Dashboard) Object.assign(root.Dashboard, mod);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
  // ==================== REGISTRO DE ACTIVIDAD ====================
  _tipoLogLabel(tipo) {
    if (typeof Utils !== 'undefined' && Utils.tipoLogLabel) return Utils.tipoLogLabel(tipo);
    const m = {
      adopcion: 'Adopcion', acogida: 'Acogida', candidatura: 'Candidatura',
      apadrinamiento: 'Apadrinamiento', 'apadrinamiento-fin': 'Fin apadrinamiento',
      'padrino-convertido': 'Padrino a socio', gasto: 'Gasto', donacion: 'Donacion',
      contrato: 'Contrato', seguimiento: 'Seguimiento', blacklist: 'Lista negra',
      voluntariado: 'Voluntariado'
    };
    return m[tipo] || tipo || 'General';
  },

  _tipoLogCls(tipo) {
    if (typeof Utils !== 'undefined' && Utils.tipoLogCls) return Utils.tipoLogCls(tipo);
    if (tipo === 'blacklist') return 'descartada';
    if (tipo === 'gasto' || tipo === 'donacion') return 'en_proceso';
    if (tipo === 'adopcion' || tipo === 'candidatura' || tipo === 'contrato') return 'aprobada';
    return '';
  },

  async renderActividad(el) {
    await this._loadListBestEffort('actividad', () => API.getActividad());
    const tv = (f) => { const d = Date.parse(String(f || '').replace(' ', 'T')); return isNaN(d) ? 0 : d; };
    const rows = [...(this.actividad || [])].sort((a, b) => tv(b.fecha) - tv(a.fecha));
    const tipos = Array.from(new Set(rows.map(r => r.tipo).filter(Boolean))).sort();
    const cuerpo = this._renderActividadTabla(rows);
    el.innerHTML = `
      <div class="page-list-container">
        <div class="filters-bar"><div class="search-box"><span class="search-icon" aria-hidden="true"></span><input type="text" aria-label="Buscar en el registro de actividad" placeholder="Buscar en el registro..." data-input="onActividadSearchInput"></div>
          <div class="filter-row">
            <select data-change="onActividadFilterChange" data-cpass="el" aria-label="Filtrar por tipo">
              <option value="">Todos los tipos</option>
              ${tipos.map(t => `<option value="${this._esc(t)}">${this._esc(this._tipoLogLabel(t))}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-outline-green btn-sm" data-action="loadPage" data-arg0="actividad">${Icons.activity} Actualizar</button>
            <button type="button" class="btn btn-outline-green btn-sm" data-action="exportActividadCsv">${Icons.download} CSV</button>
          </div>
        </div>
        <div class="list-header"><span class="response-count" aria-live="polite" aria-atomic="true">${rows.length} registros</span></div>
        <div class="card"><div class="card-body card-body-flush actividad-tabla" id="actividad-tabla">${cuerpo}</div></div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  _renderActividadTabla(rows) {
    if (!rows.length) {
      return `<div class="empty-state empty-state-illustrated"><div class="empty-state-icon">${Icons.activity}</div><h3>Sin actividad registrada</h3><p>Cada alta, cambio de fase, contrato o gasto deja aqui su rastro. Si acabas de desplegar el backend, vuelve a entrar para cargar el historial.</p></div>`;
    }
    return `<table class="data-table"><thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Tipo</th><th scope="col">Detalle</th></tr></thead><tbody>${rows.map(r => `
      <tr>
        <td data-label="Fecha" style="white-space:nowrap">${this._esc(this._fmtLogFecha(r.fecha))}</td>
        <td data-label="Usuario">${this._esc(r.usuario || '—')}</td>
        <td data-label="Tipo"><span class="estado-badge ${this._tipoLogCls(r.tipo)}">${this._esc(this._tipoLogLabel(r.tipo))}</span></td>
        <td data-label="Detalle">${this._esc(r.detalle || r.descripcion || '')}</td>
      </tr>`).join('')}</tbody></table>`;
  },

  _fmtLogFecha(f) {
    return this._fmtFecha(f);
  },

  filterActividad(container) {
    const q = container?.querySelector('.search-box input')?.value?.toLowerCase() || '';
    const t = container?.querySelector('.filter-row select')?.value || '';
    const c = container?.querySelector('.actividad-tabla') || document.getElementById('actividad-tabla');
    if (!c) return;
    const tv = (f) => { const d = Date.parse(String(f || '').replace(' ', 'T')); return isNaN(d) ? 0 : d; };
    let rows = [...(this.actividad || [])].sort((a, b) => tv(b.fecha) - tv(a.fecha));
    if (t) rows = rows.filter(r => r.tipo === t);
    if (q) rows = rows.filter(r => ((r.usuario || '') + ' ' + (r.detalle || '') + ' ' + (r.descripcion || '') + ' ' + (r.tipo || '')).toLowerCase().includes(q));
    c.innerHTML = rows.length ? this._renderActividadTabla(rows) : `<div class="empty-state empty-state-illustrated"><div class="empty-state-icon">${Icons.search}</div><h3>Sin resultados</h3><p>Prueba con otra palabra o quita el filtro de tipo.</p></div>`;
    const n = container?.querySelector('.response-count');
    if (n) n.textContent = rows.length + ' registros';
  },

  exportActividadCsv() {
    const tv = (f) => { const d = Date.parse(String(f || '').replace(' ', 'T')); return isNaN(d) ? 0 : d; };
    const rows = [...(this.actividad || [])].sort((a, b) => tv(b.fecha) - tv(a.fecha));
    if (!rows.length) { this.showSnackbar('No hay actividad que exportar', 'warning'); return; }
    const head = ['fecha', 'usuario', 'tipo', 'detalle', 'entidad', 'entidad_id'];
    const esc = v => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [head.join(';')].concat(rows.map(r => head.map(k => esc(r[k])).join(';'))).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'actividad-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.showSnackbar('Registro exportado', 'success');
  }
  };
});
