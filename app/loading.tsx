export default function Loading() {
  return <section className="page-loading" role="status" aria-label="ページを読み込み中" aria-busy="true"><div className="loading-mark">F<span /></div><p>もう少しで準備できます</p><div className="skeleton heading" /><div className="skeleton" /><div className="skeleton" /><span className="sr-only">読み込み中です</span></section>;
}
