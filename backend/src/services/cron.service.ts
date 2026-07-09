import cron from 'node-cron';
import { DbService } from './db.service.js';
import { EmailService } from './email.service.js';
import { ObjectId } from 'mongodb';

export class CronService {
  private static instance: CronService | null = null;
  private dbService = DbService.getInstance();
  private emailService = EmailService.getInstance();

  private constructor() {}

  public static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  public initialize(): void {
    console.log('Initializing scheduled cron jobs...');

    // 1. Overdue Obligations Alert — daily at 08:00 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('[Cron] Running daily Overdue Obligations alert task...');
      try {
        const obligationsCollection = await this.dbService.getCollection('obligations');
        const usersCollection = await this.dbService.getCollection('users');
        const docsCollection = await this.dbService.getCollection('documents');

        const now = new Date();
        const overdueList = await obligationsCollection.find({
          status: 'pending',
          due_date: { $lt: now },
        }).toArray();

        for (const item of overdueList) {
          const doc = await docsCollection.findOne({ _id: item.document_id });
          const adminUser = await usersCollection.findOne({ org_id: item.org_id, role: 'admin' });

          if (adminUser) {
            await this.emailService.sendObligationOverdueEmail(
              adminUser.email,
              item.raw_text,
              doc?.name || 'Contract'
            );
          }
        }
      } catch (err) {
        console.error('[Cron] Overdue Obligations alert task failed:', err);
      }
    });

    // 2. Matter Timeline Deadlines Alert — daily at 09:00 AM (for events in next 7 days)
    cron.schedule('0 9 * * *', async () => {
      console.log('[Cron] Running daily Matter Deadlines alert task...');
      try {
        const mattersCollection = await this.dbService.getCollection('matters');
        const usersCollection = await this.dbService.getCollection('users');

        const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();

        // Let's check matters timeline events
        const matters = await mattersCollection.find({}).toArray();

        for (const matter of matters) {
          const events = matter.timeline || [];
          for (const ev of events) {
            const evDate = new Date(ev.date);
            if (evDate > now && evDate <= sevenDaysLater) {
              // Get admin user for the org
              const adminUser = await usersCollection.findOne({ org_id: matter.org_id, role: 'admin' });
              if (adminUser) {
                await this.emailService.sendDeadlineAlertEmail(
                  adminUser.email,
                  matter.name || 'Matter',
                  ev.title || 'Timeline Event',
                  evDate.toDateString()
                );
              }
            }
          }
        }
      } catch (err) {
        console.error('[Cron] Matter Deadlines alert task failed:', err);
      }
    });

    // 3. Active Negotiation Deadlines Warning — daily at 05:00 PM (for deadlines < 48 hours)
    cron.schedule('0 17 * * *', async () => {
      console.log('[Cron] Running daily Negotiation Deadlines alert task...');
      try {
        const negotiationsCollection = await this.dbService.getCollection('negotiations');
        const usersCollection = await this.dbService.getCollection('users');
        const docsCollection = await this.dbService.getCollection('documents');

        const fortyEightHoursLater = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const now = new Date();

        const activeNegs = await negotiationsCollection.find({
          status: 'active',
          deadline: { $gt: now, $lt: fortyEightHoursLater },
        }).toArray();

        for (const neg of activeNegs) {
          const doc = await docsCollection.findOne({ _id: neg.contractId });
          const adminUser = await usersCollection.findOne({ org_id: neg.orgId, role: 'admin' });

          if (adminUser && doc) {
            const portalUrl = `http://localhost:5173/negotiations/${neg._id.toString()}`;
            await this.emailService.sendNegotiationCounterEmail(
              adminUser.email,
              'Bilateral counterparty (urgent deadline)',
              doc.name || 'Contract',
              portalUrl
            );
          }
        }
      } catch (err) {
        console.error('[Cron] Negotiation Deadlines alert task failed:', err);
      }
    });

    // 4. Expiry & Renewal Alerts — daily at 10:00 AM (for documents expiring in next 30 days)
    cron.schedule('0 10 * * *', async () => {
      console.log('[Cron] Running daily Expiry & Renewal alerts task...');
      try {
        const docsCollection = await this.dbService.getCollection('documents');
        const usersCollection = await this.dbService.getCollection('users');

        const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const now = new Date();

        const expiringDocs = await docsCollection.find({
          expiryDate: { $gt: now, $lt: thirtyDaysLater }
        }).toArray();

        for (const doc of expiringDocs) {
          const adminUser = await usersCollection.findOne({ org_id: doc.org_id, role: 'admin' });
          if (adminUser) {
            await this.emailService.sendRenewalAlertEmail(
              adminUser.email,
              doc.name || 'Contract',
              new Date(doc.expiryDate).toDateString()
            );
          }
        }
      } catch (err) {
        console.error('[Cron] Expiry & Renewal alerts task failed:', err);
      }
    });

    // 5. Weekly Digest — every Friday at 5:00 PM
    cron.schedule('0 17 * * 5', async () => {
      console.log('[Cron] Running weekly digest summary task...');
      try {
        const usersCollection = await this.dbService.getCollection('users');
        const mattersCollection = await this.dbService.getCollection('matters');
        const approvalsCollection = await this.dbService.getCollection('approvalInstances');
        const obligationsCollection = await this.dbService.getCollection('obligations');

        const admins = await usersCollection.find({ role: 'admin' }).toArray();

        for (const admin of admins) {
          const activeMattersCount = await mattersCollection.countDocuments({ org_id: admin.org_id });
          const pendingApprovalsCount = await approvalsCollection.countDocuments({ org_id: admin.org_id, status: 'pending' });
          const overdueObligationsCount = await obligationsCollection.countDocuments({
            org_id: admin.org_id,
            status: 'pending',
            due_date: { $lt: new Date() }
          });

          await this.emailService.sendWeeklyDigestEmail(admin.email, {
            activeMatters: activeMattersCount,
            pendingApprovals: pendingApprovalsCount,
            overdueObligations: overdueObligationsCount,
          });
        }
      } catch (err) {
        console.error('[Cron] Weekly digest summary task failed:', err);
      }
    });
  }
}
export default CronService;
