import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  LepCampaign,
  LepCampaignStatus,
  LepHealthResponse,
  lepCreateCampaign,
  lepGetCampaign,
  lepGetCampaignStatus,
  lepHealth,
  lepListCampaigns,
  lepQueueCampaign,
  LepCampaignSchedule,
  lepListCampaignSchedules,
  lepCreateCampaignSchedule,
  lepDeleteCampaignSchedule,
} from "../lib/api";

const cardClass = "bg-neutral-900 border border-neutral-800 rounded-xl p-4";

export default function MarketingLep() {
  const [healthData, setHealthData] = useState<LepHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [lastHealthAt, setLastHealthAt] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<LepCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState<{ page?: number; pageSize?: number; total?: number } | null>(null);

  const [detailJson, setDetailJson] = useState<string | null>(null);
  const [statusJson, setStatusJson] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<LepCampaignSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [targets, setTargets] = useState("");
  const [creating, setCreating] = useState(false);

  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);

  const calendar = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      return d;
    });

    return days.map((day) => {
      const dateKey = day.toISOString().slice(0, 10);
      const items = schedules.filter((s) => {
        if (s.startAt) {
          return s.startAt.slice(0, 10) === dateKey;
        }
        return false;
      });
      const recurring = schedules.filter((s) => !s.startAt);
      return { date: day, items, recurring };
    });
  }, [schedules]);

  const lepBase = useMemo(() => healthData?.lepBaseUrl ?? "", [healthData]);

  useEffect(() => {
    refreshCampaigns();
  }, []);

  const refreshCampaigns = async () => {
    setCampaignsLoading(true);
    try {
      const res = await lepListCampaigns({ page: 1, pageSize: 50 });
      const items = (res.data as any)?.items ?? [];
      setCampaigns(items as LepCampaign[]);
      setPageInfo({
        page: (res.data as any)?.page,
        pageSize: (res.data as any)?.pageSize,
        total: (res.data as any)?.total,
      });
    } catch (err: any) {
      console.error(err);
      toast.error("โหลดรายการแคมเปญไม่สำเร็จ");
    } finally {
      setCampaignsLoading(false);
    }
  };

  const loadSchedules = async (campaignId: string) => {
    setScheduleLoading(true);
    try {
      const res = await lepListCampaignSchedules(campaignId);
      const items = (res.data as any)?.schedules ?? [];
      setSchedules(items as LepCampaignSchedule[]);
      setSelectedCampaignId(campaignId);
    } catch (err) {
      console.error(err);
      toast.error("โหลดตารางเวลาไม่สำเร็จ");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const res = await lepHealth();
      setHealthData(res);
      setLastHealthAt(new Date().toISOString());
    } catch (err: any) {
      console.error(err);
      toast.error("เชื่อมต่อ LEP ไม่สำเร็จ");
    } finally {
      setHealthLoading(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast.error("กรอกชื่อและข้อความก่อน");
      return;
    }

    let parsedTargets: any = undefined;
    if (targets.trim()) {
      try {
        parsedTargets = JSON.parse(targets);
      } catch (err) {
        toast.error("targets ต้องเป็น JSON ที่แปลงได้");
        return;
      }
    }

    setCreating(true);
    try {
      const res = await lepCreateCampaign({ name, message, targets: parsedTargets });
      toast.success("สร้างแคมเปญสำเร็จ");
      setName("");
      setMessage("");
      setTargets("");
      setDetailJson(JSON.stringify(res.data, null, 2));
      await refreshCampaigns();
    } catch (err: any) {
      console.error(err);
      toast.error("สร้างแคมเปญไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  const handleView = async (id: string) => {
    setWorkingId(id);
    try {
      const res = await lepGetCampaign(id);
      setDetailJson(JSON.stringify(res.data, null, 2));
      await loadSchedules(id);
    } catch (err: any) {
      console.error(err);
      toast.error("ดึงข้อมูลแคมเปญไม่สำเร็จ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleStatus = async (id: string) => {
    setWorkingId(id);
    try {
      const res = await lepGetCampaignStatus(id);
      setStatusJson(JSON.stringify(res.data, null, 2));
    } catch (err: any) {
      console.error(err);
      toast.error("ดึงสถานะแคมเปญไม่สำเร็จ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleQueue = async (id: string) => {
    setWorkingId(id);
    try {
      await lepQueueCampaign(id);
      toast.success("ส่งเข้า Queue แล้ว");
      await refreshCampaigns();
    } catch (err: any) {
      console.error(err);
      toast.error("คิวแคมเปญไม่สำเร็จ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleCreateSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) {
      toast.error("เลือกแคมเปญจากตารางก่อน");
      return;
    }
    if (!cronExpr.trim() || !timezone.trim()) {
      toast.error("กรอก cron และ timezone");
      return;
    }

    setScheduleBusy(true);
    try {
      await lepCreateCampaignSchedule(selectedCampaignId, {
        cron: cronExpr.trim(),
        timezone: timezone.trim(),
        startAt: startAt || undefined,
        endAt: endAt || undefined,
      });
      toast.success("บันทึกตารางเวลาแล้ว");
      await loadSchedules(selectedCampaignId);
    } catch (err) {
      console.error(err);
      toast.error("สร้าง schedule ไม่สำเร็จ");
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!selectedCampaignId) return;
    setScheduleBusy(true);
    try {
      await lepDeleteCampaignSchedule(selectedCampaignId, scheduleId);
      toast.success("ลบ schedule แล้ว");
      await loadSchedules(selectedCampaignId);
    } catch (err) {
      console.error(err);
      toast.error("ลบ schedule ไม่สำเร็จ");
    } finally {
      setScheduleBusy(false);
    }
  };

  const renderCampaignRow = (c: LepCampaign) => {
    return (
      <tr key={c.id} className="border-b border-neutral-800/60">
        <td className="px-3 py-2 text-xs text-neutral-400">{c.id}</td>
        <td className="px-3 py-2 font-medium">{c.name}</td>
        <td className="px-3 py-2">
          <span className="inline-flex px-2 py-1 rounded-full bg-neutral-800 text-xs uppercase tracking-wide">
            {c.status || "unknown"}
          </span>
        </td>
        <td className="px-3 py-2 text-sm text-neutral-300">
          {c.createdAt ? new Date(c.createdAt).toLocaleString() : "-"}
        </td>
        <td className="px-3 py-2 space-x-2 text-sm">
          <button
            onClick={() => handleView(c.id)}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            disabled={workingId === c.id}
          >
            View
          </button>
          <button
            onClick={() => handleStatus(c.id)}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            disabled={workingId === c.id}
          >
            Status
          </button>
          <button
            onClick={() => handleQueue(c.id)}
            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500"
            disabled={workingId === c.id}
          >
            Queue
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">LINE Engagement Platform</h1>
        <p className="text-sm text-neutral-400">
          Monitor และสั่งงานแคมเปญผ่าน BN88 (proxy ไปยัง LEP backend)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold">LEP Health</h2>
              <p className="text-xs text-neutral-400">Base: {lepBase || "-"}</p>
            </div>
            <button
              onClick={handleHealthCheck}
              disabled={healthLoading}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
            >
              {healthLoading ? "Checking..." : "Check LEP Health"}
            </button>
          </div>
          <div className="text-xs text-neutral-400 mb-1">
            ล่าสุด: {lastHealthAt ? new Date(lastHealthAt).toLocaleString() : "-"}
          </div>
          <pre className="bg-black/40 text-xs p-3 rounded border border-neutral-800 overflow-auto max-h-64">
            {JSON.stringify(healthData ?? {}, null, 2)}
          </pre>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-semibold mb-2">Quick Stats</h2>
          <div className="text-sm text-neutral-300 space-y-1">
            <div>Campaigns: {campaigns.length}</div>
            <div>
              Page: {pageInfo?.page ?? 1} / PageSize: {pageInfo?.pageSize ?? 50}
            </div>
            <div>Total (ถ้ามี): {pageInfo?.total ?? "-"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={cardClass}>
          <h2 className="text-lg font-semibold mb-2">Create Campaign</h2>
          <form className="space-y-3" onSubmit={handleCreate}>
            <div>
              <label className="text-sm text-neutral-300">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2"
                placeholder="My LEP campaign"
              />
            </div>
            <div>
              <label className="text-sm text-neutral-300">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2"
                rows={4}
                placeholder="ข้อความที่จะส่ง"
              />
            </div>
            <div>
              <label className="text-sm text-neutral-300">Targets (JSON, optional)</label>
              <textarea
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 font-mono"
                rows={3}
                placeholder='{"type":"tag","tags":["vip"]}'
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm"
            >
              {creating ? "Saving..." : "Create Campaign"}
            </button>
          </form>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-semibold mb-2">Campaign Detail / Status</h2>
          <div className="text-xs text-neutral-400 mb-2">เลือก View หรือ Status จากตาราง</div>
          <div className="grid grid-cols-1 gap-2">
            <pre className="bg-black/40 text-xs p-3 rounded border border-neutral-800 overflow-auto max-h-60">
              {detailJson || "เลือกแคมเปญเพื่อดูรายละเอียด"}
            </pre>
            <pre className="bg-black/40 text-xs p-3 rounded border border-neutral-800 overflow-auto max-h-60">
              {statusJson || "เลือกแคมเปญเพื่อดูสถานะ"}
            </pre>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold">Schedule (Calendar)</h2>
              <p className="text-xs text-neutral-400">
                เลือกแคมเปญจากตาราง แล้วสร้าง cron schedule (timezone รองรับ)
              </p>
            </div>
            <button
              onClick={() => selectedCampaignId && loadSchedules(selectedCampaignId)}
              disabled={!selectedCampaignId || scheduleLoading}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
            >
              {scheduleLoading ? "Loading..." : "Reload"}
            </button>
          </div>
          <form className="space-y-2" onSubmit={handleCreateSchedule}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-neutral-300">Cron</label>
                <input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 font-mono text-sm"
                  placeholder="0 9 * * *"
                />
              </div>
              <div>
                <label className="text-sm text-neutral-300">Timezone</label>
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                  placeholder="Asia/Bangkok"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-neutral-300">Start at (optional)</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-neutral-300">End at (optional)</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="mt-1 w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={scheduleBusy || !selectedCampaignId}
              className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm"
            >
              {scheduleBusy ? "Saving..." : "Create Schedule"}
            </button>
            <div className="text-xs text-neutral-400">
              Campaign ที่เลือก: {selectedCampaignId || "(เลือกจากตารางด้านล่าง)"}
            </div>
          </form>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Calendar / Schedules</h2>
            <span className="text-xs text-neutral-500">{schedules.length} items</span>
          </div>
          <div className="overflow-auto max-h-80 text-sm space-y-3">
            {schedules.length === 0 ? (
              <div className="text-neutral-500 text-sm">ยังไม่มี schedule</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {calendar.map((day) => (
                    <div key={day.date.toISOString()} className="border border-neutral-800 rounded-lg p-3 bg-black/20">
                      <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                        <span>{day.date.toLocaleDateString()}</span>
                        <span>{day.items.length} on-day</span>
                      </div>
                      <div className="space-y-1">
                        {day.items.map((s) => (
                          <div key={s.id} className="text-xs bg-neutral-800/60 rounded px-2 py-1">
                            <div className="font-mono text-[11px]">{s.cron}</div>
                            <div className="text-neutral-400">
                              {s.startAt ? new Date(s.startAt).toLocaleTimeString() : "-"}
                            </div>
                          </div>
                        ))}
                        {day.items.length === 0 && (
                          <div className="text-neutral-600 text-xs">ไม่มีรายการในวันนี้</div>
                        )}
                        {day.recurring.length > 0 && (
                          <div className="text-[11px] text-neutral-400">Recurring: {day.recurring.length}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border border-neutral-800 rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="text-neutral-400 text-xs uppercase">
                      <tr className="border-b border-neutral-800/60">
                        <th className="px-2 py-2 text-left">Cron</th>
                        <th className="px-2 py-2 text-left">TZ</th>
                        <th className="px-2 py-2 text-left">Start/End</th>
                        <th className="px-2 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((s) => (
                        <tr key={s.id} className="border-b border-neutral-800/60">
                          <td className="px-2 py-2 font-mono text-xs">{s.cron}</td>
                          <td className="px-2 py-2 text-xs">{s.timezone}</td>
                          <td className="px-2 py-2 text-xs text-neutral-400">
                            <div>{s.startAt ? new Date(s.startAt).toLocaleString() : "-"}</div>
                            <div>{s.endAt ? new Date(s.endAt).toLocaleString() : "-"}</div>
                          </td>
                          <td className="px-2 py-2 text-xs space-x-2">
                            <button
                              onClick={() => handleDeleteSchedule(s.id)}
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                              disabled={scheduleBusy}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <button
            onClick={refreshCampaigns}
            disabled={campaignsLoading}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            {campaignsLoading ? "Loading..." : "Reload"}
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-400 text-xs uppercase">
              <tr className="border-b border-neutral-800/60">
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && !campaignsLoading ? (
                <tr>
                  <td
                    className="px-3 py-4 text-center text-neutral-500"
                    colSpan={5}
                  >
                    ไม่มีแคมเปญ
                  </td>
                </tr>
              ) : (
                campaigns.map(renderCampaignRow)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
