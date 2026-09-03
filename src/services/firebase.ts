import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import { CloudError, isCloudPaused, noteFailure, noteSuccess } from './cloudState';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  Unsubscribe,
  getDocFromServer,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AgentNotification,
  ChatMessage,
  ChatSession,
  Order,
  CustomerInquiry,
  ProductReview,
  UserAccount,
  Product,
  Category,
  BannerSlide,
  StoreSettings,
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Initialize Firebase safely
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore: use a named database when one is configured, otherwise the project's "(default)" database
const configuredDatabaseId = (firebaseConfig.firestoreDatabaseId || '').trim();
export const firestoreDb =
  configuredDatabaseId && configuredDatabaseId !== '(default)'
    ? getFirestore(firebaseApp, configuredDatabaseId)
    : getFirestore(firebaseApp);

// Initialize Firebase Auth
export const auth = getAuth(firebaseApp);

// Google Analytics (optional): only when a measurementId is configured and the browser supports it
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) getAnalytics(firebaseApp);
    })
    .catch(() => {
      /* analytics is best-effort (blocked by ad blockers, unsupported browsers, ...) */
    });
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error Context: ', JSON.stringify(errInfo));
  return errInfo;
}

// Test connection on boot per Firebase guidelines
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore connection note: Database is syncing in background.');
    }
  }
}

// ==========================================
// 1. LIVE CHAT & CONCIERGE (FIRESTORE)
// ==========================================

export async function createOrGetChatSession(
  sessionData: {
    chatId?: string;
    userId?: string;
    userName: string;
    userPhone?: string;
    userEmail?: string;
  }
): Promise<string> {
  // Firebase unreachable right now – hand back a session id without touching the network
  if (isCloudPaused()) {
    return sessionData.chatId || `chat_local_${Date.now()}`;
  }
  const chatId = sessionData.chatId || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const chatRef = doc(firestoreDb, 'chats', chatId);

  try {
    let exists = false;
    try {
      const snap = await getDoc(chatRef);
      exists = snap.exists();
    } catch (readErr) {
      // If offline or first read fails, proceed to setDoc
      console.warn('Chat session check note:', readErr);
    }

    if (!exists) {
      await setDoc(chatRef, {
        id: chatId,
        userId: sessionData.userId || 'guest',
        userName: sessionData.userName || 'Guest Shopper',
        userPhone: sessionData.userPhone || '',
        userEmail: sessionData.userEmail || '',
        lastMessage: 'Chat session started',
        lastSender: 'user',
        updatedAt: new Date().toISOString(),
        status: 'active',
        unreadCount: 0,
        createdAt: new Date().toISOString(),
      }, { merge: true });

      // Send initial greeting message into subcollection
      // Uses the store greeting saved in admin settings, falling back to the built-in one
      let greetingText = 'Assalamu Alaikum, valued guest! How may we assist you today?';
      try {
        const settingsSnap = await getDoc(doc(firestoreDb, 'settings', 'store_settings'));
        if (settingsSnap.exists()) {
          const stored = settingsSnap.data() as StoreSettings;
          if (stored.botGreeting) {
            greetingText = stored.botGreeting
              .replace(/\{name\}/g, sessionData.userName || 'valued guest')
              .replace(/\{store\}/g, stored.storeName || 'VELORA Luxury Boutique');
          }
        }
      } catch {
        /* offline / rules blocked – fallback stays */
      }

      // A fixed welcome id makes concurrent init calls idempotent.
      // React StrictMode can run the init effect twice in development.
      const msgRef = doc(firestoreDb, 'chats', chatId, 'messages', 'welcome');
      await setDoc(msgRef, {
        id: msgRef.id,
        chatId,
        sender: 'assistant',
        senderName: 'VELORA Concierge AI',
        text: greetingText,
        timestamp: new Date().toISOString(),
        read: true,
      });
    }
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
  }

  return chatId;
}

