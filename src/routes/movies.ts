import { Router } from 'express';
import { prisma } from '../db';
import { requireLogin } from '../middleware/auth';
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
  const userId = req.session.userId;
  const liked = userId
    ? (await prisma.movieLike.findUnique({ where: { userId_movieId: { userId, movieId } } })) !== null
    : false;
  res.render('movieDetail', { movie, dateOptions, liked });
}));

// 좋아요 토글. 이미 눌러둔 상태면 취소되도록 같은 엔드포인트에서 처리한다.
moviesRouter.post('/movies/:id/like', requireLogin, asyncHandler(async (req, res) => {
  const movieId = Number(req.params.id);
  const userId = req.session.userId!;
  const where = { userId_movieId: { userId, movieId } };

  const existing = await prisma.movieLike.findUnique({ where });
  if (existing) {
    await prisma.movieLike.delete({ where });
    return res.json({ liked: false });
  }
  await prisma.movieLike.create({ data: { userId, movieId } });
  res.json({ liked: true });
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

  // 오늘 탭에서는 이미 시작한 회차를 빼고 남은 회차만 보여준다.
  const now = new Date();
  const from = rangeStart > now ? rangeStart : now;

  const showtimes = await prisma.showtime.findMany({
    where: { movieId, startAt: { gte: from, lt: rangeEnd } },
    orderBy: { startAt: 'asc' },
    include: { _count: { select: { bookings: { where: { cancelledAt: null } } } } },
  });

  res.render('movie', {
    movies,
    movie,
    dateOptions,
    selectedKey,
    showtimes,
    breadcrumb: [{ label: '영화 목록', href: '/movies' }, { label: '예매' }],
  });
}));
