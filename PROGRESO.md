# GN-Encuestas / Admin Dashboard — Estado y pendientes

> Documento vivo de estado. Sin datos sensibles (sin URLs de exec, claves, IDs ni tokens). Los detalles operativos viven en `.internal-docs/PROGRESO.md` (no versionado).

## Qué es y dónde vive

PWA de administración para protectora (Grupo Nebak): encuestas de Google Forms (pre-adopción perros/gatos + solicitud de acogida), animales, familias acogedoras, adopciones con contrato, apadrinamientos, socios/voluntarios, lista negra, donaciones, gastos, recordatorios, seguimiento post-adopción, redes (simulado) y reportes.

- Front: GitHub Pages desde `main` vía Actions, repo **público**.
- Back: Google Apps Script (un proyecto, una implementación `/exec`), Sheets como BBDD.
- Auth: Firebase email/contraseña. Sin roles (todos admin, por decisión).

## Comandos

- `npm run dev` — genera config y sirve en `http://localhost:8080`.
- `npm run build` — regenera config (`node scripts/gen-config.js`).
- `npm run prerender` — genera fichas estáticas, `sitemap.xml` y `robots.txt` desde el canal público (el deploy lo ejecuta tras los tests; avisos como anotaciones del run). Fixtures en `tests/fixtures/prerender/`.
- `npm test` — `node --test tests/*.test.js` (554 tests en verde, 16 ficheros). 15/11: cerrado el hueco de la ficha recién publicada (cron cada 30 min, índice `publicaciones/index.json` y canonical solo si la estática existe) y el gestor ya no permite publicar fichas incompletas. 15/11: gestor web reordenado en móvil (estadísticas y fichas compactas, selector en filas) y login sin gate de reCAPTCHA. 15/11: corregida la delegación de `Dashboard` (los módulos `dashboard-*` no se fusionaban en el navegador, dejando inertes pestañas y botones del gestor).. Corren en CI y bloquean el despliegue.
- Media del gestor web: una carpeta de Drive por ficha (`animales|eventos|historias/<slug>`) bajo `DRIVE_WEB_FOLDER_ID`; se sube desde el formulario de la publicación.
- Ficha configurable (C3): `ficha` aditivo (plantilla/bloques/lectura), validado en backend y aplicado solo en detalle y prerender.

## Arquitectura

- `src/`: `index.html` + `js/` + `css/styles.css` + `sw.js` + `manifest` + assets.
- Router por hash (`app.js`). Sin framework ni build de JS.
- `apps-script/` (gitignored, solo local para desplegar): `Code.gs`, `Config.gs`, `Auth.gs`, `DataFilter.gs`, `PdfService.gs`.

## Pendientes lado humano (fuera de git)

Los pasos de despliegue manual del backend (pegar `Code.gs`/`Config.gs`, configurar Secrets, crear hojas, etc.) están en `.internal-docs/PROGRESO.md`.
