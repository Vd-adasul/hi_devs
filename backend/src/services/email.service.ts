import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

export class EmailService {
  private static instance: EmailService | null = null;
  private resend: Resend | null = null;
  private fromEmail = 'onboarding@resend.dev'; // Standard Resend sandbox domain, user can configure later

  private constructor() {
    const key = process.env.RESEND_API_KEY;
    if (key && !key.includes('YOUR_')) {
      try {
        this.resend = new Resend(key);
        console.log('Resend email service initialized successfully.');
      } catch (err) {
        console.error('Failed to initialize Resend:', err);
      }
    } else {
      console.warn('RESEND_API_KEY missing or placeholder. Email notifications will be printed to console only.');
    }
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      console.log(`[Email Stub] TO: ${to} | SUBJECT: ${subject} | CONTENT:\n${html.replace(/<[^>]*>/g, ' ').slice(0, 500)}...\n`);
      return true;
    }

    try {
      const data = await this.resend.emails.send({
        from: `LawyerOS <${this.fromEmail}>`,
        to,
        subject,
        html,
      });
      console.log(`Email successfully sent to ${to} via Resend. ID: ${data.data?.id}`);
      return true;
    } catch (err) {
      console.error(`Failed to send email to ${to} via Resend:`, err);
      // Fallback log
      console.log(`[Email Fallback Log] TO: ${to} | SUBJECT: ${subject} | CONTENT:\n${html.slice(0, 300)}...\n`);
      return false;
    }
  }

  public async sendInviteEmail(to: string, orgName: string, inviteLink: string): Promise<boolean> {
    const subject = `You've been invited to join ${orgName} on LawyerOS`;
    const html = `
      <h2>Welcome to LawyerOS</h2>
      <p>You have been invited to join the <strong>${orgName}</strong> workspace on LawyerOS.</p>
      <p>To accept this invitation and set up your account, please click the link below:</p>
      <p><a href="${inviteLink}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:4px;">Join Workspace</a></p>
      <p>If you did not expect this invitation, please ignore this email.</p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendDeadlineAlertEmail(to: string, matterName: string, eventName: string, dueDate: string): Promise<boolean> {
    const subject = `[Urgent] Legal Deadline approaching for Matter: ${matterName}`;
    const html = `
      <h2>Upcoming Matter Deadline Warning</h2>
      <p>This is an automated alert that an important timeline event is approaching for the matter <strong>${matterName}</strong>.</p>
      <ul>
        <li><strong>Event:</strong> ${eventName}</li>
        <li><strong>Due Date:</strong> ${dueDate}</li>
      </ul>
      <p>Please review and complete any associated tasks in your LawyerOS workspace.</p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendApprovalRequestEmail(to: string, contractTitle: string, matterName: string, approveLink: string): Promise<boolean> {
    const subject = `Action Required: Document Approval Requested for ${contractTitle}`;
    const html = `
      <h2>Document Approval Pending</h2>
      <p>A document requires your review and approval in LawyerOS.</p>
      <ul>
        <li><strong>Contract:</strong> ${contractTitle}</li>
        <li><strong>Matter:</strong> ${matterName}</li>
      </ul>
      <p>Please click below to review the contract, view AI risk flags, and provide your approval decision:</p>
      <p><a href="${approveLink}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:4px;">Review & Decide</a></p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendNegotiationCounterEmail(to: string, counterpartyName: string, contractTitle: string, portalLink: string): Promise<boolean> {
    const subject = `New Counter-Offer from ${counterpartyName} for ${contractTitle}`;
    const html = `
      <h2>Negotiation Offer Received</h2>
      <p>The counterparty <strong>${counterpartyName}</strong> has submitted a new offer/counter-proposal for the contract <strong>${contractTitle}</strong>.</p>
      <p>Click the link below to review the round timeline, check estimated ZOPA values, and generate your AI-assisted response:</p>
      <p><a href="${portalLink}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:4px;">Open Negotiation Portal</a></p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendSignatureRequestEmail(to: string, contractTitle: string, signLink: string): Promise<boolean> {
    const subject = `Signature Requested: ${contractTitle}`;
    const html = `
      <h2>E-Signature Requested</h2>
      <p>You have been requested to sign the contract <strong>${contractTitle}</strong>.</p>
      <p>To view the document and sign securely via OTP verification, click below:</p>
      <p><a href="${signLink}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:4px;">Sign Contract</a></p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendObligationOverdueEmail(to: string, obligationTitle: string, contractTitle: string): Promise<boolean> {
    const subject = `[Overdue Alert] Obligation outstanding: ${obligationTitle}`;
    const html = `
      <h2 style="color:#dc2626;">Overdue Obligation Alert</h2>
      <p>An obligation under <strong>${contractTitle}</strong> is now overdue.</p>
      <ul>
        <li><strong>Obligation:</strong> ${obligationTitle}</li>
      </ul>
      <p>Please resolve this immediately and upload completion evidence to avoid compliance penalties.</p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendDiligenceAccessEmail(to: string, roomName: string, accessLink: string): Promise<boolean> {
    const subject = `Access Granted: Virtual Diligence Room - ${roomName}`;
    const html = `
      <h2>Virtual Diligence Room Access</h2>
      <p>You have been granted secure access to the Virtual Diligence Room: <strong>${roomName}</strong>.</p>
      <p>Use the link below to view the due diligence files, add comments, or upload records:</p>
      <p><a href="${accessLink}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:4px;">Enter Diligence Room</a></p>
      <p>Your access token is embedded securely in the link. Do not share it.</p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendRenewalAlertEmail(to: string, contractTitle: string, renewalDate: string): Promise<boolean> {
    const subject = `[Renewal Warning] Contract upcoming renewal: ${contractTitle}`;
    const html = `
      <h2>Upcoming Contract Renewal Alert</h2>
      <p>This is an automated alert that the contract <strong>${contractTitle}</strong> is scheduled for renewal soon.</p>
      <ul>
        <li><strong>Renewal/Expiration Date:</strong> ${renewalDate}</li>
      </ul>
      <p>Please review notice windows and negotiate extensions/terminations inside LawyerOS if needed.</p>
    `;
    return this.sendEmail(to, subject, html);
  }

  public async sendWeeklyDigestEmail(to: string, stats: any): Promise<boolean> {
    const subject = `LawyerOS Weekly Workspace Digest`;
    const html = `
      <h2>Weekly Workspace Summary</h2>
      <p>Here is your weekly summary of activity across your LawyerOS digital twins and workflows:</p>
      <ul>
        <li><strong>Active Matters:</strong> ${stats.activeMatters}</li>
        <li><strong>Pending Approvals:</strong> ${stats.pendingApprovals}</li>
        <li><strong>Overdue Compliance Obligations:</strong> ${stats.overdueObligations}</li>
      </ul>
      <p>Log in to your workspace dashboard to action pending items.</p>
    `;
    return this.sendEmail(to, subject, html);
  }
}
export default EmailService;
