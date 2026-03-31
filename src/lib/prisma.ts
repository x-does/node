import { PrismaClient } from '@prisma/client';

function buildDatabaseUrlFromLegacyEnv() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '3306';
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!host || !name || !user || !password) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedName = encodeURIComponent(name);

  return `mysql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedName}`;
}

if (!process.env.DATABASE_URL) {
  const legacyDatabaseUrl = buildDatabaseUrlFromLegacyEnv();

  if (legacyDatabaseUrl) {
    process.env.DATABASE_URL = legacyDatabaseUrl;
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
