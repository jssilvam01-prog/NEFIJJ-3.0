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

Acción: Un administrador de organización crea una invitación para una sede activa. El usuario inicia sesión con una cuenta existente y escanea o ingresa el código.

Resultado Esperado: El servidor almacena solo el hash, devuelve el código una vez, lo revoca o vence a los siete días hábiles y rechaza códigos usados, revocados o vencidos. La aceptación crea la membresía a la sede dentro de una transacción.

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