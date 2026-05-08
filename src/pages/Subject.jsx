import Footer from "../components/Footer";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { pyqData } from "../data/pyqData";
import { auth } from "../firebase";

const API_URL = "https://sem-mate-pyq.onrender.com";

// Your owner/admin Gmail IDs.
const ADMIN_EMAILS = ["maxjoy146@gmail.com"];

function Subject() {
  const { semesterName, subjectName } = useParams();
  const navigate = useNavigate();

  const decodedSemester = decodeURIComponent(semesterName);
  const decodedSubject = decodeURIComponent(subjectName);

  const semester = pyqData.find((item) => item.semester === decodedSemester);
  const subject = semester?.subjects.find((item) => item.name === decodedSubject);

  // 1. Add Firebase User State
  const [user, setUser] = useState(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [finalPrice, setFinalPrice] = useState(10);
  const [message, setMessage] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  // 2. Listen for Login State
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setIsAuthLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  // 3. Handle LocalStorage for Paid Subjects securely
  useEffect(() => {
    if (user) {
      const storageKey = `paid_${user.email}_${decodedSemester}_${decodedSubject}`
        .replace(/\s+/g, "_")
        .toLowerCase();
      
      const paidStatus = localStorage.getItem(storageKey);
      setIsUnlocked(paidStatus === "true");
    }
  }, [user, decodedSemester, decodedSubject]);

  if (!subject) {
    return (
      <div className="app electric-bg page-shell">
        <h1>Subject not found.</h1>
        <Link to="/" className="back">← Back Home</Link>
      </div>
    );
  }

  // Define Access Rules
  const isAdmin = user ? ADMIN_EMAILS.includes(user.email) : false;
  const isPaidSubject = subject.name === "Digital Signal Processing";
  const isGuest = !user; 

  // They have access to the PREMIUM subject if they bought it or are admin
  const hasPremiumAccess = isUnlocked || isAdmin;

  // --- Payment Logic ---
  function applyCoupon() {
    const typedCoupon = couponCode.trim().toUpperCase();
    const storageKey = `paid_${user?.email}_${decodedSemester}_${decodedSubject}`.replace(/\s+/g, "_").toLowerCase();

    if (typedCoupon === "SECBJUEE") {
      localStorage.setItem(storageKey, "true");
      setIsUnlocked(true);
      setFinalPrice(0);
      setMessage("Feedback access unlocked successfully. DSP PDFs are now free for you.");
    } else if (typedCoupon === "EARLY50") {
      setFinalPrice(5);
      setMessage("Coupon applied successfully. DSP access price is now ₹5.");
    } else if (typedCoupon === "") {
      setFinalPrice(10);
      setMessage("Enter a coupon code first.");
    } else {
      setFinalPrice(10);
      setMessage("Invalid coupon. Price remains ₹10.");
    }
  }

  async function handlePayment() {
    // ... (Keep your exact existing handlePayment logic here) ...
    // Just ensure it uses `user.email` and `user.displayName` instead of `auth.currentUser`
    try {
      if (!window.Razorpay) {
        setMessage("Razorpay script not loaded. Check index.html.");
        return;
      }

      setIsPaying(true);
      setMessage("Creating payment order...");

      const orderResponse = await fetch(`${API_URL}/api/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name, couponCode }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok || !orderData.success) {
        setMessage(orderData.message || "Could not create payment order.");
        setIsPaying(false);
        return;
      }

      const options = {
        key: orderData.key,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "JU EE PYQ Solutions",
        description: `${subject.name} Access`,
        order_id: orderData.order.id,

        handler: async function (response) {
          try {
            setMessage("Payment done. Verifying...");
            const verifyResponse = await fetch(`${API_URL}/api/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...response, subjectName: subject.name }),
            });

            const verifyData = await verifyResponse.json();

            if (verifyResponse.ok && verifyData.success) {
              const storageKey = `paid_${user?.email}_${decodedSemester}_${decodedSubject}`.replace(/\s+/g, "_").toLowerCase();
              localStorage.setItem(storageKey, "true");
              setIsUnlocked(true);
              setMessage("Payment successful. DSP PDFs unlocked.");
            } else {
              setMessage(verifyData.message || "Payment verification failed.");
            }
          } catch (verifyError) {
            setMessage(`Verification error: ${verifyError.message}`);
          } finally {
            setIsPaying(false);
          }
        },

        prefill: {
          name: user?.displayName || "Student",
          email: user?.email || "student@example.com",
          contact: "9999999999",
        },
        theme: { color: "#facc15" },
        modal: {
          ondismiss: function () {
            setIsPaying(false);
            setMessage("Payment popup closed.");
          },
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (error) {
      setMessage(`Payment error: ${error.message}`);
      setIsPaying(false);
    }
  }

  // Prevent UI flashing while checking Firebase login status
  if (!isAuthLoaded) return null;

  return (
    <div className="app electric-bg page-shell">
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <Link to={`/semester/${encodeURIComponent(decodedSemester)}`} className="back">
        ← Back
      </Link>

      <header className="topbar electric-title">
        <h1>{subject.name}</h1>
        <p>{subject.code}</p>
        <p>Choose a PYQ solution PDF</p>
      </header>

      {/* Guest Mode Warning Banner */}
      {isGuest && (
        <section className="payment-panel" style={{ border: '1px solid #ef4444', boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)' }}>
          <div className="payment-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>🔒</div>
          <h2 style={{ backgroundImage: 'linear-gradient(180deg, #fca5a5, #ef4444, #b91c1c)' }}>Login Required</h2>
          <p>You are currently browsing in Guest Mode.</p>
          <p className="payment-small" style={{ color: '#fca5a5' }}>Please log in to view and download these documents.</p>
          <button className="pay-button" onClick={() => navigate('/login')} style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: 'white' }}>
            Go to Login ⚡
          </button>
        </section>
      )}

      {/* Paid Subject Panel (Only shows if logged in AND hasn't paid) */}
      {!isGuest && isPaidSubject && !hasPremiumAccess && (
        <section className="payment-panel">
          <div className="payment-icon">⚡</div>
          <h2>Unlock DSP Access</h2>
          <p>Price: <strong>{finalPrice === 0 ? "Free" : `₹${finalPrice}`}</strong></p>
          <p className="payment-small">Have an access or discount code? Apply it below.</p>
          <div className="payment-row">
            <input
              type="text"
              placeholder="Enter coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />
            <button type="button" onClick={applyCoupon}>Apply</button>
          </div>
          {finalPrice > 0 && (
            <button type="button" className="pay-button" onClick={handlePayment} disabled={isPaying}>
              {isPaying ? "Processing..." : `Pay ₹${finalPrice} and Unlock`}
            </button>
          )}
          {message && <p className="payment-message">{message}</p>}
        </section>
      )}

      {/* Success Panel */}
      {!isGuest && isPaidSubject && hasPremiumAccess && (
        <section className="payment-success-panel">
          <p>{isAdmin ? "✅ Admin access granted. You can view all DSP PDFs." : "✅ DSP unlocked. You can now view all PDFs."}</p>
        </section>
      )}

      {/* The List of PDFs */}
      <section className="paper-list">
        {subject.papers.map((paper, index) => {
          // A paper is locked if the user is a guest OR if it's a paid subject they haven't bought
          const isPaperLocked = isGuest || (isPaidSubject && !hasPremiumAccess);

          return (
            <div className={`paper-card electric-card ${isPaperLocked ? "locked-paper" : ""}`} key={`${paper.title}-${index}`}>
              <div>
                <h3>{isPaperLocked && "🔒 "} {paper.title}</h3>
                <p>Year: {paper.year} | Type: {paper.type}</p>
              </div>

              {isPaperLocked ? (
                <span style={{ color: isGuest ? '#fca5a5' : '#fde68a' }}>
                  {isGuest ? "Login to View" : "Premium"}
                </span>
              ) : (
                <Link to={`/viewer/${encodeURIComponent(decodedSemester)}/${encodeURIComponent(decodedSubject)}/${index}`}>
                  Open Viewer →
                </Link>
              )}
            </div>
          );
        })}
      </section>

      <Footer />
    </div>
  );
}

export default Subject;