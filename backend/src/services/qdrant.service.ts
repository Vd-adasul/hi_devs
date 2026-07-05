import dotenv from 'dotenv';
dotenv.config({ override: true });

const QDRANT_ENDPOINT = process.env.QDRANT_ENDPOINT;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

export class QdrantService {
  private static instance: QdrantService;
  private headers: HeadersInit;

  private constructor() {
    this.headers = {
      'Content-Type': 'application/json',
      'api-key': QDRANT_API_KEY || '',
    };
  }

  public static getInstance(): QdrantService {
    if (!QdrantService.instance) {
      QdrantService.instance = new QdrantService();
    }
    return QdrantService.instance;
  }

  // Ensure collection exists
  public async ensureCollection(collectionName: string, vectorSize: number = 3072): Promise<void> {
    try {
      const checkRes = await fetch(`${QDRANT_ENDPOINT}/collections/${collectionName}`, {
        method: 'GET',
        headers: this.headers,
      });

      if (checkRes.status === 200) {
        return; // Already exists
      }

      console.log(`Creating Qdrant collection: ${collectionName}`);
      const createRes = await fetch(`${QDRANT_ENDPOINT}/collections/${collectionName}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
        }),
      });

      if (!createRes.ok) {
        const errorText = await createRes.text();
        throw new Error(`Failed to create Qdrant collection: ${errorText}`);
      }

      console.log(`Creating org_id payload index for collection: ${collectionName}`);
      const indexRes = await fetch(`${QDRANT_ENDPOINT}/collections/${collectionName}/index`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({
          field_name: 'org_id',
          field_schema: 'keyword',
        }),
      });

      if (!indexRes.ok) {
        const errorText = await indexRes.text();
        console.warn(`Warning: Failed to create org_id payload index: ${errorText}`);
      }
    } catch (error) {
      console.error('Qdrant collection error:', error);
      throw error;
    }
  }

  // Upsert point(s)
  public async upsertPoints(
    collectionName: string,
    points: Array<{ id: string | number; vector: number[]; payload: Record<string, any> }>
  ): Promise<void> {
    await this.ensureCollection(collectionName);

    const res = await fetch(`${QDRANT_ENDPOINT}/collections/${collectionName}/points?wait=true`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to upsert points to Qdrant: ${errorText}`);
    }
  }

  // Search points
  public async searchPoints(
    collectionName: string,
    vector: number[],
    orgId: string,
    limit: number = 5
  ): Promise<any[]> {
    await this.ensureCollection(collectionName);

    const res = await fetch(`${QDRANT_ENDPOINT}/collections/${collectionName}/points/search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        filter: {
          must: [
            {
              key: 'org_id',
              match: {
                value: orgId,
              },
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Qdrant search failed: ${errorText}`);
    }

    const data = await res.json();
    return data.result || [];
  }

  // Delete point(s)
  public async deletePoints(collectionName: string, ids: (string | number)[]): Promise<void> {
    const res = await fetch(`${QDRANT_ENDPOINT}/collections/${collectionName}/points/delete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ points: ids }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to delete points from Qdrant: ${errorText}`);
    }
  }
}
