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
// ==================== GESTOR WEB (delegacion a Web) ====================
abrirAnimalWeb(animalId) { return Web.abrirAnimal(animalId); },
subirMediaWeb(el, tipo, prefijo, publicacionId) { return Web.subirMediaWeb(el, tipo, prefijo, publicacionId); },
borrarMediaWeb(el) { return Web.borrarMediaWeb(el); },
regenerarWeb(el) { return Web.regenerarWeb(el); },
abrirEventoWeb(id) { return Web.abrirEvento(id); },
abrirPublicacionWebAnimal(animalId) { return Web.abrirParaAnimal(animalId); },
saveWebAnimal(e, animalId) { return Web.guardarAnimal(e, animalId); },
saveWebEvento(e, id) { return Web.guardarEvento(e, id); },
cambiarEstadoWeb(tipo, id, estado) { return Web.cambiarEstado(tipo, id, estado); },
archivarWeb(id) { return Web.archivar(id); },
restaurarWebEvento(id, titulo) { return Web.restaurarWebEvento(id, titulo); },
eliminarWebAnimal(animalId, nombre) { return Web.eliminarWebAnimal(animalId, nombre); },
retirarWebAnimal(animalId, nombre) { return Web.retirarWebAnimal(animalId, nombre); },
restaurarWebAnimal(animalId, nombre) { return Web.restaurarWebAnimal(animalId, nombre); },
irFichaAnimalDesdeWeb(id) { if (Dashboard && typeof Dashboard.closeFormModal === 'function') Dashboard.closeFormModal(); if (Dashboard && typeof Dashboard.openAnimalFicha === 'function') Dashboard.openAnimalFicha(id); },
previewWeb(tipo, id) { return Web.preview(tipo, id); },
copiarPreviewWeb() { return Web.copiarPreview(); },
copiarEnlaceWeb(slug, titulo) { return Web.copiarEnlaceWeb(slug, titulo); },
onWebSlugChange(el, id, tipo) { return Web.validarSlugInput(el, id, tipo); },
onWebTipoChange(valor) { return Web.onChangeTipo(valor); },
onWebSearch(el) { return Web.buscar(el.value); },
nuevaPublicacionWeb() { return Web.nuevaPublicacion(); },
nuevaPublicacionGrupoWeb() { return Web.nuevaPublicacionGrupo(); },
abrirGrupoWeb(id) { return Web.abrirGrupo(id); },
editarWebGrupo(id) { return Web.abrirGrupo(id); },
guardarGrupoWeb(e, id) { return Web.guardarGrupo(e, id); },
previewWebGrupo(id) { return Web.previewGrupo(id); },
publicarWebGrupo(id) { return Web.publicarGrupo(id); },
ocultarWebGrupo(id) { return Web.ocultarGrupo(id); },
retirarWebGrupo(id) { return Web.retirarGrupo(id); },
restaurarWebGrupo(id) { return Web.restaurarGrupo(id); },
eliminarWebGrupo(id) { return Web.eliminarGrupo(id); },
cerrarPickerWeb() { return Web.cerrarPicker(); },
crearPublicacionWeb(animalId) { return Web.crearPublicacion(animalId); },
onPickerWebBuscar(el) { return Web.filtrarPicker(el.value); },
onWebEstadoFilter(valor) { return Web.filtrarEstado(valor); },
cambiarTabWeb(tab) { return Web.cambiarTab(tab); },
recargarWeb() { return Web.recargar(); },
moverFichaBloque(el, dir) { return Web.moverFichaBloque(el, dir); },

  };
});
