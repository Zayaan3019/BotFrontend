    import React, { useState, useEffect, useRef, useCallback } from 'react';
    import ReactMarkdown from 'react-markdown';
    import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
    import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
    import './App.css';

    // --- Helper Functions & Components ---

    const CodeBlock = ({ node, inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const handleCopy = () => {
        navigator.clipboard.writeText(String(children));
      };
      return !inline && match ? (
        <div className="code-block">
          <div className="code-header">
            <span>{match[1]}</span>
            <button onClick={handleCopy} className="copy-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy
            </button>
          </div>
          <SyntaxHighlighter
            children={String(children).replace(/\n$/, '')}
            style={vscDarkPlus}
            language={match[1]}
            PreTag="div"
            {...props}
          />
        </div>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    };

    const WelcomeScreen = ({ onExampleClick }) => (
      <div className="welcome-screen">
        <div className="logo">✨</div>
        <h1>AskMe Advanced</h1>
        <div className="example-prompts">
          <button onClick={() => onExampleClick('Write a python script to sort a list')}>Write a python script</button>
          <button onClick={() => onExampleClick('Explain quantum computing in simple terms')}>Explain quantum computing</button>
          <button onClick={() => onExampleClick('What are the main differences between React and Vue?')}>Compare React and Vue</button>
        </div>
      </div>
    );

    // --- Main App Component ---

    function App() {
      const [chats, setChats] = useState({});
      const [currentChatId, setCurrentChatId] = useState(null);
      const [input, setInput] = useState('');
      const [isGenerating, setIsGenerating] = useState(false);
      const [theme, setTheme] = useState('dark');
      const abortControllerRef = useRef(null);
      const textareaRef = useRef(null);
      const messagesEndRef = useRef(null);

      // Load chats and theme from local storage on initial render
      useEffect(() => {
        const savedChats = JSON.parse(localStorage.getItem('chats')) || {};
        setChats(savedChats);
        const savedTheme = localStorage.getItem('theme') || 'dark';
        setTheme(savedTheme);
        document.body.className = savedTheme;
        
        if(Object.keys(savedChats).length === 0) {
            handleNewChat();
        } else {
            setCurrentChatId(Object.keys(savedChats)[0]);
        }
      }, []);

      // Save chats and theme to local storage
      useEffect(() => {
        localStorage.setItem('chats', JSON.stringify(chats));
      }, [chats]);

      useEffect(() => {
        localStorage.setItem('theme', theme);
        document.body.className = theme;
      }, [theme]);

      // Auto-resize textarea
      useEffect(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      }, [input]);
      
      // Scroll to bottom
      useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, [chats, currentChatId, isGenerating]);


      const handleNewChat = useCallback(() => {
        if (isGenerating) abortControllerRef.current?.abort();
        const newChatId = Date.now().toString();
        const newChat = {
          title: 'New Conversation',
          messages: [{ role: 'model', content: "Hello! I'm your advanced AI assistant. How can I assist you today?" }]
        };
        setChats(prev => ({ [newChatId]: newChat, ...prev }));
        setCurrentChatId(newChatId);
      }, [isGenerating]);

      const handleDeleteChat = useCallback((chatId) => {
        const newChats = { ...chats };
        delete newChats[chatId];
        setChats(newChats);
        if (currentChatId === chatId) {
          const remainingChatIds = Object.keys(newChats);
          setCurrentChatId(remainingChatIds.length > 0 ? remainingChatIds[0] : null);
          if (remainingChatIds.length === 0) {
            handleNewChat();
          }
        }
      }, [chats, currentChatId, handleNewChat]);

      const handleSend = useCallback(async (messageContent) => {
        const content = messageContent || input;
        if (!content.trim() || isGenerating || !currentChatId) return;

        const userMessage = { role: 'user', content };
        const updatedChat = {
          ...chats[currentChatId],
          messages: [...chats[currentChatId].messages, userMessage],
        };
        
        // If it's the first user message, set the title
        if (chats[currentChatId].messages.length === 1) {
            updatedChat.title = content.substring(0, 40);
        }

        const newChats = { ...chats, [currentChatId]: updatedChat };
        setChats(newChats);
        setInput('');
        setIsGenerating(true);

        abortControllerRef.current = new AbortController();

        try {
          const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
          const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: updatedChat.messages }),
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok || !response.body) throw new Error('Network response was not ok.');
          
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let botMessage = { role: 'model', content: '' };
          
          // Add the empty bot message to start rendering
          setChats(prev => ({
              ...prev,
              [currentChatId]: {
                  ...prev[currentChatId],
                  messages: [...prev[currentChatId].messages, botMessage]
              }
          }));

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            botMessage.content += decoder.decode(value, { stream: true });
            
            setChats(prev => ({
                ...prev,
                [currentChatId]: {
                    ...prev[currentChatId],
                    messages: [...prev[currentChatId].messages.slice(0, -1), botMessage]
                }
            }));
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            const errorMessage = { role: 'model', content: 'An error occurred. Please try again.' };
             setChats(prev => ({
                ...prev,
                [currentChatId]: {
                    ...prev[currentChatId],
                    messages: [...prev[currentChatId].messages, errorMessage]
                }
            }));
          }
        } finally {
          setIsGenerating(false);
          abortControllerRef.current = null;
        }
      }, [input, isGenerating, currentChatId, chats]);

      const currentMessages = chats[currentChatId]?.messages || [];

      return (
        <div className="app-container">
          <aside className="sidebar">
            <div className="sidebar-header">
              <button className="sidebar-btn" onClick={handleNewChat}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14m-7-7h14" /></svg>
                New Chat
              </button>
              <button className="sidebar-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? 
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> :
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                }
              </button>
            </div>
            <nav className="chat-history">
              {Object.keys(chats).map(chatId => (
                <div 
                  key={chatId} 
                  className={`chat-history-item ${currentChatId === chatId ? 'active' : ''}`}
                  onClick={() => setCurrentChatId(chatId)}
                >
                  <span className="chat-title">{chats[chatId].title}</span>
                  <button onClick={(e) => {e.stopPropagation(); handleDeleteChat(chatId);}} className="delete-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                  </button>
                </div>
              ))}
            </nav>
          </aside>
          <main className="chat-main">
            {currentMessages.length <= 1 ? (
              <WelcomeScreen onExampleClick={handleSend} />
            ) : (
              <div className="message-list">
                {currentMessages.map((msg, index) => (
                  <div key={index} className={`message-wrapper ${msg.role}`}>
                    <div className="message-content">
                      <ReactMarkdown components={{ code: CodeBlock }} children={msg.content} />
                       {isGenerating && index === currentMessages.length - 1 && <div className="cursor" />}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
            <div className="input-area-wrapper">
              {isGenerating && (
                <button className="stop-btn" onClick={() => abortControllerRef.current?.abort()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"></path></svg>
                  Stop Generating
                </button>
              )}
              <div className="input-area">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask me anything..."
                  rows="1"
                  disabled={isGenerating}
                />
                <button onClick={() => handleSend()} disabled={isGenerating || !input.trim()} className="send-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </div>
            </div>
          </main>
        </div>
      );
    }

    export default App;