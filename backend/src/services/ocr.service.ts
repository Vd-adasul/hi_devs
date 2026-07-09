import dotenv from 'dotenv';
dotenv.config();

export class OcrService {
  private static instance: OcrService | null = null;
  private apiKey: string | null = null;

  private constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  }

  public static getInstance(): OcrService {
    if (!OcrService.instance) {
      OcrService.instance = new OcrService();
    }
    return OcrService.instance;
  }

  /**
   * Perform AI-powered OCR on scanned PDFs by passing the PDF binary directly to Gemini 2.5 Flash.
   */
  public async performOcr(pdfBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required to run OCR on scanned documents.');
    }

    const base64Pdf = pdfBuffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              text: 'Perform OCR on this scanned contract PDF. Extract all text verbatim. Maintain structure, headers, and bullet points. Do not summarize or add remarks.',
            },
          ],
        },
      ],
    };

    try {
      console.log(`Sending scanned PDF to Gemini 2.5 Flash for OCR (${pdfBuffer.length} bytes)...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini OCR API returned HTTP ${response.status}: ${errorText}`);
      }

      const resJson = await response.json() as any;
      const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response returned from Gemini OCR model.');
      }

      console.log(`OCR successfully completed. Extracted ${text.length} characters.`);
      return text;
    } catch (err) {
      console.error('OCR pipeline failed:', err);
      throw err;
    }
  }

  /**
   * Helper to determine if a parsed PDF's text content is too low to be useful (indicating a scanned doc).
   */
  public isScannedDocument(extractedText: string): boolean {
    const cleanText = extractedText.replace(/\s+/g, '').trim();
    // If the document has fewer than 150 characters, it is likely scanned or empty.
    return cleanText.length < 150;
  }
}
export default OcrService;
