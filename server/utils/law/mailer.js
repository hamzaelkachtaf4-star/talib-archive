// Outgoing email (verification and reset codes) through nodemailer.
// Configure either a Gmail account with an app password (QANOUNI_GMAIL_USER + QANOUNI_GMAIL_APP_PASSWORD)
// or any SMTP server (QANOUNI_SMTP_HOST, _PORT, _SECURE, _USER, _PASS). QANOUNI_MAIL_FROM sets the sender.
// Without either, codes are written to the server log (and returned to the browser in development only),
// so local sign-up still works. Message bodies are never logged in production when SMTP is configured.
const { BRAND } = require("./brand");

let transportOverride = null;
let cached = null;

function mailConfig(env = process.env) {
  if (env.QANOUNI_GMAIL_USER && env.QANOUNI_GMAIL_APP_PASSWORD)
    return {
      transport: {
        service: "gmail",
        auth: { user: env.QANOUNI_GMAIL_USER, pass: env.QANOUNI_GMAIL_APP_PASSWORD },
      },
      from: env.QANOUNI_MAIL_FROM || `${BRAND.name.fr} <${env.QANOUNI_GMAIL_USER}>`,
    };
  if (env.QANOUNI_SMTP_HOST)
    return {
      transport: {
        host: env.QANOUNI_SMTP_HOST,
        port: Number(env.QANOUNI_SMTP_PORT || 587),
        secure: env.QANOUNI_SMTP_SECURE === "true",
        ...(env.QANOUNI_SMTP_USER
          ? { auth: { user: env.QANOUNI_SMTP_USER, pass: env.QANOUNI_SMTP_PASS || "" } }
          : {}),
      },
      from: env.QANOUNI_MAIL_FROM || `${BRAND.name.fr} <no-reply@example.invalid>`,
    };
  return null;
}

const DEFAULT_SUPPORT = "contact@qanouni.ma";
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Official address for complaints and legal support (QANOUNI_SUPPORT_EMAIL), falling back to the default. */
function supportEmail(env = process.env) {
  const v = String(env.QANOUNI_SUPPORT_EMAIL || "").trim();
  return ADDRESS.test(v) ? v : DEFAULT_SUPPORT;
}

/**
 * Why codes may not arrive: every missing or inconsistent variable, named exactly. Never includes secret
 * values. `problems` block delivery; `warnings` hurt deliverability (spam folder) only.
 */
function mailDiagnostics(env = process.env) {
  const problems = [];
  const warnings = [];
  const gmail = !!(env.QANOUNI_GMAIL_USER || env.QANOUNI_GMAIL_APP_PASSWORD);
  const smtp = !!env.QANOUNI_SMTP_HOST;
  if (!gmail && !smtp)
    problems.push(
      "No mail transport: set QANOUNI_GMAIL_USER + QANOUNI_GMAIL_APP_PASSWORD, or QANOUNI_SMTP_HOST (+ _PORT, _SECURE, _USER, _PASS)."
    );
  if (gmail && !(env.QANOUNI_GMAIL_USER && env.QANOUNI_GMAIL_APP_PASSWORD))
    problems.push(
      `Gmail is half configured: ${env.QANOUNI_GMAIL_USER ? "QANOUNI_GMAIL_APP_PASSWORD" : "QANOUNI_GMAIL_USER"} is empty (use a Google app password, not the account password).`
    );
  if (smtp) {
    if (env.QANOUNI_SMTP_PORT && !/^\d{1,5}$/.test(String(env.QANOUNI_SMTP_PORT)))
      problems.push("QANOUNI_SMTP_PORT must be a number (587 with STARTTLS, 465 with QANOUNI_SMTP_SECURE=true).");
    if (env.QANOUNI_SMTP_USER && !env.QANOUNI_SMTP_PASS)
      problems.push("QANOUNI_SMTP_USER is set but QANOUNI_SMTP_PASS is empty.");
  }
  if (env.QANOUNI_MAIL_FROM && !/<[^>]+@[^>]+>|^[^\s@]+@[^\s@]+$/.test(env.QANOUNI_MAIL_FROM))
    warnings.push('QANOUNI_MAIL_FROM is not a valid address, e.g. "Name <no-reply@yourdomain.ma>".');
  if (smtp && !env.QANOUNI_MAIL_FROM)
    warnings.push(
      "QANOUNI_MAIL_FROM is unset: mail goes out as no-reply@example.invalid and will be rejected or spammed. Use an address on your authenticated domain (SPF + DKIM + DMARC)."
    );
  return { configured: problems.length === 0, problems, warnings };
}

