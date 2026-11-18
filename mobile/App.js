import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
} from './src/services/auth';
import {
  createIncident,
  createCategory,
  getCategories,
  getCategoryRoutes,
  getIncidents,
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
  getOrganizationLocations,
  getOrganizations,
  getTechnicians,
  resetOrganizationAdminPassword,
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
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};
const PRIORITY_LABELS = Object.fromEntries(PRIORITIES.map(({ value, label }) => [value, label]));
const NEXT_STATUS = {
  pendiente: 'en_proceso',
  en_proceso: 'resuelto',
};

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
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessageText] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      if (!needsOrganization) await loadDashboard();
    } catch (error) {
      setErrorMessageText(`No se pudo restaurar la sesión: ${getErrorMessage(error)}`);
    }
  }

  async function loadDashboard() {
    setLoading(true);
    setErrorMessageText('');
    try {
      const [incidentRows, categoryRows] = await Promise.all([
        getIncidents(),
        getCategories(),
      ]);
      setIncidents(incidentRows);
      setCategories(categoryRows);
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
      if (!needsOrganization) await loadDashboard();
    } catch (error) {
      setErrorMessageText(`No se pudo iniciar sesión: ${getErrorMessage(error)}`);
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

  async function changeStatus(incidentId, status) {
    setLoading(true);
    setErrorMessageText('');
    try {
      await updateIncidentStatus(incidentId, status);
      await loadDashboard();
    } catch (error) {
      setErrorMessageText(`No se pudo actualizar la incidencia: ${getErrorMessage(error)}`);
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
      await loadDashboard();
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {screen === 'login' ? (
          <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled">
            <Text style={styles.brand}>NEFIJJ</Text>
            <Text style={styles.subtitle}>Gestión de incidencias</Text>
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
            <Text style={styles.helperText}>
              Las cuentas las habilita el administrador de la organización.
            </Text>
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
          </ScrollView>
        ) : (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>NEFIJJ</Text>
                <Text style={styles.headerSubtitle}>
                  {user && `${user.username} · ${ROLE_LABELS[user.role] || user.role}`}
                </Text>
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                    {incident.evidence_image ? (
                      <EvidenceThumbnail uri={incident.evidence_image} />
                    ) : null}
                    {user && (
                      (user.role === 'technician' && incident.assigned_to === user.username) ||
                      user.role === 'organization_admin'
                    ) && NEXT_STATUS[incident.status] ? (
                      <View style={styles.statusActions}>
                        <Pressable
                          onPress={() => changeStatus(incident.id, NEXT_STATUS[incident.status])}
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                  Cada código se guarda como hash, vence en siete días hábiles y solo se muestra al crearlo.
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                  </View>
                ))}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
                {loading ? <ActivityIndicator color="#155eef" style={styles.loader} /> : null}
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
    backgroundColor: '#f5f7fb',
  },
  fill: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#f5f7fb',
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    color: '#155eef',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#475467',
    fontSize: 17,
    marginBottom: 32,
    marginTop: 8,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#e4e7ec',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerTitle: {
    color: '#155eef',
    fontSize: 21,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#475467',
    fontSize: 12,
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
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  headerButtonText: {
    color: '#155eef',
    fontWeight: '600',
  },
  content: {
    gap: 12,
    padding: 18,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#101828',
    fontSize: 24,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    borderColor: '#e4e7ec',
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  formGroup: {
    gap: 10,
  },
  cardTitle: {
    color: '#101828',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    paddingRight: 8,
  },
  status: {
    color: '#175cd3',
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    color: '#667085',
    fontSize: 12,
  },
  bodyText: {
    color: '#344054',
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#d0d5dd',
    borderRadius: 9,
    borderWidth: 1,
    color: '#101828',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  multilineInput: {
    minHeight: 120,
    paddingTop: 13,
  },
  label: {
    color: '#344054',
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
    backgroundColor: '#fff',
    borderColor: '#d0d5dd',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  selectedChoice: {
    backgroundColor: '#eff4ff',
    borderColor: '#155eef',
  },
  choiceText: {
    color: '#344054',
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#155eef',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  dangerButton: {
    backgroundColor: '#fff',
    borderColor: '#fda29b',
  },
  dangerButtonText: {
    color: '#b42318',
  },
  adminCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#eaecf0',
    borderRadius: 8,
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
    backgroundColor: '#fff',
    borderColor: '#d0d5dd',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  outlineButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d0d5dd',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  outlineButtonText: {
    color: '#344054',
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
    borderRadius: 8,
    height: 190,
    marginTop: 4,
    width: '100%',
  },
  camera: {
    borderRadius: 12,
    height: 300,
    overflow: 'hidden',
    width: '100%',
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 18,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  helperText: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: '#667085',
    fontSize: 15,
    paddingVertical: 20,
    textAlign: 'center',
  },
  linkText: {
    color: '#155eef',
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
