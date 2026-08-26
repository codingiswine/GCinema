import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}
