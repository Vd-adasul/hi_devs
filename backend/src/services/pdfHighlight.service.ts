import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageTextData {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface HighlightBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PdfHighlightService {
  private static instance: PdfHighlightService | null = null;

  private constructor() {}

  public static getInstance(): PdfHighlightService {
    if (!PdfHighlightService.instance) {
      PdfHighlightService.instance = new PdfHighlightService();
    }
    return PdfHighlightService.instance;
  }

  public async getTextPositions(pdfBuffer: Buffer): Promise<PageTextData[]> {
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const doc = await loadingTask.promise;
    const pages: PageTextData[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      const items: TextItem[] = textContent.items.map((item: any) => {
        // transform array: [scaleX, skewY, skewX, scaleY, transformX, transformY]
        const x = item.transform[4];
        const y = viewport.height - item.transform[5];
        return {
          text: item.str,
          x,
          y,
          width: item.width,
          height: item.height,
        };
      });

      pages.push({
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
        items,
      });
    }

    return pages;
  }

  public findClauseBoxes(pages: PageTextData[], clauseText: string): HighlightBox[] {
    const boxes: HighlightBox[] = [];
    if (!clauseText || clauseText.trim().length < 5) return boxes;

    const normalizedClause = clauseText.toLowerCase().replace(/\s+/g, ' ').trim();
    // Use first 30 chars for anchor matching if it is very long
    const matchAnchor = normalizedClause.slice(0, Math.min(30, normalizedClause.length));

    for (const page of pages) {
      let currentBuffer = '';
      let activeItems: TextItem[] = [];

      for (let i = 0; i < page.items.length; i++) {
        const item = page.items[i];
        if (!item.text || item.text.trim() === '') continue;

        currentBuffer += item.text + ' ';
        activeItems.push(item);

        const normBuffer = currentBuffer.toLowerCase().replace(/\s+/g, ' ').trim();

        if (normBuffer.includes(matchAnchor)) {
          // We found a starting match. Let's trace how many items we need to cover the full clause.
          // In a simple model, we can merge the coordinates of activeItems.
          const xs = activeItems.map(b => b.x);
          const ys = activeItems.map(b => b.y);
          const widths = activeItems.map(b => b.width);
          const heights = activeItems.map(b => b.height);

          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs.map((x, idx) => x + widths[idx]));
          const maxY = Math.max(...ys.map((y, idx) => y + heights[idx]));

          boxes.push({
            page: page.pageNumber,
            x: minX,
            y: minY - 2, // Slight offset to cover the text nicely
            width: Math.max(maxX - minX, 10),
            height: Math.max(maxY - minY + 4, 12),
          });

          // Reset buffers for next search
          currentBuffer = '';
          activeItems = [];
        }

        // Keep buffer size reasonable
        if (currentBuffer.length > normalizedClause.length * 2 + 50) {
          currentBuffer = currentBuffer.substring(activeItems[0].text.length + 1);
          activeItems.shift();
        }
      }
    }

    return boxes;
  }

  public enrichHighlights(pages: PageTextData[], clauses: Array<{ _id?: any; text: string; category?: string; riskLevel?: string }>): any[] {
    return clauses.map(clause => {
      const boxes = this.findClauseBoxes(pages, clause.text);
      return {
        clauseId: clause._id ? clause._id.toString() : undefined,
        text: clause.text,
        category: clause.category,
        riskLevel: clause.riskLevel || 'low',
        boxes,
      };
    });
  }
}
export default PdfHighlightService;
