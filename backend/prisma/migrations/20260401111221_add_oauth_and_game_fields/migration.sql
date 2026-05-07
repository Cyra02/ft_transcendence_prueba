/*
  Warnings:

  - A unique constraint covering the columns `[oauthId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_player2Id_fkey";

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "board" TEXT NOT NULL DEFAULT '_________',
ADD COLUMN     "customRules" JSONB,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "isVsAI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'waiting',
ADD COLUMN     "winner" TEXT,
ALTER COLUMN "player2Id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "oauthId" TEXT,
ADD COLUMN     "oauthProvider" TEXT,
ADD COLUMN     "password" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_oauthId_key" ON "User"("oauthId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
