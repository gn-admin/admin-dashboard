# GN-Encuestas

PWA para visualización y exportación de encuestas de Google Forms, con autenticación Firebase y generación de PDF.

## Inicio rápido (desarrollo local)

```bash
# 1. Configurar las variables de entorno (copiar y rellenar)
cp .env.example .env

# 2. Instalar dependencias
npm install

# 3. Ejecutar en modo local (mock backend)
npm run dev
```

Abrir `http://localhost:8080` en el navegador.

## Variables de entorno (privacy)

Los valores reales (URL del backend, claves de Firebase, IDs de hojas/formularios) **no se suben a git**. Se definen en `.env` (local) y, para el despliegue en GitHub Pages, como **Repository variables/secretos** de GitHub:

1. GitHub → **Settings → Secrets and variables → Actions**.
2. Añadir cada clave de [`.env.example`](.env.example) como *Variable* o *Secret*.

## Estructura del proyecto

```
gn-encuestas/
├── .github/workflows/     # Despliegue automático a GitHub Pages
├── scripts/
│   └── gen-config.js      # Genera config a partir de .env / variables de CI
├── src/                   # Frontend PWA
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js              # Service Worker
│   ├── css/styles.css     # Mobile-first CSS
│   ├── assets/icons/      # logo + iconos PWA
│   └── js/
│       ├── config.js      # Configuración (GENERADO desde .env, ignorado)
│       ├── icons.js
│       ├── auth.js
│       ├── api.js
│       ├── dashboard.js
│       ├── carnet-generator.js
│       ├── pdf-export.js
│       └── app.js
├── tests/                 # Unitarios (`npm test`, node --test, sin dependencias)
├── .env.example
├── package.json
└── .gitignore
```

## Despliegue

1. Configurar Google Apps Script y desplegar el backend (`apps-script/`).
2. Configurar Firebase Authentication.
3. Subir el repo a GitHub y activar **Pages → Source: GitHub Actions** (rama `main`).
4. Añadir las variables frontend en Settings → Secrets and variables → Actions.
5. Recordar actualizar `ALLOWED_ORIGINS` con la URL real y re-desplegar el backend si procede.
