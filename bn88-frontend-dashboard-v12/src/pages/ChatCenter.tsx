// src/pages/ChatCenter.tsx
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  type BotItem,
  type ChatSession,
  type ChatMessage,
  getBots,
  getChatSessions,
  getChatMessages,
  replyChatSession,
  getApiBase,
} from "../lib/api";

const POLL_INTERVAL_MS = 3000; // 3 วินาที

type PlatformFilterValue =
  | "all"
  | "line"
  | "telegram"
  | "facebook"
  | "webchat"
  | "other";

type IssueFilterValue = "all" | "issue" | "nonIssue";

/* ---------------------- Intent helpers (frontend only) ---------------------- */

/** ดึง intent code ล่าสุดจาก session (ลองอ่านจากหลาย field) */
const getSessionIntentCode = (s: ChatSession): string | null => {
  const anySession = s as any;
  return (
    anySession.lastKind ??
    anySession.lastIntentCode ??
    anySession.intentKind ??
    anySession.kind ??
    null
  );
};

/** ดึง intent code จากข้อความ (ลองอ่านจากหลาย field/meta) */
const getMessageIntentCode = (m: ChatMessage): string | null => {
  const anyMsg = m as any;
  return (
    anyMsg.kind ??
    anyMsg.intentCode ??
    anyMsg.intentKind ??
    anyMsg.meta?.kind ??
    anyMsg.meta?.intent?.code ??
    null
  );
};

/** แปลง intent code → label ภาษาไทยสั้น ๆ */
const intentCodeToLabel = (code?: string | null): string | null => {
  if (!code) return null;
  const c = String(code).toLowerCase();
  if (c === "deposit") return "ฝากเงิน";
  if (c === "withdraw") return "ถอนเงิน";
  if (c === "register") return "สมัครสมาชิก";
  if (c === "kyc") return "ยืนยันตัวตน";
  if (c === "other") return "อื่น ๆ";
  return code; // fallback แสดง code ตรง ๆ
};

/** Badge intent สำหรับใช้ใน UI หลายที่ */
const IntentBadge: React.FC<{ code?: string | null }> = ({ code }) => {
  const label = intentCodeToLabel(code);
  if (!label || String(code).toLowerCase() === "other") return null;

  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/40">
      {label}
    </span>
  );
};

