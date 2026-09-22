# Guía de Despliegue - GN-Encuestas

## Requisitos previos

- Cuenta de Google (para Apps Script y Google Sheets)
- Cuenta de GitHub
- Cuenta de Firebase (gratis)
- Node.js instalado (para desarrollo local)
- Git instalado

---

## Paso 1: Configurar Google Apps Script

### 1.1 Crear el script

1. Ir a [script.google.com](https://script.google.com)
2. Click en "Nuevo proyecto"
3. Renombrar el proyecto: `gn-encuestas-api`
4. Borrar el código por defecto en `Code.gs`

### 1.2 Copiar el código

1. Copiar el contenido de `apps-script/Code.gs` al archivo `Code.gs` del proyecto
2. Crear un nuevo archivo: Archivo → Nuevo → Script → nombrar `Config.gs`
3. Copiar el contenido de `apps-script/Config.gs`
4. Repetir para `Auth.gs`, `DataFilter.gs`, `PdfService.gs`

### 1.3 Configurar Config.gs

Abrir `Config.gs` y rellenar:

```javascript
const CONFIG = {
  SPREADSHEET_ID: 'TU_SPREADSHEET_ID_AQUI',  // ID del Sheet
  FIREBASE_PROJECT_ID: 'tu-proyecto-firebase',
  ALLOWED_ORIGINS: ['https://tusuario.github.io'],
  RATE_LIMIT: 100,  // req/min por usuario
};
```

**Para obtener el SPREADSHEET_ID:**
1. Abrir tu Google Sheet
2. Copiar el ID de la URL: `https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit`

### 1.4 Desplegar como Web App

1. Click en "Deploy" → "New deployment"
2. Seleccionar tipo: "Web app"
3. Rellenar:
   - Description: `GN-Encuestas API v1`
   - Execute as: `Me` (tu cuenta)
   - Who has access: `Anyone`
4. Click "Deploy"
5. Copiar la URL del despliegue (algo como `https://script.google.com/macros/s/AKfyc.../exec`)
6. **Guardar esta URL** — la necesitarás para `config.js`

### 1.5 Dar permisos

1. La primera vez que un usuario acceda, pedirá permisos
2. Como "Execute as" eres tú, los permisos son los tuyos
3. Asegúrate de que tu cuenta tiene acceso al Sheet

---

## Paso 2: Configurar Firebase

### 2.1 Crear proyecto

1. Ir a [console.firebase.google.com](https://console.firebase.google.com)
2. Click "Add project"
3. Nombre: `gn-encuestas` (o el que prefieras)
4. Desactivar Google Analytics (no lo necesitas)
5. Click "Create project"

### 2.2 Habilitar Authentication

1. En el panel izquierdo, ir a "Authentication" → "Get started"
2. Pestaña "Sign-in method":
   - Habilitar "Email/Password"
   - Habilitar "Google" (opcional)
3. En "Settings" → "Authorized domains":
   - Añadir `localhost` (para desarrollo local)
   - Añadir `tusuario.github.io` (producción)

### 2.3 Crear usuarios de prueba

1. Ir a "Authentication" → "Users" tab
2. Click "Add user"
3. Crear un usuario admin:
   - Email: `admin@test.com`
   - Password: `test1234`
4. Crear un usuario normal:
   - Email: `usuario@test.com`
   - Password: `test1234`

### 2.4 Obtener configuración

1. Ir a "Project Settings" (icono engranaje)
2. En "General" → "Your apps" → Click icono web `</>`
3. Nombrar la app: `gn-encuestas-web`
4. Copiar el objeto de configuración:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "gn-encuestas.firebaseapp.com",
  projectId: "gn-encuestas",
  storageBucket: "gn-encuestas.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

5. Pegar estos valores en `src/js/config.js` en la sección `production.firebase`

---

## Paso 3: Configurar el Sheet

### 3.1 Añadir columna userId

1. Abrir tu Google Sheet existente
2. Añadir una columna al final con header `userId`
3. Rellenar los userIds de Firebase para cada encuestador
   - Para obtener el UID: Firebase Console → Authentication → Users → copiar UID

### 3.2 Proteger el Sheet (opcional pero recomendado)

1. En Google Sheets, ir a "Data" → "Protected sheets and ranges"
2. Proteger la hoja para que solo tu cuenta pueda editarla
3. Esto evita que se modifique manualmente

---

## Paso 4: Configurar desarrollo local

### 4.1 Instalar dependencias

```bash
cd gn-encuestas
npm install
```

### 4.2 Configurar modo local

Abrir `src/js/config.js`:

```javascript
const CONFIG = {
  MODE: 'local',  // ← Asegurar que está en 'local'
  // ...
};
```

### 4.3 Ejecutar

```bash
npm run dev
```

Esto abre `http://localhost:8080` con el mock backend.

### 4.4 Probar

1. Abrir `http://localhost:8080`
2. Debería verse la pantalla de login (mock)
3. Hacer login con credenciales mock
4. Ver el dashboard con datos de ejemplo
5. Probar exportar PDF

---

## Paso 5: Desplegar a producción

### 5.1 Cambiar a modo producción

En `src/js/config.js`:

```javascript
const CONFIG = {
  MODE: 'production',  // ← Cambiar a 'production'
  // ...
};
```

Actualizar las URLs y credenciales de Firebase.

### 5.2 Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/gn-encuestas.git
git push -u origin main
```

### 5.3 Activar GitHub Pages

1. Ir al repositorio en GitHub
2. Settings → Pages
3. Source: Deploy from a branch
4. Branch: `main` / `root`
5. Save

### 5.4 Verificar

1. Abrir `https://tusuario.github.io/gn-encuestas/`
2. Probar login con Firebase
3. Probar dashboard con datos reales
4. Probar exportar PDF

---

## Paso 6: Mantenimiento

### Actualizar el código

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

GitHub Pages se actualiza automáticamente.

### Actualizar Apps Script

1. Abrir script.google.com
2. Modificar el código
3. Deploy → Manage deployments → Edit → New version → Deploy

### Monitorear errores

- Revisar la consola del navegador (F12)
- En Apps Script: "Executions" para ver logs
- Firebase Console → Authentication para ver usuarios

---

## Troubleshooting

### "Error: Unauthorized" en el dashboard
- Verificar que el JWT se está enviando correctamente
- Verificar que el token no ha expirado
- Verificar que el usuario existe en Firebase

### Datos no aparecen en el dashboard
- Verificar el SPREADSHEET_ID en Config.gs
- Verificar que el Sheet tiene la columna userId
- Verificar que los userIds coinciden con los de Firebase

### PWA no se instala
- Verificar que hay HTTPS
- Verificar manifest.webmanifest es accesible
- Verificar Service Worker se registra (Pestaña Application en DevTools)

### PDF no se genera
- Verificar que jsPDF está cargado
- Verificar la consola del navegador para errores
