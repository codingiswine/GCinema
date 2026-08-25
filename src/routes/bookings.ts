import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireLogin } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

export const bookingsRouter = Router();

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
  res.render('showtimeSeats', { showtime, seats, error: req.query.error || null });
}));

bookingsRouter.post('/showtimes/:id/book', requireLogin, asyncHandler(async (req, res) => {
  const showtimeId = Number(req.params.id);
  const { seatLabel } = req.body;

  try {
    await prisma.booking.create({
      data: { showtimeId, seatLabel, userId: req.session.userId! },
    });
    res.redirect('/bookings');
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const showtime = await prisma.showtime.findUnique({
        where: { id: showtimeId },
        include: { movie: true, bookings: true },
      });
      const booked = new Set(showtime!.bookings.map((b) => b.seatLabel));
      const seats = seatLabels(showtime!.rows, showtime!.cols).map((label) => ({
        label,
        booked: booked.has(label),
      }));
      return res
        .status(409)
        .render('showtimeSeats', { showtime, seats, error: '이미 예약된 좌석입니다.' });
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
  res.render('bookings', { bookings });
}));
