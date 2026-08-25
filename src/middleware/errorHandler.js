/**
 * Global Express error handler.
 * Catches anything passed to next(err).
 */
function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  // Client disconnected before the response was sent — not a server error, skip entirely.
  const isAborted = req.aborted || req.destroyed ||
    err.code === "ECONNRESET" || err.type === "request.aborted" ||
    (typeof err.message === "string" && err.message.toLowerCase().includes("aborted"));
  if (isAborted) return;

  console.error(`[ERROR] ${req.method} ${req.path} —`, err.message);

  const isDev = process.env.NODE_ENV === "development";

  // Multer file-size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `File too large. Max size is ${process.env.MAX_FILE_SIZE_MB || 10} MB.`,
    });
  }

  // Multer unexpected field / too many files
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ error: "Too many files. Maximum 10 files allowed per request." });
  }

  const status = err.status || 500;
  
  // Only show detailed error message if in development or if it's a client error (4xx)
  const errorMessage = (isDev || status < 500) 
    ? (err.message || "Internal server error.") 
    : "Internal server error.";

  res.status(status).json({ error: errorMessage });
}

module.exports = errorHandler;
