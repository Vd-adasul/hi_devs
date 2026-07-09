import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { EmailService } from '../services/email.service.js';
import { requireRole } from '../middleware/rbac.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const emailService = EmailService.getInstance();

// 1. Create Approval Workflow Definition
router.post('/workflows', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name, steps } = req.body; // steps = [{ order: 1, approverEmail: '...', role: '...' }]

  if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'name and non-empty steps array are required.' });
  }

  try {
    const workflowsCollection = await dbService.getCollection('approvalWorkflows');
    const newWorkflow = {
      org_id: orgId,
      name,
      steps: steps.sort((a, b) => a.order - b.order),
      created_at: new Date(),
    };

    const insertRes = await workflowsCollection.insertOne(newWorkflow);
    return res.status(201).json({ message: 'Approval workflow created.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. List Approval Workflows
router.get('/workflows', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const workflowsCollection = await dbService.getCollection('approvalWorkflows');
    const list = await workflowsCollection.find({ org_id: orgId }).toArray();
    return res.json({ data: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Start an Approval Instance for a Contract
router.post('/instances', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { workflowId, contractId } = req.body;

  if (!workflowId || !contractId) {
    return res.status(400).json({ error: 'workflowId and contractId are required.' });
  }

  try {
    const workflowsCollection = await dbService.getCollection('approvalWorkflows');
    const instancesCollection = await dbService.getCollection('approvalInstances');
    const docsCollection = await dbService.getCollection('documents');

    const workflow = await workflowsCollection.findOne({ _id: new ObjectId(workflowId), org_id: orgId });
    const document = await docsCollection.findOne({ _id: new ObjectId(contractId), org_id: orgId });

    if (!workflow || !document) {
      return res.status(404).json({ error: 'Workflow or Document not found.' });
    }

    const stepsInstance = workflow.steps.map((s: any) => ({
      order: s.order,
      approverEmail: s.approverEmail,
      role: s.role,
      status: 'pending',
      comment: '',
      decidedAt: null,
    }));

    const newInstance = {
      org_id: orgId,
      contractId: new ObjectId(contractId),
      workflowId: new ObjectId(workflowId),
      status: 'pending',
      currentStepIndex: 0,
      steps: stepsInstance,
      submittedBy: req.user?.userId,
      submittedAt: new Date(),
    };

    const insertRes = await instancesCollection.insertOne(newInstance);

    // Email first approver
    const firstApprover = stepsInstance[0];
    const reviewLink = `${req.headers.origin || 'http://localhost:5173'}/contracts/${contractId}`;
    await emailService.sendApprovalRequestEmail(
      firstApprover.approverEmail,
      document.name || 'Contract',
      'Matter Context',
      reviewLink
    );

    // Update document status
    await docsCollection.updateOne(
      { _id: new ObjectId(contractId) },
      { $set: { approvalStatus: 'pending' } }
    );

    return res.status(201).json({ message: 'Approval instance started.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Get My Pending Queue
router.get('/instances/queue', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  if (!req.user?.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const usersCollection = await dbService.getCollection('users');
    let userDetails;
    if (req.user.userId.length === 24) {
      userDetails = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    } else {
      userDetails = await usersCollection.findOne({ email: req.user.userId });
    }
    const myEmail = userDetails?.email || req.user.userId;

    const instancesCollection = await dbService.getCollection('approvalInstances');
    const activeInstances = await instancesCollection.find({
      org_id: orgId,
      status: 'pending',
    }).toArray();

    // Filter instances where current step is assigned to me
    const queue = activeInstances.filter(inst => {
      const idx = inst.currentStepIndex || 0;
      const step = inst.steps[idx];
      return step && step.approverEmail.toLowerCase() === myEmail.toLowerCase();
    });

    // Populate documents details for display
    const docsCollection = await dbService.getCollection('documents');
    const populated = await Promise.all(queue.map(async inst => {
      const doc = await docsCollection.findOne({ _id: inst.contractId });
      return {
        ...inst,
        contract: doc ? { id: doc._id.toString(), title: doc.name, type: doc.type } : null,
      };
    }));

    return res.json({ data: populated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Get All Org Approvals (Admin oversight)
router.get('/instances/all', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const instancesCollection = await dbService.getCollection('approvalInstances');
    const list = await instancesCollection.find({ org_id: orgId }).toArray();

    const docsCollection = await dbService.getCollection('documents');
    const populated = await Promise.all(list.map(async inst => {
      const doc = await docsCollection.findOne({ _id: inst.contractId });
      return {
        ...inst,
        contract: doc ? { id: doc._id.toString(), title: doc.name, type: doc.type } : null,
      };
    }));

    return res.json({ data: populated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. Approve Step
router.post('/instances/:id/approve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { comment } = req.body;

  try {
    const instancesCollection = await dbService.getCollection('approvalInstances');
    const docsCollection = await dbService.getCollection('documents');

    const instance = await instancesCollection.findOne({ _id: new ObjectId(id), org_id: orgId });
    if (!instance || instance.status !== 'pending') {
      return res.status(404).json({ error: 'Active approval instance not found.' });
    }

    const currentIdx = instance.currentStepIndex || 0;
    const currentStep = instance.steps[currentIdx];

    // Mark current step as approved
    const updatedSteps = [...instance.steps];
    updatedSteps[currentIdx] = {
      ...currentStep,
      status: 'approved',
      comment: comment || '',
      decidedAt: new Date(),
    };

    let nextStepIndex = currentIdx + 1;
    let nextStatus = 'pending';

    const document = await docsCollection.findOne({ _id: instance.contractId });

    if (nextStepIndex >= instance.steps.length) {
      // All steps approved
      nextStatus = 'approved';
      await docsCollection.updateOne(
        { _id: instance.contractId },
        { $set: { approvalStatus: 'approved' } }
      );
    } else {
      // Email next step approver
      const nextApprover = updatedSteps[nextStepIndex];
      const reviewLink = `${req.headers.origin || 'http://localhost:5173'}/contracts/${instance.contractId}`;
      await emailService.sendApprovalRequestEmail(
        nextApprover.approverEmail,
        document?.name || 'Contract',
        'Matter Context',
        reviewLink
      );
    }

    await instancesCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          steps: updatedSteps,
          currentStepIndex: nextStepIndex,
          status: nextStatus,
        },
      }
    );

    return res.json({ message: `Step approved successfully. Status: ${nextStatus}` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 7. Reject Step
router.post('/instances/:id/reject', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { comment } = req.body;

  try {
    const instancesCollection = await dbService.getCollection('approvalInstances');
    const docsCollection = await dbService.getCollection('documents');

    const instance = await instancesCollection.findOne({ _id: new ObjectId(id), org_id: orgId });
    if (!instance || instance.status !== 'pending') {
      return res.status(404).json({ error: 'Active approval instance not found.' });
    }

    const currentIdx = instance.currentStepIndex || 0;
    const currentStep = instance.steps[currentIdx];

    const updatedSteps = [...instance.steps];
    updatedSteps[currentIdx] = {
      ...currentStep,
      status: 'rejected',
      comment: comment || '',
      decidedAt: new Date(),
    };

    await instancesCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          steps: updatedSteps,
          status: 'rejected',
        },
      }
    );

    await docsCollection.updateOne(
      { _id: instance.contractId },
      { $set: { approvalStatus: 'rejected' } }
    );

    return res.json({ message: 'Approval instance rejected.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 8. Delegate Step
router.post('/instances/:id/delegate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { newApproverEmail } = req.body;

  if (!newApproverEmail) {
    return res.status(400).json({ error: 'newApproverEmail is required.' });
  }

  try {
    const instancesCollection = await dbService.getCollection('approvalInstances');
    const docsCollection = await dbService.getCollection('documents');

    const instance = await instancesCollection.findOne({ _id: new ObjectId(id), org_id: orgId });
    if (!instance || instance.status !== 'pending') {
      return res.status(404).json({ error: 'Active approval instance not found.' });
    }

    const currentIdx = instance.currentStepIndex || 0;
    const updatedSteps = [...instance.steps];
    updatedSteps[currentIdx].approverEmail = newApproverEmail;

    await instancesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { steps: updatedSteps } }
    );

    const document = await docsCollection.findOne({ _id: instance.contractId });
    const reviewLink = `${req.headers.origin || 'http://localhost:5173'}/contracts/${instance.contractId}`;
    await emailService.sendApprovalRequestEmail(
      newApproverEmail,
      document?.name || 'Contract',
      'Matter Context (Delegated)',
      reviewLink
    );

    return res.json({ message: `Approval step successfully delegated to ${newApproverEmail}.` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
