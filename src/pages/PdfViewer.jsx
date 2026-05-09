import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import { pyqData } from "../data/pyqData";
import { auth } from "../firebase";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ADMIN_EMAILS = ["maxjoy146@gmail.com", "kk9327721@gmail.com"];
const TRIAL_SECONDS = 120;

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

function normalizeFileUrl(rawValue = "") {
  const decoded = safeDecode(rawValue).replace(/^\/+/, "");
  return decoded ? `/${decoded}` : "";
}

function getLegacyPaper(semesterName, subjectName, paperIndex) {
  if (!semesterName || !subjectName || paperIndex === undefined) return null;

  const decodedSemester = safeDecode(semesterName);
  const decodedSubject = safeDecode(subjectName);
  const semester = pyqData.find((item) => item.semester === decodedSemester);
  const subject = semester?.subjects?.find((item) => item.name === decodedSubject);

  return subject?.papers?.[Number(paperIndex)] || null;
}

function walkFolders(folders = [], fileUrl) {
  for (const folder of folders) {
    const foundFile = folder.files?.find((file) => normalizeFileUrl(file.url) === fileUrl);
    if (foundFile) return foundFile;

    const nestedFile = walkFolders(folder.subFolders || [], fileUrl);
    if (nestedFile) return nestedFile;
  }

  return null;
}

function findFileContext(fileUrl) {
  const normalizedUrl = normalizeFileUrl(fileUrl);

  for (const semester of pyqData) {
    for (const subject of semester.subjects || []) {
      const file = walkFolders(subject.folders || [], normalizedUrl);
      if (file) return { semester, subject, file };
    }
  }

  // Extra fallback for the SSM public folder. This prevents /viewer/Sem4/SSM/... bypass.
  if (normalizedUrl.startsWith("/Sem4/SSM/")) {
    const semester = pyqData.find((item) => item.semester === "Semester 4");
    const subject = semester?.subjects?.find(
      (item) => item.name === "Sequential Systems & Microprocessor"
    );

    if (semester && subject) return { semester, subject, file: null };
  }

  return null;
}

function makeAccessKey(prefix, email, subjectName) {
  if (!email || !subjectName) return "";
  return `${prefix}_${email}_${subjectName}`.replace(/\s+/g, "");
}

function PdfViewer() {
  const params = useParams();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [trialTime, setTrialTime] = useState(0);

  const legacyPaper = useMemo(
    () => getLegacyPaper(params.semesterName, params.subjectName, params.paperIndex),
    [params.semesterName, params.subjectName, params.paperIndex]
  );

  const rawFileParam = params.fileUrl || params["*"] || "";

  const fileUrl = useMemo(() => {
    if (location.state?.fileUrl) return normalizeFileUrl(location.state.fileUrl);
    if (legacyPaper?.url) return normalizeFileUrl(legacyPaper.url);
    if (legacyPaper?.pdf) return normalizeFileUrl(legacyPaper.pdf);
    return normalizeFileUrl(rawFileParam);
  }, [legacyPaper, location.state, rawFileParam]);

  const fileContext = useMemo(() => findFileContext(fileUrl), [fileUrl]);
  const subject = fileContext?.subject || null;
  const subjectRequiresPayment = Boolean(location.state?.requiresPayment || subject?.price);

  const title = location.state?.title || legacyPaper?.title || fileContext?.file?.title || titleFromPath(fileUrl);

  const backTo =
    location.state?.backTo ||
    (fileContext?.semester?.semester && fileContext?.subject?.name
      ? `/subject/${encodeURIComponent(fileContext.semester.semester)}/${encodeURIComponent(
          fileContext.subject.name
        )}`
      : params.semesterName && params.subjectName
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
  const [hdMode, setHdMode] = useState(true);

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
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

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

  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  const paidKey = makeAccessKey("paid", user?.email, subject?.name);
  const trialKey = makeAccessKey("trial", user?.email, subject?.name);
  const isPaid = Boolean(paidKey && localStorage.getItem(paidKey) === "true");

  useEffect(() => {
    if (!user || !subject || !trialKey) {
      setTrialTime(0);
      return;
    }

    const storedStart = Number(localStorage.getItem(trialKey));
    if (!storedStart) {
      setTrialTime(0);
      return;
    }

    const elapsed = Math.floor((Date.now() - storedStart) / 1000);
    setTrialTime(Math.max(TRIAL_SECONDS - elapsed, 0));
  }, [user, subject, trialKey]);

  useEffect(() => {
    if (trialTime <= 0) return undefined;

    const timer = setInterval(() => {
      setTrialTime((previousTime) => Math.max(previousTime - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [trialTime]);

  const hasAccess = !subjectRequiresPayment || Boolean(user && (isAdmin || isPaid || trialTime > 0));

  const pageWidth = useMemo(() => {
    const sideGap = isMobile ? 18 : 96;
    const maxBaseWidth = isMobile ? viewportWidth - sideGap : 820;
    return Math.max(300, maxBaseWidth * scale);
  }, [isMobile, scale, viewportWidth]);

  const estimatedPageHeight = useMemo(() => {
    return Math.round(pageWidth * 1.414);
  }, [pageWidth]);

  const devicePixelRatio = useMemo(() => {
    if (typeof window === "undefined") return 1.5;

    const screenDpr = window.devicePixelRatio || 1;

    if (hdMode) {
      return isMobile ? Math.min(screenDpr, 2.5) : Math.min(screenDpr, 2.25);
    }

    return isMobile ? Math.min(screenDpr, 1.6) : Math.min(screenDpr, 1.75);
  }, [hdMode, isMobile]);

  useEffect(() => {
    if (!numPages || !scrollContainerRef.current || !hasAccess) return;

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
  }, [numPages, pageWidth, hasAccess]);

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

  if (!authReady) {
    return <div className="app electric-bg pdf-status">Checking access...</div>;
  }

  if (!hasAccess) {
    return (
      <div className="app electric-bg page-shell pdf-viewer-shell">
        <Link to={backTo} className="back-btn">
          ← Back
        </Link>
        <section className="empty-box">
          <h2>🔒 Document Locked</h2>
          <p>
            {!user
              ? "Please login first. Trial and document viewing are locked without login."
              : "Payment or an active 2-minute trial is required to view this document."}
          </p>
          {!user ? (
            <Link to="/login" className="open-btn">
              Login ⚡
            </Link>
          ) : (
            <Link to={backTo} className="open-btn">
              Go to Access Panel →
            </Link>
          )}
        </section>
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
            onClick={() => setScale((currentScale) => Math.min(3, currentScale + 0.15))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="tiny-action"
            onClick={() => setHdMode((current) => !current)}
            aria-label="Toggle HD mode"
            title="Toggle HD mode"
          >
            HD
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
