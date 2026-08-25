import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const authRouter = Router();

authRouter.get('/signup', (_req, res) => {
  res.render('signup', { error: null });
});

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const { username, email, password, passwordConfirm } = req.body;
  if (!username || !email || !password || !passwordConfirm) {
    return res.status(400).render('signup', { error: '모든 항목을 입력해주세요.' });
  }
  if (password !== passwordConfirm) {
    return res.status(400).render('signup', { error: '비밀번호가 일치하지 않습니다.' });
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return res.status(409).render('signup', { error: '이미 사용 중인 아이디입니다.' });
  }
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return res.status(409).render('signup', { error: '이미 가입된 이메일입니다.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { username, email, passwordHash } });
  res.redirect('/login');
}));

authRouter.get('/login', (_req, res) => {
  res.render('login', { error: null });
});

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    return res.status(401).render('login', { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  req.session.userId = user.id;
  res.redirect('/movies');
}));

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
