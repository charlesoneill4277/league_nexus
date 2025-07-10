const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const isProduction = process.env.NODE_ENV === 'production';

  // Normalize status code
  let statusCode = 500;
  if (err.statusCode || err.status) {
    const parsed = parseInt(err.statusCode || err.status, 10);
    statusCode = isNaN(parsed) ? 500 : parsed;
  }

  // Default error code and message
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal Server Error';

  const hasExplicitStatus = !!(err.statusCode || err.status);
  const name = err.name;

  if (hasExplicitStatus) {
    code = err.code || name || code;
    message = err.message || message;
  } else {
    switch (name) {
      case 'ValidationError':
      case 'SequelizeValidationError':
        statusCode = 400;
        code = 'VALIDATION_ERROR';
        message = err.message;
        break;
      case 'UnauthorizedError':
      case 'JsonWebTokenError':
        statusCode = 401;
        code = 'UNAUTHORIZED';
        message = err.message || 'Unauthorized';
        break;
      case 'NotFoundError':
        statusCode = 404;
        code = 'NOT_FOUND';
        message = err.message || 'Not Found';
        break;
      default:
        // Unknown errors retain default code/message
        break;
    }
  }

  // Translate known message keys only
  const translatableCodes = ['VALIDATION_ERROR', 'UNAUTHORIZED', 'NOT_FOUND', 'INTERNAL_SERVER_ERROR'];
  if (req.t && translatableCodes.includes(code)) {
    const translated = req.t(code);
    if (translated) message = translated;
  }

  // Log error; include stack only in non-production
  const logPayload = {
    message: err.message,
    code,
    statusCode,
    path: req.originalUrl,
    method: req.method
  };
  if (!isProduction) {
    logPayload.stack = err.stack;
  }
  logger.error(logPayload);

  // Build response
  const errorResponse = {
    error: {
      code,
      message
    }
  };
  if (!isProduction) {
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

const notFoundHandler = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  let message = 'Not Found';
  if (req.t) {
    const translated = req.t('NOT_FOUND');
    if (translated) message = translated;
  }
  const error = { code: 'NOT_FOUND', message };
  res.status(404).json({ error });
};

module.exports = {
  errorHandler,
  notFoundHandler
};