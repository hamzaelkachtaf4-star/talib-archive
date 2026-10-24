const { mailDiagnostics, supportEmail } = require("../../../utils/law/mailer");

describe("mailDiagnostics", () => {
  test("nothing configured lists the exact variables to set", () => {
    const d = mailDiagnostics({});
    expect(d.configured).toBe(false);
    expect(d.problems.join("\n")).toMatch(/QANOUNI_GMAIL_USER/);
    expect(d.problems.join("\n")).toMatch(/QANOUNI_SMTP_HOST/);
  });

  test("gmail user without app password is a half configuration", () => {
    const d = mailDiagnostics({ QANOUNI_GMAIL_USER: "a@gmail.com" });
    expect(d.configured).toBe(false);
    expect(d.problems.join("\n")).toMatch(/QANOUNI_GMAIL_APP_PASSWORD/);
  });

  test("smtp user without password is flagged, and a bad port too", () => {
    const d = mailDiagnostics({ QANOUNI_SMTP_HOST: "smtp.x.ma", QANOUNI_SMTP_USER: "u", QANOUNI_SMTP_PORT: "abc" });
    expect(d.problems.join("\n")).toMatch(/QANOUNI_SMTP_PASS/);
    expect(d.problems.join("\n")).toMatch(/QANOUNI_SMTP_PORT/);
  });

  test("a complete smtp config has no problems and never echoes the password", () => {
    const env = { QANOUNI_SMTP_HOST: "smtp.x.ma", QANOUNI_SMTP_USER: "u", QANOUNI_SMTP_PASS: "s3cret!" };
    const d = mailDiagnostics(env);
    expect(d.configured).toBe(true);
    expect(d.problems).toEqual([]);
    expect(JSON.stringify(d)).not.toContain("s3cret!");
  });

  test("an unverified-looking sender domain mismatch is a warning, not a failure", () => {
    const d = mailDiagnostics({ QANOUNI_SMTP_HOST: "h", QANOUNI_MAIL_FROM: "not-an-address" });
    expect(d.warnings.join("\n")).toMatch(/QANOUNI_MAIL_FROM/);
  });
});

describe("supportEmail", () => {
  test("defaults to the official contact address and honours the override", () => {
    expect(supportEmail({})).toBe("contact@qanouni.ma");
    expect(supportEmail({ QANOUNI_SUPPORT_EMAIL: "support@x.ma" })).toBe("support@x.ma");
    expect(supportEmail({ QANOUNI_SUPPORT_EMAIL: "junk" })).toBe("contact@qanouni.ma");
  });
});
