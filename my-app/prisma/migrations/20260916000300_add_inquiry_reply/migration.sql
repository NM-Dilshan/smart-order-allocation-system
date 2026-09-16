CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "CustomerInquiry"
    ADD COLUMN "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    ADD COLUMN "adminReply" TEXT,
    ADD COLUMN "repliedAt" TIMESTAMP(3),
    ADD COLUMN "repliedById" INTEGER;

ALTER TABLE "CustomerInquiry" ADD CONSTRAINT "CustomerInquiry_repliedById_fkey"
    FOREIGN KEY ("repliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
