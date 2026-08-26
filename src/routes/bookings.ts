import { Router } from 'express';
import { Prisma, TicketCategory, PaymentMethod } from '@prisma/client';
import { prisma } from '../db';
import { requireLogin } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

export const bookingsRouter = Router();

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: '신용/체크카드',
  KAKAO_PAY: '카카오페이',
  NAVER_PAY: '네이버페이',
  BANK_TRANSFER: '무통장입금',
};

// 취소/환불 정책 — 결제 화면에서 동의를 받고, 서버에서도 동의 여부를 확인한다.
export const CANCEL_POLICY = [
  '온라인 예매는 영화 상영시간 20분전까지 취소 가능하며, 20분 이후 현장 취소만 가능합니다.',
  '현장 취소 시 영화 상영시간 이전까지만 가능합니다.',
];

// 사람이 읽고 부를 수 있는 길이의 예매번호. 한 번의 결제로 잡힌 좌석들이 공유한다.
function makeReservationNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 8);
  return `G${ymd}-${suffix}`;
}

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

// Generates row-major seat labels for `totalSeats` seats, `cols` per row.
// The last row is partial when totalSeats isn't a clean multiple of cols
// (e.g. 67 seats / 14 cols -> 4 full rows + a final row of 11).
function seatLabels(totalSeats: number, cols: number): string[] {
  const labels: string[] = [];
  let remaining = totalSeats;
  let r = 0;
  while (remaining > 0) {
    const rowLetter = String.fromCharCode(65 + r);
    const seatsInRow = Math.min(cols, remaining);
    for (let c = 1; c <= seatsInRow; c++) {
      labels.push(`${rowLetter}${c}`);
    }
    remaining -= seatsInRow;
    r++;
  }
  return labels;
}

bookingsRouter.get('/showtimes/:id', requireLogin, asyncHandler(async (req, res) => {
  const showtimeId = Number(req.params.id);
  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: { movie: true, bookings: true },
  });
  if (!showtime) return res.status(404).send('상영 정보를 찾을 수 없습니다.');
  // 지난 회차의 좌석 페이지로 직접 들어오면 해당 영화 상영시간표로 되돌린다.
  if (showtime.startAt.getTime() <= Date.now()) {
    return res.redirect(`/movies/${showtime.movieId}`);
  }

  const booked = new Set(showtime.bookings.map((b) => b.seatLabel));
  const seats = seatLabels(showtime.totalSeats, showtime.cols).map((label) => ({
    label,
    booked: booked.has(label),
  }));
  const rows = Math.ceil(showtime.totalSeats / showtime.cols);
  res.render('showtimeSeats', {
    showtime,
    seats,
    rows,
    prices: TICKET_PRICES,
    breadcrumb: [
      { label: '영화 목록', href: '/movies' },
      { label: '예매', href: `/movies/${showtime.movieId}` },
      { label: '좌석 선택' },
    ],
  });
}));

type OrderCheck =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      showtime: Prisma.ShowtimeGetPayload<{ include: { movie: true } }>;
      seats: string[];
      counts: Record<TicketCategory, number>;
      categoryBySeat: TicketCategory[];
      totalPrice: number;
    };

