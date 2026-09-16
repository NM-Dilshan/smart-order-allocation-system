-- Store classifier results independently of orders and inventory.
CREATE TABLE "CustomerInquiry" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "predictedCategory" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerInquiry_userId_id_idx" ON "CustomerInquiry"("userId", "id");

ALTER TABLE "CustomerInquiry" ADD CONSTRAINT "CustomerInquiry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
