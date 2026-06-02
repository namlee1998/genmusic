describe('database config', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@prisma/client');
  });

  test('creates one Prisma client for local persistence', () => {
    const client = { user: { findUnique: jest.fn() } };
    const PrismaClient = jest.fn(() => client);
    jest.doMock('@prisma/client', () => ({ PrismaClient }));

    const prisma = require('../../src/config/database');

    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(prisma).toBe(client);
  });
});
