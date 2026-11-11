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
- `npm test` — `node --test tests/*.test.js` (357 tests en verde). Corren en CI.

## Arquitectura

- `src/`: `index.html` + `js/` + `css/styles.css` + `sw.js` + `manifest` + assets.
- Router por hash (`app.js`). Sin framework ni build de JS.
- `apps-script/` (gitignored, solo local para desplegar): `Code.gs`, `Config.gs`, `Auth.gs`, `DataFilter.gs`, `PdfService.gs`.

## Pendientes lado humano (fuera de git)

Los pasos de despliegue manual del backend (pegar `Code.gs`/`Config.gs`, configurar Secrets, crear hojas, etc.) están en `.internal-docs/PROGRESO.md`.
