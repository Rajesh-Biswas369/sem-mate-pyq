import { useState, useEffect, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { pyqData } from "../data/pyqData";
import { auth } from "../firebase";
import Footer from "../components/Footer";

const ADMIN_EMAILS = ["maxjoy146@gmail.com", "kk9327721@gmail.com"];
const TRIAL_SECONDS = 120;
const FREE_COUPON = "TRKK";

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

function Subject() {
  const { semesterName, subjectName } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedSubFolder, setSelectedSubFolder] = useState(null);
  const [trialTime, setTrialTime] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");

  const decodedSem = decodeURIComponent(semesterName || "");
  const decodedSub = decodeURIComponent(subjectName || "");

  const subject = useMemo(() => {
    const semester = pyqData.find((item) => item.semester === decodedSem);
    return semester?.subjects.find((item) => item.name === decodedSub);
  }, [decodedSem, decodedSub]);

  const totalFiles = useMemo(() => countFiles(subject), [subject]);

  const makeKey = (prefix) => {
    if (!user?.email || !subject?.name) return "";
    return `${prefix}_${user.email}_${subject.name}`.replace(/\s+/g, "");
  };

  const trialKey = makeKey("trial");
  const paidKey = makeKey("paid");
  const trialStarted = Boolean(trialKey && localStorage.getItem(trialKey));

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSelectedFolder(null);
    setSelectedSubFolder(null);
    setCoupon("");
    setPaymentMessage("");
  }, [subject]);

  useEffect(() => {
    if (!user || !subject) {
      setIsPaid(false);
      setTrialTime(0);
      return;
    }

    const storedPaid = localStorage.getItem(paidKey) === "true";
    setIsPaid(storedPaid);

    if (!subject.hasTrial || !trialKey) {
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
  }, [user, subject, paidKey, trialKey]);

  useEffect(() => {
    if (trialTime <= 0) return undefined;

    const timer = setInterval(() => {
      setTrialTime((previousTime) => Math.max(previousTime - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [trialTime]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const startTrial = () => {
    if (!user || !subject || !trialKey) {
      setPaymentMessage("Please login first to start the trial.");
      return;
    }

    localStorage.setItem(trialKey, String(Date.now()));
    setTrialTime(TRIAL_SECONDS);
    setPaymentMessage("2-minute trial started. Premium files are temporarily unlocked.");
  };

  const handleApplyCoupon = () => {
    if (!user || !paidKey) {
      setPaymentMessage("Please login first to apply the coupon.");
      return;
    }

    if (coupon.trim().toUpperCase() === FREE_COUPON) {
      localStorage.setItem(paidKey, "true");
      setIsPaid(true);
      setPaymentMessage("Coupon applied successfully. Premium access unlocked.");
      return;
    }

    setPaymentMessage("Invalid coupon code.");
  };

  const handlePayment = () => {
    alert("Connect your Razorpay payment function here.");
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

  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  const hasAccess = Boolean(isPaid || isAdmin || trialTime > 0);
  const currentFileFolder = selectedSubFolder || selectedFolder;

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

      {subject.price && (
        <section className={`premium-control-panel ${hasAccess ? "access-active" : ""}`}>
          <div className="premium-copy">
            <span className="premium-badge">⚡ Premium Access</span>
            <h2>Timer and payment option</h2>
            <p>
              Study materials are open. Premium PYQs and solutions unlock by trial, payment,
              admin access, or promo code.
            </p>
          </div>

          <div className="premium-actions">
            <div className="timer-card">
              <span>⏳ Trial timer</span>
              <strong>{trialTime > 0 ? formatTime(trialTime) : "00:00"}</strong>
              <small>
                {trialTime > 0
                  ? "Premium files are open now"
                  : subject.hasTrial && !trialStarted
                  ? "2-minute trial available"
                  : "Trial ended or not available"}
              </small>
            </div>

            {!user ? (
              <button className="pay-btn" onClick={() => navigate("/login")}>
                Login to Continue ⚡
              </button>
            ) : hasAccess ? (
              <div className="access-chip">✅ Access Active</div>
            ) : (
              <>
                {subject.hasTrial && !trialStarted && (
                  <button className="pay-btn trial-btn" onClick={startTrial}>
                    Start 2-Min Free Trial
                  </button>
                )}

                <div className="coupon-row">
                  <input
                    placeholder="Enter promo code"
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value)}
                  />
                  <button onClick={handleApplyCoupon}>Apply</button>
                </div>

                <button className="pay-btn" onClick={handlePayment}>
                  Pay ₹{subject.price} Securely
                </button>
              </>
            )}

            {paymentMessage && <p className="payment-message">{paymentMessage}</p>}
          </div>
        </section>
      )}

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
                const locked = file.premium && !hasAccess;
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
                      <span className="locked-label">Unlock Required</span>
                    ) : (
                      <Link
                        to={viewerPath}
                        state={{ fileUrl: file.url, title: file.title, backTo }}
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
