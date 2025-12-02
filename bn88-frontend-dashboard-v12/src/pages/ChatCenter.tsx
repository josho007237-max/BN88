// src/pages/ChatCenter.tsx
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type BotItem,
  type ChatSession,
  type ChatMessage,
  type MessageType,
  type FaqEntry,
  type EngagementMessage,
  type LiveStream,
  type LiveQuestion,
  type LivePoll,
  getBots,
  getChatSessions,
  getChatMessages,
  replyChatSession,
  getApiBase,
  searchChatMessages,
  sendRichMessage,
  startTelegramLive,
  submitLiveQuestion,
  createLivePoll,
  getLiveSummary,
  getFaqEntries,
  createFaqEntry,
  updateFaqEntry,
  deleteFaqEntry,
  getEngagementMessages,
  createEngagementMessage,
  updateEngagementMessage,
  deleteEngagementMessage,
} from "../lib/api";

const POLL_INTERVAL_MS = 3000; // 3 วินาที
const PAGE_SIZE = 50;

type PlatformFilterValue =
  | "all"
  | "line"
  | "telegram"
  | "facebook"
  | "webchat"
  | "other";

type MetricsSnapshot = {
  deliveryTotal: number;
  errorTotal: number;
  perChannel: Record<string, { sent: number; errors: number }>;
  updatedAt?: string;
};

type ConversationGroup = {
  conversationId: string;
  messages: ChatMessage[];
  latestAt: number;
  session?: ChatMessage["session"];
  platform: string | null;
  botId: string | null;
  displayName?: string;
  userId?: string;
};

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