const ChatCenter: React.FC = () => {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] =
    useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [loadingBots, setLoadingBots] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tenant = import.meta.env.VITE_TENANT || "bn9";
  const apiBase = getApiBase();

  // ช่องค้นหา sessions
  const [sessionQueryInput, setSessionQueryInput] = useState("");
  const [sessionQuery, setSessionQuery] = useState("");

  // filter issue / เคสปัญหา
  const [issueFilter, setIssueFilter] = useState<IssueFilterValue>("all");

  // filter เวลา
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  // filter platform
  const [platformFilter, setPlatformFilter] =
    useState<PlatformFilterValue>("all");

  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSessionQuery(sessionQueryInput.trim());
    }, 400);
    return () => window.clearTimeout(handle);
  }, [sessionQueryInput]);

  const fetchSessions = useCallback(
    async (botId: string, preferSessionId?: string | null) => {
      try {
        setLoadingSessions(true);
        setError(null);
        const platformParam =
          platformFilter === "all" || platformFilter === "other"
            ? undefined
            : platformFilter;

        const data = await getChatSessions(botId, {
          limit: 50,
          platform: platformParam,
          query: sessionQuery || undefined,
          isIssue:
            issueFilter === "all"
              ? null
              : issueFilter === "issue"
              ? true
              : false,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        });

        const normalized = data
          .map((s) => ({
            ...s,
            caseCount:
              (s as any).caseCount ?? (s as any)._count?.cases ?? s.caseCount ?? 0,
            hasIssue:
              typeof s.hasIssue === "boolean"
                ? s.hasIssue
                : Boolean(
                    (s as any).hasIssue ??
                      (s as any).caseCount ??
                      (s as any)._count?.cases
                  ),
          }))
          .filter((s) => {
            if (platformFilter === "other") {
              const plat = (s.platform || "").toLowerCase();
              return !["line", "telegram", "facebook", "webchat"].includes(plat);
            }
            return true;
          });

        setSessions(normalized);

        const preferId = preferSessionId || selectedSession?.id || null;
        const list = normalized;
        const nextSession = preferId
          ? list.find((s) => s.id === preferId) ?? list[0] ?? null
          : list[0] ?? null;

        setSelectedSession((prev) => {
          if (prev?.id && nextSession?.id && prev.id === nextSession.id) {
            return prev; // ลดการ rerender/fetch ซ้ำ
          }
          return nextSession ?? null;
        });
        if (!nextSession) setMessages([]);
        return nextSession ?? null;
      } catch (e) {
        console.error(e);
        setError("โหลดรายการห้องแชทไม่สำเร็จ");
        setSessions([]);
        setSelectedSession(null);
        setMessages([]);
        return null;
      } finally {
        setLoadingSessions(false);
      }
    },
    [
      selectedSession?.id,
      platformFilter,
      sessionQuery,
      issueFilter,
      dateFrom,
      dateTo,
    ]
  );

  const fetchMessages = useCallback(async (sessionId: string) => {
    try {
      setLoadingMessages(true);
      setError(null);
      const data = await getChatMessages(sessionId, 200);
      setMessages(data);
      return data;
    } catch (e) {
      console.error(e);
      setError("โหลดข้อความไม่สำเร็จ");
      return [];
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  /* ------------------------- โหลดรายชื่อบอททั้งหมด ------------------------- */

  useEffect(() => {
    const loadBots = async () => {
      try {
        setLoadingBots(true);
        setError(null);
        const res = await getBots();
        const items = res.items ?? [];
        setBots(items);
        if (items.length > 0) {
          // เลือกบอทตัวแรกเป็น default
          setSelectedBotId(items[0].id);
        } else {
          setSelectedBotId(null);
        }
      } catch (e) {
        console.error(e);
        setError("โหลดรายชื่อบอทไม่สำเร็จ");
      } finally {
        setLoadingBots(false);
      }
    };
    void loadBots();
  }, []);

  /* -------------------- โหลด sessions ตามบอทที่เลือกอยู่ -------------------- */

  useEffect(() => {
    const loadSessions = async () => {
      if (!selectedBotId) {
        setSessions([]);
        setSelectedSession(null);
        setMessages([]);
        return;
      }
      await fetchSessions(selectedBotId);
    };

    void loadSessions();
  }, [selectedBotId, fetchSessions]);

  /* ------------------ โหลด messages เมื่อเปลี่ยน session ------------------ */

  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedSession) {
        setMessages([]);
        return;
      }
      await fetchMessages(selectedSession.id);
    };

    void loadMessages();
  }, [selectedSession?.id, fetchMessages]);

  /* -------- Auto-refresh ทั้ง sessions + messages แบบเป็นช่วงเวลา -------- */

  useEffect(() => {
    if (!selectedBotId) return;

    const timer = window.setInterval(async () => {
      try {
        const currentSessionId = selectedSession?.id;
        const nextSession = await fetchSessions(
          selectedBotId,
          currentSessionId ?? undefined
        );

        const targetSessionId = currentSessionId || nextSession?.id;
        if (targetSessionId) await fetchMessages(targetSessionId);
      } catch (e) {
        console.error("[ChatCenter poll error]", e);
        // ไม่ต้อง setError บ่อย ๆ เดี๋ยวจอกระพริบ
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedBotId, selectedSession?.id, fetchSessions, fetchMessages]);

  /* ------------------- SSE: รับข้อความใหม่แบบ realtime ------------------- */

  useEffect(() => {
    if (!selectedBotId) return;

    const url = `${apiBase}/events?tenant=${encodeURIComponent(tenant)}`;
    const es = new EventSource(url);

    const handleNewMessage = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data || "{}") as any;
        if (!payload || payload.botId !== selectedBotId) return;
        const sessionId = payload.sessionId as string | undefined;

        void (async () => {
          const nextSession = await fetchSessions(
            selectedBotId,
            sessionId || selectedSession?.id || undefined
          );
          const targetSessionId =
            sessionId || selectedSession?.id || nextSession?.id || null;
          if (targetSessionId) {
            await fetchMessages(targetSessionId);
          }
        })();
      } catch (err) {
        console.warn("[ChatCenter SSE parse error]", err);
      }
    };

    es.addEventListener("chat:message:new", handleNewMessage);

    return () => {
      es.removeEventListener("chat:message:new", handleNewMessage as any);
      try {
        es.close();
      } catch (e) {
        console.warn("[ChatCenter SSE close warn]", e);
      }
    };
  }, [selectedBotId, tenant, apiBase, fetchSessions, fetchMessages, selectedSession?.id]);

  /* ---------------- scroll ลงล่างเมื่อมีข้อความใหม่ ---------------- */

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length]);

  /* ----------------------------- handlers ----------------------------- */

  const handleSelectSession = (s: ChatSession) => {
    setSelectedSession(s);
    setReplyText("");
  };

  const handleSendReply = async () => {
    if (!selectedSession) return;
    const text = replyText.trim();
    if (!text) return;

    try {
      setSending(true);
      setError(null);

      const res = await replyChatSession(selectedSession.id, text);

      if (res.ok && res.message) {
        // ✅ ดึงออกมาใส่ตัวแปรแยก เพื่อให้ TS เห็นว่าเป็น ChatMessage ชัวร์
        const newMessage: ChatMessage = res.message;
        setMessages((prev) => [...prev, newMessage]);
      } else if (!res.ok && res.error) {
        setError(`ส่งข้อความไม่สำเร็จ: ${res.error}`);
      }

      setReplyText("");
    } catch (e) {
      console.error(e);
      setError("ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDownInput: React.KeyboardEventHandler<HTMLInputElement> = (
    e
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendReply();
    }
  };

  const currentBot = bots.find((b) => b.id === selectedBotId) || null;

  /* ------------------------- filter ห้องแชทตาม query + platform ------------------------- */

  const filteredSessions = useMemo(() => {
    const q = sessionQueryInput.trim().toLowerCase();
    return sessions.filter((s) => {
      const plat = (s.platform || "").toLowerCase();
      if (platformFilter !== "all") {
        if (platformFilter === "other") {
          if (["line", "telegram", "facebook", "webchat"].includes(plat)) {
            return false;
          }
        } else if (plat !== platformFilter) {
          return false;
        }
      }

      if (issueFilter === "issue" && !s.hasIssue) return false;
      if (issueFilter === "nonIssue" && s.hasIssue) return false;

      if (!q) return true;
      const name = (s.displayName || "").toLowerCase();
      const uid = (s.userId || "").toLowerCase();
      const lastText = (s.lastText || "").toLowerCase();
      return name.includes(q) || uid.includes(q) || lastText.includes(q);
    });
  }, [sessions, sessionQueryInput, platformFilter, issueFilter]);

  /* ------------------------- group messages by day ------------------------- */

  const messagesWithDateHeader = useMemo(() => {
    const result: Array<
      ChatMessage & { _showDateHeader?: boolean; _dateLabel?: string }
    > = [];
    let lastDateKey = "";
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const dateKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
      let show = false;
      let label = "";
      if (dateKey !== lastDateKey) {
        show = true;
        lastDateKey = dateKey;
        label = d.toLocaleDateString();
      }
      result.push({ ...m, _showDateHeader: show, _dateLabel: label });
    }
    return result;
  }, [messages]);

  /* ------------------------- helper แปลง platform เป็น label ------------------------- */

  const platformLabel = (p?: string | null) => {
    const plat = (p || "").toLowerCase();
    if (plat === "line") return "LINE";
    if (plat === "telegram") return "Telegram";
    if (plat === "facebook") return "Facebook";
    if (plat === "webchat") return "Webchat";
    if (!plat) return "-";
    return plat;
  };

  const platformFilterLabel = (v: PlatformFilterValue) => {
    if (v === "all") return "ทุกแพลตฟอร์ม";
    if (v === "line") return "LINE";
    if (v === "telegram") return "Telegram";
    if (v === "facebook") return "Facebook";
    if (v === "webchat") return "Webchat";
    return "อื่น ๆ";
  };

  const selectedSessionIntentCode = selectedSession
    ? getSessionIntentCode(selectedSession)
    : null;

  /* ------------------------------ UI หลัก ------------------------------ */

  return (
    <div className="flex flex-col h-[70vh] min-h-0 gap-3">
      {/* แถบด้านบน: เลือกบอท */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Chat Center</h1>
          <span className="text-xs text-zinc-400">
            ดูแชทลูกค้าจากหลายบอท หลายแพลตฟอร์ม ในที่เดียว
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">แพลตฟอร์ม:</span>
            <select
              aria-label="เลือกแพลตฟอร์ม"
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100"
              value={platformFilter}
              onChange={(e) =>
                setPlatformFilter(e.target.value as PlatformFilterValue)
              }
            >
              <option value="all">{platformFilterLabel("all")}</option>
              <option value="line">{platformFilterLabel("line")}</option>
              <option value="telegram">
                {platformFilterLabel("telegram")}
              </option>
              <option value="facebook">
                {platformFilterLabel("facebook")}
              </option>
              <option value="webchat">
                {platformFilterLabel("webchat")}
              </option>
              <option value="other">{platformFilterLabel("other")}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">บอท:</span>
            {loadingBots ? (
              <span className="text-xs text-zinc-300">กำลังโหลดบอท...</span>
            ) : bots.length === 0 ? (
              <span className="text-xs text-red-400">
                ยังไม่มีบอทในระบบ กรุณาสร้างบอทก่อน
              </span>
            ) : (
              <select
                aria-label="เลือกบอท"
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100"
                value={selectedBotId ?? ""}
                onChange={(e) => setSelectedBotId(e.target.value || null)}
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id} ({b.platform})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ส่วนแชทหลัก */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* ซ้าย: รายการห้องแชท */}
        <div className="w-80 border border-zinc-700 rounded-xl bg-zinc-900/60 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-zinc-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Chat Sessions</div>
              <span className="text-xs text-zinc-400">
                bot: {currentBot ? currentBot.name || currentBot.id : "-"}
              </span>
            </div>
            {/* ช่องค้นหาห้องแชท */}
            <input
              type="text"
              aria-label="ค้นหาห้องแชท"
              className="w-full bg-zinc-950/70 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="ค้นหาชื่อลูกค้า หรือ userId..."
              value={sessionQueryInput}
              onChange={(e) => setSessionQueryInput(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
              <label className="flex items-center gap-1">
                <span className="text-zinc-400">เคส:</span>
                <select
                  className="bg-zinc-950/70 border border-zinc-700 rounded px-2 py-1"
                  value={issueFilter}
                  onChange={(e) =>
                    setIssueFilter(e.target.value as IssueFilterValue)
                  }
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="issue">มีเคสปัญหา</option>
                  <option value="nonIssue">ไม่มีเคส</option>
                </select>
              </label>

              <label className="flex items-center gap-1">
                <span className="text-zinc-400">จาก</span>
                <input
                  type="date"
                  className="bg-zinc-950/70 border border-zinc-700 rounded px-2 py-1"
                  value={dateFrom ?? ""}
                  onChange={(e) => setDateFrom(e.target.value || null)}
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-zinc-400">ถึง</span>
                <input
                  type="date"
                  className="bg-zinc-950/70 border border-zinc-700 rounded px-2 py-1"
                  value={dateTo ?? ""}
                  onChange={(e) => setDateTo(e.target.value || null)}
                />
              </label>
            </div>
          </div>

          {loadingSessions ? (
            <div className="p-4 text-sm text-zinc-400">กำลังโหลด...</div>
          ) : !selectedBotId ? (
            <div className="p-4 text-sm text-zinc-400">
              กรุณาเลือกบอทเพื่อดูห้องแชท
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-4 text-sm text-zinc-400">
              ไม่พบห้องแชทที่ตรงกับเงื่อนไข
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filteredSessions.map((s) => {
                const isActive = selectedSession?.id === s.id;
                const intentCode = getSessionIntentCode(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSession(s)}
                    className={`w-full text-left px-4 py-3 border-b border-zinc-800 text-sm hover:bg-zinc-800/60 ${
                      isActive ? "bg-zinc-800/80" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">
                        {s.displayName || s.userId}
                      </div>
                      <div className="flex items-center gap-1">
                        <IntentBadge code={intentCode} />
                        {s.hasIssue && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-200 border border-rose-500/40">
                            เคสปัญหา
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-200">
                          {platformLabel(s.platform)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {new Date(s.lastMessageAt).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ขวา: ข้อความในห้อง */}
        <div className="flex-1 border border-zinc-700 rounded-xl bg-zinc-900/60 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="font-semibold text-sm">
              {selectedSession
                ? selectedSession.displayName || selectedSession.userId
                : "ไม่มีห้องแชทที่เลือก"}
            </div>
            {selectedSession && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>
                  platform: {platformLabel(selectedSession.platform)}
                </span>
                <IntentBadge code={selectedSessionIntentCode} />
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 text-xs text-red-400 border-b border-zinc-800">
              {error}
            </div>
          )}

          <div
            ref={messagesRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm min-h-0"
          >
            {loadingMessages && (
              <div className="text-zinc-400 text-xs">
                กำลังโหลดข้อความ...
              </div>
            )}

            {!loadingMessages && messages.length === 0 && selectedSession && (
              <div className="text-zinc-400 text-xs">
                ยังไม่มีข้อความในห้องนี้
              </div>
            )}

            {!selectedSession && (
              <div className="text-zinc-500 text-xs">
                กรุณาเลือกลูกค้าจากด้านซ้ายเพื่อดูประวัติแชท
              </div>
            )}

            {messagesWithDateHeader.map((m) => {
              const isBot = m.senderType === "bot";
              const isAdmin = m.senderType === "admin";

              let align = "justify-start";
              let bubble = "bg-zinc-800 text-zinc-50"; // user

              if (isBot) {
                align = "justify-end";
                bubble = "bg-emerald-600 text-white";
              } else if (isAdmin) {
                align = "justify-end";
                bubble = "bg-blue-600 text-white";
              }

              const content =
                m.text && m.text.length > 0
                  ? m.text
                  : m.messageType !== "text"
                  ? `[${m.messageType || "message"}]`
                  : "";

              const msgIntentCode = getMessageIntentCode(m);
              const msgIntentLabel = intentCodeToLabel(msgIntentCode);
              const messagePlatform = platformLabel(
                m.platform || selectedSession?.platform
              );

              return (
                <React.Fragment key={m.id}>
                  {m._showDateHeader && m._dateLabel && (
                    <div className="flex justify-center my-2">
                      <span className="px-3 py-1 rounded-full bg-zinc-800 text-[10px] text-zinc-300">
                        {m._dateLabel}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${align} gap-2 items-end text-sm`}>
                    <div
                      className={`max-w-[70%] px-3 py-2 rounded-2xl ${bubble} whitespace-pre-line`}
                    >
                      {content}
                      {/* แสดง intent เฉพาะข้อความฝั่ง user และถ้ามี label */}
                      {m.senderType === "user" && msgIntentLabel && (
                        <div className="mt-1 text-[10px] opacity-80">
                          หมวด: {msgIntentLabel}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] opacity-70 flex items-center justify-between gap-2">
                        {messagePlatform && (
                          <span className="px-2 py-0.5 rounded-full bg-black/20 border border-white/10">
                            {messagePlatform}
                          </span>
                        )}
                        <span className="ml-auto text-right">
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* กล่องส่งข้อความแอดมิน */}
          <div className="px-4 py-3 border-t border-zinc-800 flex gap-2 items-center">
            <input
              type="text"
              className="flex-1 border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder={
                selectedSession
                  ? "พิมพ์ข้อความตอบลูกค้า แล้วกด Enter หรือปุ่ม ส่ง"
                  : "กรุณาเลือกห้องแชทก่อนตอบลูกค้า"
              }
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDownInput}
              disabled={!selectedSession || sending}
            />
            <button
              type="button"
              onClick={handleSendReply}
              disabled={
                !selectedSession || sending || replyText.trim().length === 0
              }
              className="px-4 py-2 rounded-lg bg-emerald-600 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500"
            >
              {sending ? "กำลังส่ง..." : "ส่ง"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatCenter;
