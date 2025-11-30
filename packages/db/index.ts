import { PrismaLibSql } from '@prisma/adapter-libsql';
import path from 'path';
import { PrismaClient } from './prisma/generated/client';

const dbPath = path.join(import.meta.dir, 'mydb.db');

const adapter = new PrismaLibSql({
  url: `file:${dbPath}`,
});

const prisma = new PrismaClient({ adapter });

export * from './prisma/generated/client';
export { prisma };

