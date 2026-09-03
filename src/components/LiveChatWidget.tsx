import React, { useState, useEffect, useRef } from 'react';
import {
  MessagesSquare,
  MessageCircle,
  X,
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  Minimize2,
  Maximize2,
  Clock,
  CheckCheck,
  Headphones,
  UserCheck,
} from 'lucide-react';
import {
  createOrGetChatSession,
  sendChatMessage,
  subscribeToChatMessages,
  subscribeToChatSession,
  requestAgentInChat,
  resumeBotChat,
} from '../services/firebase';
import { ChatMessage, StoreSettings, UserAccount } from '../types';
import { renderBotTemplate, getWhatsAppUrl, openWhatsAppChat } from '../utils/helpers';
import { BrandLogo } from './BrandLogo';
import { DraggableFab } from './DraggableFab';

interface LiveChatWidgetProps {
  currentUser: UserAccount | null;
  settings: StoreSettings;
  onOpenAuth?: () => void;
}

const CHAT_ID_KEY = 'velora_chat_id';

// Reserve the chat id synchronously before any async Firestore work starts.
// This prevents React StrictMode and session refreshes from creating parallel chats.
function getStableChatId(): string {
  try {
    const saved = localStorage.getItem(CHAT_ID_KEY);
    if (saved) return saved;
    const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(CHAT_ID_KEY, id);
    return id;
  } catch {
    return `chat_local_${Date.now()}`;
  }
}

