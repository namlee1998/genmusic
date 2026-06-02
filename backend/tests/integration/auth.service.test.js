const mockFindUnique = jest.fn();
const mockVerify = jest.fn();

jest.mock('../../src/config/database', () => ({
  user: {
    findUnique: mockFindUnique,
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: mockVerify,
  sign: jest.fn(),
}));

const AuthService = require('../../src/services/AuthService');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resolves the current local JWT user from Prisma', async () => {
    mockVerify.mockReturnValue({ sub: 'user-1' });
    mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'dev@example.com', role: 'member' });

    await expect(AuthService.getCurrentUser('access-token')).resolves.toEqual({
      id: 'user-1',
      email: 'dev@example.com',
      role: 'member',
    });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  test('rejects an invalid local JWT', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    await expect(AuthService.getCurrentUser('bad-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid token',
    });
  });
});
