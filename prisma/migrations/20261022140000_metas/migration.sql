-- CreateTable
CREATE TABLE "SalesGoal" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "salesTarget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "newClientsTarget" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesGoal_scopeKey_key" ON "SalesGoal"("scopeKey");

-- CreateIndex
CREATE INDEX "SalesGoal_month_idx" ON "SalesGoal"("month");

-- AddForeignKey
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

