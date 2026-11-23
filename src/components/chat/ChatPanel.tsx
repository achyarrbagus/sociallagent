"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Square, Trash2 } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AgentCharacter } from "@/components/agents/AgentCharacter";
import { Button } from "@/components/ui/button";
import type { CharacterState } from "@/lib/agent-appearance";
import { clearChat } from "@/lib/chat/actions";

type AgentInfo = { id: string; name: string; title: string; paletteId: string; paused: boolean; isDirector: boolean };

const TOOL_LABELS: Record<string, string> = {
  listBrands: "Membaca brand & campaign",
  listContent: "Membaca daftar konten",
  getContent: "Membaca detail konten",
  listTeam: "Melihat tim",
  recentActivity: "Melihat aktivitas",
  upcomingPosts: "Melihat jadwal posting",
  createIdea: "Membuat ide konten",
  assignTask: "Memberi tugas produksi",
};

const SUGGESTIONS = {
  director: ["Apa prioritas minggu ini?", "Konten apa yang menunggu review saya?", "Buatkan 3 ide konten untuk campaign aktif"],
  specialist: ["Apa yang bisa kamu bantu?", "Review caption konten terbaru", "Beri ide hook untuk brand saya"],
};

export function ChatPanel({ slug, agent, agents, initialMessages }: {
  slug: string; agent: AgentInfo; agents: { id: string; name: string }[]; initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [clearing, startClear] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    id: `${slug}:${agent.id}`,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/chat/${slug}/${agent.id}`,
      prepareSendMessagesRequest: ({ messages: all }) => ({ body: { message: all[all.length - 1] } }),
    }),
    // Tools may have created ideas or tasks; refresh server data around the chat.
    onFinish: () => router.refresh(),
  });
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";
  const last = messages[messages.length - 1];
  const usingTool = busy && last?.role === "assistant" && last.parts.some((p) => isToolUIPart(p) && p.state !== "output-available");
  const mood: CharacterState = error ? "confused" : status === "submitted" ? "thinking" : usingTool ? "working" : busy ? "listening" : "idle";

  function send(text: string) {
    if (!text.trim() || busy || agent.paused) return;
    void sendMessage({ text: text.trim() });
    setInput("");
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
  };
  const agentName = (id: unknown) => agents.find((a) => a.id === id)?.name;

  return <section className="flex min-h-[70dvh] flex-col rounded-lg border bg-card" aria-label={`Chat dengan ${agent.name}`}>
    <header className="flex items-center gap-3 border-b p-3">
      <AgentCharacter paletteId={agent.paletteId} name={agent.name} size={48} state={mood} followCursor={false} label={agent.name} />
      <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{agent.name}</h2>
        <p className="truncate text-xs text-muted-foreground">{agent.isDirector ? "Board chat · " : ""}{agent.title}{busy ? " · sedang mengetik…" : ""}</p></div>
      {messages.length > 0 && <Button size="sm" variant="ghost" disabled={busy || clearing} aria-label="Bersihkan percakapan"
        onClick={() => startClear(async () => { await clearChat(slug, agent.id); setMessages([]); })}><Trash2 className="size-4" /></Button>}
    </header>

    <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
      {!messages.length && <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">{agent.isDirector ? `Ngobrol dengan ${agent.name} soal prioritas, review, dan pembagian kerja tim.` : `Tanya ${agent.name} soal ${agent.title.toLowerCase()}.`}</p>
        <div className="flex flex-wrap justify-center gap-2">{(agent.isDirector ? SUGGESTIONS.director : SUGGESTIONS.specialist).map((s) =>
          <button key={s} type="button" onClick={() => send(s)} disabled={busy || agent.paused} className="rounded-full border bg-background px-3 py-1 text-sm hover:bg-accent">{s}</button>)}</div>
      </div>}
      {messages.map((m) => <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
        {m.role === "assistant" && <AgentAvatar paletteId={agent.paletteId} name={agent.name} size={32} className="mt-1" />}
        <div className={m.role === "user" ? "max-w-[80%] rounded-2xl border bg-[var(--sa-accent-soft)] px-3 py-2 text-sm text-[var(--sa-ink)]" : "min-w-0 max-w-[85%] space-y-2"}>
          {m.parts.map((part, i) => {
            if (part.type === "text") return m.role === "user"
              ? <p key={i} className="whitespace-pre-wrap">{part.text}</p>
              : <div key={i} className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown></div>;
            if (isToolUIPart(part)) {
              const name = getToolName(part);
              const output = part.state === "output-available" ? part.output as Record<string, unknown> | null : null;
              const failed = part.state === "output-error" || (output && typeof output === "object" && "error" in output);
              return <div key={i} className="w-fit rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                {TOOL_LABELS[name] ?? name}{part.state === "output-available" ? (failed ? " · gagal" : " · selesai") : part.state === "output-error" ? " · gagal" : "…"}
                {name === "createIdea" && output?.contentId && !failed ? <> · <a className="underline" href={`/${slug}/content/${String(output.contentId)}`}>buka ide</a></> : null}
                {name === "assignTask" && output?.assignedTo && !failed ? ` → ${String(output.assignedTo)}` : null}
                {name === "assignTask" && part.state !== "output-available" && part.input && typeof part.input === "object" && "agentId" in part.input ? ` → ${agentName(part.input.agentId) ?? ""}` : null}
              </div>;
            }
            return null;
          })}
        </div>
      </div>)}
      {status === "submitted" && <p className="text-sm text-muted-foreground">{agent.name} sedang berpikir…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error.message || "Agent belum bisa menjawab. Coba lagi."}</p>}
      <div ref={bottom} />
    </div>

    <form onSubmit={onSubmit} className="flex items-end gap-2 border-t p-3">
      <label htmlFor="chat-input" className="sr-only">Pesan untuk {agent.name}</label>
      <textarea id="chat-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} disabled={agent.paused}
        placeholder={agent.paused ? `${agent.name} sedang dijeda` : `Tulis pesan untuk ${agent.name}…`} maxLength={8000}
        className="min-h-11 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm" />
      {busy ? <Button type="button" variant="outline" onClick={() => void stop()} aria-label="Hentikan"><Square className="size-4" /></Button>
        : <Button type="submit" disabled={!input.trim() || agent.paused} aria-label="Kirim"><ArrowUp className="size-4" /></Button>}
    </form>
  </section>;
}
