// I1: the prisma datasource now reads DATABASE_URL (env-driven). The runtime
// prisma client does not load .env, so guarantee a value for the test process.
// Defaults to the existing local dev.db (so test behaviour is unchanged) unless
// the runner/CI already pointed DATABASE_URL at an isolated sqlite file.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
