import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. List templates
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const templatesColl = await dbService.getCollection('templates');
    const list = await templatesColl.find({ org_id: orgId }).sort({ created_at: -1 }).toArray();
    return res.json({ data: list, templates: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Create template
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name, description, contractType, variables, sections } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Template name is required.' });
  }

  try {
    const templatesColl = await dbService.getCollection('templates');
    const newTemplate = {
      org_id: orgId,
      name,
      description: description || '',
      contract_type: contractType || 'NDA',
      variables: variables || [],
      sections: sections || [],
      is_published: false,
      created_at: new Date(),
    };

    const insertRes = await templatesColl.insertOne(newTemplate);
    return res.status(201).json({ 
      message: 'Template created successfully.', 
      id: insertRes.insertedId,
      template: { _id: insertRes.insertedId, ...newTemplate }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get Single Template
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const templatesColl = await dbService.getCollection('templates');
    const template = await templatesColl.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!template) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    return res.json({ data: template, template });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Update Template
router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const updates = req.body;

  try {
    const templatesColl = await dbService.getCollection('templates');
    const updateFields: Record<string, any> = {};

    const allowed = ['name', 'description', 'contractType', 'variables', 'sections', 'is_published'];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        // Map camelCase to snake_case if necessary, or preserve
        const dbKey = key === 'contractType' ? 'contract_type' : (key === 'is_published' ? 'is_published' : key);
        updateFields[dbKey] = updates[key];
      }
    }

    updateFields.updated_at = new Date();

    const updateRes = await templatesColl.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      { $set: updateFields }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    return res.json({ message: 'Template updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
