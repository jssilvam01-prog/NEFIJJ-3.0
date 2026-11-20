import * as SecureStore from 'expo-secure-store';

import { api, clearAccessTokens, storeAccessToken } from './api';

export async function login(username, password) {
  const response = await api.post('/auth/token/', { username, password });
  await storeAccessToken(response.data.access);
  await SecureStore.setItemAsync('refresh_token', response.data.refresh);
  return response.data.user;
}

export async function registerWithInvitation(account) {
  const response = await api.post('/auth/register/', account);
  await storeAccessToken(response.data.access);
  await SecureStore.setItemAsync('refresh_token', response.data.refresh);
  return response.data.user;
}

export async function getProfile() {
  const response = await api.get('/auth/me/');
  return response.data;
}

export async function changePassword(currentPassword, newPassword, confirmation) {
  await api.post('/auth/change-password/', {
    current_password: currentPassword,
    new_password: newPassword,
    new_password_confirm: confirmation,
  });
}

export async function acceptOrganizationInvitation(code) {
  const response = await api.post('/auth/invitations/accept/', { code });
  return response.data;
}

export async function logout() {
  await clearAccessTokens();
}
