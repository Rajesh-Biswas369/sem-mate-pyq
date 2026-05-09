import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import { pyqData } from "../data/pyqData";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function titleFromPath(path = "") {
  const fileName = path.split("/").filter(Boolean).pop() || "PDF Document";
  return safeDecode(fileName)
    .replace(/\.pdf$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getLegacyPaper(semesterName, subjectName, paperIndex) {
  if (!semesterName || !subjectName || paperIndex === undefined) return null;

  const decodedSemester = safeDecode(semesterName);
  const decodedSubject = safeDecode(subjectName);
  const semester = pyqData.find((item) => item.semester === decodedSemester);
  const subject = semester?.subjects?.find((item) => item.name === decodedSubject);

  return subject?.papers?.[Number(paperIndex)] || null;
}

function normalizeFileUrl(rawValue = "") {
  const decoded = safeDecode(rawValue).replace(/^\/+/, "");
  return decoded ? `/${decoded}` : "";
}

function PdfViewer() {
  const params = useParams();
  const location = useLocation();

  const legacyPaper = useMemo(
    () => getLegacyPaper(params.semesterName, params.subjectName, params.paperIndex),
    [params.semesterName, params.subjectName, params.paperIndex]
  );

  const rawFileParam = params.fileUrl || params["*"] || "";

  const fileUrl = useMemo(() => {
    if (location.state?.fileUrl) return location.state.fileUrl;
    if (legacyPaper?.url) return legacyPaper.url;
    if (legacyPaper?.pdf) return legacyPaper.pdf;
    return normalizeFileUrl(rawFileParam);
  }, [legacyPaper, location.state, rawFileParam]);

  const title = location.state?.title || legacyPaper?.title || titleFromPath(fileUrl);

  const backTo =
    location.state?.backTo ||
    (params.semesterName && params.subjectName
      ? `/subject/${encodeURIComponent(safeDecode(params.semesterName))}/${encodeURIComponent(
          safeDecode(params.subjectName)
        )}`
      : "/");

  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === "undefined" ? 900 : window.innerWidth
  );
  const [showDriveScroll, setShowDriveScroll] = useState(false);

  const scrollContainerRef = useRef(null);
  const thumbRef = useRef(null);
  const pageRefs = useRef([]);
  const hideTimeoutRef = useRef(null);
  const scrollRafRef = useRef(null);
  const isDraggingRef = useRef(false);
  const driveScrollVisibleRef = useRef(false);

  const isMobile = viewportWidth <= 768;
  const pagesAroundCurrent = isMobile ? 1 : 2;

  useEffect(() => {
    let animationFrame = null;

    const handleResize = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        setViewportWidth(window.innerWidth);
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    setNumPages(null);
    setCurrentPage(1);
    setScale(1);
    pageRefs.current = [];

    const container = scrollContainerRef.current;
    if (container) container.scrollTop = 0;
  }, [fileUrl]);

  useEffect(() => {
    return () => {
      clearTimeout(hideTimeoutRef.current);
      cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const pageWidth = useMemo(() => {
    const sideGap = isMobile ? 24 : 96;
    const maxBaseWidth = isMobile ? viewportWidth - sideGap : 820;
    return Math.max(280, maxBaseWidth * scale);
  }, [isMobile, scale, viewportWidth]);

  const estimatedPageHeight = useMemo(() => {
    // A4-like ratio. This keeps smooth scrolling even before every PDF page is rendered.
    return Math.round(pageWidth * 1.414);
  }, [pageWidth]);

  const devicePixelRatio = useMemo(() => {
    if (typeof window === "undefined") return 1;
    if (isMobile) return 1;
    return Math.min(window.devicePixelRatio || 1, 1.5);
  }, [isMobile]);

  useEffect(() => {
    if (!numPages || !scrollContainerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const pageNumber = Number(entry.target.getAttribute("data-page-number"));
          if (!Number.isNaN(pageNumber)) {
            setCurrentPage((previousPage) =>
              previousPage === pageNumber ? previousPage : pageNumber
            );
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "-42% 0px -42% 0px",
        threshold: 0,
      }
    );

    pageRefs.current.forEach((pageElement) => {
      if (pageElement) observer.observe(pageElement);
    });

    return () => observer.disconnect();
  }, [numPages, pageWidth]);

  const revealDriveScrollbar = () => {
    if (!driveScrollVisibleRef.current) {
      driveScrollVisibleRef.current = true;
      setShowDriveScroll(true);
    }

    clearTimeout(hideTimeoutRef.current);

    if (!isDraggingRef.current) {
      hideTimeoutRef.current = setTimeout(() => {
        driveScrollVisibleRef.current = false;
        setShowDriveScroll(false);
      }, 1400);
    }
  };

  const updateDriveThumb = () => {
    const container = scrollContainerRef.current;
    const thumb = thumbRef.current;
    if (!container || !thumb) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const maxScroll = Math.max(scrollHeight - clientHeight, 0);
    const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;

    thumb.style.top = `calc(${progress * 100}% - ${progress * 48}px)`;
  };

  const handleScroll = () => {
    revealDriveScrollbar();

    if (scrollRafRef.current) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      updateDriveThumb();
      scrollRafRef.current = null;
    });
  };

  const handlePointerDown = (event) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    event.preventDefault();
    isDraggingRef.current = true;
    revealDriveScrollbar();

    const startY = event.clientY;
    const startScrollTop = container.scrollTop;
    const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 0);
    const maxThumbMove = Math.max(container.clientHeight - 48, 1);

    const onPointerMove = (moveEvent) => {
      if (!isDraggingRef.current) return;
      moveEvent.preventDefault();

      const deltaY = moveEvent.clientY - startY;
      const percentageChange = deltaY / maxThumbMove;
      const nextScrollTop = Math.min(
        Math.max(startScrollTop + percentageChange * maxScroll, 0),
        maxScroll
      );

      container.scrollTop = nextScrollTop;
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => {
        driveScrollVisibleRef.current = false;
        setShowDriveScroll(false);
      }, 1200);

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
  };

  const shouldRenderPage = (pageNumber) => {
    if (pageNumber === 1 || pageNumber === numPages) return true;
    return Math.abs(pageNumber - currentPage) <= pagesAroundCurrent;
  };

  if (!fileUrl) {
    return (
      <div className="app electric-bg page-shell pdf-viewer-shell">
        <Link to={backTo} className="back-btn">
          ← Back
        </Link>
        <div className="empty-box">
          <h2>PDF not found</h2>
          <p>The file path was empty.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="app electric-bg page-shell pdf-viewer-shell drive-pdf-viewer"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="topbar pdf-nav pdf-nav-smart">
        <div className="nav-left">
          <Link to={backTo} className="tiny-action back-btn" aria-label="Back">
            ←
          </Link>
          <div className="page-counter">
            {currentPage} / {numPages || "-"}
          </div>
        </div>

        <p className="pdf-header-title">{title}</p>

        <div className="zoom-controls">
          <button
            className="tiny-action"
            onClick={() => setScale((currentScale) => Math.max(0.75, currentScale - 0.15))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="zoom-text">{Math.round(scale * 100)}%</span>
          <button
            className="tiny-action"
            onClick={() => setScale((currentScale) => Math.min(2.25, currentScale + 0.15))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <main
        className="pdf-stage pdf-scroll-area custom-hide-scrollbar drive-pdf-scroll-area"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: loadedPages }) => {
            setNumPages(loadedPages);
            pageRefs.current = new Array(loadedPages);
            requestAnimationFrame(updateDriveThumb);
          }}
          loading={<p className="pdf-status">Loading PDF perfectly...</p>}
          error={
            <div className="empty-box">
              <h2>Failed to load PDF</h2>
              <p>Check that this file exists inside public{fileUrl}</p>
            </div>
          }
        >
          {numPages > 0 &&
            Array.from({ length: numPages }, (_, index) => {
              const pageNumber = index + 1;
              const renderThisPage = shouldRenderPage(pageNumber);

              return (
                <div
                  className={`pdf-page-wrap thunder-paper drive-pdf-page ${
                    renderThisPage ? "" : "drive-pdf-placeholder"
                  }`}
                  key={`page_${pageNumber}`}
                  data-page-number={pageNumber}
                  ref={(element) => {
                    pageRefs.current[index] = element;
                  }}
                  style={{ minHeight: estimatedPageHeight }}
                >
                  {renderThisPage ? (
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      devicePixelRatio={devicePixelRatio}
                      loading={<div className="pdf-page-loading">Loading page {pageNumber}...</div>}
                    />
                  ) : (
                    <div className="pdf-placeholder-content">Page {pageNumber}</div>
                  )}
                </div>
              );
            })}
        </Document>
      </main>

      <div className={`drive-scrollbar-track ${showDriveScroll ? "visible" : ""}`}>
        <div
          ref={thumbRef}
          className="drive-scrollbar-thumb"
          onPointerDown={handlePointerDown}
          role="slider"
          aria-label="PDF scroll position"
          aria-valuemin="1"
          aria-valuemax={numPages || 1}
          aria-valuenow={currentPage}
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
