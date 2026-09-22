# GN-Encuestas - Planning de Transformacion a Admin Panel

## Vision
Transformar GN-Encuestas de un panel de encuestas a un **admin panel completo** estilo sb_admin para la gestion de una asociacion de animales (adopcion, acogidas, voluntarios, sin perrera fisica).

## Arquitectura Actual vs Target

### Actual (Fase 0)
```
Login → Encuestas (3 surveys) → Lista Negra
```

### Target (Fase 8)
```
Login → Dashboard Home
  ├── Encuestas
  │   ├── Pre-adopcion Perros
  │   ├── Pre-adopcion Gatos
  │   └── Solicitud de Acogida
  ├── Animales
  │   ├── Registro de Animales
  │   ├── Galeria
  │   └── Historial Medico
  ├── Acogidas
  │   ├── Familias Acogedoras
  │   ├── Asignaciones Activas
  │   └── Historial
  ├── Adopciones
  │   ├── Procesos Activos
  │   ├── Contratos
  │   └── Seguimiento Post-adopcion
  ├── Socios y Voluntarios
  │   ├── Registro
  │   ├── Horarios
  │   └── Actividad
  ├── Lista Negra
  ├── Reportes y Analytics
  └── Configuracion
```

---

## FASE 1: Reorganizar Estructura Base
**Objetivo:** Sidebar multi-seccion, dashboard home, routing limpio, foundation sb_admin

### Diseno
- Sidebar con categorias colapsables
- Logo + nombre arriba
- Usuario + logout abajo
- Contenido principal con area de trabajo
- Breadcrumb / page title
- Bottom nav mobile: solo iconos principales

### Funcionalidad
- Dashboard home (placeholder con cards de stats)
- Routing por secciones con hash (#dashboard, #encuestas, #animales, etc.)
- Todas las vistas existentes funcionando bajo nueva estructura
- Transiciones suaves

### Archivos a modificar
- index.html - Nuevo layout
- styles.css - Estilos sb_admin
- dashboard.js - Refactorizar en modulos
- app.js - Router con hash
- icons.js - Iconos adicionales

---

## FASE 2: Dashboard Home con Stats
**Objetivo:** Panel principal con metricas, graficos y actividad reciente

### Contenido
- 4 cards de metricas (Total solicitudes, En proceso, Adopciones completadas, Animales en acogida)
- Grafico de barras: solicitudes por mes
- Grafico de pie: distribucion por tipo de encuesta
- Alertas pendientes (nuevas solicitudes, seguimientos pendientes)
- Ultimas encuestas recibidas (tabla)
- Actividad reciente (timeline)

### Datos Dummy
- Metricas calculadas de las encuestas existentes
- Datos de ejemplo para graficos
- Alertas simuladas

---

## FASE 3: Encuestas Reorganizadas
**Objetivo:** Subsecciones de encuestas con navegacion clara

### Contenido
- Pre-adopcion Perros: lista, detalle, filtros
- Pre-adopcion Gatos: lista, detalle, filtros
- Solicitud de Acogida: lista, detalle, filtros
- Estadisticas por tipo de encuesta
- Exportacion PDF mejorada

---

## FASE 4: Modulo de Animales
**Objetivo:** Registro y gestion de animales

### Contenido
- Lista de animales con galeria de fotos
- Filtros: especie, raza, estado, edad
- Perfil detallado del animal
- Estados: disponible, en acogida, adoptado, en tratamiento
- Historial medico basico
- Fotos multiples

### Datos Dummy
- 10-15 animales de ejemplo (perros y gatos)
- Estados variados
- Fotos placeholder

---

## FASE 5: Modulo de Acogidas
**Objetivo:** Gestion de familias acogedoras

### Contenido
- Lista de familias acogedoras
- Perfil de familia (capacidad, especializacion, historial)
- Asignaciones activas (animal -> familia)
- Estado de capacidad (libre, ocupada,llena)
- Timeline de acogidas
- Seguimiento

### Datos Dummy
- 5-8 familias de ejemplo
- 3-4 asignaciones activas

---

## FASE 6: Socios y Voluntarios
**Objetivo:** Registro y gestion de personas

### Contenido
- Lista de socios/voluntarios
- Perfil con datos de contacto
- Areas de interes (paseos, eventos, transporte, etc.)
- Horarios de disponibilidad
- Horas registradas
- Estado (activo, inactivo, pendiente)

### Datos Dummy
- 8-10 voluntarios de ejemplo
- Diversas areas de interes

---

## FASE 7: Contratos y Adopciones
**Objetivo:** Seguimiento de procesos de adopcion

### Contenido
- Pipeline de adopcion (encuesta -> revision -> visita -> contrato -> entrega -> seguimiento)
- Generacion de contratos (PDF)
- Calendario de visitas domiciliarias
- Seguimiento post-adopcion (1 semana, 1 mes, 3 meses, 1 anio)
- Historial de adopciones

### Datos Dummy
- 3-4 procesos en diferentes etapas
- 2 contratos de ejemplo

---

## FASE 8: Reportes y Analytics
**Objetivo:** Dashboard de analisis avanzado

### Contenido
- Metricas de adopcion (tasa de conversion, tiempo promedio)
- Analisis de encuestas (respuestas mas comunes)
- Reportes de acogidas (duracion promedio, tasa de conversion)
- Actividad de voluntarios
- Exportacion de reportes

---

## FASE 9: Backend (.gs) Adaptado
**Objetivo:** Endpoints para todos los modulos

### Endpoints nuevos
- `GET /animals` - Lista de animales
- `POST /animals` - Crear animal
- `PUT /animals/:id` - Actualizar animal
- `GET /foster-families` - Familias acogedoras
- `POST /foster-families` - Crear familia
- `GET /assignments` - Asignaciones activas
- `POST /assignments` - Crear asignacion
- `GET /volunteers` - Voluntarios
- `POST /volunteers` - Crear voluntario
- `GET /contracts` - Contratos
- `POST /contracts` - Crear contrato
- `GET /stats/dashboard` - Estadisticas del dashboard
- `GET /activity-log` - Log de actividad

---

## Paleta de Colores (mantener)
- Primary: #1FC95B (verde Nebak)
- Secondary: #16E096
- Dark: #15863D
- Darkest: #0A431E
- Light: #AFF3C7
- Near-black: #191919

## Responsive
- Mobile: < 768px (bottom nav, 1 columna)
- Tablet: 768px - 1024px (sidebar colapsada, 2 columnas)
- Desktop: > 1024px (sidebar completa, 3 columnas)
