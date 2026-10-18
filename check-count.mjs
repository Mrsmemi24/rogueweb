
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  const total = await prisma.matchHistory.count();
  console.log(`Total de partidas guardadas: ${total}`);
  console.log(`Faltan para 10,000: ${Math.max(0, 10000 - total)}`);
} catch (error) {
  console.error("Error al consultar la base de datos:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
