export interface ProductColor {
  n: string;
  h: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  bn: string;
  price: number;
  was?: number;
  cat: string;
  stock: number;
  imgs: string[];
  img: string[]; // resolved URLs
  tags: string[];
  sizes: string[];
  colors: ProductColor[];
  rating: number;
  rc: number; // review count
  d: string; // description English
  db: string; // description Bengali
  featured?: boolean;
  flashSale?: boolean;
  flashSaleDiscountPercent?: number;
  flashSaleEndsAt?: string;
  flashSaleSold?: number;
  flashSaleStockQuota?: number;
  createdAt?: string;
}

export interface Category {
  slug: string;
  name: string;
  bn: string;
  d: string;
  img: number | string;
}

export interface BannerSlide {
  id: string;
  t: string;
  bn: string;
  s: string;
  img: number | string;
  cta: string;
  href: string;
}

export interface CartItem {
  pid: string;
  slug: string;
  name: string;
  bn?: string;
  price: number;
  img: string;
  qty: number;
  size?: string;
  color?: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cod' | 'bkash' | 'nagad';
export type DeliveryZone = 'dhaka' | 'outside';

export interface OrderItem {
  slug: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  img?: string;
}

export interface Order {
  id: string; // e.g. VEL-9821
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryZone: DeliveryZone;
  address: string;
  city?: string;
  note?: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discount?: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  trackingNumber?: string;
}

export type UserRole = 'admin' | 'moderator' | 'customer';

/** Admin-panel areas an administrator can grant to a moderator. Ids match the admin tab ids. */
export type ModeratorPermission =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'flash-sales'
  | 'live-chats'
  | 'categories'
  | 'banners'
  | 'ai-assistant';

export const MODERATOR_PERMISSIONS: { id: ModeratorPermission; label: string; bn: string; desc: string }[] = [
  { id: 'orders', label: 'Orders & Shipments', bn: 'অর্ডার ম্যানেজমেন্ট', desc: 'View every order, customer details, update status & tracking, message customers on WhatsApp.' },
  { id: 'live-chats', label: 'Customer Support', bn: 'কাস্টমার সাপোর্ট', desc: 'Reply to live chats and contact-form inquiries.' },
  { id: 'flash-sales', label: 'Flash Sales & Deals', bn: 'ফ্ল্যাশ সেল ও ডিল', desc: 'Schedule flash sales and edit deal discounts.' },
  { id: 'products', label: 'Products & Inventory', bn: 'প্রোডাক্ট ও স্টক', desc: 'Add / edit products, prices and stock levels.' },
  { id: 'categories', label: 'Categories', bn: 'ক্যাটাগরি', desc: 'Create and remove product categories.' },
  { id: 'banners', label: 'Hero Banners', bn: 'হোম পেজ ব্যানার', desc: 'Manage the homepage banner slides.' },
  { id: 'ai-assistant', label: 'AI Product Generator', bn: 'এআই প্রোডাক্ট জেনারেটর', desc: 'Draft new product listings with the AI helper.' },
  { id: 'dashboard', label: 'Dashboard & Analytics', bn: 'ড্যাশবোর্ড ও রিপোর্ট', desc: 'See revenue, order counts and stock analytics.' },
];

/** Sensible starting point when someone is promoted to moderator. */
export const DEFAULT_MODERATOR_PERMISSIONS: ModeratorPermission[] = ['orders', 'live-chats'];

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  createdAt: string;
  lastLogin?: string;
  avatar?: string;
  isPrimaryAdmin?: boolean;
  /** Only meaningful for moderators. Admins implicitly have everything. */
  permissions?: ModeratorPermission[];
  /** Delivery address collected at sign-up (mandatory for customers). */
  address?: string;
}

/** Which admin-panel tabs a user may open. */
export function getAllowedAdminTabs(user: UserAccount | null): string[] {
  if (!user) return [];
  if (user.role === 'admin') {
    return ['dashboard', 'products', 'flash-sales', 'orders', 'live-chats', 'categories', 'banners', 'ai-assistant', 'users', 'settings'];
  }
  if (user.role === 'moderator') return [...(user.permissions || [])];
  return [];
}

export interface StoredUser extends UserAccount {
  password?: string;
}

export interface AuthSession {
  user: UserAccount;
  token: string;
}

export interface StoreSettings {
  storeName: string;
  storeTaglineEn: string;
  storeTaglineBn: string;
  whatsappNumber: string;
  phone: string;
  email: string;
  addressEn: string;
  addressBn: string;
  shippingFeeInsideDhaka: number;
  shippingFeeOutsideDhaka: number;
  freeShippingThreshold: number;
  currencySymbol: string;
  tickerNoticeEn: string;
  tickerNoticeBn: string;
  showTicker: boolean;
  adminPassword?: string;
  primaryAdminEmail?: string;
  flashSaleActive?: boolean;
  flashSaleTitleEn?: string;
  flashSaleTitleBn?: string;
  flashSaleEndsAt?: string;
  /** Concierge auto-reply configuration (admin-editable in Settings) */
  botGreeting?: string;
  botReplyPrice?: string;
  botReplyDelivery?: string;
  botReplySize?: string;
  botReplyLocation?: string;
  botReplyPayment?: string;
  botReplyDefault?: string;
  botEnabled?: boolean;
  chatAgentJoinedTemplate?: string;
  chatAgentClosedTemplate?: string;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  averageOrderValue: number;
  flashSaleProductsCount?: number;
  categoryBreakdown?: Record<string, number>;
  categorySales: { category: string; count: number; revenue: number }[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  recentOrders: Order[];
}

export interface ChatMessage {
  id: string;
  chatId: string;
  sender: 'user' | 'assistant' | 'admin';
  text: string;
  senderName: string;
  timestamp: string;
  read?: boolean;
}

/** Live-chat lifecycle: bot only → waiting for agent → agent in chat → closed by agent */
export type ChatSessionStatus = 'active' | 'agent_pending' | 'agent_joined' | 'closed';

export interface AgentNotification {
  chatId: string;
  agentId: string;
  message: string;
  customerName?: string;
  customerPhone?: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  userId?: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  lastMessage: string;
  lastSender: 'user' | 'assistant' | 'admin';
  updatedAt: string;
  unreadCount?: number;
  status: ChatSessionStatus | 'active' | 'closed';
  agentName?: string;
  agentJoinedAt?: string;
  agentRequestedAt?: string;
  closedBy?: string;
  closedAt?: string;
}

export interface CustomerInquiry {
  id: string;
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'new' | 'in_progress' | 'resolved';
}

export interface ProductReview {
  id: string;
  productId: string;
  userName: string;
  userEmail?: string;
  rating: number;
  comment: string;
  createdAt: string;
  verifiedPurchase?: boolean;
}

