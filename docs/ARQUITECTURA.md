# Arquitectura del Sistema - GN-Encuestas

## Visión general

Aplicación PWA (Progressive Web App) para visualizar respuestas de formularios de Google, con autenticación Firebase y exportación a PDF.

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────┐
│                    USUARIO (móvil/desktop)               │
│                         │                                │
│                    ┌────▼────┐                           │
│                    │  PWA    │  GitHub Pages              │
│                    │  (Frontend)                          │
│                    └────┬────┘                           │
│                         │                                │
│              ┌──────────┼──────────┐                     │
│              │          │          │                      │
│         ┌────▼───┐ ┌───▼────┐ ┌──▼──────────┐           │
│         │Firebase│ │Apps    │ │jsPDF /       │           │
│         │Auth    │ │Script  │ │window.print  │           │
│         │(login) │ │(API)   │ │(PDF)         │           │
│         └────────┘ └───┬────┘ └──────────────┘           │
│                        │                                 │
│                 ┌──────▼──────┐                          │
│                 │Google Sheets│  (almacenamiento datos)   │
│                 └─────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

## Stack tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Frontend | HTML5 + CSS3 + JS vanilla | Ligero, sin dependencias, rápido en móvil |
| PWA | Service Worker + Manifest | Instalable, offline parcial |
| Auth | Firebase Authentication | Gestión de usuarios, JWT, Google login |
| Backend API | Google Apps Script | Gratis, conecta directo con Sheets |
| Almacenamiento | Google Sheets | Base de datos existente del usuario |
| PDF | jsPDF + CSS print | Generación en cliente |
| Hosting | GitHub Pages | Gratis, HTTPS, CI/CD con GitHub Actions |

## Flujo de autenticación

```
1. Usuario abre PWA
2. Redirect a Firebase Login (email/password o Google)
3. Firebase retorna JWT token
4. Frontend almacena token en memoria (no localStorage)
5. Cada petición a Apps Script incluye: Authorization: Bearer <token>
6. Apps Script verifica el token contra Google's public keys
7. Apps Script identifica el uid y role del usuario
8. Apps Script filtra los datos del Sheet según el rol
9. Retorna solo los datos permitidos
```

## Modelo de datos

### Google Sheet (estructura esperada)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| timestamp | DateTime | Fecha de la respuesta |
| encuestador | String | Nombre del encuestador |
| zona | String | Zona geográfica |
| pregunta_1 | String/Number | Respuesta pregunta 1 |
| pregunta_2 | String/Number | Respuesta pregunta 2 |
| ... | ... | ... |
| userId | String | UID de Firebase del encuestador |

### Roles y permisos

| Rol | Puede ver | Puede exportar |
|-----|-----------|----------------|
| admin | Todos los datos | Todos |
| usuario | Solo sus propios datos | Solo los suyos |

## Seguridad

### Capa 1: Firebase Auth
- Autentica quién es el usuario
- Emite JWT con uid y email
- Soporta email/password y Google OAuth

### Capa 2: Apps Script Backend
- Verifica el JWT en cada petición
- Filtra datos por uid antes de retornar
- No expone el Sheet directamente
- Rate limiting básico (100 req/min por usuario)

### Capa 3: Frontend
- Token en memoria (se pierde al cerrar pestaña)
- No hay datos hardcodeados en JS
- HTTPS forzado por GitHub Pages
- Service Worker solo cachea assets estáticos

### Lo que NUNCA se expone
- El ID del Google Sheet
- Credenciales de Service Account
- Datos de usuarios a otros usuarios
- El Sheet completo sin filtrar

## Modo local vs producción

### Desarrollo local
```javascript
CONFIG.MODE = 'local'
```
- MockBackend simula respuestas del servidor
- Firebase Auth mockeado (usuarios ficticios)
- Sin dependencia de servicios externos
- Ideal para desarrollo y pruebas unitarias

### Producción
```javascript
CONFIG.MODE = 'production'
```
- Peticiones reales a Apps Script
- Firebase Auth real
- Datos reales del Google Sheet
- Desplegado en GitHub Pages

## Decisiones técnicas

### ¿Por qué no Monaca/APK?
- Las APK se pueden decompilar
- Si el Sheet está conectado al APK, los datos son accesibles
- Mantener APK actualizada es más costoso
- PWA cubre el 90% de los casos de uso

### ¿Por qué no React/Vue/Angular?
- Para este caso, vanilla JS es suficiente
- Menos dependencias = menos puntos de fallo
- Más rápido en dispositivos antiguos
- Más fácil de mantener a largo plazo

### ¿Por qué Apps Script como backend?
- Gratis
- Conecta directo con Google Sheets
- No necesita servidor separado
- Deploy con un clic
