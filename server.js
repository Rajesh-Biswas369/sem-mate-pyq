import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.log("❌ Razorpay keys missing. Check your .env file.");
} else {
  console.log("✅ Razorpay keys loaded.");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const SEM4_THEORY_SUBJECTS = [
  "Electrical Instrumentation",
  "Electrical Machines-II",
  "Power Supply Systems",
  "Digital Signal Processing",
  "Sequential Systems & Microprocessor",
  "Field Theory",
];

const ACCESS_PLANS = {
  materials: {
    label: "Materials Access",
    price: 6,
  },
  solutions: {
    label: "Solutions Access",
    price: 6,
  },
  total: {
    label: "Full Subject Access",
    price: 10,
    oldPrice: 12,
  },
};

function cleanSubjectName(subjectName = "") {
  return String(subjectName).trim();
}

function cleanAccessType(accessType = "") {
  const cleaned = String(accessType || "").trim().toLowerCase();
  return ACCESS_PLANS[cleaned] ? cleaned : "";
}

app.get("/", (req, res) => {
  res.send("Razorpay backend running successfully");
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "SEM-MATE payment server is live." });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const subjectName = cleanSubjectName(req.body.subjectName);
    const accessType = cleanAccessType(req.body.accessType);
    const email = String(req.body.email || "").trim();

    if (!SEM4_THEORY_SUBJECTS.includes(subjectName)) {
      return res.status(404).json({
        success: false,
        message: "Subject not found in Semester 4 payment list.",
      });
    }

    if (!accessType) {
      return res.status(400).json({
        success: false,
        message: "Invalid access type. Use materials, solutions, or total.",
      });
    }

    const plan = ACCESS_PLANS[accessType];
    const amountInPaise = plan.price * 100;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `sem_mate_${accessType}_${Date.now()}`,
      notes: {
        subjectName,
        accessType,
        email,
      },
    });

    return res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order,
      subjectName,
      accessType,
      finalPrice: plan.price,
      oldPrice: plan.oldPrice || null,
      label: plan.label,
    });
  } catch (error) {
    console.error("❌ Create order error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Could not create Razorpay order.",
    });
  }
});

app.post("/api/verify-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      subjectName,
      accessType,
      email,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification data is missing.",
      });
    }

    const cleanedAccessType = cleanAccessType(accessType);
    if (!cleanedAccessType) {
      return res.status(400).json({
        success: false,
        message: "Invalid access type during verification.",
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.log("❌ Invalid payment signature.");
      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    console.log("✅ Payment verified:", {
      paymentId: razorpay_payment_id,
      subjectName,
      accessType: cleanedAccessType,
      email,
    });

    return res.json({
      success: true,
      message: "Payment verified successfully.",
      subjectName,
      accessType: cleanedAccessType,
      email,
      paymentId: razorpay_payment_id,
    });
  } catch (error) {
    console.error("❌ Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Payment verification error.",
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Razorpay backend running at http://localhost:${PORT}`);
});
