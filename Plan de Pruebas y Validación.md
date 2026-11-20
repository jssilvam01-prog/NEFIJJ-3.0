Plan de Pruebas y Validación - NEFIJJ

1. Casos de Prueba Funcionales

CP01 - Reporte de Estudiante con Imagen en Expo Go:

Acción: El usuario con rol user inicia sesión en la app móvil abierta en Expo Go. Selecciona una categoría, prioridad, ingresa la descripción y adjunta una fotografía desde la galería/cámara. Envía el formulario.

Resultado Esperado: La API responde con 201 Created. El archivo de imagen se almacena físicamente en backend/media/evidences/ y el registro en la tabla incidents_incident de nefijj_db guarda la ruta relativa junto con el ID del estudiante reportante.

CP02 - Visualización del Técnico:

Acción: El usuario con rol technician de la misma sede inicia sesión en la app móvil.

Resultado Esperado: Visualiza el listado de incidencias de su sede, incluyendo el reporte creado por el estudiante y la previsualización de su imagen de evidencia.

CP03 - Aislamiento por Organización:

Acción: Un usuario intenta consultar o modificar un registro perteneciente a un tenant u organización diferente.

Resultado Esperado: El backend rechaza la operación devolviendo 403 Forbidden o 404 Not Found; tampoco permite descargar la evidencia del reporte por su URL.

CP04 - Invitación QR de Organización:

Acción: Un administrador de organización crea una invitación para una sede activa. Una persona nueva crea su cuenta con el QR/código desde el inicio; luego una cuenta existente prueba vincularse con otra invitación.

Resultado Esperado: El servidor almacena solo el hash, devuelve el código una vez, lo revoca o vence a los siete días hábiles y rechaza códigos usados, revocados o vencidos. El registro crea usuario y membresía en una transacción, y activa la sesión; la vinculación existente sigue funcionando.

CP05 - Límites de membresía y organización activa:

Acción: Desactivar una membresía, sede u organización e intentar consultar o reportar incidencias desde esa cuenta.

Resultado Esperado: La API no devuelve ni permite modificar datos fuera del tenant activo; una membresía o tenant inactivo no concede acceso.

CP06 - Flujo de técnico asignado:

Acción: Un técnico y un superadministrador inician sesión. El técnico consulta incidencias de su sede; el superadministrador consulta incidencias de distintas organizaciones.

Resultado Esperado: El técnico ve todas las incidencias de su sede con evidencia, pero solo cambia las asignadas a él, en el orden `pendiente` → `en_proceso` → `resuelto`. No puede saltar estados ni entrar a otra sede.

CP07 - Superadministrador de solo lectura operativa:

Acción: El superadministrador consulta incidencias globales, intenta crear/cambiar una y crea o suspende una organización.

Resultado Esperado: La consulta global y la gestión del ciclo de vida de organizaciones funcionan; las escrituras sobre incidencias se rechazan.

CP08 - Prueba física Expo Go:

Acción: Desde un teléfono con Expo Go, iniciar sesión, escanear un QR de invitación, reportar con foto y abrir la evidencia desde la sesión de técnico.

Resultado Esperado: La cámara, IP LAN, API, carga multipart y aislamiento por rol funcionan en el dispositivo. Esta prueba manual sigue pendiente.

CP09 - Disponibilidad de la base de datos en desarrollo:

Acción: Iniciar la instancia MySQL/MariaDB que contiene `nefijj_db`, confirmar que el puerto de `backend/.env` está escuchando con `Test-NetConnection 127.0.0.1 -Port <DB_PORT>` y ejecutar `manage.py shell -c "from django.db import connection; connection.ensure_connection()"`.

Resultado Esperado: La prueba TCP y la conexión de Django terminan correctamente antes de iniciar `runserver`. Si no hay conexión, corregir el estado de la instancia o los valores `DB_HOST`/`DB_PORT`/credenciales; no cambiar a SQLite automáticamente ni ejecutar migraciones para resolver un error de conexión.

CP10 - Asignación manual y flujo de atención:

Acción: El administrador asigna una incidencia a un técnico activo de su sede, intenta seleccionar un técnico de otra sede y prueba cambiar el estado. Luego el técnico asignado intenta avanzar el estado; también lo intenta un técnico diferente.

Resultado Esperado: La asignación de la misma sede funciona; el técnico de otra sede es rechazado. El administrador no puede cambiar el estado. Solo el técnico asignado puede avanzar `pendiente` → `en_proceso` → `resuelto`; los saltos y cambios por otros técnicos son rechazados.

CP11 - Restablecimiento de contraseña por el administrador:

Acción: El administrador establece y confirma una contraseña provisional para un técnico y un usuario de sus sedes; después intenta restablecer la contraseña de una cuenta de otra organización.

Resultado Esperado: Las cuentas propias reciben la nueva contraseña validada, sin que la API devuelva contraseñas ni permita consultar la anterior. La cuenta externa no se revela ni modifica. El usuario cambia la contraseña provisional desde Perfil.

CP12 - Notificaciones de incidencia:

Acción: Asignar una incidencia y cambiar su estado con el técnico asignado. Revisar la bandeja de notificaciones de los destinatarios acordados.

Resultado Esperado: La asignación notifica al técnico asignado y el cambio de estado notifica al reportante, sin duplicados ni exposición de datos a otra organización. Validar permisos de lectura y marcado como leído.

CP13 - Historial de atención:

Acción: Crear una incidencia, asignarla, reasignarla y avanzar su estado.

Resultado Esperado: La línea de tiempo conserva cada evento una sola vez, en orden cronológico, con autor, fecha y valores anterior/nuevo; usuarios de otro tenant no pueden consultarla.

CP14 - Cierre con nota y evidencia:

Acción: El técnico asignado intenta resolver una incidencia sin nota, con una nota válida y con una fotografía opcional; una cuenta no asignada intenta enviar el cierre.

Resultado Esperado: La nota es obligatoria, la imagen es opcional y solo el técnico asignado puede resolver. La nota y evidencia se muestran a usuarios autorizados.

CP15 - SLA por prioridad:

Acción: Crear incidencias de cada prioridad y simular avance del tiempo dentro y fuera del horario laboral.

Resultado Esperado: Los vencimientos se calculan a 4/8/24/72 horas corridas según prioridad; las incidencias muestran correctamente si están a tiempo o vencidas, incluidos fines de semana y festivos.