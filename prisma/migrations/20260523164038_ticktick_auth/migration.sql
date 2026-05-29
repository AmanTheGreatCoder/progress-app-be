-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "linkedRecurringNames" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repeatFlag" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ticktickProjectId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TickTickAuth" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TickTickAuth_pkey" PRIMARY KEY ("id")
);
