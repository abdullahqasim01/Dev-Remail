-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL DEFAULT '[]',
    "cc" TEXT NOT NULL DEFAULT '[]',
    "bcc" TEXT NOT NULL DEFAULT '[]',
    "replyTo" TEXT NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL DEFAULT '',
    "html" TEXT,
    "text" TEXT,
    "headers" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "messageId" TEXT NOT NULL,
    "lastEvent" TEXT NOT NULL DEFAULT 'delivered',
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderInboxId" TEXT,
    CONSTRAINT "Email_senderInboxId_fkey" FOREIGN KEY ("senderInboxId") REFERENCES "Inbox" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Delivery_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Delivery_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT NOT NULL,
    "filename" TEXT,
    "contentType" TEXT NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'attachment',
    "contentId" TEXT,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    CONSTRAINT "Attachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "webhookEvents" TEXT NOT NULL DEFAULT 'email.sent,email.delivered,email.bounced,email.complained,email.received',
    "webhookActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "emailId" TEXT,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" DATETIME
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Inbox_address_key" ON "Inbox"("address");

-- CreateIndex
CREATE INDEX "Email_direction_createdAt_idx" ON "Email"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_inboxId_idx" ON "Delivery"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_emailId_inboxId_key" ON "Delivery"("emailId", "inboxId");

-- CreateIndex
CREATE INDEX "Attachment_emailId_idx" ON "Attachment"("emailId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");
