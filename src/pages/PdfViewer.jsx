import { useState, useEffect, useRef, useMemo } from "react";
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

  // Memoize the paper lookup so it doesn't recalculate on every minor render
  const paper = useMemo(() => {
    const semester = pyqData.find((item) => item.semester === decodedSemester);
    const subject = semester?.subjects.find((item) => item.name === decodedSubject);
    return subject?.papers[Number(paperIndex)];
  }, [decodedSemester, decodedSubject, paperIndex]);

  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [showDriveScroll, setShowDriveScroll] = useState(false);

  // Refs for performance optimizations (bypassing state re-renders)
  const containerWidthRef = useRef(window.innerWidth);
  const scrollContainerRef = useRef(null);
  const thumbRef = useRef(null);
  const hideTimeout = useRef(null);
  const isDragging = useRef(false);
  const pageRefs = useRef([]);

  // 1. Resize Listener (Using Ref to prevent re-renders on every pixel resize)
  useEffect(() => {
    const handleResize = () => {
      containerWidthRef.current = window.innerWidth;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 2. Intersection Observer for ultra-smooth Page Tracking
  useEffect(() => {
    if (!numPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute("data-page-number"));
            setCurrentPage(pageNum);
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "-40% 0px -40% 0px", // Triggers when page is near the middle
        threshold: 0,
      }
    );

    pageRefs.current.forEach((page) => {
      if (page) observer.observe(page);
    });

    return () => observer.disconnect();
  }, [numPages]);

  // 3. High-Performance Scroll Tracker (Direct DOM Manipulation)
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !thumbRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const maxScroll = scrollHeight - clientHeight;
    const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;

    // Update thumb position directly bypassing React state
    thumbRef.current.style.top = `calc(${progress * 100}% - ${progress * 48}px)`;

    setShowDriveScroll(true);
    clearTimeout(hideTimeout.current);
    if (!isDragging.current) {
      hideTimeout.current = setTimeout(() => setShowDriveScroll(false), 1500);
    }
  };

  // 4. Custom Drag Handler
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

  const baseWidth = containerWidthRef.current < 768 ? containerWidthRef.current * 0.95 : 800;

  return (
    <div className="app electric-bg page-shell pdf-viewer-shell" onContextMenu={(e) => e.preventDefault()}>
      
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

      <div 
        className="pdf-stage pdf-scroll-area custom-hide-scrollbar" 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ height: "calc(100vh - 120px)", overflowY: "auto", position: "relative" }}
      >
        <Document
          file={paper.pdf}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<p className="pdf-status">Loading PDF perfectly...</p>}
          error={<p className="pdf-status">Failed to load PDF file.</p>}
        >
          {numPages > 0 && Array.from(new Array(numPages), (_, index) => (
            <div 
              className="pdf-page-wrap thunder-paper" 
              key={`page_${index + 1}`} 
              data-page-number={index + 1}
              ref={(el) => (pageRefs.current[index] = el)} // Attach ref for Observer
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

      <div className={`drive-scrollbar-track ${showDriveScroll ? "visible" : ""}`}>
        <div
          ref={thumbRef} // Direct DOM reference
          className="drive-scrollbar-thumb"
          onPointerDown={handlePointerDown}
        >
          <div className="thumb-lines">
            <span></span><span></span><span></span>
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