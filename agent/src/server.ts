import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { runPayoutCheck, PayoutCheckResult } from "./agent.js";
import { z } from "zod";

dotenv.config();

const app = express();
const PORT = 4020;

app.use(express.json());

app.use((req, res, next) => {
  if (!req.originalUrl.includes("/health")) {
    console.log(`[server] ${req.method} ${req.path}`);
  }
  next();
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const PayoutCheckRequestSchema = z.object({
  policyId: z.string(),
  threshold: z.number().positive(),
  readingId: z.string().optional(),
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "parametric-payout-agent" });
});

app.post("/api/payout-check", async (req: Request, res: Response) => {
  try {
    const validation = PayoutCheckRequestSchema.safeParse(req.body);

    if (!validation.success) {
      console.error("[server] Validation error:", validation.error.errors);
      res.status(400).json({
        error: "Invalid request",
        details: validation.error.errors,
      });
      return;
    }

    const { policyId, threshold, readingId } = validation.data;

    console.log(`[server] Payout check requested: policy=${policyId}, threshold=${threshold}`);

    const result = await runPayoutCheck(
      policyId,
      threshold,
      readingId || "FLOOD-2024-004"
    );

    console.log(
      `[server] Payout check complete. Recommendation: ${result.recommendation}`
    );

    res.json(result);
  } catch (error: any) {
    console.error("[server] Error during payout check:", error.message || error);
    res.status(500).json({
      error: "Failed to process payout check",
      message: error.message || "Unknown error",
    });
  }
});

app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] POST /api/payout-check {policyId, threshold, readingId?}`);
  console.log(`[server] GET /health`);
});
