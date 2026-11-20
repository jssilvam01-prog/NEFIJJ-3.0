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

7. Migraciones para el esquema MySQL legado

Decisión: Probar migraciones en SQLite y aplicarlas a MySQL solo tras revisar compatibilidad con el esquema legado y aprobar el plan. Estado: `accounts.0002`, `incidents.0002` e `incidents.0003` están aplicadas a la base local `nefijj_db`; las claves foráneas nuevas usan `INT` para coincidir con las claves primarias existentes.

Por qué: `nefijj_db` contiene un esquema legado y una migración directa podría alterar datos/tablas existentes.

8. Evidencias protegidas por autorización de incidencia

Decisión: No servir fotografías desde una ruta pública de `MEDIA_URL`. La descarga usa un endpoint autenticado que reutiliza el queryset de incidencias permitidas para el rol y tenant.

Por qué: La URL de un archivo no debe permitir eludir el aislamiento entre estudiantes, sedes u organizaciones.

9. Gestión de administradores de organización por el Superadministrador

Decisión: Permitir que el superadministrador cambie la contraseña y elimine cuentas de administradores de organización (`organization_admin`). La eliminación limpia referencias protegidas transaccionalmente e impide eliminar cuentas de superadministradores o a sí mismo.

Por qué: Permite al operador global gestionar íntegramente a los administradores de tenant respetando la integridad referencial.

10. Sin fallback automático de MySQL a SQLite

Decisión: Django usa la base de datos indicada en `backend/.env`; para XAMPP, el puerto documentado es `3308`. No se cambia automáticamente a SQLite si MySQL no está disponible. SQLite queda reservado para las pruebas temporales mediante `DJANGO_USE_SQLITE=1`.

Por qué: Un fallback silencioso podría iniciar la aplicación con una base vacía y ocultar que los datos institucionales están en otra instancia o puerto. Ante un error de conexión, primero se debe iniciar la instancia MySQL/MariaDB correcta y verificar host, puerto y credenciales, sin migrar la base legado.

11. Asignación y atención de incidencias

Decisión: El administrador de organización puede asignar o reasignar una incidencia a un técnico activo de la misma sede. Las reglas existentes de categoría y sede pueden asignar un técnico inicialmente; el administrador puede cambiar esa asignación. Solo el técnico asignado actualiza el estado en el orden `pendiente` → `en_proceso` → `resuelto`; el panel muestra `en_proceso` como “En reparación”.

Por qué: Mantiene el enrutamiento configurado como ayuda inicial, pero permite que el administrador ajuste cada caso y reserva la atención/cierre al técnico responsable.

12. Restablecimiento administrativo de contraseñas

Decisión: El administrador puede establecer una contraseña provisional para técnicos y usuarios vinculados a sus sedes activas, sin consultar ni recibir la contraseña anterior. El sistema valida y almacena el hash; se recomienda que la persona la cambie desde su perfil. El acceso no requiere una migración de base de datos.

Por qué: Permite recuperar el acceso sin exponer credenciales existentes ni conceder a un administrador control sobre cuentas de otra organización.

13. Notificaciones dentro de la aplicación

Decisión: La primera versión tendrá notificaciones dentro de la app: el técnico recibe aviso al asignársele una incidencia y el reportante recibe avisos de cambio de estado. No se implementan push en esta fase.

Por qué: Entrega alertas en Expo Go sin depender de credenciales de un servicio push externo.

14. SLA por prioridad en horas corridas

Decisión: Los vencimientos iniciales son crítica 4 horas, alta 8 horas, media 24 horas y baja 72 horas desde la creación. El reloj corre continuamente, incluidos noches, fines de semana y festivos. La nota de resolución será obligatoria; la foto final será opcional.

Por qué: Define un criterio inicial sencillo y verificable para la presentación. Los tiempos pueden revisarse con la organización antes de producción.

15. Registro de usuarios con invitación QR

Decisión: Desde la pantalla de acceso, una persona nueva puede ingresar o escanear un código vigente para crear su cuenta y vincularla a la sede indicada. La invitación se consume en la misma transacción; las cuentas existentes conservan el flujo autenticado de vinculación. La nueva cuenta se inicia como usuario (`user`), nunca como técnico ni administrador.

Por qué: Permite que las organizaciones incorporen usuarios sin habilitar registros abiertos ni permitir elegir libremente un tenant.