# Fotos de animales

Coloca aqui la **foto principal** de cada animal (formato JPG/PNG/WebP).

- Nombra el archivo con el **id del animal** o con su nombre sin espacios:
  - por id: AN3CUB2J.jpg
  - por nombre: max-imagen-principal.jpg
- Esta imagen se usa en la ficha, el carnet y el PDF del animal.
- El administrador puede subirla tambien desde el formulario (opcion 'Foto principal'), que la sube guardada y comprimida directamente a la hoja.

## Carpeta por animal (fotos adicionales)
Si quieres una carpeta propia por animal:
`
src/assets/animales/<nombre-animal>/
  1-principal.jpg
  2-grupo.jpg
  3-con-adoptante.jpg
`
Y en el campo 'Fotos (URLs, separadas por ;)' del formulario escribe ssets/animales/<nombre-animal>/1-principal.jpg.
