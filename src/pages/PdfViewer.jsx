import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import { pyqData } from "../data/pyqData";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function PdfViewer() {
  const { semesterName, subjectName, paperIndex } = useParams();

  const decodedSemester = decodeURIComponent(semesterName);
  const decodedSubject = decodeURIComponent(subjectName);

  const semester = pyqData.find((item) => item.semester === decodedSemester);
  const subject = semester?.subjects.find((item) => item.name === decodedSubject);
  const paper = subject?.papers[Number(paperIndex)];

  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.1);
  const [showTools, setShowTools] = useState(false);

  if (!paper) {
    return <div className="app electric-bg">PDF not found.</div>;
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  function blockKeys(e) {
    if (
      (e.ctrlKey && e.key.toLowerCase() === "s") ||
      (e.ctrlKey && e.key.toLowerCase() === "p") ||
      (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i")
    ) {
      e.preventDefault();
    }
  }

  return (
    <div
      className="viewer-page electric-bg"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={blockKeys}
      tabIndex="0"
    >
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <div className="floating-viewer-actions">
        <Link
          to={`/subject/${encodeURIComponent(decodedSemester)}/${encodeURIComponent(decodedSubject)}`}
          className="tiny-action"
        >
          ←
        </Link>

        <button className="tiny-action" onClick={() => setShowTools((v) => !v)}>
          ⚡
        </button>
      </div>

      {showTools && (
        <div className="floating-tools">
          <p>{paper.title}</p>

          <button onClick={() => setScale((s) => Math.max(0.7, s - 0.1))}>
            Zoom -
          </button>

          <button onClick={() => setScale((s) => Math.min(1.8, s + 0.1))}>
            Zoom +
          </button>

          <span>View Only</span>
        </div>
      )}

      <div className="pdf-stage">
        <Document
          file={paper.pdf}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => {
            console.error("PDF load error:", error);
            console.log("Trying to load PDF from:", paper.pdf);
          }}
          loading={<p className="pdf-status">Loading PDF...</p>}
          error={<p className="pdf-status">Failed to load PDF file.</p>}
        >
          {Array.from(new Array(numPages), (_, index) => (
            <div className="pdf-page-wrap thunder-paper" key={`page_${index + 1}`}>
              <div className="watermark">JU EE PYQ • View Only</div>
              <Page pageNumber={index + 1} scale={scale} />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PdfViewer;