import React, { useEffect, useMemo, useState, useRef } from "react";
import { api, type BotSecretsMasked, type BotSecretsPayload } from "@/lib/api";

type Props = {
  botId: string;
  onSaved?: () => void;
};

const mask = "********";

/** ฟอร์มจัดการ Secrets ของบอท (OpenAI + LINE) */
export default function BotSecretsForm({ botId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // state สำหรับปุ่มดู/ซ่อน
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showLineToken, setShowLineToken] = useState(false);
  const [showLineSecret, setShowLineSecret] = useState(false);

  // state ฟอร์มจริง
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [lineAccessToken, setLineAccessToken] = useState<string>("");
  const [lineChannelSecret, setLineChannelSecret] = useState<string>("");

  // จำค่าเริ่มต้น (เพื่อรู้ว่า field ไหนถูกแก้)
  const initRef = useRef<BotSecretsMasked | null>(null);

  // โหลดค่า masked จาก server
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const data = await api.getBotSecrets(botId);
        if (cancelled) return;

        initRef.current = data ?? {};

        setOpenaiApiKey(data?.openaiApiKey ? mask : "");
        setLineAccessToken(data?.lineAccessToken ? mask : "");
        setLineChannelSecret(data?.lineChannelSecret ? mask : "");
      } catch (e: any) {
        setMsg(e?.message || "โหลดข้อมูลล้มเหลว");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [botId]);

  const changedPayload: BotSecretsPayload = useMemo(() => {
    const p: BotSecretsPayload = {};

    // ถ้าค่าเปลี่ยนและไม่ใช่ mask -> ส่งไปอัปเดต
    if (openaiApiKey && openaiApiKey !== mask) {
      p.openaiApiKey = openaiApiKey.trim();
    }
    if (lineAccessToken && lineAccessToken !== mask) {
      p.lineAccessToken = lineAccessToken.trim();
    }
    if (lineChannelSecret && lineChannelSecret !== mask) {
      p.lineChannelSecret = lineChannelSecret.trim();
    }

    return p;
  }, [openaiApiKey, lineAccessToken, lineChannelSecret]);

  const somethingChanged = useMemo(
    () => Object.keys(changedPayload).length > 0,
    [changedPayload]
  );

  async function handleSave() {
    setMsg("");
    try {
      setSaving(true);
      if (!somethingChanged) {
        setMsg("ไม่มีการเปลี่ยนแปลง");
        return;
      }

      await api.updateBotSecrets(botId, changedPayload);
      setMsg("บันทึกสำเร็จ");

      // รีโหลดค่า masked ใหม่อีกรอบ
      const data = await api.getBotSecrets(botId);
      initRef.current = data ?? {};
      setOpenaiApiKey(data?.openaiApiKey ? mask : "");
      setLineAccessToken(data?.lineAccessToken ? mask : "");
      setLineChannelSecret(data?.lineChannelSecret ? mask : "");

      onSaved?.();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || e?.message || "บันทึกล้มเหลว");
    } finally {
      setSaving(false);
    }
  }

  async function handlePing() {
    setMsg("");
    try {
      setPinging(true);
      const r = await api.devLinePing(botId); // GET /dev/line-ping/:botId
      if (r?.ok && r?.status === 200) {
        setMsg("PING OK (status 200)");
      } else {
        setMsg(`PING FAIL (status ${r?.status ?? "?"})`);
      }
    } catch (e: any) {
      setMsg(e?.response?.data?.message || e?.message || "PING ล้มเหลว");
    } finally {
      setPinging(false);
    }
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="text-sm text-zinc-400">กำลังโหลด secrets…</div>
      ) : (
        <>
          {/* OpenAI API Key */}
          <div>
            <label
              htmlFor="openai-api-key"
              className="block text-sm font-medium text-gray-200"
            >
              OpenAI API Key
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="openai-api-key"
                name="openaiApiKey"
                type={showOpenAiKey ? "text" : "password"}
                className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowOpenAiKey((v) => !v)}
                className="rounded-md border border-gray-600 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-gray-700"
                aria-label={showOpenAiKey ? "ซ่อน OpenAI API Key" : "ดู OpenAI API Key"}
              >
                {showOpenAiKey ? "ซ่อน" : "ดู"}
              </button>
            </div>
          </div>

          {/* LINE Channel Access Token */}
          <div>
            <label
              htmlFor="line-channel-access-token"
              className="block text-sm font-medium text-gray-200"
            >
              LINE Channel Access Token
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="line-channel-access-token"
                name="lineAccessToken"
                type={showLineToken ? "text" : "password"}
                className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={lineAccessToken}
                onChange={(e) => setLineAccessToken(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowLineToken((v) => !v)}
                className="rounded-md border border-gray-600 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-gray-700"
                aria-label={
                  showLineToken
                    ? "ซ่อน LINE Channel Access Token"
                    : "ดู LINE Channel Access Token"
                }
              >
                {showLineToken ? "ซ่อน" : "ดู"}
              </button>
            </div>
          </div>

          {/* LINE Channel Secret */}
          <div>
            <label
              htmlFor="line-channel-secret"
              className="block text-sm font-medium text-gray-200"
            >
              LINE Channel Secret
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="line-channel-secret"
                name="lineChannelSecret"
                type={showLineSecret ? "text" : "password"}
                className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={lineChannelSecret}
                onChange={(e) => setLineChannelSecret(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowLineSecret((v) => !v)}
                className="rounded-md border border-gray-600 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-gray-700"
                aria-label={
                  showLineSecret
                    ? "ซ่อน LINE Channel Secret"
                    : "ดู LINE Channel Secret"
                }
              >
                {showLineSecret ? "ซ่อน" : "ดู"}
              </button>
            </div>
          </div>

          {/* ปุ่ม Save + Ping */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !somethingChanged}
              className={`px-4 py-2 rounded-xl text-sm ${
                saving || !somethingChanged
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              {saving ? "กำลังบันทึก…" : "Save changes"}
            </button>

            <button
              onClick={handlePing}
              disabled={pinging}
              className={`px-3 py-2 rounded-xl text-sm ${
                pinging
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-emerald-700 hover:bg-emerald-600 text-white"
              }`}
              title="ทดสอบเรียก /dev/line-ping/:botId (200 = token ใช้งานได้)"
            >
              {pinging ? "Pinging…" : "Ping token"}
            </button>

            {somethingChanged && (
              <span className="text-xs text-amber-400">
                มีการแก้ไข ยังไม่ได้บันทึก
              </span>
            )}
          </div>

          {!!msg && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                /ok|success|200/i.test(msg)
                  ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40"
                  : /fail|401|403|404|error/i.test(msg)
                  ? "bg-rose-900/40 text-rose-300 border border-rose-700/40"
                  : "bg-zinc-800 text-zinc-300 border border-zinc-700/50"
              }`}
            >
              {msg}
            </div>
          )}
        </>
      )}
    </div>
  );
}
