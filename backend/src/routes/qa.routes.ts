import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { QdrantService } from '../services/qdrant.service.js';
import { EnkryptService } from '../services/enkrypt.service.js';
import { Neo4jService } from '../services/neo4j.service.js';
import { IndianKanoonService } from '../services/indiankanoon.service.js';
import { ExplainabilityService } from '../services/explainability.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { qaAgent } from '../mastra/index.js';
import { getEmbedding } from '../utils/embedding.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const qdrantService = QdrantService.getInstance();
const enkryptService = EnkryptService.getInstance();
const neo4jService = Neo4jService.getInstance();
const indianKanoonService = IndianKanoonService.getInstance();
const explainabilityService = ExplainabilityService.getInstance();

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

    // 2. Qdrant Vector Search
    console.log(`Q&A: Fetching semantic matches from Qdrant for matter: ${matterId}`);
    const queryVector = await getEmbedding(query);
    const searchRes = await qdrantService.searchPoints('legal_documents', queryVector, orgId, 5);

    // 3. Neo4j Graph Neighbors (for each vector chunk, traverse graph context)
    console.log('Q&A: Retrieving graph relations from Neo4j...');
    const graphNeighbors: string[] = [];
    for (const point of searchRes) {
      const clauseId = point.payload.clause_id;
      if (clauseId) {
        const neighbors = await neo4jService.getClauseNeighbors(clauseId);
        neighbors.forEach(n => {
          graphNeighbors.push(n.summary);
        });
      }
    }

    // 4. IndianKanoon citation lookup (if query mentions case law, statute, or Act)
    let citationContext = '';
    const needsIndianKanoon = /case|precedent|act|judgment|section|court|article/i.test(query);
    if (needsIndianKanoon) {
      console.log('Q&A: Query requires Indian legal precedent. Searching IndianKanoon...');
      try {
        const ikResults = await indianKanoonService.search(query);
        citationContext = (ikResults.docs || []).slice(0, 3).map((doc, idx) => {
          return `IndianKanoon Case Match [${idx + 1}]: Title: ${doc.title}\nDescription: ${doc.headline || 'No summary available.'}`;
        }).join('\n\n');
      } catch (ikErr) {
        console.error('Failed to query IndianKanoon in QA context:', ikErr);
      }
    }

    // Assemble unified evidence text
    const vectorEvidence = searchRes.map((point: any, index: number) => {
      return `Vector Source [${index + 1}]: Clause ID: ${point.payload.clause_id}, Page: ${point.payload.page_number}, Category: ${point.payload.clause_type}\nText: ${point.payload.raw_text}`;
    }).join('\n\n');

    const graphEvidence = graphNeighbors.length > 0
      ? `Graph Relations Context:\n${graphNeighbors.slice(0, 5).join('\n')}`
      : 'Graph Relations: No related nodes found.';

    const fullEvidenceText = [
      vectorEvidence,
      graphEvidence,
      citationContext ? `Indian Case Precedents:\n${citationContext}` : '',
    ].filter(Boolean).join('\n\n---\n\n');

    // 5. Query QA Agent with full context
    const prompt = `
      Lawyer Question: "${query}"
      
      Retrieved Context Evidence:
      ---
      ${fullEvidenceText}
      ---

      Answer the question using ONLY the provided evidence.
      Always cite your sources (e.g. Vector Source [x], Graph Relations, or Indian Case Precedents) precisely.
      If the evidence does not support the answer, say "I cannot find this in the documents." Do not make up facts.
    `;

    console.log('Q&A: Calling Mastra QA Agent with hybrid graph context...');
    const agentRes = await qaAgent.generate(prompt);
    const answerText = agentRes.text;

    // 6. Citation Verification (check if case citations cited in answer exist on IndianKanoon)
    console.log('Q&A: Running citation verification checker...');
    const citationMatches = answerText.match(/[A-Z][a-zA-Z\s]+ v\. [A-Z][a-zA-Z\s]+/g) || [];
    const citationVerifications = [];
    for (const match of Array.from(new Set(citationMatches))) {
      const verifyRes = await indianKanoonService.verifyExistence(match);
      citationVerifications.push({
        cited: match,
        verified: verifyRes.verified,
        title: verifyRes.title,
        docId: verifyRes.docId,
        url: verifyRes.url,
      });
    }

    // 7. Safety Evaluation via Enkrypt AI
    console.log('Q&A: Routing answer through Enkrypt AI...');
    let safetyRes = { trust_score: 1.0, safe: true, flags: [] as string[] };
    try {
      safetyRes = await enkryptService.evaluate(answerText, fullEvidenceText);
    } catch (safeErr) {
      console.warn('Failed to call Enkrypt AI guardrails:', safeErr);
    }

    // 8. Explainability Confidence Scoring & Human Review Gating
    console.log('Q&A: Scoring confidence and explanation trace...');
    const explainRes = await explainabilityService.scoreConfidence(
      'qa-agent',
      answerText,
      fullEvidenceText
    );

    // If confidence is low, add to human review queue
    if (explainRes.gatedForReview) {
      console.warn(`Confidence score low (${explainRes.confidence}%). Gating Q&A response for human review...`);
      const reviewQueueCollection = await dbService.getCollection('reviewQueue');
      await reviewQueueCollection.insertOne({
        org_id: orgId,
        matter_id: new ObjectId(matterId),
        type: 'qa_answer',
        query,
        answer: answerText,
        confidence: explainRes.confidence,
        reasoning: explainRes.reasoning,
        status: 'pending',
        created_at: new Date(),
      });
    }

    // 9. Return Response
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
      graphNeighbors: graphNeighbors.slice(0, 5),
      citationVerifications,
      requiresHumanReview: explainRes.gatedForReview,
      confidence: {
        score: explainRes.confidence,
        reasoning: explainRes.reasoning,
      },
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
