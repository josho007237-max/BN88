// src/pages/Knowledge.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  addBotKnowledge,
  createKnowledgeChunk,
  createKnowledgeDoc,
  deleteKnowledgeChunk,
  deleteKnowledgeDoc,
  getBots,
  getKnowledgeDoc,
  listKnowledgeChunks,
  listKnowledgeDocs,
  removeBotKnowledge,
  updateKnowledgeChunk,
  updateKnowledgeDoc,
  type BotItem,
  type KnowledgeChunk,
  type KnowledgeDoc,
  type KnowledgeDocDetail,
} from "../lib/api";

type DocFormState = {
  title: string;
  tags: string;
  body: string;
  status: string;
};

type ChunkFormState = {
  content: string;
  tokens: number;
};

const defaultDocForm: DocFormState = {
  title: "",
  tags: "",
  body: "",
  status: "active",
};

const defaultChunkForm: ChunkFormState = {
  content: "",
  tokens: 0,
};

export default function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeDocDetail | null>(null);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBot, setSelectedBot] = useState<string>("");
  const [filters, setFilters] = useState({ q: "", status: "" });

  const [createForm, setCreateForm] = useState<DocFormState>({ ...defaultDocForm });
  const [editForm, setEditForm] = useState<DocFormState>({ ...defaultDocForm });
  const [chunkForm, setChunkForm] = useState<ChunkFormState>({ ...defaultChunkForm });
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editingChunkContent, setEditingChunkContent] = useState<string>("");
  const [editingChunkTokens, setEditingChunkTokens] = useState<number>(0);

  const loadBots = useCallback(async () => {
    const res = await getBots();
    setBots(res.items || []);
  }, []);

  const loadDocs = useCallback(
    async (opts?: { keepSelection?: boolean }) => {
      const res = await listKnowledgeDocs({
        q: filters.q || undefined,
        status: filters.status || undefined,
      });
      setDocs(res.items || []);

      if (!opts?.keepSelection) {
        const firstId = res.items?.[0]?.id;
        if (firstId) {
          setSelectedId(firstId);
        }
      }
    },
    [filters]
  );

  const loadDetail = useCallback(
    async (docId: string) => {
      if (!docId) return;
      setSelectedId(docId);
      const res = await getKnowledgeDoc(docId);
      const item = res.item;
      setDetail(item);
      setEditForm({
        title: item.title,
        tags: item.tags || "",
        body: item.body || "",
        status: item.status || "active",
      });
      setSelectedBot(item.bots?.[0]?.botId || "");
    },
    []
  );

  const loadChunksForDoc = useCallback(async (docId: string) => {
    if (!docId) return;
    const res = await listKnowledgeChunks(docId);
    setChunks(res.items || []);
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      loadChunksForDoc(selectedId);
    }
  }, [selectedId, loadDetail, loadChunksForDoc]);

  const currentDocBots = useMemo(() => {
    if (!detail) return [] as { botId: string; name: string; platform: string }[];
    return (detail.bots || []).map((b) => {
      const bot = bots.find((x) => x.id === b.botId);
      return {
        botId: b.botId,
        name: bot?.name || b.botId,
        platform: bot?.platform || "-",
      };
    });
  }, [detail, bots]);

  const availableBots = useMemo(
    () => bots.filter((b) => !currentDocBots.some((c) => c.botId === b.id)),
    [bots, currentDocBots]
  );

  const handleCreateDoc = async () => {
    if (!createForm.title.trim()) return toast.error("กรุณากรอกชื่อเอกสาร");
    await createKnowledgeDoc(createForm);
    toast.success("สร้างเอกสารแล้ว");
    setCreateForm({ ...defaultDocForm });
    await loadDocs();
  };

  const handleUpdateDoc = async () => {
    if (!selectedId) return;
    await updateKnowledgeDoc(selectedId, editForm);
    toast.success("บันทึกเอกสารแล้ว");
    await loadDocs({ keepSelection: true });
    await loadDetail(selectedId);
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!docId) return;
    if (!confirm("ยืนยันลบเอกสารนี้?")) return;
    await deleteKnowledgeDoc(docId);
    toast.success("ลบเอกสารแล้ว");
    setDetail(null);
    setChunks([]);
    await loadDocs();
  };

  const handleAddChunk = async () => {
    if (!selectedId) return;
    if (!chunkForm.content.trim()) return toast.error("กรุณากรอกเนื้อหา");
    await createKnowledgeChunk(selectedId, {
      content: chunkForm.content,
      tokens: chunkForm.tokens,
    });
    setChunkForm({ ...defaultChunkForm });
    toast.success("เพิ่ม chunk แล้ว");
    await loadChunksForDoc(selectedId);
  };

  const startEditChunk = (c: KnowledgeChunk) => {
    setEditingChunkId(c.id);
    setEditingChunkContent(c.content || "");
    setEditingChunkTokens(c.tokens || 0);
  };

  const handleSaveChunk = async () => {
    if (!editingChunkId) return;
    await updateKnowledgeChunk(editingChunkId, {
      content: editingChunkContent,
      tokens: editingChunkTokens,
    });
    toast.success("บันทึก chunk แล้ว");
    setEditingChunkId(null);
    if (selectedId) await loadChunksForDoc(selectedId);
  };

  const handleDeleteChunk = async (chunkId: string) => {
    if (!selectedId) return;
    if (!confirm("ยืนยันลบ chunk นี้?")) return;
    await deleteKnowledgeChunk(chunkId);
    toast.success("ลบ chunk แล้ว");
    await loadChunksForDoc(selectedId);
  };

  const handleAddBot = async () => {
    if (!selectedId || !selectedBot) return;
    await addBotKnowledge(selectedBot, selectedId);
    toast.success("ผูกบอทแล้ว");
    await loadDetail(selectedId);
  };

  const handleRemoveBot = async (botId: string) => {
    if (!selectedId) return;
    await removeBotKnowledge(botId, selectedId);
    toast.success("ถอดบอทแล้ว");
    await loadDetail(selectedId);
  };

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[360px,1fr]">
      {/* Left: list & create */}
      <div className="bg-[#131519] border border-neutral-800 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Knowledge Docs</h2>
          <p className="text-sm text-neutral-400">จัดการเอกสารและ FAQ</p>
        </div>

        <div className="flex flex-col gap-2">
          <input
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2"
            placeholder="ค้นหา"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">ทุกสถานะ</option>
            <option value="active">active</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select>
          <button
            className="bg-neutral-800 hover:bg-neutral-700 rounded px-3 py-2 text-sm"
            onClick={() => loadDocs()}
          >
            รีเฟรชรายการ
          </button>
        </div>

        <div className="border-t border-neutral-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">เอกสารทั้งหมด</div>
            <div className="text-xs text-neutral-400">{docs.length} รายการ</div>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => loadDetail(doc.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                  selectedId === doc.id
                    ? "border-indigo-500/60 bg-indigo-500/10"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-sm">{doc.title}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-200 uppercase">
                    {doc.status}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 line-clamp-2">{doc.body}</div>
                {doc._count && (
                  <div className="text-[11px] text-neutral-500 mt-1">
                    {doc._count.chunks} chunks • {doc._count.bots} bots
                  </div>
                )}
              </button>
            ))}
            {docs.length === 0 && (
              <div className="text-sm text-neutral-500">ยังไม่มีเอกสาร</div>
            )}
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-3 space-y-2">
          <div className="font-semibold text-sm">สร้างเอกสารใหม่</div>
          <input
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2"
            placeholder="ชื่อเอกสาร"
            value={createForm.title}
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2"
            placeholder="แท็ก (เช่น faq, policy)"
            value={createForm.tags}
            onChange={(e) => setCreateForm((f) => ({ ...f, tags: e.target.value }))}
          />
          <textarea
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 min-h-[80px]"
            placeholder="คำอธิบาย/เนื้อหา"
            value={createForm.body}
            onChange={(e) => setCreateForm((f) => ({ ...f, body: e.target.value }))}
          />
          <button
            className="bg-green-600 hover:bg-green-500 text-white rounded px-3 py-2"
            onClick={handleCreateDoc}
          >
            + เพิ่มเอกสาร
          </button>
        </div>
      </div>

      {/* Right: detail */}
      <div className="space-y-4">
        {!detail && (
          <div className="border border-neutral-800 rounded-xl p-6 bg-[#0f1113] text-neutral-400">
            เลือกเอกสารทางซ้ายเพื่อเริ่มจัดการ
          </div>
        )}

        {detail && (
          <div className="space-y-4">
            <div className="border border-neutral-800 rounded-xl bg-[#0f1113] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{detail.title}</div>
                  <div className="text-sm text-neutral-400">แก้ไขรายละเอียดเอกสาร</div>
                </div>
                <button
                  className="text-sm text-red-400 hover:text-red-300"
                  onClick={() => handleDeleteDoc(detail.id)}
                >
                  ลบเอกสาร
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">ชื่อเอกสาร</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2"
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">แท็ก</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2"
                    value={editForm.tags}
                    onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">สถานะ</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm"
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">active</option>
                    <option value="draft">draft</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">สรุป</label>
                  <div className="text-sm text-neutral-300">
                    {detail._count?.chunks ?? 0} chunks • {detail._count?.bots ?? 0} bots
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-neutral-400">เนื้อหา/คำอธิบาย</label>
                <textarea
                  className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 min-h-[140px]"
                  value={editForm.body}
                  onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))}
                />
              </div>

              <div className="flex justify-end">
                <button
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2"
                  onClick={handleUpdateDoc}
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </div>

            {/* Chunks */}
            <div className="border border-neutral-800 rounded-xl bg-[#0f1113] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Knowledge Chunks</div>
                  <div className="text-sm text-neutral-400">จัดการข้อความตอบ/FAQ รายย่อย</div>
                </div>
                <div className="text-sm text-neutral-400">{chunks.length} รายการ</div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr,180px]">
                <textarea
                  className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 min-h-[80px]"
                  placeholder="เนื้อหา chunk"
                  value={chunkForm.content}
                  onChange={(e) =>
                    setChunkForm((f) => ({ ...f, content: e.target.value }))
                  }
                />
                <div className="flex items-start gap-2">
                  <input
                    type="number"
                    min={0}
                    className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 w-28"
                    value={chunkForm.tokens}
                    onChange={(e) =>
                      setChunkForm((f) => ({ ...f, tokens: Number(e.target.value) }))
                    }
                    placeholder="tokens"
                  />
                  <button
                    className="bg-green-600 hover:bg-green-500 text-white rounded px-3 py-2 text-sm"
                    onClick={handleAddChunk}
                  >
                    + เพิ่ม
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {chunks.map((c) => (
                  <div
                    key={c.id}
                    className="border border-neutral-800 rounded-lg p-3 bg-neutral-900"
                  >
                    {editingChunkId === c.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 min-h-[80px]"
                          value={editingChunkContent}
                          onChange={(e) => setEditingChunkContent(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 w-24 text-sm"
                            value={editingChunkTokens}
                            onChange={(e) => setEditingChunkTokens(Number(e.target.value))}
                          />
                          <button
                            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-3 py-1 text-sm"
                            onClick={handleSaveChunk}
                          >
                            บันทึก
                          </button>
                          <button
                            className="text-sm text-neutral-400"
                            onClick={() => setEditingChunkId(null)}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm whitespace-pre-wrap text-neutral-100">
                          {c.content}
                        </div>
                        <div className="text-xs text-neutral-400 flex items-center gap-3 mt-2">
                          <span>tokens: {c.tokens}</span>
                          <span>
                            อัปเดต: {new Date(c.updatedAt || c.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-sm">
                          <button
                            className="text-indigo-400 hover:text-indigo-300"
                            onClick={() => startEditChunk(c)}
                          >
                            แก้ไข
                          </button>
                          <button
                            className="text-red-400 hover:text-red-300"
                            onClick={() => handleDeleteChunk(c.id)}
                          >
                            ลบ
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {chunks.length === 0 && (
                  <div className="text-sm text-neutral-500">ยังไม่มี chunk</div>
                )}
              </div>
            </div>

            {/* Bot mapping */}
            <div className="border border-neutral-800 rounded-xl bg-[#0f1113] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">ใช้กับบอท</div>
                  <div className="text-sm text-neutral-400">ผูก/ถอดเอกสารกับบอท</div>
                </div>
                <div className="text-sm text-neutral-400">{currentDocBots.length} bots</div>
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                <select
                  className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm"
                  value={selectedBot}
                  onChange={(e) => setSelectedBot(e.target.value)}
                >
                  <option value="">เลือกบอท</option>
                  {availableBots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.platform})
                    </option>
                  ))}
                </select>
                <button
                  className="bg-neutral-800 hover:bg-neutral-700 rounded px-3 py-2 text-sm"
                  onClick={handleAddBot}
                  disabled={!selectedBot}
                >
                  ผูกบอท
                </button>
              </div>

              <div className="space-y-2">
                {currentDocBots.map((b) => (
                  <div
                    key={b.botId}
                    className="flex items-center justify-between border border-neutral-800 rounded px-3 py-2 bg-neutral-900"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{b.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 uppercase">
                        {b.platform}
                      </span>
                    </div>
                    <button
                      className="text-sm text-red-400 hover:text-red-300"
                      onClick={() => handleRemoveBot(b.botId)}
                    >
                      ถอด
                    </button>
                  </div>
                ))}
                {currentDocBots.length === 0 && (
                  <div className="text-sm text-neutral-500">ยังไม่ผูกกับบอทใด</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
