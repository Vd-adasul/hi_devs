import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { negotiationAgent } from '../mastra/index.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// Helper to query Gemini API (via Mastra agents)
async function callAgent(agent: any, prompt: string): Promise<string> {
  const res = await agent.generate(prompt);
  return res.text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// 1. Start a Negotiation Session
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { contractId, counterpartyId, deadline } = req.body;

  if (!contractId || !counterpartyId) {
    return res.status(400).json({ error: 'contractId and counterpartyId are required.' });
  }

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const playbookCollection = await dbService.getCollection('playbook');
    const docsCollection = await dbService.getCollection('documents');
    const cpCollection = await dbService.getCollection('counterparties');

    const document = await docsCollection.findOne({ _id: new ObjectId(contractId), org_id: orgId });
    const cp = await cpCollection.findOne({ _id: new ObjectId(counterpartyId), org_id: orgId });

    if (!document || !cp) {
      return res.status(404).json({ error: 'Contract or Counterparty not found.' });
    }

    // Get current playbook rules as snapshot
    const rules = await playbookCollection.find({ org_id: orgId }).toArray();
    const portalToken = crypto.randomBytes(32).toString('hex');

    const newSession = {
      orgId,
      contractId: new ObjectId(contractId),
      counterpartyId: new ObjectId(counterpartyId),
      status: 'active',
      playbookSnapshot: rules,
      rounds: [],
      deadline: deadline ? new Date(deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // default 30 days
      portalToken,
      created_at: new Date(),
    };

    const insertRes = await negotiationsCollection.insertOne(newSession);
    const portalLink = `${req.headers.origin || 'http://localhost:5173'}/portal/negotiate/${portalToken}`;

    return res.status(201).json({
      message: 'Bilateral negotiation session initialized.',
      negotiationId: insertRes.insertedId,
      portalToken,
      portalLink,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Get Negotiation Session Details (Timeline + Rounds)
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const session = await negotiationsCollection.findOne({ _id: new ObjectId(id), orgId });

    if (!session) {
      return res.status(404).json({ error: 'Negotiation session not found.' });
    }

    // Populate contract and counterparty name
    const docsCollection = await dbService.getCollection('documents');
    const cpCollection = await dbService.getCollection('counterparties');

    const doc = await docsCollection.findOne({ _id: session.contractId });
    const cp = await cpCollection.findOne({ _id: session.counterpartyId });

    return res.json({
      data: {
        ...session,
        contractTitle: doc ? doc.name : 'Unknown Contract',
        counterpartyName: cp ? cp.name : 'Unknown Partner',
        portalLink: `${req.headers.origin || 'http://localhost:5173'}/portal/negotiate/${session.portalToken}`,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Submit Our Offer (Bilateral alternation)
router.post('/:id/offer', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { clauses } = req.body; // [{ type: 'Liability', proposed: '$1M cap', rationale: '...' }]

  if (!clauses || !Array.isArray(clauses) || clauses.length === 0) {
    return res.status(400).json({ error: 'clauses list is required.' });
  }

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const session = await negotiationsCollection.findOne({ _id: new ObjectId(id), orgId });

    if (!session || session.status !== 'active') {
      return res.status(404).json({ error: 'Active negotiation session not found.' });
    }

    const nextRoundNumber = (session.rounds || []).length + 1;
    const newRound = {
      roundNumber: nextRoundNumber,
      offerBy: 'us',
      clauses,
      timestamp: new Date(),
      aiAnalysis: null,
    };

    await negotiationsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: {
          rounds: newRound,
        },
      }
    );

    return res.status(201).json({ message: 'Offer submitted successfully.', roundNumber: nextRoundNumber });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. NegMAS AI Counter-Offer Recommendation (Concession + ZOPA estimation)
router.get('/:id/recommend', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const session = await negotiationsCollection.findOne({ _id: new ObjectId(id), orgId });

    if (!session || session.status !== 'active') {
      return res.status(404).json({ error: 'Active negotiation session not found.' });
    }

    const rounds = session.rounds || [];
    if (rounds.length === 0) {
      return res.json({
        action: 'counter',
        reasoning: 'No offers recorded yet. Propose first standard offer using preferred playbook guidelines.',
        proposedClauses: session.playbookSnapshot.map((r: any) => ({
          type: r.clauseType,
          proposed: r.ourPosition,
          rationale: 'Preferred position requested.',
        })),
        confidence: 90,
        zopaEstimate: 0.5,
      });
    }

    // Call negotiationAgent to compute NegMAS parameters
    const prompt = `
      You are analyzing an active NegMAS-inspired bilateral contract negotiation rounds history.
      Deadline: ${session.deadline}
      Current Time: ${new Date().toISOString()}

      Playbook snap guidelines (Our constraints):
      ${JSON.stringify(session.playbookSnapshot.map((r: any) => ({ type: r.clauseType, preferred: r.ourPosition, fallback: r.fallbackPosition, redline: r.redLine })), null, 2)}

      Timeline of Negotiation rounds:
      ${JSON.stringify(rounds.map((r: any) => ({ round: r.roundNumber, offerBy: r.offerBy, clauses: r.clauses })), null, 2)}

      Analyze the round timeline and compute:
      1. ZOPA (Zone of Possible Agreement) estimation per clause type.
      2. Time pressure concession rates (as deadline approaches, we may slightly concede to fallbacks, but NEVER cross red lines).
      3. Recommend whether we should:
         - "accept": if counterparty's latest offer fits within our fallback positions.
         - "counter": generate the next optimal offer (intermediate concessions).
         - "reject": if counterparty crosses red lines and concession time has run out.

      Output ONLY a valid JSON object matching this structure:
      {
        "action": "accept" | "counter" | "reject",
        "proposedClauses": [
          { "type": "clause type", "proposed": "clause text...", "rationale": "reason for this value..." }
        ],
        "reasoning": "A brief summary of leverage, concession, and ZOPA calculation.",
        "confidence": 85,
        "zopaEstimate": 0.65
      }
    `;

    const rawAgentOutput = await callAgent(negotiationAgent, prompt);
    const parsed = JSON.parse(rawAgentOutput);

    return res.json(parsed);
  } catch (error: any) {
    console.error('AI negotiation recommendation failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 5. Accept Negotiation Offer
router.post('/:id/accept', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const updateRes = await negotiationsCollection.updateOne(
      { _id: new ObjectId(id), orgId },
      { $set: { status: 'accepted', closedAt: new Date() } }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Active negotiation session not found.' });
    }

    return res.json({ message: 'Negotiation offer accepted. Session closed.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. Reject Negotiation Offer
router.post('/:id/reject', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const updateRes = await negotiationsCollection.updateOne(
      { _id: new ObjectId(id), orgId },
      { $set: { status: 'rejected', closedAt: new Date() } }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Active negotiation session not found.' });
    }

    return res.json({ message: 'Negotiation offer rejected. Session closed.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
