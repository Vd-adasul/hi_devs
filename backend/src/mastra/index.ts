import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createStep, Workflow } from '@mastra/core/workflows';
import { DbService } from '../services/db.service.js';
import { ObjectId } from 'mongodb';
import { storeClausesTool, searchQdrantTool, verifyCitationTool } from './tools.js';
import dotenv from 'dotenv';
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
  model: 'google/gemini-1.5-flash',
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
  model: 'google/gemini-1.5-flash',
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
  model: 'google/gemini-1.5-flash',
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
  model: 'google/gemini-1.5-flash',
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
  model: 'google/gemini-1.5-flash',
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
  model: 'google/gemini-1.5-flash',
  tools: { verifyCitationTool },
});

// 7. Workflow Steps Definitions
const extractClausesStep = createStep({
  id: 'extract-clauses-step',
  execute: async ({ context }) => {
    const triggerData = context?.triggerData as any;
    const { orgId, matterId, documentId, rawText, pageCount } = triggerData;

    const prompt = `
      Please process the following legal document text.
      Matter ID: ${matterId}
      Document ID: ${documentId}
      Organization ID: ${orgId}

      Document Text:
      ---
      ${rawText}
      ---

      Analyze the text. Break it down into logical clauses.
      For each clause, identify its category (e.g. Termination, Liability, Payment, Indemnity, General, Governing Law).
      Map each clause to its page number (spread them out logically across the page count of ${pageCount} pages).
      Use the store-clauses tool to save them. Return a summary of what you extracted.
    `;

    const agentRes = await documentProcessingAgent.generate(prompt);
    return {
      agentSummary: agentRes.text,
    };
  },
});

const generateTimelineStep = createStep({
  id: 'generate-timeline-step',
  execute: async ({ context }) => {
    const triggerData = context?.triggerData as any;
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
  execute: async ({ context }) => {
    const triggerData = context?.triggerData as any;
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

// 8. Workflow Composition
export const documentWorkflow = new Workflow({
  id: 'document-processing-workflow',
});

documentWorkflow
  .then(extractClausesStep)
  .then(generateTimelineStep)
  .then(analyzeRisksStep)
  .commit();

// Initialize Mastra Instance
export const mastra = new Mastra({
  agents: {
    documentProcessingAgent,
    timelineAgent,
    riskAgent,
    qaAgent,
    benchmarkAgent,
    citationAgent,
  },
  workflows: {
    documentWorkflow,
  },
});
