"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUICK_ANSWERS } from "@/lib/chatbotKnowledge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "こんにちは！営業支援AIアシスタントです。\n\nシステムの使い方や、より効果的な営業メールを作成するコツについてお気軽にご質問ください。",
  },
];

const QUICK_SUGGESTIONS = Object.keys(QUICK_ANSWERS);

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageText.trim(),
      };

      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);

      try {
        // 定型質問かチェック
        const quickAnswer = QUICK_ANSWERS[messageText.trim()];

        if (quickAnswer) {
          // 定型回答を疑似ストリーミングで表示（API不要）
          let index = 0;
          const interval = setInterval(() => {
            index += 3; // 3文字ずつ表示
            const chunk = quickAnswer.slice(0, index);

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId ? { ...m, content: chunk } : m,
              ),
            );

            if (index >= quickAnswer.length) {
              clearInterval(interval);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: quickAnswer, isStreaming: false }
                    : m,
                ),
              );
              setIsLoading(false);
            }
          }, 20); // 20msごとに更新
        } else {
          // カスタム質問 → API呼び出し
          const chatHistory = [
            ...messages.filter((m) => m.id !== "welcome"),
            userMessage,
          ].map((m) => ({
            role: m.role,
            content: m.content,
          }));

          const response = await fetch("/api/ai/chatbot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: chatHistory }),
          });

          if (!response.ok) {
            throw new Error("API request failed");
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No reader available");

          const decoder = new TextDecoder();
          let accumulatedContent = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedContent += chunk;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: accumulatedContent }
                  : m,
              ),
            );
          }

          // ストリーミング完了
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
            ),
          );
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Chatbot error:", error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    "申し訳ございません。エラーが発生しました。しばらくしてから再度お試しください。",
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsLoading(false);
      }
    },
    [messages, isLoading],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // IME変換中は送信しない
      if (isComposing || e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  return (
    <>
      {/* フローティングチャットボタン */}
      <div className="fixed bottom-6 right-6 z-50 group/fab">
        {!isOpen && (
          <div className="pointer-events-none absolute bottom-16 right-0 w-52 rounded-xl border border-white/10 bg-gray-900 px-3 py-2.5 shadow-xl opacity-0 translate-y-1 transition-all duration-200 group-hover/fab:opacity-100 group-hover/fab:translate-y-0">
            <p className="text-xs font-semibold text-white leading-snug">
              AIアシスタント
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400 leading-snug">
              使い方の質問や営業メールの相談をどうぞ
            </p>
            <div className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 rounded-sm border-b border-r border-white/10 bg-gray-900" />
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-110",
            isOpen
              ? "bg-gray-600 text-white"
              : "bg-gradient-to-r from-blue-500 to-purple-600 text-white",
          )}
          aria-label={isOpen ? "チャットを閉じる" : "チャットを開く"}
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* チャットウィンドウ */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 flex h-[80vh] max-h-[800px] w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-gray-700 dark:bg-gray-900",
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        {/* ヘッダー */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">AIアシスタント</h3>
            <p className="text-xs text-white/80">営業支援サポート</p>
          </div>
        </div>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
                  )}
                >
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => (
                          <p className="mb-1.5 last:mb-0 leading-relaxed">
                            {children}
                          </p>
                        ),
                        h1: ({ children }) => (
                          <p className="mb-1.5 font-bold text-base">
                            {children}
                          </p>
                        ),
                        h2: ({ children }) => (
                          <p className="mb-1.5 font-bold">{children}</p>
                        ),
                        h3: ({ children }) => (
                          <p className="mb-1 font-semibold">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-1.5 ml-4 list-disc space-y-0.5">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-1.5 ml-4 list-decimal space-y-0.5">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="leading-relaxed">{children}</li>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold">{children}</strong>
                        ),
                        code: ({ children }) => (
                          <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mb-1.5 overflow-x-auto rounded-lg bg-black/10 p-3 font-mono text-xs dark:bg-white/10">
                            {children}
                          </pre>
                        ),
                        hr: () => (
                          <hr className="my-2 border-current opacity-20" />
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline opacity-80 hover:opacity-100"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  )}
                  {message.isStreaming && (
                    <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* クイック提案（常時表示） */}
          {!isLoading && (
            <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                よくある質問:
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    disabled={isLoading}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 入力エリア */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-200 p-3 dark:border-gray-700"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="メッセージを入力..."
              rows={1}
              className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="h-10 w-10 shrink-0 rounded-xl bg-blue-500 hover:bg-blue-600"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
