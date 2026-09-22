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

`npm run dev` regenera automáticamente `src/js/config.js` (y `apps-script/Config.gs`) a partir de `.env`. También se puede hacer manualmente con `npm run build`.

## Variables de entorno (privacy)

Los valores reales (URL del backend, claves de Firebase, IDs de hojas/formularios) **no se suben a git**. Se definen en `.env` (local) y, para el despliegue en GitHub Pages, como **Repository variables/secretos** de GitHub:

1. GitHub → **Settings → Secrets and variables → Actions**.
2. Añadir cada clave de [`.env.example`](.env.example) como *Variable* o *Secret*:

| Variable              | Descripción                                    |
|-----------------------|------------------------------------------------|
| `API_URL`             | URL del backend (Google Apps Script `/exec`)    |
| `FIREBASE_API_KEY`    | Clave pública de Firebase                        |
| `FIREBASE_AUTH_DOMAIN`| Dominio de autenticación                        |
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase                        |
| `FIREBASE_STORAGE_BUCKET` | Bucket de Storage                            |
| `FIREBASE_MESSAGING_SENDER_ID` | ID del emisor MSG                    |
| `FIREBASE_APP_ID`     | ID de la aplicación web                          |

(Solo las variables *Frontend* se necesitan en GitHub; las de *Backend Apps Script* son únicamente para regenerar `apps-script/Config.gs` localmente.)

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) inyecta esas variables al generar `src/js/config.js` antes de publicar.

## Estructura del proyecto

```
gn-encuestas/
├── docs/                  # Documentación
├── .github/workflows/     # Despliegue automático a GitHub Pages
├── apps-script/           # Backend (Google Apps Script)
│   ├── Code.gs            # Punto de entrada
│   ├── Config.gs          # Configuración (GENERADO desde .env)
│   ├── Auth.gs            # Verificación JWT
│   ├── DataFilter.gs      # Filtrado por rol
│   └── PdfService.gs      # Generación de PDF
├── scripts/
│   └── gen-config.js      # Genera config a partir de .env / variables de CI
├── src/                   # Frontend PWA
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js              # Service Worker
│   ├── css/styles.css     # Mobile-first CSS
│   └── js/
│       ├── config.js      # Configuración (GENERADO desde .env)
│       ├── auth.js
│       ├── api.js
│       ├── dashboard.js
│       ├── pdf-export.js
│       └── app.js
├── package.json
└── .gitignore
```

## Despliegue

Ver `docs/GUIA-DESPLIEGUE.md` para instrucciones completas.

Resumen:
1. Configurar Google Apps Script: ejecutar `npm run build` y desplegar `apps-script/` (Code.gs, Config.gs, Auth.gs, DataFilter.gs, PdfService.gs) en el proyecto Apps Script existente.
2. Configurar Firebase Authentication.
3. Subir el repo a GitHub y activar **Pages → Source: GitHub Actions** (usa la rama `main`; ajusta el nombre de rama en `.github/workflows/deploy.yml` si usas otra).
4. Añadir las variables frontend en Settings → Secrets and variables → Actions.
5. Recordar actualizar `ALLOWED_ORIGINS` en `.env` con la URL real `https://<usuario>.github.io` y re-desplegar el backend si procede.

## Roles

Ver `docs/ROLES.md` para definición de roles (Arquitecto, Diseñador, Desarrollador, Tester).
