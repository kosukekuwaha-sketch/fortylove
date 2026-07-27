export default function Settings() {
  return <section className="admin-page"><div className="page-title"><div><p className="eyebrow green">SETTINGS</p><h1>運用設定</h1><p>募集期間と管理者設定を管理します。</p></div></div><div className="settings-card"><h2>新歓受付</h2><p>受付を終了すると、新入生からの新規入会申請を停止します。</p><button className="danger" disabled>新歓を終了する</button><small>誤操作防止のため、データベース上で設定してください。</small></div></section>;
}
