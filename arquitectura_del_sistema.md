# 03. Arquitectura del Sistema - NEFIJJ

## 1. Vista General y Flujo de Datos
NEFIJJ utiliza una arquitectura cliente-servidor en capas:
1. **Frontend Móvil (React Native / Expo Go):** Aplicación interpretada por el cliente Expo Go en un dispositivo físico o emulador. Se conecta a la API mediante peticiones HTTP(S) utilizando la dirección IP LAN de la computadora de desarrollo (por ejemplo, `http://192.168.1.X:8000/api/v1/`).
2. **API REST (Django + Django REST Framework):** Capa de lógica de negocio que valida tokens JWT, aplica filtros de aislamiento multi-tenant y procesa la subida de imágenes con la librería `Pillow`.
3. **Capa de Persistencia (MySQL / XAMPP):** Base de datos relacional **`nefijj_db`** corriendo en el puerto **3308** de XAMPP. Almacena las tablas de usuarios, sedes, membresías, categorías e incidencias, guardando las rutas relativas de las imágenes de evidencia.

## 2. Configuración de Base de Datos (`nefijj_db`)
En el archivo ignorado `backend/.env`, la conexión se establece desde `backend/config/settings.py` para enlazarse con XAMPP. `DB_HOST` y `DB_PORT` deben coincidir con la instancia donde existe `nefijj_db`; el valor documentado para XAMPP es `127.0.0.1:3308`.

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'nefijj_db',
        'USER': 'root',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '3308',
    }
}
```

Si Django informa `OperationalError (2002)` o que no puede conectarse a `127.0.0.1`, normalmente el servicio no está iniciado o el puerto de `.env` no coincide con el de MySQL. Inicia la instancia correcta y comprueba el puerto con `Test-NetConnection 127.0.0.1 -Port 3308` (ajústalo al puerto configurado). No cambies a otra instalación/puerto sin confirmar que contiene la base institucional. El modo SQLite se reserva a pruebas y no se activa como fallback. No ejecutes migraciones en la base legado sin aprobarlas.

## 3. Funcionamiento con Expo Go (QR e IP Local)
Durante el desarrollo móvil, **Expo Go** no requiere la compilación previa de un archivo APK nativo. Funciona mediante un servidor Metro bundler que emite el código JavaScript de la aplicación.
- **Generación del Código QR:** Al iniciar Expo en la terminal con comandos específicos, la herramienta genera un código QR visual en la consola de comandos.
- **Conexión por IP Local:** El teléfono inteligente (con la app *Expo Go* instalada y conectado a la **misma red Wi-Fi** que la PC) escanea dicho código QR. El cliente móvil descarga instantáneamente la interfaz y apunta sus solicitudes de API a la IP LAN configurada en el entorno (ej. `EXPO_PUBLIC_API_URL=http://192.168.1.5:8000/api/v1`).

## 4. Roles, Tenancy y Flujos de Autorización

El QR de desarrollo de Expo Go solo carga la aplicación. La invitación QR institucional es otro flujo y requiere una cuenta autenticada:

1. El administrador de organización selecciona una sede activa y genera una invitación.
2. La API devuelve el código una sola vez y persiste únicamente su SHA-256, junto con organización, sede, creador, expiración y estado de revocación/uso.
3. La aplicación muestra el código como QR. El estudiante escanea o ingresa el código después de iniciar sesión.
4. La API bloquea la invitación en una transacción, verifica vigencia, uso único, revocación y estados activos; después crea/reactiva la membresía de tipo `user` para la sede y marca la invitación como utilizada.
5. La invitación vence en siete días hábiles calculados en `America/Bogota`, de lunes a viernes. Los festivos no se excluyen hasta que se configure un calendario institucional.

Las consultas y escrituras de incidencias validan membresía activa, organización activa y sede activa en el servidor:

- `user`: solo sus propios reportes de su sede activa.
- `technician`: incidencias de su sede activa; actualiza solo las asignadas a su cuenta y sigue `pendiente` → `en_proceso` → `resuelto` (`en_proceso` se muestra como “En reparación”).
- `organization_admin`: consulta las incidencias de sus organizaciones activas y asigna/reasigna cada una a un técnico activo de la misma sede; no cambia el estado.
- `superadmin`: lectura global de incidencias; no puede crear, asignar ni cambiar su estado. Administra organizaciones desde el endpoint de organizaciones.

Las evidencias viajan por `multipart/form-data`; DRF/Pillow valida el archivo y Django lo guarda en `backend/media/evidences/`. Se sirven mediante `GET /api/v1/incidents/{id}/evidence/`, que reutiliza el queryset de permisos de incidencias; no se publican desde una ruta estática de `MEDIA_URL`. Los filtros de consulta no confían en un `organization_id` enviado por el cliente.

## 5. API de Roles y Estado de Implementación

- `POST /api/v1/auth/organization-invitations/`: administrador crea invitación de una sede de su organización.
- `GET /api/v1/auth/organization-invitations/`: lista metadatos de sus invitaciones; nunca devuelve códigos previamente generados.
- `POST /api/v1/auth/organization-invitations/{id}/revoke/`: revoca una invitación no utilizada.
- `POST /api/v1/auth/invitations/accept/`: estudiante autenticado vincula su cuenta.
- `GET /api/v1/locations/`: lista sedes activas visibles al administrador organizacional.
- `POST /api/v1/locations/` y `PATCH /api/v1/locations/{id}/`: el administrador crea y activa/desactiva sedes de su tenant.
- `GET|POST /api/v1/auth/organization-admins/`: el superadministrador administra las cuentas administrativas por organización.
- `GET|POST /api/v1/auth/technicians/`: el administrador crea cuentas técnicas con una sede asignada.
- `PUT /api/v1/auth/technicians/{id}/password/` y `PUT /api/v1/auth/users/{id}/password/`: el administrador restablece una contraseña con alcance limitado a sus sedes; `GET /api/v1/auth/users/` lista sus usuarios con membresía activa.
- `POST|PATCH /api/v1/categories/`: el administrador mantiene categorías de su organización.
- `/api/v1/categories/{id}/routes/`: configuración por sede del técnico que recibe automáticamente las incidencias de la categoría.
- `/api/v1/organizations/`: superadministrador crea, lista, activa y suspende organizaciones.
- `PATCH /api/v1/incidents/{id}/`: el administrador asigna un técnico activo de la misma sede mediante `assigned_to`; solo el técnico asignado cambia `status`.

Las migraciones que agregan `accounts_organizationinvitation` y `incidents_categorytechnician` se prueban con SQLite temporal, pero no se han aplicado a `nefijj_db`. La base MySQL existente no debe migrarse hasta revisar la compatibilidad con el esquema legado y aprobar la operación. Protocolos y alertas siguen en desarrollo.

## 6. Atención de incidencias implementada

- Notificaciones dentro de la app al técnico asignado y al reportante; push queda fuera de esta fase.
- Historial visible de creación, asignaciones/reasignaciones y cambios de estado con actor y fecha.
- Nota de resolución obligatoria y fotografía final opcional del técnico asignado.
- SLA de horas corridas desde la creación: crítica 4 h, alta 8 h, media 24 h y baja 72 h.

La migración `incidents.0003_incident_resolution_image_incident_resolution_note_and_more` se probó en SQLite y se aplicó a la base local `nefijj_db` después de adaptar las referencias a las claves `INT` existentes. Para otra base legado, primero se debe revisar y aprobar el plan de migración.