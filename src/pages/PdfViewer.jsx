import { useState, useEffect } from "react";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Rock-solid scroll tracker
  const handleScroll = (e) => {
    const container = e.target;
    const pages = container.querySelectorAll(".pdf-page-wrap");
    
    // Middle of the container
    const middle = window.innerHeight / 2;

    pages.forEach((page) => {
      const rect = page.getBoundingClientRect();
      // If this page crosses the middle of the screen, make it the active page
      if (rect.top <= middle && rect.bottom >= middle) {
        const pageNum = Number(page.getAttribute("data-page-number"));
        if (pageNum && pageNum !== currentPage) {
          setCurrentPage(pageNum);
        }
      }
    });
  };

  if (!paper) {
    return <div className="app electric-bg">PDF not found.</div>;
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setCurrentPage(1); // Reset to page 1 when loaded
  }

  const baseWidth = containerWidth < 768 ? containerWidth * 0.95 : 800;

  return (
    <div className="app electric-bg page-shell pdf-viewer-shell">
      {/* Top Navigation Bar */}
      <div className="topbar pdf-nav">
        <div className="nav-left">
          <Link
            to={`/subject/${encodeURIComponent(decodedSemester)}/${encodeURIComponent(decodedSubject)}`}
            className="tiny-action back-btn"
          >
            ←
          </Link>
          
          {/* Page Counter Pill */}
          <div className="page-counter">
            {currentPage} / {numPages || "-"}
          </div>
        </div>

        <p className="pdf-header-title">{paper.title}</p>

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

      {/* Added the onScroll listener right here */}
      <div className="pdf-stage pdf-scroll-area" onScroll={handleScroll}>
        <Document
          file={paper.pdf}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<p className="pdf-status">Loading PDF perfectly...</p>}
          error={<p className="pdf-status">Failed to load PDF file.</p>}
        >
          {Array.from(new Array(numPages), (_, index) => (
            <div 
              className="pdf-page-wrap thunder-paper" 
              key={`page_${index + 1}`}
              data-page-number={index + 1}
            >
              <Page
                pageNumber={index + 1}
                width={baseWidth * scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                devicePixelRatio={Math.max(window.devicePixelRatio || 1, 2)}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PdfViewer;