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

describe('booking flow', () => {
  let movieId: number;
  let showtimeId: number;

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
      data: { movieId, theaterName: '1관', startAt: new Date(), totalSeats: 4, cols: 2 },
    });
    showtimeId = showtime.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { showtimeId } });
    await prisma.showtime.delete({ where: { id: showtimeId } });
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
    await signup(username, `${username}@test.com`, '010-9999-8888');
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user!.phone).toBe('010-9999-8888');
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
});
