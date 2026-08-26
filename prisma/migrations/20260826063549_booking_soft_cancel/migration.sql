-- 예매 취소를 하드 삭제 대신 소프트 삭제(cancelledAt)로 바꾼다.
-- 취소 이력도 DB에 남겨서 나중에 고객 관리·마케팅 분석(취소율, 재예매 패턴 등)에
-- 쓸 수 있게 하기 위함.

-- AddColumn
ALTER TABLE "Booking" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- DropIndex: 기존 단순 유니크 제약은 취소된 행도 그대로 자리를 차지해
-- 같은 좌석 재예매를 막아버리므로 제거한다.
DROP INDEX "Booking_showtimeId_seatLabel_key";

-- CreateIndex: 일반 조회 성능용 (취소 여부와 무관하게 회차/좌석으로 찾을 때).
CREATE INDEX "Booking_showtimeId_seatLabel_idx" ON "Booking"("showtimeId", "seatLabel");

-- CreateIndex: 실제 중복 예매 방지는 "취소되지 않은" 행끼리만 걸리는 부분
-- 유니크 인덱스가 담당한다. Prisma 스키마는 조건부 유니크 제약을 표현할 수
-- 없어 이 인덱스는 schema.prisma에는 보이지 않는다.
CREATE UNIQUE INDEX "Booking_active_seat_key" ON "Booking"("showtimeId", "seatLabel") WHERE "cancelledAt" IS NULL;