// 좌석/인원 조합이 이 회차에 대해 유효한지 확인한다. 좌석 페이지 → 결제 페이지 →
// 결제 세 단계에서 같은 규칙을 써야 해서 한 곳으로 모았다.
async function validateOrder(
  showtimeId: number,
  rawSeats: unknown,
  rawCounts: { adultCount: unknown; teenCount: unknown; seniorCount: unknown; disabledCount: unknown }
): Promise<OrderCheck> {
  const seats = Array.isArray(rawSeats)
    ? (rawSeats as string[])
    : typeof rawSeats === 'string'
      ? rawSeats.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  const counts: Record<TicketCategory, number> = {
    ADULT: Number(rawCounts.adultCount) || 0,
    TEEN: Number(rawCounts.teenCount) || 0,
    SENIOR: Number(rawCounts.seniorCount) || 0,
    DISABLED: Number(rawCounts.disabledCount) || 0,
  };
  const totalTickets = counts.ADULT + counts.TEEN + counts.SENIOR + counts.DISABLED;

  if (seats.length === 0 || totalTickets === 0) {
    return { ok: false, status: 400, error: '관람인원과 좌석을 선택해주세요.' };
  }
  if (seats.length !== totalTickets) {
    return { ok: false, status: 400, error: '선택한 좌석 수와 관람인원 수가 일치하지 않습니다.' };
  }

  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: { movie: true },
  });
  if (!showtime) {
    return { ok: false, status: 404, error: '상영 정보를 찾을 수 없습니다.' };
  }
  if (showtime.startAt.getTime() <= Date.now()) {
    return { ok: false, status: 400, error: '이미 상영이 시작된 회차는 예매할 수 없습니다.' };
  }

  // 좌석 그리드는 서버가 totalSeats/cols로 정의하므로, 클라이언트가 보낸
  // 좌석 번호도 그 그리드 안에 실제로 존재하는지 여기서 확인한다.
  const validSeats = new Set(seatLabels(showtime.totalSeats, showtime.cols));
  const unknownSeat = seats.find((label) => !validSeats.has(label));
  if (unknownSeat) {
    return { ok: false, status: 400, error: `상영관에 없는 좌석입니다: ${unknownSeat}` };
  }
  if (new Set(seats).size !== seats.length) {
    return { ok: false, status: 400, error: '같은 좌석을 중복해서 선택할 수 없습니다.' };
  }

  const categoryBySeat: TicketCategory[] = [
    ...Array(counts.ADULT).fill('ADULT' as TicketCategory),
    ...Array(counts.TEEN).fill('TEEN' as TicketCategory),
    ...Array(counts.SENIOR).fill('SENIOR' as TicketCategory),
    ...Array(counts.DISABLED).fill('DISABLED' as TicketCategory),
  ];
  const totalPrice = categoryBySeat.reduce((sum, c) => sum + TICKET_PRICES[c], 0);

  return { ok: true, showtime, seats, counts, categoryBySeat, totalPrice };
}

// 결제 페이지: 좌석 선택 화면에서 넘어온 좌석/인원을 서버가 다시 검증해서
// 예매 정보와 금액 명세를 보여주고, 결제수단과 취소정책 동의를 받는다.
bookingsRouter.get('/showtimes/:id/checkout', requireLogin, asyncHandler(async (req, res) => {
  const showtimeId = Number(req.params.id);
  const q = req.query;
  const check = await validateOrder(showtimeId, q.seats, {
    adultCount: q.adultCount,
    teenCount: q.teenCount,
    seniorCount: q.seniorCount,
    disabledCount: q.disabledCount,
  });
  if (!check.ok) {
    return res.status(check.status).send(check.error);
  }

  const { showtime, seats, counts, totalPrice } = check;
  const lines = (Object.keys(counts) as TicketCategory[])
    .filter((c) => counts[c] > 0)
    .map((c) => ({
      label: CATEGORY_LABELS[c],
      count: counts[c],
      unitPrice: TICKET_PRICES[c],
      amount: counts[c] * TICKET_PRICES[c],
    }));

  res.render('checkout', {
    showtime,
    seats,
    counts,
    lines,
    totalPrice,
    cancelPolicy: CANCEL_POLICY,
    paymentMethods: Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
    breadcrumb: [
      { label: '영화 목록', href: '/movies' },
      { label: '예매', href: `/movies/${showtime.movieId}` },
      { label: '좌석 선택', href: `/showtimes/${showtime.id}` },
      { label: '결제' },
    ],
  });
}));

