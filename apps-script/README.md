# Google Apps Script - Backend de GN-Encuestas

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `Code.gs` | Punto de entrada. Maneja GET/POST y rutea endpoints. |
| `Config.gs` | Configuración: Sheet IDs, Firebase, roles, encuestas. |
| `Auth.gs` | Verificación de tokens Firebase JWT. |
| `DataFilter.gs` | Filtrado de datos por rol (admin/usuario). |
| `PdfService.gs` | Generación de PDF con Google Docs. |

## Configuración

### 1. Crear proyecto en script.google.com

1. Ir a https://script.google.com
2. Click "Nuevo proyecto"
3. Renombrar: `gn-encuestas-api`

### 2. Copiar los archivos

Copiar cada archivo `.gs` de esta carpeta al proyecto de Apps Script.

### 3. Configurar Config.gs

```javascript
var CONFIG = {
  SPREADSHEET_ID: 'ID_DE_TU_GOOGLE_SHEET',
  FIREBASE_PROJECT_ID: 'tu-proyecto-firebase',
  // ...
};
```

**Para obtener el SPREADSHEET_ID:**
- Abrir tu Google Sheet
- Copiar el ID de la URL: `https://docs.google.com/spreadsheets/d/ESTE_ID/edit`

### 4. Configurar encuestas

En `Config.gs`, definir las encuestas en el objeto `surveys`:

```javascript
surveys: {
  'mi-encuesta': {
    name: 'Nombre de la Encuesta',
    sheetId: null,  // null = usa el SPREADSHEET_ID principal
    sheetName: 'NombreDeLaHoja',
    formId: 'ID_DEL_GOOGLE_FORM',
    visible: true
  }
}
```

Si cada Google Form está en un Sheet diferente:
```javascript
surveys: {
  'encuesta-1': {
    name: 'Encuesta 1',
    sheetId: 'SPREADSHEET_ID_DEL_FORM_1',
    sheetName: 'Respuestas',
    visible: true
  }
}
```

### 5. Preparar el Sheet

Añadir una columna `userId` con los UIDs de Firebase de cada encuestador.

Para obtener los UIDs: Firebase Console → Authentication → Users → copiar UID.

### 6. Desplegar

1. "Deploy" → "New deployment"
2. Tipo: "Web app"
3. Execute as: "Me"
4. Who has access: "Anyone"
5. Copiar la URL generada

### 7. Endpoints

| Método | Endpoint | Parámetros | Descripción |
|--------|----------|-----------|-------------|
| GET | `surveys` | - | Lista de encuestas disponibles |
| GET | `responses` | `id=surveyId` | Respuestas de una encuesta |
| GET | `stats` | `id=surveyId` | Estadísticas de una encuesta |
| GET | `user-profile` | - | Perfil del usuario autenticado |
| POST | `generate-pdf` | body JSON | Genera PDF |

### 8. Autenticación

Todas las peticiones incluyen el token JWT:
- Header: `Authorization: Bearer <token>`
- O parámetro URL: `?token=<token>`

El token lo genera Firebase Auth en el frontend.

## Troubleshooting

**Error "Origen no permitido":**
- Añadir tu dominio a `ALLOWED_ORIGINS` en Config.gs

**Error "Token inválido":**
- Verificar que el `FIREBASE_PROJECT_ID` es correcto
- Verificar que el usuario existe en Firebase

**No se ven datos:**
- Verificar el `SPREADSHEET_ID`
- Verificar que la hoja tiene datos y la primera fila son headers
- Verificar que la columna `userId` tiene los UIDs correctos

**Rate limiting:**
- Por defecto: 100 req/min por usuario
- Ajustar `CONFIG.RATE_LIMIT` si es necesario
