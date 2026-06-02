require('dotenv').config();

const normalizeBaseUrl = (url, fallback) => {
  const value = (url || fallback || '').trim();
  return value.replace(/\/+$/, '');
};

const frontendUrl = normalizeBaseUrl(process.env.FRONTEND_URL, 'http://localhost:5173');
const defaultAuthRedirectUrl = `${frontendUrl}/auth`;

const config = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || 'documents',
  SUPABASE_AVATAR_BUCKET: process.env.SUPABASE_AVATAR_BUCKET || 'avatars',
  SUPABASE_AUTH_REDIRECT_URL:
    normalizeBaseUrl(process.env.SUPABASE_AUTH_REDIRECT_URL, defaultAuthRedirectUrl),

  // AI Agents
  AGENTS_BASE_URL: process.env.AGENTS_BASE_URL || 'http://127.0.0.1:8001',
  FRONTEND_URL: frontendUrl,

  // Upload limits
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB

  // Admin JWT (separate from Supabase user auth)
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || 'change-me-in-production',
  ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
};

module.exports = config;