/** Console report for the operator; called once at boot. Secrets are never printed. */
function logMailStatus(env = process.env, log = console.log) {
  const d = mailDiagnostics(env);
  if (d.configured && !d.warnings.length) return d;
  log(`[${BRAND.name.fr}] ✉️  Email ${d.configured ? "configured with warnings" : "NOT configured: sign-up codes cannot be delivered"}`);
  [...d.problems, ...d.warnings].forEach((m) => log(`[${BRAND.name.fr}]    - ${m}`));
  log(`[${BRAND.name.fr}]    Support/complaints address shown to users: ${supportEmail(env)} (QANOUNI_SUPPORT_EMAIL)`);
  return d;
}

function mailConfigured() {
  return !!transportOverride || !!mailConfig();
}

/** Test seam: `fn(message)` receives every message instead of SMTP. */
function setMailTransport(fn) {
  transportOverride = fn;
}

async function sendMail({ to, subject, text, html }) {
  if (transportOverride) return transportOverride({ to, subject, text, html });
  const cfg = mailConfig();
  if (!cfg) return { delivered: false };
  if (!cached || cached.key !== JSON.stringify(cfg)) {
    const nodemailer = require("nodemailer");
    cached = { key: JSON.stringify(cfg), transporter: nodemailer.createTransport(cfg.transport) };
  }
  await cached.transporter.sendMail({ from: cfg.from, to, subject, text, html });
  return { delivered: true };
}

const COPY = {
  register: {
    subject: `${BRAND.name.ar} · رمز تأكيد البريد الإلكتروني / Code de vérification`,
    ar: `رمز تأكيد حسابك في ${BRAND.name.ar} هو:`,
    fr: `Votre code de vérification ${BRAND.name.fr} est :`,
  },
  reset: {
    subject: `${BRAND.name.ar} · رمز إعادة تعيين كلمة المرور / Réinitialisation`,
    ar: `رمز إعادة تعيين كلمة المرور في ${BRAND.name.ar} هو:`,
    fr: `Votre code de réinitialisation ${BRAND.name.fr} est :`,
  },
};

/** Sends a one-time code. Returns { delivered } (false when no mail transport is configured). */
async function sendCode({ to, code, purpose, minutes }) {
  const c = COPY[purpose] || COPY.register;
  const text = `${c.ar} ${code}\n${c.fr} ${code}\n\nصالح لمدة ${minutes} دقائق · Valable ${minutes} minutes.\nإن لم تطلب هذا الرمز فتجاهل الرسالة · Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;
  const html = `<div dir="rtl" style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;text-align:center">
<h2 style="margin:0 0 8px">${BRAND.name.ar} · ${BRAND.name.fr}</h2><p>${c.ar}</p>
<p dir="ltr" style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p>
<p dir="ltr" style="color:#555">${c.fr} <b>${code}</b></p>
<p style="color:#777;font-size:13px">صالح لمدة ${minutes} دقائق · Valable ${minutes} minutes</p></div>`;
  const r = await sendMail({ to, subject: c.subject, text, html });
  if (!r?.delivered && !transportOverride)
    console.log(
      `\n[${BRAND.name.fr}] ✉️  No mail transport configured. ${purpose} code for ${to}: ${code} (valid ${minutes} min)\n`
    );
  return { delivered: !!r?.delivered || !!transportOverride };
}

module.exports = { mailDiagnostics, logMailStatus, supportEmail, sendMail, sendCode, mailConfigured, mailConfig, setMailTransport };
