[x] Fase 1: Documentación del PRD, arquitectura, roles y decisiones técnicas.

[x] Fase 2: Creación del backend Django y configuración para el esquema MySQL existente sin migrar ni alterar la base.

[x] Fase 3: Inicialización de Expo Go, configuración LAN por QR y selección de evidencia.

[x] Fase 4: Implementación de autenticación JWT, perfiles, cambio de contraseña, categorías, reportes, imágenes y aislamiento por organización/sede.

[x] Fase 5: Pruebas de backend en SQLite temporal y validación del bundle Android.

[x] Fase 6: Reglas iniciales de aislamiento por membresía/organización activa, transición estricta de estados y supervisión global de solo lectura para superadmin.

[x] Fase 7: Implementar API de invitaciones QR (hash, un solo uso, revocación, expiración) y pantallas móviles de escaneo/vinculación y generación.

[x] Fase 8: Crear y suspender organizaciones con API y panel móvil de superadmin; gestionar administradores de organización (activar/desactivar, restablecer contraseña y eliminación segura con limpieza referencial).

[x] Fase 9: Permitir al administrador de organización restablecer contraseñas provisionales de técnicos y usuarios de sus sedes; la persona puede cambiarla desde Perfil.

[x] Fase 10: Asignar o reasignar técnicos activos de la misma sede a incidencias desde el panel de administración; reservar los cambios de estado al técnico asignado.

[x] Despliegue local: Revisar y aplicar a `nefijj_db` las migraciones `accounts.0002_organization_invitation`, `incidents.0002_categorytechnician_and_more` e `incidents.0003_incident_resolution_image_incident_resolution_note_and_more`; las referencias nuevas usan `INT` para coincidir con las claves del esquema legado.

[ ] Fase 11: Probar el QR, cámara, permisos de roles, evidencias, asignación de incidencias, restablecimiento de contraseñas y conexión LAN en un teléfono físico con Expo Go.

[ ] Pendiente: Completar protocolos y alertas operativas.

[ ] Pendiente: Definir e implementar un mecanismo verificado de recuperación de contraseña.

[ ] Pendiente: Revisar y aprobar por separado el plan de migración de Django Admin para `nefijj_db`.

[x] Fase 12: Implementar notificaciones dentro de la app para técnico asignado/reportante, historial de atención, nota obligatoria/foto final opcional y SLA de 4/8/24/72 horas corridas. Migración probada en SQLite y aplicada a `nefijj_db` tras revisar el esquema legado.