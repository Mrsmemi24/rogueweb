ALTER TABLE "MatchHistory"
ADD COLUMN "matchId" TEXT;

CREATE UNIQUE INDEX "MatchHistory_matchId_playerId_key"
ON "MatchHistory"("matchId", "playerId");
