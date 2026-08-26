import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';

const rand = () => Math.random().toString(36).slice(2, 8);
const randPhone = () => `010-${1000 + Math.floor(Math.random() * 9000)}-${1000 + Math.floor(Math.random() * 9000)}`;
const VALID_PASSWORD = 'Password1!';
const signup = (username: string, email = `${username}@test.com`, phone = randPhone()) =>
  request(app)
    .post('/signup')
    .send({ username, email, phone, password: VALID_PASSWORD, passwordConfirm: VALID_PASSWORD });

const HOUR = 60 * 60 * 1000;

describe('booking flow', () => {
  let movieId: number;
  let showtimeId: number;
  let pastShowtimeId: number;
  let cancelShowtimeId: number;
  let payShowtimeId: number;
  let priorityShowtimeId: number;

  beforeAll(async () => {
    const movie = await prisma.movie.create({
      data: {
        title: 'Test Movie',
        genre: 'Test',
        runningTimeMin: 100,
        ageRating: '15',
        satisfactionPercent: 90,
        bookingRatePercent: 10,
        cumulativeViewers: '1.0만',
      },
    });
    movieId = movie.id;
    const showtime = await prisma.showtime.create({
      data: { movieId, theaterName: '1관', startAt: new Date(Date.now() + 24 * HOUR), totalSeats: 4, cols: 2 },
    });
    showtimeId = showtime.id;
    const pastShowtime = await prisma.showtime.create({
      data: { movieId, theaterName: '1관', startAt: new Date(Date.now() - 2 * HOUR), totalSeats: 4, cols: 2 },
    });
    pastShowtimeId = pastShowtime.id;
    // 취소 테스트는 예매/중복예매 테스트가 이미 채워둔 좌석과 겹치지 않도록
    // 좌석이 넉넉한(A1~D2) 전용 회차를 따로 쓴다.
    const cancelShowtime = await prisma.showtime.create({
      data: { movieId, theaterName: '1관', startAt: new Date(Date.now() + 24 * HOUR), totalSeats: 8, cols: 2 },
    });
    cancelShowtimeId = cancelShowtime.id;
    // 결제 테스트도 다른 테스트가 잡아둔 좌석과 겹치지 않도록 전용 회차를 쓴다.
    const payShowtime = await prisma.showtime.create({
      data: { movieId, theaterName: '1관', startAt: new Date(Date.now() + 24 * HOUR), totalSeats: 8, cols: 2 },
    });
    payShowtimeId = payShowtime.id;
    // 앞줄 가운데 우대 전용석 테스트는 한 줄에 4석 이상 있어야 "가운데 두 자리"가
    // 의미 있으므로(cols=2인 다른 픽스처는 앞줄 전체가 가운데가 되어버림) 별도
    // 회차를 쓴다. cols=4 → 우대 전용석은 A2, A3.
    const priorityShowtime = await prisma.showtime.create({
      data: { movieId, theaterName: '1관', startAt: new Date(Date.now() + 24 * HOUR), totalSeats: 8, cols: 4 },
    });
    priorityShowtimeId = priorityShowtime.id;
  });

  afterAll(async () => {
    const showtimeIds = [showtimeId, pastShowtimeId, cancelShowtimeId, payShowtimeId, priorityShowtimeId];
    await prisma.booking.deleteMany({ where: { showtimeId: { in: showtimeIds } } });
    await prisma.movieLike.deleteMany({ where: { movieId } });
    await prisma.showtime.deleteMany({ where: { id: { in: showtimeIds } } });
    await prisma.movie.delete({ where: { id: movieId } });
    await prisma.$disconnect();
  });

  test('회원가입 성공', async () => {
    const username = `user1${rand()}`;
    const res = await signup(username);
    expect(res.status).toBe(302);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(`${username}@test.com`);
  });

  test('이메일 없이 회원가입하면 실패한다', async () => {
    const username = `user1${rand()}`;
    const res = await request(app)
      .post('/signup')
      .send({ username, password: VALID_PASSWORD, passwordConfirm: VALID_PASSWORD });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('이미 존재하는 이메일로 회원가입하면 실패한다', async () => {
    const email = `dupemail_${rand()}@test.com`;
    await signup(`user1${rand()}`, email);
    const res = await signup(`user1${rand()}`, email);
    expect(res.status).toBe(409);
  });

  test('아이디가 5자 미만이거나 숫자를 포함하지 않으면 회원가입에 실패한다', async () => {
    const res1 = await signup('ab1');
    expect(res1.status).toBe(400);
    const res2 = await signup('abcdef');
    expect(res2.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username: 'abcdef' } });
    expect(user).toBeNull();
  });

  test('이미 존재하는 휴대전화번호로 회원가입하면 실패한다', async () => {
    const phone = randPhone();
    await signup(`user1${rand()}`, undefined, phone);
    const res = await signup(`user1${rand()}`, undefined, phone);
    expect(res.status).toBe(409);
    expect(res.text).toContain('이미 가입된 핸드폰 번호가 있습니다');
  });

  test('올바르지 않은 형식의 이메일이면 회원가입에 실패한다', async () => {
    const username = `user1${rand()}`;
    const res = await signup(username, 'darknight@gmail');
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('휴대전화번호 없이 회원가입하면 실패한다', async () => {
    const username = `user1${rand()}`;
    const res = await request(app)
      .post('/signup')
      .send({
        username,
        email: `${username}@test.com`,
        password: VALID_PASSWORD,
        passwordConfirm: VALID_PASSWORD,
      });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('휴대전화번호가 저장된다', async () => {
    const username = `user1${rand()}`;
    const phone = randPhone();
    await signup(username, `${username}@test.com`, phone);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user!.phone).toBe(phone);
  });

  test('비밀번호 확인이 일치하지 않으면 회원가입에 실패한다', async () => {
    const username = `user1${rand()}`;
    const res = await request(app)
      .post('/signup')
      .send({
        username,
        email: `${username}@test.com`,
        phone: '010-1234-5678',
        password: VALID_PASSWORD,
        passwordConfirm: 'Different1!',
      });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('비밀번호가 정책(영문+숫자+특수문자 8자 이상)을 충족하지 않으면 회원가입에 실패한다', async () => {
    const username = `user1${rand()}`;
    const res = await request(app)
      .post('/signup')
      .send({
        username,
        email: `${username}@test.com`,
        phone: '010-1234-5678',
        password: 'weakpass1',
        passwordConfirm: 'weakpass1',
      });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('이미 존재하는 아이디로 회원가입하면 실패한다', async () => {
    const username = `user1${rand()}`;
    await signup(username);
    const res = await signup(username);
    expect(res.status).toBe(409);
  });

  test('아이디 중복 시 입력했던 이메일/휴대전화번호가 폼에 유지된다', async () => {
    const username = `user1${rand()}`;
    await signup(username);
    const res = await signup(username, `${username}_second@test.com`, '010-5555-6666');
    expect(res.status).toBe(409);
    expect(res.text).toContain(`${username}_second`);
    expect(res.text).toContain('5555');
    expect(res.text).toContain('6666');
  });

  test('아이디 중복확인: 사용하지 않는 아이디는 available true', async () => {
    const username = `user1${rand()}`;
    const res = await request(app).get(`/signup/check-username?username=${username}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  test('아이디 중복확인: 이미 있는 아이디는 available false', async () => {
    const username = `user1${rand()}`;
    await signup(username);
    const res = await request(app).get(`/signup/check-username?username=${username}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
  });

  test('로그인 성공 시 세션 쿠키가 발급된다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    const res = await agent.post('/login').send({ username, password: VALID_PASSWORD });
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('비로그인 상태로 좌석 페이지 접근 시 로그인 후 원래 페이지로 돌아간다', async () => {
    const agent = request.agent(app);
    const guarded = await agent.get(`/showtimes/${showtimeId}`);
    expect(guarded.status).toBe(302);
    expect(guarded.headers.location).toBe(`/login?next=%2Fshowtimes%2F${showtimeId}`);

    const username = `user1${rand()}`;
    await signup(username);
    const loginRes = await agent
      .post('/login')
      .send({ username, password: VALID_PASSWORD, next: `/showtimes/${showtimeId}` });
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe(`/showtimes/${showtimeId}`);
  });

  test('next 값이 외부 주소면 무시하고 영화 목록으로 이동한다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    const res = await agent
      .post('/login')
      .send({ username, password: VALID_PASSWORD, next: 'https://evil.example.com' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/movies');
  });

  test('로그인한 사용자는 좌석을 예매할 수 있다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent
      .post(`/showtimes/${showtimeId}/book`)
      .send({ seats: ['A1'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, totalPrice: 16000 });

    const booking = await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'A1' } });
    expect(booking).not.toBeNull();
    expect(booking!.category).toBe('ADULT');
    expect(booking!.price).toBe(16000);
  });

  test('여러 카테고리를 섞어 예매하면 좌석별 카테고리/가격이 저장되고 총액이 계산된다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent.post(`/showtimes/${showtimeId}/book`).send({
      seats: ['B1', 'B2'],
      adultCount: 1,
      teenCount: 1,
      seniorCount: 0,
      disabledCount: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, totalPrice: 30000 });

    const b1 = await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'B1' } });
    const b2 = await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'B2' } });
    expect(b1!.category).toBe('ADULT');
    expect(b1!.price).toBe(16000);
    expect(b2!.category).toBe('TEEN');
    expect(b2!.price).toBe(14000);
  });

  test('선택한 좌석 수와 관람인원 수가 다르면 예매에 실패한다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent
      .post(`/showtimes/${showtimeId}/book`)
      .send({ seats: ['A2'], adultCount: 2, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    expect(res.status).toBe(400);

    const booking = await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'A2' } });
    expect(booking).toBeNull();
  });

  test('이미 예매된 좌석이 포함되면 예매 전체가 실패하고 나머지 좌석도 예매되지 않는다', async () => {
    const username1 = `dup1${rand()}`;
    const agent1 = request.agent(app);
    await signup(username1);
    await agent1.post('/login').send({ username: username1, password: VALID_PASSWORD });
    await agent1
      .post(`/showtimes/${showtimeId}/book`)
      .send({ seats: ['B2'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });

    const username2 = `dup2${rand()}`;
    const agent2 = request.agent(app);
    await signup(username2);
    const user2 = await agent2
      .post('/login')
      .send({ username: username2, password: VALID_PASSWORD })
      .then(() => prisma.user.findUnique({ where: { username: username2 } }));
    const res = await agent2
      .post(`/showtimes/${showtimeId}/book`)
      .send({ seats: ['A1', 'B2'], adultCount: 2, teenCount: 0, seniorCount: 0, disabledCount: 0 });

    expect(res.status).toBe(409);
    const a1ByUser2 = await prisma.booking.findFirst({
      where: { showtimeId, seatLabel: 'A1', userId: user2!.id },
    });
    expect(a1ByUser2).toBeNull();
  });

  test('본인 예매는 취소할 수 있고, 취소 후 해당 좌석은 다시 예매 가능해진다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });
    await agent
      .post(`/showtimes/${cancelShowtimeId}/book`)
      .send({ seats: ['C1'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    const booking = await prisma.booking.findFirst({ where: { showtimeId: cancelShowtimeId, seatLabel: 'C1' } });

    const res = await agent.post(`/bookings/${booking!.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // 취소는 하드 삭제가 아니라 cancelledAt을 남기는 소프트 삭제라, 고객 관리·
    // 마케팅 분석을 위해 취소 이력 자체는 DB에 계속 남아있어야 한다.
    const cancelled = await prisma.booking.findUnique({ where: { id: booking!.id } });
    expect(cancelled).not.toBeNull();
    expect(cancelled!.cancelledAt).not.toBeNull();

    const rebook = await agent
      .post(`/showtimes/${cancelShowtimeId}/book`)
      .send({ seats: ['C1'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    expect(rebook.status).toBe(200);
  });

  test('취소한 예매는 예매 내역 목록에 더 이상 보이지 않는다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });
    await agent
      .post(`/showtimes/${cancelShowtimeId}/book`)
      .send({ seats: ['A1'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    const booking = await prisma.booking.findFirst({ where: { showtimeId: cancelShowtimeId, seatLabel: 'A1' } });

    await agent.post(`/bookings/${booking!.id}/cancel`);

    const list = await agent.get('/bookings');
    expect(list.status).toBe(200);
    expect(list.text).not.toContain('A1');
  });

  test('이미 취소한 예매는 다시 취소할 수 없다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });
    await agent
      .post(`/showtimes/${cancelShowtimeId}/book`)
      .send({ seats: ['A2'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    const booking = await prisma.booking.findFirst({ where: { showtimeId: cancelShowtimeId, seatLabel: 'A2' } });

    const first = await agent.post(`/bookings/${booking!.id}/cancel`);
    expect(first.status).toBe(200);

    const second = await agent.post(`/bookings/${booking!.id}/cancel`);
    expect(second.status).toBe(404);
  });

  test('다른 사용자의 예매는 취소할 수 없다', async () => {
    const owner = `user1${rand()}`;
    const ownerAgent = request.agent(app);
    await signup(owner);
    await ownerAgent.post('/login').send({ username: owner, password: VALID_PASSWORD });
    await ownerAgent
      .post(`/showtimes/${cancelShowtimeId}/book`)
      .send({ seats: ['C2'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    const booking = await prisma.booking.findFirst({ where: { showtimeId: cancelShowtimeId, seatLabel: 'C2' } });

    const intruder = `user1${rand()}`;
    const intruderAgent = request.agent(app);
    await signup(intruder);
    await intruderAgent.post('/login').send({ username: intruder, password: VALID_PASSWORD });

    const res = await intruderAgent.post(`/bookings/${booking!.id}/cancel`);
    expect(res.status).toBe(404);
    expect(await prisma.booking.findUnique({ where: { id: booking!.id } })).not.toBeNull();
  });

  test('로그인하지 않으면 예매를 취소할 수 없다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });
    await agent
      .post(`/showtimes/${cancelShowtimeId}/book`)
      .send({ seats: ['D1'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    const booking = await prisma.booking.findFirst({ where: { showtimeId: cancelShowtimeId, seatLabel: 'D1' } });

    const res = await request(app).post(`/bookings/${booking!.id}/cancel`);
    expect(res.status).toBe(302);
    expect(await prisma.booking.findUnique({ where: { id: booking!.id } })).not.toBeNull();
  });

  test('이미 상영이 시작된 회차는 예매할 수 없다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent
      .post(`/showtimes/${pastShowtimeId}/book`)
      .send({ seats: ['A1'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    expect(res.status).toBe(400);
    expect(await prisma.booking.findFirst({ where: { showtimeId: pastShowtimeId } })).toBeNull();
  });

  test('상영시간표에는 이미 시작된 회차가 노출되지 않는다', async () => {
    const res = await request(app).get(`/movies/${movieId}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(`/showtimes/${pastShowtimeId}"`);
  });

  test('좋아요는 저장되고 다시 누르면 취소된다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const liked = await agent.post(`/movies/${movieId}/like`);
    expect(liked.status).toBe(200);
    expect(liked.body.liked).toBe(true);
    expect(await prisma.movieLike.findFirst({ where: { movieId } })).not.toBeNull();

    const unliked = await agent.post(`/movies/${movieId}/like`);
    expect(unliked.status).toBe(200);
    expect(unliked.body.liked).toBe(false);
    expect(await prisma.movieLike.findFirst({ where: { movieId } })).toBeNull();
  });

  test('로그인하지 않으면 좋아요를 누를 수 없다', async () => {
    const res = await request(app).post(`/movies/${movieId}/like`);
    expect(res.status).toBe(302);
    expect(await prisma.movieLike.findFirst({ where: { movieId } })).toBeNull();
  });

  test('상영관에 없는 좌석 번호로는 예매할 수 없다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    // 이 상영관은 totalSeats 4 / cols 2 이라 유효한 좌석은 A1, A2, B1, B2 뿐이다.
    const res = await agent
      .post(`/showtimes/${showtimeId}/book`)
      .send({ seats: ['Z99'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    expect(res.status).toBe(400);
    expect(await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'Z99' } })).toBeNull();
  });

  test('결제 페이지는 선택한 좌석과 결제 금액을 보여준다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent.get(
      `/showtimes/${payShowtimeId}/checkout?seats=A1,A2&adultCount=2&teenCount=0&seniorCount=0&disabledCount=0`
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('A1');
    expect(res.text).toContain('A2');
    expect(res.text).toContain('32,000');
    expect(res.text).toContain('20분전까지 취소 가능');
  });

  test('취소/환불 정책에 동의하지 않으면 결제할 수 없다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent.post(`/showtimes/${payShowtimeId}/pay`).send({
      seats: 'B1,B2',
      adultCount: 2,
      teenCount: 0,
      seniorCount: 0,
      disabledCount: 0,
      paymentMethod: 'CARD',
      // agreeCancelPolicy 없음
    });
    expect(res.status).toBe(400);
    expect(await prisma.booking.findFirst({ where: { showtimeId: payShowtimeId, seatLabel: 'B1' } })).toBeNull();
  });

  test('결제하면 예매번호와 결제수단이 저장되고 완료 화면으로 이동한다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent.post(`/showtimes/${payShowtimeId}/pay`).send({
      seats: 'D1,D2',
      adultCount: 2,
      teenCount: 0,
      seniorCount: 0,
      disabledCount: 0,
      paymentMethod: 'KAKAO_PAY',
      agreeCancelPolicy: 'on',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/bookings\/complete\?no=/);

    const saved = await prisma.booking.findMany({
      where: { showtimeId: payShowtimeId, seatLabel: { in: ['D1', 'D2'] } },
    });
    expect(saved).toHaveLength(2);
    expect(saved[0].paymentMethod).toBe('KAKAO_PAY');
    expect(saved[0].reservationNo).toBeTruthy();
    // 같은 결제로 잡힌 좌석은 예매번호를 공유한다.
    expect(saved[0].reservationNo).toBe(saved[1].reservationNo);

    const complete = await agent.get(res.headers.location);
    expect(complete.status).toBe(200);
    expect(complete.text).toContain(saved[0].reservationNo!);
  });

  test('다른 사람의 예매번호로는 완료 화면을 볼 수 없다', async () => {
    const owner = `user1${rand()}`;
    const ownerAgent = request.agent(app);
    await signup(owner);
    await ownerAgent.post('/login').send({ username: owner, password: VALID_PASSWORD });
    const paid = await ownerAgent.post(`/showtimes/${payShowtimeId}/pay`).send({
      seats: 'C1',
      adultCount: 1,
      teenCount: 0,
      seniorCount: 0,
      disabledCount: 0,
      paymentMethod: 'CARD',
      agreeCancelPolicy: 'on',
    });
    expect(paid.status).toBe(302);

    const intruder = `user1${rand()}`;
    const intruderAgent = request.agent(app);
    await signup(intruder);
    await intruderAgent.post('/login').send({ username: intruder, password: VALID_PASSWORD });
    const res = await intruderAgent.get(paid.headers.location);
    expect(res.status).toBe(404);
  });

  test('앞줄 가운데 두 자리는 우대 인원이 아니면 예매할 수 없다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent
      .post(`/showtimes/${priorityShowtimeId}/book`)
      .send({ seats: ['A2'], adultCount: 1, teenCount: 0, seniorCount: 0, disabledCount: 0 });
    expect(res.status).toBe(400);
    expect(await prisma.booking.findFirst({ where: { showtimeId: priorityShowtimeId, seatLabel: 'A2' } })).toBeNull();
  });

  test('앞줄 가운데 두 자리는 우대 인원으로는 예매할 수 있다', async () => {
    const username = `user1${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: VALID_PASSWORD });

    const res = await agent
      .post(`/showtimes/${priorityShowtimeId}/book`)
      .send({ seats: ['A3'], adultCount: 0, teenCount: 0, seniorCount: 0, disabledCount: 1 });
    expect(res.status).toBe(200);
    const booking = await prisma.booking.findFirst({ where: { showtimeId: priorityShowtimeId, seatLabel: 'A3' } });
    expect(booking!.category).toBe('DISABLED');
  });
});
