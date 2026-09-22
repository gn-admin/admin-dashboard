# Checklist de Producción - GN-Encuestas

Marcar cada ítem con [x] cuando esté verificado. Todos deben estar marcados antes de desplegar.

## Seguridad Backend (Apps Script)

- [ ] `Auth.gs` verifica el JWT de Firebase en cada petición
- [ ] `Auth.gs` rechaza tokens expirados
- [ ] `Auth.gs` rechaza tokens inválidos/falsificados
- [ ] `DataFilter.gs` filtra datos por uid del usuario
- [ ] `DataFilter.gs` solo el rol 'admin' ve todos los datos
- [ ] No hay acceso al Sheet sin pasar por el filtro
- [ ] Rate limiting implementado (máx 100 req/min por usuario)
- [ ] No se exponen errores detallados al cliente (solo mensajes genéricos)
- [ ] Config.gs no tiene valores hardcodeados sensibles

## Seguridad Frontend

- [ ] Token JWT se almacena en memoria (NO en localStorage ni cookies)
- [ ] Token se renueva antes de expirar
- [ ] No hay credenciales de Firebase hardcodeadas en JS (usar config de entorno o Variables de GitHub)
- [ ] .gitignore excluye archivos sensibles (.env, credenciales)
- [ ] No se muestra información sensible en la URL
- [ ] Cierre de sesión limpia el token de memoria
- [ ] Redirección a login si no hay sesión activa

## Firebase Authentication

- [ ] Proyecto Firebase creado
- [ ] Método email/password habilitado
- [ ] Método Google login habilitado (si aplica)
- [ ] Usuarios de prueba creados con roles definidos
- [ ] Reglas de seguridad de Firestore/Realtime DB configuradas (si aplica)

## Funcionalidad

- [ ] Login funciona con email/password
- [ ] Login funciona con Google
- [ ] Login rechaza credenciales incorrectas
- [ ] Dashboard carga datos del usuario autenticado
- [ ] Admin ve todos los datos
- [ ] Usuario normal solo ve sus datos
- [ ] Exportar PDF genera un PDF válido
- [ ] PDF contiene solo los datos autorizados
- [ ] Filtros/búsqueda funcionan correctamente
- [ ] Loading states se muestran durante carga de datos

## Mobile / Responsive

- [ ] Se ve bien en 320px (iPhone SE, móviles pequeños)
- [ ] Se ve bien en 375px (iPhone 12/13/14)
- [ ] Se ve bien en 414px (iPhone Plus/Max)
- [ ] Se ve bien en 768px (iPad)
- [ ] Se ve bien en 1024px+ (desktop)
- [ ] Botones tienen tamaño mínimo de toque (44x44px)
- [ ] Texto legible sin hacer zoom
- [ ] Tablas son scrollables horizontalmente en móvil
- [ ] Teclado virtual no tapa contenido

## PWA

- [ ] manifest.webmanifest configurado con nombre, iconos, colores
- [ ] Service Worker registrado correctamente
- [ ] PWA se instala en Android (banner de instalación aparece)
- [ ] PWA se instala en iOS (Share → Add to Home Screen)
- [ ] Iconos PWA generados en todas las resoluciones necesarias
- [ ] Offline: muestra datos cacheados del último acceso
- [ ] Splash screen personalizado al abrir desde home

## PDF

- [ ] PDF se genera con formato A4 correcto
- [ ] Margenes adecuados (2cm)
- [ ] Datos del usuario aparecen en el PDF
- [ ] Fecha de generación incluida
- [ ] Logo/encabezado personalizado (si aplica)
- [ ] PDF se descarga en móvil correctamente
- [ ] PDF se ve bien al abrirlo en distintos dispositivos

## Despliegue

- [ ] Repositorio GitHub creado
- [ ] GitHub Pages habilitado (rama main o gh-pages)
- [ ] HTTPS activo en GitHub Pages
- [ ] Apps Script desplegado como Web App
- [ ] Apps Script: "Execute as" = "Me" (el propietario)
- [ ] Apps Script: "Who has access" = "Anyone" (verifica JWT)
- [ ] URL de Apps Script actualizada en config.js de producción
- [ ] Variables de entorno de Firebase configuradas en GitHub (si aplica)

## Pruebas en dispositivos reales

- [ ] Android: Chrome - Login → Dashboard → PDF
- [ ] Android: Chrome - Instalar PWA
- [ ] iOS: Safari - Login → Dashboard → PDF
- [ ] iOS: Safari - Instalar PWA (Add to Home Screen)
- [ ] Desktop: Chrome - Login → Dashboard → PDF
- [ ] Desktop: Firefox - Login → Dashboard → PDF

## Post-despliegue

- [ ] Verificar que el Sheet original NO es accesible directamente
- [ ] Verificar que un usuario no autenticado NO puede ver datos
- [ ] Verificar que un usuario normal NO ve datos de otros
- [ ] Monitoreo de errores configurado (opcional: Sentry)
- [ ] Documentación actualizada con URL de producción
