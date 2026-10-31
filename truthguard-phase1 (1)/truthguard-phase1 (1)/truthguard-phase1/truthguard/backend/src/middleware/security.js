import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../errors.js';

const skip = () => config.NODE_ENV === 'test';
const handler = (req, res, next) =>
  next(new AppError(429, 'rate_limited', 'Too many requests. Please try again later.'));
const limiter = (limit) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, skip, handler });

export const apiLimiter = limiter(300);
export const authLimiter = limiter(10);
export const verifyLimiter = limiter(60);
export const shareLimiter = limiter(60);

export function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.CLIENT_ORIGIN) {
    return next(new AppError(403, 'forbidden_origin', 'Request origin not allowed'));
  }
  next();
}
