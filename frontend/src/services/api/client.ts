import axios from 'axios';

import { clearStoredAuthSession, getStoredAuthSession } from './authStorage';

export const getBaseURL = () => {
  // Production: use env variable
  // Development: use relative path (proxied by Vite)
  return import.meta.env.VITE_API_URL || '/api/v1';
};

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const session = getStoredAuthSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message = error.response?.data?.message ?? error.message ?? 'Unknown error';
    console.error('[API Error]', message, error.response?.status);

    if (error.response?.status === 401) {
      clearStoredAuthSession();
      if (window.location.pathname.startsWith('/sdlc')) {
        window.location.href = '/auth';
      }
    }

    return Promise.reject(error);
  },
);

export default api;
