import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";

const sans =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const serif = "Georgia,'Times New Roman',Times,serif";
const mono =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

const paper = "#F5F0E6";
const ink = "#0C0C0B";
const muted = "#6b6b6b";
const line = "#e5e2dc";
const primary = "#1B2B4D";
const primaryFg = "#F5F0E6";
const accent = "#B8862B";
const surface = "#f7f7f5";
const white = "#ffffff";

const logoUrl =
  "https://drive.amfphub.com/api/public/dl/3eIu24y8?inline=true";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyText(html: string): string {
  return `<p style="margin:0;font-family:${sans};font-size:15px;line-height:1.65;color:${ink};">${html}</p>`;
}

function mutedText(html: string): string {
  return `<p style="margin:0;font-family:${sans};font-size:13px;line-height:1.55;color:${muted};">${html}</p>`;
}

function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
      <tr>
        <td align="center" style="border-radius:8px;background-color:${primary};">
          <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${sans};font-size:15px;font-weight:600;color:${primaryFg};text-decoration:none;border-radius:8px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function infoPanel(innerHtml: string): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;">
      <tr>
        <td style="background-color:${surface};border:1px solid ${line};border-radius:12px;padding:20px 18px;">
          ${innerHtml}
        </td>
      </tr>
    </table>
  `;
}

function fieldLabel(text: string): string {
  return `<p style="margin:0 0 6px;font-family:${sans};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${muted};">${text}</p>`;
}

function fieldValue(text: string, emphasize = false): string {
  const color = emphasize ? primary : ink;
  const weight = emphasize ? "700" : "500";
  return `<p style="margin:0;font-family:${sans};font-size:15px;font-weight:${weight};line-height:1.45;color:${color};">${text}</p>`;
}

function layout(title: string, heading: string, innerHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${paper};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${paper};">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${white};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="height:4px;background-color:${primary};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:32px 36px 8px;">
            <img src="${logoUrl}" alt="answr" width="112" style="display:block;height:auto;max-width:112px;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 8px;">
            <h1 style="margin:0;font-family:${serif};font-size:26px;font-weight:400;color:${primary};line-height:1.25;letter-spacing:-0.01em;">
              ${escapeHtml(heading)}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 32px;">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="border-top:1px solid ${line};padding-top:20px;">
                  <p style="margin:0;font-family:${sans};font-size:12px;line-height:1.5;color:${muted};text-align:center;">
                    © ${new Date().getFullYear()} answr
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

class MailService {
  private readonly transporter: Transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPassword,
    },
  });
  private readonly source = "modules/mail/mail.service.ts";

  constructor() {
    void this.transporter
      .verify()
      .then(() => {
        logger.debug("SMTP connection is ready", this.source, "verify");
      })
      .catch((error: unknown) => {
        logger.error(
          error instanceof Error ? error.message : String(error),
          this.source,
          "verify",
        );
      });
  }

  private async sendMail(options: {
    to: string | string[];
    subject: string;
    html: string;
    attachments?: SendMailOptions["attachments"];
  }): Promise<void> {
    await this.transporter.sendMail({
      from: `answr <${env.mailFrom}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });
  }

  async sendWelcome(to: string): Promise<boolean> {
    const dashboardUrl = `${env.frontendUrl.replace(/\/$/, "")}/dashboard`;
    const safeUrl = escapeHtml(dashboardUrl);

    try {
      await this.sendMail({
        to,
        subject: "Welcome to answr",
        html: layout(
          "Welcome to answr",
          "Welcome aboard",
          `
            ${bodyText("Your account is ready. You’re all set to build AI-powered experiences with answr.")}
            <div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>
            ${ctaButton(safeUrl, "Go to dashboard")}
            <div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
            ${mutedText("Need a hand? Reply to this email anytime   we’re glad you’re here.")}
          `,
        ),
      });

      logger.debug(`Welcome email sent to ${to}`, this.source, "sendWelcome");
      return true;
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        "sendWelcome",
      );
      return false;
    }
  }

  async sendOtp(to: string, otp: string): Promise<boolean> {
    try {
      await this.sendMail({
        to,
        subject: "Your verification code",
        html: layout(
          "Verification code",
          "Verify your email",
          `
            ${bodyText("Use this one-time code to finish signing up. It expires shortly   don’t share it with anyone.")}
            <p style="margin:28px 0;font-family:${mono};font-size:32px;font-weight:700;letter-spacing:0.35em;color:${primary};text-align:center;">
              ${escapeHtml(otp)}
            </p>
            ${mutedText("If you didn’t request this, you can ignore this email.")}
          `,
        ),
      });

      logger.debug(`OTP email sent to ${to}`, this.source, "sendOtp");
      return true;
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        "sendOtp",
      );
      return false;
    }
  }

  async sendResetPasswordLink(to: string, resetUrl: string): Promise<boolean> {
    try {
      const safeUrl = escapeHtml(resetUrl);
      await this.sendMail({
        to,
        subject: "Reset your password",
        html: layout(
          "Reset your password",
          "Reset your password",
          `
            ${bodyText("Click the button below to choose a new password. This link expires shortly.")}
            <div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>
            ${ctaButton(safeUrl, "Reset password")}
            <div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
            ${mutedText(`Or copy and paste this link into your browser:<br /><a href="${safeUrl}" style="color:${accent};word-break:break-all;">${safeUrl}</a>`)}
            <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
            ${mutedText("If you didn't request this, you can ignore this email.")}
          `,
        ),
      });

      logger.debug(
        `Reset password email sent to ${to} - ${resetUrl}`,
        this.source,
        "sendResetPasswordLink",
      );
      return true;
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        "sendResetPasswordLink",
      );
      return false;
    }
  }

  async sendLiveAgentTicketCreated(
    to: string,
    details: {
      projectLabel: string;
      queuePosition: number | null;
      visitorPreview: string;
      joinCode: string;
    },
  ): Promise<boolean> {
    const trimmedTo = to.trim().toLowerCase();
    if (!trimmedTo) return false;

    const positionLabel =
      details.queuePosition != null
        ? `#${details.queuePosition} in queue`
        : "Queued";
    const preview = details.visitorPreview.trim() || "No message preview";
    const project = details.projectLabel.trim() || "Your project";
    const joinCode = details.joinCode.trim().toUpperCase();
    const loginUrl = new URL(
      "/liveagent/login",
      `${env.frontendUrl.replace(/\/$/, "")}/`,
    );
    if (joinCode) {
      loginUrl.searchParams.set("code", joinCode);
    }
    const safeLoginUrl = escapeHtml(loginUrl.toString());

    try {
      await this.sendMail({
        to: trimmedTo,
        subject: `Live agent request   ${project}`,
        html: layout(
          "Live agent request",
          "A visitor wants a live agent",
          `
            ${bodyText(`Someone requested a live agent for <strong style="font-weight:600;">${escapeHtml(project)}</strong>.`)}
            ${infoPanel(`
              ${fieldLabel("Status")}
              <div style="margin:0 0 16px;">${fieldValue(escapeHtml(positionLabel), true)}</div>
              ${fieldLabel("Latest message")}
              ${fieldValue(escapeHtml(preview))}
              ${
                joinCode
                  ? `
              <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
              ${fieldLabel("Join code")}
              ${fieldValue(escapeHtml(joinCode), true)}
              `
                  : ""
              }
            `)}
            <div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
            ${ctaButton(safeLoginUrl, "Sign in to claim ticket")}
            <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
            ${mutedText(`Or open this link:<br /><a href="${safeLoginUrl}" style="color:${accent};word-break:break-all;">${safeLoginUrl}</a>`)}
          `,
        ),
      });

      logger.debug(
        `Live agent ticket email sent to ${trimmedTo}`,
        this.source,
        "sendLiveAgentTicketCreated",
      );
      return true;
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        "sendLiveAgentTicketCreated",
      );
      return false;
    }
  }

  async sendMeetingBookingConfirmation(
    to: string[],
    details: {
      topicName: string;
      startsAt: string;
      timezone: string;
      durationMinutes: number;
      fieldValues: Array<{ label: string; value: string }>;
    },
  ): Promise<boolean> {
    const recipients = [
      ...new Set(
        to
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0),
      ),
    ];
    if (recipients.length === 0) return false;

    const topicName = details.topicName.trim() || "Meeting";
    let whenLabel = details.startsAt;
    try {
      whenLabel = new Intl.DateTimeFormat(undefined, {
        timeZone: details.timezone,
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(details.startsAt));
    } catch {
      whenLabel = details.startsAt;
    }
    const tz = details.timezone.trim() || "UTC";
    const fieldsHtml = details.fieldValues
      .map(
        (f) => `
          <div style="margin:0 0 14px;">
            ${fieldLabel(escapeHtml(f.label))}
            ${fieldValue(escapeHtml(f.value || " "))}
          </div>
        `,
      )
      .join("");

    try {
      await this.sendMail({
        to: recipients,
        subject: `Meeting confirmed   ${topicName}`,
        html: layout(
          "Meeting confirmed",
          "Meeting confirmed",
          `
            ${bodyText(`A meeting for <strong style="font-weight:600;">${escapeHtml(topicName)}</strong> is booked.`)}
            ${infoPanel(`
              <div style="margin:0 0 16px;">
                ${fieldLabel("When")}
                ${fieldValue(escapeHtml(whenLabel), true)}
              </div>
              <div style="margin:0 0 16px;">
                ${fieldLabel("Timezone")}
                ${fieldValue(escapeHtml(tz))}
              </div>
              <div style="margin:0 0 ${fieldsHtml ? "16px" : "0"};">
                ${fieldLabel("Duration")}
                ${fieldValue(`${details.durationMinutes} minutes`)}
              </div>
              ${fieldsHtml}
            `)}
          `,
        ),
      });

      logger.debug(
        `Meeting confirmation email sent to ${recipients.join(", ")}`,
        this.source,
        "sendMeetingBookingConfirmation",
      );
      return true;
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        "sendMeetingBookingConfirmation",
      );
      return false;
    }
  }

  async sendPaymentActivated(
    to: string,
    details: {
      planName: string;
      effectiveDate: Date;
      untilDate: Date;
      amount: number;
      invoiceId: string;
      invoicePdf: Buffer;
      invoiceFilename: string;
    },
  ): Promise<boolean> {
    const trimmedTo = to.trim().toLowerCase();
    if (!trimmedTo) return false;

    const planName = details.planName.trim() || "Plan";
    const formatDate = (date: Date) =>
      new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(date);
    const amountLabel = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    })
      .format(details.amount)
      .replace(/\u00a0/g, " ");
    const fromLabel = formatDate(details.effectiveDate);
    const untilLabel = formatDate(details.untilDate);
    const dashboardUrl = `${env.frontendUrl.replace(/\/$/, "")}/dashboard`;
    const safeUrl = escapeHtml(dashboardUrl);
    const filename =
      details.invoiceFilename.trim() || `invoice-${details.invoiceId}.pdf`;

    try {
      await this.sendMail({
        to: trimmedTo,
        subject: `Payment confirmed   ${planName}`,
        attachments: [
          {
            filename,
            content: details.invoicePdf,
            contentType: "application/pdf",
          },
        ],
        html: layout(
          "Payment confirmed",
          "Thank you for your payment",
          `
            ${bodyText(
              `Your <strong style="font-weight:600;">${escapeHtml(planName)}</strong> plan is now active. Your invoice is attached to this email.`,
            )}
            ${infoPanel(`
              <div style="margin:0 0 16px;">
                ${fieldLabel("Plan")}
                ${fieldValue(escapeHtml(planName), true)}
              </div>
              <div style="margin:0 0 16px;">
                ${fieldLabel("Activated from")}
                ${fieldValue(escapeHtml(fromLabel))}
              </div>
              <div style="margin:0 0 16px;">
                ${fieldLabel("Active until")}
                ${fieldValue(escapeHtml(untilLabel))}
              </div>
              <div style="margin:0 0 16px;">
                ${fieldLabel("Amount")}
                ${fieldValue(escapeHtml(amountLabel))}
              </div>
              <div style="margin:0;">
                ${fieldLabel("Invoice")}
                ${fieldValue(escapeHtml(details.invoiceId))}
              </div>
            `)}
            <div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>
            ${ctaButton(safeUrl, "Go to dashboard")}
            <div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
            ${mutedText("Dates are shown in WIB (Asia/Jakarta). Reply if you need help with your account.")}
          `,
        ),
      });

      logger.debug(
        `Payment activated email sent to ${trimmedTo} invoice=${details.invoiceId}`,
        this.source,
        "sendPaymentActivated",
      );
      return true;
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        "sendPaymentActivated",
      );
      return false;
    }
  }
}

export const mailer = new MailService();
