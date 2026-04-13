import { useState, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatHome from "./components/ChatHome";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import "./App.css";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text) => {
    const content = text || input;
    if (!content.trim() || isLoading) return;

    setChatStarted(true);
    setInput("");

    const userMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // TODO: connect to backend API
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Backend not connected yet. This is a placeholder response." },
      ]);
      setIsLoading(false);
    }, 1000);
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
          <ChatMessages messages={messages} isLoading={isLoading} messagesEndRef={messagesEndRef} />
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
