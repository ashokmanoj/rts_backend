const smtpPort = parseInt(process.env.SMTP_PORT) || 465;
const isSecure = smtpPort === 465;

let config = {
  mailer: {
    host: process.env.MAILER_HOST || process.env.SMTP_HOST,
    port: smtpPort,
    name: "noreply",
    secure: isSecure,
    requireTLS: !isSecure,  // force STARTTLS upgrade for port 587
    auth: {
      user: process.env.MAILER_USER || process.env.SMTP_USER,
      pass: process.env.MAILER_PASS || process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: true,
    }
  },

  mailUser: {
    email: process.env.SMTP_FROM || process.env.MAILER_USER || process.env.SMTP_USER
  },

}

module.exports = config;