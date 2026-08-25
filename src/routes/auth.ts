import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const authRouter = Router();

authRouter.get('/signup', (_req, res) => {
  res.render('signup', { error: null });
});

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).render('signup', { error: '모든 항목을 입력해주세요.' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).render('signup', { error: '이미 가입된 이메일입니다.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { email, passwordHash, name } });
  res.redirect('/login');
}));

authRouter.get('/login', (_req, res) => {
  res.render('login', { error: null });
});

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    return res.status(401).render('login', { error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  req.session.userId = user.id;
  res.redirect('/movies');
}));

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
