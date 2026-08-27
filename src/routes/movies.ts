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
  if (!movie) return res.status(404).render('error', { status: 404, message: '영화를 찾을 수 없습니다.' });

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

// 평점/한줄평/영화일기 저장. 마이페이지의 "내가 본 영화"·"나의 영화일기" 탭에서
// 쓰며, 실제로 관람한(과거 회차를 취소하지 않고 예매한) 영화만 남길 수 있다.
// 세 필드 중 보낸 것만 갱신하므로 평점만 남기거나 일기만 남기는 것도 된다.
moviesRouter.post('/movies/:id/review', requireLogin, asyncHandler(async (req, res) => {
  const movieId = Number(req.params.id);
  const userId = req.session.userId!;

  const watched = await prisma.booking.findFirst({
    where: { userId, cancelledAt: null, showtime: { movieId, startAt: { lte: new Date() } } },
  });
  if (!watched) return res.status(403).json({ error: '관람한 영화만 기록을 남길 수 있습니다.' });

  const { rating, comment, diary } = req.body;
  const data: { rating?: number; comment?: string; diary?: string } = {};
  if (rating !== undefined) {
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: '평점은 1~5 사이여야 합니다.' });
    }
    data.rating = r;
  }
  if (comment !== undefined) data.comment = String(comment).slice(0, 200);
  if (diary !== undefined) data.diary = String(diary).slice(0, 2000);

  const review = await prisma.movieReview.upsert({
    where: { userId_movieId: { userId, movieId } },
    create: { userId, movieId, ...data },
    update: data,
  });
  res.json({ ok: true, review });
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
  if (!movie) return res.status(404).render('error', { status: 404, message: '영화를 찾을 수 없습니다.' });

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
