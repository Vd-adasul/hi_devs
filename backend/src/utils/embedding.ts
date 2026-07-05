import dotenv from 'dotenv';
dotenv.config({ override: true });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function getEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: {
          parts: [{ text }],
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini embedding API failed: ${errorText}`);
    }

    const data = await res.json();
    if (!data.embedding || !data.embedding.values) {
      throw new Error(`Invalid Gemini embedding response structure: ${JSON.stringify(data)}`);
    }

    return data.embedding.values;
  } catch (error) {
    console.error('getEmbedding error:', error);
    throw error;
  }
}
