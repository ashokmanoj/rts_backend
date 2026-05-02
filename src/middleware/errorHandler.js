/**
 * Global Express error handler.
 * Catches anything passed to next(err).
 */
function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  console.error(`[ERROR] ${req.method} ${req.path} —`, err.message);

  const isDev = process.env.NODE_ENV === "development";

  // Multer file-size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `File too large. Max size is ${process.env.MAX_FILE_SIZE_MB || 10} MB.`,
    });
  }

  const status = err.status || 500;
  
  // Only show detailed error message if in development or if it's a client error (4xx)
  const errorMessage = (isDev || status < 500) 
    ? (err.message || "Internal server error.") 
    : "Internal server error.";

  res.status(status).json({ error: errorMessage });
}

module.exports = errorHandler;
