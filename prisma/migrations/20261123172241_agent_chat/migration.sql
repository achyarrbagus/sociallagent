-- CreateTable
CREATE TABLE "chat_thread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_thread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_thread_organizationId_idx" ON "chat_thread"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_thread_userId_agentId_key" ON "chat_thread"("userId", "agentId");

-- AddForeignKey
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
