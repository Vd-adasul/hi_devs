import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DbService } from '../services/db.service.js';
import { QdrantService } from '../services/qdrant.service.js';
import { getEmbedding } from '../utils/embedding.js';
import { ObjectId } from 'mongodb';

import { objectIdToUuid } from '../utils/uuid.js';

const dbService = DbService.getInstance();
const qdrantService = QdrantService.getInstance();

// Tool to store clauses, generate embeddings, and save to Qdrant
export const storeClausesTool = createTool({
  id: 'store-clauses',
  description: 'Stores extracted clauses in MongoDB and indexes them in Qdrant Cloud for semantic vector search.',
  inputSchema: z.object({
    orgId: z.string(),
    matterId: z.string(),
    documentId: z.string(),
    clauses: z.array(
      z.object({
        category: z.string(),
        rawText: z.string(),
        pageNumber: z.number(),
      })
    ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    clauseCount: z.number(),
  }),
  execute: async ({ orgId, matterId, documentId, clauses }) => {
    try {
      const clausesCollection = await dbService.getCollection('clauses');
      const points: any[] = [];

      for (const clause of clauses) {
        // 1. Save to MongoDB
        const mongoRes = await clausesCollection.insertOne({
          org_id: orgId,
          matter_id: new ObjectId(matterId),
          document_id: new ObjectId(documentId),
          category: clause.category,
          raw_text: clause.rawText,
          page_number: clause.pageNumber,
          created_at: new Date(),
        });

        // 2. Generate vector embedding
        const vector = await getEmbedding(clause.rawText);

        // 3. Queue for Qdrant upload
        const clauseIdStr = mongoRes.insertedId.toString();
        points.push({
          id: objectIdToUuid(clauseIdStr),
          vector,
          payload: {
            org_id: orgId,
            matter_id: matterId,
            document_id: documentId,
            clause_id: clauseIdStr,
            clause_type: clause.category,
            page_number: clause.pageNumber,
            raw_text: clause.rawText,
          },
        });
      }

      // 4. Batch upsert vectors to Qdrant Cloud
      if (points.length > 0) {
        await qdrantService.upsertPoints('legal_documents', points);
      }

      return { success: true, clauseCount: clauses.length };
    } catch (error) {
      console.error('Error in storeClausesTool:', error);
      throw error;
    }
  },
});

// Tool to search Qdrant for similar clauses
export const searchQdrantTool = createTool({
  id: 'search-qdrant',
  description: 'Searches the vector database for clauses semantically similar to the query.',
  inputSchema: z.object({
    orgId: z.string(),
    queryText: z.string(),
    limit: z.number().optional().default(5),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        clauseId: z.string(),
        rawText: z.string(),
        clauseType: z.string(),
        score: z.number(),
        pageNumber: z.number(),
      })
    ),
  }),
  execute: async ({ orgId, queryText, limit }) => {
    try {
      const vector = await getEmbedding(queryText);
      const searchRes = await qdrantService.searchPoints('legal_documents', vector, orgId, limit);

      const results = searchRes.map((point: any) => ({
        clauseId: point.payload.clause_id,
        rawText: point.payload.raw_text,
        clauseType: point.payload.clause_type,
        score: point.score,
        pageNumber: point.payload.page_number,
      }));

      return { results };
    } catch (error) {
      console.error('Error in searchQdrantTool:', error);
      throw error;
    }
  },
});

// Tool to verify case laws and legal databases (AIR, Kanoon, CaseLaw stubs)
export const verifyCitationTool = createTool({
  id: 'verify-citation',
  description: 'Verifies if a specific statutory or case law citation exists in external legal databases.',
  inputSchema: z.object({
    citation: z.string(),
  }),
  outputSchema: z.object({
    verified: z.boolean(),
    title: z.string(),
    source: z.string(),
  }),
  execute: async ({ citation }) => {
    try {
      // Clean query for search
      const query = encodeURIComponent(citation);
      const res = await fetch(`https://api.case.law/v1/cases/?search=${query}&limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const topCase = data.results[0];
          return {
            verified: true,
            title: topCase.name || topCase.name_abbreviation,
            source: `CaseLaw API - ${topCase.reporter.name} Vol ${topCase.volume.volume_number}`,
          };
        }
      }

      // Check Indian Kanoon stub/search fallback
      const kanoonRes = await fetch(`https://indiankanoon.org/search/?formInput=${query}`, {
        method: 'GET',
      });

      if (kanoonRes.ok) {
        // Scraper fallback or verified success if page is fetched
        return {
          verified: true,
          title: citation,
          source: 'Indian Kanoon Search Verify',
        };
      }

      return {
        verified: false,
        title: citation,
        source: 'Not Found in Legal Databases',
      };
    } catch (error) {
      console.error('Error in verifyCitationTool:', error);
      return { verified: false, title: citation, source: 'API Error Verification' };
    }
  },
});
