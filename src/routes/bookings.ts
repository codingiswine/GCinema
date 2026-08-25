import { Router } from 'express';
import { Prisma, TicketCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireLogin } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

export const bookingsRouter = Router();

export const TICKET_PRICES: Record<TicketCategory, number> = {
  ADULT: 16000,
  TEEN: 14000,
  SENIOR: 9000,
  DISABLED: 8000,
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ADULT: '성인',
  TEEN: '청소년',
  SENIOR: '경로',
  DISABLED: '우대',
};

function seatLabels(rows: number, cols: number): string[] {
  const labels: string[] = [];
  for (let r = 0; r < rows; r++) {
    const rowLetter = String.fromCharCode(65 + r);
    for (let c = 1; c <= cols; c++) {
      labels.push(`${rowLetter}${c}`);
    }
  }
  return labels;
}

bookingsRouter.get('/showtimes/:id', asyncHandler(async (req, res) => {
  const showtimeId = Number(req.params.id);
  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: { movie: true, bookings: true },
  });
  if (!showtime) return res.status(404).send('상영 정보를 찾을 수 없습니다.');

  const booked = new Set(showtime.bookings.map((b) => b.seatLabel));
  const seats = seatLabels(showtime.rows, showtime.cols).map((label) => ({
    label,
    booked: booked.has(label),
  }));
  res.render('showtimeSeats', { showtime, seats, prices: TICKET_PRICES });
}));

bookingsRouter.post('/showtimes/:id/book', requireLogin, asyncHandler(async (req, res) => {
  const showtimeId = Number(req.params.id);
  const { seats, adultCount, teenCount, seniorCount, disabledCount } = req.body;

  const counts: Record<TicketCategory, number> = {
    ADULT: Number(adultCount) || 0,
    TEEN: Number(teenCount) || 0,
    SENIOR: Number(seniorCount) || 0,
    DISABLED: Number(disabledCount) || 0,
  };
  const totalTickets = counts.ADULT + counts.TEEN + counts.SENIOR + counts.DISABLED;

  if (!Array.isArray(seats) || seats.length === 0 || totalTickets === 0) {
    return res.status(400).json({ error: '관람인원과 좌석을 선택해주세요.' });
  }
  if (seats.length !== totalTickets) {
    return res.status(400).json({ error: '선택한 좌석 수와 관람인원 수가 일치하지 않습니다.' });
  }

  const categoryBySeat: TicketCategory[] = [
    ...Array(counts.ADULT).fill('ADULT' as TicketCategory),
    ...Array(counts.TEEN).fill('TEEN' as TicketCategory),
    ...Array(counts.SENIOR).fill('SENIOR' as TicketCategory),
    ...Array(counts.DISABLED).fill('DISABLED' as TicketCategory),
  ];
  const totalPrice = categoryBySeat.reduce((sum, c) => sum + TICKET_PRICES[c], 0);

  try {
    await prisma.$transaction(
      (seats as string[]).map((seatLabel, i) =>
        prisma.booking.create({
          data: {
            showtimeId,
            seatLabel,
            userId: req.session.userId!,
            category: categoryBySeat[i],
            price: TICKET_PRICES[categoryBySeat[i]],
          },
        })
      )
    );
    res.json({ ok: true, totalPrice });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: '이미 예약된 좌석이 포함되어 있습니다.' });
    }
    throw err;
  }
}));

bookingsRouter.get('/bookings', requireLogin, asyncHandler(async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: req.session.userId! },
    include: { showtime: { include: { movie: true } } },
    orderBy: { bookedAt: 'desc' },
  });
  res.render('bookings', { bookings, categoryLabels: CATEGORY_LABELS });
}));
