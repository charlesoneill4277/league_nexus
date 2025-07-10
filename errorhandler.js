const { logError } = require('../utils/logger')

function isValidStatusCode(code) {
  return Number.isInteger(code) && code >= 400 && code <= 599
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  const isProd = process.env.NODE_ENV === 'production'

  // Prepare request info for logging
  const requestInfo = {
    method: req.method,
    url: req.originalUrl
  }
  if (!isProd) {
    // Exclude sensitive headers
    const { authorization, cookie, ...safeHeaders } = req.headers || {}
    requestInfo.headers = safeHeaders
    requestInfo.body = req.body
    requestInfo.query = req.query
  }

  logError(err, requestInfo)

  // Determine and validate status code
  let rawCode = err.statusCode || err.status
  let statusCode = parseInt(rawCode, 10)
  if (!isValidStatusCode(statusCode)) {
    statusCode = 500
  }

  // Decide message for client
  const message = (isProd && statusCode === 500)
    ? 'Internal Server Error'
    : err.message || 'Error'

  const payload = { message }

  if (!isProd) {
    if (err.stack) {
      // Truncate stack trace to first 5 lines to limit leakage
      payload.stack = err.stack.split('\n').slice(0, 5).join('\n')
    }
    if (err.details) {
      payload.details = err.details
    }
  }

  res.status(statusCode).json(payload)
}

module.exports = errorHandler