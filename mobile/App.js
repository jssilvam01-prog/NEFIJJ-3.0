import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import QRCode from 'react-native-qrcode-svg';

import {
  acceptOrganizationInvitation,
  changePassword,
  getProfile,
  login,
  logout,
  registerWithInvitation,
} from './src/services/auth';
import {
  assignIncidentTechnician,
  createIncident,
  createCategory,
  getCategories,
  getCategoryRoutes,
  getIncidentNotifications,
  getIncidents,
  markIncidentNotificationRead,
  removeCategoryRoute,
  saveCategoryRoute,
  updateCategory,
  updateIncidentStatus,
} from './src/services/incidents';
import {
  createOrganizationAdmin,
  createOrganization,
  createOrganizationInvitation,
  createOrganizationLocation,
  createTechnician,
  deleteOrganizationAdmin,
  getManagedOrganizations,
  getOrganizationAdmins,
  getOrganizationInvitations,
  getOrganizationInvitationCode,
  getOrganizationLocations,
  getOrganizationUsers,
  getOrganizations,
  getTechnicians,
  resetOrganizationAdminPassword,
  resetOrganizationUserPassword,
  resetTechnicianPassword,
  revokeOrganizationInvitation,
  setOrganizationAdminStatus,
  setOrganizationStatus,
  setOrganizationLocationStatus,
  setTechnicianStatus,
} from './src/services/organizations';
import { getCachedAccessToken, getCurrentAccessToken, storeAccessToken } from './src/services/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const PRIORITIES = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
];
const ROLE_LABELS = {
  user: 'Estudiante / usuario',
  technician: 'Técnico',
  organization_admin: 'Administrador de organización',
  superadmin: 'Superadministrador',
};
const STATUS_LABELS = {
  pendiente: 'Pendiente',
  en_proceso: 'En reparación',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};
const PRIORITY_LABELS = Object.fromEntries(PRIORITIES.map(({ value, label }) => [value, label]));
const NEXT_STATUS = {
  pendiente: 'en_proceso',
  en_proceso: 'resuelto',
};
const SLA_LABELS = {
  on_track: 'SLA en tiempo',
  overdue: 'SLA vencido',
  resolved_on_time: 'Resuelto dentro del SLA',
  resolved_late: 'Resuelto fuera del SLA',
};
const WELCOME_MESSAGES = {
  user: 'Reporta una incidencia y consulta cómo avanza su atención.',
  technician: 'Revisa tus asignaciones y mantén informada a tu organización.',
  organization_admin: 'Coordina sedes, técnicos y el seguimiento de incidencias.',
  superadmin: 'Supervisa las organizaciones y el estado general de la plataforma.',
};

function getIncidentEventDescription(event) {
  if (event.event_type === 'created') return 'Incidencia reportada';
  if (event.event_type === 'assigned') {
    const previousTechnician = event.old_value && event.old_value.technician;
    const technician = event.new_value && event.new_value.technician;
    if (technician && previousTechnician) {
      return `Reasignada de ${previousTechnician} a ${technician}`;
    }
    return technician ? `Asignada a ${technician}` : 'Se retiró la asignación';
  }
  if (event.event_type === 'status_changed') {
    const status = event.new_value && event.new_value.status;
    return `Estado: ${STATUS_LABELS[status] || status}`;
  }
  return 'Actualización de incidencia';
}

function getErrorMessage(error) {
  const data = error.response && error.response.data;
  if (data && data.detail) return data.detail;
  if (data && typeof data === 'object') {
    const firstValue = Object.values(data).flat(Infinity)[0];
    if (typeof firstValue === 'string') return firstValue;
  }
  return error.message || 'Ocurrió un error inesperado.';
}

