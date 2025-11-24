// src/pages/BotDetail.tsx
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import BotIntentsPanel from "../components/BotIntentsPanel";
import {
  getApiBase,
  getBot,
  getBotSecrets,
  updateBotSecrets,
  devLinePing,
  getBotConfig,
  updateBotConfig,
  type BotItem,
  type BotAiConfig,
} from "../lib/api";
import { connectEvents } from "../lib/events";

type SecretsForm = {
  openaiApiKey: string;
  lineAccessToken: string;
  lineChannelSecret: string;
};

const EMPTY: SecretsForm = {
  openaiApiKey: "",
  lineAccessToken: "",
  lineChannelSecret: "",
};

const TENANT = import.meta.env.VITE_TENANT ?? "bn9";

// โมเดลที่อนุญาต (กำหนดฝั่ง frontend เลย)
const ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
  "gpt-3.5-turbo",
];

export default function BotDetail() {
  const { botId = "" } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [bot, setBot] = useState<BotItem | null>(null);

  const [form, setForm] = useState<SecretsForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);

  // AI config / persona
  const [aiConfig, setAiConfig] = useState<BotAiConfig | null>(null);
  const [allowedModels, setAllowedModels] = useState<string[]>(ALLOWED_MODELS);
  const [savingAi, setSavingAi] = useState(false);

  const apiBase = getApiBase();

  const title = useMemo(() => bot?.name || "Bot", [bot]);

  // กำหนด Webhook URL ตาม platform
  const webhookUrl = useMemo(() => {
    if (!botId || !bot) return "";
    switch (bot.platform) {
      case "telegram":
        return `${apiBase}/webhooks/telegram?botId=${encodeURIComponent(
          botId
        )}`;
      case "facebook":
        return `${apiBase}/webhooks/facebook?botId=${encodeURIComponent(
          botId
        )}`;
      case "line":
      default:
        return `${apiBase}/webhooks/line?botId=${encodeURIComponent(botId)}`;
    }
  }, [apiBase, botId, bot]);

  const platformLabel = useMemo(() => {
    if (!bot) return "";
    if (bot.platform === "telegram") return "Telegram";
    if (bot.platform === "facebook") return "Facebook";
    return "LINE";
  }, [bot]);

  // เปลี่ยน label ช่อง secrets ตาม platform
  const accessTokenLabel = useMemo(() => {
    if (!bot) return "Channel Access Token";
    switch (bot.platform) {
      case "telegram":
        return "Telegram Bot Token";
      case "facebook":
        return "Facebook Page Access Token";
      case "line":
      default:
        return "LINE Channel Access Token";
    }
  }, [bot]);

  const secretLabel = useMemo(() => {
    if (!bot) return "Channel Secret";
    switch (bot.platform) {
      case "telegram":
        return "Telegram Secret (optional)";
      case "facebook":
        return "Facebook App Secret / Verify Token";
      case "line":
      default:
        return "LINE Channel Secret";
    }
  }, [bot]);

  const loadBot = useCallback(async () => {
    if (!botId) return;

    // ดึง bot, secrets (masked) และ AI config พร้อมกัน
    const [{ bot }, masked, cfgRes] = await Promise.all([
      getBot(botId),
      getBotSecrets(botId),
      getBotConfig(botId),
    ]);

    setBot(bot);
    setForm({
      openaiApiKey: masked?.openaiApiKey || "",
      lineAccessToken: masked?.lineAccessToken || "",
      lineChannelSecret: masked?.lineChannelSecret || "",
    });

    // เตรียม AI config
    const defaults: BotAiConfig = {
      botId: bot.id,
      model: cfgRes.allowedModels[0] || "gpt-4o-mini",
      systemPrompt: "",
      temperature: 0.3,
      topP: 1,
      maxTokens: 800,
    };

    setAllowedModels(
      Array.isArray(cfgRes.allowedModels) && cfgRes.allowedModels.length
        ? cfgRes.allowedModels
        : ALLOWED_MODELS
    );
    setAiConfig(cfgRes.config ?? defaults);
  }, [botId]);

  useEffect(() => {
    if (!botId) {
      nav("/bots");
      return;
    }

    let alive = true;
    (async () => {
      try {
        await loadBot();
      } catch (err) {
        console.error("loadBot error:", err);
        if (alive) {
          alert("โหลดข้อมูลบอทไม่สำเร็จ");
          nav("/bots");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [botId, nav, loadBot]);

  // ฟัง SSE เพื่อรีเฟรชสถานะทันทีเมื่อมีอีเวนต์ของบอทนี้
  useEffect(() => {
    if (!botId) return;

    const disconnect = connectEvents({
      tenant: TENANT,
      onHello: () => {},
      onPing: () => {},
      onCaseNew: (e: any) => {
        if (e?.botId === botId) loadBot();
      },
      onStatsUpdate: (e: any) => {
        if (e?.botId === botId) loadBot();
      },
    });

    return () => {
      try {
        disconnect && disconnect();
      } catch {
        // no-op
      }
    };
  }, [botId, loadBot]);

  function onChange<K extends keyof SecretsForm>(k: K, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSave() {
    if (!botId) return;
    try {
      setSaving(true);
      // ส่งเฉพาะช่องที่มีค่า (กันทับด้วยค่าว่าง/******)
      const payload: Partial<SecretsForm> = {};
      (Object.keys(form) as (keyof SecretsForm)[]).forEach((k) => {
        const val = (form[k] || "").trim();
        if (val) (payload as any)[k] = val;
      });

      const res = await updateBotSecrets(botId, payload);
      if (!res?.ok) throw new Error("save_failed");
      toast.success("บันทึก Secrets แล้ว");
      await loadBot(); // รีเฟรชค่า (รวม verifiedAt หากครบ)
    } catch (err) {
      console.error("onSave secrets error:", err);
      toast.error((err as any)?.message || "บันทึกไม่สำเร็จ ❌");
    } finally {
      setSaving(false);
    }
  }

  async function onPingLine() {
    if (!botId) return;
    // ปุ่มนี้ยังใช้เทสเฉพาะ LINE
    if (bot?.platform !== "line") {
      alert("ปุ่ม Test: LINE ping ใช้ได้เฉพาะบอท LINE");
      return;
    }
    try {
      setPinging(true);
      const r = await devLinePing(botId);
      alert(
        r.ok ? `PING OK (status ${r.status})` : `PING FAIL (status ${r.status})`
      );
    } catch (err) {
      console.error("devLinePing error:", err);
      alert("เรียกทดสอบไม่สำเร็จ");
    } finally {
      setPinging(false);
    }
  }

  function copyWebhook() {
    try {
      if (!webhookUrl) return;
      navigator.clipboard.writeText(webhookUrl);
      alert("คัดลอก Webhook URL แล้ว");
    } catch {
      // no-op
    }
  }

  async function onSaveAiConfig() {
    if (!aiConfig || !botId) return;
    try {
      setSavingAi(true);
      const res = await updateBotConfig(botId, aiConfig);
      const cfg = res.config ?? aiConfig;
      setAllowedModels(
        Array.isArray(res.allowedModels) && res.allowedModels.length
          ? res.allowedModels
          : ALLOWED_MODELS
      );
      setAiConfig(cfg);
      alert("บันทึก AI Config แล้ว ✔");
    } catch (err) {
      console.error("onSaveAiConfig error:", err);
      alert("บันทึก AI Config ไม่สำเร็จ ❌");
    } finally {
      setSavingAi(false);
    }
  }

  if (loading)
    return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  if (!bot) return null;

  const isLine = bot.platform === "line";
  const isTelegram = bot.platform === "telegram";
  const isFacebook = bot.platform === "facebook";

  return (
    <div className="min-h-screen bg-[#111214] text-gray-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="text-sm text-gray-400">
          <Link to="/bots" className="hover:underline">
            Bots
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-200">{title}</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {title}
              <span className="inline-flex items-center rounded-full border border-gray-600 px-2 py-0.5 text-xs text-gray-200">
                {platformLabel}
              </span>
            </h1>
            <div className="text-xs text-gray-400 mt-1 space-x-2">
              <span>
                ID: <code className="text-gray-300">{bot.id}</code>
              </span>
              <span>• Platform: {bot.platform}</span>
              <span>• Tenant: {bot.tenant ?? "bn9"}</span>
              {bot.verifiedAt ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  • Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  • Not verified
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onPingLine}
              disabled={pinging}
              className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-sm"
            >
              {pinging ? "Pinging…" : "Test: LINE ping"}
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:opacity-60 text-sm"
            >
              {saving ? "Saving…" : "Save secrets"}
            </button>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="rounded-2xl bg-[#151619] border border-gray-800 p-4">
          <div className="text-sm text-gray-300 mb-2">
            {platformLabel} Webhook URL
          </div>
          {webhookUrl ? (
            <>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-black/40 border border-gray-800 rounded px-2 py-1 break-all">
                  {webhookUrl}
                </code>
                <button
                  onClick={copyWebhook}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm"
                >
                  Copy
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                นำ URL นี้ไปวางในฝั่ง {platformLabel} แล้วกด Verify / ตั้งค่า Webhook
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500">
              ยังไม่ได้กำหนด Webhook สำหรับบอทนี้
            </div>
          )}
        </div>

        {/* Secrets form */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="OpenAI API Key">
            <input
              type="password"
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
              placeholder="sk-… หรือใส่ ****** เพื่อคงค่าเดิม"
              value={form.openaiApiKey}
              onChange={(e) => onChange("openaiApiKey", e.target.value)}
              spellCheck={false}
            />
          </Field>

          <div className="grid gap-4">
            <Field label={accessTokenLabel}>
              <textarea
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                placeholder="ใส่ค่าใหม่ หรือ ****** เพื่อคงค่าเดิม"
                value={form.lineAccessToken}
                onChange={(e) => onChange("lineAccessToken", e.target.value)}
                spellCheck={false}
              />
            </Field>
            <Field label={secretLabel}>
              <input
                type="password"
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                placeholder="ใส่ค่าใหม่ หรือ ****** เพื่อคงค่าเดิม"
                value={form.lineChannelSecret}
                onChange={(e) =>
                  onChange("lineChannelSecret", e.target.value)
                }
                spellCheck={false}
              />
            </Field>
          </div>
        </div>

        {/* Note เฉพาะ platform ที่ยังไม่ต่อ backend เต็ม */}
        {(isTelegram || isFacebook) && (
          <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900 rounded-xl p-3">
            ตอนนี้ส่วนเชื่อมต่อ {platformLabel} ยังเป็นโครงเบื้องต้น
            ใช้สำหรับเก็บ Token / Secret ล่วงหน้าได้ก่อน
            ขั้นต่อไปเราค่อยเพิ่ม Webhook route ฝั่ง backend สำหรับ {platformLabel} โดยเฉพาะ
          </div>
        )}

        {/* AI Config / Persona Panel */}
        {aiConfig && (
          <div className="rounded-2xl bg-[#151619] border border-gray-800 p-4 space-y-3 mt-4">
            <div className="text-sm text-neutral-100">
              AI Config / Persona ของบอท
            </div>
            <div className="text-xs text-neutral-400">
              ตั้งค่าโมเดล, อุณหภูมิ (temperature), และ system prompt
              เพื่อกำหนดบุคลิกและหน้าที่ของ AI สำหรับบอทตัวนี้
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Model">
                <select
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                  value={aiConfig.model}
                  onChange={(e) =>
                    setAiConfig((s) =>
                      s ? { ...s, model: e.target.value } : s
                    )
                  }
                >
                  {allowedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!allowedModels.includes(aiConfig.model) && (
                    <option value={aiConfig.model}>{aiConfig.model}</option>
                  )}
                </select>
              </Field>

              <Field label="Temperature">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                  value={aiConfig.temperature}
                  onChange={(e) =>
                    setAiConfig((s) =>
                      s ? { ...s, temperature: Number(e.target.value) } : s
                    )
                  }
                />
              </Field>

              <Field label="Top P">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                  value={aiConfig.topP}
                  onChange={(e) =>
                    setAiConfig((s) =>
                      s ? { ...s, topP: Number(e.target.value) } : s
                    )
                  }
                />
              </Field>
            </div>

            <Field label="Max tokens">
              <input
                type="number"
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                value={aiConfig.maxTokens}
                onChange={(e) =>
                  setAiConfig((s) =>
                    s ? { ...s, maxTokens: Number(e.target.value) } : s
                  )
                }
              />
            </Field>

            <Field label="System prompt / บุคลิกของบอทตัวนี้">
              <textarea
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:ring-2 focus:ring-white/10 text-sm"
                placeholder="เขียนคำสั่งบอก AI ว่าบอทตัวนี้เป็นใคร ทำหน้าที่อะไร มีข้อห้ามอะไรบ้าง..."
                value={aiConfig.systemPrompt}
                onChange={(e) =>
                  setAiConfig((s) =>
                    s ? { ...s, systemPrompt: e.target.value } : s
                  )
                }
              />
            </Field>

            <div className="flex justify-end">
              <button
                onClick={onSaveAiConfig}
                disabled={savingAi}
                className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm disabled:opacity-60"
              >
                {savingAi ? "กำลังบันทึก…" : "Save AI Config"}
              </button>
            </div>
          </div>
        )}

        {/* Intents / Categories Panel */}
        <BotIntentsPanel botId={bot.id} />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-neutral-300">{label}</span>
      {children}
    </label>
  );
}
