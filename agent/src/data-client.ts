import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const DATA_PROVIDER_URL = process.env.DATA_PROVIDER_URL || "http://localhost:4021";
const DATA_PROVIDER_SECRET = process.env.DATA_PROVIDER_SECRET || "dev-secret-key";

interface ReadingResponse {
  reading: {
    id: string;
    timestamp: string;
    location: string;
    value: number;
    unit: string;
    description?: string;
  };
  payload: string;
  signature: string;
  signed_at: string;
}

function verifySignature(data: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", DATA_PROVIDER_SECRET)
    .update(data)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function fetchSignedReading(
  readingId: string
): Promise<{
  reading: {
    id: string;
    timestamp: string;
    location: string;
    value: number;
    unit: string;
  };
  dataSignatureValid: boolean;
  /** Hex HMAC-SHA256 signature the data provider computed over the reading payload. */
  dataSourceHash: string;
}> {
  console.log(`[data-client] Fetching reading: ${readingId}`);

  const initialRes = await fetch(`${DATA_PROVIDER_URL}/reading/${readingId}`);

  if (initialRes.status === 402) {
    const paymentInfo = (await initialRes.json()) as {
      payment_reference: string;
      price: number;
      currency: string;
    };
    console.log(
      `[data-client] HTTP 402 Payment Required received. Reference: ${paymentInfo.payment_reference}`
    );
    console.log(
      `[data-client] Price: ${paymentInfo.price} ${paymentInfo.currency}`
    );

    console.log(
      `[data-client] Simulating payment settlement for: ${paymentInfo.payment_reference}`
    );

    const paidRes = await fetch(`${DATA_PROVIDER_URL}/reading/${readingId}`, {
      headers: {
        "X-Payment": paymentInfo.payment_reference,
      },
    });

    if (!paidRes.ok) {
      throw new Error(`Failed to fetch signed reading: ${paidRes.status}`);
    }

    const data = (await paidRes.json()) as ReadingResponse;

    console.log(`[data-client] Received signed reading from data provider`);
    console.log(`[data-client] Signature: ${data.signature.slice(0, 16)}...`);

    const isValid = verifySignature(data.payload, data.signature);
    console.log(
      `[data-client] HMAC signature verification: ${isValid ? "PASS" : "FAIL"}`
    );

    if (!isValid) {
      throw new Error("Signature verification failed");
    }

    return {
      reading: data.reading,
      dataSignatureValid: true,
      dataSourceHash: data.signature,
    };
  }

  if (!initialRes.ok) {
    throw new Error(`Failed to fetch reading: ${initialRes.status}`);
  }

  throw new Error("Unexpected response from data provider");
}
