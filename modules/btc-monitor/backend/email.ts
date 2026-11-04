import nodemailer from "nodemailer";
export function emailStatus() {
  return {
    enabled: process.env.BTC_EMAIL_ENABLED === "true",
    configured: [
      "BTC_SMTP_HOST",
      "BTC_SMTP_USER",
      "BTC_SMTP_PASSWORD",
      "BTC_EMAIL_TO",
    ].every((k) => !!process.env[k]),
  };
}
export async function sendEmail(subject: string, text: string): Promise<void> {
  const status = emailStatus();
  if (!status.enabled || !status.configured)
    throw new Error("邮件未启用或未配置");
  const port = Number(process.env.BTC_SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.BTC_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      user: process.env.BTC_SMTP_USER,
      pass: process.env.BTC_SMTP_PASSWORD,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  try {
    const result = await transport.sendMail({
      from: process.env.BTC_SMTP_USER,
      to: process.env.BTC_EMAIL_TO,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("邮件未被全部收件服务器接受");
  } finally {
    transport.close();
  }
}
