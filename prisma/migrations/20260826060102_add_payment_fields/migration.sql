-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'KAKAO_PAY', 'NAVER_PAY', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "reservationNo" TEXT;

-- CreateIndex
CREATE INDEX "Booking_reservationNo_idx" ON "Booking"("reservationNo");
