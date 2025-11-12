-- CreateTable
CREATE TABLE IF NOT EXISTS "ProfileView" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "jobId" TEXT,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileView_candidateId_idx" ON "ProfileView"("candidateId");

-- CreateIndex
CREATE INDEX "ProfileView_employerId_idx" ON "ProfileView"("employerId");

-- CreateIndex
CREATE INDEX "ProfileView_viewedAt_idx" ON "ProfileView"("viewedAt");

-- CreateIndex
CREATE INDEX "ProfileView_jobId_idx" ON "ProfileView"("jobId");

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
