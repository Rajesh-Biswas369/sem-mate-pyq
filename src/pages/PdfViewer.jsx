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
  const [currentPage, setCurrentPage] = useState(1); // Track current scroll page
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Intersection Observer to magically track which page is currently on screen
  useEffect(() => {
    if (!numPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = entry.target.getAttribute("data-page-number");
            if (pageNum) setCurrentPage(Number(pageNum));
          }
        });
      },
      { threshold: 0.4 } // Triggers when 40% of a page is visible on screen
    );

    // Give react-pdf a tiny moment to render the divs, then observe them
    const timeoutId = setTimeout(() => {
      const pageElements = document.querySelectorAll(".pdf-page-wrap");
      pageElements.forEach((page) => observer.observe(page));
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [numPages]);

  if (!paper) {
    return <div className="app electric-bg">PDF not found.</div>;
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
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
          
          {/* New Page Counter Pill */}
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

      <div className="pdf-stage pdf-scroll-area">
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
              data-page-number={index + 1} // Crucial for the observer to know what page this is
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