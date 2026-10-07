-- Agente IA de WhatsApp (DAIC-13 · CD-4)
-- Rol de sistema para el agente, teléfono normalizado en contactos y el
-- historial de conversaciones que alimenta la interfaz de supervisión.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AGENTE_IA';

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('BOT', 'HUMANO', 'CERRADA');

-- CreateEnum
CREATE TYPE "DisqualificationReason" AS ENUM ('FUERA_DE_COBERTURA', 'SIN_NEGOCIO', 'OTRO');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('ENTRANTE', 'SALIENTE');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CLIENTE', 'AGENTE_IA', 'ASESOR');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXTO', 'AUDIO', 'IMAGEN', 'DOCUMENTO', 'INTERACTIVO', 'PLANTILLA');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "whatsappE164" TEXT;

-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'BOT',
    "assignedUserId" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "marketingConsentAt" TIMESTAMP(3),
    "optOutAt" TIMESTAMP(3),
    "disqualifiedReason" "DisqualificationReason",
    "disqualifiedAt" TIMESTAMP(3),
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "waMessageId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "authorUserId" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXTO',
    "body" TEXT,
    "mediaPath" TEXT,
    "mediaMime" TEXT,
    "mediaSizeBytes" INTEGER,
    "deliveryStatus" TEXT,
    "agentTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_whatsappE164_idx" ON "Contact"("whatsappE164");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_phone_key" ON "WhatsappConversation"("phone");

-- CreateIndex
CREATE INDEX "WhatsappConversation_status_lastMessageAt_idx" ON "WhatsappConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsappConversation_clientId_idx" ON "WhatsappConversation"("clientId");

-- CreateIndex
CREATE INDEX "WhatsappConversation_assignedUserId_idx" ON "WhatsappConversation"("assignedUserId");

-- CreateIndex
CREATE INDEX "WhatsappConversation_nextFollowUpAt_idx" ON "WhatsappConversation"("nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_waMessageId_key" ON "WhatsappMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_conversationId_createdAt_idx" ON "WhatsappMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
