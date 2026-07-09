import { Langfuse } from 'langfuse';
import dotenv from 'dotenv';
dotenv.config();

export class LangfuseService {
  private static instance: LangfuseService | null = null;
  private langfuse: Langfuse | null = null;

  private constructor() {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

    // If keys are placeholder or missing, log a warning and run in mock mode
    if (publicKey && secretKey && !publicKey.includes('000000000')) {
      try {
        this.langfuse = new Langfuse({
          publicKey,
          secretKey,
          baseUrl,
        });
        console.log('Langfuse tracing service initialized.');
      } catch (err) {
        console.error('Failed to initialize Langfuse:', err);
      }
    } else {
      console.warn('Langfuse key is missing or mock. Tracing will be stubbed.');
    }
  }

  public static getInstance(): LangfuseService {
    if (!LangfuseService.instance) {
      LangfuseService.instance = new LangfuseService();
    }
    return LangfuseService.instance;
  }

  public async traceAgentCall(
    agentName: string,
    input: any,
    output: any,
    latencyMs: number,
    tokens?: { prompt: number; completion: number }
  ): Promise<void> {
    if (!this.langfuse) {
      // In mock/stub mode, just log to console
      console.log(`[Trace Stub - ${agentName}] Latency: ${latencyMs}ms | Input:`, JSON.stringify(input).slice(0, 100), `| Output:`, JSON.stringify(output).slice(0, 100));
      return;
    }

    try {
      const trace = this.langfuse.trace({
        name: agentName,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      const startTime = new Date(Date.now() - latencyMs);
      const endTime = new Date();

      trace.generation({
        name: `${agentName}-generation`,
        input: typeof input === 'string' ? input : JSON.stringify(input),
        output: typeof output === 'string' ? output : JSON.stringify(output),
        startTime,
        endTime,
        usage: tokens ? {
          promptTokens: tokens.prompt,
          completionTokens: tokens.completion,
        } : undefined,
      });

      // Flush event queue
      await this.langfuse.flushAsync();
    } catch (err) {
      console.error(`Failed to trace agent call for ${agentName} in Langfuse:`, err);
    }
  }
}
export default LangfuseService;
