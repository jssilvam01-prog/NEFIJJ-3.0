 Guía de Desarrollo Mobile - NEFIJJ

1. Instalación de Dependencias del Frontend

Desde la carpeta mobile/, instala las librerías necesarias:

npm install


Asegúrate de contar con los módulos Expo para almacenamiento seguro, imágenes y cámara, además del generador de QR:

npx expo install expo-secure-store expo-image-picker expo-camera react-native-svg react-native-screens react-native-safe-area-context axios
npm install react-native-qrcode-svg


2. Configuración de la IP de la API (.env.local)

Crea un archivo llamado .env.local dentro de la carpeta mobile/ especificando la dirección IP local de tu ordenador en la red Wi-Fi:

EXPO_PUBLIC_API_URL=http://192.168.1.X:8000/api/v1

(Puedes copiar `.env.example` como `.env.local` y reemplazar `192.168.1.X` por la IP Wi-Fi del ordenador).

(Importante: Reemplaza 192.168.1.X por tu IP real. No uses localhost, ya que el teléfono móvil interpretaría que se refiere a sí mismo).

3. Ejecución con Expo Go y Generación del Código QR

Para levantar la aplicación y generar el **QR de desarrollo de Expo Go** que leerá tu teléfono, ejecuta el siguiente comando en la carpeta mobile/:

$env:REACT_NATIVE_PACKAGER_HOSTNAME = "192.168.1.X"
npm run start:lan -- --clear


(Sustituye 192.168.1.X por tu IP LAN exacta para evitar que Metro utilice adaptadores virtuales de red).

Pasos en tu Teléfono Móvil:

Asegúrate de que tu teléfono esté conectado a la misma red Wi-Fi que tu ordenador.

Abre la aplicación Expo Go (disponible en Google Play Store o Apple App Store).

Utiliza la opción de Escanear código QR directamente desde la interfaz de Expo Go apuntando a la pantalla de tu terminal, o introduce manualmente la URL de conexión (ej. exp://192.168.1.X:8081) que aparece impresa en la consola.

La aplicación se compilará temporalmente en tu dispositivo y se conectará de inmediato a tu base de datos MySQL nefijj_db a través del backend de Django.

Inicia primero el backend con `runserver 0.0.0.0:8000`. Luego ejecuta Expo, escanea el QR que aparece en la terminal y mantén el teléfono y el ordenador conectados a la misma Wi-Fi.

Este QR solo abre la app de desarrollo; no selecciona una organización ni inicia sesión.

4. Acceso y Cambio de Contraseña

- Cada persona debe iniciar sesión con su propia cuenta y usar únicamente las funciones correspondientes a su rol (`user`, `technician`, `organization_admin` o `superadmin`).
- El inicio usa la paleta verde/dorada y el monograma NEFIJJ, presenta un mensaje de bienvenida y ofrece crear cuenta con invitación; el panel da la bienvenida por nombre y rol.
- No incluyas usuarios ni contraseñas en esta guía, en archivos de configuración versionados ni en capturas de pantalla.
- Ofrece una opción para cambiar la contraseña desde el perfil de una sesión autenticada. Solicita la contraseña actual y una confirmación de la nueva.
- En la pantalla de acceso, cualquier opción para recuperar la contraseña debe usar un flujo seguro de verificación de identidad. Define el mecanismo antes de implementarlo; no muestres ni envíes contraseñas existentes.

5. Flujos de usuario por rol

- `user`: puede crear una cuenta desde el acceso con el código o QR de una invitación. La cuenta se crea como usuario y queda vinculada automáticamente a la sede; también puede iniciar sesión con una cuenta existente y vincularla desde su pantalla de organización.
- `technician`: consulta incidencias de su sede y evidencia. Solo puede avanzar una incidencia asignada a él de `pendiente` a `en_proceso` y luego a `resuelto`.
- `organization_admin`: administra sedes activas, crea/desactiva técnicos, asigna o cambia el técnico de cada incidencia, administra cuentas de usuarios y restablece contraseñas de usuarios/técnicos de sus sedes. También mantiene categorías y genera/revoca invitaciones QR.
- `superadmin`: crea/activa/suspende organizaciones y consulta incidencias globales sin controles de edición operativa.
- `superadmin`: también crea administradores para organizaciones activas y puede activar/desactivar sus membresías.

Los reportes pueden quedar preasignados por la regla de categoría y sede; el administrador puede cambiar el técnico desde la tarjeta de la incidencia. La asignación solo admite técnicos activos de esa misma sede. El administrador no cambia el estado: el técnico asignado avanza `pendiente` → `en_proceso` (mostrado como “En reparación”) → `resuelto`.

Desde las pantallas **Técnicos** y **Usuarios**, el administrador puede definir y confirmar una contraseña provisional para una cuenta de sus sedes. Debe comunicarla de forma segura; la persona puede cambiarla desde **Perfil**. Este flujo no revela la contraseña anterior ni obliga automáticamente al cambio en el siguiente inicio de sesión.

6. QR de Organización

El QR de organización es distinto del QR de Expo Go. El flujo es:

1. El administrador inicia sesión, selecciona una sede activa y genera la invitación.
2. La app muestra el código como QR y en texto al administrador. Mientras siga activo, el administrador puede volver a mostrar el QR/código o compartir el código mediante el menú nativo del dispositivo.
3. Una persona nueva selecciona **Crear cuenta con QR o código** desde el inicio, ingresa sus datos y escanea/escribe la invitación. Una cuenta existente puede seguir aceptándola desde **Vincular organización**.
4. La API valida el hash, la vigencia, que no haya sido revocado/usado y que la organización y sede sigan activas. Para una cuenta nueva crea usuario y membresía en una transacción, consume la invitación e inicia la sesión.

Los códigos son de un solo uso, se guardan como hash y cifrados para poder mostrarlos de nuevo; vencen en siete días hábiles de lunes a viernes, calculados en `America/Bogota`. El menú de compartir envía el código legible, no una imagen QR. Las invitaciones creadas antes de habilitar el cifrado no se pueden recuperar y deben reemplazarse. El QR no contiene contraseñas ni tokens JWT. La aplicación necesita `EXPO_PUBLIC_API_URL` apuntando a la IP LAN. Las migraciones de invitaciones e incidencias ya están aplicadas a la base local `nefijj_db`.

Las imágenes de incidencias se solicitan al endpoint autenticado de evidencia con el encabezado Bearer; no se debe reemplazar esa ruta por una URL pública de `MEDIA_URL`.

7. Atención de incidencias implementada

- Bandeja de notificaciones dentro de la app para asignaciones de técnicos y cambios de estado visibles al reportante; push queda fuera de esta fase.
- Historial por incidencia de creación, asignaciones/reasignaciones y cambios de estado, con actor y fecha.
- Al resolver, el técnico asignado debe escribir una nota; puede agregar una foto final opcional.
- Las tarjetas muestran vencimiento y estado del SLA: crítica 4 h, alta 8 h, media 24 h y baja 72 h corridas desde la creación.
- La foto inicial y la de resolución se cargan desde rutas protegidas con el token de sesión.

La migración `incidents.0003_incident_resolution_image_incident_resolution_note_and_more` ya está aplicada a la base local `nefijj_db`. Para probar el flujo con Expo Go, el teléfono debe alcanzar la API configurada en `EXPO_PUBLIC_API_URL`.