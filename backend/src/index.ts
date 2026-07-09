import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { DbService } from './services/db.service.js';
import { QdrantService } from './services/qdrant.service.js';
import { CronService } from './services/cron.service.js';

// Routers
import authRouter from './routes/auth.routes.js';
import mattersRouter from './routes/matters.routes.js';
import documentsRouter from './routes/documents.routes.js';
import qaRouter from './routes/qa.routes.js';
import playbookRouter from './routes/playbook.routes.js';
import commentsRouter from './routes/comments.routes.js';
import approvalsRouter from './routes/approvals.routes.js';
import obligationsRouter from './routes/obligations.routes.js';
import counterpartiesRouter from './routes/counterparties.routes.js';
import diligenceRouter from './routes/diligence.routes.js';
import signaturesRouter from './routes/signatures.routes.js';
import portalRouter from './routes/portal.routes.js';
import reviewQueueRouter from './routes/review-queue.routes.js';
import researchRouter from './routes/research.routes.js';
import draftRouter from './routes/draft.routes.js';
import negotiationRouter from './routes/negotiation.routes.js';
import graphRouter from './routes/graph.routes.js';
import settingsRouter from './routes/settings.routes.js';
import webhooksRouter from './routes/webhooks.routes.js';
import invoicesRouter from './routes/invoices.routes.js';
import renewalsRouter from './routes/renewals.routes.js';
import requestsRouter from './routes/requests.routes.js';
import templatesRouter from './routes/templates.routes.js';
import organizationRouter from './routes/organization.routes.js';
import adminRouter from './routes/admin.routes.js';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Raw binary body parsers for PDF/File upload routes (MUST be registered before general JSON parser)
app.use('/api/v1/matters/:matterId/documents', express.raw({ type: 'application/pdf', limit: '10mb' }));
app.use('/api/v1/matters/:matterId/documents/:docId/versions', express.raw({ type: 'application/pdf', limit: '10mb' }));
app.use('/api/v1/obligations/:id/evidence', express.raw({ type: '*/*', limit: '10mb' }));

// General JSON body parser
app.use(express.json());

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', authRouter); // /users/me, /users/me/password etc live in auth router
app.use('/api/v1/matters', mattersRouter);
app.use('/api/v1/matters', documentsRouter);
app.use('/api/v1/matters', qaRouter);
app.use('/api/v1/playbook', playbookRouter);
app.use('/api/v1/comments', commentsRouter);
app.use('/api/v1/approvals', approvalsRouter);
app.use('/api/v1/obligations', obligationsRouter);
app.use('/api/v1/counterparties', counterpartiesRouter);
app.use('/api/v1/diligence', diligenceRouter);
app.use('/api/v1/signatures', signaturesRouter);
app.use('/api/v1/portal', portalRouter);
app.use('/api/v1/review-queue', reviewQueueRouter);
app.use('/api/v1/research', researchRouter);
app.use('/api/v1/draft', draftRouter);
app.use('/api/v1/negotiations', negotiationRouter);
app.use('/api/v1/graph', graphRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/webhooks', webhooksRouter);
app.use('/api/v1/invoices', invoicesRouter);
app.use('/api/v1/renewals', renewalsRouter);
app.use('/api/v1/requests', requestsRouter);
app.use('/api/v1/templates', templatesRouter);
app.use('/api/v1/organization', organizationRouter);
app.use('/api/v1/admin', adminRouter);


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Boot server
async function startServer() {
  try {
    // 1. Initialize MongoDB connection
    const dbService = DbService.getInstance();
    await dbService.connect();

    // 2. Initialize Qdrant Cloud Vector DB collections
    const qdrantService = QdrantService.getInstance();
    await qdrantService.ensureCollection('legal_documents');

    // 3. Initialize Cron schedules
    const cronService = CronService.getInstance();
    cronService.initialize();

    app.listen(PORT, () => {
      console.log(`LawyerOS Backend is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start LawyerOS Backend server:', error);
    process.exit(1);
  }
}

startServer();
