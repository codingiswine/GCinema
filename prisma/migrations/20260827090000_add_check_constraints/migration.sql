-- 값의 범위처럼 "항상 참이어야 하는 규칙"은 애플리케이션뿐 아니라 DB에서도
-- 막는다. 라우트 검증만 두면 시드·배치·수동 SQL처럼 앱을 거치지 않는 경로로
-- 얼마든지 잘못된 값이 들어올 수 있다. 이 프로젝트가 중복 예매를 부분 유니크
-- 인덱스로 막는 것과 같은 이유다.
--
-- Prisma 스키마 문법은 CHECK 제약을 표현하지 못해 SQL로 직접 추가한다.

-- 평점은 1~5점. rating이 NULL이면(평점 없이 일기만 쓴 경우) 제약을 건너뛴다.
ALTER TABLE "MovieReview"
  ADD CONSTRAINT "MovieReview_rating_range" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));

-- 결제 금액은 음수가 될 수 없다.
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_price_non_negative" CHECK ("price" >= 0);

-- 좌석 그리드는 최소 1석 이상이어야 하고, 한 줄 좌석수도 1 이상이어야 한다.
-- (0이면 seatLabels()가 좌석을 만들지 못하거나 무한 루프에 빠진다)
ALTER TABLE "Showtime"
  ADD CONSTRAINT "Showtime_seats_positive" CHECK ("totalSeats" > 0 AND "cols" > 0);

-- 결제 이탈 추적 금액도 음수가 될 수 없다.
ALTER TABLE "CheckoutAttempt"
  ADD CONSTRAINT "CheckoutAttempt_total_non_negative" CHECK ("totalPrice" >= 0);