export async function sendChatMessage(
  chatId: string,
  message: {
    sender: 'user' | 'assistant' | 'admin';
    senderName: string;
    text: string;
  }
): Promise<ChatMessage> {
  if (isCloudPaused()) {
    throw new CloudError('Live chat is offline right now – the message could not be delivered.', 'paused');
  }
  const messagesCol = collection(firestoreDb, 'chats', chatId, 'messages');
  const msgDoc = doc(messagesCol);
  
  const newMsg: ChatMessage = {
    id: msgDoc.id,
    chatId,
    sender: message.sender,
    senderName: message.senderName,
    text: message.text,
    timestamp: new Date().toISOString(),
    read: message.sender === 'user' ? false : true,
  };

  try {
    await setDoc(msgDoc, newMsg);

    // Update session document
    const chatDocRef = doc(firestoreDb, 'chats', chatId);
      await updateDoc(chatDocRef, {
      lastMessage: message.text,
      lastSender: message.sender,
      updatedAt: new Date().toISOString(),
    }).catch(async () => {
      await setDoc(chatDocRef, {
        id: chatId,
        lastMessage: message.text,
        lastSender: message.sender,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}/messages/${msgDoc.id}`);
  }

  return newMsg;
}

export function subscribeToChatMessages(
  chatId: string,
  onUpdate: (messages: ChatMessage[]) => void
): Unsubscribe {
  if (isCloudPaused()) return () => {};
  const messagesCol = collection(firestoreDb, 'chats', chatId, 'messages');
  const q = query(messagesCol, orderBy('timestamp', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        messages.push(docSnap.data() as ChatMessage);
      });
      noteSuccess();
      onUpdate(messages);
    },
    (err) => {
      noteFailure(err);
      handleFirestoreError(err, OperationType.LIST, `chats/${chatId}/messages`);
    }
  );
}

export function subscribeToAllChatSessions(
  onUpdate: (sessions: ChatSession[]) => void
): Unsubscribe {
  if (isCloudPaused()) return () => {};
  const chatsCol = collection(firestoreDb, 'chats');
  // Admins/agents receive only handover conversations. Closed sessions stay in
  // this query as history, while bot-only active sessions remain private.
  // Avoid orderBy so this query does not require a composite Firestore index.
  const q = query(
    chatsCol,
    where('status', 'in', ['agent_pending', 'agent_joined', 'closed']),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sessions: ChatSession[] = [];
      snapshot.forEach((docSnap) => {
        sessions.push({ id: docSnap.id, ...(docSnap.data() as object) } as ChatSession);
      });
      sessions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      noteSuccess();
      onUpdate(sessions);
    },
    (err) => {
      noteFailure(err);
      handleFirestoreError(err, OperationType.LIST, 'chats');
    }
  );
}

// ==========================================
// 2. ORDERS PERSISTENCE (FIRESTORE)
// ==========================================

export async function saveOrderToFirestore(order: Order): Promise<void> {
  const orderRef = doc(firestoreDb, 'orders', order.id);
  try {
    await setDoc(orderRef, {
      ...order,
      firestoreUpdatedAt: new Date().toISOString(),
    }, { merge: true });
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.WRITE, `orders/${order.id}`);
  }
}

export function subscribeToOrders(
  onUpdate: (orders: Order[]) => void
): Unsubscribe {
  if (isCloudPaused()) return () => {};
  const ordersCol = collection(firestoreDb, 'orders');
  const q = query(ordersCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const orders: Order[] = [];
      snapshot.forEach((docSnap) => {
        orders.push(docSnap.data() as Order);
      });
      noteSuccess();
      onUpdate(orders);
    },
    (err) => {
      noteFailure(err);
      handleFirestoreError(err, OperationType.LIST, 'orders');
    }
  );
}

export async function updateOrderStatusInFirestore(
  orderId: string,
  status: Order['status'],
  trackingNumber?: string
): Promise<void> {
  const orderRef = doc(firestoreDb, 'orders', orderId);
  try {
    await updateDoc(orderRef, {
      status,
      ...(trackingNumber ? { trackingNumber } : {}),
      updatedAt: new Date().toISOString(),
    });
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

// ==========================================
// 3. CONTACT INQUIRIES (FIRESTORE)
// ==========================================

export async function saveInquiryToFirestore(
  inquiry: Omit<CustomerInquiry, 'id' | 'createdAt' | 'status'>
): Promise<CustomerInquiry> {
  const inqCol = collection(firestoreDb, 'inquiries');
  const inqDoc = doc(inqCol);
  const newInq: CustomerInquiry = {
    id: inqDoc.id,
    name: inquiry.name,
    phone: inquiry.phone,
    subject: inquiry.subject,
    message: inquiry.message,
    createdAt: new Date().toISOString(),
    status: 'new',
  };

  try {
    await setDoc(inqDoc, newInq);
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.WRITE, `inquiries/${inqDoc.id}`);
  }

  return newInq;
}

export function subscribeToInquiries(
  onUpdate: (inquiries: CustomerInquiry[]) => void
): Unsubscribe {
  if (isCloudPaused()) return () => {};
  const inqCol = collection(firestoreDb, 'inquiries');
  const q = query(inqCol, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CustomerInquiry[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as CustomerInquiry);
      });
      noteSuccess();
      onUpdate(list);
    },
    (err) => {
      noteFailure(err);
      handleFirestoreError(err, OperationType.LIST, 'inquiries');
    }
  );
}

// ==========================================
// 4. PRODUCT REVIEWS (FIRESTORE)
// ==========================================

export async function saveProductReviewToFirestore(
  review: Omit<ProductReview, 'id' | 'createdAt'>
): Promise<ProductReview> {
  const revCol = collection(firestoreDb, 'reviews');
  const revDoc = doc(revCol);
  const newRev: ProductReview = {
    id: revDoc.id,
    productId: review.productId,
    userName: review.userName || 'Verified Buyer',
    userEmail: review.userEmail || '',
    rating: review.rating,
    comment: review.comment,
    createdAt: new Date().toISOString(),
    verifiedPurchase: review.verifiedPurchase !== false,
  };

  try {
    await setDoc(revDoc, newRev);
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.WRITE, `reviews/${revDoc.id}`);
  }

  return newRev;
}

export function subscribeToProductReviews(
  productId: string,
  onUpdate: (reviews: ProductReview[]) => void
): Unsubscribe {
  if (isCloudPaused()) return () => {};
  const revCol = collection(firestoreDb, 'reviews');
  const q = query(
    revCol,
    where('productId', '==', productId),
    orderBy('createdAt', 'desc'),
    limit(30)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ProductReview[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as ProductReview);
      });
      noteSuccess();
      onUpdate(list);
    },
    (err) => {
      noteFailure(err);
      handleFirestoreError(err, OperationType.LIST, `reviews?productId=${productId}`);
    }
  );
}

// ==========================================
// 5. USER ACCOUNTS (FIRESTORE)
// ==========================================

export async function saveUserToFirestore(user: UserAccount): Promise<void> {
  const userRef = doc(firestoreDb, 'users', user.id);
  try {
    await setDoc(userRef, {
      ...user,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.id}`);
  }
}

// ==========================================
// 6. AGENT NOTIFICATIONS & CHAT HANDOVER
// Lifecycle: active (bot) → agent_pending (waiting) → agent_joined → closed (bot resumes)
// ==========================================

/** Fast reachability probe so subscriptions fail fast instead of hanging. */
async function probeFirestore(): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('probe timeout')), 2500);
      getDocFromServer(doc(firestoreDb, 'ping', 'health-check'))
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendAgentNotification(
  chatId: string,
  info?: { customerName?: string; customerPhone?: string; message?: string }
): Promise<void> {
  if (isCloudPaused()) return;
  const now = new Date().toISOString();
  try {
    await setDoc(doc(firestoreDb, 'agent_notifications', chatId), {
      chatId,
      agentId: 'any',
      customerName: info?.customerName || 'Guest Shopper',
      customerPhone: info?.customerPhone || '',
      message: info?.message || `${info?.customerName || 'A customer'} is requesting a live agent.`,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `agent_notifications/${chatId}`);
  }
}

export async function resolveAgentNotification(chatId: string): Promise<void> {
  if (isCloudPaused() || !chatId) return;
  try {
    // A notification is a one-time request. Deleting it guarantees that the
    // bell panel cannot keep showing a stale "Join chat" action after acceptance.
    await deleteDoc(doc(firestoreDb, 'agent_notifications', chatId));
  } catch {
    // It may already have been removed by another staff tab.
  }
}

export function subscribeToAgentNotifications(
  onUpdate: (notifications: AgentNotification[]) => void
): () => void {
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  if (!isCloudPaused()) {
    void (async () => {
      if (!(await probeFirestore()) || cancelled) return;
      const col = collection(firestoreDb, 'agent_notifications');
      const q = query(col, where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(30));
      unsub = onSnapshot(
        q,
        (snap) => {
          const list: AgentNotification[] = [];
          snap.forEach((d) => list.push({ chatId: d.id, ...(d.data() as object) } as AgentNotification));
          onUpdate(list);
        },
        () => {
          // Silent
        }
      );
    })();
  }

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// ---------- Session status control ----------

async function patchChatSession(chatId: string, patch: Record<string, unknown>): Promise<void> {
  if (isCloudPaused() || !chatId) return;
  try {
    await setDoc(
      doc(firestoreDb, 'chats', chatId),
      { id: chatId, updatedAt: new Date().toISOString(), ...patch },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

/** Customer pressed "Connect to Live Agent" → session waits, agents get notified. */
export async function requestAgentInChat(
  chatId: string,
  customerName?: string,
  customerPhone?: string
): Promise<void> {
  await patchChatSession(chatId, { status: 'agent_pending', agentRequestedAt: new Date().toISOString() });
  await sendAgentNotification(chatId, { customerName, customerPhone });
}

/** Agent accepts the request → bot pauses, customer sees "agent joined". */
export async function joinChatAsAgent(chatId: string, agentName: string): Promise<void> {
  await patchChatSession(chatId, {
    status: 'agent_joined',
    agentName,
    agentJoinedAt: new Date().toISOString(),
  });
  await resolveAgentNotification(chatId);
}

/** Agent ends the conversation → bot resumes on the customer side. */
export async function closeChatSession(chatId: string, closedBy: string): Promise<void> {
  await patchChatSession(chatId, {
    status: 'closed',
    closedBy,
    closedAt: new Date().toISOString(),
  });
  await resolveAgentNotification(chatId);
}

/** Customer (or agent) hands the chat back to the automated concierge. */
export async function resumeBotChat(chatId: string): Promise<void> {
  await patchChatSession(chatId, { status: 'active', agentLeftAt: new Date().toISOString() });
  await resolveAgentNotification(chatId);
}

/** Join + leave a visible system-style line in the thread so the customer sees the handover. */
export async function agentJoinChat(chatId: string, agentName: string, settings?: StoreSettings): Promise<void> {
  await joinChatAsAgent(chatId, agentName);
  await sendChatMessage(chatId, {
    sender: 'admin',
    senderName: agentName,
    text: settings?.chatAgentJoinedTemplate
      ? settings.chatAgentJoinedTemplate.replace(/\{agent\}/g, agentName)
      : `${agentName} has joined this conversation. The automated assistant is paused while we help you personally.`,
  });
}

export async function agentCloseChat(chatId: string, agentName: string, settings?: StoreSettings): Promise<void> {
  await closeChatSession(chatId, agentName);
  await sendChatMessage(chatId, {
    sender: 'admin',
    senderName: agentName,
    text: settings?.chatAgentClosedTemplate
      ? settings.chatAgentClosedTemplate
          .replace(/\{agent\}/g, agentName)
          .replace(/\{store\}/g, settings?.storeName || 'VELORA')
      : `${agentName} has ended this conversation. VELORA Concierge is back online for instant answers — thank you for chatting with us!`,
  });
}

/**
 * Delete an entire chat session and all its messages.
 * This is irreversible — use with caution.
 */
export async function deleteChatSession(chatId: string): Promise<void> {
  if (isCloudPaused()) throw new CloudError('Cannot reach chat right now.', 'paused');
  const batch = writeBatch(firestoreDb);
  
  // Delete the session document
  const chatRef = doc(firestoreDb, 'chats', chatId);
  batch.delete(chatRef);
  
  // Delete all messages in the subcollection (Firestore doesn't support cascading deletes)
  const messagesCol = collection(firestoreDb, 'chats', chatId, 'messages');
  const messagesSnap = await getDocs(messagesCol);
  messagesSnap.forEach((msgDoc) => {
    batch.delete(msgDoc.ref);
  });
  
  try {
    await batch.commit();
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}`);
    throw err;
  }
}

/** Real-time single-session subscription (status, agent name, close info…). */
export function subscribeToChatSession(
  chatId: string,
  onUpdate: (session: ChatSession | null) => void
): () => void {
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  if (chatId && !isCloudPaused()) {
    void (async () => {
      if (!(await probeFirestore()) || cancelled) return;
      unsub = onSnapshot(
        doc(firestoreDb, 'chats', chatId),
        (snap) => onUpdate(snap.exists() ? ({ id: chatId, ...snap.data() } as ChatSession) : null),
        () => {
          // Silent
        }
      );
    })();
  }

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// ==========================================
// 6. STORE SETTINGS & PRODUCTS BACKUP SYNC
// ==========================================
export async function saveSettingsToFirestore(settings: StoreSettings): Promise<void> {
  const setRef = doc(firestoreDb, 'settings', 'store_settings');
  try {
    await setDoc(setRef, {
      ...settings,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    noteSuccess();
  } catch (err) {
    noteFailure(err);
    handleFirestoreError(err, OperationType.WRITE, 'settings/store_settings');
  }
}

export async function getSettingsFromFirestore(): Promise<StoreSettings | null> {
  try {
    const setRef = doc(firestoreDb, 'settings', 'store_settings');
    const snap = await getDoc(setRef);
    if (snap.exists()) {
      return snap.data() as StoreSettings;
    }
  } catch (err) {
    console.warn('Could not read settings from Firestore:', err);
  }
  return null;
}
