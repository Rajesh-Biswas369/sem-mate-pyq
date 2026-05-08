import { useState, useEffect, useRef } from "react";
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

  // --- GOOGLE DRIVE SCROLLBAR STATES ---
  const scrollContainerRef = useRef(null);
  const [showDriveScroll, setShowDriveScroll] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const hideTimeout = useRef(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // NEW: Flash the scrollbar when the PDF finishes loading!
  useEffect(() => {
    if (numPages > 0) {
      setShowDriveScroll(true);
      clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        if (!isDragging.current) setShowDriveScroll(false);
      }, 2500);
    }
  }, [numPages]);

  const handleScroll = (e) => {
    const container = e.target;
    const { scrollTop, scrollHeight, clientHeight } = container;
    
    const maxScroll = scrollHeight - clientHeight;
    // Prevent errors if maxScroll is 0
    if (maxScroll <= 0) return; 
    
    const progress = scrollTop / maxScroll;
    // Clamp the progress strictly between 0 and 1
    setScrollProgress(Math.min(Math.max(progress, 0), 1));

    const pages = container.querySelectorAll(".pdf-page-wrap");
    const middle = clientHeight / 2;

    pages.forEach((page) => {
      const rect = page.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      const relativeTop = rect.top - containerRect.top;
      const relativeBottom = rect.bottom - containerRect.top;

      if (relativeTop <= middle && relativeBottom >= middle) {
        const pageNum = Number(page.getAttribute("data-page-number"));
        if (pageNum && pageNum !== currentPage) {
          setCurrentPage(pageNum);
        }
      }
    });

    setShowDriveScroll(true);
    clearTimeout(hideTimeout.current);
    if (!isDragging.current) {
      hideTimeout.current = setTimeout(() => setShowDriveScroll(false), 1500);
    }
  };

  const handlePointerDown = (e) => {
    isDragging.current = true;
    setShowDriveScroll(true);
    clearTimeout(hideTimeout.current);

    const startY = e.clientY;
    const container = scrollContainerRef.current;
    const startScrollTop = container.scrollTop;
    
    const { scrollHeight, clientHeight } = container;
    const maxScroll = scrollHeight - clientHeight;
    const maxThumbMove = clientHeight - 48;

    const onPointerMove = (moveEvent) => {
      if (!isDragging.current) return;
      moveEvent.preventDefault();

      const deltaY = moveEvent.clientY - startY;
      const percentageChange = deltaY / maxThumbMove;
      let newScrollTop = startScrollTop + (percentageChange * maxScroll);

      if (newScrollTop < 0) newScrollTop = 0;
      if (newScrollTop > maxScroll) newScrollTop = maxScroll;

      container.scrollTop = newScrollTop;
    };

    const onPointerUp = () => {
      isDragging.current = false;
      hideTimeout.current = setTimeout(() => setShowDriveScroll(false), 1500);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
  };

  if (!paper) return <div className="app electric-bg">PDF not found.</div>;

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setCurrentPage(1);
  }

  const baseWidth = containerWidth < 768 ? containerWidth * 0.95 : 800;

  return (
    <div 
      className="app electric-bg page-shell pdf-viewer-shell"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="topbar pdf-nav">
        <div className="nav-left">
          <Link to={`/subject/${encodeURIComponent(decodedSemester)}/${encodeURIComponent(decodedSubject)}`} className="tiny-action back-btn">
            ←
          </Link>
          <div className="page-counter">{currentPage} / {numPages || "-"}</div>
        </div>
        <p className="pdf-header-title">{paper.title}</p>
        <div className="zoom-controls">
          <button className="tiny-action" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>−</button>
          <span className="zoom-text">{Math.round(scale * 100)}%</span>
          <button className="tiny-action" onClick={() => setScale((s) => Math.min(3.0, s + 0.2))}>+</button>
        </div>
      </div>

      {/* STRICT MOBILE FIX: Use 85vh instead of calc, and force overflow behavior */}
      <div 
        className="pdf-stage pdf-scroll-area custom-hide-scrollbar" 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ 
          height: "85vh", 
          overflowY: "auto", 
          overflowX: "hidden", 
          position: "relative" 
        }}
      >
        <Document
          file={paper.pdf}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<p className="pdf-status">Loading PDF perfectly...</p>}
          error={<p className="pdf-status">Failed to load PDF file.</p>}
        >
          {numPages > 0 && Array.from(new Array(numPages), (_, index) => (
            <div className="pdf-page-wrap thunder-paper" key={`page_${index + 1}`} data-page-number={index + 1}>
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

      <div className={`drive-scrollbar-track ${showDriveScroll ? "visible" : ""}`}>
        <div
          className="drive-scrollbar-thumb"
          style={{ top: `calc(${scrollProgress * 100}% - ${scrollProgress * 48}px)` }}
          onPointerDown={handlePointerDown}
        >
          <div className="thumb-lines">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="thumb-bubble">
            {currentPage} / {numPages || "-"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PdfViewer;