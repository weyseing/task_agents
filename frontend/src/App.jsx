import { useState, useRef } from "react";
import Sidebar from "./components/Sidebar";
import ChatHome from "./components/ChatHome";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import "./App.css";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const lastUserRef = useRef(null);

  const sendMessage = async (text) => {
    const content = text || input;
    if (!content.trim() || isLoading) return;

    setChatStarted(true);
    setInput("");

    const userMessage = { role: "user", content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    setTimeout(() => {
      if (lastUserRef.current) {
        const container = lastUserRef.current.closest(".chat-messages");
        const top = lastUserRef.current.offsetTop - 40;
        container.scrollTo({ top, behavior: "smooth" });
      }
    }, 100);

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
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
    setInput("");
  };

  return (
    <div className="app">
      <Sidebar onNewChat={handleNewChat} />
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
