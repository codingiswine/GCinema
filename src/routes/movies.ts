import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const moviesRouter = Router();

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDateOptions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return {
      key: dateKey(d),
      day: d.getDate(),
      weekday: i === 0 ? '오늘' : WEEKDAYS[d.getDay()],
      isSat: d.getDay() === 6,
      isSun: d.getDay() === 0,
    };
  });
}

moviesRouter.get('/movies', asyncHandler(async (_req, res) => {
  const movies = await prisma.movie.findMany({ orderBy: { id: 'asc' } });
  res.render('movies', { movies });
}));

// Detail page: hero image + synopsis, reached by clicking a poster. Shows
// the date strip too so the reservation button always has a date selected.
moviesRouter.get('/movies/:id/detail', asyncHandler(async (req, res) => {
  const movieId = Number(req.params.id);
  const movie = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!movie) return res.status(404).send('영화를 찾을 수 없습니다.');

  const dateOptions = buildDateOptions();
  res.render('movieDetail', { movie, dateOptions });
}));

// Unified schedule page: pick a movie from the sidebar and a date from the
// strip without leaving the page (each click is a normal link, so it works
// without client-side JS and keeps the movie/date selection in the URL).
moviesRouter.get('/movies/:id', asyncHandler(async (req, res) => {
  const movieId = Number(req.params.id);
  const [movies, movie] = await Promise.all([
    prisma.movie.findMany({ orderBy: { id: 'asc' } }),
    prisma.movie.findUnique({ where: { id: movieId } }),
  ]);
  if (!movie) return res.status(404).send('영화를 찾을 수 없습니다.');

  const dateOptions = buildDateOptions();
  const requestedKey = typeof req.query.date === 'string' ? req.query.date : '';
  const selectedKey = dateOptions.some((d) => d.key === requestedKey) ? requestedKey : dateOptions[0].key;
  const [sy, sm, sd] = selectedKey.split('-').map(Number);
  const rangeStart = new Date(sy, sm - 1, sd);
  const rangeEnd = new Date(sy, sm - 1, sd + 1);

  const showtimes = await prisma.showtime.findMany({
    where: { movieId, startAt: { gte: rangeStart, lt: rangeEnd } },
    orderBy: { startAt: 'asc' },
    include: { _count: { select: { bookings: true } } },
  });

  res.render('movie', { movies, movie, dateOptions, selectedKey, showtimes });
}));
