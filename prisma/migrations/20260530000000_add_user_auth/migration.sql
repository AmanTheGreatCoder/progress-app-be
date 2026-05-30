-- CreateTable User
CREATE TABLE IF NOT EXISTS "User" (
  "id"        TEXT NOT NULL,
  "googleId"  TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "picture"   TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"    ON "User"("email");

-- Add userId to Task and Goal (nullable so existing rows are unaffected)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "userId" TEXT;
