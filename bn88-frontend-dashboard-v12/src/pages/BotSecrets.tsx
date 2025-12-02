import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  assignRole,
  getBotSecrets,
  listAdminUsersWithRoles,
  listRoles,
  updateBotSecrets,
} from "../lib/api";
import type {
  AdminUserItem,
  RoleItem,
} from "../lib/api";
import type { BotSecretsMasked, BotSecretsPayload } from "../types/api";

type FormState = Partial<BotSecretsPayload>;

export default function BotSecretsPage() {
  const { botId = "" } = useParams();
  const [masked, setMasked] = useState<BotSecretsMasked>({});
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [roleSaving, setRoleSaving] = useState(false);

  async function load() {
    if (!botId) return;
    try {
      const s = await getBotSecrets(botId);
      setMasked(s || {});
      setForm({});
      const [roleItems, adminItems] = await Promise.all([
        listRoles(),
        listAdminUsersWithRoles(),
      ]);
      setRoles(roleItems);
      setAdmins(adminItems);
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

  async function onAssignRole() {
    if (!selectedAdmin || !selectedRole) {
      toast.error("เลือกผู้ใช้และบทบาทก่อน");
      return;
    }
    setRoleSaving(true);
    try {
      await assignRole(selectedAdmin, selectedRole);
      toast.success("บันทึกบทบาทแล้ว");
      const [roleItems, adminItems] = await Promise.all([
        listRoles(),
        listAdminUsersWithRoles(),
      ]);
      setRoles(roleItems);
      setAdmins(adminItems);
    } catch (e: any) {
      toast.error(e?.message || "บันทึกบทบาทไม่สำเร็จ");
    } finally {
      setRoleSaving(false);
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

        <div className="rounded-2xl bg-[#151619] border border-gray-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Admin Roles</h2>
            <span className="text-xs text-gray-400">RBAC</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-300">Admin User</label>
              <select
                className="w-full rounded-md bg-[#0f1012] border border-gray-800 px-3 py-2 text-sm"
                value={selectedAdmin}
                onChange={(e) => setSelectedAdmin(e.target.value)}
              >
                <option value="">เลือกผู้ใช้</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-300">Role</label>
              <select
                className="w-full rounded-md bg-[#0f1012] border border-gray-800 px-3 py-2 text-sm"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="">เลือกบทบาท</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={onAssignRole}
                disabled={roleSaving}
                className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {roleSaving ? "Saving…" : "Assign Role"}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-3">
            <h3 className="text-sm text-gray-300 mb-2">Current assignments</h3>
            <div className="space-y-2 text-sm">
              {admins.length === 0 && (
                <div className="text-gray-500">No admin users found</div>
              )}
              {admins.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between rounded-md border border-gray-800 bg-[#0f1012] px-3 py-2"
                >
                  <div className="font-medium text-gray-100">{a.email}</div>
                  <div className="text-xs text-gray-300 space-x-2 mt-1 md:mt-0">
                    {a.roles.length === 0 && <span className="text-gray-500">no roles</span>}
                    {a.roles.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center rounded-full bg-gray-800 px-2 py-1 text-[11px] uppercase tracking-wide"
                      >
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



