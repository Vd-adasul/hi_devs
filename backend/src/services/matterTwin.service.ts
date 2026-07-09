import dotenv from 'dotenv';
dotenv.config();

export interface MatterTwinConflict {
  existingClauseId: string;
  existingClauseText: string;
  incomingClauseText: string;
  category: string;
  recommendation: string;
  reason: string;
}

export interface MatterTwinResult {
  newClauses: Array<{ text: string; category: string }>;
  conflictingClauses: MatterTwinConflict[];
  supersededClauses: Array<{ existingClauseId: string; reason: string }>;
  mergedClauses: Array<{ text: string; category: string; sourceDocId: string }>;
}

export class MatterTwinService {
  private static instance: MatterTwinService | null = null;
  private apiKey: string | null = null;

  private constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  }

  public static getInstance(): MatterTwinService {
    if (!MatterTwinService.instance) {
      MatterTwinService.instance = new MatterTwinService();
    }
    return MatterTwinService.instance;
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API returned HTTP ${response.status}: ${errorText}`);
      }

      const resJson = await response.json() as any;
      const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }
      return text.trim();
    } catch (err) {
      console.error('Error calling Gemini API for Matter Twin analysis:', err);
      throw err;
    }
  }

  public async detectConflictsAndMerge(
    existingClauses: Array<{ id: string; text: string; category: string; documentId: string }>,
    incomingClauses: Array<{ text: string; category: string; documentId: string }>,
    incomingDocId: string
  ): Promise<MatterTwinResult> {
    if (!this.apiKey) {
      // Mock result if no API key
      return {
        newClauses: incomingClauses.map(c => ({ text: c.text, category: c.category })),
        conflictingClauses: [],
        supersededClauses: [],
        mergedClauses: [
          ...existingClauses.map(c => ({ text: c.text, category: c.category, sourceDocId: c.documentId })),
          ...incomingClauses.map(c => ({ text: c.text, category: c.category, sourceDocId: incomingDocId })),
        ],
      };
    }

    const prompt = `
      You are an expert contract merging and conflict detection agent.
      We have an existing matter which already has a list of active clauses.
      A new document (like an amendment, addendum, or subsequent contract) has just been uploaded to the same matter, yielding a set of incoming clauses.

      Your goal is to perform a semantic analysis and:
      1. Identify which incoming clauses are completely new (not in the original).
      2. Identify conflicting clauses where an incoming clause contradicts or significantly modifies an existing clause (e.g. payment terms changed from net-30 to net-45, or liability caps modified).
      3. Identify which existing clauses are superseded (replaced or rendered obsolete) by incoming clauses.
      4. Produce a final merged list of active clauses representing the "living state" of the matter.

      Existing Clauses:
      ${JSON.stringify(existingClauses.map(c => ({ id: c.id, text: c.text, category: c.category })), null, 2)}

      Incoming Clauses:
      ${JSON.stringify(incomingClauses.map(c => ({ text: c.text, category: c.category })), null, 2)}

      You must return a JSON object with this exact shape:
      {
        "newClauses": [
          { "text": "incoming clause text...", "category": "category name" }
        ],
        "conflictingClauses": [
          {
            "existingClauseId": "existing clause id",
            "existingClauseText": "existing clause text...",
            "incomingClauseText": "incoming clause text...",
            "category": "category name",
            "recommendation": "Accept Incoming | Keep Original",
            "reason": "explanation of conflict..."
          }
        ],
        "supersededClauses": [
          {
            "existingClauseId": "existing clause id",
            "reason": "replaced by incoming clause..."
          }
        ],
        "mergedClauses": [
          { "text": "clause text...", "category": "category name", "sourceDocId": "either the incoming doc id or the original doc id" }
        ]
      }

      For "sourceDocId" in "mergedClauses", use the string "incoming" for incoming clauses, or the actual original documentId if it came from the existing list.
    `;

    try {
      const responseText = await this.callGemini(prompt);
      const parsed = JSON.parse(responseText) as any;

      // Fix incoming placeholder string in sourceDocId to the actual incomingDocId
      const mergedClauses = (parsed.mergedClauses || []).map((c: any) => {
        let sourceDocId = c.sourceDocId;
        if (sourceDocId === 'incoming') {
          sourceDocId = incomingDocId;
        } else {
          // Find original docId
          const match = existingClauses.find(ec => ec.text === c.text);
          sourceDocId = match ? match.documentId : incomingDocId;
        }
        return {
          text: c.text,
          category: c.category,
          sourceDocId,
        };
      });

      return {
        newClauses: parsed.newClauses || [],
        conflictingClauses: parsed.conflictingClauses || [],
        supersededClauses: parsed.supersededClauses || [],
        mergedClauses,
      };
    } catch (err) {
      console.error('Failed to perform Matter Twin auto-merge, falling back:', err);
      return {
        newClauses: incomingClauses.map(c => ({ text: c.text, category: c.category })),
        conflictingClauses: [],
        supersededClauses: [],
        mergedClauses: [
          ...existingClauses.map(c => ({ text: c.text, category: c.category, sourceDocId: c.documentId })),
          ...incomingClauses.map(c => ({ text: c.text, category: c.category, sourceDocId: incomingDocId })),
        ],
      };
    }
  }
}
export default MatterTwinService;
