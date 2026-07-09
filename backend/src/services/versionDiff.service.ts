import * as Diff from 'diff';

export interface DiffSegment {
  added?: boolean;
  removed?: boolean;
  value: string;
}

export class VersionDiffService {
  private static instance: VersionDiffService | null = null;

  private constructor() {}

  public static getInstance(): VersionDiffService {
    if (!VersionDiffService.instance) {
      VersionDiffService.instance = new VersionDiffService();
    }
    return VersionDiffService.instance;
  }

  /**
   * Computes the line-by-line diff between old text and new text.
   * Returns a list of segments with added/removed markers.
   */
  public computeDiff(oldText: string, newText: string): DiffSegment[] {
    return Diff.diffLines(oldText, newText);
  }

  /**
   * Generates a side-by-side or inline HTML diff.
   */
  public generateDiffHtml(oldText: string, newText: string): string {
    const diff = this.computeDiff(oldText, newText);
    let html = '<div class="diff-container" style="font-family: monospace; white-space: pre-wrap; line-height: 1.5;">';

    diff.forEach(part => {
      const color = part.added ? '#dcfce7' : part.removed ? '#fee2e2' : 'transparent';
      const textColor = part.added ? '#166534' : part.removed ? '#991b1b' : '#334155';
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      const textDecoration = part.removed ? 'line-through' : 'none';

      // Split value by newlines to append prefixes correctly per line
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') {
        lines.pop(); // remove trailing newline split item
      }

      lines.forEach(line => {
        html += `<div style="background-color: ${color}; color: ${textColor}; text-decoration: ${textDecoration}; padding: 2px 4px; display: flex;">
          <span style="user-select: none; width: 24px; opacity: 0.5;">${prefix}</span>
          <span>${this.escapeHtml(line)}</span>
        </div>`;
      });
    });

    html += '</div>';
    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
export default VersionDiffService;
