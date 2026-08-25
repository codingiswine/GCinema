import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';

const rand = () => Math.random().toString(36).slice(2, 8);
const signup = (email: string) =>
  request(app).post('/signup').send({ email, password: 'password123', name: 'Tester' });

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
    const email = `user_${rand()}@test.com`;
    const res = await signup(email);
    expect(res.status).toBe(302);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
  });

  test('로그인 성공 시 세션 쿠키가 발급된다', async () => {
    const email = `user_${rand()}@test.com`;
    const agent = request.agent(app);
    await signup(email);
    const res = await agent.post('/login').send({ email, password: 'password123' });
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('로그인한 사용자는 좌석을 예매할 수 있다', async () => {
    const email = `user_${rand()}@test.com`;
    const agent = request.agent(app);
    await signup(email);
    await agent.post('/login').send({ email, password: 'password123' });

    const res = await agent.post(`/showtimes/${showtimeId}/book`).send({ seatLabel: 'A1' });
    expect(res.status).toBe(302);

    const booking = await prisma.booking.findFirst({ where: { showtimeId, seatLabel: 'A1' } });
    expect(booking).not.toBeNull();
  });

  test('이미 예매된 좌석은 다른 사용자가 다시 예매할 수 없다', async () => {
    const email1 = `dup1_${rand()}@test.com`;
    const agent1 = request.agent(app);
    await signup(email1);
    await agent1.post('/login').send({ email: email1, password: 'password123' });
    await agent1.post(`/showtimes/${showtimeId}/book`).send({ seatLabel: 'B2' });

    const email2 = `dup2_${rand()}@test.com`;
    const agent2 = request.agent(app);
    await signup(email2);
    await agent2.post('/login').send({ email: email2, password: 'password123' });
    const res = await agent2.post(`/showtimes/${showtimeId}/book`).send({ seatLabel: 'B2' });

    expect(res.status).toBe(409);
  });
});
