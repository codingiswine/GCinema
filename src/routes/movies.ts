import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';

export const moviesRouter = Router();

moviesRouter.get('/movies', asyncHandler(async (_req, res) => {
  const movies = await prisma.movie.findMany({ orderBy: { id: 'asc' } });
  res.render('movies', { movies });
}));

moviesRouter.get('/movies/:id', asyncHandler(async (req, res) => {
  const movieId = Number(req.params.id);
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    include: { showtimes: { orderBy: { startAt: 'asc' } } },
  });
  if (!movie) return res.status(404).send('영화를 찾을 수 없습니다.');
  res.render('movie', { movie });
}));
