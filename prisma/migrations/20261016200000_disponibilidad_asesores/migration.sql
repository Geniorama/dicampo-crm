-- Disponibilidad de visitas por asesor: franjas semanales, ausencias y
-- parametros de la agenda. Las visitas siguen siendo actividades VISITA.

-- CreateTable
CREATE TABLE "AdvisorSchedule" (
    "userId" TEXT NOT NULL,
    "acceptsVisits" BOOLEAN NOT NULL DEFAULT true,
    "visitMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "minLeadDays" INTEGER NOT NULL DEFAULT 1,
    "maxDaysAhead" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorSchedule_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityWindow_userId_weekday_idx" ON "AvailabilityWindow"("userId", "weekday");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_userId_endsAt_idx" ON "AvailabilityBlock"("userId", "endsAt");

-- AddForeignKey
ALTER TABLE "AdvisorSchedule" ADD CONSTRAINT "AdvisorSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdvisorSchedule"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdvisorSchedule"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

