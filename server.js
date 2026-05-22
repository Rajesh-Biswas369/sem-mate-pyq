import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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

const ADMIN_EMAILS = ["maxjoy146@gmail.com", "kk9327721@gmail.com", "tamajitray.5@gmail.com"];
const MANUAL_PAID_EMAILS = ["swapnenduop@gmail.com"];
const TRIAL_SECONDS = 300;
const ACCESS_GRANT_SECRET =
  process.env.ACCESS_GRANT_SECRET || process.env.RAZORPAY_KEY_SECRET || "sem-mate-dev-access-secret";

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

const ACCESS_COUPONS = {
  default: {
    total: "SMRB10",
    materials: "PART12",
    solutions: "PYQSOLN",
  },
  "Electrical Machines-II": {
    total: "ENGG50",
    materials: "ENGG50",
    solutions: "ENGG50",
  },
};

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const rawServiceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
      : "");

  if (rawServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(rawServiceAccount)),
    });
    return;
  }

  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  });
}

initFirebaseAdmin();

function cleanSubjectName(subjectName = "") {
  return String(subjectName).trim();
}

function cleanAccessType(accessType = "") {
  const cleaned = String(accessType || "").trim().toLowerCase();
  return ACCESS_PLANS[cleaned] ? cleaned : "";
}

function getSubjectCoupon(subjectName, accessType) {
  return ACCESS_COUPONS[subjectName]?.[accessType] || ACCESS_COUPONS.default[accessType] || "";
}

function makeAccessGrant({ uid, email, subjectName, accessType, mode, expiresInSeconds }) {
  const payload = {
    v: 1,
    uid,
    email: String(email || "").toLowerCase(),
    subjectName,
    accessType,
    mode,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", ACCESS_GRANT_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyAccessGrant(accessGrant) {
  const [encodedPayload, signature] = String(accessGrant || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", ACCESS_GRANT_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  if (signature.length !== expectedSignature.length) return null;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

async function getVerifiedUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  return admin.auth().verifyIdToken(token);
}

function normalizePdfUrl(fileUrl = "") {
  const decoded = decodeURIComponent(String(fileUrl || "")).replace(/\\/g, "/");
  const normalized = decoded.startsWith("/") ? decoded : `/${decoded}`;
  if (!normalized.startsWith("/Sem4/") || !normalized.toLowerCase().endsWith(".pdf")) {
    return "";
  }
  if (normalized.includes("..")) return "";
  return normalized;
}

function getPdfContext(fileUrl = "") {
  const parts = normalizePdfUrl(fileUrl).split("/").filter(Boolean);
  const subjectFolder = parts[1] || "";
  const sectionFolder = String(parts[2] || "").toLowerCase();
  const subjectByFolder = {
    "Electrical Machines": "Electrical Machines-II",
    "Electrical-Instrumentation": "Electrical Instrumentation",
    PSS: "Power Supply Systems",
    SSM: "Sequential Systems & Microprocessor",
    "Field Theory": "Field Theory",
    "Digital-Signal-Processing": "Digital Signal Processing",
  };

  let accessType = "pyq";
  if (sectionFolder === "materials") accessType = "materials";
  if (sectionFolder === "solutions") accessType = "solutions";

  return {
    subjectName: subjectByFolder[subjectFolder] || subjectFolder,
    accessType,
  };
}

function accessTypeCovers(grantAccessType, requestedAccessType) {
  return grantAccessType === "total" || grantAccessType === requestedAccessType;
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

app.post("/api/access-grant", async (req, res) => {
  try {
    const verifiedUser = await getVerifiedUser(req);
    if (!verifiedUser?.email) {
      return res.status(401).json({ success: false, message: "Login required." });
    }

    const subjectName = cleanSubjectName(req.body.subjectName);
    const accessType = cleanAccessType(req.body.accessType);
    const mode = String(req.body.mode || "").trim().toLowerCase();
    const email = String(verifiedUser.email || "").toLowerCase();

    if (!SEM4_THEORY_SUBJECTS.includes(subjectName) || !accessType) {
      return res.status(400).json({ success: false, message: "Invalid subject or access type." });
    }

    if (ADMIN_EMAILS.includes(email) || MANUAL_PAID_EMAILS.includes(email)) {
      return res.json({
        success: true,
        accessGrant: makeAccessGrant({
          uid: verifiedUser.uid,
          email,
          subjectName,
          accessType: "total",
          mode: "admin",
          expiresInSeconds: 60 * 60 * 24 * 365,
        }),
      });
    }

    if (mode === "trial") {
      return res.json({
        success: true,
        accessGrant: makeAccessGrant({
          uid: verifiedUser.uid,
          email,
          subjectName,
          accessType,
          mode: "trial",
          expiresInSeconds: TRIAL_SECONDS,
        }),
      });
    }

    if (mode === "coupon") {
      const enteredCoupon = String(req.body.couponCode || "").trim().toUpperCase();
      const requiredCoupon = getSubjectCoupon(subjectName, accessType);

      if (!requiredCoupon || enteredCoupon !== requiredCoupon) {
        return res.status(403).json({ success: false, message: "Invalid promo code." });
      }

      return res.json({
        success: true,
        accessGrant: makeAccessGrant({
          uid: verifiedUser.uid,
          email,
          subjectName,
          accessType,
          mode: "coupon",
          expiresInSeconds: 60 * 60 * 24 * 365,
        }),
      });
    }

    return res.status(400).json({ success: false, message: "Invalid grant mode." });
  } catch (error) {
    console.error("Access grant error:", error);
    return res.status(401).json({ success: false, message: "Could not verify access." });
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
      accessGrant: makeAccessGrant({
        uid: String(req.body.uid || email || ""),
        email,
        subjectName,
        accessType: cleanedAccessType,
        mode: "razorpay",
        expiresInSeconds: 60 * 60 * 24 * 365,
      }),
    });
  } catch (error) {
    console.error("❌ Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Payment verification error.",
    });
  }
});

app.post("/api/protected-pdf", async (req, res) => {
  try {
    const verifiedUser = await getVerifiedUser(req);
    if (!verifiedUser?.email) {
      return res.status(401).json({ success: false, message: "Login required." });
    }

    const fileUrl = normalizePdfUrl(req.body.fileUrl);
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "Invalid PDF path." });
    }

    const context = getPdfContext(fileUrl);
    const email = String(verifiedUser.email || "").toLowerCase();
    const isPrivileged = ADMIN_EMAILS.includes(email) || MANUAL_PAID_EMAILS.includes(email);
    const grant = verifyAccessGrant(req.body.accessGrant);
    const grantMatches =
      grant &&
      grant.email === email &&
      (!grant.uid || grant.uid === verifiedUser.uid || grant.mode === "razorpay") &&
      grant.subjectName === context.subjectName &&
      accessTypeCovers(grant.accessType, context.accessType);

    if (!isPrivileged && context.accessType !== "pyq" && !grantMatches) {
      return res.status(403).json({ success: false, message: "PDF access denied." });
    }

    const absolutePath = path.resolve(PUBLIC_DIR, fileUrl.replace(/^\/+/, ""));
    if (!absolutePath.startsWith(PUBLIC_DIR) || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: "PDF not found." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="sem-mate-protected.pdf"');
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    console.error("Protected PDF error:", error);
    return res.status(401).json({ success: false, message: "Could not verify PDF access." });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Razorpay backend running at http://localhost:${PORT}`);
});
