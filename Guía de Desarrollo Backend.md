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
`DJANGO_CORS_ALLOWED_ORIGINS` acepta una lista separada por comas; agrega el origen exacto de Expo Web si usas una IP LAN. La app móvil nativa no requiere habilitar todos los orígenes.

Comprueba que el sistema reconozca la base de datos nefijj_db sin problemas:

.\.venv\Scripts\python.exe manage.py check

`manage.py check` valida la configuración de Django, pero no garantiza que MySQL esté disponible. Si `runserver` termina con `OperationalError (2002)` o `Can't connect to server on '127.0.0.1'`, revisa lo siguiente:

1. Inicia en XAMPP el módulo MySQL/MariaDB que contiene `nefijj_db`. La configuración de ejemplo del proyecto usa el puerto `3308`.
2. Comprueba que el puerto configurado en `backend/.env` (`DB_HOST` y `DB_PORT`) coincida con el puerto indicado por XAMPP. Si usas otra instalación de MySQL, verifica que esa instancia contenga la base `nefijj_db`; no cambies el puerto a `3306` sin confirmar que corresponde a tus datos.
3. Desde PowerShell, comprueba el puerto configurado. Para el valor de ejemplo:

   Test-NetConnection 127.0.0.1 -Port 3308

   El resultado debe mostrar `TcpTestSucceeded: True`. Si es `False`, inicia el servicio correcto o corrige `DB_PORT` en `backend/.env` para que coincida con el puerto real.
4. Comprueba la conexión autenticada de Django:

   .\.venv\Scripts\python.exe manage.py shell -c "from django.db import connection; connection.ensure_connection(); print('Conexión a la base de datos correcta')"

   Si falla, verifica también que `DB_NAME`, `DB_USER` y `DB_PASSWORD` en `.env` correspondan a esa instancia.

La base local `nefijj_db` contiene un esquema legado. Las migraciones de cuentas e incidencias hasta `incidents.0003` se revisaron y aplicaron; esta última conserva claves foráneas `INT` porque las claves primarias existentes son enteros de 32 bits. Antes de migrar otra base, revisa `showmigrations` y `migrate --plan`; no ejecutes migraciones globales contra una base legado sin revisar el plan y aprobarlo.

Arranca el servidor local en la interfaz de red universal (0.0.0.0) para que los dispositivos móviles en la misma red Wi-Fi puedan realizar peticiones HTTP:

.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000

Para ejecutar exclusivamente las pruebas automatizadas sin conectar MySQL, puedes activar SQLite solo en la sesión actual de PowerShell y ejecutar el test runner:

   $env:DJANGO_USE_SQLITE = "1"
   .\.venv\Scripts\python.exe manage.py test

SQLite en este modo es una base temporal de pruebas; no sustituye a `nefijj_db` para iniciar la aplicación ni contiene sus datos.

4. Cuentas y Contraseñas

- Usa cuentas individuales y asigna a cada una el rol correspondiente (`user`, `technician`, `organization_admin` o `superadmin`). No compartas cuentas entre personas.
- No definas contraseñas predeterminadas en esta guía, en el código ni en el repositorio. Usa el mecanismo de autenticación y almacenamiento seguro de contraseñas de Django; nunca almacenes contraseñas en texto plano.
- Crea las cuentas mediante los mecanismos de administración disponibles en el proyecto. No inventes nombres de usuario ni credenciales de prueba para entornos reales.
- Permite cambiar la contraseña desde el perfil autenticado solicitando la contraseña actual y confirmando la nueva. Cualquier recuperación desde la pantalla de acceso debe verificar la identidad del usuario; define el mecanismo antes de habilitar ese flujo.

5. Autorización estricta por rol y tenant

- Cada endpoint verifica membresía activa y estado activo de organización/sede en el servidor. No uses un `organization_id` recibido del cliente como autorización.
- `user`: solo sus propios reportes de su sede activa; debe aceptar una invitación para vincular una cuenta existente.
- `technician`: puede consultar incidencias de su sede, pero solo cambiar las asignadas a su cuenta en el orden `pendiente` → `en_proceso` → `resuelto`.
- `organization_admin`: gestiona datos e incidencias solo de organizaciones activas donde tenga membresía `organization_admin`. Puede asignar/reasignar incidencias a técnicos activos de la misma sede, pero no cambiar su estado.
- `superadmin`: crea/activa/suspende organizaciones y supervisa incidencias globalmente en modo de solo lectura.
- El superadministrador crea una cuenta `organization_admin` por organización; el administrador crea sedes y cuentas `technician` con contraseña inicial y una sede activa.
- El administrador puede establecer una contraseña provisional para técnicos y usuarios vinculados a sus sedes activas. La contraseña se valida y se guarda como hash; nunca se devuelve por la API. Se recomienda cambiarla desde Perfil.
- El administrador define categorías y un técnico responsable por combinación de categoría y sede. Los reportes nuevos se asignan automáticamente a esa cuenta; sin una ruta configurada quedan sin asignar.
- El administrador puede cambiar la asignación automática desde cada incidencia, pero solo un técnico activo de la misma sede es válido.
- Las imágenes deben recibirse con `MultiPartParser`/`FormParser` y validarse mediante el `ImageField` de DRF/Pillow antes de guardarse bajo `backend/media/evidences/`.

