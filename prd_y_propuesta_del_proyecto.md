# 01. Propuesta y PRD del Proyecto - NEFIJJ

## 1. Nombre y Resumen Ejecutivo
**NEFIJJ** es un sistema institucional multisedes y multiempresa (multi-tenant) diseñado para la gestión, reporte y seguimiento de incidencias operativas y de infraestructura. Permite que los estudiantes y usuarios reporten anomalías adjuntando imágenes de evidencia, mientras que los técnicos y administradores organizacionales gestionan y resuelven dichos reportes dentro de su sede y organización.

El backend se conecta a una base de datos MySQL llamada **`nefijj_db`** alojada localmente mediante **XAMPP** (ejecutándose en el puerto **3308**), y la aplicación móvil frontend se despliega de manera ágil utilizando **Expo Go** mediante códigos QR e IPs locales en la red Wi-Fi de desarrollo.

## 2. Estructura de Directorios del Proyecto
Para mantener una organización limpia y profesional, el repositorio se estructura de la siguiente manera:

```text
nefijj/
├── backend/                  # Servidor Django REST Framework
│   ├── accounts/             # App de autenticación, usuarios, sedes y organizaciones
│   ├── incidents/            # App de categorías, incidencias, historial y evidencias
│   ├── config/               # Configuración global de Django (settings, urls, wsgi)
│   ├── media/                # Carpeta física para almacenamiento de archivos multimedia
│   │   └── evidences/        # Subcarpeta para las fotos de evidencia subidas por estudiantes
│   ├── requirements.txt      # Dependencias de Python (Django, DRF, Pillow, mysqlclient)
│   └── manage.py             # Script de gestión de Django
├── mobile/                   # Aplicación Frontend en React Native con Expo
│   ├── src/                  # Código fuente (screens, navigation, services)
│   ├── assets/               # Recursos estáticos locales
│   ├── package.json          # Dependencias de Node.js
│   └── App.js                # Componente raíz de la app móvil
└── docs/                     # Documentación técnica y arquitectura (.md)
```

## 3. Roles y Reglas de Negocio
- **Cuentas y contraseñas:** Cada persona usa una cuenta individual. Las contraseñas no se guardan en Markdown, el repositorio, capturas ni logs.
- **Aislamiento multi-tenant:** Cada solicitud valida la membresía activa y el estado activo de la organización y sede. El servidor filtra por `organization_id` y `location_id`; no confía en identificadores de tenant enviados por el cliente.
- **Estudiante / Usuario (`user`):** Inicia sesión con su cuenta existente y luego escanea o ingresa un código de invitación para vincularse a una organización y sede. Solo crea incidencias con título, descripción, categoría, prioridad y evidencia fotográfica opcional; consulta exclusivamente sus propios reportes de la sede/organización activa.
- **Técnico (`technician`):** Lo crea el administrador de su organización y queda asignado a una sede. Consulta todas las incidencias de esa sede, incluidas las evidencias, pero solo cambia incidencias asignadas a su cuenta y únicamente en el flujo `pendiente` → `en_proceso` → `resuelto`.
- **Administrador de Organización (`organization_admin`):** Gestiona solo su organización activa, incluidas todas sus sedes e incidencias. Administra personal de soporte, categorías, sedes, protocolos y alertas operativas; genera y revoca invitaciones QR para estudiantes.
- **Superadministrador (`superadmin`):** Tiene supervisión global y administra el ciclo de vida de organizaciones (crear, activar y suspender). Puede consultar incidencias globalmente, pero no realizar cambios operativos en ellas.
- **Invitaciones QR:** El administrador selecciona una sede activa. El servidor genera un código aleatorio de un solo uso, almacena solo su hash y permite revocarlo. El código vence en siete días hábiles en la zona horaria `America/Bogota` (lunes a viernes; los festivos no se excluyen mientras no se configure un calendario institucional). El estudiante debe estar autenticado y tener una cuenta existente para aceptarlo. El QR no contiene contraseñas ni tokens JWT.
- **Evidencias:** La API admite `multipart/form-data`; DRF/Pillow valida imágenes y las almacena bajo `backend/media/evidences/`, fuera de la base de datos. Se sirven solo por un endpoint autenticado que aplica los mismos filtros de tenant y rol que las incidencias.
- **Cambio de contraseña:** La aplicación debe ofrecer una opción para cambiar o recuperar la contraseña desde el acceso mediante un flujo seguro de verificación de identidad, y para cambiarla desde el perfil de una sesión autenticada. El mecanismo de recuperación debe definirse antes de implementarlo. Desde el perfil, se debe solicitar la contraseña actual y confirmar la nueva.

### Cuentas locales de referencia

Estos nombres identifican cuentas existentes o propuestas para el entorno local; no incluyen contraseñas:

| Usuario | Rol | Organización / ámbito | Estado |
|---|---|---|---|
| `admin_guajira` | `organization_admin` | Guajira | Cuenta existente; administra y distribuye el QR de la organización. |
| `estudiante_mai` | `user` | Maicao | Cuenta existente de usuario de la organización. |
| `tecnico_mai` | `technician` | Sede y organización por confirmar | Cuenta existente; su alcance se determina por la membresía asignada. |
| `superadmin` | `superadmin` | Plataforma completa | Cuenta local creada; las credenciales se entregaron aparte y no se documentan aquí. |

Las contraseñas se configuran o restablecen de forma segura y no se guardan en esta documentación. El QR de desarrollo de Expo Go es distinto del QR de organización.

## 4. Criterios de Éxito del MVP
1. El estudiante puede reportar una incidencia con imagen desde la app móvil corriendo en **Expo Go** conectada a la API local de Django.
2. La imagen se guarda de forma segura en `backend/media/evidences/` y su ruta relativa se registra en la base de datos MySQL `nefijj_db`.
3. El técnico y el administrador visualizan, al consultar la API, los reportes correspondientes a su sede/organización desde Expo Go y la IP LAN.
4. Cada usuario accede con su propia cuenta y puede cambiar su contraseña; la recuperación segura sigue pendiente de definir.
5. El usuario inicia sesión, acepta una invitación QR vigente y de un solo uso, y el servidor crea su membresía en la sede correspondiente.
6. El superadministrador puede crear, activar y suspender organizaciones, pero sus permisos sobre incidencias son de solo lectura.

## 5. Estado de Implementación

- Implementados y probados en SQLite temporal: aislamiento inicial por membresías/organizaciones/sedes activas, flujo de estado permitido, invitación QR con hash/uso único/revocación/vigencia, panel móvil de invitaciones y administración de organizaciones por superadmin.
- Implementados: alta de administradores por superadmin; gestión de sedes y técnicos por administrador de organización; CRUD lógico de categorías y asignación automática de incidencias por técnico, categoría y sede desde la app móvil.
- La migración para la tabla de invitaciones está generada, pero no se ha aplicado a `nefijj_db`; el flujo QR requiere aprobar y aplicar esa migración para operar con MySQL.
- La migración `incidents.0002_categorytechnician_and_more` agrega la configuración de enrutamiento y tampoco se ha aplicado a `nefijj_db`.
- Pendiente: protocolos, alertas operativas, recuperación segura de contraseña y validación física con Expo Go.