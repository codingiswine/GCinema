import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/;
// 문자만 5자 이상이거나, 문자+숫자 조합으로 5자 이상이면 된다. 숫자만으로는
// 안 되므로(전화번호 뒷자리 등과 헷갈릴 수 있어) 문자를 최소 하나 요구한다.
const USERNAME_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9]{5,}$/;
const EMAIL_PRESET_DOMAINS = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'nate.com'];

// 비밀번호를 계속 바꿔가며 찔러보는 시도(무차별 대입)를 늦춘다. 계정 단위로만
// 세는데, 접속 IP 단위로 잠그면 회사·학교처럼 하나의 IP를 여럿이 나눠 쓰는
// 환경에서 무고한 사용자까지 함께 막히기 때문이다.
//
// 프로세스 메모리에만 쌓으므로 서버를 재시작하면 초기화되고, 여러 대로 늘리면
// 서버마다 따로 센다. 실제 서비스라면 Redis처럼 공유 저장소에 둬야 하지만,
// 이 과제 범위에서는 외부 의존성을 늘리지 않는 쪽을 택했다.
// 실공격(자동화된 대입)에는 여전히 유의미한 제동이면서, 사람이 화면을 확인하려고
// 몇 번 틀려보는 정도로는 걸리지 않을 균형점을 잡았다. 임계값이 낮고 잠금이
// 길면(예: 5회/60초) "에러 메시지가 어떻게 뜨는지 보려고 몇 번 틀려본" 사용자가
// 정작 자기 계정으로 못 들어가는 상황이 실제로 생긴다.
export const MAX_LOGIN_FAILURES = 8;
const LOGIN_LOCK_MS = 15_000;
const LOGIN_ATTEMPT_LIMIT = 10_000; // 메모리가 무한정 늘지 않도록 하는 상한

type LoginAttempt = { failures: number; lockedUntil: number };
const loginAttempts = new Map<string, LoginAttempt>();

// 잠금이 풀린 지 오래인 기록은 남겨둘 이유가 없다. 항목이 상한을 넘을 때만
// 훑어서 지운다(타이머를 따로 돌리지 않기 위함).
function pruneLoginAttempts(now: number) {
  if (loginAttempts.size < LOGIN_ATTEMPT_LIMIT) return;
  for (const [key, attempt] of loginAttempts) {
    if (attempt.lockedUntil <= now) loginAttempts.delete(key);
  }
}

// 잠겨 있으면 남은 초, 아니면 0.
function loginLockRemainingSec(username: string): number {
  const attempt = loginAttempts.get(username);
  if (!attempt) return 0;
  const now = Date.now();
  if (attempt.lockedUntil > now) return Math.ceil((attempt.lockedUntil - now) / 1000);
  // 잠금이 끝났으면 실패 횟수도 함께 털어낸다.
  if (attempt.lockedUntil !== 0) loginAttempts.delete(username);
  return 0;
}

function recordLoginFailure(username: string) {
  const now = Date.now();
  pruneLoginAttempts(now);
  const attempt = loginAttempts.get(username) ?? { failures: 0, lockedUntil: 0 };
  attempt.failures += 1;
  if (attempt.failures >= MAX_LOGIN_FAILURES) {
    attempt.lockedUntil = now + LOGIN_LOCK_MS;
    attempt.failures = 0;
  }
  loginAttempts.set(username, attempt);
}

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

// 실제 본인인증기관 연동 없이, 회원가입 앞에 "본인인증 단계"가 있다는 흐름만
// 보여주는 모의 화면이다(모의 결제와 같은 이유 — 이 과제 범위에서 외부 인증
// 연동은 하지 않되, 실제 가입 흐름에 흔히 있는 단계 자체는 화면으로 남긴다).
// 인증 완료 처리는 서버를 거치지 않고 phone.ejs 안의 팝업에서 바로 /signup으로
// 넘어가므로 별도 라우트/상태가 필요 없다.
authRouter.get('/signup/verify', (_req, res) => {
  res.render('signupVerify');
});

authRouter.get('/signup/verify/phone', (_req, res) => {
  res.render('signupVerifyPhone');
});

// 아이디 찾기: 이름/생년월일 등 본인확인 입력값 자체는 회원가입 본인인증과
// 마찬가지로 서버에 저장되거나 실제로 대조되지 않는 모의 절차지만("본인 확인"
// 단계는 이 과제 범위에서 외부 인증기관 없이 흉내만 낸다), 마지막에 조회하는
// "휴대폰 번호로 아이디 찾기" 자체는 User.phone(unique)로 실제 조회한다.
authRouter.get('/find-id', (_req, res) => {
  res.render('findId');
});

authRouter.get('/find-id/verify', (_req, res) => {
  res.render('findIdVerifyPhone', { error: null });
});

// 아이디 뒷자리를 그대로 노출하면 다른 사람이 휴대폰 번호만 알아도 계정을
// 특정할 수 있어, 앞 3글자만 보여주고 나머지는 길이를 유지한 채 마스킹한다.
function maskUsername(username: string): string {
  const visible = username.slice(0, 3);
  const maskedLength = Math.max(username.length - 3, 2);
  return visible + '*'.repeat(maskedLength);
}

authRouter.post('/find-id/verify', asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!PHONE_PATTERN.test(phone || '')) {
    return res.status(400).render('findIdVerifyPhone', { error: '휴대폰 번호를 정확히 입력해주세요.' });
  }
  const user = await prisma.user.findUnique({ where: { phone } });
  res.render('findIdResult', { maskedUsername: user ? maskUsername(user.username) : null });
}));

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

  // 잠긴 동안에는 비밀번호가 맞아도 통과시키지 않는다. 맞았을 때만 통과시키면
  // 공격자에게 "이번 건 정답이었다"를 알려주는 셈이라 방어가 되지 않는다.
  const lockedFor = loginLockRemainingSec(username);
  if (lockedFor > 0) {
    return res.status(429).render('login', {
      error: `로그인 시도가 너무 많습니다. ${lockedFor}초 후에 다시 시도해주세요.`,
      next: safeNext(next),
      justSignedUp: false,
    });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    recordLoginFailure(username);
    return res.status(401).render('login', { error: '아이디 또는 비밀번호가 올바르지 않습니다.', next: safeNext(next), justSignedUp: false });
  }

  // 성공했으면 그동안의 실패 기록은 의미가 없다.
  loginAttempts.delete(username);

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
