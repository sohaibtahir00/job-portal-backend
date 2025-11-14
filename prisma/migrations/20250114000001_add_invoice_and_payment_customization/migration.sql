-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('UPFRONT_PAYMENT', 'REMAINING_PAYMENT', 'FULL_PAYMENT', 'REFUND');

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "remainingPercentage" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "remainingPaymentMethod" TEXT,
ADD COLUMN     "remainingTransactionId" TEXT,
ADD COLUMN     "upfrontPaymentMethod" TEXT,
ADD COLUMN     "upfrontPercentage" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "upfrontTransactionId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "invoiceType" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripePaymentId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlContent" TEXT,
    "pdfUrl" TEXT,
    "feePercentage" DOUBLE PRECISION NOT NULL,
    "upfrontPercentage" DOUBLE PRECISION NOT NULL,
    "remainingPercentage" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_placementId_idx" ON "Invoice"("placementId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_invoiceType_idx" ON "Invoice"("invoiceType");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
