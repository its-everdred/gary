-- CreateEnum
CREATE TYPE "NomineeState" AS ENUM ('ACTIVE', 'DISCUSSION', 'VOTE', 'CERTIFY', 'PAST');

-- CreateTable
CREATE TABLE "Warn" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "voterHash" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nominee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "NomineeState" NOT NULL,
    "nominator" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discussionStart" TIMESTAMP(3),
    "voteStart" TIMESTAMP(3),
    "certifyStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discussionChannelId" TEXT,
    "voteChannelId" TEXT,
    "votePollMessageId" TEXT,
    "voteGovernanceAnnounced" BOOLEAN NOT NULL DEFAULT false,
    "voteYesCount" INTEGER NOT NULL DEFAULT 0,
    "voteNoCount" INTEGER NOT NULL DEFAULT 0,
    "votePassed" BOOLEAN,
    "botMessageIds" TEXT,
    "announcementMessageIds" TEXT,

    CONSTRAINT "Nominee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warn_guildId_targetUserId_voterHash_key" ON "Warn"("guildId", "targetUserId", "voterHash");

-- CreateIndex
CREATE INDEX "Warn_guildId_targetUserId_idx" ON "Warn"("guildId", "targetUserId");

-- CreateIndex
CREATE INDEX "Nominee_guildId_state_idx" ON "Nominee"("guildId", "state");

-- CreateIndex
CREATE INDEX "Nominee_guildId_discussionStart_idx" ON "Nominee"("guildId", "discussionStart");

-- CreateIndex
CREATE INDEX "Nominee_guildId_voteStart_idx" ON "Nominee"("guildId", "voteStart");

-- CreateIndex
CREATE INDEX "Nominee_guildId_certifyStart_idx" ON "Nominee"("guildId", "certifyStart");