export const LiveChatWidget: React.FC<LiveChatWidgetProps> = ({
  currentUser,
  settings,
  onOpenAuth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [chatId, setChatId] = useState<string>(() => getStableChatId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [guestName, setGuestName] = useState(() => currentUser?.name || 'Guest Shopper');
  const [guestPhone, setGuestPhone] = useState(() => currentUser?.phone || '');
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  // Live handover state mirrored from the Firestore session doc
  const [sessionStatus, setSessionStatus] = useState<'active' | 'agent_pending' | 'agent_joined' | 'closed'>('active');
  const [agentDisplayName, setAgentDisplayName] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionStatusRef = useRef(sessionStatus);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  // Initialize or restore chat session in Firestore
  useEffect(() => {
    async function initChat() {
      try {
        const existingId = chatId || getStableChatId();
        const id = await createOrGetChatSession({
          chatId: existingId || undefined,
          userId: currentUser?.id,
          userName: currentUser?.name || guestName,
          userEmail: currentUser?.email,
          userPhone: currentUser?.phone || guestPhone,
        });

        setChatId(id);
        localStorage.setItem(CHAT_ID_KEY, id);
      } catch (err) {
        console.error('Error initializing Firestore chat:', err);
      }
    }

    initChat();
  }, [currentUser]);

  // Real-time Firestore subscription to messages
  useEffect(() => {
    if (!chatId) return;

    const unsubscribe = subscribeToChatMessages(chatId, (newMsgs) => {
      setMessages(newMsgs);
      if (!isOpen && newMsgs.length > 0) {
        const lastMsg = newMsgs[newMsgs.length - 1];
        if (lastMsg.sender !== 'user') {
          setHasUnread(true);
        }
      }
    });

    return () => unsubscribe();
  }, [chatId, isOpen]);

  // Real-time session status (waiting / agent joined / closed by agent)
  useEffect(() => {
    if (!chatId) return;
    const unsubscribe = subscribeToChatSession(chatId, (session) => {
      if (!session) return;
      const status = (session.status as typeof sessionStatus) || 'active';
      setSessionStatus(status);
      if (session.agentName) setAgentDisplayName(session.agentName);
    });
    return () => unsubscribe();
  }, [chatId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isTyping]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending || !chatId) return;

    setInputText('');
    setIsSending(true);

    try {
      // 1. Save user message to Firebase Firestore
      const userMsg = await sendChatMessage(chatId, {
        sender: 'user',
        senderName: currentUser?.name || guestName || 'Customer',
        text,
      });

      // 2. Bot stays silent while the customer is waiting for, or talking to, a live agent
      if (sessionStatus === 'agent_pending' || sessionStatus === 'agent_joined') {
        return;
      }
      setIsTyping(true);
      setTimeout(async () => {
        try {
          // A request may have arrived while the bot was waiting 900ms.
          // Re-check the live ref so the bot cannot reply after handover.
          if (sessionStatusRef.current === 'agent_pending' || sessionStatusRef.current === 'agent_joined') {
            return;
          }
          const lower = text.toLowerCase();
          // Admin-configured templates from Store Settings, with graceful fallbacks
          const ctx = {
            name: currentUser?.name || guestName,
            store: settings.storeName || 'VELORA',
            whatsapp: settings.whatsappNumber,
            feeIn: settings.shippingFeeInsideDhaka,
            feeOut: settings.shippingFeeOutsideDhaka,
            freeThreshold: settings.freeShippingThreshold,
            addressEn: settings.addressEn,
            addressBn: settings.addressBn,
          };
          let botReply = '';

          if (lower.includes('price') || lower.includes('দাম') || lower.includes('cost') || lower.includes('taka')) {
            botReply = renderBotTemplate(settings.botReplyPrice, ctx) || 'Please share the product you are interested in and we will quote the exact price right away.';
          } else if (lower.includes('delivery') || lower.includes('shipping') || lower.includes('ডেলিভারি') || lower.includes('charge')) {
            botReply =
              renderBotTemplate(settings.botReplyDelivery, ctx) ||
              `We deliver inside Dhaka within 24-48 hours for ৳${settings.shippingFeeInsideDhaka}, and nationwide within 48-72 hours for ৳${settings.shippingFeeOutsideDhaka}.`;
          } else if (lower.includes('size') || lower.includes('সাইজ') || lower.includes('fitting') || lower.includes('custom')) {
            botReply = renderBotTemplate(settings.botReplySize, ctx) || 'We offer standard and made-to-measure sizing. Share your measurements and we will guide you.';
          } else if (lower.includes('location') || lower.includes('store') || lower.includes('দোকান') || lower.includes('address') || lower.includes('ঠিকানা')) {
            botReply = renderBotTemplate(settings.botReplyLocation, ctx) || `Find us at ${settings.addressEn} (${settings.addressBn}).`;
          } else if (lower.includes('bkash') || lower.includes('payment') || lower.includes('cod') || lower.includes('ক্যাশ')) {
            botReply = renderBotTemplate(settings.botReplyPayment, ctx) || 'Cash on Delivery, bKash, Nagad and bank transfers are all supported.';
          } else {
            botReply =
              renderBotTemplate(settings.botReplyDefault, ctx) ||
              `Thank you for your message! You can also reach us at +${settings.whatsappNumber}.`;
          }

          // The bot can be disabled entirely from store settings
          if (!botReply || settings.botEnabled === false) {
            return;
          }

          // 3. Save Assistant Response directly into Firebase Firestore!
          await sendChatMessage(chatId, {
            sender: 'assistant',
            senderName: 'VELORA Concierge',
            text: botReply,
          });
        } catch (botErr) {
          console.error('Error saving bot response to Firebase:', botErr);
        } finally {
          setIsTyping(false);
        }
      }, 900);
    } catch (err) {
      console.error('Failed to send message to Firestore:', err);
    } finally {
      setIsSending(false);
    }
  };

  const waitingForAgent = sessionStatus === 'agent_pending';
  const agentInChat = sessionStatus === 'agent_joined';
  const chatClosedByAgent = sessionStatus === 'closed';

  const handleRequestAgent = async () => {
    if (!chatId || waitingForAgent || agentInChat) return;
    setSessionStatus('agent_pending'); // optimistic – the waiting pill appears instantly
    try {
      await requestAgentInChat(chatId, currentUser?.name || guestName, currentUser?.phone || guestPhone);
    } catch (err) {
      console.warn('Agent request note:', err);
    }
  };

  const handleBackToAssistant = async () => {
    if (!chatId) return;
    setSessionStatus('active');
    try {
      await resumeBotChat(chatId);
    } catch {
      // Silent
    }
  };

  const handleQuickPrompt = (promptText: string) => {
    setInputText(promptText);
  };

  return (
    <>
      {/* Draggable floating toggle — drop it anywhere on the screen; position is remembered */}
      <DraggableFab
        storageKey="velora_chat_fab_pos"
        defaultPosition={
          typeof window !== 'undefined'
            ? { x: window.innerWidth - 80, y: window.innerHeight - 90 }
            : { x: 320, y: 600 }
        }
        bottomMargin={typeof window !== 'undefined' && window.innerWidth < 768 ? 96 : 24}
        topMargin={80}
        ariaLabel="Open Live Concierge Chat"
        title="Live Concierge Chat — drag to reposition"
        className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#12151f] via-[#232b41] to-[#12151f] text-amber-300 border border-amber-500/40 shadow-2xl shadow-black/40 flex items-center justify-center hover:border-amber-400 active:scale-95 transition-transform"
        onClick={() => {
          setIsOpen(!isOpen);
          setHasUnread(false);
        }}
      >
        <MessagesSquare className="w-6 h-6" />
        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-[#12151f] animate-pulse" />
        {hasUnread && (
          <span className="absolute -top-1.5 -left-1.5 px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full shadow-md animate-bounce">
            New
          </span>
        )}
      </DraggableFab>

      {/* Live Chat Box */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ease-out shadow-2xl rounded-3xl overflow-hidden border border-amber-500/20 bg-white flex flex-col ${
            isMinimized
              ? 'bottom-20 right-6 w-80 h-16'
              : 'bottom-20 right-4 sm:right-6 w-[92vw] sm:w-[380px] h-[520px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#12151f] via-[#1a1f2e] to-[#12151f] text-white p-3.5 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-200 p-0.5 shrink-0 flex items-center justify-center text-slate-950 font-bold">
                <Bot className="w-5 h-5 text-slate-900" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-[#12151f]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-amber-300">
                    VELORA Live Concierge
                  </h3>
                  <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-mono">
                    Firestore Sync
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Real-time connected</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Message List */}
              <div className="flex-1 p-4 overflow-y-auto bg-slate-50/70 space-y-3">
                {/* Guest Identity Chip */}
                <div className="p-2 bg-amber-50/80 border border-amber-200/70 rounded-xl flex items-center justify-between text-[11px] text-amber-900">
                  <span className="flex items-center gap-1 font-medium">
                    <UserIcon className="w-3.5 h-3.5 text-amber-700" />
                    <span>Chatting as: <strong>{currentUser?.name || guestName}</strong></span>
                  </span>
                  {!currentUser && (
                    <button
                      onClick={onOpenAuth}
                      className="text-[10px] font-bold text-amber-700 underline hover:text-amber-900 cursor-pointer"
                    >
                      Sign In
                    </button>
                  )}
                </div>

                {messages.length === 0 && (
                  <div className="text-center py-6 space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700">
                      Welcome to VELORA Concierge
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      Every message is securely saved in Firebase Firestore in real-time.
                    </p>
                  </div>
                )}

                {/* Waiting for an agent to join */}
                {waitingForAgent && (
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs shadow-xs mb-3 animate-in fade-in duration-300 space-y-1.5">
                    <div className="flex items-center gap-2 font-bold">
                      <Clock className="w-4 h-4 animate-pulse text-amber-600" />
                      <span>Waiting for a live agent…</span>
                    </div>
                    <p className="text-amber-800/90 leading-relaxed">
                      Your request has been sent to our support team. The automated assistant is paused until an agent joins. You can keep typing — the agent will see everything.
                    </p>
                  </div>
                )}

                {/* Agent is in the chat – minimal, low-transparency notice */}
                {agentInChat && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200/50 text-emerald-800/90 text-[11px] mb-3 animate-in fade-in duration-300 flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      <strong className="font-bold">{agentDisplayName || 'An agent'}</strong> joined — bot paused
                    </span>
                  </div>
                )}

                {/* Agent closed the conversation – bot is back */}
                {chatClosedByAgent && (
                  <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-[11px] mb-3 animate-in fade-in duration-300 flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      The agent ended this conversation. <strong>VELORA Concierge is back online</strong> for instant answers.
                    </span>
                  </div>
                )}

                {messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1 mb-0.5 px-1 text-[10px] text-slate-400">
                        <span>{msg.senderName}</span>
                        <span>•</span>
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                          isUser
                            ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-br-xs'
                            : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span className="text-[11px]">VELORA Concierge is typing...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Handover controls – compact, state driven */}
              <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-center gap-2">
                {waitingForAgent ? (
                  /* The waiting pill – disappears the moment an agent joins */
                  <div className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 bg-amber-100/80 text-amber-800 border border-amber-200/70 animate-pulse">
                    <Clock className="w-3.5 h-3.5" /> Waiting for an agent to join…
                  </div>
                ) : agentInChat ? (
                  <>
                    <div className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 bg-emerald-100/80 text-emerald-800 border border-emerald-200/70">
                      <CheckCheck className="w-3.5 h-3.5" /> Chatting with {agentDisplayName || 'agent'}
                    </div>
                    <button
                      onClick={handleBackToAssistant}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Back to assistant
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleRequestAgent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs hover:shadow-sm transition-all cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    {chatClosedByAgent ? 'Request agent again' : 'Connect to Agent'}
                  </button>
                )}

                {/* Continue on WhatsApp – uses the bypass chain so it works
                    even when wa.me is blocked on the user's network. */}
                <button
                  type="button"
                  onClick={() =>
                    openWhatsAppChat(
                      settings.whatsappNumber,
                      `Assalamu Alaikum ${settings.storeName || 'VELORA'}! I need help with my shopping or order.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                  title="Continue this conversation on WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              </div>

              {/* Quick Suggestion Chips */}
              <div className="px-3 py-1.5 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
                <button
                  onClick={() => handleQuickPrompt('What are your delivery charges and timings?')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-600 rounded-full whitespace-nowrap transition-colors cursor-pointer"
                >
                  🚚 Delivery Rates
                </button>
                <button
                  onClick={() => handleQuickPrompt('Can you suggest wedding Panjabis and Jamdanis?')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-600 rounded-full whitespace-nowrap transition-colors cursor-pointer"
                >
                  ✨ Wedding Sizing
                </button>
                <button
                  onClick={() => handleQuickPrompt('What payment options do you support?')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-600 rounded-full whitespace-nowrap transition-colors cursor-pointer"
                >
                  💳 bKash / COD
                </button>
              </div>

              {/* Input Form */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    agentInChat
                      ? `Message ${agentDisplayName || 'the agent'}…`
                      : waitingForAgent
                      ? 'Type anything – your agent will see it…'
                      : 'Ask VELORA Concierge...'
                  }
                  className="flex-1 px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white transition-all"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="p-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-xl shadow-sm transition-all disabled:opacity-40 cursor-pointer"
                  aria-label="Send Message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
};
