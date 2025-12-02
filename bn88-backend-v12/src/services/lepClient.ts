// src/services/lepClient.ts
import axios from "axios";

const lepBaseUrl = process.env.LEP_BASE_URL || "http://localhost:8080";

/**
 * เรียก /health จาก line-engagement-platform
 */
export async function getLepHealth() {
  const url = `${lepBaseUrl}/health`;

  const res = await axios.get(url, { timeout: 5000 });

  return {
    lepBaseUrl,
    status: res.status,
    data: res.data,
  };
}
