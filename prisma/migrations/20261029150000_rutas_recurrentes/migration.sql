-- AlterTable
ALTER TABLE "DeliveryRoute" ADD COLUMN "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "RouteSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "zoneId" TEXT,
    "driverId" TEXT,
    "vehicle" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteSchedule_active_weekday_idx" ON "RouteSchedule"("active", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRoute_scheduleId_date_key" ON "DeliveryRoute"("scheduleId", "date");

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "RouteSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSchedule" ADD CONSTRAINT "RouteSchedule_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSchedule" ADD CONSTRAINT "RouteSchedule_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
