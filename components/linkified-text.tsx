const urlPattern = /(https?:\/\/[^\s]+)/g;

export function LinkifiedText({ text }: { text?: string | null }) {
  if (!text) return null;
  return <>{text.split(urlPattern).map((part, index) => /^https?:\/\//.test(part)
    ? <a className="description-link" href={part} target="_blank" rel="noreferrer noopener" key={`${part}-${index}`}>{part}</a>
    : part)}</>;
}
