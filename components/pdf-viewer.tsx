"use client";

import { useRef } from "react";
import { ExternalLink, FileText, X } from "lucide-react";

export function PdfViewer({ title, fileName, url }: { title: string; fileName: string; url: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return <>
    <button className="event-document-button" type="button" onClick={() => dialogRef.current?.showModal()}><FileText />資料を見る</button>
    <dialog className="pdf-dialog" ref={dialogRef} onClick={(event) => {
      if (event.target === dialogRef.current) dialogRef.current.close();
    }}>
      <div className="pdf-modal">
        <header><div><strong>{title}</strong><small>{fileName}</small></div><div><a href={url} target="_blank" rel="noreferrer noopener" aria-label="別タブで開く"><ExternalLink /></a><button type="button" aria-label="閉じる" onClick={() => dialogRef.current?.close()}><X /></button></div></header>
        <iframe src={`${url}#page=1&view=Fit&toolbar=0&navpanes=0`} title={`${title}のPDF資料`} />
      </div>
    </dialog>
  </>;
}
