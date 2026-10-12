import { useMemo } from 'react';
import { highlightLines, type Lang } from './highlight';

const MAX_HIGHLIGHT_LINES = 3000;

interface Props {
  code: string;
  lang: Lang;
  label: string;
  /** 1-based lines to mark (e.g. a diagnostic location). */
  markLines?: number[];
  maxHeight?: string;
}

/** Read-only, syntax-highlighted code with line numbers. Content is rendered as text nodes (never HTML). */
export function CodeView({ code, lang, label, markLines = [], maxHeight }: Props) {
  const lines = useMemo(() => (code.split('\n').length > MAX_HIGHLIGHT_LINES ? null : highlightLines(code, lang)), [code, lang]);
  return (
    <div className="codeview" style={maxHeight ? { maxHeight } : undefined} role="region" aria-label={label} tabIndex={0}>
      {lines ? (
        <pre>
          <code>
            {lines.map((toks, i) => (
              <span key={i} className={`cl${markLines.includes(i + 1) ? ' cl-mark' : ''}`}>
                <span className="ln" aria-hidden="true">{i + 1}</span>
                <span className="lt">
                  {toks.length === 0 ? '​' : toks.map((t, k) => (t.cls ? <span key={k} className={t.cls}>{t.text}</span> : t.text))}
                </span>
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
