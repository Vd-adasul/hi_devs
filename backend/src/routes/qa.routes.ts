import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { QdrantService } from '../services/qdrant.service.js';
import { EnkryptService } from '../services/enkrypt.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { qaAgent } from '../mastra/index.js';
import { getEmbedding } from '../utils/embedding.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const qdrantService = QdrantService.getInstance();
const enkryptService = EnkryptService.getInstance();

router.post('/:matterId/qa', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const { query } = req.body;
  const orgId = req.user?.orgId || 'org_default_firm';

  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    // 1. Verify Matter exists
    const mattersCollection = await dbService.getCollection('matters');
    const matter = await mattersCollection.findOne({
      _id: new ObjectId(matterId),
      org_id: orgId,
    });

    if (!matter) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    // 2. Retrieve semantic context from Qdrant Cloud
    console.log(`Q&A: Fetching semantic matches from Qdrant for matter: ${matterId}`);
    const queryVector = await getEmbedding(query);
    const searchRes = await qdrantService.searchPoints('legal_documents', queryVector, orgId, 5);

    // 3. Assemble evidence context
    const evidenceText = searchRes.map((point: any, index: number) => {
      return `Source [${index + 1}]: Clause ID: ${point.payload.clause_id}, Page: ${point.payload.page_number}, Category: ${point.payload.clause_type}\nText: ${point.payload.raw_text}`;
    }).join('\n\n');

    // 4. Query Mastra QA Agent with evidence
    const prompt = `
      Lawyer Question: "${query}"
      
      Retrieved Context Evidence:
      ---
      ${evidenceText}
      ---

      Answer the question using ONLY the provided evidence. Cite the source number and category for your claims.
      If the evidence doesn't support the answer, state that clearly.
    `;

    console.log('Q&A: Calling Mastra QA Agent...');
    const agentRes = await qaAgent.generate(prompt);
    const answerText = agentRes.text;

    // 5. Run Safety Evaluation via Enkrypt AI Gate (REQUIRED)
    console.log('Q&A: Routing answer through Enkrypt AI safety guardrails...');
    const safetyRes = await enkryptService.evaluate(answerText, evidenceText);

    // 6. Return response with Enkrypt AI trust score
    return res.json({
      query,
      answer: answerText,
      sources: searchRes.map((p: any) => ({
        clauseId: p.payload.clause_id,
        documentId: p.payload.document_id,
        category: p.payload.clause_type,
        pageNumber: p.payload.page_number,
        rawText: p.payload.raw_text,
        score: p.score,
      })),
      _trust: {
        score: safetyRes.trust_score,
        safe: safetyRes.safe,
        flags: safetyRes.flags,
        evaluatedAt: new Date(),
      },
    });

  } catch (error: any) {
    console.error('Error during Q&A process:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
