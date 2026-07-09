import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { benchmarkAgent, playbookComplianceAgent } from '../mastra/index.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// Helper to query Gemini API (via Mastra agents)
async function callAgent(agent: any, prompt: string): Promise<string> {
  const res = await agent.generate(prompt);
  return res.text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// 1. Get Playbook Positions
router.get('/playbook', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const playbookCollection = await dbService.getCollection('playbook');
    const positions = await playbookCollection.find({ org_id: orgId }).toArray();
    return res.json({ data: positions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Create Playbook Position
router.post('/playbook', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { clauseType, ourPosition, fallbackPosition, redLine, mustHave } = req.body;

  if (!clauseType || !ourPosition) {
    return res.status(400).json({ error: 'clauseType and ourPosition are required.' });
  }

  try {
    const playbookCollection = await dbService.getCollection('playbook');
    const newPosition = {
      org_id: orgId,
      clauseType,
      ourPosition,
      fallbackPosition: fallbackPosition || '',
      redLine: redLine || '',
      mustHave: mustHave === true,
      created_at: new Date(),
    };
    const insertRes = await playbookCollection.insertOne(newPosition);
    return res.status(201).json({ message: 'Playbook position created successfully.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Update Playbook Position
router.patch('/playbook/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { clauseType, ourPosition, fallbackPosition, redLine, mustHave } = req.body;

  try {
    const playbookCollection = await dbService.getCollection('playbook');
    const updateRes = await playbookCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          ...(clauseType && { clauseType }),
          ...(ourPosition && { ourPosition }),
          ...(fallbackPosition !== undefined && { fallbackPosition }),
          ...(redLine !== undefined && { redLine }),
          ...(mustHave !== undefined && { mustHave: mustHave === true }),
          updated_at: new Date(),
        },
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Playbook position not found.' });
    }

    return res.json({ message: 'Playbook position updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Delete Playbook Position
router.delete('/playbook/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const playbookCollection = await dbService.getCollection('playbook');
    const deleteRes = await playbookCollection.deleteOne({ _id: new ObjectId(id), org_id: orgId });

    if (deleteRes.deletedCount === 0) {
      return res.status(404).json({ error: 'Playbook position not found.' });
    }

    return res.json({ message: 'Playbook position deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Clause Benchmarking Route
router.post('/benchmark', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { clauseText, clauseType } = req.body;

  if (!clauseText || !clauseType) {
    return res.status(400).json({ error: 'clauseText and clauseType are required.' });
  }

  try {
    // Retrieve playbook positions for this org and clause type
    const playbookCollection = await dbService.getCollection('playbook');
    const position = await playbookCollection.findOne({ org_id: orgId, clauseType });

    const prompt = `
      You are an expert contract drafting auditor.
      Your task is to compare a contract clause against our corporate playbook guidelines for this clause type.

      Clause Type: ${clauseType}
      Target/Preferred Position: ${position?.ourPosition || 'Not specified'}
      Acceptable Fallback Position: ${position?.fallbackPosition || 'Not specified'}
      Crosses Red Line (Forbidden): ${position?.redLine || 'Not specified'}

      Clause Text to Audit:
      """
      ${clauseText}
      """

      Analyze if this clause is Compliant, Deviation (meaning it is not our preferred but matches fallback), or a Violation (it contains redline clauses or deviates without fallbacks).
      Generate a redline suggestion to make the clause compliant and a confidence score.

      Output ONLY a valid JSON object matching this structure:
      {
        "status": "compliant" | "deviation" | "violation",
        "score": 90,
        "gaps": ["description of gaps/issues..."],
        "deviations": ["description of deviations..."],
        "redlineSuggestions": "suggested revision text..."
      }
    `;

    const rawAgentOutput = await callAgent(benchmarkAgent, prompt);
    const parsed = JSON.parse(rawAgentOutput);

    return res.json(parsed);
  } catch (error: any) {
    console.error('Benchmarking failed:', error);
    // Graceful fallback response
    return res.json({
      status: 'deviation',
      score: 70,
      gaps: ['Audit completed with fallback logic.'],
      deviations: ['Failed to run full LLM check.'],
      redlineSuggestions: clauseText,
    });
  }
});

// 6. Full Document Playbook Compliance Audit
router.post('/playbook/audit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { documentId } = req.body;

  if (!documentId) {
    return res.status(400).json({ error: 'documentId is required.' });
  }

  try {
    const clausesCollection = await dbService.getCollection('clauses');
    const playbookCollection = await dbService.getCollection('playbook');

    const clauses = await clausesCollection.find({ document_id: new ObjectId(documentId) }).toArray();
    const playbookRules = await playbookCollection.find({ org_id: orgId }).toArray();

    if (clauses.length === 0) {
      return res.json({ compliant: true, auditReport: [], score: 100 });
    }

    const rulesSummary = playbookRules.map(r => `[Type: ${r.clauseType}] Pref: ${r.ourPosition} | Fallback: ${r.fallbackPosition} | Redline: ${r.redLine}`).join('\n');
    const clausesSummary = clauses.map(c => `[Type: ${c.category}, ID: ${c._id.toString()}]: ${c.raw_text}`).join('\n');

    const prompt = `
      You are performing a corporate playbook audit for an entire contract.
      Compare the extracted clauses below against the playbook rules list.

      Playbook Rules:
      ${rulesSummary}

      Document Clauses:
      ${clausesSummary}

      Return a compliance score (0 to 100) and an audit report itemizing each clause.
      Each item in the report should classify the clause status as COMPLIANT, DEVIATION, or VIOLATION, detailing gaps and suggesting redlines.

      Output ONLY a valid JSON object matching this structure:
      {
        "score": 85,
        "auditReport": [
          {
            "clauseId": "string id matching input",
            "clauseType": "Termination | Payment etc",
            "status": "COMPLIANT" | "DEVIATION" | "VIOLATION",
            "gaps": "description of gaps or issues",
            "suggestedRedline": "suggested revision text"
          }
        ]
      }
    `;

    const rawAgentOutput = await callAgent(playbookComplianceAgent, prompt);
    const parsed = JSON.parse(rawAgentOutput);

    // Save report in document metadata or standalone audit collection
    const docsCollection = await dbService.getCollection('documents');
    await docsCollection.updateOne(
      { _id: new ObjectId(documentId) },
      {
        $set: {
          auditReport: parsed.auditReport,
          complianceScore: parsed.score,
        },
      }
    );

    return res.json(parsed);
  } catch (error: any) {
    console.error('Playbook audit failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
