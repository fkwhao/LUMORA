import type { CitationReference } from "../../../../shared/citation-contract";

interface InlineCitationsProps {
  references: CitationReference[];
  onOpen(reference: CitationReference): void;
}

export function InlineCitationMark({
  reference,
  onOpen,
}: {
  reference: CitationReference;
  onOpen(reference: CitationReference): void;
}) {
  return (
    <span className="inline-citation-tip">
      <button
        className="inline-citation-mark"
        type="button"
        aria-label={`查看引用 ${reference.number}：${reference.label}`}
        onClick={() => onOpen(reference)}
      >
        {reference.number}
      </button>
      <span className="inline-citation-tip-box" role="tooltip">
        {reference.label}
      </span>
    </span>
  );
}

export function InlineCitations({ references, onOpen }: InlineCitationsProps) {
  if (references.length === 0) return null;
  return (
    <div className="inline-citation-footer" aria-label="引用来源">
      {references.map((reference) => (
        <button
          className="inline-citation-reference"
          type="button"
          key={`${reference.number}:${reference.kind}:${reference.url ?? reference.path ?? reference.attachmentId ?? reference.artifactId}`}
          onClick={() => onOpen(reference)}
        >
          <span className="inline-citation-mark" aria-hidden="true">
            {reference.number}
          </span>
          <span className="inline-citation-label">{reference.label}</span>
          {reference.host && (
            <>
              <span className="inline-citation-separator">·</span>
              <span className="inline-citation-host">{reference.host}</span>
            </>
          )}
          <span className="inline-citation-arrow" aria-hidden="true">
            <CitationArrow />
          </span>
        </button>
      ))}
    </div>
  );
}

function CitationArrow() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  );
}
