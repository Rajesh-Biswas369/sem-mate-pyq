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

const SUBJECTS = {
  "Digital Signal Processing": {
    price: 10,
    couponCode: "EARLY50",
    couponPrice: 5,
  },
};

app.get("/", (req, res) => {
  res.send("Razorpay backend running successfully");
});

app.post("/api/create-order", async (req, res) => {
  try {
    const { subjectName, couponCode } = req.body;

    console.log("Create order request:", {
      subjectName,
      couponCode,
    });

    const subject = SUBJECTS[subjectName];

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found in payment list.",
      });
    }

    let finalPrice = subject.price;

    if (
      couponCode &&
      couponCode.trim().toUpperCase() === subject.couponCode
    ) {
      finalPrice = subject.couponPrice;
    }

    const amountInPaise = finalPrice * 100;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        subjectName,
        couponCode: couponCode || "",
      },
    });

    console.log("✅ Razorpay order created:", order.id);

    return res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order,
      finalPrice,
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
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      console.log("✅ Payment verified:", razorpay_payment_id);

      return res.json({
        success: true,
        message: "Payment verified successfully.",
        subjectName,
      });
    }

    console.log("❌ Invalid payment signature.");

    return res.status(400).json({
      success: false,
      message: "Payment verification failed.",
    });
  } catch (error) {
    console.error("❌ Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Payment verification error.",
    });
  }
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Razorpay backend running at http://localhost:${PORT}`);
});