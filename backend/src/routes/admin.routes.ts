import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// ==========================================
// 1. Users Admin Endpoints
// ==========================================

router.get('/users', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const usersColl = await dbService.getCollection('users');
    const users = await usersColl.find({ org_id: orgId }).project({ password: 0 }).toArray();
    return res.json({ data: users, users });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/users', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { email, role, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const usersColl = await dbService.getCollection('users');
    const existing = await usersColl.findOne({ email });

    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const newUser = {
      email,
      name: name || email.split('@')[0],
      roles: [role || 'lawyer'],
      orgId,
      created_at: new Date()
    };

    const insertRes = await usersColl.insertOne(newUser);
    return res.status(201).json({ message: 'User added successfully.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const usersColl = await dbService.getCollection('users');
    const deleteRes = await usersColl.deleteOne({ _id: new ObjectId(id), orgId });

    if (deleteRes.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ message: 'User removed successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. Roles Endpoints
// ==========================================

router.get('/roles', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const rolesColl = await dbService.getCollection('roles');
    const roles = await rolesColl.find({ org_id: orgId }).toArray();
    return res.json({ data: roles, roles });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. Integrations Endpoints
// ==========================================

router.get('/integrations', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const integrationsColl = await dbService.getCollection('integrations');
    const integrations = await integrationsColl.find({ org_id: orgId }).toArray();
    return res.json({ data: integrations, integrations });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/integrations', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { provider, config } = req.body;

  try {
    const integrationsColl = await dbService.getCollection('integrations');
    const newIntegration = {
      org_id: orgId,
      provider,
      config: config || {},
      status: 'active',
      created_at: new Date()
    };

    const insertRes = await integrationsColl.insertOne(newIntegration);
    return res.status(201).json({ message: 'Integration added successfully.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/integrations/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const integrationsColl = await dbService.getCollection('integrations');
    await integrationsColl.deleteOne({ _id: new ObjectId(id), org_id: orgId });
    return res.json({ message: 'Integration deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. Skills Endpoints
// ==========================================

router.get('/skills', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const skillsColl = await dbService.getCollection('skills');
    const skills = await skillsColl.find({ org_id: orgId }).toArray();
    return res.json({ data: skills, skills });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
