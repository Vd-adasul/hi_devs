import dotenv from 'dotenv';
dotenv.config({ override: true });

const ENKRYPT_API_KEY = process.env.ENKRYPT_API_KEY;

export interface EnkryptEvaluationResult {
  trust_score: number;
  safe: boolean;
  flags: string[];
}

export class EnkryptService {
  private static instance: EnkryptService;
  private headers: HeadersInit;

  private constructor() {
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': ENKRYPT_API_KEY || '',
    };
  }

  public static getInstance(): EnkryptService {
    if (!EnkryptService.instance) {
      EnkryptService.instance = new EnkryptService();
    }
    return EnkryptService.instance;
  }

  public async evaluate(text: string, context?: string): Promise<EnkryptEvaluationResult> {
    if (!ENKRYPT_API_KEY) {
      console.warn('Enkrypt API Key is missing. Skipping safety check and returning default values.');
      return { trust_score: 1.0, safe: true, flags: [] };
    }

    try {
      const res = await fetch('https://api.enkryptai.com/guardrails/detect', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          text,
          context,
          detectors: {
            toxicity: { enabled: true },
            pii: { enabled: true, entities: ['email', 'phone', 'ssn'] },
            bias: { enabled: true },
            injection_attack: { enabled: true },
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Enkrypt evaluate call failed: ${errorText}`);
        // Fallback to safe but with a warning trace
        return { trust_score: 0.8, safe: true, flags: ['enkrypt-api-error'] };
      }

      const data = await res.json();
      console.log('Enkrypt Evaluation Response:', data);

      const summary = data.summary || {};
      const details = data.details || {};

      let safe = true;
      let score = 1.0;
      const flags: string[] = [];

      // 1. Check Toxicity
      if (summary.toxicity && summary.toxicity.length > 0) {
        safe = false;
        score -= 0.3;
        flags.push('toxicity-detected');
      }

      // 2. Check PII
      if (summary.pii && summary.pii > 0) {
        safe = false;
        score -= 0.2;
        flags.push('pii-detected');
      }

      // 3. Check Bias
      if (details.bias && details.bias.bias_detected) {
        score -= 0.1;
        flags.push('bias-detected');
      }

      // 4. Check Injection Attack
      if (details.injection_attack && details.injection_attack.attack) {
        const attackScore = parseFloat(details.injection_attack.attack);
        if (attackScore > 0.5) {
          safe = false;
          score -= 0.4;
          flags.push('injection-attack-detected');
        }
      }

      score = Math.max(0, score);

      return {
        trust_score: Number(score.toFixed(2)),
        safe: safe,
        flags: flags,
      };
    } catch (error) {
      console.error('Enkrypt service exception:', error);
      // Fallback
      return { trust_score: 0.8, safe: true, flags: ['enkrypt-service-exception'] };
    }
  }
}