function PrimaryButton({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function EvidenceThumbnail({ uri }) {
  const [token, setToken] = useState(getCachedAccessToken());

  useEffect(() => {
    if (!token) {
      getCurrentAccessToken().then((cached) => {
        if (cached) setToken(cached);
      });
    }
  }, [token]);

  const imageUri = token && !uri.includes('token=')
    ? `${uri}${uri.includes('?') ? '&' : '?'}token=${token}`
    : uri;

  return (
    <Image
      source={{
        uri: imageUri,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }}
      style={styles.evidenceImage}
    />
  );
}

function AppContent() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [resolutionNotes, setResolutionNotes] = useState({});
  const [resolutionImages, setResolutionImages] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessageText] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registrationUsername, setRegistrationUsername] = useState('');
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [registrationFirstName, setRegistrationFirstName] = useState('');
  const [registrationLastName, setRegistrationLastName] = useState('');
  const [registrationPassword, setRegistrationPassword] = useState('');
  const [registrationPasswordConfirm, setRegistrationPasswordConfirm] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('media');
  const [image, setImage] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [invitations, setInvitations] = useState([]);
  const [newInvitation, setNewInvitation] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationAdmins, setOrganizationAdmins] = useState([]);
  const [managedOrganizations, setManagedOrganizations] = useState([]);
  const [locationName, setLocationName] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [selectedLocationOrganizationId, setSelectedLocationOrganizationId] = useState('');
  const [selectedAdminOrganizationId, setSelectedAdminOrganizationId] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffFirstName, setStaffFirstName] = useState('');
  const [staffLastName, setStaffLastName] = useState('');
  const [editingAdminPasswordId, setEditingAdminPasswordId] = useState(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminNewPasswordConfirm, setAdminNewPasswordConfirm] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [incidentTechnicianSelections, setIncidentTechnicianSelections] = useState({});
  const [organizationUsers, setOrganizationUsers] = useState([]);
  const [editingTechnicianPasswordId, setEditingTechnicianPasswordId] = useState(null);
  const [technicianNewPassword, setTechnicianNewPassword] = useState('');
  const [technicianNewPasswordConfirm, setTechnicianNewPasswordConfirm] = useState('');
  const [editingUserPasswordId, setEditingUserPasswordId] = useState(null);
  const [userNewPassword, setUserNewPassword] = useState('');
  const [userNewPasswordConfirm, setUserNewPasswordConfirm] = useState('');
  const [selectedCategoryOrganizationId, setSelectedCategoryOrganizationId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [selectedRouteCategoryId, setSelectedRouteCategoryId] = useState('');
  const [selectedRouteLocationId, setSelectedRouteLocationId] = useState('');
  const [selectedRouteTechnicianId, setSelectedRouteTechnicianId] = useState('');
  const [categoryRoutes, setCategoryRoutes] = useState([]);

  const configured = Boolean(API_URL && !API_URL.includes('192.168.1.X'));

  useEffect(() => {
    if (!configured) return;
    restoreSession();
  }, [configured]);

  async function restoreSession() {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        SecureStore.getItemAsync('access_token'),
        SecureStore.getItemAsync('refresh_token'),
      ]);
      if (!accessToken && !refreshToken) return;
      if (accessToken) {
        await storeAccessToken(accessToken);
      }
      const profile = await getProfile();
      setUser(profile);
      const needsOrganization = profile.role === 'user' && !profile.tenant_active;
      setScreen(needsOrganization ? 'link-organization' : 'incidents');
      if (!needsOrganization) await loadDashboard(profile);
    } catch (error) {
      setErrorMessageText(`No se pudo restaurar la sesión: ${getErrorMessage(error)}`);
    }
  }

  async function loadDashboard(currentUser = user) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const requests = [getIncidents(), getCategories(), getIncidentNotifications()];
      if (currentUser && currentUser.role === 'organization_admin') {
        requests.push(getTechnicians());
      }
      const [incidentRows, categoryRows, notificationRows, technicianRows] = await Promise.all(requests);
      setIncidents(incidentRows);
      setCategories(categoryRows);
      setNotifications(notificationRows);
      if (technicianRows) setTechnicians(technicianRows);
      setIncidentTechnicianSelections({});
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar los datos: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim() || !password) {
      setErrorMessageText('Escribe tu usuario y contraseña.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const profile = await login(username.trim(), password);
      setUser(profile);
      setPassword('');
      const needsOrganization = profile.role === 'user' && !profile.tenant_active;
      setScreen(needsOrganization ? 'link-organization' : 'incidents');
      if (!needsOrganization) await loadDashboard(profile);
    } catch (error) {
      setErrorMessageText(`No se pudo iniciar sesión: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration() {
    if (
      !inviteCode.trim() ||
      !registrationUsername.trim() ||
      !registrationEmail.trim() ||
      !registrationPassword
    ) {
      setErrorMessageText('Completa el código, usuario, correo y contraseña.');
      return;
    }
    if (registrationPassword !== registrationPasswordConfirm) {
      setErrorMessageText('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const profile = await registerWithInvitation({
        code: inviteCode.trim(),
        username: registrationUsername.trim(),
        email: registrationEmail.trim(),
        first_name: registrationFirstName.trim(),
        last_name: registrationLastName.trim(),
        password: registrationPassword,
        password_confirm: registrationPasswordConfirm,
      });
      setUser(profile);
      setUsername(profile.username);
      setInviteCode('');
      setRegistrationPassword('');
      setRegistrationPasswordConfirm('');
      setScanning(false);
      setScreen('incidents');
      await loadDashboard(profile);
      Alert.alert('Cuenta creada', 'Tu cuenta quedó vinculada a la organización y sede.');
    } catch (error) {
      setErrorMessageText(`No se pudo crear la cuenta: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      setUser(null);
      setIncidents([]);
      setCategories([]);
      setNewInvitation(null);
      setInviteCode('');
      setScanning(false);
      setScreen('login');
      setErrorMessageText('');
    } catch (error) {
      setErrorMessageText(`No se pudo cerrar la sesión: ${getErrorMessage(error)}`);
    }
  }

  async function pickImage(source) {
    setErrorMessageText('');
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessageText('Debes conceder permiso para acceder a la cámara o galería.');
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage(result.assets[0]);
      }
    } catch (error) {
      setErrorMessageText(`No se pudo seleccionar la imagen: ${getErrorMessage(error)}`);
    }
  }

  async function pickResolutionImage(incidentId) {
    setErrorMessageText('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessageText('Debes conceder permiso para acceder a la galería.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.75,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setResolutionImages((current) => ({
          ...current,
          [incidentId]: result.assets[0],
        }));
      }
    } catch (error) {
      setErrorMessageText(`No se pudo seleccionar la foto de resolución: ${getErrorMessage(error)}`);
    }
  }

  async function submitIncident() {
    if (!title.trim() || !description.trim() || !categoryId) {
      setErrorMessageText('Completa título, descripción y categoría.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await createIncident({
        title: title.trim(),
        description: description.trim(),
        categoryId,
        priority,
        image,
      });
      setTitle('');
      setDescription('');
      setCategoryId('');
      setPriority('media');
      setImage(null);
      await loadDashboard();
      setScreen('incidents');
      Alert.alert('Reporte enviado', 'La incidencia se registró correctamente.');
    } catch (error) {
      setErrorMessageText(`No se pudo enviar el reporte: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(incidentId, status, resolutionNote, resolutionImage) {
    setLoading(true);
    setErrorMessageText('');
    try {
      await updateIncidentStatus(incidentId, status, resolutionNote, resolutionImage);
      setResolutionNotes((current) => {
        const next = { ...current };
        delete next[incidentId];
        return next;
      });
      setResolutionImages((current) => {
        const next = { ...current };
        delete next[incidentId];
        return next;
      });
      await loadDashboard();
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar la incidencia: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openNotifications() {
    setLoading(true);
    setErrorMessageText('');
    try {
      setNotifications(await getIncidentNotifications());
      setScreen('notifications');
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar las notificaciones: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openNotifiedIncident(notification) {
    try {
      if (!notification.is_read) {
        const updatedNotification = await markIncidentNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? updatedNotification : item
        )));
      }
      setScreen('incidents');
      await loadDashboard();
    } catch (error) {
      setErrorMessageText(`No se pudo abrir la notificación: ${getErrorMessage(error)}`);
    }
  }

  async function assignTechnicianToIncident(incident) {
    const selectedTechnicianId = incidentTechnicianSelections[incident.id]
      ?? (incident.assigned_to_id ? String(incident.assigned_to_id) : '');
    const technicianIsAvailable = technicians.some(
      (technician) => (
        String(technician.id) === selectedTechnicianId &&
        String(technician.location_id) === String(incident.location_id) &&
        technician.is_active
      ),
    );
    if (!technicianIsAvailable) {
      setErrorMessageText('Selecciona un técnico activo de la misma sede.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await assignIncidentTechnician(incident.id, Number(selectedTechnicianId));
      await loadDashboard();
    } catch (error) {
      setErrorMessageText(`No se pudo asignar el técnico: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openInvitationManagement() {
    setScreen('invitations');
    setLoading(true);
    setErrorMessageText('');
    try {
      const [locationsRes, invitationsRes] = await Promise.allSettled([
        getOrganizationLocations(),
        getOrganizationInvitations(),
      ]);

      if (locationsRes.status === 'fulfilled') {
        setLocations(locationsRes.value);
        if (locationsRes.value.length && !locationsRes.value.some((row) => String(row.id) === selectedLocationId)) {
          setSelectedLocationId(String(locationsRes.value[0].id));
        }
      } else {
        setErrorMessageText(`Error cargando sedes: ${getErrorMessage(locationsRes.reason)}`);
      }

      if (invitationsRes.status === 'fulfilled') {
        setInvitations(invitationsRes.value);
      } else {
        setErrorMessageText(`Error cargando invitaciones: ${getErrorMessage(invitationsRes.reason)}`);
      }
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar los accesos: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function createInvitation() {
    if (!selectedLocationId) {
      setErrorMessageText('Selecciona una sede activa.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const invitation = await createOrganizationInvitation(selectedLocationId);
      setNewInvitation(invitation);
      setInvitations((current) => [invitation, ...current]);
    } catch (error) {
      setErrorMessageText(`No se pudo crear el QR: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function revokeInvitation(invitationId) {
    setLoading(true);
    setErrorMessageText('');
    try {
      await revokeOrganizationInvitation(invitationId);
      setInvitations((current) => current.map((item) => (
        item.id === invitationId ? { ...item, revoked_at: new Date().toISOString() } : item
      )));
      if (newInvitation && newInvitation.id === invitationId) setNewInvitation(null);
    } catch (error) {
      setErrorMessageText(`No se pudo revocar la invitación: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function showInvitation(invitation) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const { code } = invitation.code
        ? invitation
        : await getOrganizationInvitationCode(invitation.id);
      setNewInvitation({ ...invitation, code });
    } catch (error) {
      setErrorMessageText(`No se pudo volver a mostrar la invitación: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function shareInvitation(invitation) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const { code } = invitation.code
        ? invitation
        : await getOrganizationInvitationCode(invitation.id);
      await Share.share({
        title: 'Invitación a NEFIJJ',
        message: [
          `Invitación a NEFIJJ · ${invitation.location_name || 'Organización'}`,
          `Código: ${code}`,
          `Vence: ${new Date(invitation.expires_at).toLocaleString()}`,
        ].join('\n'),
      });
    } catch (error) {
      setErrorMessageText(`No se pudo compartir la invitación: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openOrganizationManagement() {
    setScreen('organizations');
    setLoading(true);
    setErrorMessageText('');
    try {
      const [organizationRows, adminRows] = await Promise.all([
        getOrganizations(),
        getOrganizationAdmins(),
      ]);
      setOrganizations(organizationRows);
      setOrganizationAdmins(adminRows);
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar las organizaciones: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitOrganization() {
    if (!organizationName.trim()) {
      setErrorMessageText('Escribe el nombre de la organización.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const organization = await createOrganization(organizationName.trim());
      setOrganizations((current) => [...current, organization]);
      setOrganizationName('');
    } catch (error) {
      setErrorMessageText(`No se pudo crear la organización: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleOrganizationStatus(organization) {
    const status = organization.status === 'active' ? 'suspended' : 'active';
    setLoading(true);
    setErrorMessageText('');
    try {
      const updated = await setOrganizationStatus(organization.id, status);
      setOrganizations((current) => current.map((item) => (
        item.id === updated.id ? updated : item
      )));
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar la organización: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitOrganizationAdmin(organizationId) {
    if (!staffUsername.trim() || !staffEmail.trim() || !staffPassword) {
      setErrorMessageText('Completa usuario, correo y contraseña inicial.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const account = await createOrganizationAdmin({
        username: staffUsername.trim(),
        email: staffEmail.trim(),
        password: staffPassword,
        organization_id: organizationId,
      });
      setOrganizationAdmins((current) => [
        ...current,
        { ...account, organization_ids: [organizationId] },
      ]);
      clearStaffForm();
    } catch (error) {
      setErrorMessageText(`No se pudo crear el administrador: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleOrganizationAdminStatus(admin, organizationId, isActive) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const updated = await setOrganizationAdminStatus(admin.id, organizationId, isActive);
      setOrganizationAdmins((current) => current.map((item) => (
        item.id === updated.id ? updated : item
      )));
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar al administrador: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetAdminPassword(adminId) {
    if (!adminNewPassword) {
      setErrorMessageText('Ingresa la nueva contraseña.');
      return;
    }
    if (adminNewPassword !== adminNewPasswordConfirm) {
      setErrorMessageText('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await resetOrganizationAdminPassword(adminId, adminNewPassword, adminNewPasswordConfirm);
      Alert.alert('Éxito', 'La contraseña del administrador se ha actualizado correctamente.');
      setEditingAdminPasswordId(null);
      setAdminNewPassword('');
      setAdminNewPasswordConfirm('');
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar la contraseña: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOrganizationAdmin(admin) {
    const confirmDelete = async () => {
      setLoading(true);
      setErrorMessageText('');
      try {
        await deleteOrganizationAdmin(admin.id);
        setOrganizationAdmins((current) => current.filter((item) => item.id !== admin.id));
        Alert.alert('Éxito', `El administrador ${admin.username} ha sido eliminado.`);
      } catch (error) {
        setErrorMessageText(`No se pudo eliminar al administrador: ${getErrorMessage(error)}`);
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`¿Estás seguro de eliminar al administrador ${admin.username}?`)) {
        await confirmDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Administrador',
        `¿Estás seguro de eliminar a ${admin.username}? Esta acción no se puede deshacer.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  }

  function clearStaffForm() {
    setStaffUsername('');
    setStaffEmail('');
    setStaffPassword('');
    setStaffFirstName('');
    setStaffLastName('');
  }

  async function openTechnicianManagement() {
    setScreen('technicians');
    setLoading(true);
    setErrorMessageText('');
    try {
      const [locationRows, technicianRows] = await Promise.all([
        getOrganizationLocations(),
        getTechnicians(),
      ]);
      setLocations(locationRows);
      setTechnicians(technicianRows);
      if (locationRows.length && !locationRows.some(
        (row) => String(row.id) === selectedLocationId,
      )) {
        setSelectedLocationId(String(locationRows[0].id));
      }
    } catch (error) {
      setErrorMessageText(`No se pudo cargar el personal: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openUserManagement() {
    setScreen('users');
    setLoading(true);
    setErrorMessageText('');
    try {
      setOrganizationUsers(await getOrganizationUsers());
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar los usuarios: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openLocationManagement() {
    setScreen('locations');
    setLoading(true);
    setErrorMessageText('');
    try {
      const [organizationRows, locationRows] = await Promise.all([
        getManagedOrganizations(),
        getOrganizationLocations(true),
      ]);
      setManagedOrganizations(organizationRows);
      setLocations(locationRows);
      if (organizationRows.length && !organizationRows.some(
        (organization) => String(organization.id) === selectedLocationOrganizationId,
      )) {
        setSelectedLocationOrganizationId(String(organizationRows[0].id));
      }
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar las sedes: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitLocation() {
    if (!locationName.trim() || !locationCode.trim() || !selectedLocationOrganizationId) {
      setErrorMessageText('Completa el nombre, código y organización de la sede.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const location = await createOrganizationLocation({
        name: locationName.trim(),
        code: locationCode.trim(),
        organization_id: selectedLocationOrganizationId,
      });
      setLocations((current) => [...current, location]);
      setLocationName('');
      setLocationCode('');
    } catch (error) {
      setErrorMessageText(`No se pudo crear la sede: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleLocationStatus(location) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const updated = await setOrganizationLocationStatus(location.id, !location.is_active);
      setLocations((current) => current.map((item) => (
        item.id === updated.id ? updated : item
      )));
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar la sede: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitTechnician() {
    if (!staffUsername.trim() || !staffEmail.trim() || !staffPassword || !selectedLocationId) {
      setErrorMessageText('Completa usuario, correo, contraseña y sede.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const technician = await createTechnician({
        username: staffUsername.trim(),
        email: staffEmail.trim(),
        password: staffPassword,
        first_name: staffFirstName.trim(),
        last_name: staffLastName.trim(),
        location_id: selectedLocationId,
      });
      setTechnicians((current) => [...current, technician]);
      clearStaffForm();
    } catch (error) {
      setErrorMessageText(`No se pudo crear el técnico: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTechnicianStatus(technician) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const updated = await setTechnicianStatus(technician.id, !technician.is_active);
      setTechnicians((current) => current.map((item) => (
        item.id === updated.id ? updated : item
      )));
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar al técnico: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleTechnicianPasswordReset(technicianId) {
    if (!technicianNewPassword || !technicianNewPasswordConfirm) {
      setErrorMessageText('Escribe y confirma la contraseña temporal.');
      return;
    }
    if (technicianNewPassword !== technicianNewPasswordConfirm) {
      setErrorMessageText('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await resetTechnicianPassword(
        technicianId,
        technicianNewPassword,
        technicianNewPasswordConfirm,
      );
      Alert.alert('Contraseña restablecida', 'Entrega la contraseña temporal al técnico de forma segura.');
      setEditingTechnicianPasswordId(null);
      setTechnicianNewPassword('');
      setTechnicianNewPasswordConfirm('');
    } catch (error) {
      setErrorMessageText(`No se pudo cambiar la contraseña: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUserPasswordReset(userId) {
    if (!userNewPassword || !userNewPasswordConfirm) {
      setErrorMessageText('Escribe y confirma la contraseña temporal.');
      return;
    }
    if (userNewPassword !== userNewPasswordConfirm) {
      setErrorMessageText('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await resetOrganizationUserPassword(
        userId,
        userNewPassword,
        userNewPasswordConfirm,
      );
      Alert.alert('Contraseña restablecida', 'Entrega la contraseña temporal al usuario de forma segura.');
      setEditingUserPasswordId(null);
      setUserNewPassword('');
      setUserNewPasswordConfirm('');
    } catch (error) {
      setErrorMessageText(`No se pudo cambiar la contraseña: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openCategoryManagement() {
    setScreen('categories');
    setLoading(true);
    setErrorMessageText('');
    try {
      const [locationRows, categoryRows, technicianRows, organizationRows] = await Promise.all([
        getOrganizationLocations(),
        getCategories(),
        getTechnicians(),
        getManagedOrganizations(),
      ]);
      setLocations(locationRows);
      setCategories(categoryRows);
      setTechnicians(technicianRows);
      setManagedOrganizations(organizationRows);
      const currentOrganization = organizationRows.find(
        (organization) => String(organization.id) === selectedCategoryOrganizationId,
      );
      if (!currentOrganization && organizationRows.length) {
        setSelectedCategoryOrganizationId(String(organizationRows[0].id));
      }
    } catch (error) {
      setErrorMessageText(`No se pudieron cargar las categorías: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function selectRouteCategory(categoryId) {
    setSelectedRouteCategoryId(String(categoryId));
    setSelectedRouteLocationId('');
    setSelectedRouteTechnicianId('');
    setCategoryRoutes([]);
    if (!categoryId) return;
    try {
      setCategoryRoutes(await getCategoryRoutes(categoryId));
    } catch (error) {
      setErrorMessageText(`No se pudo cargar el enrutamiento: ${getErrorMessage(error)}`);
    }
  }

  async function saveCategory() {
    if (!categoryName.trim() || !selectedCategoryOrganizationId) {
      setErrorMessageText('Escribe el nombre y selecciona la organización.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      const values = {
        name: categoryName.trim(),
        description: categoryDescription.trim(),
      };
      const saved = editingCategoryId
        ? await updateCategory(editingCategoryId, values)
        : await createCategory({
          ...values,
          organization_id: selectedCategoryOrganizationId,
        });
      setCategories((current) => (
        editingCategoryId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved]
      ));
      setEditingCategoryId(null);
      setCategoryName('');
      setCategoryDescription('');
      await selectRouteCategory(saved.id);
    } catch (error) {
      setErrorMessageText(`No se pudo guardar la categoría: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function editCategory(category) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryDescription(category.description || '');
    setSelectedCategoryOrganizationId(String(category.organization_id));
    selectRouteCategory(category.id);
  }

  async function toggleCategoryActive(category) {
    setLoading(true);
    setErrorMessageText('');
    try {
      const updated = await updateCategory(category.id, {
        is_active: !category.is_active,
      });
      setCategories((current) => current.map((item) => (
        item.id === updated.id ? updated : item
      )));
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar la categoría: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitCategoryRoute() {
    if (!selectedRouteCategoryId || !selectedRouteLocationId || !selectedRouteTechnicianId) {
      setErrorMessageText('Selecciona categoría, sede y técnico para enrutar los reportes.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await saveCategoryRoute(
        selectedRouteCategoryId,
        selectedRouteLocationId,
        selectedRouteTechnicianId,
      );
      setCategoryRoutes(await getCategoryRoutes(selectedRouteCategoryId));
    } catch (error) {
      setErrorMessageText(`No se pudo guardar el enrutamiento: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCategoryRoute(locationId) {
    setLoading(true);
    setErrorMessageText('');
    try {
      await removeCategoryRoute(selectedRouteCategoryId, locationId);
      setCategoryRoutes((current) => current.filter(
        (route) => String(route.location_id) !== String(locationId),
      ));
    } catch (error) {
      setErrorMessageText(`No se pudo quitar el enrutamiento: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openInvitationScanner() {
    setErrorMessageText('');
    try {
      if (!cameraPermission || !cameraPermission.granted) {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          setErrorMessageText('Debes conceder permiso para usar la cámara.');
          return;
        }
      }
      setScanning(true);
    } catch (error) {
      setErrorMessageText(`No se pudo abrir la cámara: ${getErrorMessage(error)}`);
    }
  }

  function onInvitationScanned({ data }) {
    if (!data) return;
    setInviteCode(data.trim());
    setScanning(false);
  }

  async function submitInvitationCode() {
    if (!inviteCode.trim()) {
      setErrorMessageText('Escanea o escribe el código de invitación.');
      return;
    }
    setLoading(true);
    setErrorMessageText('');
    try {
      await acceptOrganizationInvitation(inviteCode.trim());
      const profile = await getProfile();
      setUser(profile);
      setInviteCode('');
      setScreen('incidents');
      await loadDashboard(profile);
    } catch (error) {
      setErrorMessageText(`No se pudo vincular la cuenta: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordChange() {
    setLoading(true);
    setErrorMessageText('');
    try {
      await changePassword(currentPassword, newPassword, passwordConfirmation);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordConfirmation('');
      Alert.alert('Contraseña actualizada', 'Tu contraseña se cambió correctamente.');
    } catch (error) {
      setErrorMessageText(`No se pudo cambiar la contraseña: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Configura la conexión</Text>
        <Text style={styles.bodyText}>
          Define EXPO_PUBLIC_API_URL en mobile/.env.local con la IP LAN de tu ordenador y la ruta
          /api/v1. El teléfono y el ordenador deben estar en la misma red Wi-Fi.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        (screen === 'login' || screen === 'register') && styles.loginSafeArea,
      ]}
    >
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {screen === 'login' ? (
          <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.loginHero}>
              <View style={styles.loginHeroGlow} />
              <View style={styles.loginBrandRow}>
                <View style={styles.brandMark} accessibilityLabel="Logo de NEFIJJ">
                  <Text style={styles.brandMarkText}>🐼</Text>
                </View>
                <View style={styles.loginBrandCopy}>
                  <Text style={styles.loginEyebrow}>GESTIÓN DE INCIDENCIAS</Text>
                  <Text style={styles.brand}>NEFIJJ</Text>
                </View>
                <View style={styles.loginMascotBadge}>
                  <Text style={styles.loginMascot}>✦</Text>
                </View>
              </View>
              <Text style={styles.loginHeroTitle}>¡Bienvenido a NEFIJJ!</Text>
              <Text style={styles.loginHeroText}>
                Cuidamos tus espacios con reportes claros y seguimiento para cada incidencia.
              </Text>
              <View style={styles.loginFeatureRow}>
                {['Reporta', 'Da seguimiento', 'Resuelve'].map((feature) => (
                  <View key={feature} style={styles.loginFeaturePill}>
                    <Text style={styles.loginFeatureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.loginCard}>
              <Text style={styles.loginCardTitle}>Iniciar sesión</Text>
              <Text style={styles.loginCardSubtitle}>Ingresa con tu cuenta de organización.</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setUsername}
                placeholder="Usuario"
                style={styles.input}
                value={username}
              />
              <TextInput
                onChangeText={setPassword}
                placeholder="Contraseña"
                secureTextEntry
                style={styles.input}
                value={password}
              />
              <PrimaryButton title="Iniciar sesión" onPress={handleLogin} disabled={loading} />
            </View>
            <Pressable
              onPress={() => {
                setErrorMessageText('');
                setInviteCode('');
                setScanning(false);
                setScreen('register');
              }}
              style={styles.adminInviteLink}
            >
              <Text style={styles.adminInviteText}>Crear cuenta con QR o código</Text>
            </Pressable>
            <Text style={styles.helperText}>
              Pide una invitación al administrador de tu organización.
            </Text>
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
          </ScrollView>
        ) : screen === 'register' ? (
          <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.loginBrandRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>🐼</Text>
              </View>
              <View style={styles.loginBrandCopy}>
                <Text style={styles.loginEyebrow}>ÚNETE A TU ORGANIZACIÓN</Text>
                <Text style={styles.brand}>NEFIJJ</Text>
              </View>
            </View>
            <View style={styles.loginCard}>
              <Text style={styles.loginCardTitle}>Crear cuenta</Text>
              <Text style={styles.loginCardSubtitle}>
                Escanea o escribe el código de invitación que te entregó el administrador.
              </Text>
              <View style={styles.loginQrPanel}>
                <View style={styles.loginQrHeading}>
                  <View style={styles.loginQrIcon}>
                    <Text style={styles.loginQrIconText}>▦</Text>
                  </View>
                  <View style={styles.loginQrCopy}>
                    <Text style={styles.loginQrTitle}>Invitación de tu organización</Text>
                    <Text style={styles.loginQrDescription}>El código solo se puede usar una vez.</Text>
                  </View>
                </View>
                <View style={styles.loginQrInputRow}>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setInviteCode}
                    placeholder="Código de invitación"
                    style={[styles.input, styles.loginQrInput]}
                    value={inviteCode}
                  />
                  <Pressable
                    onPress={openInvitationScanner}
                    style={styles.loginQrScanButton}
                    disabled={loading}
                  >
                    <Text style={styles.loginQrScanIcon}>⌗</Text>
                    <Text style={styles.loginQrScanText}>Escanear</Text>
                  </Pressable>
                </View>
                {scanning ? (
                  <View style={styles.loginScannerFrame}>
                    <CameraView
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={onInvitationScanned}
                      style={styles.loginCamera}
                    />
                    <Pressable
                      onPress={() => setScanning(false)}
                      style={styles.cancelScanButton}
                    >
                      <Text style={styles.cancelScanText}>Cancelar escaneo</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setRegistrationUsername}
                placeholder="Nombre de usuario"
                style={styles.input}
                value={registrationUsername}
              />
              <TextInput
                autoCapitalize="words"
                onChangeText={setRegistrationFirstName}
                placeholder="Nombre (opcional)"
                style={styles.input}
                value={registrationFirstName}
              />
              <TextInput
                autoCapitalize="words"
                onChangeText={setRegistrationLastName}
                placeholder="Apellido (opcional)"
                style={styles.input}
                value={registrationLastName}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setRegistrationEmail}
                placeholder="Correo electrónico"
                style={styles.input}
                value={registrationEmail}
              />
              <TextInput
                onChangeText={setRegistrationPassword}
                placeholder="Contraseña"
                secureTextEntry
                style={styles.input}
                value={registrationPassword}
              />
              <TextInput
                onChangeText={setRegistrationPasswordConfirm}
                placeholder="Confirmar contraseña"
                secureTextEntry
                style={styles.input}
                value={registrationPasswordConfirm}
              />
              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              <PrimaryButton
                title="Crear cuenta"
                onPress={submitRegistration}
                disabled={loading}
              />
              <Pressable
                onPress={() => {
                  setScanning(false);
                  setScreen('login');
                }}
                style={styles.loginBackButton}
              >
                <Text style={styles.loginBackIcon}>‹</Text>
                <Text style={styles.loginBackText}>Ya tengo cuenta · Volver al inicio</Text>
              </Pressable>
              {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
            </View>
          </ScrollView>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.headerIdentity}>
                <View style={styles.headerMark}>
                  <Text style={styles.headerMarkText}>🐼</Text>
                </View>
                <View>
                  <Text style={styles.headerTitle}>NEFIJJ</Text>
                  <Text style={styles.headerSubtitle}>
                    {user && `${user.username} · ${ROLE_LABELS[user.role] || user.role}`}
                  </Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                {user && user.role === 'organization_admin' ? (
                  <>
                    <Pressable onPress={openLocationManagement} style={styles.headerButton}>
                      <Text style={styles.headerButtonText}>Sedes</Text>
                    </Pressable>
                    <Pressable onPress={openTechnicianManagement} style={styles.headerButton}>
                      <Text style={styles.headerButtonText}>Técnicos</Text>
                    </Pressable>
                    <Pressable onPress={openUserManagement} style={styles.headerButton}>
                      <Text style={styles.headerButtonText}>Usuarios</Text>
                    </Pressable>
                    <Pressable onPress={openCategoryManagement} style={styles.headerButton}>
                      <Text style={styles.headerButtonText}>Categorías</Text>
                    </Pressable>
                    <Pressable onPress={openInvitationManagement} style={styles.headerButton}>
                      <Text style={styles.headerButtonText}>Accesos QR</Text>
                    </Pressable>
                  </>
                ) : null}
                {user && user.role === 'superadmin' ? (
                  <Pressable onPress={openOrganizationManagement} style={styles.headerButton}>
                    <Text style={styles.headerButtonText}>Organizaciones</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={openNotifications} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>
                    Avisos{notifications.some((notification) => !notification.is_read) ? ' •' : ''}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setScreen('profile')} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Perfil</Text>
                </Pressable>
                <Pressable onPress={handleLogout} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Salir</Text>
                </Pressable>
              </View>
            </View>

            {screen === 'incidents' ? (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.dashboardHero}>
                  <Text style={styles.heroEyebrow}>NEFIJJ · TU ORGANIZACIÓN</Text>
                  <Text style={styles.dashboardHeroTitle}>
                    ¡Hola{user && user.username ? `, ${user.username}` : ''}!
                  </Text>
                  <Text style={styles.dashboardHeroText}>
                    {WELCOME_MESSAGES[user && user.role] || 'Estamos aquí para ayudarte a dar seguimiento a tus incidencias.'}
                  </Text>
                </View>
                <View style={styles.sectionHeading}>
                  <Text style={styles.title}>Incidencias</Text>
                  <Pressable onPress={loadDashboard} accessibilityRole="button">
                    <Text style={styles.linkText}>Actualizar</Text>
                  </Pressable>
                </View>
                {user && user.role === 'user' ? (
                  <>
                    <PrimaryButton title="Nuevo reporte" onPress={() => setScreen('new')} />
                    <Pressable onPress={() => setScreen('link-organization')} style={styles.cancelLink}>
                      <Text style={styles.linkText}>Vincular otra sede con QR</Text>
                    </Pressable>
                  </>
                ) : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                {!loading && incidents.length === 0 ? (
                  <Text style={styles.emptyText}>Todavía no hay incidencias para mostrar.</Text>
                ) : null}
                {incidents.map((incident) => (
                  <View key={incident.id} style={styles.card}>
                    <View style={styles.sectionHeading}>
                      <Text style={styles.cardTitle}>{incident.title}</Text>
                      <Text style={styles.status}>{STATUS_LABELS[incident.status] || incident.status}</Text>
                    </View>
                    <Text style={styles.cardMeta}>
                      {incident.category} · Prioridad {PRIORITY_LABELS[incident.priority] || incident.priority}
                    </Text>
                    <Text style={styles.bodyText}>{incident.description}</Text>
                    <Text style={styles.cardMeta}>
                      Reportó {incident.reporter}
                      {incident.assigned_to ? ` · Asignada a ${incident.assigned_to}` : ''}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {SLA_LABELS[incident.sla_status] || incident.sla_status}
                      {incident.sla_due_at
                        ? ` · Vence ${new Date(incident.sla_due_at).toLocaleString()}`
                        : ''}
                    </Text>
                    {incident.evidence_image ? (
                      <EvidenceThumbnail uri={incident.evidence_image} />
                    ) : null}
                    {incident.resolution_note ? (
                      <Text style={styles.bodyText}>Resolución: {incident.resolution_note}</Text>
                    ) : null}
                    {incident.resolution_image ? (
                      <EvidenceThumbnail uri={incident.resolution_image} />
                    ) : null}
                    {incident.events && incident.events.length > 0 ? (
                      <View style={styles.history}>
                        <Text style={styles.label}>Historial</Text>
                        {incident.events.map((event) => (
                          <Text key={event.id} style={styles.cardMeta}>
                            {getIncidentEventDescription(event)} · {event.actor} ·{' '}
                            {new Date(event.created_at).toLocaleString()}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {user && user.role === 'organization_admin' ? (
                      <View style={styles.formGroup}>
                        <Text style={styles.label}>Asignar técnico de esta sede</Text>
                        <View style={styles.choiceList}>
                          {technicians
                            .filter((technician) => (
                              technician.is_active &&
                              String(technician.location_id) === String(incident.location_id)
                            ))
                            .map((technician) => {
                              const selectedTechnicianId = incidentTechnicianSelections[incident.id]
                                ?? (incident.assigned_to_id ? String(incident.assigned_to_id) : '');
                              return (
                                <Pressable
                                  key={technician.id}
                                  onPress={() => setIncidentTechnicianSelections((current) => ({
                                    ...current,
                                    [incident.id]: String(technician.id),
                                  }))}
                                  style={[
                                    styles.choice,
                                    selectedTechnicianId === String(technician.id) &&
                                      styles.selectedChoice,
                                  ]}
                                >
                                  <Text style={styles.choiceText}>{technician.username}</Text>
                                </Pressable>
                              );
                            })}
                        </View>
                        {incident.assigned_to ? (
                          <Text style={styles.cardMeta}>Asignado a {incident.assigned_to}</Text>
                        ) : null}
                        <PrimaryButton
                          title={incident.assigned_to ? 'Guardar asignación' : 'Asignar técnico'}
                          onPress={() => assignTechnicianToIncident(incident)}
                          disabled={loading}
                        />
                      </View>
                    ) : null}
                    {user && user.role === 'technician' && incident.assigned_to === user.username &&
                    NEXT_STATUS[incident.status] ? (
                      <View style={styles.statusActions}>
                        {NEXT_STATUS[incident.status] === 'resuelto' ? (
                          <View style={styles.formGroup}>
                            <Text style={styles.label}>Nota de resolución (obligatoria)</Text>
                            <TextInput
                              multiline
                              onChangeText={(value) => setResolutionNotes((current) => ({
                                ...current,
                                [incident.id]: value,
                              }))}
                              placeholder="Describe qué reparación realizaste"
                              style={[styles.input, styles.multilineInput]}
                              textAlignVertical="top"
                              value={resolutionNotes[incident.id] || ''}
                            />
                            <Pressable
                              onPress={() => pickResolutionImage(incident.id)}
                              style={styles.outlineButton}
                            >
                              <Text style={styles.outlineButtonText}>
                                {resolutionImages[incident.id] ? 'Cambiar foto final' : 'Agregar foto final (opcional)'}
                              </Text>
                            </Pressable>
                            {resolutionImages[incident.id] ? (
                              <Image
                                source={{ uri: resolutionImages[incident.id].uri }}
                                style={styles.evidenceImage}
                              />
                            ) : null}
                          </View>
                        ) : null}
                        <Pressable
                          onPress={() => {
                            const nextStatus = NEXT_STATUS[incident.status];
                            const note = (resolutionNotes[incident.id] || '').trim();
                            if (nextStatus === 'resuelto' && !note) {
                              setErrorMessageText('Escribe la nota de resolución antes de cerrar.');
                              return;
                            }
                            changeStatus(
                              incident.id,
                              nextStatus,
                              note,
                              resolutionImages[incident.id],
                            );
                          }}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>
                            {STATUS_LABELS[NEXT_STATUS[incident.status]]}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {screen === 'notifications' ? (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.title}>Notificaciones</Text>
                  <Pressable onPress={() => setScreen('incidents')} accessibilityRole="button">
                    <Text style={styles.linkText}>Volver</Text>
                  </Pressable>
                </View>
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                {!loading && notifications.length === 0 ? (
                  <Text style={styles.emptyText}>Todavía no tienes notificaciones.</Text>
                ) : null}
                {notifications.map((notification) => (
                  <Pressable
                    key={notification.id}
                    onPress={() => openNotifiedIncident(notification)}
                    style={[styles.card, !notification.is_read && styles.unreadNotification]}
                  >
                    <Text style={styles.cardTitle}>{notification.incident_title}</Text>
                    <Text style={styles.bodyText}>{notification.message}</Text>
                    <Text style={styles.cardMeta}>
                      {new Date(notification.created_at).toLocaleString()}
                      {notification.is_read ? ' · Leída' : ' · Sin leer'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {screen === 'new' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Nuevo reporte</Text>
                <TextInput
                  onChangeText={setTitle}
                  placeholder="Título"
                  style={styles.input}
                  value={title}
                />
                <TextInput
                  multiline
                  onChangeText={setDescription}
                  placeholder="Describe la incidencia"
                  style={[styles.input, styles.multilineInput]}
                  textAlignVertical="top"
                  value={description}
                />
                <Text style={styles.label}>Categoría</Text>
                {categories.length === 0 ? (
                  <Text style={styles.helperText}>No hay categorías activas en tu organización.</Text>
                ) : (
                  <View style={styles.choiceList}>
                    {categories.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => setCategoryId(String(category.id))}
                        style={[
                          styles.choice,
                          categoryId === String(category.id) && styles.selectedChoice,
                        ]}
                      >
                        <Text style={styles.choiceText}>{category.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <Text style={styles.label}>Prioridad</Text>
                <View style={styles.choiceList}>
                  {PRIORITIES.map((item) => (
                    <Pressable
                      key={item.value}
                      onPress={() => setPriority(item.value)}
                      style={[styles.choice, priority === item.value && styles.selectedChoice]}
                    >
                      <Text style={styles.choiceText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>Evidencia (opcional)</Text>
                <View style={styles.statusActions}>
                  <Pressable onPress={() => pickImage('library')} style={styles.outlineButton}>
                    <Text style={styles.outlineButtonText}>Elegir de galería</Text>
                  </Pressable>
                  <Pressable onPress={() => pickImage('camera')} style={styles.outlineButton}>
                    <Text style={styles.outlineButtonText}>Tomar foto</Text>
                  </Pressable>
                </View>
                {image ? (
                  <View>
                    <Image source={{ uri: image.uri }} style={styles.evidenceImage} />
                    <Pressable onPress={() => setImage(null)}>
                      <Text style={styles.linkText}>Quitar imagen</Text>
                    </Pressable>
                  </View>
                ) : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                <PrimaryButton
                  title="Enviar reporte"
                  onPress={submitIncident}
                  disabled={loading || categories.length === 0}
                />
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Cancelar</Text>
                </Pressable>
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
              </ScrollView>
            ) : null}

            {screen === 'link-organization' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Vincular organización</Text>
                <Text style={styles.bodyText}>
                  Escanea el QR de invitación o escribe el código que te entregó el administrador.
                </Text>
                {scanning ? (
                  <CameraView
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={onInvitationScanned}
                    style={styles.camera}
                  />
                ) : (
                  <PrimaryButton
                    title="Escanear QR"
                    onPress={openInvitationScanner}
                    disabled={loading}
                  />
                )}
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setInviteCode}
                  placeholder="Código de invitación"
                  style={styles.input}
                  value={inviteCode}
                />
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                <PrimaryButton
                  title="Vincular cuenta"
                  onPress={submitInvitationCode}
                  disabled={loading || !inviteCode.trim()}
                />
                {user && user.tenant_active ? (
                  <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                    <Text style={styles.linkText}>Volver a incidencias</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : null}

            {screen === 'invitations' ? (
              <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>Invitaciones QR</Text>
                <Text style={styles.bodyText}>
                  El código se protege con cifrado, vence en siete días hábiles y puedes volver a mostrarlo o compartirlo mientras siga activo. La persona puede crear una cuenta desde el inicio o vincular una cuenta existente.
                </Text>
                <Text style={styles.label}>Sede</Text>
                <View style={styles.choiceList}>
                  {locations.map((location) => (
                    <Pressable
                      key={location.id}
                      onPress={() => setSelectedLocationId(String(location.id))}
                      style={[
                        styles.choice,
                        selectedLocationId === String(location.id) && styles.selectedChoice,
                      ]}
                    >
                      <Text style={styles.choiceText}>{location.organization} · {location.name}</Text>
                    </Pressable>
                  ))}
                </View>
                {locations.length === 0 ? (
                  <Text style={styles.emptyText}>No hay sedes activas disponibles para invitar.</Text>
                ) : null}
                <PrimaryButton
                  title="Generar invitación"
                  onPress={createInvitation}
                  disabled={loading || locations.length === 0}
                />
                {newInvitation ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>QR de invitación (secreto de un solo uso)</Text>
                    <View style={styles.qrContainer}>
                      <QRCode value={newInvitation.code} size={220} />
                    </View>
                    <Text selectable style={styles.bodyText}>{newInvitation.code}</Text>
                    <Text style={styles.cardMeta}>
                      Vence: {new Date(newInvitation.expires_at).toLocaleString()}
                    </Text>
                    <PrimaryButton
                      title="Compartir invitación"
                      onPress={() => shareInvitation(newInvitation)}
                      disabled={loading}
                    />
                  </View>
                ) : null}
                <Text style={styles.label}>Códigos emitidos</Text>
                {invitations.map((invitation) => {
                  const expired = Date.parse(invitation.expires_at) <= Date.now();
                  const inactive = invitation.revoked_at || invitation.used_at || expired;
                  return (
                    <View key={invitation.id} style={styles.card}>
                      <Text style={styles.cardTitle}>{invitation.location_name}</Text>
                      <Text style={styles.cardMeta}>
                        {invitation.used_at ? 'Utilizada' : invitation.revoked_at ? 'Revocada' : expired ? 'Vencida' : 'Activa'}
                        {' · Vence '}{new Date(invitation.expires_at).toLocaleString()}
                      </Text>
                      {!inactive && invitation.can_reveal_code ? (
                        <View style={styles.invitationActions}>
                          <Pressable
                            onPress={() => showInvitation(invitation)}
                            style={styles.outlineButton}
                            disabled={loading}
                          >
                            <Text style={styles.outlineButtonText}>Ver QR y código</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => shareInvitation(invitation)}
                            style={styles.outlineButton}
                            disabled={loading}
                          >
                            <Text style={styles.outlineButtonText}>Compartir código</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {!inactive && !invitation.can_reveal_code ? (
                        <Text style={styles.emptyText}>
                          No se puede recuperar el código de esta invitación. Genera una nueva para compartirla.
                        </Text>
                      ) : null}
                      {!inactive ? (
                        <Pressable
                          onPress={() => revokeInvitation(invitation.id)}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>Revocar</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a incidencias</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {screen === 'organizations' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Organizaciones</Text>
                <TextInput
                  onChangeText={setOrganizationName}
                  placeholder="Nombre de la nueva organización"
                  style={styles.input}
                  value={organizationName}
                />
                <PrimaryButton
                  title="Crear organización"
                  onPress={submitOrganization}
                  disabled={loading}
                />
                {organizations.map((organization) => (
                  <View key={organization.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{organization.name}</Text>
                    <Text style={styles.cardMeta}>
                      {organization.status === 'active' ? 'Activa' : 'Suspendida'}
                    </Text>
                    <Pressable
                      onPress={() => toggleOrganizationStatus(organization)}
                      style={styles.outlineButton}
                    >
                      <Text style={styles.outlineButtonText}>
                        {organization.status === 'active' ? 'Suspender' : 'Activar'}
                      </Text>
                    </Pressable>
                    {organization.status === 'active' ? (
                      <PrimaryButton
                        title={selectedAdminOrganizationId === String(organization.id)
                          ? 'Cancelar alta de administrador'
                          : 'Crear administrador de organización'}
                        onPress={() => {
                          setSelectedAdminOrganizationId(
                            selectedAdminOrganizationId === String(organization.id)
                              ? ''
                              : String(organization.id),
                          );
                          clearStaffForm();
                          setErrorMessageText('');
                        }}
                      />
                    ) : null}
                    {organizationAdmins
                      .filter((admin) => admin.organization_memberships.some(
                        (membership) => membership.organization_id === organization.id,
                      ))
                      .map((admin) => {
                        const membership = admin.organization_memberships.find(
                          (item) => item.organization_id === organization.id,
                        );
                        const isEditingPassword = editingAdminPasswordId === admin.id;
                        return (
                          <View key={admin.id} style={styles.adminCard}>
                            <Text style={styles.cardMeta}>
                              Administrador: {admin.username} ({admin.email}) · {membership.is_active ? 'Activo' : 'Inactivo'}
                            </Text>
                            <View style={styles.actionRow}>
                              <Pressable
                                onPress={() => toggleOrganizationAdminStatus(
                                  admin,
                                  organization.id,
                                  !membership.is_active,
                                )}
                                style={styles.outlineButton}
                              >
                                <Text style={styles.outlineButtonText}>
                                  {membership.is_active ? 'Desactivar' : 'Reactivar'}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  if (isEditingPassword) {
                                    setEditingAdminPasswordId(null);
                                    setAdminNewPassword('');
                                    setAdminNewPasswordConfirm('');
                                  } else {
                                    setEditingAdminPasswordId(admin.id);
                                    setAdminNewPassword('');
                                    setAdminNewPasswordConfirm('');
                                  }
                                }}
                                style={styles.outlineButton}
                              >
                                <Text style={styles.outlineButtonText}>
                                  {isEditingPassword ? 'Cancelar clave' : 'Cambiar clave'}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleDeleteOrganizationAdmin(admin)}
                                style={[styles.outlineButton, styles.dangerButton]}
                              >
                                <Text style={[styles.outlineButtonText, styles.dangerButtonText]}>
                                  Eliminar
                                </Text>
                              </Pressable>
                            </View>
                            {isEditingPassword ? (
                              <View style={styles.subFormGroup}>
                                <Text style={styles.label}>Nueva contraseña para {admin.username}:</Text>
                                <TextInput
                                  onChangeText={setAdminNewPassword}
                                  placeholder="Nueva contraseña segura"
                                  secureTextEntry
                                  style={styles.input}
                                  value={adminNewPassword}
                                />
                                <TextInput
                                  onChangeText={setAdminNewPasswordConfirm}
                                  placeholder="Confirmar nueva contraseña"
                                  secureTextEntry
                                  style={styles.input}
                                  value={adminNewPasswordConfirm}
                                />
                                <PrimaryButton
                                  title="Guardar contraseña"
                                  onPress={() => handleResetAdminPassword(admin.id)}
                                  disabled={loading || !adminNewPassword}
                                />
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    {selectedAdminOrganizationId === String(organization.id) ? (
                      <View style={styles.formGroup}>
                        <TextInput
                          autoCapitalize="none"
                          onChangeText={setStaffUsername}
                          placeholder="Usuario de acceso"
                          style={styles.input}
                          value={staffUsername}
                        />
                        <TextInput
                          autoCapitalize="none"
                          keyboardType="email-address"
                          onChangeText={setStaffEmail}
                          placeholder="Correo institucional"
                          style={styles.input}
                          value={staffEmail}
                        />
                        <TextInput
                          onChangeText={setStaffPassword}
                          placeholder="Contraseña inicial segura"
                          secureTextEntry
                          style={styles.input}
                          value={staffPassword}
                        />
                        <PrimaryButton
                          title="Crear cuenta administrativa"
                          onPress={() => submitOrganizationAdmin(organization.id)}
                          disabled={loading}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a supervisión</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {screen === 'technicians' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Gestión de técnicos</Text>
                <Text style={styles.bodyText}>
                  Cada cuenta queda vinculada a una sede de una organización que administras.
                </Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setStaffUsername}
                  placeholder="Nombre de usuario"
                  style={styles.input}
                  value={staffUsername}
                />
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setStaffEmail}
                  placeholder="Correo institucional"
                  style={styles.input}
                  value={staffEmail}
                />
                <TextInput
                  onChangeText={setStaffFirstName}
                  placeholder="Nombres (opcional)"
                  style={styles.input}
                  value={staffFirstName}
                />
                <TextInput
                  onChangeText={setStaffLastName}
                  placeholder="Apellidos (opcional)"
                  style={styles.input}
                  value={staffLastName}
                />
                <TextInput
                  onChangeText={setStaffPassword}
                  placeholder="Contraseña inicial segura"
                  secureTextEntry
                  style={styles.input}
                  value={staffPassword}
                />
                <Text style={styles.label}>Sede asignada</Text>
                <View style={styles.choiceList}>
                  {locations.map((location) => (
                    <Pressable
                      key={location.id}
                      onPress={() => setSelectedLocationId(String(location.id))}
                      style={[
                        styles.choice,
                        selectedLocationId === String(location.id) && styles.selectedChoice,
                      ]}
                    >
                      <Text style={styles.choiceText}>
                        {location.organization} · {location.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <PrimaryButton
                  title="Crear técnico"
                  onPress={submitTechnician}
                  disabled={loading || locations.length === 0}
                />
                <Text style={styles.label}>Personal técnico</Text>
                {technicians.map((technician) => (
                  <View key={technician.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{technician.username}</Text>
                    <Text style={styles.cardMeta}>
                      {technician.email} · {technician.location || 'Sin sede'} ·
                      {' '}{technician.is_active ? 'Activo' : 'Inactivo'}
                    </Text>
                    <Pressable
                      onPress={() => toggleTechnicianStatus(technician)}
                      style={styles.outlineButton}
                    >
                      <Text style={styles.outlineButtonText}>
                        {technician.is_active ? 'Desactivar acceso' : 'Reactivar acceso'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingTechnicianPasswordId(
                          editingTechnicianPasswordId === technician.id ? null : technician.id,
                        );
                        setTechnicianNewPassword('');
                        setTechnicianNewPasswordConfirm('');
                        setErrorMessageText('');
                      }}
                      style={styles.outlineButton}
                    >
                      <Text style={styles.outlineButtonText}>
                        {editingTechnicianPasswordId === technician.id
                          ? 'Cancelar cambio'
                          : 'Cambiar contraseña'}
                      </Text>
                    </Pressable>
                    {editingTechnicianPasswordId === technician.id ? (
                      <View style={styles.formGroup}>
                        <TextInput
                          onChangeText={setTechnicianNewPassword}
                          placeholder="Contraseña temporal nueva"
                          secureTextEntry
                          style={styles.input}
                          value={technicianNewPassword}
                        />
                        <TextInput
                          onChangeText={setTechnicianNewPasswordConfirm}
                          placeholder="Confirmar contraseña temporal"
                          secureTextEntry
                          style={styles.input}
                          value={technicianNewPasswordConfirm}
                        />
                        <PrimaryButton
                          title="Guardar contraseña"
                          onPress={() => handleTechnicianPasswordReset(technician.id)}
                          disabled={loading}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a incidencias</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {screen === 'users' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Usuarios de la organización</Text>
                <Text style={styles.bodyText}>
                  Define una contraseña temporal y entrégala al usuario de forma segura. Luego deberá cambiarla desde Perfil.
                </Text>
                {organizationUsers.map((organizationUser) => (
                  <View key={organizationUser.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{organizationUser.username}</Text>
                    <Text style={styles.cardMeta}>
                      {organizationUser.email} · {organizationUser.location || 'Sin sede'} ·
                      {' '}{organizationUser.is_active ? 'Activo' : 'Inactivo'}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setEditingUserPasswordId(
                          editingUserPasswordId === organizationUser.id ? null : organizationUser.id,
                        );
                        setUserNewPassword('');
                        setUserNewPasswordConfirm('');
                        setErrorMessageText('');
                      }}
                      style={styles.outlineButton}
                    >
                      <Text style={styles.outlineButtonText}>
                        {editingUserPasswordId === organizationUser.id
                          ? 'Cancelar cambio'
                          : 'Cambiar contraseña'}
                      </Text>
                    </Pressable>
                    {editingUserPasswordId === organizationUser.id ? (
                      <View style={styles.formGroup}>
                        <TextInput
                          onChangeText={setUserNewPassword}
                          placeholder="Contraseña temporal nueva"
                          secureTextEntry
                          style={styles.input}
                          value={userNewPassword}
                        />
                        <TextInput
                          onChangeText={setUserNewPasswordConfirm}
                          placeholder="Confirmar contraseña temporal"
                          secureTextEntry
                          style={styles.input}
                          value={userNewPasswordConfirm}
                        />
                        <PrimaryButton
                          title="Guardar contraseña"
                          onPress={() => handleUserPasswordReset(organizationUser.id)}
                          disabled={loading}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
                {organizationUsers.length === 0 && !loading ? (
                  <Text style={styles.emptyText}>No hay usuarios activos en tus sedes.</Text>
                ) : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a incidencias</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {screen === 'categories' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Categorías y enrutamiento</Text>
                <Text style={styles.bodyText}>
                  Configura un técnico por categoría y sede. Los nuevos reportes se asignan automáticamente.
                </Text>
                <Text style={styles.label}>Organización</Text>
                <View style={styles.choiceList}>
                  {managedOrganizations.map((organization) => (
                    <Pressable
                      key={organization.id}
                      onPress={() => {
                        setSelectedCategoryOrganizationId(String(organization.id));
                        setEditingCategoryId(null);
                        setCategoryName('');
                        setCategoryDescription('');
                        setSelectedRouteCategoryId('');
                        setCategoryRoutes([]);
                      }}
                      style={[
                        styles.choice,
                        selectedCategoryOrganizationId === String(organization.id) &&
                          styles.selectedChoice,
                      ]}
                    >
                      <Text style={styles.choiceText}>{organization.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  onChangeText={setCategoryName}
                  placeholder="Nombre de categoría"
                  style={styles.input}
                  value={categoryName}
                />
                <TextInput
                  multiline
                  onChangeText={setCategoryDescription}
                  placeholder="Descripción (opcional)"
                  style={[styles.input, styles.multilineInput]}
                  textAlignVertical="top"
                  value={categoryDescription}
                />
                <PrimaryButton
                  title={editingCategoryId ? 'Guardar cambios' : 'Crear categoría'}
                  onPress={saveCategory}
                  disabled={loading || !selectedCategoryOrganizationId}
                />
                {editingCategoryId ? (
                  <Pressable
                    onPress={() => {
                      setEditingCategoryId(null);
                      setCategoryName('');
                      setCategoryDescription('');
                    }}
                    style={styles.cancelLink}
                  >
                    <Text style={styles.linkText}>Cancelar edición</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.label}>Categorías de la organización</Text>
                {categories
                  .filter((category) => (
                    String(category.organization_id) === selectedCategoryOrganizationId
                  ))
                  .map((category) => (
                    <View key={category.id} style={styles.card}>
                      <View style={styles.sectionHeading}>
                        <Text style={styles.cardTitle}>{category.name}</Text>
                        <Text style={styles.status}>
                          {category.is_active ? 'Activa' : 'Inactiva'}
                        </Text>
                      </View>
                      {category.description ? (
                        <Text style={styles.cardMeta}>{category.description}</Text>
                      ) : null}
                      <View style={styles.statusActions}>
                        <Pressable onPress={() => editCategory(category)} style={styles.outlineButton}>
                          <Text style={styles.outlineButtonText}>Editar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => toggleCategoryActive(category)}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>
                            {category.is_active ? 'Desactivar' : 'Reactivar'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                <Text style={styles.label}>Asignar técnico por sede</Text>
                <View style={styles.choiceList}>
                  {categories
                    .filter((category) => (
                      String(category.organization_id) === selectedCategoryOrganizationId &&
                      category.is_active
                    ))
                    .map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => selectRouteCategory(category.id)}
                        style={[
                          styles.choice,
                          selectedRouteCategoryId === String(category.id) && styles.selectedChoice,
                        ]}
                      >
                        <Text style={styles.choiceText}>{category.name}</Text>
                      </Pressable>
                    ))}
                </View>
                {selectedRouteCategoryId ? (
                  <>
                    <View style={styles.choiceList}>
                      {locations
                        .filter((location) => (
                          String(location.organization_id) === selectedCategoryOrganizationId
                        ))
                        .map((location) => (
                          <Pressable
                            key={location.id}
                            onPress={() => {
                              setSelectedRouteLocationId(String(location.id));
                              setSelectedRouteTechnicianId('');
                            }}
                            style={[
                              styles.choice,
                              selectedRouteLocationId === String(location.id) &&
                                styles.selectedChoice,
                            ]}
                          >
                            <Text style={styles.choiceText}>{location.name}</Text>
                          </Pressable>
                        ))}
                    </View>
                    <View style={styles.choiceList}>
                      {technicians
                        .filter((technician) => (
                          String(technician.location_id) === selectedRouteLocationId
                        ))
                        .map((technician) => (
                          <Pressable
                            key={technician.id}
                            onPress={() => setSelectedRouteTechnicianId(String(technician.id))}
                            style={[
                              styles.choice,
                              selectedRouteTechnicianId === String(technician.id) &&
                                styles.selectedChoice,
                            ]}
                          >
                            <Text style={styles.choiceText}>{technician.username}</Text>
                          </Pressable>
                        ))}
                    </View>
                    <PrimaryButton
                      title="Guardar enrutamiento"
                      onPress={submitCategoryRoute}
                      disabled={loading}
                    />
                    {categoryRoutes.map((route) => (
                      <View
                        key={`${route.location_id}-${route.technician_id}`}
                        style={styles.card}
                      >
                        <Text style={styles.cardMeta}>
                          {route.location_name} → {route.technician_username}
                        </Text>
                        <Pressable
                          onPress={() => deleteCategoryRoute(route.location_id)}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>Quitar enrutamiento</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a incidencias</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {screen === 'locations' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Sedes de la organización</Text>
                <Text style={styles.bodyText}>
                  Crea y activa las sedes disponibles para técnicos, estudiantes e invitaciones QR.
                </Text>
                <Text style={styles.label}>Organización</Text>
                <View style={styles.choiceList}>
                  {managedOrganizations.map((organization) => (
                    <Pressable
                      key={organization.id}
                      onPress={() => {
                        setSelectedLocationOrganizationId(String(organization.id));
                      }}
                      style={[
                        styles.choice,
                        selectedLocationOrganizationId === String(organization.id) &&
                          styles.selectedChoice,
                      ]}
                    >
                      <Text style={styles.choiceText}>{organization.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  onChangeText={setLocationName}
                  placeholder="Nombre de la sede"
                  style={styles.input}
                  value={locationName}
                />
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={setLocationCode}
                  placeholder="Código único de la sede"
                  style={styles.input}
                  value={locationCode}
                />
                <PrimaryButton
                  title="Crear sede"
                  onPress={submitLocation}
                  disabled={loading || managedOrganizations.length === 0}
                />
                <Text style={styles.label}>Sedes registradas</Text>
                {locations.map((location) => (
                  <View key={location.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{location.name}</Text>
                    <Text style={styles.cardMeta}>
                      {location.organization} · {location.code} · {location.is_active ? 'Activa' : 'Inactiva'}
                    </Text>
                    <Pressable
                      onPress={() => toggleLocationStatus(location)}
                      style={styles.outlineButton}
                    >
                      <Text style={styles.outlineButtonText}>
                        {location.is_active ? 'Desactivar sede' : 'Reactivar sede'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a incidencias</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {screen === 'profile' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Perfil</Text>
                <Text style={styles.bodyText}>Usuario: {user && user.username}</Text>
                <Text style={styles.bodyText}>
                  Rol: {user && (ROLE_LABELS[user.role] || user.role)}
                </Text>
                <Text style={styles.label}>Cambiar contraseña</Text>
                <TextInput
                  onChangeText={setCurrentPassword}
                  placeholder="Contraseña actual"
                  secureTextEntry
                  style={styles.input}
                  value={currentPassword}
                />
                <TextInput
                  onChangeText={setNewPassword}
                  placeholder="Nueva contraseña"
                  secureTextEntry
                  style={styles.input}
                  value={newPassword}
                />
                <TextInput
                  onChangeText={setPasswordConfirmation}
                  placeholder="Confirmar nueva contraseña"
                  secureTextEntry
                  style={styles.input}
                  value={passwordConfirmation}
                />
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                <PrimaryButton
                  title="Guardar contraseña"
                  onPress={submitPasswordChange}
                  disabled={loading}
                />
                <Pressable onPress={() => setScreen('incidents')} style={styles.cancelLink}>
                  <Text style={styles.linkText}>Volver a incidencias</Text>
                </Pressable>
                {loading ? <ActivityIndicator color="#167D68" style={styles.loader} /> : null}
              </ScrollView>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F5EF',
  },
  loginSafeArea: {
    backgroundColor: '#FFF8E9',
  },
  fill: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#F7F5EF',
  },
  loginContainer: {
    backgroundColor: '#FFF8E9',
    flexGrow: 1,
    justifyContent: 'center',
    gap: 17,
    padding: 20,
    paddingBottom: 30,
  },
  loginHero: {
    backgroundColor: '#F4C85E',
    borderColor: '#E4B64D',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#775117',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  loginHeroGlow: {
    backgroundColor: '#F9DE94',
    borderRadius: 100,
    height: 200,
    opacity: 0.65,
    position: 'absolute',
    right: -80,
    top: -105,
    width: 200,
  },
  loginBrandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  loginBrandCopy: {
    flex: 1,
    gap: 2,
  },
  loginEyebrow: {
    color: '#526047',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  loginMascotBadge: {
    alignItems: 'center',
    backgroundColor: '#FFF7E4',
    borderColor: '#E8CB7C',
    borderRadius: 23,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  loginMascot: {
    color: '#315641',
    fontSize: 30,
  },
  loginHeroTitle: {
    color: '#253E31',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginTop: 10,
  },
  loginHeroText: {
    color: '#455542',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 340,
  },
  loginFeatureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 3,
  },
  loginFeaturePill: {
    backgroundColor: '#FBE8B5',
    borderColor: '#E8CA7D',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loginFeatureText: {
    color: '#38503A',
    fontSize: 11,
    fontWeight: '700',
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#164D44',
    borderColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    height: 58,
    justifyContent: 'center',
    shadowColor: '#243B2A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    width: 58,
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
  },
  invitationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  loginCard: {
    backgroundColor: '#FFFEFA',
    borderColor: '#EADCB7',
    borderRadius: 25,
    borderWidth: 1,
    gap: 12,
    padding: 18,
    shadowColor: '#60461C',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  loginCardTitle: {
    color: '#21392E',
    fontSize: 21,
    fontWeight: '800',
  },
  loginCardSubtitle: {
    color: '#687165',
    fontSize: 14,
    marginBottom: 4,
  },
  adminInviteLink: {
    alignItems: 'center',
    backgroundColor: '#FFFEFA',
    borderColor: '#EADCB7',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  adminInviteText: {
    color: '#315B48',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  loginBackButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F8F0D9',
    borderColor: '#E6D39E',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  loginBackIcon: {
    color: '#315B48',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 25,
  },
  loginBackText: {
    color: '#315B48',
    fontSize: 12,
    fontWeight: '700',
  },
  loginQrPanel: {
    backgroundColor: '#FBF6E8',
    borderColor: '#E8D69F',
    borderRadius: 17,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  loginQrHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  loginQrIcon: {
    alignItems: 'center',
    backgroundColor: '#F2D98D',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  loginQrIconText: {
    color: '#315641',
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 30,
  },
  loginQrCopy: {
    flex: 1,
    gap: 2,
  },
  loginQrTitle: {
    color: '#30463A',
    fontSize: 13,
    fontWeight: '800',
  },
  loginQrDescription: {
    color: '#6E6B5E',
    fontSize: 11,
    lineHeight: 15,
  },
  loginQrInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loginQrInput: {
    flex: 1,
    fontSize: 14,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  loginQrScanButton: {
    alignItems: 'center',
    backgroundColor: '#164D44',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 10,
    width: 90,
  },
  loginQrScanIcon: {
    color: '#F7DE9A',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 20,
  },
  loginQrScanText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  loginScannerFrame: {
    gap: 7,
  },
  loginCamera: {
    borderRadius: 14,
    height: 220,
    overflow: 'hidden',
    width: '100%',
  },
  cancelScanButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  cancelScanText: {
    color: '#315B48',
    fontSize: 12,
    fontWeight: '700',
  },
  brand: {
    color: '#164D44',
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitle: {
    color: '#455542',
    fontSize: 17,
    marginBottom: 32,
    marginTop: 8,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFEFA',
    borderBottomColor: '#EADCB7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  headerIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 10,
  },
  headerMark: {
    alignItems: 'center',
    backgroundColor: '#FBE8B5',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerMarkText: {
    color: '#164D44',
    fontSize: 21,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#164D44',
    fontSize: 19,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#66766F',
    fontSize: 11,
    marginTop: 3,
  },
  headerActions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#F8F0D9',
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  headerButtonText: {
    color: '#205D4F',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    backgroundColor: '#F7F5EF',
    gap: 15,
    padding: 18,
    paddingBottom: 24,
  },
  dashboardHero: {
    backgroundColor: '#164D44',
    borderRadius: 22,
    gap: 10,
    marginBottom: 3,
    overflow: 'hidden',
    padding: 21,
  },
  heroEyebrow: {
    color: '#9BE3C6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  dashboardHeroTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },
  dashboardHeroText: {
    color: '#D5E8DF',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#1C3029',
    fontSize: 24,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1EAE5',
    borderRadius: 17,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  history: {
    backgroundColor: '#F3F8F5',
    borderRadius: 12,
    gap: 6,
    padding: 10,
  },
  unreadNotification: {
    borderColor: '#167D68',
  },
  formGroup: {
    gap: 10,
  },
  cardTitle: {
    color: '#24372F',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    paddingRight: 8,
  },
  status: {
    color: '#247D67',
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    color: '#697871',
    fontSize: 12,
  },
  bodyText: {
    color: '#45564E',
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    backgroundColor: '#F8FAF9',
    borderColor: '#D8E2DC',
    borderRadius: 13,
    borderWidth: 1,
    color: '#24372F',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  multilineInput: {
    minHeight: 120,
    paddingTop: 13,
  },
  label: {
    color: '#344A40',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 5,
  },
  choiceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  selectedChoice: {
    backgroundColor: '#E5F4ED',
    borderColor: '#247D67',
  },
  choiceText: {
    color: '#344A40',
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#167D68',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  dangerButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FDA29B',
  },
  dangerButtonText: {
    color: '#B42318',
  },
  adminCard: {
    backgroundColor: '#F5F8F6',
    borderColor: '#E2EAE5',
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 8,
    padding: 10,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  subFormGroup: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  outlineButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2DC',
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  outlineButtonText: {
    color: '#344A40',
    fontSize: 13,
    fontWeight: '600',
  },
  statusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  evidenceImage: {
    alignSelf: 'flex-start',
    borderRadius: 13,
    height: 190,
    marginTop: 4,
    width: '100%',
  },
  camera: {
    borderRadius: 17,
    height: 300,
    overflow: 'hidden',
    width: '100%',
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  helperText: {
    color: '#697871',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: '#697871',
    fontSize: 15,
    paddingVertical: 20,
    textAlign: 'center',
  },
  linkText: {
    color: '#167D68',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelLink: {
    alignItems: 'center',
    padding: 10,
  },
  loader: {
    marginVertical: 12,
  },
});
