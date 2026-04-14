import { useState, useRef, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatHome from "./components/ChatHome";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastUserRef = useRef(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`);
      const data = await res.json();
      setConversations(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const loadConversation = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${id}`);
      const data = await res.json();
      setMessages(data);
      setConversationId(id);
      setChatStarted(true);
    } catch {}
  };

  const renameConversation = async (id, title) => {
    try {
      await fetch(`${API_URL}/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch {}
  };

  const deleteConversation = async (id) => {
    try {
      await fetch(`${API_URL}/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        handleNewChat();
      }
    } catch {}
  };

  const sendMessage = async (text) => {
    const content = text || input;
    if (!content.trim() || isLoading) return;

    setChatStarted(true);
    setInput("");

    const userMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    setTimeout(() => {
      if (lastUserRef.current) {
        const container = lastUserRef.current.closest(".chat-messages");
        const top = lastUserRef.current.offsetTop - 40;
        container.scrollTo({ top, behavior: "smooth" });
      }
    }, 100);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          content,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let thinkingContent = "";
      let responseContent = "";
      let added = false;
      let stillThinking = true;
      let thinkStartTime = null;
      let thinkDuration = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));

        for (const line of lines) {
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);

            // First event contains conversation_id
            if (parsed.conversation_id) {
              setConversationId(parsed.conversation_id);
              if (parsed.is_new) {
                fetchConversations();
              }
              continue;
            }

            if (parsed.thinking) {
              if (!thinkStartTime) thinkStartTime = Date.now();
              thinkingContent += parsed.thinking;
            }
            if (parsed.content) {
              if (stillThinking && thinkStartTime) {
                thinkDuration = ((Date.now() - thinkStartTime) / 1000).toFixed(1);
              }
              stillThinking = false;
              responseContent += parsed.content;
            }
            if (parsed.thinking || parsed.content) {
              const msg = {
                role: "assistant",
                content: responseContent,
                thinking: thinkingContent,
                isThinking: stillThinking,
                thinkDuration,
              };
              if (!added) {
                added = true;
                setIsLoading(false);
                setIsStreaming(true);
                setMessages((prev) => [...prev, msg]);
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = msg;
                  return updated;
                });
              }
            }
          } catch {}
        }
      }

      // Refresh conversation list to update timestamps
      fetchConversations();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setChatStarted(false);
    setConversationId(null);
    setInput("");
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onNewChat={handleNewChat}
        onSelect={loadConversation}
        onRename={renameConversation}
        onDelete={deleteConversation}
      />
      <main className="main">
        {!chatStarted ? (
          <ChatHome onSend={sendMessage} />
        ) : (
          <ChatMessages messages={messages} isLoading={isLoading} isStreaming={isStreaming} lastUserRef={lastUserRef} />
        )}
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={() => sendMessage()}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}
