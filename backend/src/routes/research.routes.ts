import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { IndianKanoonService } from '../services/indiankanoon.service.js';
import { Neo4jService } from '../services/neo4j.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { researchAgent } from '../mastra/index.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const indianKanoonService = IndianKanoonService.getInstance();
const neo4jService = Neo4jService.getInstance();

// 1. Run Legal Research Query & Synthesize Memo
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { query, matterId, doctypes } = req.body;

  if (!query || !matterId) {
    return res.status(400).json({ error: 'query and matterId are required.' });
  }

  try {
    const mattersCollection = await dbService.getCollection('matters');
    const matter = await mattersCollection.findOne({ _id: new ObjectId(matterId), org_id: orgId });
    if (!matter) {
      return res.status(404).json({ error: 'Matter not found.' });
    }

    console.log(`Research: Searching IndianKanoon for: "${query}"...`);
    const ikResults = await indianKanoonService.search(query);
    const cases = (ikResults.docs || []).slice(0, 5);

    if (cases.length === 0) {
      return res.json({
        memo: `No statutory records or case precedents found on IndianKanoon matching query "${query}".`,
        cases: [],
      });
    }

    // Format context for prompt
    const caseTextContext = cases.map((c, idx) => {
      return `Case Precedent [${idx + 1}]:\nTitle: ${c.title}\nSource: ${c.docsource}\nSummary/Headline: ${c.headline || 'No summary available.'}`;
    }).join('\n\n---\n\n');

    const prompt = `
      You are a highly analytical Indian statutory researcher.
      A lawyer has requested research on the issue: "${query}" for Matter: "${matter.name}".
      Here are the top matches found on IndianKanoon:
      ---
      ${caseTextContext}
      ---

      Synthesize these case laws and statutes into a structured research memo containing:
      1. Research Issue
      2. Key Precedents & Holdings (cite each matching case by name)
      3. Practical Legal Impact on our Matter: "${matter.name}"
      4. Conclusion

      Be professional, grounded only in the facts provided, and do not hallucinate laws.
    `;

    console.log('Research: Calling Mastra Research Agent to synthesize memo...');
    const agentRes = await researchAgent.generate(prompt);
    const memoText = agentRes.text;

    // Save research memo in MongoDB
    const memosCollection = await dbService.getCollection('researchMemos');
    const newMemo = {
      org_id: orgId,
      matter_id: new ObjectId(matterId),
      query,
      memo: memoText,
      cases: cases.map(c => ({
        id: c.tid.toString(),
        title: c.title,
        docsource: c.docsource,
        headline: c.headline,
        url: `https://indiankanoon.org/doc/${c.tid}/`,
      })),
      created_at: new Date(),
    };
    const insertRes = await memosCollection.insertOne(newMemo);

    // Create nodes for these verified cases in Neo4j
    console.log('Research: Registering cases in Neo4j Knowledge Graph...');
    for (const c of cases) {
      // Create Case node (isolated or linked to matter node as a generic matter reference)
      await neo4jService.createCaseNode(
        `matter_ref_${matterId}`,
        c.tid.toString(),
        c.title,
        c.docsource
      );
    }

    return res.status(201).json({
      message: 'Legal research memo synthesized successfully.',
      memoId: insertRes.insertedId,
      memo: memoText,
      cases: newMemo.cases,
    });

  } catch (error: any) {
    console.error('Research synthesis failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. List Research Memos for a Matter
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { matterId } = req.query;

  if (!matterId) {
    return res.status(400).json({ error: 'matterId is required.' });
  }

  try {
    const memosCollection = await dbService.getCollection('researchMemos');
    const list = await memosCollection
      .find({ org_id: orgId, matter_id: new ObjectId(matterId as string) })
      .sort({ created_at: -1 })
      .toArray();

    return res.json({ data: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
