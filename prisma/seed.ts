
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const target = 10_000;
  const current = await prisma.matchHistory.count();
  const missing = Math.max(0, target - current);

  if (missing === 0) {
    console.log(`Ya existen ${current} partidas. No se insertaron registros.`);
    return;
  }

  console.log(`Existen ${current} partidas. Insertando ${missing} registros...`);

  const results = ["victory", "defeat", "abandoned"] as const;

  for (let start = 0; start < missing; start += 500) {
    const batchSize = Math.min(500, missing - start);

    await prisma.matchHistory.createMany({
      data: Array.from({ length: batchSize }, (_, index) => {
        const number = current + start + index + 1;

        return {
          playerId: `seed-player-${((number - 1) % 1000) + 1}`,
          playerName: `Jugador de prueba ${((number - 1) % 1000) + 1}`,
          levelReached: 1 + (number % 20),
          enemiesDefeated: number % 31,
          durationSeconds: 60 + (number % 3600),
          inventory: {
            items: number % 5 === 0 ? ["potion"] : [],
            seedRecord: true,
          },
          result: results[number % results.length],
        };
      }),
    });
  }

  const total = await prisma.matchHistory.count();
  console.log(`Seed terminado. Total de partidas: ${total}`);
}

main()
  .catch((error) => {
    console.error("Error ejecutando el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
