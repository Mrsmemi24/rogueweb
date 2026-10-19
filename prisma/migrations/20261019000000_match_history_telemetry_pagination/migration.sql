DROP INDEX "MatchHistory_playerId_idx";

CREATE INDEX "MatchHistory_playerId_createdAt_id_idx"
ON "MatchHistory"("playerId", "createdAt" DESC, "id" DESC);
