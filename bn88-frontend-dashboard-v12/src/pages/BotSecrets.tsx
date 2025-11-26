import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getBotSecrets, updateBotSecrets } from "../lib/api";
import type { BotSecretsMasked, BotSecretsPayload } from "../types/api";

type FormState = Partial<BotSecretsPayload>;

export default function BotSecretsPage() {
  const { botId = "" } = useParams();
  const [masked, setMasked] = useState<BotSecretsMasked>({});
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!botId) return;
    try {
      const s = await getBotSecrets(botId);
      setMasked(s || {});
      setForm({});
    } catch (e: any) {
      setErr(e?.message || "โหลด secrets ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  function onChange<K extends keyof FormState>(key: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: v }));
  }

  async function onSave() {
    if (!botId) return;
    setSaving(true);
    setErr(null);
    try {
      const payload: BotSecretsPayload = { ...form };
      if (payload.openaiKey && !payload.openaiApiKey) payload.openaiApiKey = payload.openaiKey;
      if (payload.lineSecret && !payload.lineChannelSecret) payload.lineChannelSecret = payload.lineSecret;

      const res = await updateBotSecrets(botId, payload);
      if (!res?.ok) throw new Error("save_failed");
      toast.success("บันทึก Secrets แล้ว");
      await load();
    } catch (e: any) {
      setErr(e?.message || "บันทึกไม่สำเร็จ");
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#111214] text-gray-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Secrets</h1>
          <Link to={`/bots/${botId}`} className="rounded-md bg-gray-800 px-3 py-1.5 hover:bg-gray-700">← Back</Link>
        </div>

        {err && <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-900 rounded-lg p-3">{err}</div>}

        <div className="rounded-2xl bg-[#151619] border border-gray-800 p-4 space-y-4">
          <div>
            <label className="text-sm text-gray-300">OpenAI API Key</label>
            <input
              className="w-full rounded-md bg-[#0f1012] border border-gray-800 px-3 py-2 text-sm"
              placeholder={masked.openaiApiKey ? "******** (กดพิมพ์เพื่อแทนที่เดิม)" : "sk-..."}
              onChange={(e) => onChange("openaiApiKey", e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">LINE Channel Access Token</label>
            <input
              className="w-full rounded-md bg-[#0f1012] border border-gray-800 px-3 py-2 text-sm"
              placeholder={masked.lineAccessToken ? "******** (กดพิมพ์เพื่อแทนที่เดิม)" : "line access token"}
              onChange={(e) => onChange("lineAccessToken", e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">LINE Channel Secret</label>
            <input
              className="w-full rounded-md bg-[#0f1012] border border-gray-800 px-3 py-2 text-sm"
              placeholder={masked.lineChannelSecret ? "******** (กดพิมพ์เพื่อแทนที่เดิม)" : "line channel secret"}
              onChange={(e) => onChange("lineChannelSecret", e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



