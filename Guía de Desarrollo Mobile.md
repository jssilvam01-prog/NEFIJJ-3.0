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
- No incluyas usuarios ni contraseñas en esta guía, en archivos de configuración versionados ni en capturas de pantalla.
- Ofrece una opción para cambiar la contraseña desde el perfil de una sesión autenticada. Solicita la contraseña actual y una confirmación de la nueva.
- En la pantalla de acceso, cualquier opción para recuperar la contraseña debe usar un flujo seguro de verificación de identidad. Define el mecanismo antes de implementarlo; no muestres ni envíes contraseñas existentes.

5. Flujos de usuario por rol

- `user`: inicia sesión y, si no tiene una membresía activa, se dirige a la pantalla de vinculación. Puede escanear con la cámara o escribir el código de invitación recibido del administrador. Después de aceptar, reporta incidencias y consulta solo las propias.
- `technician`: consulta incidencias de su sede y evidencia. Solo puede avanzar una incidencia asignada a él de `pendiente` a `en_proceso` y luego a `resuelto`.
- `organization_admin`: administra sedes activas, crea y desactiva técnicos con credenciales iniciales, mantiene categorías, asigna un técnico por categoría y sede, y genera/revoca invitaciones QR.
- `superadmin`: crea/activa/suspende organizaciones y consulta incidencias globales sin controles de edición operativa.
- `superadmin`: también crea administradores para organizaciones activas y puede activar/desactivar sus membresías.

Los reportes de una categoría se asignan automáticamente al técnico que el administrador haya configurado para la sede correspondiente. Los técnicos gestionan únicamente sus incidencias asignadas y deben seguir el flujo de estados permitido.

6. QR de Organización

El QR de organización es distinto del QR de Expo Go. El flujo es:

1. El administrador inicia sesión, selecciona una sede activa y genera la invitación.
2. La app muestra el código como QR y el código legible al administrador solo en la respuesta de creación.
3. El estudiante inicia sesión con una cuenta existente, escanea o ingresa el código y acepta la invitación.
4. La API valida el hash, la vigencia, que no haya sido revocado/usado y que la organización y sede sigan activas. Después vincula la cuenta a la sede.

Los códigos son de un solo uso, se guardan como hash y vencen en siete días hábiles de lunes a viernes, calculados en `America/Bogota`; los festivos no se excluyen hasta que se configure un calendario institucional. El QR no contiene contraseñas ni tokens JWT. La aplicación necesita `EXPO_PUBLIC_API_URL` apuntando a la IP LAN. La migración de invitaciones está generada, pero todavía no se aplica a la base MySQL existente; el flujo necesita esa migración para funcionar allí.

Las imágenes de incidencias se solicitan al endpoint autenticado de evidencia con el encabezado Bearer; no se debe reemplazar esa ruta por una URL pública de `MEDIA_URL`.