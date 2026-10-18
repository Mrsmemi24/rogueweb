import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  rogueWebPrisma?: PrismaClient;
};

export function getPrismaClient() {
  if (globalForPrisma.rogueWebPrisma) {
    return globalForPrisma.rogueWebPrisma;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.rogueWebPrisma = prisma;
  }

  return prisma;
}
