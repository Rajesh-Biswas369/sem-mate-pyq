import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { pyqData } from "../data/pyqData";

const API_URL = "https://sem-mate-pyq.onrender.com";

function Subject() {
  const { semesterName, subjectName } = useParams();

  const decodedSemester = decodeURIComponent(semesterName);
  const decodedSubject = decodeURIComponent(subjectName);

  const semester = pyqData.find((item) => item.semester === decodedSemester);
  const subject = semester?.subjects.find((item) => item.name === decodedSubject);

  const storageKey = `paid_${decodedSemester}_${decodedSubject}`;

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [finalPrice, setFinalPrice] = useState(10);
  const [message, setMessage] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    const paidStatus = localStorage.getItem(storageKey);

    if (paidStatus === "true") {
      setIsUnlocked(true);
    }
  }, [storageKey]);

  if (!subject) {
    return (
      <div className="app electric-bg page-shell">
        <h1>Subject not found.</h1>
        <Link to="/" className="back">
          ← Back Home
        </Link>
      </div>
    );
  }

  const isPaidSubject = subject.name === "Digital Signal Processing";

  function applyCoupon() {
    const typedCoupon = couponCode.trim().toUpperCase();

    if (typedCoupon === "EARLY50") {
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
    try {
      if (!window.Razorpay) {
        setMessage("Razorpay script not loaded. Check index.html.");
        return;
      }

      setIsPaying(true);
      setMessage("Creating payment order...");

      const orderResponse = await fetch(`${API_URL}/api/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectName: subject.name,
          couponCode,
        }),
      });

      const orderData = await orderResponse.json();

      console.log("Order data:", orderData);

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
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...response,
                subjectName: subject.name,
              }),
            });

            const verifyData = await verifyResponse.json();

            console.log("Verify data:", verifyData);

            if (verifyResponse.ok && verifyData.success) {
              localStorage.setItem(storageKey, "true");
              setIsUnlocked(true);
              setMessage("Payment successful. DSP PDFs unlocked.");
            } else {
              setMessage(verifyData.message || "Payment verification failed.");
            }
          } catch (verifyError) {
            console.error("Verify error:", verifyError);
            setMessage(`Verification error: ${verifyError.message}`);
          } finally {
            setIsPaying(false);
          }
        },

        prefill: {
          name: "Student",
          email: "student@example.com",
          contact: "9999999999",
        },

        theme: {
          color: "#facc15",
        },

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
      console.error("Payment error:", error);
      setMessage(`Payment error: ${error.message}`);
      setIsPaying(false);
    }
  }

  return (
    <div className="app electric-bg page-shell">
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <Link
        to={`/semester/${encodeURIComponent(decodedSemester)}`}
        className="back"
      >
        ← Back
      </Link>

      <header className="topbar electric-title">
        <h1>{subject.name}</h1>
        <p>{subject.code}</p>
        <p>Choose a PYQ solution PDF</p>
      </header>

      {isPaidSubject && !isUnlocked && (
        <section className="payment-panel">
          <div className="payment-icon">⚡</div>

          <h2>Unlock DSP Access</h2>

          <p>
            Price: <strong>₹{finalPrice}</strong>
          </p>

          <p className="payment-small">
            Use coupon <strong>EARLY50</strong> to unlock DSP at ₹5.
          </p>

          <div className="payment-row">
            <input
              type="text"
              placeholder="Enter coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />

            <button type="button" onClick={applyCoupon}>
              Apply
            </button>
          </div>

          <button
            type="button"
            className="pay-button"
            onClick={handlePayment}
            disabled={isPaying}
          >
            {isPaying ? "Processing..." : `Pay ₹${finalPrice} and Unlock`}
          </button>

          {message && <p className="payment-message">{message}</p>}
        </section>
      )}

      {isPaidSubject && isUnlocked && (
        <section className="payment-success-panel">
          <p>✅ DSP unlocked. You can now view all PDFs.</p>
        </section>
      )}

      <section className="paper-list">
        {subject.papers.map((paper, index) => {
          const locked = isPaidSubject && !isUnlocked;

          return (
            <div
              className={`paper-card electric-card ${
                locked ? "locked-paper" : ""
              }`}
              key={`${paper.title}-${index}`}
            >
              <div>
                <h3>
                  {locked && "🔒 "}
                  {paper.title}
                </h3>

                <p>
                  Year: {paper.year} | Type: {paper.type}
                </p>
              </div>

              {locked ? (
                <span>Locked</span>
              ) : (
                <Link
                  to={`/viewer/${encodeURIComponent(
                    decodedSemester
                  )}/${encodeURIComponent(decodedSubject)}/${index}`}
                >
                  Open Viewer →
                </Link>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default Subject;