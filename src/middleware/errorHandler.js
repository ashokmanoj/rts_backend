/**
 * Global Express error handler.
 * Catches anything passed to next(err).
 */
function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  console.error(`[ERROR] ${req.method} ${req.path} —`, err.message);

  // Multer file-size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `File too large. Max size is ${process.env.MAX_FILE_SIZE_MB || 10} MB.`,
    });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error." });
}

module.exports = errorHandler;
