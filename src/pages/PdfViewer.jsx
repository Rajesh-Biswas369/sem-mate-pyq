import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { pyqData } from "../data/pyqData";
import { auth, db } from "../firebase";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ADMIN_EMAILS = ["maxjoy146@gmail.com", "kk9327721@gmail.com", "tamajitray.5@gmail.com"];
const MANUAL_PAID_EMAILS = ["swapnenduop@gmail.com"];
const TRIAL_SECONDS = 300;
const DESKTOP_PAGE_RENDER_LIMIT = 18;
const THUMB_HEIGHT = 48;
const DEFAULT_DESKTOP_SCALE = 1.18;
const DEFAULT_MOBILE_SCALE = 1.04;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 4.5;
const MIN_DESKTOP_DPR = 3;
const MAX_DESKTOP_DPR = 4;
const MIN_MOBILE_DPR = 2.25;
const MAX_MOBILE_DPR = 3.2;
const MIN_PEN_SIZE = 0.18;
const MAX_PEN_SIZE = 1.6;
const DEFAULT_PEN_SIZE = 0.45;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://sem-mate-pyq.onrender.com").replace(/\/$/, "");
const IS_LOCAL_DEV =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const ANNOTATION_COLORS = [
  { name: "Yellow", value: "#facc15" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#a855f7" },
];

const PDF_READING_MODE_KEY = "semMatePdfReadingMode";
const READING_MODES = [
  { id: "normal", label: "Normal" },
  { id: "eye-care", label: "Eye Care" },
  { id: "dark", label: "Dark" },
];

function getInitialReadingMode() {
  if (typeof window === "undefined") return "normal";
  try {
    const storedMode = window.localStorage.getItem(PDF_READING_MODE_KEY);
    return READING_MODES.some((mode) => mode.id === storedMode) ? storedMode : "normal";
  } catch {
    return "normal";
  }
}

function getInitialScale() {
  if (typeof window === "undefined") return DEFAULT_DESKTOP_SCALE;
  return window.innerWidth <= 768 ? DEFAULT_MOBILE_SCALE : DEFAULT_DESKTOP_SCALE;
}

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

function cleanKeyPart(value = "") {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

function makePdfId(fileUrl = "") {
  let hash = 0;
  const input = normalizeFileUrl(fileUrl);

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return `${cleanKeyPart(input).slice(0, 70)}_${Math.abs(hash) || Date.now()}`;
}

function getFolderAccessType(folder) {
  if (!folder) return "pyq";
  if (folder.type === "materials") return "materials";
  if (folder.type === "solutions") return "solutions";
  return "pyq";
}

function inferAccessTypeFromUrl(fileUrl = "") {
  const normalizedUrl = normalizeFileUrl(fileUrl).toLowerCase();
  if (normalizedUrl.includes("/materials/")) return "materials";
  if (normalizedUrl.includes("/solutions/")) return "solutions";
  if (normalizedUrl.includes("/pyq/") || normalizedUrl.includes("/pyqs/")) return "pyq";
  return "total";
}

function getLegacyPaper(semesterName, subjectName, paperIndex) {
  if (!semesterName || !subjectName || paperIndex === undefined) return null;

  const decodedSemester = safeDecode(semesterName);
  const decodedSubject = safeDecode(subjectName);
  const semester = pyqData.find((item) => item.semester === decodedSemester);
  const subject = semester?.subjects?.find((item) => item.name === decodedSubject);

  return subject?.papers?.[Number(paperIndex)] || null;
}

function walkFolders(folders = [], fileUrl, inheritedAccessType = "pyq") {
  for (const folder of folders) {
    const currentAccessType = getFolderAccessType(folder) || inheritedAccessType;
    const foundFile = folder.files?.find((file) => normalizeFileUrl(file.url) === fileUrl);
    if (foundFile) return { file: foundFile, folder, accessType: currentAccessType };

    const nestedFile = walkFolders(folder.subFolders || [], fileUrl, currentAccessType);
    if (nestedFile) return nestedFile;
  }

  return null;
}

function findFileContext(fileUrl) {
  const normalizedUrl = normalizeFileUrl(fileUrl);

  for (const semester of pyqData) {
    for (const subject of semester.subjects || []) {
      const found = walkFolders(subject.folders || [], normalizedUrl);
      if (found) return { semester, subject, file: found.file, folder: found.folder, accessType: found.accessType };
    }
  }

  if (normalizedUrl.startsWith("/Sem4/SSM/")) {
    const semester = pyqData.find((item) => item.semester === "Semester 4");
    const subject = semester?.subjects?.find(
      (item) => item.name === "Sequential Systems & Microprocessor"
    );

    if (semester && subject) {
      return { semester, subject, file: null, accessType: inferAccessTypeFromUrl(normalizedUrl) };
    }
  }

  return null;
}

function makeAccessKey(prefix, email, subjectName, accessType = "total") {
  if (!email || !subjectName) return "";
  return `${prefix}_${cleanKeyPart(email)}_${cleanKeyPart(subjectName)}_${accessType}`;
}

function getStoredAccessGrant(email, subjectName, accessType) {
  const directGrantKey = makeAccessKey("accessGrant", email, subjectName, accessType);
  const totalGrantKey = makeAccessKey("accessGrant", email, subjectName, "total");

  return localStorage.getItem(directGrantKey) || localStorage.getItem(totalGrantKey) || "";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPointerPercent(event, element) {
  const rect = element.getBoundingClientRect();
  const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
  return { x, y };
}

function normaliseRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function getAnnotationStyle(annotation) {
  return {
    left: `${annotation.x}%`,
    top: `${annotation.y}%`,
    width: `${annotation.width}%`,
    height: `${annotation.height}%`,
  };
}

function PdfViewer() {
  const params = useParams();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [trialTimes, setTrialTimes] = useState({ total: 0, materials: 0, solutions: 0 });

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

  const pdfId = useMemo(() => makePdfId(fileUrl), [fileUrl]);
  const fileContext = useMemo(() => findFileContext(fileUrl), [fileUrl]);
  const subject = fileContext?.subject || null;
  const currentAccessType = location.state?.accessType || fileContext?.accessType || inferAccessTypeFromUrl(fileUrl);
  const subjectRequiresPayment = Boolean(
    location.state?.requiresPayment || subject?.accessPlans || subject?.price
  );

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
  const [scale, setScale] = useState(getInitialScale);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === "undefined" ? 900 : window.innerWidth
  );
  const [showDriveScroll, setShowDriveScroll] = useState(false);
  const [hdMode, setHdMode] = useState(true);
  const [readingMode, setReadingMode] = useState(getInitialReadingMode);
  const [protectedPdfUrl, setProtectedPdfUrl] = useState("");
  const [protectedPdfError, setProtectedPdfError] = useState("");

  const [viewerMode, setViewerMode] = useState("view");
  const [editTool, setEditTool] = useState("");
  const [toolDockOpen, setToolDockOpen] = useState(false);
  const [annotationColor, setAnnotationColor] = useState(ANNOTATION_COLORS[0].value);
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE);
  const [penMode, setPenMode] = useState("curve");
  const [annotations, setAnnotations] = useState([]);
  const [annotationMessage, setAnnotationMessage] = useState("");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState("");
  const [draftRect, setDraftRect] = useState(null);
  const [draftPath, setDraftPath] = useState(null);
  const [eraserPoint, setEraserPoint] = useState(null);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);

  const scrollContainerRef = useRef(null);
  const thumbRef = useRef(null);
  const pageRefs = useRef([]);
  const hideTimeoutRef = useRef(null);
  const scrollRafRef = useRef(null);
  const isDraggingRef = useRef(false);
  const driveScrollVisibleRef = useRef(false);
  const imageInputRef = useRef(null);
  const annotationsRef = useRef([]);
  const lastEraserPointRef = useRef(null);
  const twoFingerScrollRef = useRef(false);
  const lastTwoFingerYRef = useRef(0);

  const isMobile = viewportWidth <= 768;
  const shouldUseVirtualPages = isMobile || (numPages || 0) > DESKTOP_PAGE_RENDER_LIMIT;
  const pagesAroundCurrent = isMobile ? 1 : 3;

  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  const hasManualPaidAccess = Boolean(
    user?.email && MANUAL_PAID_EMAILS.includes(user.email.toLowerCase())
  );

  const annotationCollectionRef = useMemo(() => {
    if (!user?.uid || !pdfId || !db) return null;
    return collection(db, "users", user.uid, "pdfAnnotations", pdfId, "items");
  }, [user, pdfId]);

  const hasPaidDirect = (accessType) => {
    if (!subjectRequiresPayment) return false;
    if (!user) return false;
    if (isAdmin) return true;
    if (hasManualPaidAccess) return true;

    const paidKey = makeAccessKey("paid", user.email, subject?.name, accessType);
    if (!paidKey || localStorage.getItem(paidKey) !== "true") return false;

    const paymentKey = makeAccessKey("payment", user.email, subject?.name, accessType);
    const storedPayment = localStorage.getItem(paymentKey);
    if (!storedPayment) return true;

    try {
      const paymentData = JSON.parse(storedPayment);
      const savedCoupon = String(paymentData?.couponCode || "").trim().toUpperCase();
      const planAccessType = paymentData?.unlockedBy || accessType;
      const currentCoupon = String(subject?.accessPlans?.[planAccessType]?.coupon || "").trim().toUpperCase();

      if (paymentData?.mode === "coupon" && savedCoupon && currentCoupon && savedCoupon !== currentCoupon) {
        localStorage.removeItem(paidKey);
        localStorage.removeItem(paymentKey);
        return false;
      }
    } catch {
      return true;
    }

    return true;
  };

  const hasTrialDirect = (accessType) => {
    if (!subjectRequiresPayment) return true;
    if (!user) return false;
    if (isAdmin) return true;
    return trialTimes[accessType] > 0;
  };

  const hasDirectAccess = (accessType) => {
    if (!subjectRequiresPayment) return true;
    return Boolean(hasPaidDirect(accessType) || hasTrialDirect(accessType));
  };

  const hasAccess = (() => {
    if (!subjectRequiresPayment) return true;
    if (!user) return false;
    if (isAdmin) return true;

    // PYQ PDFs are free immediately after login.
    if (currentAccessType === "pyq") return true;

    // Full Subject Access unlocks Materials and Solutions too.
    if (hasDirectAccess("total")) return true;

    if (currentAccessType === "materials" || currentAccessType === "solutions") {
      return hasDirectAccess(currentAccessType);
    }

    return false;
  })();

  const canEdit = Boolean(
    user &&
      hasAccess &&
      (isAdmin ||
        hasPaidDirect("total") ||
        (currentAccessType !== "pyq" && hasPaidDirect(currentAccessType)))
  );
  const documentFile = protectedPdfUrl || (!subjectRequiresPayment && !user ? fileUrl : "");

  const goToPage = (nextPage) => {
    const safePage = clamp(nextPage, 1, numPages || 1);
    const target = pageRefs.current[safePage - 1];

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start", inline: "center" });
      setCurrentPage(safePage);
    }
  };

  const adjustZoom = (amount) => {
    const container = scrollContainerRef.current;
    const centerRatio = container
      ? (container.scrollLeft + container.clientWidth / 2) / Math.max(container.scrollWidth, 1)
      : 0.5;

    setScale((currentScale) => {
      const nextScale = clamp(Number((currentScale + amount).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
      window.setTimeout(() => {
        const nextContainer = scrollContainerRef.current;
        if (!nextContainer) return;
        nextContainer.scrollLeft = Math.max(
          0,
          nextContainer.scrollWidth * centerRatio - nextContainer.clientWidth / 2
        );
      }, 80);
      return nextScale;
    });
  };

  const setToolAndOpen = (tool) => {
    setViewerMode("edit");
    setEditTool((currentTool) => (currentTool === tool ? "" : tool));
    setToolDockOpen(true);
  };

  const eraserRadius = useMemo(() => {
    // Uses the same range as the pen-size slider, but a slightly wider
    // radius so it feels like a real rubber/eraser.
    return clamp(penSize * 2.2, 0.45, 4.2);
  }, [penSize]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    try {
      localStorage.setItem(PDF_READING_MODE_KEY, readingMode);
    } catch {
      // Reading mode still works for the current PDF if browser storage is unavailable.
    }
  }, [readingMode]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p")) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
    setScale(getInitialScale());
    setViewerMode("view");
    setSelectedAnnotationId("");
    setDraftRect(null);
    setDraftPath(null);
    pageRefs.current = [];

    const container = scrollContainerRef.current;
    if (container) container.scrollTop = 0;
  }, [fileUrl]);

  useEffect(() => {
    setProtectedPdfUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return "";
    });
    setProtectedPdfError("");
  }, [fileUrl, user?.uid]);

  useEffect(() => {
    if (!authReady || !hasAccess || !user || !fileUrl) return undefined;

    let cancelled = false;
    let objectUrl = "";

    const loadProtectedPdf = async () => {
      try {
        setProtectedPdfError("");
        const idToken = await user.getIdToken();
        const accessGrant = getStoredAccessGrant(user.email, subject?.name, currentAccessType);

        const response = await fetch(`${API_BASE_URL}/api/protected-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            fileUrl,
            subjectName: subject?.name || "",
            accessType: currentAccessType,
            email: user.email,
            uid: user.uid,
            accessGrant,
          }),
        });

        if (!response.ok) {
          let message = "Could not load protected PDF.";
          try {
            const errorData = await response.json();
            message = errorData.message || message;
          } catch {
            // The response may be an HTML error from the hosting provider.
          }
          throw new Error(message);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setProtectedPdfUrl(objectUrl);
      } catch (error) {
        if (!cancelled) {
          if (IS_LOCAL_DEV) {
            setProtectedPdfUrl(fileUrl);
            setProtectedPdfError("");
            return;
          }

          setProtectedPdfError(error.message || "Could not load protected PDF.");
        }
      }
    };

    loadProtectedPdf();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authReady, hasAccess, user, fileUrl, subject?.name, currentAccessType]);

  useEffect(() => {
    return () => {
      clearTimeout(hideTimeoutRef.current);
      cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user || !subject || !subjectRequiresPayment) {
      setTrialTimes({ total: 0, materials: 0, solutions: 0 });
      return;
    }

    const nextTrials = { total: 0, materials: 0, solutions: 0 };
    ["total", "materials", "solutions"].forEach((accessType) => {
      const trialKey = makeAccessKey("trial", user.email, subject.name, accessType);
      const storedStart = Number(localStorage.getItem(trialKey));
      if (storedStart) {
        const elapsed = Math.floor((Date.now() - storedStart) / 1000);
        nextTrials[accessType] = Math.max(TRIAL_SECONDS - elapsed, 0);
      }
    });

    setTrialTimes(nextTrials);
  }, [user, subject, subjectRequiresPayment]);

  useEffect(() => {
    const runningTrial = Object.values(trialTimes).some((seconds) => seconds > 0);
    if (!runningTrial) return undefined;

    const timer = setInterval(() => {
      setTrialTimes((previousTimes) => ({
        total: Math.max(previousTimes.total - 1, 0),
        materials: Math.max(previousTimes.materials - 1, 0),
        solutions: Math.max(previousTimes.solutions - 1, 0),
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [trialTimes]);

  useEffect(() => {
    if (!annotationCollectionRef || !user || !hasAccess) {
      setAnnotations([]);
      return undefined;
    }

    const q = query(annotationCollectionRef, orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setAnnotations(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (error) => {
        console.error("Annotation loading error:", error);
        setAnnotationMessage("Could not load saved annotations. Check Firestore rules.");
      }
    );

    return () => unsubscribe();
  }, [annotationCollectionRef, user, hasAccess]);

  const pageWidth = useMemo(() => {
    const sideGap = isMobile ? 10 : 44;
    const desktopReadableWidth = Math.min(Math.max(viewportWidth * 0.78, 980), 1180);
    const maxBaseWidth = isMobile ? viewportWidth - sideGap : desktopReadableWidth;
    return Math.max(330, Math.round(maxBaseWidth * scale));
  }, [isMobile, scale, viewportWidth]);

  const estimatedPageHeight = useMemo(() => {
    return Math.round(pageWidth * 1.414);
  }, [pageWidth]);

  const devicePixelRatio = useMemo(() => {
    if (typeof window === "undefined") return MIN_DESKTOP_DPR;

    const screenDpr = window.devicePixelRatio || 1;

    if (hdMode) {
      const zoomBoost = scale >= 2 ? 0.35 : 0;
      const baseDpr = isMobile
        ? Math.max(screenDpr, MIN_MOBILE_DPR)
        : Math.max(screenDpr, MIN_DESKTOP_DPR);

      return isMobile
        ? Math.min(baseDpr + zoomBoost, MAX_MOBILE_DPR)
        : Math.min(baseDpr + zoomBoost, MAX_DESKTOP_DPR);
    }

    return isMobile ? Math.min(Math.max(screenDpr, 1.35), 1.75) : Math.min(Math.max(screenDpr, 1.5), 2);
  }, [hdMode, isMobile, scale]);

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
    const thumbHeight = isMobile ? 46 : THUMB_HEIGHT;
    const maxThumbMove = Math.max(clientHeight - thumbHeight, 0);
    const nextY = Math.round(progress * maxThumbMove);

    thumb.style.top = "0px";
    thumb.style.transform = `translate3d(0, ${nextY}px, 0)`;
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
    const thumbHeight = isMobile ? 46 : THUMB_HEIGHT;
    const maxThumbMove = Math.max(container.clientHeight - thumbHeight, 1);

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
    if (!shouldUseVirtualPages) return true;

    if (pageNumber === 1 || pageNumber === numPages) return true;
    return Math.abs(pageNumber - currentPage) <= pagesAroundCurrent;
  };

  const isBreakPoint = (point) => Boolean(point?.break);

  const drawablePointCount = (points = []) =>
    points.filter((point) => !isBreakPoint(point) && Number.isFinite(point.x) && Number.isFinite(point.y)).length;

  const trimBreakPoints = (points = []) => {
    const cleaned = [];

    points.forEach((point) => {
      if (isBreakPoint(point)) {
        if (cleaned.length > 0 && !isBreakPoint(cleaned[cleaned.length - 1])) {
          cleaned.push({ break: true });
        }
        return;
      }

      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
        cleaned.push({ x: point.x, y: point.y });
      }
    });

    while (cleaned.length && isBreakPoint(cleaned[0])) cleaned.shift();
    while (cleaned.length && isBreakPoint(cleaned[cleaned.length - 1])) cleaned.pop();

    return cleaned;
  };

  const distanceBetweenPoints = (first, second) =>
    Math.hypot((first?.x || 0) - (second?.x || 0), (first?.y || 0) - (second?.y || 0));

  const circleIntersectsRect = (point, radius, annotation) => {
    const left = Number(annotation.x) || 0;
    const top = Number(annotation.y) || 0;
    const right = left + (Number(annotation.width) || 0);
    const bottom = top + (Number(annotation.height) || 0);

    const closestX = clamp(point.x, left, right);
    const closestY = clamp(point.y, top, bottom);

    return Math.hypot(point.x - closestX, point.y - closestY) <= radius;
  };

  const eraseDrawingPoints = (points = [], point, radius) => {
    let changed = false;
    const nextPoints = [];

    points.forEach((item) => {
      if (isBreakPoint(item)) {
        if (nextPoints.length > 0 && !isBreakPoint(nextPoints[nextPoints.length - 1])) {
          nextPoints.push({ break: true });
        }
        return;
      }

      if (!Number.isFinite(item?.x) || !Number.isFinite(item?.y)) return;

      const shouldErase = distanceBetweenPoints(item, point) <= radius;

      if (shouldErase) {
        changed = true;
        if (nextPoints.length > 0 && !isBreakPoint(nextPoints[nextPoints.length - 1])) {
          nextPoints.push({ break: true });
        }
        return;
      }

      nextPoints.push({ x: item.x, y: item.y });
    });

    return {
      changed,
      points: trimBreakPoints(nextPoints),
    };
  };

  const processEraserOperations = async (operations = []) => {
    await Promise.all(
      operations.map(async (operation) => {
        try {
          if (operation.type === "delete") {
            await deleteDoc(doc(annotationCollectionRef, operation.id));
          }

          if (operation.type === "update") {
            await updateDoc(doc(annotationCollectionRef, operation.id), {
              ...operation.changes,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (error) {
          console.error("Eraser operation error:", error);
          setAnnotationMessage("Could not fully erase annotation. Check Firestore rules.");
        }
      })
    );
  };

  const eraseAnnotationsAtPoint = (point, pageNumber) => {
    if (!annotationCollectionRef || !canEdit) return;

    const sourceAnnotations = annotationsRef.current || [];
    const operations = [];
    let changed = false;

    const nextAnnotations = sourceAnnotations.reduce((items, annotation) => {
      if (annotation.pageNumber !== pageNumber) {
        items.push(annotation);
        return items;
      }

      if (annotation.type === "drawing") {
        const erased = eraseDrawingPoints(annotation.points || [], point, eraserRadius);

        if (!erased.changed) {
          items.push(annotation);
          return items;
        }

        changed = true;

        if (drawablePointCount(erased.points) < 3) {
          operations.push({ type: "delete", id: annotation.id });
          return items;
        }

        const updatedAnnotation = { ...annotation, points: erased.points };
        operations.push({ type: "update", id: annotation.id, changes: { points: erased.points } });
        items.push(updatedAnnotation);
        return items;
      }

      if (["highlight", "text", "image"].includes(annotation.type)) {
        if (circleIntersectsRect(point, eraserRadius, annotation)) {
          changed = true;
          operations.push({ type: "delete", id: annotation.id });
          return items;
        }
      }

      items.push(annotation);
      return items;
    }, []);

    if (!changed) return;

    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
    setSelectedAnnotationId("");
    processEraserOperations(operations);
  };

  const saveAnnotation = async (payload) => {
    if (!annotationCollectionRef || !user || !canEdit) {
      setAnnotationMessage("Edit mode is available only after payment access.");
      return;
    }

    try {
      await addDoc(annotationCollectionRef, {
        ...payload,
        fileUrl,
        pdfId,
        userEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAnnotationMessage("");
    } catch (error) {
      console.error("Annotation save error:", error);
      setAnnotationMessage("Could not auto-save annotation. Check Firestore rules.");
    }
  };

  const deleteAnnotation = async (annotationId) => {
    if (!annotationCollectionRef || !annotationId || !canEdit) return;

    try {
      await deleteDoc(doc(annotationCollectionRef, annotationId));
      setSelectedAnnotationId("");
      setAnnotationMessage("");
    } catch (error) {
      console.error("Annotation delete error:", error);
      setAnnotationMessage("Could not delete annotation.");
    }
  };

  const updateAnnotation = async (annotationId, changes) => {
    if (!annotationCollectionRef || !annotationId || !canEdit) return;

    try {
      await updateDoc(doc(annotationCollectionRef, annotationId), {
        ...changes,
        updatedAt: serverTimestamp(),
      });
      setAnnotationMessage("");
    } catch (error) {
      console.error("Annotation update error:", error);
      setAnnotationMessage("Could not auto-save changes.");
    }
  };

  const clearAllAnnotations = async () => {
    if (!annotationCollectionRef || !canEdit) return;
    const confirmed = window.confirm("Clear all annotations for this PDF? This cannot be undone.");
    if (!confirmed) return;

    try {
      const snapshot = await getDocs(annotationCollectionRef);
      const batch = writeBatch(db);
      snapshot.forEach((item) => batch.delete(item.ref));
      await batch.commit();
      setSelectedAnnotationId("");
      setAnnotationMessage("");
    } catch (error) {
      console.error("Clear annotations error:", error);
      setAnnotationMessage("Could not clear annotations.");
    }
  };

  const handleImageFileChange = () => {
    setAnnotationMessage(
      "Image upload is disabled because Firebase Storage requires Blaze. Highlights, pen drawings, and text notes still auto-save in Firestore."
    );
  };

  const placeImageAnnotation = () => {
    setAnnotationMessage(
      "Image upload is disabled for now. Use Highlight, Pen, Text, or Eraser."
    );
  };

  const getStraightLineEndPoint = (start, current) => {
    const deltaX = Math.abs((current?.x || 0) - (start?.x || 0));
    const deltaY = Math.abs((current?.y || 0) - (start?.y || 0));

    // Straight line mode snaps automatically:
    // wider movement = horizontal line, taller movement = vertical line.
    if (deltaX >= deltaY) {
      return { x: current.x, y: start.y };
    }

    return { x: start.x, y: current.y };
  };

  const getAverageTouchY = (touches) => {
    if (!touches?.length) return 0;

    let total = 0;
    for (let index = 0; index < touches.length; index += 1) {
      total += touches[index].clientY;
    }

    return total / touches.length;
  };

  const cancelActiveAnnotationDrafts = () => {
    setDraftRect(null);
    setDraftPath(null);
    setEraserPoint(null);
    lastEraserPointRef.current = null;
  };

  const handleAnnotationTouchStart = (event) => {
    // Mobile edit mode: one finger annotates, two fingers scroll the PDF.
    if (!isMobile || !editTool || viewerMode !== "edit" || !canEdit) return;

    if (event.touches.length >= 2) {
      event.preventDefault();
      twoFingerScrollRef.current = true;
      lastTwoFingerYRef.current = getAverageTouchY(event.touches);
      cancelActiveAnnotationDrafts();
    }
  };

  const handleAnnotationTouchMove = (event) => {
    if (!isMobile || !twoFingerScrollRef.current) return;

    if (event.touches.length >= 2) {
      event.preventDefault();

      const nextY = getAverageTouchY(event.touches);
      const deltaY = lastTwoFingerYRef.current - nextY;
      lastTwoFingerYRef.current = nextY;

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += deltaY;
      }
    }
  };

  const handleAnnotationTouchEnd = (event) => {
    if (!isMobile) return;

    if (event.touches.length < 2) {
      twoFingerScrollRef.current = false;
      lastTwoFingerYRef.current = 0;
    }
  };

  const handleOverlayPointerDown = (event, pageNumber) => {
    if (!canEdit || viewerMode !== "edit" || !editTool || twoFingerScrollRef.current) return;
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    if (event.button !== 0) return;
    if (editTool !== "eraser" && event.target.closest(".annotation-item")) return;

    const overlay = event.currentTarget;
    const point = getPointerPercent(event, overlay);

    if (editTool === "eraser") {
      event.preventDefault();
      overlay.setPointerCapture?.(event.pointerId);
      lastEraserPointRef.current = point;
      setEraserPoint({ pageNumber, ...point });
      eraseAnnotationsAtPoint(point, pageNumber);
      return;
    }

    if (editTool === "image") {
      placeImageAnnotation(point, pageNumber);
      return;
    }

    if (editTool === "text") {
      const noteText = window.prompt("Write your note:");
      if (!noteText?.trim()) return;

      saveAnnotation({
        type: "text",
        pageNumber,
        x: clamp(point.x, 0, 86),
        y: clamp(point.y, 0, 94),
        width: 14,
        height: 6,
        color: annotationColor,
        text: noteText.trim(),
      });
      return;
    }

    if (editTool === "highlight") {
      event.preventDefault();
      overlay.setPointerCapture?.(event.pointerId);
      setDraftRect({ pageNumber, start: point, end: point, color: annotationColor });
      return;
    }

    if (editTool === "pen") {
      event.preventDefault();
      overlay.setPointerCapture?.(event.pointerId);
      setDraftPath({ pageNumber, points: [point], color: annotationColor, strokeWidth: penSize, penMode });
    }
  };

  const handleOverlayPointerMove = (event, pageNumber) => {
    if (twoFingerScrollRef.current) return;

    const overlay = event.currentTarget;
    const point = getPointerPercent(event, overlay);

    if (eraserPoint?.pageNumber === pageNumber) {
      const lastPoint = lastEraserPointRef.current;
      if (!lastPoint || distanceBetweenPoints(lastPoint, point) >= eraserRadius * 0.28) {
        lastEraserPointRef.current = point;
        eraseAnnotationsAtPoint(point, pageNumber);
      }
      setEraserPoint({ pageNumber, ...point });
      return;
    }

    if (draftRect?.pageNumber === pageNumber) {
      setDraftRect((previous) => ({ ...previous, end: point }));
      return;
    }

    if (draftPath?.pageNumber === pageNumber) {
      setDraftPath((previous) => {
        if (!previous?.points?.length) return previous;

        const startPoint = previous.points[0];

        if (previous.penMode === "line") {
          const snappedEnd = getStraightLineEndPoint(startPoint, point);
          return { ...previous, points: [startPoint, snappedEnd] };
        }

        const lastPoint = previous.points[previous.points.length - 1];
        const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        if (distance < 0.25) return previous;
        return { ...previous, points: [...previous.points, point] };
      });
    }
  };

  const handleOverlayPointerUp = (event, pageNumber) => {
    if (twoFingerScrollRef.current) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (eraserPoint?.pageNumber === pageNumber) {
      setEraserPoint(null);
      lastEraserPointRef.current = null;
      return;
    }

    if (draftRect?.pageNumber === pageNumber) {
      const rect = normaliseRect(draftRect.start, draftRect.end);
      if (rect.width > 0.8 && rect.height > 0.4) {
        saveAnnotation({
          type: "highlight",
          pageNumber,
          ...rect,
          color: draftRect.color,
          opacity: 0.34,
        });
      }
      setDraftRect(null);
    }

    if (draftPath?.pageNumber === pageNumber) {
      const minimumPoints = draftPath.penMode === "line" ? 2 : 3;

      if (draftPath.points.length >= minimumPoints) {
        saveAnnotation({
          type: "drawing",
          pageNumber,
          points: draftPath.points,
          color: draftPath.color,
          strokeWidth: draftPath.strokeWidth || penSize,
          penMode: draftPath.penMode || "curve",
        });
      }
      setDraftPath(null);
    }
  };

  const beginImageTransform = (event, annotation, mode = "move") => {
    if (!canEdit || viewerMode !== "edit") return;

    if (editTool === "eraser") return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedAnnotationId(annotation.id);

    const layer = event.currentTarget.closest(".annotation-layer");
    if (!layer) return;

    const layerRect = layer.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const original = {
      x: Number(annotation.x) || 0,
      y: Number(annotation.y) || 0,
      width: Number(annotation.width) || 24,
      height: Number(annotation.height) || 16,
    };
    let latest = original;

    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      const dx = ((moveEvent.clientX - startX) / layerRect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / layerRect.height) * 100;

      if (mode === "resize") {
        latest = {
          ...original,
          width: clamp(original.width + dx, 5, 92 - original.x),
          height: clamp(original.height + dy, 4, 92 - original.y),
        };
      } else {
        latest = {
          ...original,
          x: clamp(original.x + dx, 0, 100 - original.width),
          y: clamp(original.y + dy, 0, 100 - original.height),
        };
      }

      setAnnotations((previous) =>
        previous.map((item) => (item.id === annotation.id ? { ...item, ...latest } : item))
      );
    };

    const onUp = () => {
      updateAnnotation(annotation.id, latest);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
  };

  const handleAnnotationClick = (event, annotation) => {
    if (!canEdit || viewerMode !== "edit") return;

    // In eraser mode, do not use select/delete behaviour.
    // Let the event bubble to the page overlay so the circular rubber eraser works smoothly.
    if (editTool === "eraser") return;

    event.stopPropagation();
    setSelectedAnnotationId(annotation.id);
  };

  const renderAnnotation = (annotation) => {
    const selected = selectedAnnotationId === annotation.id;

    if (annotation.type === "highlight") {
      return (
        <div
          key={annotation.id}
          className={`annotation-item annotation-highlight ${selected ? "selected" : ""}`}
          style={{
            ...getAnnotationStyle(annotation),
            backgroundColor: annotation.color || "#facc15",
            opacity: annotation.opacity || 0.34,
          }}
          onPointerDown={(event) => handleAnnotationClick(event, annotation)}
          title="Highlight"
        />
      );
    }

    if (annotation.type === "drawing") {
      const segments = [];
      let activeSegment = [];

      (annotation.points || []).forEach((point) => {
        if (isBreakPoint(point)) {
          if (activeSegment.length > 1) segments.push(activeSegment);
          activeSegment = [];
          return;
        }

        if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
          activeSegment.push(point);
        }
      });

      if (activeSegment.length > 1) segments.push(activeSegment);

      return (
        <svg
          key={annotation.id}
          className={`annotation-draw-svg ${selected ? "selected" : ""}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label="Pen drawing annotation"
        >
          {segments.map((segment, segmentIndex) => (
            <polyline
              key={`${annotation.id}_segment_${segmentIndex}`}
              className="annotation-draw-line"
              points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={annotation.color || "#facc15"}
              strokeWidth={annotation.strokeWidth || 0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => handleAnnotationClick(event, annotation)}
            />
          ))}
        </svg>
      );
    }

    if (annotation.type === "text") {
      return (
        <div
          key={annotation.id}
          className={`annotation-item annotation-note ${selected ? "selected" : ""}`}
          style={{
            ...getAnnotationStyle(annotation),
            borderColor: annotation.color || "#facc15",
          }}
          onPointerDown={(event) => handleAnnotationClick(event, annotation)}
          title={annotation.text}
        >
          {annotation.text}
        </div>
      );
    }

    if (annotation.type === "image") {
      return (
        <div
          key={annotation.id}
          className={`annotation-item annotation-image-box ${selected ? "selected" : ""}`}
          style={getAnnotationStyle(annotation)}
          onPointerDown={(event) => beginImageTransform(event, annotation, "move")}
          title="Drag to move"
        >
          <img src={annotation.imageUrl} alt={annotation.imageName || "Annotation"} draggable="false" />
          {viewerMode === "edit" && canEdit && (
            <span
              className="annotation-resize-handle"
              onPointerDown={(event) => beginImageTransform(event, annotation, "resize")}
              title="Resize"
            />
          )}
        </div>
      );
    }

    return null;
  };

  const renderAnnotationLayer = (pageNumber) => {
    const pageAnnotations = annotations.filter((annotation) => annotation.pageNumber === pageNumber);
    const draftBox = draftRect?.pageNumber === pageNumber ? normaliseRect(draftRect.start, draftRect.end) : null;

    return (
      <div
        className={`annotation-layer ${
          viewerMode === "edit" && canEdit && editTool ? "editable tool-active" : "view-only"
        } ${editTool ? `tool-${editTool}` : "tool-none"}`}
        onPointerDown={(event) => handleOverlayPointerDown(event, pageNumber)}
        onPointerMove={(event) => handleOverlayPointerMove(event, pageNumber)}
        onPointerUp={(event) => handleOverlayPointerUp(event, pageNumber)}
        onPointerCancel={(event) => handleOverlayPointerUp(event, pageNumber)}
        onTouchStart={handleAnnotationTouchStart}
        onTouchMove={handleAnnotationTouchMove}
        onTouchEnd={handleAnnotationTouchEnd}
        onTouchCancel={handleAnnotationTouchEnd}
      >
        {pageAnnotations.map((annotation) => renderAnnotation(annotation))}

        {draftBox && (
          <div
            className="annotation-draft annotation-draft-highlight"
            style={{
              left: `${draftBox.x}%`,
              top: `${draftBox.y}%`,
              width: `${draftBox.width}%`,
              height: `${draftBox.height}%`,
              backgroundColor: draftRect.color,
            }}
          />
        )}

        {eraserPoint?.pageNumber === pageNumber && (
          <div
            className="eraser-brush-cursor"
            style={{
              left: `${eraserPoint.x - eraserRadius}%`,
              top: `${eraserPoint.y - eraserRadius}%`,
              width: `${eraserRadius * 2}%`,
              height: `${eraserRadius * 2}%`,
            }}
          />
        )}

        {draftPath?.pageNumber === pageNumber && (
          <svg className="annotation-draft-drawing" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={draftPath.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={draftPath.color}
              strokeWidth={draftPath.strokeWidth || penSize}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    );
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
              ? currentAccessType === "pyq"
                ? "Please login first. PYQ PDFs are free after login."
                : "Please login first. Trial, promo, payment, and document viewing are locked without login."
              : currentAccessType === "pyq"
              ? "Please login again to open this free PYQ document."
              : "Payment, promo, or an active 5-minute trial is required to view this document."}
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
      className={`app electric-bg page-shell pdf-viewer-shell drive-pdf-viewer pdf-reading-${readingMode}`}
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

        <div className="viewer-mode-toggle" aria-label="PDF mode">
          <button
            type="button"
            className={viewerMode === "view" ? "active" : ""}
            onClick={() => setViewerMode("view")}
          >
            View
          </button>
          <button
            type="button"
            className={viewerMode === "edit" ? "active" : ""}
            disabled={!canEdit}
            title={canEdit ? "Edit annotations" : "Edit mode is available only after paid access."}
            onClick={() => setViewerMode("edit")}
          >
            Edit
          </button>
        </div>

        <div className="reading-mode-toggle" aria-label="PDF reading mode">
          {READING_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={readingMode === mode.id ? "active" : ""}
              onClick={() => setReadingMode(mode.id)}
              title={`${mode.label} reading mode`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="zoom-controls">
          <button
            className="tiny-action"
            onClick={() => adjustZoom(-0.2)}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="zoom-text">{Math.round(scale * 100)}%</span>
          <button
            className="tiny-action"
            onClick={() => adjustZoom(0.2)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="tiny-action"
            onClick={() => setHdMode((current) => !current)}
            aria-label="Toggle HD mode"
            title={hdMode ? "Switch to faster rendering" : "Switch to ultra clear Full HD rendering"}
          >
            {hdMode ? "ULTRA" : "FAST"}
          </button>
        </div>
      </div>

      {viewerMode === "edit" && canEdit && (
        <div className="annotation-toolbar desktop-annotation-toolbar">
          <div className="annotation-tool-group">
            {[
              ["highlight", "Highlight"],
              ["pen", "Pen"],
              ["text", "Note"],
              ["eraser", "Eraser"],
            ].map(([tool, label]) => (
              <button
                key={tool}
                type="button"
                className={editTool === tool ? "active" : ""}
                onClick={() => setEditTool((currentTool) => (currentTool === tool ? "" : tool))}
              >
                {label}
              </button>
            ))}
          </div>

          {editTool === "pen" && (
            <div className="pen-mode-bubble" aria-label="Pen mode">
              <button
                type="button"
                className={penMode === "curve" ? "active" : ""}
                onClick={() => setPenMode("curve")}
                title="Free curved drawing"
              >
                <span className="pen-mode-icon curve-icon" aria-hidden="true"></span>
                Curve
              </button>
              <button
                type="button"
                className={penMode === "line" ? "active" : ""}
                onClick={() => setPenMode("line")}
                title="Straight horizontal or vertical line"
              >
                <span className="pen-mode-icon line-icon" aria-hidden="true"></span>
                Line
              </button>
            </div>
          )}

          {!editTool && (
            <span className="tool-hint-pill">Tap a tool to edit • tap again to deselect</span>
          )}

          <div className="annotation-color-row">
            {ANNOTATION_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={annotationColor === color.value ? "selected" : ""}
                style={{ "--swatch": color.value }}
                onClick={() => setAnnotationColor(color.value)}
                aria-label={color.name}
                title={color.name}
              />
            ))}
          </div>

          <label
            className={`pen-size-control ${editTool === "eraser" ? "eraser-size-control" : ""}`}
            title={editTool === "eraser" ? "Change eraser radius" : editTool === "pen" ? "Change pen thickness" : "Pen/Eraser size"}
          >
            <span>{editTool === "eraser" ? "Erase" : editTool === "pen" ? "Pen" : "Size"} {Math.round(penSize * 100)}%</span>
            <input
              type="range"
              min={MIN_PEN_SIZE}
              max={MAX_PEN_SIZE}
              step="0.02"
              value={penSize}
              onChange={(event) => setPenSize(Number(event.target.value))}
              aria-label={editTool === "eraser" ? "Eraser size" : "Pen size"}
            />
            <i
              aria-hidden="true"
              style={{
                width: `${Math.max(8, penSize * 18)}px`,
                height: `${Math.max(8, penSize * 18)}px`,
                backgroundColor: editTool === "eraser" ? "#f8fafc" : annotationColor,
              }}
            />
          </label>

          <span
            className="image-disabled-pill"
            title="Image upload needs Firebase Storage Blaze plan. Firestore-only annotations are active."
          >
            Image off
          </span>

          <button type="button" className="danger" onClick={clearAllAnnotations}>
            Clear All
          </button>

          <span className="autosave-pill">Auto-save ON</span>
        </div>
      )}

      {viewerMode === "edit" && !canEdit && (
        <div className="annotation-toolbar annotation-toolbar-locked">
          🔒 Edit mode is available only after paid access. View mode is still available.
        </div>
      )}

      {annotationMessage && (
        <div className="annotation-message">
          {annotationMessage}
        </div>
      )}

      {viewerMode === "edit" && canEdit && (
        <div className={`floating-edit-dock ${toolDockOpen ? "open" : ""}`}>
          <button
            type="button"
            className="dock-main-button"
            onClick={() => setToolDockOpen((current) => !current)}
            aria-label="Edit tools"
            title="Edit tools"
          >
            {editTool === "eraser" ? "\u232B" : editTool === "highlight" ? "H" : "\u270E"}
          </button>

          <div className="dock-radial-panel" aria-label="Floating edit controls">
            <button type="button" className={!editTool ? "active" : ""} onClick={() => setEditTool("")} title="Scroll mode">&#8597;</button>
            <button type="button" className={editTool === "highlight" ? "active" : ""} onClick={() => setToolAndOpen("highlight")} title="Highlighter">H</button>
            <button type="button" className={editTool === "pen" ? "active" : ""} onClick={() => setToolAndOpen("pen")} title="Pen">&#9998;</button>
            <button type="button" className={editTool === "eraser" ? "active" : ""} onClick={() => setToolAndOpen("eraser")} title="Eraser">&#9003;</button>
            <button type="button" className={editTool === "text" ? "active" : ""} onClick={() => setToolAndOpen("text")} title="Note">T</button>
            <button type="button" onClick={() => goToPage(currentPage - 1)} title="Previous page">&#8593;</button>
            <button type="button" onClick={() => goToPage(currentPage + 1)} title="Next page">&#8595;</button>
            <button type="button" onClick={() => adjustZoom(-0.2)} title="Zoom out">-</button>
            <button type="button" onClick={() => adjustZoom(0.2)} title="Zoom in">+</button>

            <div className="dock-pen-options">
              <button type="button" className={penMode === "curve" ? "active" : ""} onClick={() => setPenMode("curve")} title="Curve pen">~</button>
              <button type="button" className={penMode === "line" ? "active" : ""} onClick={() => setPenMode("line")} title="Straight line">/</button>
              <label className="dock-size-slider" title={editTool === "eraser" ? "Eraser size" : "Pen size"}>
                <input
                  type="range"
                  min={MIN_PEN_SIZE}
                  max={MAX_PEN_SIZE}
                  step="0.02"
                  value={penSize}
                  onChange={(event) => setPenSize(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="dock-color-wheel">
              {ANNOTATION_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={annotationColor === color.value ? "selected" : ""}
                  style={{ "--swatch": color.value }}
                  onClick={() => setAnnotationColor(color.value)}
                  aria-label={color.name}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <main
        className="pdf-stage pdf-scroll-area custom-hide-scrollbar drive-pdf-scroll-area"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {protectedPdfError ? (
          <div className="empty-box">
            <h2>Protected PDF blocked</h2>
            <p>{protectedPdfError}</p>
          </div>
        ) : !documentFile ? (
          <p className="pdf-status">Loading protected PDF...</p>
        ) : (
        <Document
          file={documentFile}
          onLoadSuccess={({ numPages: loadedPages }) => {
            setNumPages(loadedPages);
            pageRefs.current = new Array(loadedPages);
            requestAnimationFrame(updateDriveThumb);
          }}
          loading={<p className="pdf-status">Loading PDF perfectly...</p>}
          error={
            <div className="empty-box">
              <h2>Failed to load PDF</h2>
              <p>The protected PDF stream could not be opened.</p>
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
                  style={{ minHeight: estimatedPageHeight, width: pageWidth }}
                >
                  {renderThisPage ? (
                    <>
                      <Page
                        key={`${pageNumber}-${pageWidth}-${devicePixelRatio}-${hdMode ? "ultra" : "fast"}`}
                        className="crystal-pdf-page"
                        pageNumber={pageNumber}
                        width={pageWidth}
                        renderMode="canvas"
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        devicePixelRatio={devicePixelRatio}
                        loading={<div className="pdf-page-loading">Loading page {pageNumber}...</div>}
                      />
                      {renderAnnotationLayer(pageNumber)}
                    </>
                  ) : (
                    <div className="pdf-placeholder-content">Page {pageNumber}</div>
                  )}
                </div>
              );
            })}
        </Document>
        )}
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
