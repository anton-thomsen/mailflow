-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'live', 'paused');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('active', 'completed', 'stopped', 'failed');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'accepted', 'failed');

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "recipientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'active',
    "cursor" TEXT,
    "dueAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEntry" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "stepId" TEXT,
    "detail" TEXT NOT NULL,

    CONSTRAINT "RunEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "templateSlug" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_slug_key" ON "Workflow"("slug");

-- CreateIndex
CREATE INDEX "Run_status_dueAt_idx" ON "Run"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Run_recipientId_idx" ON "Run"("recipientId");

-- CreateIndex
CREATE INDEX "RunEntry_runId_at_idx" ON "RunEntry"("runId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_runId_stepId_key" ON "Delivery"("runId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEntry" ADD CONSTRAINT "RunEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active run per workflow and recipient: a repeated trigger event must not start a second sequence.
CREATE UNIQUE INDEX "Run_one_active_per_recipient" ON "Run"("workflowId", "recipientId") WHERE "status" = 'active';
