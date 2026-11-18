Registro de Decisiones Técnicas

1. Uso de MySQL (nefijj_db) en puerto 3308 con XAMPP

Decisión: Configurar Django para conectarse a una base de datos MySQL local llamada nefijj_db ejecutándose en el puerto 3308.

Por qué: Permite mantener la persistencia local de los datos institucionales utilizando el entorno de XAMPP habitual del desarrollador.

2. Almacenamiento de imágenes de evidencia fuera de la base de datos

Decisión: Almacenar los archivos binarios de las fotos subidas por los estudiantes en el sistema de archivos del servidor (backend/media/evidences/) y guardar exclusivamente la ruta relativa del archivo en el campo evidence_image de la base de datos.

Por qué: Evita la sobrecarga de rendimiento y el crecimiento desmedido del tamaño de la base de datos MySQL, siguiendo las mejores prácticas de desarrollo web con Django.

3. Desarrollo móvil con Expo Go y códigos QR

Decisión: Utilizar Expo Go y el mecanismo de desarrollo LAN mediante variables de entorno e IP local (EXPO_PUBLIC_API_URL).

Por qué: Permite probar la aplicación móvil de manera fluida y en tiempo real en dispositivos físicos con cámara y galería reales sin necesidad de generar complejos archivos APK nativos en cada cambio de código.

4. Manejo de cuentas y contraseñas

Decisión: Usar cuentas individuales asignadas a roles, no documentar credenciales predeterminadas y permitir el cambio de contraseña desde el perfil. Cualquier recuperación desde la pantalla de acceso debe verificar la identidad del usuario mediante un mecanismo definido antes de implementarse.

Por qué: Evita exponer contraseñas en la documentación o el repositorio y permite que cada persona gestione sus propias credenciales de forma segura.

5. Invitaciones QR de un solo uso

Decisión: El QR contiene un código aleatorio de invitación, no datos de cuenta ni JWT. La API guarda SHA-256, permite revocación y consume el código una vez cuando una cuenta existente autenticada crea una membresía de estudiante. La vigencia es de siete días hábiles de lunes a viernes, calculados en `America/Bogota`; los festivos no se excluyen sin un calendario institucional.

Por qué: Permite vincular usuarios con organización/sede sin convertir el QR en un secreto de inicio de sesión reutilizable.

6. Alcance estricto del superadministrador

Decisión: El superadministrador administra el estado de las organizaciones y conserva lectura global de incidencias; no realiza cambios operativos sobre estas.

Por qué: Separa la administración de la plataforma de la operación diaria de cada inquilino.

7. Migración de invitaciones pendiente para MySQL

Decisión: Generar y probar la migración de `OrganizationInvitation` en SQLite temporal, sin aplicarla a la base MySQL existente hasta revisar compatibilidad y aprobarla.

Por qué: `nefijj_db` contiene un esquema legado y una migración directa podría alterar datos/tablas existentes.

8. Evidencias protegidas por autorización de incidencia

Decisión: No servir fotografías desde una ruta pública de `MEDIA_URL`. La descarga usa un endpoint autenticado que reutiliza el queryset de incidencias permitidas para el rol y tenant.

Por qué: La URL de un archivo no debe permitir eludir el aislamiento entre estudiantes, sedes u organizaciones.

9. Gestión de administradores de organización por el Superadministrador

Decisión: Permitir que el superadministrador cambie la contraseña y elimine cuentas de administradores de organización (`organization_admin`). La eliminación limpia referencias protegidas transaccionalmente e impide eliminar cuentas de superadministradores o a sí mismo.

Por qué: Permite al operador global gestionar íntegramente a los administradores de tenant respetando la integridad referencial.