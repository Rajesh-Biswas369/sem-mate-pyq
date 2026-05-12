import { useState, useEffect, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { pyqData } from "../data/pyqData";
import { auth } from "../firebase";
import Footer from "../components/Footer";

const ADMIN_EMAILS = ["maxjoy146@gmail.com", "kk9327721@gmail.com","tamajitray.5@gmail.com"];
const TRIAL_SECONDS = 120;
const ACCESS_TYPES = ["total", "materials", "solutions"];
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://sem-mate-pyq.onrender.com").replace(/\/$/, "");

const DEFAULT_ACCESS_PLANS = {
  total: {
    label: "Full Subject Access",
    price: 10,
    oldPrice: 12,
    coupon: "TOTALFREE",
  },
  materials: {
    label: "Materials Access",
    price: 6,
    coupon: "PART12",
  },
  solutions: {
    label: "Solutions Access",
    price: 6,
    coupon: "PYQSOLN",
  },
};

function countFiles(folderOrSubject) {
  const directFiles = folderOrSubject?.files?.length || 0;
  const nestedFiles =
    folderOrSubject?.subFolders?.reduce(
      (total, subFolder) => total + countFiles(subFolder),
      0
    ) || 0;
  const subjectFiles =
    folderOrSubject?.folders?.reduce(
      (total, folder) => total + countFiles(folder),
      0
    ) || 0;

  return directFiles + nestedFiles + subjectFiles;
}

function loadRazorpayCheckout() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function cleanKeyPart(value = "") {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

function getFolderAccessType(folder) {
  if (!folder) return "pyq";
  if (folder.type === "materials") return "materials";
  if (folder.type === "solutions") return "solutions";
  return "pyq";
}

function Subject() {
  const { semesterName, subjectName } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedSubFolder, setSelectedSubFolder] = useState(null);
  const [trialTimes, setTrialTimes] = useState({ total: 0, materials: 0, solutions: 0 });
  const [paidAccess, setPaidAccess] = useState({ total: false, materials: false, solutions: false });
  const [couponValues, setCouponValues] = useState({ total: "", materials: "", solutions: "" });
  const [paymentMessages, setPaymentMessages] = useState({ total: "", materials: "", solutions: "" });
  const [paymentLoading, setPaymentLoading] = useState({ total: false, materials: false, solutions: false });

  const decodedSem = decodeURIComponent(semesterName || "");
  const decodedSub = decodeURIComponent(subjectName || "");

  const subject = useMemo(() => {
    const semester = pyqData.find((item) => item.semester === decodedSem);
    return semester?.subjects.find((item) => item.name === decodedSub);
  }, [decodedSem, decodedSub]);

  const totalFiles = useMemo(() => countFiles(subject), [subject]);
  const accessPlans = subject?.accessPlans || null;
  const supportsSectionAccess = Boolean(accessPlans);

  const makeKey = (prefix, accessType = "total") => {
    if (!user?.email || !subject?.name) return "";
    return `${prefix}_${cleanKeyPart(user.email)}_${cleanKeyPart(subject.name)}_${accessType}`;
  };

  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));

  const getPlan = (accessType) => accessPlans?.[accessType] || DEFAULT_ACCESS_PLANS[accessType];

  const getTrialStarted = (accessType) => {
    const key = makeKey("trial", accessType);
    return Boolean(key && localStorage.getItem(key));
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSelectedFolder(null);
    setSelectedSubFolder(null);
    setCouponValues({ total: "", materials: "", solutions: "" });
    setPaymentMessages({ total: "", materials: "", solutions: "" });
  }, [subject]);

  useEffect(() => {
    if (!user || !subject || !supportsSectionAccess) {
      setPaidAccess({ total: false, materials: false, solutions: false });
      setTrialTimes({ total: 0, materials: 0, solutions: 0 });
      return;
    }

    const nextPaid = { total: false, materials: false, solutions: false };
    const nextTrials = { total: 0, materials: 0, solutions: 0 };

    ACCESS_TYPES.forEach((accessType) => {
      const paidKey = makeKey("paid", accessType);
      const trialKey = makeKey("trial", accessType);

      nextPaid[accessType] = Boolean(paidKey && localStorage.getItem(paidKey) === "true");

      const storedStart = Number(localStorage.getItem(trialKey));
      if (storedStart) {
        const elapsed = Math.floor((Date.now() - storedStart) / 1000);
        nextTrials[accessType] = Math.max(TRIAL_SECONDS - elapsed, 0);
      }
    });

    setPaidAccess(nextPaid);
    setTrialTimes(nextTrials);
  }, [user, subject, supportsSectionAccess]);

  useEffect(() => {
    const hasRunningTrial = ACCESS_TYPES.some((accessType) => trialTimes[accessType] > 0);
    if (!hasRunningTrial) return undefined;

    const timer = setInterval(() => {
      setTrialTimes((previousTimes) => ({
        total: Math.max(previousTimes.total - 1, 0),
        materials: Math.max(previousTimes.materials - 1, 0),
        solutions: Math.max(previousTimes.solutions - 1, 0),
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [trialTimes]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const hasDirectAccess = (accessType) => {
    if (!supportsSectionAccess) return true;
    return Boolean(isAdmin || paidAccess[accessType] || trialTimes[accessType] > 0);
  };

  const hasSectionAccess = (accessType) => {
    if (!supportsSectionAccess) return true;

    // PYQ documents are not free now.
    // They open only when the user has Full Subject Access
    // through total trial, total promo, total payment, or admin access.
    if (accessType === "pyq") return hasDirectAccess("total");

    if (accessType === "materials" || accessType === "solutions") {
      return Boolean(hasDirectAccess("total") || hasDirectAccess(accessType));
    }

    return hasDirectAccess("total");
  };

  const setMessage = (accessType, message) => {
    setPaymentMessages((previous) => ({ ...previous, [accessType]: message }));
  };

  const setLoading = (accessType, value) => {
    setPaymentLoading((previous) => ({ ...previous, [accessType]: value }));
  };

  const startTrial = (accessType) => {
    if (!user || !subject) {
      setMessage(accessType, "Please login first to start the trial.");
      return;
    }

    const trialKey = makeKey("trial", accessType);
    if (!trialKey) return;

    if (getTrialStarted(accessType)) {
      setMessage(accessType, "Your 2-minute trial has already been used for this section.");
      return;
    }

    localStorage.setItem(trialKey, String(Date.now()));
    setTrialTimes((previous) => ({ ...previous, [accessType]: TRIAL_SECONDS }));
    setMessage(accessType, `${getPlan(accessType).label} trial started for 2 minutes.`);
  };

  const markPaidAfterSuccessfulPayment = (accessType, paymentData = {}) => {
    if (!user || !subject) return;

    const paidKey = makeKey("paid", accessType);
    const paymentKey = makeKey("payment", accessType);

    localStorage.setItem(paidKey, "true");
    localStorage.setItem(
      paymentKey,
      JSON.stringify({
        ...paymentData,
        accessType,
        subjectName: subject?.name,
        email: user.email,
        paidAt: new Date().toISOString(),
      })
    );

    setPaidAccess((previous) => ({ ...previous, [accessType]: true }));
    setMessage(accessType, `${getPlan(accessType).label} unlocked successfully.`);
  };

  const handleApplyCoupon = (accessType) => {
    if (!user) {
      setMessage(accessType, "Please login first to apply a promo code.");
      return;
    }

    const enteredCoupon = (couponValues[accessType] || "").trim().toUpperCase();
    const requiredCoupon = getPlan(accessType).coupon;

    if (enteredCoupon === requiredCoupon) {
      markPaidAfterSuccessfulPayment(accessType, { couponCode: requiredCoupon, mode: "coupon" });
      return;
    }

    setMessage(accessType, "Invalid promo code for this section.");
  };

  const handlePayment = async (accessType) => {
    if (!user) {
      setMessage(accessType, "Please login first before payment.");
      navigate("/login");
      return;
    }

    if (!subject?.name || !getPlan(accessType)?.price) {
      setMessage(accessType, "Payment is not configured for this section.");
      return;
    }

    try {
      setLoading(accessType, true);
      setMessage(accessType, "Preparing secure payment...");

      const scriptLoaded = await loadRazorpayCheckout();
      if (!scriptLoaded) {
        setMessage(accessType, "Could not load Razorpay. Check your internet connection.");
        return;
      }

      const orderResponse = await fetch(`${API_BASE_URL}/api/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectName: subject.name,
          accessType,
          email: user.email,
        }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok || !orderData.success) {
        throw new Error(orderData.message || "Could not create payment order.");
      }

      const options = {
        key: orderData.key,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "SEM-MATE",
        description: `${subject.name} - ${getPlan(accessType).label}`,
        order_id: orderData.order.id,
        prefill: {
          name: user.displayName || "Student",
          email: user.email || "",
        },
        notes: {
          subjectName: subject.name,
          accessType,
          email: user.email || "",
        },
        theme: {
          color: "#facc15",
        },
        modal: {
          ondismiss: () => {
            setLoading(accessType, false);
            setMessage(accessType, "Payment window closed. This section is still locked.");
          },
        },
        handler: async (response) => {
          try {
            setMessage(accessType, "Verifying payment...");

            const verifyResponse = await fetch(`${API_BASE_URL}/api/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...response,
                subjectName: subject.name,
                accessType,
                email: user.email,
              }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(verifyData.message || "Payment verification failed.");
            }

            markPaidAfterSuccessfulPayment(accessType, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              mode: "razorpay",
            });
          } catch (error) {
            setMessage(accessType, error.message || "Payment verification failed.");
          } finally {
            setLoading(accessType, false);
          }
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      setMessage(
        accessType,
        error.message || `Payment could not be started. Check ${API_BASE_URL}/api/create-order.`
      );
    } finally {
      setLoading(accessType, false);
    }
  };

  const handleMainFolderOpen = (folder) => {
    setSelectedFolder(folder);
    setSelectedSubFolder(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubFolderOpen = (subFolder) => {
    setSelectedSubFolder(subFolder);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (selectedSubFolder) {
      setSelectedSubFolder(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (selectedFolder) {
      setSelectedFolder(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    navigate(-1);
  };

  const renderAccessPanel = (accessType, options = {}) => {
    if (!supportsSectionAccess) return null;

    const plan = getPlan(accessType);
    const active = hasSectionAccess(accessType);
    const directActive = hasDirectAccess(accessType);
    const trialStarted = getTrialStarted(accessType);
    const title = options.title || plan.label;
    const description = options.description || "Unlock this section with payment, trial, or promo code.";

    return (
      <section className={`premium-control-panel section-access-panel ${active ? "access-active" : ""}`}>
        <div className="premium-copy">
          <span className="premium-badge">⚡ {plan.label}</span>
          <h2>{title}</h2>
          <p>{description}</p>
          <div className="price-line">
            {plan.oldPrice && <span className="old-price">₹{plan.oldPrice}</span>}
            <strong>₹{plan.price}</strong>
          </div>
        </div>

        <div className="premium-actions">
          <div className="timer-card">
            <span>⏳ 2-minute trial</span>
            <strong>{trialTimes[accessType] > 0 ? formatTime(trialTimes[accessType]) : "00:00"}</strong>
            <small>
              {trialTimes[accessType] > 0
                ? `${plan.label} trial is running.`
                : !user
                ? "Login required to start trial."
                : !trialStarted
                ? "Trial available for this section."
                : "Trial already used for this section."}
            </small>
          </div>

          {!user ? (
            <button className="pay-btn" onClick={() => navigate("/login")}>
              Login to Continue ⚡
            </button>
          ) : directActive ? (
            <div className="access-chip">✅ {plan.label} Active</div>
          ) : (
            <>
              {!trialStarted && (
                <button className="pay-btn trial-btn" onClick={() => startTrial(accessType)}>
                  Start 2-Min Trial
                </button>
              )}

              <div className="coupon-row">
                <input
                  placeholder="Enter promo code"
                  value={couponValues[accessType] || ""}
                  onChange={(event) =>
                    setCouponValues((previous) => ({ ...previous, [accessType]: event.target.value }))
                  }
                />
                <button type="button" onClick={() => handleApplyCoupon(accessType)}>
                  Apply
                </button>
              </div>

              <button className="pay-btn" onClick={() => handlePayment(accessType)} disabled={paymentLoading[accessType]}>
                {paymentLoading[accessType] ? "Processing..." : `Pay ₹${plan.price} Securely`}
              </button>
            </>
          )}

          {paymentMessages[accessType] && <p className="payment-message">{paymentMessages[accessType]}</p>}
        </div>
      </section>
    );
  };

  if (!subject) {
    return (
      <div className="app electric-bg subject-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          ← Back
        </button>
        <section className="empty-box">
          <h2>Subject Not Found</h2>
          <p>Please check the subject name in your URL.</p>
        </section>
      </div>
    );
  }

  const currentFileFolder = selectedSubFolder || selectedFolder;
  const currentAccessType = selectedSubFolder ? "materials" : getFolderAccessType(selectedFolder);
  const isDocumentLocked = (accessType) => {
    // Folders remain open, but every PDF document is locked
    // unless its required trial/payment/promo access is active.
    return !hasSectionAccess(accessType);
  };

  return (
    <div className="app electric-bg subject-page">
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <header className="subject-hero glass-panel">
        <button onClick={handleBack} className="back-btn">
          ← Back
        </button>

        <p className="subject-kicker">{decodedSem}</p>
        <h1>{subject.name}</h1>
        <h3>{subject.code}</h3>
        <p>
          {subject.folders?.length || 0} folders • {totalFiles} files available
        </p>
      </header>

      {!selectedFolder &&
        renderAccessPanel("total", {
          title: "Complete Subject Pack",
          description:
            "Unlock all PDF documents in this subject: Materials, PYQs, and Solutions. Login is needed only when starting trial, applying promo, or making payment.",
        })}

      {!selectedFolder && (
        <>
          <h2 className="section-title">📁 Select Folder</h2>

          <div className="folder-grid">
            {subject.folders?.map((folder) => (
              <button
                type="button"
                key={folder.folderName}
                className="folder-card"
                onClick={() => handleMainFolderOpen(folder)}
              >
                <span className="folder-icon">{folder.icon}</span>
                <div>
                  <h2>{folder.folderName}</h2>
                  <p>{countFiles(folder)} files available</p>
                  <strong>Open Folder →</strong>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {selectedFolder?.type === "pyq" &&
        renderAccessPanel("total", {
          title: "Unlock PYQ Documents",
          description:
            "PYQ PDFs are locked too. Open them using Full Subject Access through the 2-minute total trial, TOTALFREE promo, or payment.",
        })}

      {selectedFolder?.type === "materials" &&
        renderAccessPanel("materials", {
          title: "Materials Pack",
          description:
            "Unlock Part-I and Part-II materials only. Total access also unlocks this section.",
        })}

      {selectedFolder?.type === "solutions" &&
        renderAccessPanel("solutions", {
          title: "Solutions Pack",
          description:
            "Unlock solution PDFs only. Total access also unlocks this section.",
        })}

      {selectedFolder?.subFolders && !selectedSubFolder && (
        <section className="file-view">
          <button className="folder-back-btn" onClick={() => setSelectedFolder(null)}>
            ← Back to main folders
          </button>

          <h2 className="section-title">
            {selectedFolder.icon} {selectedFolder.folderName}
          </h2>

          <div className="folder-grid subfolder-grid">
            {selectedFolder.subFolders.map((subFolder) => (
              <button
                type="button"
                key={subFolder.folderName}
                className="folder-card"
                onClick={() => handleSubFolderOpen(subFolder)}
              >
                <span className="folder-icon">{subFolder.icon}</span>
                <div>
                  <h2>{subFolder.folderName}</h2>
                  <p>{countFiles(subFolder)} files available</p>
                  <strong>Open Folder →</strong>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {currentFileFolder?.files && (
        <section className="file-view">
          <button className="folder-back-btn" onClick={handleBack}>
            ← Back
          </button>

          <h2 className="section-title">
            {currentFileFolder.icon} {currentFileFolder.folderName}
          </h2>

          {currentFileFolder.files.length === 0 ? (
            <div className="empty-box">
              <h3>No files uploaded yet</h3>
              <p>Add PDFs inside this folder in pyqData.js.</p>
            </div>
          ) : (
            <div className="file-list">
              {currentFileFolder.files.map((file, index) => {
                const locked = isDocumentLocked(currentAccessType);
                const viewerPath = `/viewer${encodeURI(file.url)}`;
                const backTo = `/subject/${encodeURIComponent(decodedSem)}/${encodeURIComponent(decodedSub)}`;

                return (
                  <div
                    key={`${file.title}-${index}`}
                    className={`file-card ${locked ? "locked" : ""}`}
                  >
                    <div className="file-info">
                      <h3>{locked ? "🔒" : "📄"} {file.title}</h3>
                      <p>
                        {file.year} | {file.topic || currentFileFolder.folderName}
                      </p>
                    </div>

                    {locked ? (
                      <span className="locked-label">
                        {!user ? "Login for Trial/Payment" : "Unlock Required"}
                      </span>
                    ) : (
                      <Link
                        to={viewerPath}
                        state={{
                          fileUrl: file.url,
                          title: file.title,
                          backTo,
                          semesterName: decodedSem,
                          subjectName: decodedSub,
                          accessType: currentAccessType,
                          requiresPayment: supportsSectionAccess,
                        }}
                        className="open-btn"
                      >
                        View →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <Footer />
    </div>
  );
}

export default Subject;