6. Endpoints de la API

- `POST /api/v1/auth/token/`: iniciar sesión con usuario y contraseña; devuelve tokens JWT.
- `POST /api/v1/auth/register/`: crear una cuenta de usuario con una invitación vigente; consume el código y devuelve tokens JWT para iniciar sesión inmediatamente.
- `GET /api/v1/auth/me/`: consultar el perfil autenticado.
- `POST /api/v1/auth/change-password/`: cambiar la contraseña de la sesión autenticada.
- `GET /api/v1/auth/my-organizations/`: consultar las organizaciones activas que administra.
- `GET|POST /api/v1/auth/organization-admins/`: superadministrador lista o crea administradores de organización.
- `PATCH /api/v1/auth/organization-admins/{id}/`: superadministrador activa/desactiva una membresía administrativa.
- `PUT|POST /api/v1/auth/organization-admins/{id}/password/`: superadministrador restablece la contraseña de un administrador de organización (también disponible vía `PUT /api/v1/auth/organization-admins/{id}/`).
- `DELETE /api/v1/auth/organization-admins/{id}/`: superadministrador elimina la cuenta de un administrador de organización y limpia sus dependencias protegidas.
- `GET|POST /api/v1/auth/technicians/`: administrador lista o crea técnicos de sus sedes.
- `PATCH /api/v1/auth/technicians/{id}/`: administrador activa/desactiva el acceso técnico dentro de sus sedes.
- `PUT /api/v1/auth/technicians/{id}/password/`: administrador establece una contraseña provisional para un técnico de sus sedes.
- `GET /api/v1/auth/users/`: administrador lista usuarios con membresía activa en sus sedes activas.
- `PUT /api/v1/auth/users/{id}/password/`: administrador establece una contraseña provisional para un usuario de sus sedes.
- `POST /api/v1/auth/organization-invitations/`: administrador crea una invitación QR para una sede de su organización activa; el código se devuelve al crearla y se conserva cifrado para recuperarlo mientras esté activo.
- `GET /api/v1/auth/organization-invitations/`: consultar metadatos de invitaciones propias.
- `POST /api/v1/auth/organization-invitations/{id}/reveal/`: recuperar el código de una invitación activa propia; la respuesta se marca `no-store`.
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
- `PATCH /api/v1/incidents/{id}/`: el administrador envía `assigned_to` para asignar/reasignar un técnico de la sede; el técnico asignado envía `status` para avanzar el flujo permitido.

Las invitaciones se almacenan como hash y cifradas para su recuperación, tienen un solo uso, admiten revocación y vencen en siete días hábiles calculados en `America/Bogota` (lunes a viernes; los festivos no se excluyen sin calendario configurado). El cifrado usa una clave derivada de `DJANGO_SECRET_KEY`; conserva esa clave estable o no se podrán descifrar códigos guardados. Las invitaciones antiguas, anteriores a la columna cifrada, no se pueden recuperar y deben reemplazarse. Un usuario nuevo puede registrarse desde el acceso con `POST /api/v1/auth/register/`; una cuenta existente puede seguir usando `POST /api/v1/auth/invitations/accept/`. El QR no es una contraseña ni un token JWT. Las migraciones de invitaciones e incidencias se probaron en SQLite y están aplicadas a la base local `nefijj_db`.

Las evidencias no deben exponerse con `static()` ni servirse directamente desde `MEDIA_URL`: el endpoint protegido valida el mismo queryset/alcance que el detalle de la incidencia y devuelve `Cache-Control: private, no-store`.

La tabla `incidents_categorytechnician` se creó con `incidents.0002_categorytechnician_and_more`; las migraciones ya aplicadas a `nefijj_db` no deben repetirse.

7. Funciones de atención de incidencias implementadas

- `GET /api/v1/notifications/` lista avisos del usuario autenticado; `POST /api/v1/notifications/{id}/read/` marca uno como leído. Se avisa al técnico al asignar/reasignar y al reportante cuando cambia el estado. Push no está incluido.
- El detalle de incidencia incluye historial cronológico de creación, asignaciones/reasignaciones y cambios de estado, con actor y fecha.
- El técnico asignado debe enviar `resolution_note` no vacía al resolver. `resolution_image` es opcional; se sirve por el endpoint protegido de evidencia con `?kind=resolution`.
- La respuesta incluye `sla_due_at` y `sla_status`: crítica 4 h, alta 8 h, media 24 h y baja 72 h corridas desde la creación.
- La migración `incidents.0003_incident_resolution_image_incident_resolution_note_and_more` se probó en SQLite y se aplicó a `nefijj_db` después de ajustar las claves foráneas al tipo entero del esquema legado.