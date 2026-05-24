-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedMin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minVersion" TEXT NOT NULL DEFAULT '';
