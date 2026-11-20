import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatTime } from "../lib/labels";
import type { ChatMessage } from "../types";

type Props = {
  title: string;
  subtitle?: string;
  /** Фото собеседника; без него показываем инициалы. */
  avatar?: string;
  thread: ChatMessage[];
  /** Чья это сторона: свои сообщения справа. */
  self: ChatMessage["from"];
  /** Подпись «печатает…», если собеседник отвечает. */
  typingLabel?: string;
  emptyText: string;
  onBack: () => void;
  onSend: (text: string) => void;
};

/** Переписка клиента и психолога; используется в обоих кабинетах. */
export function ChatThread({
  title,
  subtitle,
  avatar,
  thread,
  self,
  typingLabel,
  emptyText,
  onBack,
  onSend,
}: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [thread.length, typingLabel]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  }

  const initials = title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <>
      <div className="chat-head">
        <button className="chat-back" onClick={onBack} aria-label="Назад к чатам">
          ←
        </button>
        {avatar ? (
          <img className="avatar small" src={avatar} alt="" />
        ) : (
          <span className="avatar small initials">{initials}</span>
        )}
        <div className="grow">
          <strong>{title}</strong>
          {subtitle && <div className="hint">{subtitle}</div>}
        </div>
      </div>
      <div className="chat-messages" ref={listRef}>
        {thread.length === 0 && <p className="hint chat-empty">{emptyText}</p>}
        {thread.map((message) => (
          <div key={message.id} className={`msg ${message.from === self ? "mine" : "theirs"}`}>
            <div className="bubble">{message.text}</div>
            <span className="msg-time">{formatTime(message.createdAt)}</span>
          </div>
        ))}
        {typingLabel && <div className="hint">{typingLabel}</div>}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Сообщение"
          aria-label="Сообщение"
        />
        <button className="btn small" disabled={!draft.trim()}>
          Отправить
        </button>
      </form>
    </>
  );
}
