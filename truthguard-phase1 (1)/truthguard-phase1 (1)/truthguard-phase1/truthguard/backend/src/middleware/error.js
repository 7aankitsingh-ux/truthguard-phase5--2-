import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Resource not found' } });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid input', fields } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body' } });
  }
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'Payload exceeds allowed limit' } });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: { code: 'upload_error', message: err.message } });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
}
