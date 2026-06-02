const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

// Environment variables for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_aidlc_key_for_local_dev';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

class AuthService {
  async signUp(payload) {
    const email = payload?.email?.trim();
    const password = payload?.password;

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ApiError(400, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        // we can store company_name etc in profiles or extended fields if needed
      },
    });

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return {
      session: { access_token: token, refresh_token: null },
      user: { id: user.id, email: user.email },
    };
  }

  async signIn(payload) {
    const email = payload?.email?.trim();
    const password = payload?.password;

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    // Mock admin logic (preserve existing behavior)
    if ((email === 'admin@vfs.com' && password === 'admin123') || (email === 'dev@aidlc.ai' && password === 'dev123')) {
      // Upsert keyed on the unique `email`, not a hardcoded id — keying on a
      // fixed id collides whenever a row with this email already exists under a
      // different id (Unique constraint failed on `email`).
      const mockUser = await prisma.user.upsert({
        where: { email },
        update: { role: 'admin' },
        create: {
          email,
          password: await bcrypt.hash(password, 10),
          role: 'admin',
        },
      });
      // Issue a real JWT so getCurrentUser resolves the same user id consistently.
      const token = jwt.sign({ sub: mockUser.id, email: mockUser.email }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });
      return {
        session: { access_token: token, refresh_token: null },
        user: { id: mockUser.id, email: mockUser.email, role: mockUser.role },
      };
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid credentials');
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return {
      session: { access_token: token, refresh_token: null },
      user: { id: user.id, email: user.email },
    };
  }

  async getOAuthUrl(payload) {
    throw new ApiError(501, 'OAuth is not supported in local JWT authentication mode');
  }

  async getCurrentUser(accessToken) {
    if (!accessToken) {
      throw new ApiError(401, 'Missing access token');
    }

    // Backward compatibility for any session still holding the legacy static
    // token. New mock logins receive a real JWT (handled below).
    if (accessToken === 'mock-admin-token') {
      return { id: '00000000-0000-0000-0000-000000000000', email: 'admin@vfs.com', role: 'admin' };
    }

    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET);
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) {
        throw new ApiError(401, 'User not found');
      }
      return { id: user.id, email: user.email, role: user.role };
    } catch (err) {
      throw new ApiError(401, 'Invalid token');
    }
  }

  async requestPasswordReset(payload) {
    // Local password reset requires SMTP. For now, returning success or unsupported.
    throw new ApiError(501, 'Password reset is not implemented in local mode');
  }

  async updatePassword(accessToken, payload) {
    if (!accessToken) {
      throw new ApiError(401, 'Missing access token');
    }

    const password = payload?.password;
    if (!password || password.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }

    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET);
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.update({
        where: { id: decoded.sub },
        data: { password: hashedPassword },
      });

      return { user: { id: user.id, email: user.email } };
    } catch (err) {
      throw new ApiError(401, 'Invalid token');
    }
  }
}

module.exports = new AuthService();
