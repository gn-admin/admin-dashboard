(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const mod = factory();
    const destino = (typeof Dashboard !== 'undefined') ? Dashboard : root.Dashboard;
    if (destino) Object.assign(destino, mod);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
// ==================== DONACIONES ====================
_totalDonaciones(list) {
  return (list || []).reduce((s, d) => s + (parseFloat(String(d.importe).replace(',', '.')) || 0), 0);
},

_euros(v) {
  if (typeof Utils !== 'undefined' && Utils.euros) return Utils.euros(v);
  return (parseFloat(String(v ?? '').replace(',', '.')) || 0).toFixed(2);
},

async renderDonaciones(el) {
  if (typeof this.puedeAccederPagina === 'function' && !this.puedeAccederPagina('donaciones')) {
    this._sinPermisoPage(el); this.injectIcons(); return;
  }
  await this._loadList('donaciones', () => API.getDonaciones());
  const total = this._totalDonaciones(this.donaciones);
  const items = (this.donaciones || []).slice().reverse();
  el.innerHTML = `
    <div class="page-list-container">
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-card-icon green">${Icons.heart}</div><div class="stat-card-info"><div class="stat-card-label">Total donado</div><div class="stat-card-value">${total.toFixed(2)} €</div><div class="stat-card-change">${this.donaciones.length} donaciones</div></div></div>
      </div>
      <div class="list-header"><span class="response-count" aria-live="polite" aria-atomic="true">${this.donaciones.length} donaciones</span><button type="button" class="btn btn-primary btn-sm" data-action="showDonacionForm">${Icons.plus} Nueva</button></div>
      <div class="card"><div class="card-body-flush"><table class="data-table"><thead><tr><th scope="col">Fecha</th><th scope="col">Donante</th><th scope="col">Importe</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${items.length ? items.map(d => `<tr><td data-label="Fecha">${d.fecha ? this._fmtFecha(d.fecha) : '—'}</td><td data-label="Donante">${this._esc(d.donante || '')}</td><td data-label="Importe">${this._euros(d.importe)} €</td><td data-label="Acciones" class="table-actions"><button type="button" class="btn btn-danger btn-sm" data-action="deleteDonacion" data-arg0="${this._esc(d.id)}" aria-label="Eliminar donación" title="Eliminar">${Icons.trash}</button></td></tr>`).join('') : `<tr><td colspan="4" class="table-empty">Aun no hay donaciones</td></tr>`}</tbody></table></div></div>
    </div>
    <div class="page-detail-container"></div>`;
},

showDonacionForm() {
  this.showFormModal('Nueva donacion', `
    <form data-submit="saveDonacion">
    <div class="form-row"><div class="form-group"><label for="dn-donante">Donante *</label><input type="text" id="dn-donante" required placeholder="Nombre o Anonimo"></div>
    <div class="form-group"><label for="dn-importe">Importe (€) *</label><input type="text" id="dn-importe" required placeholder="Ej: 50" inputmode="decimal"></div></div>
    <div class="form-row"><div class="form-group"><label for="dn-fecha">Fecha *</label><input type="date" id="dn-fecha" required value="${new Date().toISOString().slice(0, 10)}"></div>
    <div class="form-group"><label for="dn-notas">Notas</label><input type="text" id="dn-notas" placeholder="Opcional"></div></div>
    <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form>`);
},

async saveDonacion(e) {
  e.preventDefault();
  const finGuardar = this._guardando(e.target);
  if (!finGuardar) return;
  const donante = document.getElementById('dn-donante').value.trim();
  const importe = document.getElementById('dn-importe').value.trim().replace(',', '.');
  if (!donante || isNaN(parseFloat(importe))) { this.showSnackbar('Completa donante e importe válido', 'warning'); finGuardar(); return; }
  const row = {
    id: 'don_' + Date.now().toString(36),
    donante,
    importe,
    fecha: document.getElementById('dn-fecha').value || new Date().toISOString().slice(0, 10),
    notas: document.getElementById('dn-notas').value.trim()
  };
  this.donaciones.push(row);
  this.saveLocal();
  this._apiCreateRow(() => API.createDonacion(row), { m: 'createDonacion', a: [row] });
  this._regLog('donacion', 'Donacion de ' + donante + ' (' + importe + ' €)', 'donacion', row.id);
  finGuardar();
  this.closeFormModal();
  this.renderDonaciones(document.getElementById('page-donaciones'));
  this.showSnackbar('Donacion guardada', 'success');
},

async deleteDonacion(id) {
  const busyKey = 'del-don:' + id;
  if (!this._busyStart(busyKey)) return;
  try {
  if (!(await this._confirm('Eliminar esta donacion?', 'Eliminar'))) return;
  try {
    const res = await API.deleteDonacion(id);
    this._assertDeleted(res, 'La donacion');
  } catch (err) { this._snackErr(err, 'No se pudo eliminar: ' + this._errMsg(err)); return; }
  this.donaciones = (this.donaciones || []).filter(x => x.id !== id);
  this.saveLocal();
  this.renderDonaciones(document.getElementById('page-donaciones'));
  this.showSnackbar('Donacion eliminada', 'success');

  } finally {
    this._busyEnd(busyKey);
  }
},

// ==================== ALMACEN (dummy local: sin backend) ====================
_bajoStock(it) {
  const min = parseFloat(it.minimo) || 0;
  return min > 0 && (parseFloat(it.cantidad) || 0) <= min;
},

async renderAlmacen(el) {
  if (typeof this.puedeAccederPagina === 'function' && !this.puedeAccederPagina('almacen')) {
    this._sinPermisoPage(el); this.injectIcons(); return;
  }
  await this._loadList('inventario', () => API.getInventario());
  const items = (this.inventario || []).slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  el.innerHTML = `
    <div class="page-list-container">
      <div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:16px">
        <div style="font-weight:700;margin-bottom:6px">${Icons.box} Que se guarda aqui</div>
        <p style="font-size:.82rem;color:var(--gray-600);margin:0 0 8px">Articulos de consumo de la asociacion: pienso y latas, medicacion y material sanitario, limpieza, jaulas y camas, material para paseos, salidas y eventos. <b>No</b> va aqui la documentacion de los animales (está en la ficha de cada uno) ni el dinero (va en <b>Gastos</b> y en <b>Donaciones</b>).</p>
        <p style="font-size:.82rem;color:var(--gray-600);margin:0"><b>Como se usa:</b> da de alta cada articulo una sola vez con su unidad (sacos, latas, comprimidos) y la cantidad que hay ahora. Usa <b>+1</b> y <b>−1</b> para anotar compras y consumos rapidos. Pon un <b>Minimo (aviso)</b> para que se te avise cuando baje de esa cifra. Se guarda en la nube, asi que lo ves igual desde el movil y desde el ordenador.</p>
      </div></div>
      <div class="list-header"><span class="response-count" aria-live="polite" aria-atomic="true">${items.length} articulos</span><button type="button" class="btn btn-primary btn-sm" data-action="showInventarioForm">${Icons.plus} Nuevo</button></div>
      <div class="card"><div class="card-body-flush"><table class="data-table"><thead><tr><th scope="col">Artículo</th><th scope="col">Stock</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${items.length ? items.map(it => `<tr><td data-label="Artículo">${this._esc(it.nombre || '')}<div style="font-size:var(--text-xs);color:var(--gray-500)">${this._esc(it.unidad || '')}</div></td><td data-label="Stock"><span class="estado-badge ${this._bajoStock(it) ? 'descartada' : 'en_proceso'}">${this._esc(String(it.cantidad ?? '0'))}</span></td><td data-label="Acciones" class="table-actions" style="white-space:nowrap"><button type="button" class="btn btn-outline-green btn-sm" data-action="ajustarInventario" data-arg0="${this._esc(it.id)}" data-arg1="1" aria-label="Aumentar stock de ${this._esc(it.nombre || 'artículo')}">+1</button> <button type="button" class="btn btn-outline-green btn-sm" data-action="ajustarInventario" data-arg0="${this._esc(it.id)}" data-arg1="-1" aria-label="Reducir stock de ${this._esc(it.nombre || 'artículo')}">−1</button> <details class="action-menu"><summary class="btn btn-outline-green btn-sm" aria-label="Más acciones" title="Más acciones">⋮</summary><div class="action-menu-list"><button type="button" class="btn btn-outline-green btn-sm" data-action="showInventarioForm" data-arg0="${this._esc(it.id)}">Editar</button><button type="button" class="btn btn-danger btn-sm" data-action="deleteInventario" data-arg0="${this._esc(it.id)}" aria-label="Eliminar ${this._esc(it.nombre || 'artículo')}" title="Eliminar">${Icons.trash} Eliminar</button></div></details></td></tr>`).join('') : `<tr><td colspan="3" class="table-empty">Almacén vacío</td></tr>`}</tbody></table></div></div>
    </div>
    <div class="page-detail-container"></div>`;
},

showInventarioForm(id) {
  const data = id ? this._byId(this.inventario, id) : null;
  const isEdit = !!data;
  this.showFormModal(isEdit ? 'Editar artículo' : 'Nuevo artículo', `
    <form data-submit="saveInventario" data-sarg0="${data ? this._esc(data.id) : ''}">
    <div class="form-row"><div class="form-group"><label for="iv-nombre">Artículo *</label><input type="text" id="iv-nombre" required value="${this._esc(data?.nombre || '')}" placeholder="Ej: Pienso cachorro"></div>
    <div class="form-group"><label for="iv-unidad">Unidad</label><input type="text" id="iv-unidad" value="${this._esc(data?.unidad || '')}" placeholder="Ej: sacos, latas"></div></div>
    <div class="form-row"><div class="form-group"><label for="iv-cantidad">Cantidad *</label><input type="number" id="iv-cantidad" required step="any" value="${data?.cantidad ?? ''}" placeholder="Ej: 12"></div>
    <div class="form-group"><label for="iv-minimo">Mínimo (aviso)</label><input type="number" id="iv-minimo" step="any" value="${data?.minimo ?? ''}" placeholder="Ej: 2"></div></div>
    <div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="closeFormModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form>`);
},

async saveInventario(e, id) {
  e.preventDefault();
  const finGuardar = this._guardando(e.target);
  if (!finGuardar) return;
  const nombre = document.getElementById('iv-nombre').value.trim();
  const cantidad = parseFloat(document.getElementById('iv-cantidad').value);
  if (!nombre || isNaN(cantidad)) { this.showSnackbar('Completa nombre y cantidad válida', 'warning'); finGuardar(); return; }
  if (id) {
    const it = this._byId(this.inventario, id);
    const data = {
      nombre,
      unidad: document.getElementById('iv-unidad').value.trim(),
      cantidad,
      minimo: parseFloat(document.getElementById('iv-minimo').value) || 0
    };
    try {
      const res = await API.updateInventario(id, data);
      if (!res.data) throw new Error('sin datos');
      if (it) Object.assign(it, data);
    } catch (err) {
      this._snackErr(err, 'No se pudo guardar: ' + this._errMsg(err));
      finGuardar();
      return;
    }
  } else {
    const row = {
      id: 'inv_' + Date.now().toString(36),
      nombre,
      unidad: document.getElementById('iv-unidad').value.trim(),
      cantidad,
      minimo: parseFloat(document.getElementById('iv-minimo').value) || 0
    };
    try {
      const res = await API.createInventario(row);
      this.inventario.push(res.data || row);
    } catch (err) {
      this.inventario.push(row);
      this._enqueueOp({ m: 'createInventario', a: [row] });
    }
  }
  this.saveLocal();
  finGuardar();
  this.closeFormModal();
  this.renderAlmacen(document.getElementById('page-almacen'));
  this.showSnackbar(id ? 'Artículo actualizado' : 'Artículo creado', 'success');
},

ajustarInventario(id, delta) {
  const it = this._byId(this.inventario, id);
  if (!it) return;
  it.cantidad = Math.max(0, (parseFloat(it.cantidad) || 0) + delta);
  this.saveLocal();
  this._updateLocalYApi('inventario', it);
  this.renderAlmacen(document.getElementById('page-almacen'));
},

async deleteInventario(id) {
  const busyKey = 'del-inv:' + id;
  if (!this._busyStart(busyKey)) return;
  try {
  if (!(await this._confirm('Eliminar este artículo?', 'Eliminar'))) return;
  try {
    const res = await API.deleteInventario(id);
    this._assertDeleted(res, 'El artículo');
  } catch (err) { this._snackErr(err, 'No se pudo eliminar: ' + this._errMsg(err)); return; }
  this.inventario = (this.inventario || []).filter(x => x.id !== id);
  this.saveLocal();
  this.renderAlmacen(document.getElementById('page-almacen'));
  this.showSnackbar('Artículo eliminado', 'success');

  } finally {
    this._busyEnd(busyKey);
  }
},

  };
});
