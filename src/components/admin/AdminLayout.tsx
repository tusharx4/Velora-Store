import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Layers,
  Image as ImageIcon,
  Settings,
  Sparkles,
  RotateCcw,
  Menu,
  X,
  TrendingUp,
  Store,
  ChevronRight,
  ShieldCheck,
  Flame,
  LogOut,
  Users,
  Shield,
  MessageSquare,
  Bell,
  Headphones,
  CheckCheck,
} from 'lucide-react';
import { AgentNotification, AnalyticsSummary, StoreSettings, UserAccount } from '../../types';
import { formatBDT } from '../../utils/helpers';
import { BrandLogo } from '../BrandLogo';

interface AdminLayoutProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  /** Tabs this user is allowed to open (admins get everything). */
  allowedTabs: string[];
  /** Pending "connect to agent" requests from customers (live). */
  pendingAgentRequests?: AgentNotification[];
  /** Called when the agent accepts a request from the bell panel. */
  onJoinAgentChat?: (chatId: string) => void;
  onExitAdmin: () => void;
  onLogoutAdmin?: () => void;
  analytics: AnalyticsSummary | null;
  settings: StoreSettings;
  currentUser: UserAccount | null;
  onResetData: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  allowedTabs,
  pendingAgentRequests = [],
  onJoinAgentChat,
  onExitAdmin,
  onLogoutAdmin,
  analytics,
  settings,
  currentUser,
  onResetData,
  children,
}) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);

  const isPrimaryAdmin = currentUser?.isPrimaryAdmin || currentUser?.role === 'admin';
  const isModerator = currentUser?.role === 'moderator';
  const canSeeFinance = isPrimaryAdmin || allowedTabs.includes('dashboard');

  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard & Analytics', icon: <LayoutDashboard className="w-4 h-4" />, badge: null },
    { id: 'products', label: 'Products & Inventory', icon: <Package className="w-4 h-4" />, badge: analytics?.totalProducts },
    { id: 'flash-sales', label: 'Flash Sales & Deals', icon: <Flame className="w-4 h-4 text-amber-400" />, badge: analytics?.flashSaleProductsCount ? `${analytics.flashSaleProductsCount} live` : null },
    { id: 'orders', label: 'Orders & Shipments', icon: <ShoppingBag className="w-4 h-4" />, badge: analytics?.pendingOrders ? `${analytics.pendingOrders} new` : null },
    {
      id: 'live-chats',
      label: 'Live Chats & Inquiries',
      icon: <MessageSquare className="w-4 h-4 text-emerald-500" />,
      badge: pendingAgentRequests.length > 0 ? `${pendingAgentRequests.length} waiting` : 'Firebase',
    },
    { id: 'categories', label: 'Categories', icon: <Layers className="w-4 h-4" />, badge: null },
    { id: 'banners', label: 'Hero Banners', icon: <ImageIcon className="w-4 h-4" />, badge: null },
    { id: 'ai-assistant', label: 'AI Product Generator', icon: <Sparkles className="w-4 h-4 text-indigo-400" />, badge: 'AI' },
    { id: 'users', label: 'Users & Roles', icon: <Users className="w-4 h-4 text-amber-400" />, badge: 'Admin Only' },
    { id: 'settings', label: 'Store Settings', icon: <Settings className="w-4 h-4" />, badge: 'Admin Only' },
  ];
  // Moderators only ever see the areas the administrator granted them
  const menuItems = allMenuItems.filter((m) => allowedTabs.includes(m.id));

  const currentTabLabel = menuItems.find((m) => m.id === currentTab)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {/* Top Header Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Toggle Navigation"
            >
              {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Brand Logo & Portal Badge */}
            <div className="flex items-center gap-2.5">
              <BrandLogo variant="dark" size="sm" showTagline={false} />
              {isPrimaryAdmin ? (
                <span className="text-[10px] font-bold uppercase px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full border border-amber-300 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-amber-700" />
                  <span>Main Admin</span>
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-2.5 py-1 bg-blue-100 text-blue-900 rounded-full border border-blue-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-blue-700" />
                  <span>Staff Moderator</span>
                </span>
              )}
            </div>

            {/* Breadcrumb path (Desktop) */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 pl-3 border-l border-slate-200">
              <span>Management</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="font-semibold text-slate-800">{currentTabLabel}</span>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Agent Request Notification Bell */}
            {currentUser && currentUser.role !== 'customer' && (
              <div className="relative">
                <button
                  onClick={() => setIsBellOpen((v) => !v)}
                  className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 bg-white transition-colors cursor-pointer"
                  aria-label="Agent request notifications"
                  title="Live agent requests"
                >
                  <Bell className="w-4 h-4" />
                  {pendingAgentRequests.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md animate-pulse">
                      {pendingAgentRequests.length}
                    </span>
                  )}
                </button>

                {isBellOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsBellOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-700 text-white flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                            <Headphones className="w-3.5 h-3.5 text-amber-300" />
                            Agent Requests
                          </h4>
                          <p className="text-[10px] text-indigo-100/90">Customers waiting for a live agent</p>
                        </div>
                        {pendingAgentRequests.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-violet-950 font-bold">
                            {pendingAgentRequests.length} new
                          </span>
                        )}
                      </div>

                      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                        {pendingAgentRequests.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                            <CheckCheck className="w-5 h-5 mx-auto text-emerald-500" />
                            <p className="font-semibold text-slate-500">All caught up</p>
                            <p className="text-[11px]">No customer is waiting for an agent right now.</p>
                          </div>
                        ) : (
                          pendingAgentRequests.map((req) => (
                            <div key={req.chatId} className="p-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {(req.customerName || 'G').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">
                                  {req.customerName || 'Guest Shopper'}
                                  {req.customerPhone && (
                                    <span className="ml-1.5 font-mono text-[10px] text-slate-400">{req.customerPhone}</span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">{req.message}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  onJoinAgentChat?.(req.chatId);
                                  setIsBellOpen(false);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-extrabold shadow-sm transition-all cursor-pointer whitespace-nowrap"
                              >
                                Join chat
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* User Profile Pill */}
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs">
                <div className="w-5 h-5 rounded-full bg-neutral-900 text-amber-300 flex items-center justify-center font-bold text-[10px]">
                  {currentUser.name.charAt(0)}
                </div>
                <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                  {currentUser.name}
                </span>
              </div>
            )}

            {analytics && canSeeFinance && (
              <div className="hidden xl:flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Revenue: <b className="text-slate-900">{formatBDT(analytics.totalRevenue)}</b></span>
                </span>
                <span className="text-slate-300">|</span>
                <span>Orders: <b className="text-slate-900">{analytics.totalOrders}</b></span>
              </div>
            )}

            {isPrimaryAdmin && (
              <button
                onClick={onResetData}
                title="Reset to default initial catalog"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset Store</span>
              </button>
            )}

            <button
              onClick={onExitAdmin}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <span>Storefront</span>
            </button>

            {onLogoutAdmin && (
              <button
                onClick={onLogoutAdmin}
                title="Lock Session & Sign Out"
                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-6">
        {/* Dark Sidebar */}
        <aside
          className={`md:w-64 flex-shrink-0 space-y-4 ${
            isMobileNavOpen ? 'block' : 'hidden md:block'
          }`}
        >
          <div className="bg-slate-900 text-slate-300 rounded-2xl p-3 shadow-sm border border-slate-800 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Navigation</span>
              {isModerator && (
                <span className="text-[9px] text-blue-400 font-semibold lowercase">
                  moderator suite
                </span>
              )}
            </div>
            {menuItems.map((item) => {
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setIsMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-slate-950 text-amber-400'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Role Status Card */}
          <div className="bg-white rounded-2xl p-4 text-xs text-slate-600 border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              {isPrimaryAdmin ? (
                <Shield className="w-4 h-4 text-amber-600" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              )}
              <span>{isPrimaryAdmin ? 'Primary Admin Account' : 'Staff Moderator Account'}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {isPrimaryAdmin
                ? 'Sole master administrator with complete authority over user roles, finance rates, and store settings.'
                : menuItems.length > 0
                ? `Access granted to ${menuItems.length} area${menuItems.length === 1 ? '' : 's'}: ${menuItems.map((m) => m.label).join(', ')}.`
                : 'No areas have been assigned to your account yet. Contact the administrator.'}
            </p>
          </div>
        </aside>

        {/* Content View */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};
