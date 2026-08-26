-- CreateIndex
CREATE INDEX "Booking_userId_cancelledAt_idx" ON "Booking"("userId", "cancelledAt");

-- CreateIndex
CREATE INDEX "Showtime_movieId_startAt_idx" ON "Showtime"("movieId", "startAt");
