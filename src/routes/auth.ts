import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/;
const USERNAME_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{5,}$/;
const EMAIL_PRESET_DOMAINS = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'nate.com'];

function emptyFormValues() {
  return {
    username: '',
    phonePrefix: '010',
    phoneMid: '',
    phoneLast: '',
    emailLocal: '',
    emailDomain: 'custom',
    emailDomainCustom: '',
  };
}

function buildFormValues(body: Record<string, string>) {
  const username = body.username || '';
  const [phonePrefix, phoneMid, phoneLast] = (body.phone || '').split('-');
  const email = body.email || '';
  const atIdx = email.indexOf('@');
  const emailLocal = atIdx >= 0 ? email.slice(0, atIdx) : email;
  const domain = atIdx >= 0 ? email.slice(atIdx + 1) : '';
  const isPreset = EMAIL_PRESET_DOMAINS.includes(domain);
  return {
    username,
    phonePrefix: phonePrefix || '010',
    phoneMid: phoneMid || '',
    phoneLast: phoneLast || '',
    emailLocal,
    emailDomain: isPreset ? domain : 'custom',
    emailDomainCustom: isPreset ? '' : domain,
  };
}

authRouter.get('/signup', (_req, res) => {
  res.render('signup', { error: null, formValues: emptyFormValues(), duplicateField: null });
});

authRouter.get('/signup/check-username', asyncHandler(async (req, res) => {
  const username = String(req.query.username || '');
  if (!username) {
    return res.status(400).json({ error: '아이디를 입력해주세요.' });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  res.json({ available: !existing });
}));

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const { username, email, phone, password, passwordConfirm } = req.body;
  const formValues = buildFormValues(req.body);

  if (!username || !email || !phone || !password || !passwordConfirm) {
    return res
      .status(400)
      .render('signup', { error: '모든 항목을 입력해주세요.', formValues, duplicateField: null });
  }
  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).render('signup', {
      error: '아이디는 문자+숫자 포함 다섯 글자 이상으로 만들어주세요.',
      formValues,
      duplicateField: null,
    });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res
      .status(400)
      .render('signup', { error: '올바른 이메일 형식이 아닙니다.', formValues, duplicateField: null });
  }
  if (!PHONE_PATTERN.test(phone)) {
    return res
      .status(400)
      .render('signup', { error: '올바른 휴대전화번호 형식이 아닙니다.', formValues, duplicateField: null });
  }
  if (!PASSWORD_PATTERN.test(password)) {
    return res.status(400).render('signup', {
      error: '비밀번호는 영문, 숫자, 특수문자를 포함해 8자 이상이어야 합니다.',
      formValues,
      duplicateField: null,
    });
  }
  if (password !== passwordConfirm) {
    return res
      .status(400)
      .render('signup', { error: '비밀번호가 일치하지 않습니다.', formValues, duplicateField: null });
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return res.status(409).render('signup', {
      error: '이미 사용 중인 아이디입니다.',
      formValues,
      duplicateField: 'username',
    });
  }
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return res.status(409).render('signup', {
      error: '이미 가입된 이메일 주소가 있습니다.',
      formValues,
      duplicateField: 'email',
    });
  }
  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) {
    return res.status(409).render('signup', {
      error: '이미 가입된 핸드폰 번호가 있습니다.',
      formValues,
      duplicateField: 'phone',
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { username, email, phone, passwordHash } });
  res.redirect('/login?signup=1');
}));

// 로그인 필요 페이지에서 넘어온 next는 우리 서버 내부 경로일 때만 신뢰한다.
// (예: "//evil.com"이나 "https://evil.com" 같은 오픈 리다이렉트 방지)
function safeNext(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

authRouter.get('/login', (req, res) => {
  res.render('login', { error: null, next: safeNext(req.query.next), justSignedUp: req.query.signup === '1' });
});

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password, next } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    return res.status(401).render('login', { error: '아이디 또는 비밀번호가 올바르지 않습니다.', next: safeNext(next), justSignedUp: false });
  }

  // 로그인 전 세션 ID를 그대로 쓰면, 그 ID를 미리 알고 있던 쪽이 로그인
  // 성공과 동시에 이 계정의 세션을 넘겨받는다(세션 고정 공격). 권한이 바뀌는
  // 시점에는 세션 ID를 새로 발급해야 한다.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;
  res.redirect(safeNext(next) || '/movies');
}));

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
