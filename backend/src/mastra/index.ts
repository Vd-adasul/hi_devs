import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createStep, Workflow } from '@mastra/core/workflows';
import { DbService } from '../services/db.service.js';
import { QdrantService } from '../services/qdrant.service.js';
import { getEmbedding } from '../utils/embedding.js';
import { objectIdToUuid } from '../utils/uuid.js';
import { ObjectId } from 'mongodb';
import { storeClausesTool, searchQdrantTool, verifyCitationTool } from './tools.js';
import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config({ override: true });

// Ensure Google API Key is set for Mastra model gateway
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
}

// 1. Document Processing Agent
export const documentProcessingAgent = new Agent({
  id: 'document-processing-agent',
  name: 'Document Processing Agent',
  instructions: `
    You are an expert legal document analyst.
    Your task is to take extracted contract text, parse it into individual clauses, and identify their categories (like Termination, Indemnification, Governing Law, etc.).
    You also extract parties, obligations, and legal events.
    Use the store-clauses tool to persist the structured clauses to MongoDB and index them in Qdrant Cloud.
  `,
  model: 'google/gemini-2.5-flash',
  tools: { storeClausesTool },
});

// 2. Timeline Agent
export const timelineAgent = new Agent({
  id: 'timeline-agent',
  name: 'Timeline Agent',
  instructions: `
    You are a legal schedule assistant.
    Your goal is to parse extracted obligations and legal events (dates, renewal notice windows, schedules) and produce a clean, structured timeline report.
    Group events chronologically by: Deadlines, Renewals, Expirations, Notice Periods, and Payment Schedules.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// 3. Risk Intelligence Agent
export const riskAgent = new Agent({
  id: 'risk-agent',
  name: 'Risk Agent',
  instructions: `
    You are a legal risk analyst.
    You examine clauses and obligations, and determine their risk level (low, medium, high) based on standard contract rules (e.g. Unlimited Liability, Auto Renewal without termination, etc.).
    Provide a clear business impact analysis and reasoning for each risk identified.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// 4. Legal QA Agent (Graph RAG)
export const qaAgent = new Agent({
  id: 'qa-agent',
  name: 'Legal QA Agent',
  instructions: `
    You are a highly accurate grounded QA assistant.
    Your goal is to answer lawyer questions by relying ONLY on the retrieved evidence (clauses from the document and organizational knowledge).
    If the evidence does not contain the answer, say "I cannot find this in the documents." Do not hallucinate.
    Always cite your sources (clause ID, page number, document name) precisely.
    Use search-qdrant to retrieve relevant vector context.
  `,
  model: 'google/gemini-2.5-flash',
  tools: { searchQdrantTool },
});

// 5. Clause Benchmarking Agent
export const benchmarkAgent = new Agent({
  id: 'benchmark-agent',
  name: 'Benchmark Agent',
  instructions: `
    You are a contract drafting benchmarking assistant.
    Your goal is to compare a contract clause against standard CUAD categories and top matched templates from our institutional library (retrieved via Qdrant).
    Identify gaps, favorable/unfavorable deviations, and suggest redlines.
    Use search-qdrant to find similar clauses.
  `,
  model: 'google/gemini-2.5-flash',
  tools: { searchQdrantTool },
});

// 6. Citation Verification Agent
export const citationAgent = new Agent({
  id: 'citation-agent',
  name: 'Citation Agent',
  instructions: `
    You are a legal citation checker.
    Your job is to look at any citations mentioned in legal research or answers and verify them.
    Use verify-citation to check if the statutory case law actually exists in case law records or legal databases.
  `,
  model: 'google/gemini-2.5-flash',
  tools: { verifyCitationTool },
});

// 7. Research Agent (IndianKanoon statutory search synthesis)
export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  instructions: `
    You are a legal research analyst for Indian law.
    Given a research query and a list of case summaries from IndianKanoon, write a structured legal research memo.
    Format:
    - Issue
    - Applicable Law
    - Key Cases with holdings
    - Analysis
    - Conclusion
    Always cite each case by full name, year, and its relevance score.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// 8. Drafting Agent (docx template filling and alternative generation)
export const draftingAgent = new Agent({
  id: 'drafting-agent',
  name: 'Drafting Agent',
  instructions: `
    You are a legal drafting assistant.
    Given a clause type, context parameters, and a retrieved template, draft a legally sound contract clause.
    Provide 2 alternative options. Rate each option by favorability (e.g., pro-client, balanced, pro-counterparty).
    Output structure should be JSON.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// 9. Negotiation Agent (NegMAS-inspired SAOP alternating offer generator)
export const negotiationAgent = new Agent({
  id: 'negotiation-agent',
  name: 'Negotiation Agent',
  instructions: `
    You are an automated bilateral contract negotiator inspired by NegMAS.
    Your goal is to evaluate the counterparty's latest counter-proposals against our playbook (our preferred, fallback, and red-line positions).
    Perform a ZOPA (Zone of Possible Agreement) estimation and calculate the optimal concession rate based on time pressure/deadline countdown.
    Output if we should accept, reject, or make a counter-offer with adjusted clause values.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// 10. Playbook Compliance Agent (Automated compliance audits)
export const playbookComplianceAgent = new Agent({
  id: 'playbook-compliance-agent',
  name: 'Playbook Compliance Agent',
  instructions: `
    You are a playbook compliance auditor.
    Your task is to scan every clause in a contract and compare it against the corporate playbook positions.
    Identify any deviations, violations of red-lines, and suggest compliant redline edits.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// 11. Matter Twin Agent (Semantic auto-merge & conflict detection)
export const matterTwinAgent = new Agent({
  id: 'matter-twin-agent',
  name: 'Matter Twin Agent',
  instructions: `
    You are a living matter twin builder.
    Compare existing clauses of a matter against incoming document clauses.
    Identify new, conflicting, or superseded clauses and generate a unified merged state of active clauses.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {},
});

// --- WORKFLOW STEPS ---

const extractClausesStep = createStep({
  id: 'extract-clauses-step',
  inputSchema: z.object({
    orgId: z.string(),
    matterId: z.string(),
    documentId: z.string(),
    rawText: z.string(),
    pageCount: z.number(),
  }),
  outputSchema: z.object({
    agentSummary: z.string(),
  }),
  execute: async ({ getInitData }) => {
    const triggerData = getInitData<any>();
    const { orgId, matterId, documentId, rawText, pageCount } = triggerData;

    const dbService = DbService.getInstance();
    const clausesCollection = await dbService.getCollection('clauses');

    // ✅ IDEMPOTENCY: If clauses already exist for this document, skip re-extraction
    const existingCount = await clausesCollection.countDocuments({ document_id: new ObjectId(documentId) });
    if (existingCount > 0) {
      console.log(`[Idempotency] ${existingCount} clauses already exist for document ${documentId}. Skipping AI extraction.`);
      return {
        agentSummary: `Loaded ${existingCount} existing clauses from database. No re-extraction needed.`,
      };
    }

    const prompt = `
      You are analyzing a legal contract for Organization ID: ${orgId}, Matter ID: ${matterId}, Document ID: ${documentId}.
      Here is the contract text:
      ---
      ${rawText}
      ---

      Analyze the text. Break it down into logical clauses.
      For each clause, identify its category (e.g. Termination, Liability, Payment, Indemnity, General, Governing Law).
      Map each clause to its page number (spread them out logically across the page count of ${pageCount} pages).

      Output ONLY a valid JSON array of objects. Do not wrap in markdown or backticks.
      Each object in the array MUST have the following structure:
      - category: string
      - rawText: string
      - pageNumber: number
    `;

    const agentRes = await documentProcessingAgent.generate(prompt);
    
    let clauses: any[] = [];
    try {
      const cleanJson = agentRes.text.replace(/```json/g, '').replace(/```/g, '').trim();
      clauses = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse clauses JSON from agent, falling back:', e);
      clauses = [{
        category: 'General',
        rawText: rawText.substring(0, 1000) + '...',
        pageNumber: 1
      }];
    }

    const qdrantService = QdrantService.getInstance();

    const points: any[] = [];
    for (const clause of clauses) {
      const mongoRes = await clausesCollection.insertOne({
        org_id: orgId,
        matter_id: new ObjectId(matterId),
        document_id: new ObjectId(documentId),
        category: clause.category || 'General',
        raw_text: clause.rawText || '',
        page_number: typeof clause.pageNumber === 'number' ? clause.pageNumber : 1,
        created_at: new Date(),
      });

      const vector = await getEmbedding(clause.rawText || '');
      const clauseIdStr = mongoRes.insertedId.toString();

      points.push({
        id: objectIdToUuid(clauseIdStr),
        vector,
        payload: {
          org_id: orgId,
          matter_id: matterId,
          document_id: documentId,
          clause_id: clauseIdStr,
          clause_type: clause.category || 'General',
          page_number: typeof clause.pageNumber === 'number' ? clause.pageNumber : 1,
          raw_text: clause.rawText || '',
        },
      });
    }

    if (points.length > 0) {
      await qdrantService.upsertPoints('legal_documents', points);
    }

    return {
      agentSummary: `Successfully extracted and indexed ${clauses.length} clauses semantically into Qdrant database.`,
    };
  },
});

const generateTimelineStep = createStep({
  id: 'generate-timeline-step',
  inputSchema: z.any(),
  outputSchema: z.object({
    obligationCount: z.number(),
  }),
  execute: async ({ getInitData }) => {
    const triggerData = getInitData<any>();
    const { orgId, matterId, documentId } = triggerData;

    const dbService = DbService.getInstance();
    const clausesCollection = await dbService.getCollection('clauses');
    const clauses = await clausesCollection.find({ document_id: new ObjectId(documentId) }).toArray();

    if (clauses.length === 0) {
      return { obligationCount: 0 };
    }

    const clausesText = clauses.map(c => `[Page ${c.page_number} - ${c.category}]: ${c.raw_text}`).join('\n');

    const prompt = `
      You are analyzing extracted contract clauses for Matter ID: ${matterId}, Document ID: ${documentId}.
      Here are the extracted clauses:
      ---
      ${clausesText}
      ---

      Extract all legal obligations, timelines, payment schedules, and notice windows.
      Return a JSON array of obligations containing:
      - raw_text: The obligation description (e.g., "Payment is due within 30 days of invoice date")
      - due_date: Approximate due date in YYYY-MM-DD or leave null if recurring/conditional
      - status: "pending"

      Output ONLY a valid JSON array of objects. Do not wrap in markdown or backticks.
    `;

    const agentRes = await timelineAgent.generate(prompt);
    
    let obligations: any[] = [];
    try {
      const cleanJson = agentRes.text.replace(/```json/g, '').replace(/```/g, '').trim();
      obligations = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse timeline JSON from agent, falling back:', e);
      obligations = [{ raw_text: 'Timeline extraction complete. Review clauses.', status: 'pending' }];
    }

    const obligationsCollection = await dbService.getCollection('obligations');
    const records = obligations.map(o => ({
      org_id: orgId,
      matter_id: new ObjectId(matterId),
      document_id: new ObjectId(documentId),
      raw_text: o.raw_text,
      due_date: o.due_date ? new Date(o.due_date) : null,
      status: o.status || 'pending',
      created_at: new Date(),
    }));

    if (records.length > 0) {
      await obligationsCollection.insertMany(records);
    }

    return { obligationCount: records.length };
  },
});

const analyzeRisksStep = createStep({
  id: 'analyze-risks-step',
  inputSchema: z.any(),
  outputSchema: z.object({
    riskCount: z.number(),
  }),
  execute: async ({ getInitData }) => {
    const triggerData = getInitData<any>();
    const { orgId, matterId, documentId } = triggerData;

    const dbService = DbService.getInstance();
    const clausesCollection = await dbService.getCollection('clauses');
    const clauses = await clausesCollection.find({ document_id: new ObjectId(documentId) }).toArray();

    if (clauses.length === 0) {
      return { riskCount: 0 };
    }

    const clausesText = clauses.map(c => `[${c.category}]: ${c.raw_text}`).join('\n');

    const prompt = `
      You are analyzing extracted contract clauses for Matter ID: ${matterId}, Document ID: ${documentId}.
      Identify legal and business risks in these clauses:
      ---
      ${clausesText}
      ---

      Return a JSON array of risks, containing:
      - risk_level: "high" | "medium" | "low"
      - description: Brief description of the risk (e.g., "Unlimited Liability")
      - explanation: Business impact and why this is a risk.

      Output ONLY a valid JSON array of objects. Do not wrap in markdown or backticks.
    `;

    const agentRes = await riskAgent.generate(prompt);
    
    let risks: any[] = [];
    try {
      const cleanJson = agentRes.text.replace(/```json/g, '').replace(/```/g, '').trim();
      risks = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse risks JSON from agent:', e);
      risks = [{ risk_level: 'medium', description: 'Review required', explanation: 'Please inspect clauses manually.' }];
    }

    const risksCollection = await dbService.getCollection('risks');
    const records = risks.map(r => ({
      org_id: orgId,
      matter_id: new ObjectId(matterId),
      document_id: new ObjectId(documentId),
      risk_level: r.risk_level || 'medium',
      description: r.description,
      explanation: r.explanation,
      trust_score: 0.9,
      created_at: new Date(),
    }));

    if (records.length > 0) {
      await risksCollection.insertMany(records);
    }

    return { riskCount: records.length };
  },
});

// --- WORKFLOW COMPOSITIONS ---

export const documentWorkflow = new Workflow({
  id: 'document-processing-workflow',
  inputSchema: z.object({
    orgId: z.string(),
    matterId: z.string(),
    documentId: z.string(),
    rawText: z.string(),
    pageCount: z.number(),
  }),
  outputSchema: z.any(),
});

documentWorkflow
  .then(extractClausesStep)
  .then(generateTimelineStep)
  .then(analyzeRisksStep)
  .commit();

// 1. Research Workflow
export const researchWorkflow = new Workflow({
  id: 'research-workflow',
  inputSchema: z.object({
    query: z.string(),
    orgId: z.string(),
    matterId: z.string(),
  }),
  outputSchema: z.any(),
});

const runResearchStep = createStep({
  id: 'run-research-step',
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  execute: async ({ getInitData }) => {
    const { query } = getInitData<any>();
    // Call researchAgent to synthesize based on input
    const res = await researchAgent.generate(`Search query: ${query}. Create a synthesis of research findings.`);
    return { summary: res.text };
  }
});

researchWorkflow.then(runResearchStep).commit();

// 2. Redline Workflow
export const redlineWorkflow = new Workflow({
  id: 'redline-workflow',
  inputSchema: z.object({
    diffHtml: z.string(),
    contractType: z.string(),
    playbookPositions: z.any(),
  }),
  outputSchema: z.any(),
});

const runRedlineStep = createStep({
  id: 'run-redline-step',
  inputSchema: z.object({
    diffHtml: z.string(),
    contractType: z.string(),
    playbookPositions: z.any(),
  }),
  outputSchema: z.object({
    redlines: z.string(),
  }),
  execute: async ({ getInitData }) => {
    const { diffHtml, contractType, playbookPositions } = getInitData<any>();
    const prompt = `Analyze this diff HTML for a ${contractType} contract: ${diffHtml}. Suggest redlines based on: ${JSON.stringify(playbookPositions)}`;
    const res = await redlineAgent.generate(prompt);
    return { redlines: res.text };
  }
});

// Stub referencing negotiation/redline agent
const redlineAgent = negotiationAgent; 

redlineWorkflow.then(runRedlineStep).commit();

// 3. Negotiation Workflow
export const negotiationRoundWorkflow = new Workflow({
  id: 'negotiation-workflow',
  inputSchema: z.object({
    roundHistory: z.any(),
    playbookPositions: z.any(),
  }),
  outputSchema: z.any(),
});

const runNegotiationStep = createStep({
  id: 'run-negotiation-step',
  inputSchema: z.object({
    roundHistory: z.any(),
    playbookPositions: z.any(),
  }),
  outputSchema: z.object({
    offer: z.string(),
  }),
  execute: async ({ getInitData }) => {
    const { roundHistory, playbookPositions } = getInitData<any>();
    const prompt = `Analyze round history: ${JSON.stringify(roundHistory)}. Generate next concession offer using our playbook: ${JSON.stringify(playbookPositions)}`;
    const res = await negotiationAgent.generate(prompt);
    return { offer: res.text };
  }
});

negotiationRoundWorkflow.then(runNegotiationStep).commit();

// 4. Playbook Audit Workflow
export const playbookAuditWorkflow = new Workflow({
  id: 'playbook-audit-workflow',
  inputSchema: z.object({
    documentId: z.string(),
    playbookId: z.string(),
  }),
  outputSchema: z.any(),
});

const runPlaybookAuditStep = createStep({
  id: 'run-playbook-audit-step',
  inputSchema: z.object({
    documentId: z.string(),
    playbookId: z.string(),
  }),
  outputSchema: z.object({
    auditResult: z.string(),
  }),
  execute: async ({ getInitData }) => {
    const { documentId } = getInitData<any>();
    const res = await playbookComplianceAgent.generate(`Perform a playbook audit on document: ${documentId}`);
    return { auditResult: res.text };
  }
});

playbookAuditWorkflow.then(runPlaybookAuditStep).commit();


// Initialize Mastra Instance
export const mastra = new Mastra({
  agents: {
    documentProcessingAgent,
    timelineAgent,
    riskAgent,
    qaAgent,
    benchmarkAgent,
    citationAgent,
    researchAgent,
    draftingAgent,
    negotiationAgent,
    playbookComplianceAgent,
    matterTwinAgent,
  },
  workflows: {
    documentWorkflow,
    researchWorkflow,
    redlineWorkflow,
    negotiationRoundWorkflow,
    playbookAuditWorkflow,
  },
});