// 실제 결제 처리. PG사 연동 없이 결제수단만 기록하는 모의 결제이며,
// 좌석 확정은 기존 예매와 똑같이 하나의 트랜잭션으로 묶는다.
bookingsRouter.post('/showtimes/:id/pay', requireLogin, asyncHandler(async (req, res) => {
  const showtimeId = Number(req.params.id);
  const { seats, adultCount, teenCount, seniorCount, disabledCount } = req.body;
  const { paymentMethod, agreeCancelPolicy } = req.body;

  const check = await validateOrder(showtimeId, seats, {
    adultCount,
    teenCount,
    seniorCount,
    disabledCount,
  });
  if (!check.ok) {
    return res.status(check.status).send(check.error);
  }
  // 체크박스는 화면에서도 막지만, 폼을 직접 만들어 보내는 경우까지 막으려면
  // 서버에서 동의 여부를 한 번 더 확인해야 한다.
  if (!agreeCancelPolicy) {
    return res.status(400).send('취소/환불 정책에 동의해야 결제할 수 있습니다.');
  }
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABELS, paymentMethod)) {
    return res.status(400).send('결제수단을 선택해주세요.');
  }

  const { seats: seatList, categoryBySeat } = check;
  const reservationNo = makeReservationNo();

  try {
    await prisma.$transaction(
      seatList.map((seatLabel, i) =>
        prisma.booking.create({
          data: {
            showtimeId,
            seatLabel,
            userId: req.session.userId!,
            category: categoryBySeat[i],
            price: TICKET_PRICES[categoryBySeat[i]],
            reservationNo,
            paymentMethod: paymentMethod as PaymentMethod,
          },
        })
      )
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).send('이미 예약된 좌석이 포함되어 있습니다. 좌석을 다시 선택해주세요.');
    }
    throw err;
  }

  res.redirect(`/bookings/complete?no=${encodeURIComponent(reservationNo)}`);
}));

// 예매 완료 화면. 예매번호로 조회하되 본인 예매인지 확인한다.
bookingsRouter.get('/bookings/complete', requireLogin, asyncHandler(async (req, res) => {
  const reservationNo = String(req.query.no || '');
  const bookings = await prisma.booking.findMany({
    where: { reservationNo, userId: req.session.userId! },
    include: { showtime: { include: { movie: true } } },
    orderBy: { seatLabel: 'asc' },
  });
  if (bookings.length === 0) {
    return res.status(404).send('예매 내역을 찾을 수 없습니다.');
  }

  const totalPrice = bookings.reduce((sum, b) => sum + b.price, 0);
  res.render('bookingComplete', {
    reservationNo,
    bookings,
    showtime: bookings[0].showtime,
    totalPrice,
    paymentMethodLabel: bookings[0].paymentMethod
      ? PAYMENT_METHOD_LABELS[bookings[0].paymentMethod]
      : '-',
    categoryLabels: CATEGORY_LABELS,
  });
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

  // 상영시간표에서 지난 회차를 숨기지만, URL로 직접 들어오는 경우까지 막으려면
  // 예매 시점에 서버에서 한 번 더 확인해야 한다.
  const showtime = await prisma.showtime.findUnique({ where: { id: showtimeId } });
  if (!showtime) {
    return res.status(404).json({ error: '상영 정보를 찾을 수 없습니다.' });
  }
  if (showtime.startAt.getTime() <= Date.now()) {
    return res.status(400).json({ error: '이미 상영이 시작된 회차는 예매할 수 없습니다.' });
  }

  // 좌석 그리드는 서버가 totalSeats/cols로 정의하므로, 클라이언트가 보낸
  // 좌석 번호도 그 그리드 안에 실제로 존재하는지 여기서 확인한다.
  // (같은 좌석 중복은 아래 @@unique 제약이 잡아주지만, 없는 좌석은 못 잡는다.)
  const validSeats = new Set(seatLabels(showtime.totalSeats, showtime.cols));
  const unknownSeat = (seats as string[]).find((label) => !validSeats.has(label));
  if (unknownSeat) {
    return res.status(400).json({ error: `상영관에 없는 좌석입니다: ${unknownSeat}` });
  }
  if (new Set(seats as string[]).size !== seats.length) {
    return res.status(400).json({ error: '같은 좌석을 중복해서 선택할 수 없습니다.' });
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

bookingsRouter.post('/bookings/:id/cancel', requireLogin, asyncHandler(async (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== req.session.userId) {
    return res.status(404).json({ error: '예매 내역을 찾을 수 없습니다.' });
  }
  await prisma.booking.delete({ where: { id: bookingId } });
  res.json({ ok: true });
}));
