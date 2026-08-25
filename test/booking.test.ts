import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';

const rand = () => Math.random().toString(36).slice(2, 8);
const signup = (username: string, email = `${username}@test.com`) =>
  request(app)
    .post('/signup')
    .send({ username, email, password: 'password123', passwordConfirm: 'password123' });

describe('booking flow', () => {
  let movieId: number;
  let showtimeId: number;

  beforeAll(async () => {
    const movie = await prisma.movie.create({
      data: { title: 'Test Movie', genre: 'Test', runningTimeMin: 100 },
    });
    movieId = movie.id;
    const showtime = await prisma.showtime.create({
      data: { movieId, theaterName: '1관', startAt: new Date(), rows: 2, cols: 2 },
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
    const username = `user_${rand()}`;
    const res = await signup(username);
    expect(res.status).toBe(302);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(`${username}@test.com`);
  });

  test('이메일 없이 회원가입하면 실패한다', async () => {
    const username = `user_${rand()}`;
    const res = await request(app)
      .post('/signup')
      .send({ username, password: 'password123', passwordConfirm: 'password123' });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('이미 존재하는 이메일로 회원가입하면 실패한다', async () => {
    const email = `dupemail_${rand()}@test.com`;
    await signup(`user_${rand()}`, email);
    const res = await signup(`user_${rand()}`, email);
    expect(res.status).toBe(409);
  });

  test('비밀번호 확인이 일치하지 않으면 회원가입에 실패한다', async () => {
    const username = `user_${rand()}`;
    const res = await request(app)
      .post('/signup')
      .send({ username, password: 'password123', passwordConfirm: 'different456' });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).toBeNull();
  });

  test('이미 존재하는 아이디로 회원가입하면 실패한다', async () => {
    const username = `user_${rand()}`;
    await signup(username);
    const res = await signup(username);
    expect(res.status).toBe(409);
  });

  test('로그인 성공 시 세션 쿠키가 발급된다', async () => {
    const username = `user_${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    const res = await agent.post('/login').send({ username, password: 'password123' });
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('로그인한 사용자는 좌석을 예매할 수 있다', async () => {
    const username = `user_${rand()}`;
    const agent = request.agent(app);
    await signup(username);
    await agent.post('/login').send({ username, password: 'password123' });

    const res = await agent.post(`/showtimes/${showtimeId}/book`).send({ seatLabel: 'A1' });
    expect(res.status).toBe(302);

    const booking = await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'A1' } });
    expect(booking).not.toBeNull();
  });

  test('이미 예매된 좌석은 다른 사용자가 다시 예매할 수 없다', async () => {
    const username1 = `dup1_${rand()}`;
    const agent1 = request.agent(app);
    await signup(username1);
    await agent1.post('/login').send({ username: username1, password: 'password123' });
    await agent1.post(`/showtimes/${showtimeId}/book`).send({ seatLabel: 'B2' });

    const username2 = `dup2_${rand()}`;
    const agent2 = request.agent(app);
    await signup(username2);
    await agent2.post('/login').send({ username: username2, password: 'password123' });
    const res = await agent2.post(`/showtimes/${showtimeId}/book`).send({ seatLabel: 'B2' });

    expect(res.status).toBe(409);
  });
});
