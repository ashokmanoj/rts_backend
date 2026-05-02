let config = {
  mailer: {
    host: process.env.MAILER_HOST || process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    name: "noreply",
    secure: (parseInt(process.env.SMTP_PORT) || 465) === 465,
    logger: true,
    auth: {
      user: process.env.MAILER_USER || process.env.SMTP_USER,
      pass: process.env.MAILER_PASS || process.env.SMTP_PASS
    },
    tls: {
      // Ensure we validate certificates for security
      rejectUnauthorized: true,
    }
  },

  mailUser: {
    email: process.env.SMTP_FROM || process.env.MAILER_USER || process.env.SMTP_USER
  },

}

module.exports = config;