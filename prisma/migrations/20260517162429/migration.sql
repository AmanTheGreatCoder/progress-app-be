-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetFrequency" INTEGER NOT NULL,
    "priority" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "linkedTaskIds" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalLog" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "effortMinutes" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "GoalLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GoalLog" ADD CONSTRAINT "GoalLog_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
