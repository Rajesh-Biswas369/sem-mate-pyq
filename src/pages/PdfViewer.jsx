import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import { pyqData } from "../data/pyqData";

// Keep these if you want text selection, but we will disable them on mobile for speed
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
  const [scale, setScale] = useState(1.0); // Start at exactly 100%
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);

  // This hook ensures the PDF always perfectly fits the user's screen (Phone vs PC)
  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!paper) {
    return <div className="app electric-bg">PDF not found.</div>;
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  // Calculate base width: full width on mobile, max 800px on PC
  const baseWidth = containerWidth < 768 ? containerWidth * 0.95 : 800;

  return (
    <div className="app electric-bg page-shell pdf-viewer-shell">
      {/* Top Navigation Bar */}
      <div className="topbar pdf-nav">
        <Link
          to={`/subject/${encodeURIComponent(decodedSemester)}/${encodeURIComponent(decodedSubject)}`}
          className="tiny-action back-btn"
        >
          ←
        </Link>

        <p className="pdf-header-title">{paper.title}</p>

        {/* New Simple Zoom Controls */}
        <div className="zoom-controls">
          <button 
            className="tiny-action" 
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            −
          </button>
          <span className="zoom-text">{Math.round(scale * 100)}%</span>
          <button 
            className="tiny-action" 
            onClick={() => setScale((s) => Math.min(3.0, s + 0.2))}
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Stage */}
      <div className="pdf-stage pdf-scroll-area">
        <Document
          file={paper.pdf}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<p className="pdf-status">Loading PDF perfectly...</p>}
          error={<p className="pdf-status">Failed to load PDF file.</p>}
        >
          {Array.from(new Array(numPages), (_, index) => (
            <div className="pdf-page-wrap thunder-paper" key={`page_${index + 1}`}>
              <Page
                pageNumber={index + 1}
                width={baseWidth * scale}
                // Disabling text & annotation layers drastically improves scrolling speed on mobile
                renderTextLayer={false}
                renderAnnotationLayer={false}
                devicePixelRatio={Math.max(window.devicePixelRatio || 1, 2)} // Keeps text crisp
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PdfViewer;