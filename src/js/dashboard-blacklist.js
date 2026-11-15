(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const mod = factory();
    if (root.Dashboard) Object.assign(root.Dashboard, mod);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
// ==================== BLACKLIST ====================
async renderBlacklist(el) {
  if (typeof this.puedeAccederPagina === 'function' && !this.puedeAccederPagina('blacklist')) {
    this._sinPermisoPage(el); this.injectIcons(); return;
  }
  await this._loadList('blacklist', () => API.getBlacklist());
  el.innerHTML = `
    <div class="list-header"><div class="search-box" style="flex:1"><span class="search-icon"></span><input type="text" aria-label="Buscar en lista negra" placeholder="Buscar..." data-input="onBlacklistSearchInput"></div><button type="button" class="btn btn-primary btn-sm" data-action="showAddBlacklist">${Icons.plus} Anadir</button></div>
    <div id="blacklist-list-container">${this._renderBlacklistCards()}</div><div id="blacklist-form-container"></div>`;
  this._animaListado(document.getElementById('blacklist-list-container'));
},

filterBlacklist(input) { const c=document.getElementById('blacklist-list-container'); if(c) c.innerHTML=this._renderBlacklistCards(input.value); },

// Clave estable por fila de la lista negra: usa el id si existe y, si no,
// 'idx:<i>' con el indice en la lista COMPLETA. Antes se pasaba el indice
// del array ya filtrado por la busqueda, asi que un borrado con filtro
// eliminaba otra persona. 'idx:' solo existe en memoria (el backend pide id).
_blClave(bl, idx) { return (bl && bl.id) ? String(bl.id) : 'idx:' + idx; },
_blPorClave(clave) {
  const lista = this.blacklist || [];
  if (clave != null && String(clave).indexOf('idx:') === 0) {
    const i = Number(String(clave).slice(4));
    return (Number.isInteger(i) && i >= 0 && i < lista.length) ? { item: lista[i], index: i } : null;
  }
  const i = lista.findIndex(b => String(b.id) === String(clave));
  return i >= 0 ? { item: lista[i], index: i } : null;
},

_renderBlacklistCards(search='') {
  let idxs=(this.blacklist || []).map((bl,i)=>({bl,i}));
  if(search) idxs=idxs.filter(({bl})=>((bl.nombre||'')+' '+(bl.apellidos||'')+' '+(bl.email||'')+' '+(bl.motivo||'')).toLowerCase().includes(search.toLowerCase()));
  if(!idxs.length) {
    if (search) return '<div class="empty-state empty-state-illustrated"><div class="empty-state-icon">'+Icons.search+'</div><h3>Sin resultados</h3><p>No hay coincidencias para esta búsqueda.</p></div>';
    return '<div class="empty-state empty-state-illustrated"><div class="empty-state-icon">'+Icons.checkCircle+'</div><h3>Lista negra vacía</h3><p>No hay personas en la lista negra</p></div>';
  }
  return idxs.map(({bl,i})=>{ const k=this._esc(this._blClave(bl,i)); const nombre = ((bl.nombre||'')+' '+(bl.apellidos||'')).trim(); return `<div class="bl-card"><div class="bl-card-header"><span class="bl-card-name">${this._esc(bl.nombre)} ${this._esc(bl.apellidos)}</span><div style="display:flex;gap:4px"><button type="button" class="btn btn-outline-green btn-sm" data-action="showEditBlacklistItem" data-arg0="${k}" aria-label="Editar ${this._esc(nombre || 'registro')}" title="Editar">${Icons.pencil}</button><button type="button" class="btn btn-danger btn-sm" data-action="removeBlacklistItem" data-arg0="${k}" aria-label="Eliminar ${this._esc(nombre || 'registro')}" title="Eliminar">${Icons.trash}</button></div></div>${bl.email?'<div class="bl-card-email">'+this._esc(bl.email)+'</div>':''}<div class="bl-card-motivo">${this._esc(bl.motivo)}</div><div class="bl-card-meta">${this._esc(bl.origen||'manual')} ${bl.fecha?'&middot; '+this._esc(this._fmtFecha(bl.fecha)):''}</div></div>`; }).join('');
},

showAddBlacklist() {
  const c=document.getElementById('blacklist-form-container');
  if(!c) return;
  c.innerHTML = this._blacklistFormHTML();
},

showEditBlacklistItem(id) {
  const c=document.getElementById('blacklist-form-container');
  if(!c) return;
  const hit = this._blPorClave(id);
  if (!hit) return;
  c.innerHTML = this._blacklistFormHTML(hit.item, id);
},

_blacklistFormHTML(data, id) {
  const isEdit = id !== undefined;
  return `<div class="form-card" style="margin-top:16px"><h3>${isEdit?'Editar':'Anadir a lista negra'}</h3><form data-submit="saveBlacklistItem" data-sarg0="${isEdit ? this._esc(String(id)) : ''}"><div class="form-row"><div class="form-group"><label for="bl-nombre">Nombre *</label><input type="text" id="bl-nombre" value="${this._esc(data?.nombre||'')}" required></div><div class="form-group"><label for="bl-apellidos">Apellidos *</label><input type="text" id="bl-apellidos" value="${this._esc(data?.apellidos||'')}" required></div></div><div class="form-row"><div class="form-group"><label for="bl-email">Email</label><input type="email" id="bl-email" value="${this._esc(data?.email||'')}"></div><div class="form-group"><label for="bl-telefono">Telefono</label><input type="text" id="bl-telefono" value="${this._esc(data?.telefono||'')}"></div></div><div class="form-group"><label for="bl-motivo">Motivo *</label><select id="bl-motivo" required><option value="">Seleccionar...</option>${['Incompatible con animales','Vivienda inadecuada','Historial de maltrato','Informacion falsa','Sin compromiso','Otros'].map(m=>`<option ${data?.motivo===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="form-group"><label for="bl-notas">Notas</label><textarea id="bl-notas" rows="2">${this._esc(data?.notas||'')}</textarea></div><div class="form-actions"><button type="button" class="btn btn-outline-green" data-action="clearBlacklistForm">Cancelar</button><button type="submit" class="btn btn-danger">${isEdit?'Actualizar':'Anadir'}</button></div></form></div>`;
},

async saveBlacklistItem(e, id) {
  e.preventDefault();
  const finGuardar = this._guardando(e.target);
  if (!finGuardar) return;
  // 'idx:...' = fila antigua sin id: solo existe en local, se crea como
  // registro nuevo (el backend necesita id). Con id real se actualiza.
  const claveReal = (id && String(id).indexOf('idx:') !== 0) ? String(id) : '';
  const hit = claveReal ? this._blPorClave(claveReal) : null;
  const prev = hit ? hit.item : null;
  const item = {
    id: prev && prev.id ? prev.id : ('bl_' + Date.now().toString(36)),
    nombre: document.getElementById('bl-nombre').value.trim(),
    apellidos: document.getElementById('bl-apellidos').value.trim(),
    email: document.getElementById('bl-email').value.trim(),
    telefono: document.getElementById('bl-telefono').value.trim(),
    motivo: document.getElementById('bl-motivo').value,
    notas: document.getElementById('bl-notas').value.trim(),
    origen: prev ? prev.origen : 'manual',
    fecha: prev ? prev.fecha : new Date().toISOString()
  };
  try { await (claveReal ? API.updateBlacklist(item.id, item) : API.createBlacklist(item)); }
  catch (err) { this._snackErr(err, this._errMsg(err)); finGuardar(); return; }
  finGuardar();
  if (prev) { this.blacklist[hit.index] = item; }
  else { this.blacklist.push(item); }
  this.saveLocal();
  document.getElementById('blacklist-form-container').innerHTML='';
  const lc=document.getElementById('blacklist-list-container'); if(lc) lc.innerHTML=this._renderBlacklistCards();
  this._regLog(id ? 'blacklist' : 'blacklist', (id ? 'Actualizado: ' : 'Anadido a lista negra: ') + item.nombre + ' ' + item.apellidos);
  this.showSnackbar(id ? 'Guardado en lista negra' : 'Anadido a lista negra', 'success');
},

async removeBlacklistItem(id) {
  const busyKey = 'del-bl:' + id;
  if (!this._busyStart(busyKey)) return;
  try {
  if (!(await this._confirm('Eliminar esta persona de la lista negra?'))) return;
  const hit = this._blPorClave(id);
  if (!hit) return;
  // Sin id no hay fila que borrar en el backend: solo se quita de local.
  if (hit.item.id) {
    try { await API.deleteBlacklist(hit.item.id); }
    catch (err) { this._snackErr(err, this._errMsg(err)); return; }
  }
  this.blacklist.splice(hit.index, 1);
  this.saveLocal();
  const lc=document.getElementById('blacklist-list-container'); if(lc) lc.innerHTML=this._renderBlacklistCards();
  this.showSnackbar('Eliminado de la lista negra', 'success');

  } finally {
    this._busyEnd(busyKey);
  }
},

  };
});
