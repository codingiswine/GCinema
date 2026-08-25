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
  })
);

app.get('/', (_req, res) => res.redirect('/movies'));
app.use(authRouter);
app.use(moviesRouter);
app.use(bookingsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).send('서버 오류가 발생했습니다.');
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`listening on http://localhost:${port}`));
}
