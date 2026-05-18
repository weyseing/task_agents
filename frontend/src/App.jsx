import { useState, useRef, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatHome from "./components/ChatHome";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import LoginPage from "./components/LoginPage";
import LoadingScreen from "./components/LoadingScreen";
import Topbar from "./components/Topbar";
import FilesPage from "./files/FilesPage";
import { apiFetch } from "./api";
import "./App.css";

// URL helpers: chat URL pattern is `/c/<conversation_id>`; `/` means new chat.
// `/files` renders the Files page; `/files/<file_id>` opens that file.
const CONV_URL_RE = /^\/c\/([a-f0-9-]+)\/?$/i;
const FILES_URL = "/files";
const FILES_URL_RE = /^\/files(?:\/([a-f0-9-]+))?\/?$/i;
const getConvIdFromUrl = () => {
  const m = window.location.pathname.match(CONV_URL_RE);
  return m ? m[1] : null;
};
const isFilesUrl = () => FILES_URL_RE.test(window.location.pathname);
const pushConvUrl = (id) => {
  const target = id ? `/c/${id}` : "/";
  if (window.location.pathname !== target) {
    window.history.pushState({ conversationId: id || null }, "", target);
  }
};
const pushFilesUrl = () => {
  if (!FILES_URL_RE.test(window.location.pathname)) {
    window.history.pushState({ files: true }, "", FILES_URL);
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [route, setRoute] = useState(() => (isFilesUrl() ? "files" : "chat"));
  const lastUserRef = useRef(null);

  const goToFiles = useCallback(() => {
    pushFilesUrl();
    setRoute("files");
  }, []);
  const goToChat = useCallback(() => {
    pushConvUrl(null);
    setRoute("chat");
    setMessages([]);
    setChatStarted(false);
    setConversationId(null);
  }, []);

  const [convHasMore, setConvHasMore] = useState(false);
  const [convNextBefore, setConvNextBefore] = useState(null);
  const [convLoadingMore, setConvLoadingMore] = useState(false);

  // First page on mount; subsequent pages via `loadMoreConversations`.
  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/conversations?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      // Accept both shapes (old plain-array AND new {items, …}) so an
      // older cached frontend doesn't break against a newer backend.
      const items = Array.isArray(data) ? data : data.items || [];
      setConversations(items);
      setConvHasMore(!!(data && data.has_more));
      setConvNextBefore((data && data.next_before) || null);
    } catch {}
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (!convHasMore || !convNextBefore || convLoadingMore) return;
    setConvLoadingMore(true);
    try {
      const res = await apiFetch(
        `/api/conversations?limit=50&before=${encodeURIComponent(convNextBefore)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const items = data.items || [];
      setConversations((prev) => [...prev, ...items]);
      setConvHasMore(!!data.has_more);
      setConvNextBefore(data.next_before || null);
    } catch {
      // swallow — non-fatal
    } finally {
      setConvLoadingMore(false);
    }
  }, [convHasMore, convNextBefore, convLoadingMore]);

  // On mount: check existing session. `?slowAuth=N` query param delays the
  // resolution by N seconds — handy for previewing the loading screen.
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/auth/me");
        if (res.ok) {
          setUser(await res.json());
        }
      } catch {}
      const delay = parseFloat(
        new URLSearchParams(window.location.search).get("slowAuth") || "0"
      );
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay * 1000));
      }
      setAuthChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (user) fetchConversations();
  }, [user, fetchConversations]);

  const loadConversation = useCallback(async (id, { pushUrl = true } = {}) => {
    try {
      const res = await apiFetch(`/api/conversations/${id}`);
      if (!res.ok) {
        // Bad id (404/403): always fix the URL, even on initial load.
        pushConvUrl(null);
        return;
      }
      const data = await res.json();
      setMessages(
        data.map((msg) => ({
          ...msg,
          tool_calls: msg.tool_calls?.map((tc) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
            status: "done",
            data: tc.result,
          })),
        }))
      );
      setConversationId(id);
      setChatStarted(true);
      if (pushUrl) pushConvUrl(id);
    } catch {}
  }, []);

  const renameConversation = async (id, title) => {
    try {
      await apiFetch(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch {}
  };

  const deleteConversation = async (id) => {
    try {
      await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
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
        const top = lastUserRef.current.offsetTop - 120;
        container.scrollTo({ top, behavior: "smooth" });
      }
    }, 100);

    try {
      const res = await apiFetch(`/api/chat`, {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          content,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let thinkingContent = "";
      let responseContent = "";
      let toolCalls = [];
      let steps = [];
      let added = false;
      let stillThinking = true;
      let thinkStartTime = null;
      let thinkDuration = null;

      const updateMessage = () => {
        const msg = {
          role: "assistant",
          content: responseContent,
          thinking: thinkingContent,
          tool_calls: toolCalls.length > 0 ? [...toolCalls] : undefined,
          steps: steps.length > 0 ? [...steps] : undefined,
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
      };

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
                pushConvUrl(parsed.conversation_id);
                fetchConversations();
              }
              continue;
            }

            if (parsed.step) {
              steps = [...steps, parsed.step];
              updateMessage();
            }
            if (parsed.thinking) {
              if (!thinkStartTime) thinkStartTime = Date.now();
              thinkingContent += parsed.thinking;
              updateMessage();
            }
            if (parsed.content) {
              if (stillThinking && thinkStartTime) {
                thinkDuration = ((Date.now() - thinkStartTime) / 1000).toFixed(1);
              }
              stillThinking = false;
              responseContent += parsed.content;
              updateMessage();
            }
            if (parsed.tool_call) {
              stillThinking = false;
              toolCalls = [...toolCalls, { ...parsed.tool_call, status: "running" }];
              updateMessage();
            }
            if (parsed.tool_result) {
              toolCalls = toolCalls.map((tc) =>
                tc.id === parsed.tool_result.id
                  ? { ...tc, status: "done", data: parsed.tool_result.data }
                  : tc
              );
              updateMessage();
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

  const handleNewChat = ({ pushUrl = true } = {}) => {
    setMessages([]);
    setChatStarted(false);
    setConversationId(null);
    setInput("");
    if (pushUrl) pushConvUrl(null);
  };

  // On first auth, if URL points at /c/<id>, load that conversation.
  useEffect(() => {
    if (!user) return;
    const id = getConvIdFromUrl();
    if (id) loadConversation(id, { pushUrl: false });
  }, [user, loadConversation]);

  // Browser back/forward — sync state to the URL we just landed on.
  useEffect(() => {
    const onPop = () => {
      if (isFilesUrl()) {
        setRoute("files");
        return;
      }
      setRoute("chat");
      const id = getConvIdFromUrl();
      if (id) loadConversation(id, { pushUrl: false });
      else handleNewChat({ pushUrl: false });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // handleNewChat reads only setters (stable) — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConversation]);

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
    setMessages([]);
    setConversations([]);
    setConversationId(null);
    setChatStarted(false);
  };

  if (!authChecked) return <LoadingScreen />;
  if (!user) return <LoginPage onSignedIn={setUser} />;

  if (route === "files") {
    return <FilesPage user={user} onNavChat={goToChat} onLogout={handleLogout} />;
  }

  const activeConversation = conversations.find((c) => c.id === conversationId);

  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const openMobileSidebar = () => setMobileSidebarOpen(true);

  const handleMobileSelect = (id) => {
    loadConversation(id);
    closeMobileSidebar();
  };
  const handleMobileNewChat = () => {
    handleNewChat();
    closeMobileSidebar();
  };

  return (
    <div className={`app${sidebarCollapsed ? " sidebar-collapsed" : ""}${mobileSidebarOpen ? " mobile-sidebar-open" : ""}`}>
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onMobileClose={closeMobileSidebar}
        onNewChat={handleMobileNewChat}
        onSelect={handleMobileSelect}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onNavFiles={() => { closeMobileSidebar(); goToFiles(); }}
        user={user}
        onLogout={handleLogout}
        hasMoreConversations={convHasMore}
        loadingMoreConversations={convLoadingMore}
        onLoadMoreConversations={loadMoreConversations}
      />
      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}
      <main className="main">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={openMobileSidebar}
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        {chatStarted && (
          <Topbar
            conversation={activeConversation}
            onRename={renameConversation}
          />
        )}
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
