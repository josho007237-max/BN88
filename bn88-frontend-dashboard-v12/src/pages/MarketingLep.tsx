// src/pages/MarketingLep.tsx
import React, { useState } from "react";

type LepHealthResponse = {
  ok: boolean;
  target: string;
  lepBaseUrl: string;
  status: number;
  lepResponse: unknown;
};

export default function MarketingLep() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LepHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const handleCheckHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lep/health", {
        method: "GET",
        credentials: "include", // ส่ง cookie JWT ไปด้วย
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as LepHealthResponse;
      setResult(data);
      setCheckedAt(new Date().toLocaleString());
    } catch (err: any) {
      console.error("[MarketingLep] health error", err);
      setError(err?.message || "Unknown error");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 py-6">
      <h1 className="text-2xl font-semibold mb-4">LINE Engagement Platform (LEP)</h1>
      <p className="text-sm text-gray-400 mb-6">
        หน้านี้ใช้ตรวจสอบว่า <span className="font-mono">BN88 Backend</span>{" "}
        สามารถคุยกับ <span className="font-mono">line-engagement-platform</span>{" "}
        ได้ปกติหรือไม่ ผ่าน API <code>/api/admin/lep/health</code>
      </p>

      <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-5 max-w-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-sm font-medium text-gray-300">LEP Health Check</div>
            <div className="text-xs text-gray-500">
              Base URL: <code>http://localhost:8080</code> (ตั้งค่าใน <code>.env</code> backend)
            </div>
          </div>

          <button
            onClick={handleCheckHealth}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-sm font-medium"
          >
            {loading ? "Checking..." : "Check LEP Health"}
          </button>
        </div>

        {result && (
          <div className="grid grid-cols-1 gap-3 text-sm text-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Status:</span>
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                  result.ok
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-amber-500/15 text-amber-100"
                }`}
              >
                {result.ok ? "Healthy" : `HTTP ${result.status}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Target:</span>
              <code className="text-xs bg-black/40 px-2 py-1 rounded border border-gray-800">
                {result.target}
              </code>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">LEP Base URL:</span>
              <code className="text-xs bg-black/40 px-2 py-1 rounded border border-gray-800">
                {result.lepBaseUrl}
              </code>
            </div>
          </div>
        )}
      </div>

      {checkedAt && (
        <div className="text-xs text-gray-500 mb-3">Last checked: {checkedAt}</div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          Error: {error}
        </div>
      )}

      {result && (
        <pre className="bg-black/60 border border-gray-800 rounded-md text-xs text-gray-100 p-3 overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {!result && !error && !loading && (
        <div className="text-xs text-gray-500">
          กดปุ่ม <strong>Check LEP Health</strong> เพื่อเริ่มทดสอบการเชื่อมต่อ
        </div>
      )}
    </div>
  );
}
