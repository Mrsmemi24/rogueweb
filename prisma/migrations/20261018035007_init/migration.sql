-- CreateTable
CREATE TABLE "MatchHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "levelReached" INTEGER NOT NULL,
    "enemiesDefeated" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "inventory" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchHistory_playerId_idx" ON "MatchHistory"("playerId");

-- CreateIndex
CREATE INDEX "MatchHistory_createdAt_idx" ON "MatchHistory"("createdAt");

-- CreateIndex
CREATE INDEX "MatchHistory_levelReached_idx" ON "MatchHistory"("levelReached");
