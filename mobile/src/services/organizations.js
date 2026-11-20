import { api } from './api';

export async function getOrganizationLocations(includeInactive = false) {
  const response = await api.get('/locations/', {
    params: includeInactive ? { include_inactive: 'true' } : {},
  });
  return response.data;
}

export async function getManagedOrganizations() {
  const response = await api.get('/auth/my-organizations/');
  return response.data;
}

export async function createOrganizationLocation(location) {
  const response = await api.post('/locations/', location);
  return response.data;
}

export async function setOrganizationLocationStatus(locationId, isActive) {
  const response = await api.patch(`/locations/${locationId}/`, { is_active: isActive });
  return response.data;
}

export async function getOrganizationInvitations() {
  const response = await api.get('/auth/organization-invitations/');
  return response.data;
}

export async function createOrganizationInvitation(locationId) {
  const response = await api.post('/auth/organization-invitations/', {
    location_id: locationId,
  });
  return response.data;
}

export async function getOrganizationInvitationCode(invitationId) {
  const response = await api.post(`/auth/organization-invitations/${invitationId}/reveal/`);
  return response.data;
}

export async function revokeOrganizationInvitation(invitationId) {
  await api.post(`/auth/organization-invitations/${invitationId}/revoke/`);
}

export async function getOrganizations() {
  const response = await api.get('/organizations/');
  return response.data;
}

export async function createOrganization(name) {
  const response = await api.post('/organizations/', { name });
  return response.data;
}

export async function setOrganizationStatus(organizationId, status) {
  const response = await api.patch(`/organizations/${organizationId}/`, { status });
  return response.data;
}

export async function getOrganizationAdmins() {
  const response = await api.get('/auth/organization-admins/');
  return response.data;
}

export async function createOrganizationAdmin(account) {
  const response = await api.post('/auth/organization-admins/', account);
  return response.data;
}

export async function setOrganizationAdminStatus(userId, organizationId, isActive) {
  const response = await api.patch(`/auth/organization-admins/${userId}/`, {
    organization_id: organizationId,
    is_active: isActive,
  });
  return response.data;
}

export async function deleteOrganizationAdmin(userId) {
  await api.delete(`/auth/organization-admins/${userId}/`);
}

export async function resetOrganizationAdminPassword(userId, newPassword, newPasswordConfirm) {
  const response = await api.put(`/auth/organization-admins/${userId}/`, {
    new_password: newPassword,
    new_password_confirm: newPasswordConfirm || newPassword,
  });
  return response.data;
}

export async function getTechnicians() {
  const response = await api.get('/auth/technicians/');
  return response.data;
}

export async function createTechnician(account) {
  const response = await api.post('/auth/technicians/', account);
  return response.data;
}

export async function setTechnicianStatus(userId, isActive) {
  const response = await api.patch(`/auth/technicians/${userId}/`, { is_active: isActive });
  return response.data;
}

export async function resetTechnicianPassword(userId, newPassword, newPasswordConfirm) {
  const response = await api.put(`/auth/technicians/${userId}/password/`, {
    new_password: newPassword,
    new_password_confirm: newPasswordConfirm,
  });
  return response.data;
}

export async function getOrganizationUsers() {
  const response = await api.get('/auth/users/');
  return response.data;
}

export async function resetOrganizationUserPassword(userId, newPassword, newPasswordConfirm) {
  const response = await api.put(`/auth/users/${userId}/password/`, {
    new_password: newPassword,
    new_password_confirm: newPasswordConfirm,
  });
  return response.data;
}
