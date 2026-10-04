import { useMemo } from 'react';
import { tokenize } from '../reader/text';
export function QuestionText({ html, count, marker = true }: { html: string; count?: number; marker?: boolean }) {
  const parsed = useMemo(() => tokenize(html), [html]); const n = count ?? parsed.tokens.length;
  // Each fragment has been sanitized with an allowlist before tokenization.
  return <div className="question-text" data-testid="question-text">{parsed.tokens.slice(0, n).map((t, i) => <span key={i}>{marker && parsed.powerBoundary === i && <span className="power-marker">(*) </span>}<span dangerouslySetInnerHTML={{ __html: t.html }} />{' '}</span>)}{n === 0 && <span className="waiting-text">The reader is getting ready…</span>}{n > 0 && n < parsed.tokens.length && <span className="reading-cursor" aria-hidden="true">▌</span>}</div>;
}
