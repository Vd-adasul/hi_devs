import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { draftingAgent } from '../mastra/index.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Create a Draft Clause
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { clauseType, context, templateId, matterId } = req.body;

  if (!clauseType || !context) {
    return res.status(400).json({ error: 'clauseType and context fields are required.' });
  }

  try {
    // Fetch template if provided
    let templateText = 'No reference template provided.';
    if (templateId) {
      const templatesCollection = await dbService.getCollection('templates');
      const template = await templatesCollection.findOne({ _id: new ObjectId(templateId), org_id: orgId });
      if (template) {
        templateText = `Reference Template: ${template.content}`;
      }
    }

    const prompt = `
      You are an elite contract drafting attorney.
      Your task is to draft a contract clause of type "${clauseType}".

      Draft Context (Parameters):
      ${JSON.stringify(context, null, 2)}

      ${templateText}

      Please generate a primary draft that is balanced, legally sound, and conforms to standard drafting practices.
      Also, generate 2 alternative drafts representing different negotiating postures:
      - Alternative 1: A version heavily favorable to our side ("pro-client").
      - Alternative 2: A version favorable to the other side ("pro-counterparty").

      Format your output as a valid JSON object matching this structure:
      {
        "draftText": "The primary balanced clause text...",
        "alternatives": [
          {
            "optionText": "Alternative clause text...",
            "favorability": "pro-client" | "pro-counterparty",
            "reasoning": "Brief explanation of the legal leverage or posture in this version."
          }
        ]
      }
      Do not wrap in markdown or backticks.
    `;

    console.log('Draft: Calling Mastra Drafting Agent to generate clauses...');
    const agentRes = await draftingAgent.generate(prompt);
    
    let parsed;
    try {
      const cleanJson = agentRes.text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse draft JSON from agent, falling back:', e);
      parsed = {
        draftText: `Draft of ${clauseType} based on parameters.`,
        alternatives: [
          { optionText: `Pro-Client draft of ${clauseType}.`, favorability: 'pro-client', reasoning: 'Favorable posture' },
          { optionText: `Pro-Counterparty draft of ${clauseType}.`, favorability: 'pro-counterparty', reasoning: 'Conceded posture' },
        ],
      };
    }

    // Save in drafts collection
    const draftsCollection = await dbService.getCollection('drafts');
    const newDraft = {
      org_id: orgId,
      matter_id: matterId ? new ObjectId(matterId) : null,
      clauseType,
      context,
      primaryDraft: parsed.draftText,
      alternatives: parsed.alternatives,
      created_at: new Date(),
      createdBy: req.user?.userId || 'system',
    };
    const insertRes = await draftsCollection.insertOne(newDraft);

    return res.status(201).json({
      message: 'Draft clause generated.',
      draftId: insertRes.insertedId,
      draftText: parsed.draftText,
      alternatives: parsed.alternatives,
    });

  } catch (error: any) {
    console.error('Draft generation failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. List Org Templates
router.get('/templates', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const templatesCollection = await dbService.getCollection('templates');
    const list = await templatesCollection.find({ org_id: orgId }).toArray();
    return res.json({ data: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
