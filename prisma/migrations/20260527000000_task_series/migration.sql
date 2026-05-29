-- CreateTable TaskSeries
-- Persists one row per unique recurring task name (normalized to lowercase).
-- Rebuilt from the Task table on every sync.
CREATE TABLE "TaskSeries" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "tags"      TEXT NOT NULL DEFAULT '',
    "firstSeen" TEXT NOT NULL DEFAULT '',
    "lastSeen"  TEXT NOT NULL DEFAULT '',
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskSeries_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "TaskSeries_nameLower_key" UNIQUE ("nameLower")
);

-- CreateTable GoalSeries (join table: one row per goal↔series link)
CREATE TABLE "GoalSeries" (
    "id"       TEXT NOT NULL,
    "goalId"   TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    CONSTRAINT "GoalSeries_pkey"              PRIMARY KEY ("id"),
    CONSTRAINT "GoalSeries_goalId_seriesId_key" UNIQUE ("goalId", "seriesId"),
    CONSTRAINT "GoalSeries_goalId_fkey"   FOREIGN KEY ("goalId")   REFERENCES "Goal"("id")       ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoalSeries_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