export const FaqList: React.FC<{
  items: FaqEntry[];
  onEdit?: (item: FaqEntry) => void;
  onDelete?: (id: string) => void;
  loading?: boolean;
}> = ({ items, onEdit, onDelete, loading }) => {
  if (loading) {
    return <div className="text-xs text-zinc-400">กำลังโหลด FAQ...</div>;
  }
  if (!items.length) {
    return <div className="text-xs text-zinc-400">ยังไม่มี FAQ</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((f) => (
        <div
          key={f.id}
          className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/70 flex items-start justify-between gap-3"
        >
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-zinc-100">{f.question}</div>
            <div className="text-zinc-300 text-xs whitespace-pre-line">{f.answer}</div>
            <div className="text-[11px] text-zinc-500 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                {f.enabled ? "เปิดใช้งาน" : "ปิด"}
              </span>
              {Array.isArray(f.keywords) && f.keywords.length > 0 && (
                <span className="text-[11px] text-zinc-400 truncate">
                  คีย์เวิร์ด: {(f.keywords as string[]).join(", ")}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 text-[11px]">
            {onEdit && (
              <button
                className="px-2 py-1 rounded bg-emerald-700/40 border border-emerald-600 text-emerald-100"
                onClick={() => onEdit(f)}
              >
                แก้ไข
              </button>
            )}
            {onDelete && (
              <button
                className="px-2 py-1 rounded bg-red-700/30 border border-red-700 text-red-200"
                onClick={() => onDelete(f.id)}
              >
                ลบ
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const EngagementList: React.FC<{
  items: EngagementMessage[];
  onToggle?: (item: EngagementMessage, next: boolean) => void;
  onEdit?: (item: EngagementMessage) => void;
  onDelete?: (id: string) => void;
  loading?: boolean;
}> = ({ items, onToggle, onEdit, onDelete, loading }) => {
  if (loading) return <div className="text-xs text-zinc-400">กำลังโหลด Engagement...</div>;
  if (!items.length) return <div className="text-xs text-zinc-400">ยังไม่มี Engagement</div>;
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div
          key={m.id}
          className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/70 flex items-start justify-between gap-3"
        >
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-zinc-100">
              {m.platform.toUpperCase()} • {m.channelId}
            </div>
            <div className="text-zinc-300 text-xs whitespace-pre-line">{m.text}</div>
            <div className="text-[11px] text-zinc-500 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                ทุก {m.intervalMinutes} นาที
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                {m.enabled ? "เปิด" : "ปิด"}
              </span>
            </div>
          </div>
          <div className="flex gap-2 text-[11px]">
            {onToggle && (
              <button
                className="px-2 py-1 rounded bg-indigo-700/40 border border-indigo-600 text-indigo-100"
                onClick={() => onToggle(m, !m.enabled)}
              >
                {m.enabled ? "ปิด" : "เปิด"}
              </button>
            )}
            {onEdit && (
              <button
                className="px-2 py-1 rounded bg-emerald-700/40 border border-emerald-600 text-emerald-100"
                onClick={() => onEdit(m)}
              >
                แก้ไข
              </button>
            )}
            {onDelete && (
              <button
                className="px-2 py-1 rounded bg-red-700/30 border border-red-700 text-red-200"
                onClick={() => onDelete(m.id)}
              >
                ลบ
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const BotPreviewCard: React.FC<{
  platform: "line" | "telegram";
  sampleFaq?: FaqEntry | null;
  sampleEngagement?: EngagementMessage | null;
}> = ({ platform, sampleFaq, sampleEngagement }) => {
  const hasFaq = Boolean(sampleFaq);
  const hasEng = Boolean(sampleEngagement);
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-zinc-100">ตัวอย่างข้อความ</div>
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3 text-sm">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">
            {platform.toUpperCase()}
          </span>
          <span>ข้อความบอท</span>
        </div>
        {hasFaq ? (
          <div className="space-y-1">
            <div className="font-semibold text-zinc-100">{sampleFaq?.question}</div>
            <div className="text-zinc-200 text-sm whitespace-pre-line">{sampleFaq?.answer}</div>
          </div>
        ) : (
          <div className="text-zinc-500 text-sm">ยังไม่มี FAQ</div>
        )}
        {hasEng && (
          <div className="border-t border-zinc-800 pt-3 space-y-1">
            <div className="text-xs text-zinc-400">ข้อความ Engagement</div>
            <div className="text-zinc-200 whitespace-pre-line">{sampleEngagement?.text}</div>
            <div className="text-[11px] text-zinc-500">
              ทุก {sampleEngagement?.intervalMinutes} นาที ไปยัง {sampleEngagement?.channelId}
            </div>
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        LINE จะแสดงเป็น Flex/Quick reply, Telegram แสดงเป็น inline keyboard ได้
      </div>
    </div>
  );
};

const ChatCenter: React.FC = () => {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] =
    useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedConversationId, setSelectedConversationId] =
    useState<string | null>(null);
  const [conversationPage, setConversationPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [loadingBots, setLoadingBots] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [replyType, setReplyType] = useState<MessageType>("TEXT");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentMetaInput, setAttachmentMetaInput] = useState("");
  const [richPlatform, setRichPlatform] = useState<string>("line");
  const [richTitle, setRichTitle] = useState("");
  const [richBody, setRichBody] = useState("");
  const [richImageUrl, setRichImageUrl] = useState("");
  const [richAltText, setRichAltText] = useState("");
  const [richButtons, setRichButtons] = useState<
    Array<{ label: string; action: "uri" | "message" | "postback"; value: string }>
  >([]);
  const [richInlineKeyboard, setRichInlineKeyboard] = useState<
    Array<Array<{ text: string; callbackData: string }>>
  >([]);
  const [sendingRich, setSendingRich] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [liveForm, setLiveForm] = useState({ channelId: "", title: "", description: "" });
  const [pollForm, setPollForm] = useState({ question: "", options: "" });
  const [liveTab, setLiveTab] = useState<"qna" | "polls">("qna");
  const [liveLoading, setLiveLoading] = useState(false);

  const [faqForm, setFaqForm] = useState({ question: "", answer: "", keywords: "" });
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqItems, setFaqItems] = useState<FaqEntry[]>([]);

  const [engagementForm, setEngagementForm] = useState({
    text: "",
    intervalMinutes: 60,
    channelId: "",
  });
  const [engagementPlatform, setEngagementPlatform] = useState<"line" | "telegram">("line");
  const [editingEngagementId, setEditingEngagementId] = useState<string | null>(null);
  const [engagementItems, setEngagementItems] = useState<EngagementMessage[]>([]);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [previewPlatform, setPreviewPlatform] = useState<"line" | "telegram">("line");

  const tenant = import.meta.env.VITE_TENANT || "bn9";
  const apiBase = getApiBase();

  // ช่องค้นหา sessions
  const [sessionQuery, setSessionQuery] = useState("");

  // filter platform
  const [platformFilter, setPlatformFilter] =
    useState<PlatformFilterValue>("all");

  const messagesRef = useRef<HTMLDivElement | null>(null);

  const fetchSessions = useCallback(
    async (botId: string, preferSessionId?: string | null) => {
      try {
        setLoadingSessions(true);
        setError(null);
        const data = await getChatSessions(botId, 50);
        setSessions(data);

        const preferId = preferSessionId || selectedSession?.id || null;
        const nextSession = preferId
          ? data.find((s) => s.id === preferId) ?? data[0] ?? null
          : data[0] ?? null;

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
    [selectedSession?.id]
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

  const loadAutomation = useCallback(
    async (botId: string) => {
      try {
        setAutomationLoading(true);
        setAutomationError(null);
        const [faqRes, engRes] = await Promise.all([
          getFaqEntries(botId),
          getEngagementMessages(botId),
        ]);
        setFaqItems(faqRes || []);
        setEngagementItems(engRes || []);
      } catch (err) {
        console.error(err);
        setAutomationError("โหลดข้อมูลบอทไม่สำเร็จ");
        setFaqItems([]);
        setEngagementItems([]);
      } finally {
        setAutomationLoading(false);
      }
    },
    []
  );

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
        setFaqItems([]);
        setEngagementItems([]);
        return;
      }
      await fetchSessions(selectedBotId);
      await loadAutomation(selectedBotId);
    };

    void loadSessions();
  }, [selectedBotId, fetchSessions, loadAutomation]);

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

  useEffect(() => {
    if (selectedSession?.platform) {
      setRichPlatform(selectedSession.platform);
    }
  }, [selectedSession?.platform]);

  /* -------------------------- Metrics SSE monitor -------------------------- */

  useEffect(() => {
    const base = apiBase.replace(/\/$/, "");
    const url = `${base}/metrics/stream`;
    const es = new EventSource(url);

    const handleMetrics = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data || "{}") as MetricsSnapshot;
        setMetrics(data);
      } catch (err) {
        console.warn("[ChatCenter metrics SSE parse]", err);
      }
    };

    es.addEventListener("metrics", handleMetrics);

    es.onerror = () => {
      console.warn("[ChatCenter metrics SSE] connection error");
    };

    return () => {
      es.removeEventListener("metrics", handleMetrics as any);
      try {
        es.close();
      } catch (err) {
        console.warn("[ChatCenter metrics SSE close]", err);
      }
    };
  }, [apiBase]);

  /* -------------------------- Live stream SSE --------------------------- */
  const reloadLive = useCallback(async () => {
    try {
      setLiveLoading(true);
      const resp = await getLiveSummary();
      setLiveStreams(resp.streams || []);
    } catch (err) {
      console.warn("[ChatCenter live summary]", err);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadLive();
  }, [reloadLive]);

  useEffect(() => {
    const base = apiBase.replace(/\/$/, "");
    const url = `${base}/live/${encodeURIComponent(tenant)}`;
    const es = new EventSource(url);

    const handleStart = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data || "{}") as { stream: LiveStream };
        if (!data?.stream) return;
        setLiveStreams((prev) => [data.stream, ...prev]);
      } catch (err) {
        console.warn("[ChatCenter live:start parse]", err);
      }
    };
    const handleQna = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data || "{}") as { question: LiveQuestion };
        if (!data?.question) return;
        setLiveStreams((prev) => {
          return prev.map((s) =>
            s.id === data.question.liveStreamId
              ? { ...s, questions: [...(s.questions || []), data.question] }
              : s
          );
        });
      } catch (err) {
        console.warn("[ChatCenter live:qna parse]", err);
      }
    };
    const handlePoll = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data || "{}") as { poll: LivePoll };
        if (!data?.poll) return;
        setLiveStreams((prev) => {
          return prev.map((s) =>
            s.id === data.poll.liveStreamId
              ? { ...s, polls: [...(s.polls || []), data.poll] }
              : s
          );
        });
      } catch (err) {
        console.warn("[ChatCenter live:poll parse]", err);
      }
    };

    es.addEventListener("live:start", handleStart);
    es.addEventListener("live:qna:new", handleQna);
    es.addEventListener("live:poll:new", handlePoll);

    return () => {
      es.removeEventListener("live:start", handleStart as any);
      es.removeEventListener("live:qna:new", handleQna as any);
      es.removeEventListener("live:poll:new", handlePoll as any);
      es.close();
    };
  }, [apiBase, tenant]);

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

  /* ----------------------------- handlers ----------------------------- */

  const handleSelectSession = (s: ChatSession) => {
    setSelectedSession(s);
    setReplyText("");
    setSearchResults(null);
    setSelectedConversationId(s.id);
    setConversationPage(1);
  };

  const handleSendReply = async () => {
    if (!selectedSession) return;
    const text = replyText.trim();
    const attUrl = attachmentUrl.trim();

    if (!text && !attUrl) {
      toast.error("กรุณาใส่ข้อความหรือแนบลิงก์ไฟล์ก่อนส่ง");
      return;
    }

    let attachmentMeta: unknown = undefined;
    if (attachmentMetaInput.trim()) {
      try {
        attachmentMeta = JSON.parse(attachmentMetaInput);
      } catch (err) {
        toast.error("รูปแบบ Attachment meta ต้องเป็น JSON ที่ถูกต้อง");
        return;
      }
    }

    try {
      setSending(true);
      setError(null);

      const res = await replyChatSession(selectedSession.id, {
        text,
        type: replyType,
        attachmentUrl: attUrl || undefined,
        attachmentMeta,
      });

      if (res.ok && res.message) {
        // ✅ ดึงออกมาใส่ตัวแปรแยก เพื่อให้ TS เห็นว่าเป็น ChatMessage ชัวร์
        const newMessage: ChatMessage = res.message;
        setMessages((prev) => [...prev, newMessage]);
        toast.success("ส่งข้อความสำเร็จ");
      } else if (!res.ok && res.error) {
        setError(`ส่งข้อความไม่สำเร็จ: ${res.error}`);
        toast.error("ส่งข้อความไม่สำเร็จ");
      }

      setReplyText("");
      setAttachmentUrl("");
      setAttachmentMetaInput("");
    } catch (e) {
      console.error(e);
      setError("ส่งข้อความไม่สำเร็จ");
      toast.error("ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  const handleAddRichButton = () => {
    setRichButtons((prev) => [
      ...prev,
      { label: "ปุ่ม", action: "uri", value: "https://example.com" },
    ]);
  };

  const handleUpdateRichButton = (
    idx: number,
    key: "label" | "action" | "value",
    value: string
  ) => {
    setRichButtons((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], [key]: value } as any;
      return next;
    });
  };

  const handleAddInlineRow = () => {
    setRichInlineKeyboard((prev) => [...prev, [{ text: "ปุ่ม", callbackData: "cb" }]]);
  };

  const handleAddInlineButton = (rowIdx: number) => {
    setRichInlineKeyboard((prev) => {
      const rows = prev.map((r) => [...r]);
      if (!rows[rowIdx]) rows[rowIdx] = [];
      rows[rowIdx].push({ text: "ปุ่มใหม่", callbackData: "cb" });
      return rows;
    });
  };

  const handleUpdateInlineButton = (
    rowIdx: number,
    btnIdx: number,
    field: "text" | "callbackData",
    value: string
  ) => {
    setRichInlineKeyboard((prev) => {
      const rows = prev.map((r) => [...r]);
      if (!rows[rowIdx] || !rows[rowIdx][btnIdx]) return prev;
      rows[rowIdx][btnIdx] = { ...rows[rowIdx][btnIdx], [field]: value };
      return rows;
    });
  };

  const resetRichComposer = () => {
    setRichTitle("");
    setRichBody("");
    setRichImageUrl("");
    setRichAltText("");
    setRichButtons([]);
    setRichInlineKeyboard([]);
  };

  const handleSendRich = async () => {
    if (!selectedSession) {
      toast.error("กรุณาเลือกห้องแชทก่อน");
      return;
    }
    if (!richTitle.trim() || !richBody.trim()) {
      toast.error("กรุณากรอกหัวข้อและเนื้อหา");
      return;
    }

    setSendingRich(true);
    try {
      const payload = {
        sessionId: selectedSession.id,
        platform: richPlatform,
        title: richTitle.trim(),
        body: richBody.trim(),
        imageUrl: richImageUrl.trim() || undefined,
        altText: richAltText.trim() || undefined,
        buttons: richButtons.filter((b) => b.label.trim() && b.value.trim()),
        inlineKeyboard:
          richPlatform === "telegram"
            ? richInlineKeyboard
                .map((row) =>
                  row.filter((b) => b.text.trim() && b.callbackData.trim())
                )
                .filter((row) => row.length > 0)
            : undefined,
      };

      const res = await sendRichMessage(payload);
      if (res.ok) {
        toast.success("ส่ง Rich Message สำเร็จ");
        resetRichComposer();
        await fetchMessages(selectedSession.id);
      } else {
        toast.error("ส่ง Rich Message ไม่สำเร็จ");
      }
    } catch (err) {
      console.error("send rich error", err);
      toast.error("ส่ง Rich Message ไม่สำเร็จ");
    } finally {
      setSendingRich(false);
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

  const handleStartLive = async () => {
    try {
      if (!liveForm.channelId || !liveForm.title) {
        toast.error("กรอก channelId และ title ก่อน");
        return;
      }
      await startTelegramLive(liveForm);
      toast.success("เริ่ม Live stream แล้ว");
      void reloadLive();
    } catch (err) {
      console.error(err);
      toast.error("เริ่ม Live ไม่สำเร็จ");
    }
  };

  const handleCreatePoll = async () => {
    const active = liveStreams[0];
    if (!active) {
      toast.error("ยังไม่มี Live stream");
      return;
    }
    const opts = pollForm.options
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (opts.length < 2) {
      toast.error("ระบุตัวเลือกอย่างน้อย 2 ตัว");
      return;
    }
    try {
      await createLivePoll({
        liveStreamId: active.id,
        question: pollForm.question,
        options: opts,
        channelId: active.channelId,
      });
      toast.success("สร้าง Poll แล้ว");
      setPollForm({ question: "", options: "" });
    } catch (err) {
      console.error(err);
      toast.error("สร้าง Poll ไม่สำเร็จ");
    }
  };

  const handleSearchSubmit: React.FormEventHandler<HTMLFormElement> = async (
    e
  ) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) {
      setSearchResults(null);
      if (selectedSession) {
        await fetchMessages(selectedSession.id);
      }
      return;
    }

    try {
      setSearching(true);
      const items = await searchChatMessages({
        q,
        botId: selectedBotId,
        limit: 200,
      });
      setSearchResults(items);
      toast.success(`พบ ${items.length} ข้อความที่ตรงกับคำค้นหา`);
    } catch (err) {
      console.error("search error", err);
      toast.error("ค้นหาข้อความไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  };

  const resetFaqForm = () => {
    setFaqForm({ question: "", answer: "", keywords: "" });
    setEditingFaqId(null);
  };

  const handleSaveFaq = async () => {
    if (!selectedBotId) {
      toast.error("กรุณาเลือกบอทก่อน");
      return;
    }
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      toast.error("กรอกคำถามและคำตอบให้ครบ");
      return;
    }
    try {
      setAutomationLoading(true);
      const payload = {
        botId: selectedBotId,
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        keywords: faqForm.keywords
          ? faqForm.keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
          : [],
      };
      if (editingFaqId) {
        const updated = await updateFaqEntry(editingFaqId, payload);
        setFaqItems((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        toast.success("อัปเดต FAQ แล้ว");
      } else {
        const created = await createFaqEntry(payload);
        setFaqItems((prev) => [created, ...prev]);
        toast.success("เพิ่ม FAQ แล้ว");
      }
      resetFaqForm();
    } catch (err) {
      console.error(err);
      toast.error("บันทึก FAQ ไม่สำเร็จ");
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    try {
      await deleteFaqEntry(id);
      setFaqItems((prev) => prev.filter((f) => f.id !== id));
      toast.success("ลบ FAQ แล้ว");
    } catch (err) {
      console.error(err);
      toast.error("ลบ FAQ ไม่สำเร็จ");
    }
  };

  const handleSaveEngagement = async () => {
    if (!selectedBotId) {
      toast.error("กรุณาเลือกบอทก่อน");
      return;
    }
    if (!engagementForm.text.trim() || !engagementForm.channelId.trim()) {
      toast.error("กรอกข้อความและ channel ให้ครบ");
      return;
    }
    try {
      setAutomationLoading(true);
      const payload = {
        botId: selectedBotId,
        platform: engagementPlatform,
        channelId: engagementForm.channelId.trim(),
        text: engagementForm.text.trim(),
        intervalMinutes: Number(engagementForm.intervalMinutes) || 60,
        enabled: automationEnabled,
      };
      if (editingEngagementId) {
        const updated = await updateEngagementMessage(editingEngagementId, payload);
        setEngagementItems((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
        );
        toast.success("อัปเดต Engagement แล้ว");
      } else {
        const created = await createEngagementMessage(payload);
        setEngagementItems((prev) => [created, ...prev]);
        toast.success("เพิ่ม Engagement แล้ว");
      }
      setEngagementForm({ text: "", intervalMinutes: 60, channelId: "" });
      setEditingEngagementId(null);
    } catch (err) {
      console.error(err);
      toast.error("บันทึก Engagement ไม่สำเร็จ");
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleToggleEngagement = async (
    item: EngagementMessage,
    next: boolean
  ) => {
    try {
      setAutomationLoading(true);
      const updated = await updateEngagementMessage(item.id, { enabled: next });
      setEngagementItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, ...updated } : m))
      );
      toast.success(next ? "เปิดบอทแล้ว" : "ปิดบอทแล้ว");
    } catch (err) {
      console.error(err);
      toast.error("สลับสถานะไม่สำเร็จ");
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleDeleteEngagement = async (id: string) => {
    try {
      await deleteEngagementMessage(id);
      setEngagementItems((prev) => prev.filter((m) => m.id !== id));
      toast.success("ลบ Engagement แล้ว");
    } catch (err) {
      console.error(err);
      toast.error("ลบ Engagement ไม่สำเร็จ");
    }
  };

  const handleClearSearch = async () => {
    setSearchTerm("");
    setSearchResults(null);
    if (selectedSession) {
      await fetchMessages(selectedSession.id);
    }
  };

  const currentBot = bots.find((b) => b.id === selectedBotId) || null;

  /* ------------------------- filter ห้องแชทตาม query + platform ------------------------- */

  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    return sessions.filter((s) => {
      // filter platform
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

      // filter text
      if (!q) return true;
      const name = (s.displayName || "").toLowerCase();
      const uid = (s.userId || "").toLowerCase();
      return name.includes(q) || uid.includes(q);
    });
  }, [sessions, sessionQuery, platformFilter]);

  const normalizedMessages = useMemo(
    () =>
      (searchResults ?? messages).map((m) => ({
        ...m,
        conversationId: m.conversationId || m.sessionId,
      })),
    [messages, searchResults]
  );

  const conversationGroups = useMemo<ConversationGroup[]>(() => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of normalizedMessages) {
      const cid = m.conversationId || m.sessionId || "unknown";
      const prev = map.get(cid) ?? [];
      prev.push(m);
      map.set(cid, prev);
    }

    const groups = Array.from(map.entries()).map(([conversationId, msgs]) => {
      const sorted = [...msgs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const latest = sorted[sorted.length - 1];
      return {
        conversationId,
        messages: sorted,
        latestAt: latest ? new Date(latest.createdAt).getTime() : 0,
        session: latest?.session,
        platform: latest?.platform ?? latest?.session?.platform ?? null,
        botId: latest?.botId ?? latest?.session?.botId ?? null,
        displayName: latest?.session?.displayName ?? undefined,
        userId: latest?.session?.userId ?? undefined,
      };
    });

    return groups.sort((a, b) => b.latestAt - a.latestAt);
  }, [normalizedMessages]);

  useEffect(() => {
    if (conversationGroups.length === 0) {
      setSelectedConversationId(null);
      setConversationPage(1);
      return;
    }
    setSelectedConversationId((prev) => {
      if (prev && conversationGroups.some((c) => c.conversationId === prev)) {
        return prev;
      }
      return conversationGroups[0]?.conversationId ?? null;
    });
    setConversationPage(1);
  }, [conversationGroups]);

  const activeConversation = useMemo(() => {
    if (!selectedConversationId) return conversationGroups[0] ?? null;
    return (
      conversationGroups.find((c) => c.conversationId === selectedConversationId) ??
      conversationGroups[0] ??
      null
    );
  }, [conversationGroups, selectedConversationId]);

  const totalPages = useMemo(() => {
    if (!activeConversation) return 1;
    return Math.max(1, Math.ceil(activeConversation.messages.length / PAGE_SIZE));
  }, [activeConversation]);

  useEffect(() => {
    setConversationPage((prev) => {
      if (prev > totalPages) return totalPages;
      return prev;
    });
  }, [totalPages]);

  const pagedMessages = useMemo(() => {
    if (!activeConversation) return [] as ChatMessage[];
    const start = (conversationPage - 1) * PAGE_SIZE;
    return activeConversation.messages.slice(start, start + PAGE_SIZE);
  }, [activeConversation, conversationPage]);

  /* ------------------------- group messages by day ------------------------- */

  const messagesWithDateHeader = useMemo(() => {
    const result: Array<
      ChatMessage & { _showDateHeader?: boolean; _dateLabel?: string }
    > = [];
    let lastDateKey = "";
    for (const m of pagedMessages) {
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
  }, [pagedMessages]);

  /* ---------------- scroll ลงล่างเมื่อมีข้อความใหม่ ---------------- */

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [pagedMessages.length, selectedConversationId, conversationPage]);

  /* ------------------------- helper แปลง platform เป็น label ------------------------- */

  const conversationLabel = (c: ConversationGroup) =>
    c.displayName || c.userId || c.conversationId;

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

  const isSearchMode = Boolean(searchResults);

  const channelMetrics = useMemo(
    () => Object.entries(metrics?.perChannel ?? {}),
    [metrics?.perChannel]
  );
  const channelMetricsData = useMemo(
    () =>
      channelMetrics.map(([channelId, stats]) => ({
        channelId,
        sent: stats.sent ?? 0,
        errors: stats.errors ?? 0,
      })),
    [channelMetrics]
  );
  const maxChannelSent = useMemo(() => {
    return channelMetrics.reduce((acc, [, v]) => Math.max(acc, v.sent || 0), 1);
  }, [channelMetrics]);

  const previewFaq = useMemo(() => faqItems[0] ?? null, [faqItems]);
  const previewEngagement = useMemo(
    () => engagementItems.find((m) => m.enabled) ?? engagementItems[0] ?? null,
    [engagementItems]
  );
  const botLogs = useMemo(
    () =>
      (messages || [])
        .filter((m) => m.senderType === "bot")
        .slice(-8)
        .reverse(),
    [messages]
  );

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

      {/* Metrics overview */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-1">Deliveries</div>
          <div className="text-2xl font-semibold text-emerald-300">
            {metrics?.deliveryTotal ?? 0}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            realtime via SSE (/metrics/stream)
          </div>
        </div>
        <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-1">Errors</div>
          <div className="text-2xl font-semibold text-rose-300">
            {metrics?.errorTotal ?? 0}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            รวมข้อผิดพลาดจากการส่งข้อความ
          </div>
        </div>
        <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-400 mb-1">Last update</div>
          <div className="text-lg font-semibold text-zinc-100">
            {metrics?.updatedAt
              ? new Date(metrics.updatedAt).toLocaleTimeString()
              : "-"}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            base: {apiBase.replace(/https?:\/\//, "")}
          </div>
        </div>
      </div>

      {/* Live Stream Control */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-zinc-100">Telegram Live Stream</div>
              <div className="text-[11px] text-zinc-500">ควบคุม Live ในช่อง Telegram + Q&A/Poll</div>
            </div>
            {liveLoading && <span className="text-xs text-zinc-400">กำลังโหลด...</span>}
          </div>
          <div className="grid md:grid-cols-2 gap-2 text-xs">
            <input
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
              placeholder="Channel ID"
              value={liveForm.channelId}
              onChange={(e) => setLiveForm((p) => ({ ...p, channelId: e.target.value }))}
            />
            <input
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
              placeholder="Title"
              value={liveForm.title}
              onChange={(e) => setLiveForm((p) => ({ ...p, title: e.target.value }))}
            />
            <input
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 md:col-span-2"
              placeholder="Description"
              value={liveForm.description}
              onChange={(e) => setLiveForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500"
              type="button"
              onClick={handleStartLive}
            >
              เริ่ม Live
            </button>
            <button
              className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 text-xs border border-zinc-700"
              type="button"
              onClick={() => void reloadLive()}
            >
              รีเฟรช
            </button>
          </div>
          <div className="border border-zinc-800 rounded-lg p-3 bg-black/30 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold">สตรีมล่าสุด</div>
              <div className="flex gap-2 text-[10px]">
                <button
                  className={`px-2 py-1 rounded ${liveTab === "qna" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-200"}`}
                  onClick={() => setLiveTab("qna")}
                >
                  Q&A
                </button>
                <button
                  className={`px-2 py-1 rounded ${liveTab === "polls" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-200"}`}
                  onClick={() => setLiveTab("polls")}
                >
                  Polls
                </button>
              </div>
            </div>
            {liveStreams.length === 0 ? (
              <div className="text-zinc-400">ยังไม่มี Live stream</div>
            ) : (
              <div className="space-y-2">
                {liveStreams.map((s) => (
                  <div key={s.id} className="p-2 rounded border border-zinc-800 bg-zinc-900/70">
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-semibold text-zinc-100">{s.title}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-700/30 border border-emerald-700 text-emerald-200">
                        {s.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">Channel: {s.channelId}</div>
                    {liveTab === "qna" ? (
                      <div className="space-y-1 mt-1">
                        {(s.questions || []).slice(-5).map((q) => (
                          <div key={q.id} className="text-[11px] text-zinc-200 flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-sky-700/30 text-sky-100">Q</span>
                            <span>{q.question}</span>
                          </div>
                        ))}
                        {(s.questions || []).length === 0 && (
                          <div className="text-zinc-500 text-[11px]">ยังไม่มีคำถาม</div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 mt-1">
                        {(s.polls || []).slice(-3).map((p) => (
                          <div key={p.id} className="text-[11px] text-zinc-200 space-y-1">
                            <div className="font-semibold">{p.question}</div>
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(p.options)
                                ? (p.options as string[]).map((opt, idx) => (
                                    <span
                                      key={`${p.id}-${idx}`}
                                      className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700"
                                    >
                                      {opt}
                                    </span>
                                  ))
                                : null}
                            </div>
                          </div>
                        ))}
                        {(s.polls || []).length === 0 && (
                          <div className="text-zinc-500 text-[11px]">ยังไม่มี Poll</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="font-semibold text-sm text-zinc-100">สร้าง Poll / Q&A</div>
          <div className="text-[11px] text-zinc-500">เลือกสตรีมล่าสุดอัตโนมัติ</div>
          <input
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
            placeholder="คำถามสำหรับ Poll"
            value={pollForm.question}
            onChange={(e) => setPollForm((p) => ({ ...p, question: e.target.value }))}
          />
          <input
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
            placeholder="ตัวเลือก (คั่นด้วยคอมมา)"
            value={pollForm.options}
            onChange={(e) => setPollForm((p) => ({ ...p, options: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreatePoll}
              className="px-3 py-2 rounded bg-blue-600 text-white text-xs hover:bg-blue-500"
            >
              สร้าง Poll
            </button>
            <button
              type="button"
              onClick={() => {
                const active = liveStreams[0];
                if (!active) {
                  toast.error("ยังไม่มี Live stream");
                  return;
                }
                void submitLiveQuestion({
                  liveStreamId: active.id,
                  question: pollForm.question || "คำถามจาก Admin",
                });
                toast.success("ส่งคำถามตัวอย่าง");
              }}
              className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 text-xs border border-zinc-700"
            >
              ส่ง Q&A (mock)
            </button>
          </div>
        </div>
      </div>

      {/* FAQ & Engagement Bot Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-zinc-100">
                Bot Settings (FAQ & Engagement)
              </div>
              <div className="text-xs text-zinc-500">
                ปรับ FAQ/ข้อความกระตุ้น พร้อมสลับเปิดปิดบอทต่อ group/channel
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-zinc-400">แพลตฟอร์ม</span>
                <select
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
                  value={engagementPlatform}
                  onChange={(e) => {
                    const val = e.target.value === "telegram" ? "telegram" : "line";
                    setEngagementPlatform(val);
                    setPreviewPlatform(val);
                  }}
                >
                  <option value="line">LINE</option>
                  <option value="telegram">Telegram</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="rounded border-zinc-700 bg-zinc-900"
                  checked={automationEnabled}
                  onChange={(e) => setAutomationEnabled(e.target.checked)}
                />
                <span className="text-zinc-400">เปิดบอท</span>
              </label>
            </div>
          </div>

          {automationError && (
            <div className="text-xs text-red-300 bg-red-900/30 border border-red-700 rounded px-3 py-2">
              {automationError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-zinc-200">FAQ</div>
                {editingFaqId && (
                  <button
                    type="button"
                    className="text-[11px] text-emerald-300 hover:text-emerald-200"
                    onClick={resetFaqForm}
                  >
                    เริ่มใหม่
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="คำถาม"
                  value={faqForm.question}
                  onChange={(e) => setFaqForm((p) => ({ ...p, question: e.target.value }))}
                />
                <textarea
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm min-h-[72px]"
                  placeholder="คำตอบ"
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm((p) => ({ ...p, answer: e.target.value }))}
                />
                <input
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="คีย์เวิร์ด (คั่นด้วยคอมมา)"
                  value={faqForm.keywords}
                  onChange={(e) => setFaqForm((p) => ({ ...p, keywords: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveFaq}
                    className="px-3 py-2 rounded bg-emerald-600 text-white text-xs disabled:opacity-60"
                    disabled={automationLoading}
                  >
                    {editingFaqId ? "อัปเดต FAQ" : "เพิ่ม FAQ"}
                  </button>
                  <button
                    type="button"
                    onClick={resetFaqForm}
                    className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 text-xs border border-zinc-700"
                  >
                    ล้างฟอร์ม
                  </button>
                </div>
              </div>
              <FaqList
                items={faqItems}
                loading={automationLoading}
                onEdit={(item) => {
                  setEditingFaqId(item.id);
                  setFaqForm({
                    question: item.question,
                    answer: item.answer,
                    keywords: Array.isArray(item.keywords)
                      ? (item.keywords as string[]).join(", ")
                      : "",
                  });
                }}
                onDelete={handleDeleteFaq}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-zinc-200">Engagement</div>
                {editingEngagementId && (
                  <button
                    type="button"
                    className="text-[11px] text-emerald-300 hover:text-emerald-200"
                    onClick={() => {
                      setEditingEngagementId(null);
                      setEngagementForm({ text: "", intervalMinutes: 60, channelId: "" });
                    }}
                  >
                    เริ่มใหม่
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="Channel/Group ID"
                  value={engagementForm.channelId}
                  onChange={(e) =>
                    setEngagementForm((p) => ({ ...p, channelId: e.target.value }))
                  }
                />
                <textarea
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm min-h-[72px]"
                  placeholder="ข้อความที่จะโพสต์"
                  value={engagementForm.text}
                  onChange={(e) => setEngagementForm((p) => ({ ...p, text: e.target.value }))}
                />
                <input
                  type="number"
                  min={1}
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="Interval (นาที)"
                  value={engagementForm.intervalMinutes}
                  onChange={(e) =>
                    setEngagementForm((p) => ({
                      ...p,
                      intervalMinutes: Number(e.target.value) || 1,
                    }))
                  }
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveEngagement}
                    className="px-3 py-2 rounded bg-indigo-600 text-white text-xs disabled:opacity-60"
                    disabled={automationLoading}
                  >
                    {editingEngagementId ? "อัปเดตข้อความ" : "เพิ่มข้อความ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEngagementForm({ text: "", intervalMinutes: 60, channelId: "" });
                      setEditingEngagementId(null);
                    }}
                    className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 text-xs border border-zinc-700"
                  >
                    ล้างฟอร์ม
                  </button>
                </div>
              </div>
              <EngagementList
                items={engagementItems}
                loading={automationLoading}
                onToggle={handleToggleEngagement}
                onEdit={(item) => {
                  setEditingEngagementId(item.id);
                  setEngagementPlatform(
                    item.platform === "telegram" ? "telegram" : "line"
                  );
                  setEngagementForm({
                    channelId: item.channelId,
                    text: item.text,
                    intervalMinutes: item.intervalMinutes,
                  });
                }}
                onDelete={handleDeleteEngagement}
              />
            </div>
          </div>
        </div>

        <div className="bg-[#0f1113] border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-zinc-100">Preview & Logs</div>
              <div className="text-xs text-zinc-500">ดูตัวอย่างข้อความบอทและบันทึกล่าสุด</div>
            </div>
            <select
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
              value={previewPlatform}
              onChange={(e) =>
                setPreviewPlatform(e.target.value === "telegram" ? "telegram" : "line")
              }
            >
              <option value="line">LINE</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>

          <BotPreviewCard
            platform={previewPlatform}
            sampleFaq={previewFaq}
            sampleEngagement={previewEngagement}
          />

          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-100">บันทึกการตอบกลับ (Bot)</div>
            <div className="text-[11px] text-zinc-500">แสดง 8 รายการล่าสุด</div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {botLogs.length === 0 ? (
                <div className="text-xs text-zinc-400">ยังไม่มี log จากบอท</div>
              ) : (
                botLogs.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/70 text-sm"
                  >
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                      <span>{platformLabel(m.platform)}</span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-zinc-200 whitespace-pre-line">
                      {m.text || "(ไม่มีข้อความ)"}
                    </div>
                    {m.meta && (m.meta as any).faqId && (
                      <div className="text-[11px] text-emerald-300 mt-1">
                        FAQ: {(m.meta as any).faqId}
                      </div>
                    )}
                    {m.meta && (m.meta as any).engagementId && (
                      <div className="text-[11px] text-emerald-300 mt-1">
                        Engagement: {(m.meta as any).engagementId}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#14171a] border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm text-zinc-100">
            Per-channel deliveries
          </div>
          <div className="text-[11px] text-zinc-500">
            platform:bot grouped
          </div>
        </div>
        {channelMetrics.length === 0 ? (
          <div className="text-xs text-zinc-400">ยังไม่มีข้อมูล</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelMetricsData} margin={{ top: 8, right: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="channelId" tick={{ fontSize: 10, fill: "#a1a1aa" }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#18181b" }} contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8 }} />
                <Bar dataKey="sent" fill="#34d399" radius={[4, 4, 0, 0]} name="Sent" />
                <Bar dataKey="errors" fill="#f87171" radius={[4, 4, 0, 0]} name="Errors" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
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
              value={sessionQuery}
              onChange={(e) => setSessionQuery(e.target.value)}
            />
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
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1 min-w-[200px]">
              <div className="font-semibold text-sm">
                {isSearchMode
                  ? `ผลการค้นหา (${searchResults?.length ?? 0})`
                  : selectedSession
                    ? selectedSession.displayName || selectedSession.userId
                    : "ไม่มีห้องแชทที่เลือก"}
              </div>
              {!isSearchMode && selectedSession && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>
                    platform: {platformLabel(selectedSession.platform)}
                  </span>
                  <IntentBadge code={selectedSessionIntentCode} />
                </div>
              )}
            </div>

            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 text-xs"
            >
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาข้อความ..."
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1 text-xs text-zinc-100 w-56"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs disabled:opacity-60"
              >
                {searching ? "ค้นหา..." : "ค้นหา"}
              </button>
              {isSearchMode && (
                <button
                  type="button"
                  onClick={() => void handleClearSearch()}
                  className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-xs"
                >
                  ล้างคำค้น
                </button>
              )}
            </form>
          </div>

          {error && (
            <div className="px-4 py-2 text-xs text-red-400 border-b border-zinc-800">
              {error}
            </div>
          )}

          <div className="px-4 py-3 border-b border-zinc-800 bg-black/10 flex flex-col gap-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-zinc-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-400">สนทนา:</span>
                {activeConversation ? (
                  <span className="font-medium">
                    {conversationLabel(activeConversation)}
                  </span>
                ) : (
                  <span className="text-zinc-500">-</span>
                )}
                {activeConversation?.platform && (
                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[11px]">
                    {platformLabel(activeConversation.platform)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">
                  หน้า {conversationPage} / {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setConversationPage((p) => Math.max(1, p - 1))
                    }
                    disabled={conversationPage <= 1}
                    className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 text-[11px] disabled:opacity-50"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConversationPage((p) =>
                        Math.min(totalPages, p + 1)
                      )
                    }
                    disabled={conversationPage >= totalPages}
                    className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 text-[11px] disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pt-1">
              {conversationGroups.length === 0 && (
                <span className="text-[11px] text-zinc-500">ไม่มีข้อความ</span>
              )}
              {conversationGroups.map((c) => {
                const isActive = c.conversationId === selectedConversationId;
                return (
                  <button
                    key={c.conversationId}
                    type="button"
                    onClick={() => {
                      setSelectedConversationId(c.conversationId);
                      setConversationPage(1);
                    }}
                    className={`px-3 py-2 rounded-lg border text-left text-[11px] min-w-[180px] transition ${
                      isActive
                        ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-100"
                        : "border-zinc-700 bg-zinc-900 text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs">
                        {conversationLabel(c)}
                      </span>
                      {c.platform && (
                        <span className="px-2 py-0.5 rounded-full bg-black/30 border border-white/10 text-[10px]">
                          {platformLabel(c.platform)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                      {c.messages.length} ข้อความ
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            ref={messagesRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm min-h-0"
          >
            {loadingMessages && !isSearchMode && (
              <div className="text-zinc-400 text-xs">
                กำลังโหลดข้อความ...
              </div>
            )}

            {!loadingMessages &&
              !isSearchMode &&
              selectedSession &&
              (!activeConversation || activeConversation.messages.length === 0) && (
              <div className="text-zinc-400 text-xs">
                ยังไม่มีข้อความในห้องนี้
              </div>
            )}

            {!isSearchMode && !selectedSession && (
              <div className="text-zinc-500 text-xs">
                กรุณาเลือกลูกค้าจากด้านซ้ายเพื่อดูประวัติแชท
              </div>
            )}

            {isSearchMode && searchResults && searchResults.length === 0 && (
              <div className="text-zinc-400 text-xs">
                ไม่พบข้อความที่ตรงกับคำค้นหา
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

              const msgTypeRaw = (m.type as string) || m.messageType || "TEXT";
              const msgType = msgTypeRaw.toString().toUpperCase();
              const isTextMsg = msgType === "TEXT";

              let content: React.ReactNode = null;

              if (isTextMsg) {
                content = m.text || "";
              } else if (msgType === "IMAGE" && m.attachmentUrl) {
                content = (
                  <div className="space-y-2">
                    {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                    <a
                      href={m.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={m.attachmentUrl}
                        alt="attachment"
                        className="max-h-64 rounded-lg border border-white/10"
                      />
                    </a>
                  </div>
                );
              } else if (msgType === "FILE") {
                const fileName =
                  (m.attachmentMeta as any)?.fileName || "ไฟล์แนบ";
                content = (
                  <div className="space-y-1">
                    {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                    <a
                      href={m.attachmentUrl || "#"}
                      target={m.attachmentUrl ? "_blank" : undefined}
                      rel="noreferrer"
                      className="underline text-emerald-200"
                    >
                      {fileName}
                    </a>
                  </div>
                );
              } else if (msgType === "RICH") {
                const meta: any = m.attachmentMeta || {};
                const cards: any[] =
                  meta?.contents?.contents || meta?.cards || (meta?.contents ? [meta.contents] : []);
                content = (
                  <div className="space-y-2">
                    {m.text && <div className="font-semibold whitespace-pre-line">{m.text}</div>}
                    {cards.length > 0 && (
                      <div className="space-y-2">
                        {cards.slice(0, 3).map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded border border-white/10 bg-black/20 space-y-1"
                          >
                            {c.hero?.url && (
                              <img
                                src={c.hero.url}
                                alt="rich"
                                className="rounded border border-white/10 max-h-40"
                              />
                            )}
                            {c.body?.contents?.[0]?.text && (
                              <div className="font-semibold text-sm">{c.body.contents[0].text}</div>
                            )}
                            {c.body?.contents?.[1]?.text && (
                              <div className="text-xs text-zinc-300 whitespace-pre-line">
                                {c.body.contents[1].text}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {!cards.length && meta && (
                      <pre className="text-[10px] bg-black/30 p-2 rounded border border-white/10 overflow-x-auto">
                        {JSON.stringify(meta, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              } else if (msgType === "INLINE_KEYBOARD") {
                const rows: any[] = (m.attachmentMeta as any)?.inlineKeyboard || [];
                content = (
                  <div className="space-y-2">
                    {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                    {rows.length > 0 && (
                      <div className="space-y-1">
                        {rows.map((row, idx) => (
                          <div key={idx} className="flex flex-wrap gap-2">
                            {row.map((btn: any, bidx: number) => (
                              <span
                                key={`${idx}-${bidx}`}
                                className="px-2 py-1 rounded bg-sky-700 text-white text-[11px]"
                              >
                                {btn.text || "ปุ่ม"}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              } else {
                content = (
                  <div className="space-y-1">
                    {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                    <span className="px-2 py-1 rounded bg-black/30 border border-white/10 text-[11px]">
                      {msgType || "MESSAGE"}
                    </span>
                  </div>
                );
              }

              const msgIntentCode = getMessageIntentCode(m);
              const msgIntentLabel = intentCodeToLabel(msgIntentCode);
              const messagePlatform = platformLabel(
                m.platform || m.session?.platform || selectedSession?.platform
              );
              const sessionLabel = isSearchMode
                ? m.session?.displayName ||
                  m.session?.userId ||
                  m.session?.id ||
                  ""
                : null;

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
                    <div className={`max-w-[70%] flex flex-col gap-1`}>
                      {sessionLabel && (
                        <div className="text-[11px] text-zinc-400">
                          {sessionLabel} {messagePlatform ? `(${messagePlatform})` : ""}
                        </div>
                      )}
                      <div
                        className={`px-3 py-2 rounded-2xl ${bubble} whitespace-pre-line`}
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
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Rich / Inline Keyboard Composer */}
          <div className="px-4 py-4 border-t border-zinc-800 bg-black/20 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-semibold text-sm">ส่ง Rich Message / Inline Keyboard</div>
                <div className="text-xs text-zinc-400">
                  LINE ใช้ Flex Message, Telegram ใช้ Inline Keyboard
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-2">
                  แพลตฟอร์ม
                  <select
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                    value={richPlatform}
                    onChange={(e) => setRichPlatform(e.target.value)}
                    disabled={sendingRich}
                  >
                    <option value="line">LINE</option>
                    <option value="telegram">Telegram</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2 text-xs text-zinc-200">
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="หัวข้อ"
                  value={richTitle}
                  onChange={(e) => setRichTitle(e.target.value)}
                  disabled={sendingRich}
                />
                <textarea
                  className="w-full min-h-[80px] bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="เนื้อหา"
                  value={richBody}
                  onChange={(e) => setRichBody(e.target.value)}
                  disabled={sendingRich}
                />
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="ลิงก์รูปภาพ (ถ้ามี)"
                  value={richImageUrl}
                  onChange={(e) => setRichImageUrl(e.target.value)}
                  disabled={sendingRich}
                />
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="ALT text (สำหรับ LINE Flex)"
                  value={richAltText}
                  onChange={(e) => setRichAltText(e.target.value)}
                  disabled={sendingRich}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">ปุ่ม (Flex)</span>
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] bg-zinc-800 rounded border border-zinc-700"
                      onClick={handleAddRichButton}
                      disabled={sendingRich}
                    >
                      + เพิ่มปุ่ม
                    </button>
                  </div>
                  {richButtons.length === 0 && (
                    <div className="text-zinc-500 text-[11px]">ยังไม่มีปุ่ม</div>
                  )}
                  {richButtons.map((btn, idx) => (
                    <div
                      key={`${idx}-${btn.label}`}
                      className="grid grid-cols-3 gap-2 items-center"
                    >
                      <input
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px]"
                        placeholder="label"
                        value={btn.label}
                        onChange={(e) => handleUpdateRichButton(idx, "label", e.target.value)}
                        disabled={sendingRich}
                      />
                      <select
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px]"
                        value={btn.action}
                        onChange={(e) =>
                          handleUpdateRichButton(idx, "action", e.target.value as any)
                        }
                        disabled={sendingRich}
                      >
                        <option value="uri">URI</option>
                        <option value="message">Message</option>
                        <option value="postback">Postback</option>
                      </select>
                      <input
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] col-span-1"
                        placeholder="ค่า"
                        value={btn.value}
                        onChange={(e) => handleUpdateRichButton(idx, "value", e.target.value)}
                        disabled={sendingRich}
                      />
                    </div>
                  ))}
                </div>

                {richPlatform === "telegram" && (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">Inline Keyboard</span>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] bg-zinc-800 rounded border border-zinc-700"
                        onClick={handleAddInlineRow}
                        disabled={sendingRich}
                      >
                        + เพิ่มแถว
                      </button>
                    </div>
                    {richInlineKeyboard.length === 0 && (
                      <div className="text-[11px] text-zinc-500">ยังไม่มีปุ่ม</div>
                    )}
                    {richInlineKeyboard.map((row, rowIdx) => (
                      <div key={`row-${rowIdx}`} className="space-y-1 p-2 bg-zinc-900 rounded border border-zinc-800">
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span>แถว {rowIdx + 1}</span>
                          <button
                            type="button"
                            className="px-2 py-1 bg-zinc-800 rounded border border-zinc-700"
                            onClick={() => handleAddInlineButton(rowIdx)}
                            disabled={sendingRich}
                          >
                            + ปุ่ม
                          </button>
                        </div>
                        <div className="space-y-1">
                          {row.map((btn, btnIdx) => (
                            <div key={`btn-${rowIdx}-${btnIdx}`} className="grid grid-cols-2 gap-2">
                              <input
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px]"
                                placeholder="ข้อความปุ่ม"
                                value={btn.text}
                                onChange={(e) =>
                                  handleUpdateInlineButton(rowIdx, btnIdx, "text", e.target.value)
                                }
                                disabled={sendingRich}
                              />
                              <input
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px]"
                                placeholder="callback_data"
                                value={btn.callbackData}
                                onChange={(e) =>
                                  handleUpdateInlineButton(rowIdx, btnIdx, "callbackData", e.target.value)
                                }
                                disabled={sendingRich}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleSendRich}
                    disabled={sendingRich || !selectedSession}
                    className="px-4 py-2 rounded bg-emerald-600 text-white text-xs disabled:opacity-50"
                  >
                    {sendingRich ? "กำลังส่ง..." : "ส่ง Rich Message"}
                  </button>
                  <button
                    type="button"
                    onClick={resetRichComposer}
                    className="px-3 py-2 rounded bg-zinc-800 text-xs"
                  >
                    ล้างฟอร์ม
                  </button>
                </div>
              </div>

              <div className="p-3 border border-zinc-800 rounded-lg bg-zinc-950/60 text-xs text-zinc-200 space-y-2">
                <div className="font-semibold text-sm">ตัวอย่าง Preview</div>
                <div className="border border-zinc-800 rounded-lg p-3 bg-black/30 space-y-2">
                  <div className="text-sm font-bold">{richTitle || "(หัวข้อ)"}</div>
                  <div className="text-xs text-zinc-300 whitespace-pre-line">
                    {richBody || "รายละเอียด"}
                  </div>
                  {richImageUrl && (
                    <img
                      src={richImageUrl}
                      alt="preview"
                      className="rounded border border-white/10 max-h-48"
                    />
                  )}
                  {richButtons.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {richButtons.map((b, idx) => (
                        <span
                          key={`${b.label}-${idx}`}
                          className="px-2 py-1 rounded bg-emerald-700 text-white text-[11px]"
                        >
                          {b.label || "ปุ่ม"}
                        </span>
                      ))}
                    </div>
                  )}
                  {richPlatform === "telegram" && richInlineKeyboard.length > 0 && (
                    <div className="space-y-1">
                      {richInlineKeyboard.map((row, idx) => (
                        <div key={`preview-row-${idx}`} className="flex gap-2">
                          {row.map((btn, bidx) => (
                            <span
                              key={`preview-btn-${idx}-${bidx}`}
                              className="px-2 py-1 rounded bg-sky-700 text-white text-[11px]"
                            >
                              {btn.text || "ปุ่ม"}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* เครื่องมือแนบไฟล์/ประเภทข้อความ */}
          <div className="px-4 py-3 border-t border-zinc-800 flex flex-col gap-2 text-xs bg-black/20">
            <div className="flex flex-col md:flex-row gap-2">
              <label className="flex items-center gap-2 text-zinc-300">
                ประเภทข้อความ
                <select
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
                  value={replyType}
                  onChange={(e) => setReplyType(e.target.value as MessageType)}
                  disabled={sending}
                >
                  <option value="TEXT">TEXT</option>
                  <option value="IMAGE">IMAGE</option>
                  <option value="FILE">FILE</option>
                  <option value="STICKER">STICKER</option>
                  <option value="SYSTEM">SYSTEM</option>
                </select>
              </label>

              <input
                type="text"
                className="flex-1 border border-zinc-700 bg-zinc-900 rounded px-3 py-1 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="ลิงก์ไฟล์/รูป (ถ้ามี)"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                disabled={sending}
              />
            </div>
            <input
              type="text"
              className="border border-zinc-700 bg-zinc-900 rounded px-3 py-1 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder={'Attachment meta (JSON) เช่น {"fileName":"image.png"}'}
              value={attachmentMetaInput}
              onChange={(e) => setAttachmentMetaInput(e.target.value)}
              disabled={sending}
            />
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
                !selectedSession ||
                sending ||
                (replyText.trim().length === 0 && attachmentUrl.trim().length === 0)
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
