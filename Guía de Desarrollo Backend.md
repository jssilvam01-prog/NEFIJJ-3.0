Guía de Desarrollo Backend - NEFIJJ

1. Requisitos Previos

Python 3.10 o superior.

XAMPP con MySQL/MariaDB activo en el puerto 3308.

Base de datos creada:

CREATE DATABASE IF NOT EXISTS nefijj_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


2. Instalación de Dependencias

Desde la carpeta backend/, abre PowerShell y ejecuta:

python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt


El archivo requirements.txt contiene:

Django==4.2.16

djangorestframework==3.15.2

djangorestframework-simplejwt==5.3.1

mysqlclient==2.3.0

django-cors-headers==4.3.0

python-dotenv==1.0.1

Pillow==11.3.0 (Obligatorio para la gestión y validación de imágenes de evidencia).

3. Verificación y Ejecución del Servidor

Antes de iniciar, copia `.env.example` como `.env` y define `DJANGO_SECRET_KEY` con un valor aleatorio local. No compartas ni subas `.env` al repositorio.

Comprueba que el sistema reconozca la base de datos nefijj_db sin problemas:

.\.venv\Scripts\python.exe manage.py check

La base `nefijj_db` ya contiene un esquema legado y registros de migraciones anteriores. El backend se adapta a sus tablas existentes. **No ejecutes `manage.py migrate` en esa base** hasta revisar y aprobar un plan de migración; la comprobación de migraciones mostró operaciones pendientes de Django Admin.

Arranca el servidor local en la interfaz de red universal (0.0.0.0) para que los dispositivos móviles en la misma red Wi-Fi puedan realizar peticiones HTTP:

.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000

4. Cuentas y Contraseñas

- Usa cuentas individuales y asigna a cada una el rol correspondiente (`user`, `technician`, `organization_admin` o `superadmin`). No compartas cuentas entre personas.
- No definas contraseñas predeterminadas en esta guía, en el código ni en el repositorio. Usa el mecanismo de autenticación y almacenamiento seguro de contraseñas de Django; nunca almacenes contraseñas en texto plano.
- Crea las cuentas mediante los mecanismos de administración disponibles en el proyecto. No inventes nombres de usuario ni credenciales de prueba para entornos reales.
- Permite cambiar la contraseña desde el perfil autenticado solicitando la contraseña actual y confirmando la nueva. Cualquier recuperación desde la pantalla de acceso debe verificar la identidad del usuario; define el mecanismo antes de habilitar ese flujo.

5. Autorización estricta por rol y tenant

- Cada endpoint verifica membresía activa y estado activo de organización/sede en el servidor. No uses un `organization_id` recibido del cliente como autorización.
- `user`: solo sus propios reportes de su sede activa; debe aceptar una invitación para vincular una cuenta existente.
- `technician`: puede consultar incidencias de su sede, pero solo cambiar las asignadas a su cuenta en el orden `pendiente` → `en_proceso` → `resuelto`.
- `organization_admin`: gestiona datos e incidencias solo de organizaciones activas donde tenga membresía `organization_admin`.
- `superadmin`: crea/activa/suspende organizaciones y supervisa incidencias globalmente en modo de solo lectura.
- El superadministrador crea una cuenta `organization_admin` por organización; el administrador crea sedes y cuentas `technician` con contraseña inicial y una sede activa.
- El administrador define categorías y un técnico responsable por combinación de categoría y sede. Los reportes nuevos se asignan automáticamente a esa cuenta; sin una ruta configurada quedan sin asignar.
- Las imágenes deben recibirse con `MultiPartParser`/`FormParser` y validarse mediante el `ImageField` de DRF/Pillow antes de guardarse bajo `backend/media/evidences/`.

6. Endpoints de la API

- `POST /api/v1/auth/token/`: iniciar sesión con usuario y contraseña; devuelve tokens JWT.
- `GET /api/v1/auth/me/`: consultar el perfil autenticado.
- `POST /api/v1/auth/change-password/`: cambiar la contraseña de la sesión autenticada.
- `GET /api/v1/auth/my-organizations/`: consultar las organizaciones activas que administra.
- `GET|POST /api/v1/auth/organization-admins/`: superadministrador lista o crea administradores de organización.
- `PATCH /api/v1/auth/organization-admins/{id}/`: superadministrador activa/desactiva una membresía administrativa.
- `PUT|POST /api/v1/auth/organization-admins/{id}/password/`: superadministrador restablece la contraseña de un administrador de organización (también disponible vía `PUT /api/v1/auth/organization-admins/{id}/`).
- `DELETE /api/v1/auth/organization-admins/{id}/`: superadministrador elimina la cuenta de un administrador de organización y limpia sus dependencias protegidas.
- `GET|POST /api/v1/auth/technicians/`: administrador lista o crea técnicos de sus sedes.
- `PATCH /api/v1/auth/technicians/{id}/`: administrador activa/desactiva el acceso técnico dentro de sus sedes.
- `POST /api/v1/auth/organization-invitations/`: administrador crea una invitación QR para una sede de su organización activa; el código solo se devuelve al crearla.
- `GET /api/v1/auth/organization-invitations/`: consultar metadatos de invitaciones propias.
- `POST /api/v1/auth/organization-invitations/{id}/revoke/`: revocar invitación no utilizada.
- `POST /api/v1/auth/invitations/accept/`: estudiante autenticado acepta una invitación vigente para vincular su cuenta.
- `GET|POST /api/v1/locations/`: consultar sedes activas y crear sedes de organizaciones administradas.
- `PATCH /api/v1/locations/{id}/`: actualizar o desactivar/reactivar una sede de su organización.
- `/api/v1/organizations/`: superadministrador crea, lista, activa y suspende organizaciones.
- `GET /api/v1/categories/`: consultar categorías dentro del ámbito permitido.
- `POST /api/v1/categories/`, `PATCH /api/v1/categories/{id}/`: administrador crea, edita y activa/desactiva categorías; no se eliminan.
- `GET|POST|DELETE /api/v1/categories/{id}/routes/`: administrar la asignación de técnico por categoría y sede.
- `GET /api/v1/incidents/`: consultar incidencias visibles para el rol y la sede.
- `GET /api/v1/incidents/{id}/evidence/`: consultar la imagen solo si la incidencia también es visible para la cuenta autenticada.
- `POST /api/v1/incidents/`: crear una incidencia con datos multipart y evidencia opcional.
- `PATCH /api/v1/incidents/{id}/`: actualizar el estado de una incidencia permitida.

Las invitaciones se almacenan como hash, tienen un solo uso, admiten revocación y vencen en siete días hábiles calculados en `America/Bogota` (lunes a viernes; los festivos no se excluyen sin calendario configurado). El QR no es una contraseña ni un token JWT. El código y la migración se validan en SQLite temporal; la nueva migración no se ha aplicado a MySQL. No ejecutes `manage.py migrate` en `nefijj_db` hasta revisar la compatibilidad con el esquema legado y aprobarla.

Las evidencias no deben exponerse con `static()` ni servirse directamente desde `MEDIA_URL`: el endpoint protegido valida el mismo queryset/alcance que el detalle de la incidencia y devuelve `Cache-Control: private, no-store`.

La nueva tabla `incidents_categorytechnician` requiere la migración `incidents.0002_categorytechnician_and_more`. No apliques migraciones pendientes a `nefijj_db` hasta revisar y aprobar su efecto sobre el esquema legado.