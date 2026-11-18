import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const baseURL = process.env.EXPO_PUBLIC_API_URL;

export const api = axios.create({ baseURL });

let refreshRequest;
let cachedAccessToken = null;

export async function storeAccessToken(token) {
  cachedAccessToken = token;
  await SecureStore.setItemAsync('access_token', token);
}

export async function getCurrentAccessToken() {
  if (!cachedAccessToken) {
    cachedAccessToken = await SecureStore.getItemAsync('access_token');
  }
  return cachedAccessToken;
}

export function getCachedAccessToken() {
  return cachedAccessToken;
}

export async function clearAccessTokens() {
  cachedAccessToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync('access_token'),
    SecureStore.deleteItemAsync('refresh_token'),
  ]);
}

api.interceptors.request.use(async (config) => {
  const accessToken = await getCurrentAccessToken();
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const requestUrl = request && request.url ? request.url : '';
    const isAuthRequest = (
      requestUrl.includes('/auth/token/') ||
      requestUrl.includes('/auth/token/refresh/')
    );
    if (error.response?.status !== 401 || !request || request._retry || isAuthRequest) {
      return Promise.reject(error);
    }

    request._retry = true;
    const refreshToken = await SecureStore.getItemAsync('refresh_token');
    if (!refreshToken) {
      return Promise.reject(error);
    }

    try {
      if (!refreshRequest) {
        refreshRequest = axios.post(`${baseURL}/auth/token/refresh/`, { refresh: refreshToken })
          .then(async (response) => {
            await storeAccessToken(response.data.access);
            return response.data.access;
          })
          .finally(() => {
            refreshRequest = undefined;
          });
      }
      const accessToken = await refreshRequest;
      request.headers = request.headers || {};
      request.headers.Authorization = `Bearer ${accessToken}`;
      return api(request);
    } catch (refreshError) {
      await clearAccessTokens();
      return Promise.reject(refreshError);
    }
  },
);
