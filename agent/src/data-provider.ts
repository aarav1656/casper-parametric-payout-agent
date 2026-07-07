import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readingsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "readings.json"), "utf-8")
);

const app = express();
app.use(express.json());

const DATA_PROVIDER_SECRET = process.env.DATA_PROVIDER_SECRET || "dev-secret-key";
const DATA_PROVIDER_PORT = 4021;
const PAYMENT_AMOUNT = 100; // in basis points or whatever unit

interface PaymentProof {
  reference: string;
  amount: number;
  timestamp: number;
}

const validPayments = new Set<string>();

function generateSignature(data: string): string {
  return crypto
    .createHmac("sha256", DATA_PROVIDER_SECRET)
    .update(data)
    .digest("hex");
}

function verifySignature(data: string, signature: string): boolean {
  const expected = generateSignature(data);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", provider: "flood-sensor-data" });
});

app.get("/reading/:readingId", (req, res) => {
  const { readingId } = req.params;
  const payment = req.headers["x-payment"] as string | undefined;

  const reading = readingsData.readings.find(
    (r: any) => r.id === readingId
  );

  if (!reading) {
    return res.status(404).json({ error: "Reading not found" });
  }

  if (!payment) {
    const paymentRef = `PAYMENT-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    validPayments.add(paymentRef);

    res.status(402).json({
      error: "Payment Required",
      price: PAYMENT_AMOUNT,
      currency: "basis_points",
      payment_reference: paymentRef,
      message: "Include X-Payment header with payment reference to retrieve signed data",
    });
    return;
  }

  if (!validPayments.has(payment)) {
    console.log(`[data-provider] Invalid payment reference: ${payment}`);
    return res.status(403).json({
      error: "Invalid or expired payment reference",
    });
  }

  const payload = JSON.stringify({
    id: reading.id,
    timestamp: reading.timestamp,
    location: reading.location,
    value: reading.value,
    unit: reading.unit,
  });

  const signature = generateSignature(payload);

  validPayments.delete(payment);

  res.json({
    reading: reading,
    payload: payload,
    signature: signature,
    signed_at: new Date().toISOString(),
  });
});

app.post("/verify", (req, res) => {
  const { payload, signature } = req.body;

  if (!payload || !signature) {
    return res.status(400).json({ error: "Missing payload or signature" });
  }

  try {
    const isValid = verifySignature(payload, signature);
    res.json({ valid: isValid });
  } catch (err) {
    res.status(400).json({ error: "Signature verification failed" });
  }
});

app.listen(DATA_PROVIDER_PORT, () => {
  console.log(
    `[data-provider] Listening on http://localhost:${DATA_PROVIDER_PORT}`
  );
  console.log(
    `[data-provider] Endpoint: GET /reading/:readingId (requires X-Payment header after 402 response)`
  );
});
