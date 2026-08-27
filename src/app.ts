import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { authRouter } from './routes/auth';
import { moviesRouter } from './routes/movies';
import { bookingsRouter } from './routes/bookings';

export const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      // 세션 쿠키를 JS로 읽을 이유가 없다 — XSS로 탈취당하는 통로만 열어준다.
      httpOnly: true,
      // 예매·취소·결제는 전부 세션 쿠키만으로 인증되는 POST라, 다른 사이트가
      // 몰래 폼을 제출하면 그대로 실행될 수 있다(CSRF). sameSite: 'lax'면
      // 브라우저가 교차 사이트 POST에 쿠키를 붙이지 않아 이 경로가 막힌다.
      // 최신 브라우저의 기본값이기도 하지만 기본값에 기대지 않고 명시한다.
      sameSite: 'lax',
    },
  })
);

app.use((req, res, next) => {
  res.locals.userId = req.session.userId;
  next();
});

app.get('/', (_req, res) => res.redirect('/movies'));
app.get('/support', (_req, res) => res.render('support'));
app.use(authRouter);
app.use(moviesRouter);
app.use(bookingsRouter);

// 어느 라우트에도 걸리지 않은 주소. 두면 Express 기본 404("Cannot GET /...")가
// 영문 맨 텍스트로 나가서, 사이트를 벗어난 것처럼 보인다.
app.use((_req, res) => {
  res.status(404).render('error', { status: 404, message: '페이지를 찾을 수 없습니다.' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  // 실패한 화면에서도 헤더/푸터가 그대로 있어야 사용자가 다음 행동을 할 수 있다.
  // 원인 메시지는 로그로만 남기고 화면에는 노출하지 않는다.
  res.status(500).render('error', { status: 500, message: '서버 오류가 발생했습니다.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`listening on http://localhost:${port}`));
}
