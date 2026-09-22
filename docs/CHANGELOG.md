# Changelog - GN-Encuestas

## [2026-09-19] - Estructura inicial del proyecto
- **Tipo:** feature
- **Roles involucrados:** Arquitecto, Disenador, Desarrollador, Tester
- **Descripcion:** Creacion completa de la estructura del proyecto con:
  - Frontend PWA (mobile-first, paleta Grupo Nebak)
  - Backend Apps Script (soporte multiples encuestas)
  - Firebase Auth para autenticacion
  - Mock backend para desarrollo local
  - Sistema de roles (admin/usuario)
  - Exportacion a PDF (individual y completa)
  - Documentacion (ROLES, ARQUITECTURA, CHECKLIST, GUIA-DESPLIEGUE)
- **Archivos creados:** Todos los archivos del proyecto
- **Estado:** completado

## [2026-09-19] - Fix: vista de respuestas no se mostraba
- **Tipo:** fix
- **Roles involucrados:** Desarrollador, Tester
- **Descripcion:** `showView()` quitaba `active` de `dashboard-view` al mostrar sub-vistas, ocultando todo el contenido. Solucionado con `showSubView()` que solo alterna entre las sub-vistas internas.
- **Archivos modificados:** src/js/dashboard.js
- **Estado:** completado

## [2026-09-19] - Contexto: encuestas de pre-adopcion
- **Tipo:** improvement
- **Roles involucrados:** Disenador, Desarrollador
- **Descripcion:** Cambio del contexto de las encuestas de satisfaccion a encuestas de pre-adopcion para animales (gatos, perros, acogida). Datos mock realistas con campos: tipo_animal, raza, nombre_animal, vivienda, jardin, ninos, otras_mascotas, experiencia, horas_fuera, motivo, observaciones. Vista detalle organizada por secciones (Solicitante, Animal, Hogar, Experiencia, Motivacion).
- **Archivos modificados:** src/js/mock-backend.js, src/js/dashboard.js
- **Estado:** completado

## [2026-09-19] - Logo de Grupo Nebak integrado
- **Tipo:** improvement
- **Roles involucrados:** Disenador, Desarrollador
- **Descripcion:** Integracion del logo de gruponebak.net en login, header, PDF y manifest. Footer de PDFs incluye "Grupo Nebak". Titulo y meta tags actualizados.
- **Archivos modificados:** src/index.html, src/css/styles.css, src/js/pdf-export.js, src/manifest.webmanifest, src/assets/icons/logo-nebak.jpg (nuevo)
- **Estado:** completado
