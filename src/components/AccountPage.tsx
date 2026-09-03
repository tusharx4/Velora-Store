import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  Phone,
  MapPin,
  Mail,
  Save,
  LogOut,
  ShoppingBag,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Loader2,
  ChevronDown,
  CalendarDays,
  Wallet,
  BadgeCheck,
  PencilLine,
} from 'lucide-react';
import { Order, OrderStatus, StoreSettings, UserAccount } from '../types';
import { api } from '../services/api';
import { formatBDT } from '../utils/helpers';

interface AccountPageProps {
  currentUser: UserAccount;
  settings: StoreSettings;
  onUserUpdated: (user: UserAccount) => void;
  onLogout: () => void;
  onNavigate: (route: string) => void;
}

const STATUS_META: Record<OrderStatus, { label: string; icon: React.ReactNode; chip: string; dot: string }> = {
  pending: { label: 'Pending', icon: <Clock className="w-3 h-3" />, chip: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', icon: <BadgeCheck className="w-3 h-3" />, chip: 'bg-teal-100 text-teal-800 border-teal-300', dot: 'bg-teal-500' },
  processing: { label: 'Processing', icon: <Loader2 className="w-3 h-3 animate-spin" />, chip: 'bg-indigo-100 text-indigo-800 border-indigo-300', dot: 'bg-indigo-500' },
  shipped: { label: 'Shipped', icon: <Truck className="w-3 h-3" />, chip: 'bg-sky-100 text-sky-800 border-sky-300', dot: 'bg-sky-500' },
  delivered: { label: 'Delivered', icon: <CheckCircle2 className="w-3 h-3" />, chip: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', icon: <XCircle className="w-3 h-3" />, chip: 'bg-rose-100 text-rose-700 border-rose-300', dot: 'bg-rose-500' },
};

export const AccountPage: React.FC<AccountPageProps> = ({
  currentUser,
  settings,
  onUserUpdated,
  onLogout,
  onNavigate,
}) => {
  // Editable profile fields
  const [name, setName] = useState(currentUser.name || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [address, setAddress] = useState(currentUser.address || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'active'>('all');

  const loadOrders = () => {
    setOrdersLoading(true);
    api
      .getCustomerOrders(currentUser)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.phone, currentUser.email]);

  // Keep the form in sync if the session refreshes elsewhere
  useEffect(() => {
    setName(currentUser.name || '');
    setPhone(currentUser.phone || '');
    setAddress(currentUser.address || '');
  }, [currentUser.id]);

  const visibleOrders = useMemo(
    () =>
      orderFilter === 'all'
        ? orders
        : orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders, orderFilter]
  );

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
    const spent = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0);
    return { total: orders.length, active: active.length, spent };
  }, [orders]);

  const dirty =
    name.trim() !== (currentUser.name || '') ||
    phone.trim() !== (currentUser.phone || '') ||
    address.trim() !== (currentUser.address || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    try {
      setIsSaving(true);
      const updated = await api.updateProfile(currentUser.id, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      onUserUpdated(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
      loadOrders(); // phone change can widen the matched order history
    } catch (err: any) {
      setSaveError(err?.message || 'Could not save your changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const memberSince = currentUser.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="py-6 md:py-10 pb-28 md:pb-16 animate-in fade-in duration-300">
      {/* Profile header panel */}
      <div className="relative overflow-hidden rounded-3xl bg-[#12151f] text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-10 w-56 h-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 text-2xl font-black flex items-center justify-center shadow-lg ring-2 ring-amber-300/40 shrink-0">
            {(currentUser.name || 'V').charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">
              My Account
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              {currentUser.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3 h-3 text-amber-400/80" /> {currentUser.email}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-amber-400/80" /> Member since {memberSince}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-rose-500/20 hover:text-rose-200 border border-white/15 text-xs font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        {/* Quick stats */}
        <div className="relative mt-6 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/5 border border-white/10">
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-extrabold text-amber-300">{stats.total}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Orders</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-extrabold text-emerald-300">{stats.active}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Active</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-extrabold text-white">{formatBDT(stats.spent)}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Lifetime Spend</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start">
        {/* Profile editor */}
        <form
          onSubmit={handleSave}
          className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <PencilLine className="w-4 h-4 text-amber-600" />
              My Details
            </h2>
            {savedFlash && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full animate-in fade-in">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Mobile Number <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                placeholder="017XXXXXXXX"
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Delivery calls ও order updates এই নম্বরে পাঠানো হয়।
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Delivery Address <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                required
                placeholder="House, road, area, thana, district"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none resize-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Checkout-এ এই address টি স্বয়ংক্রিয়ভাবে বসে যাবে।
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Email (login ID)</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={currentUser.email}
                disabled
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 outline-none cursor-not-allowed"
              />
            </div>
          </div>

          {saveError && (
            <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {saveError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || !dirty}
            className="w-full py-2.5 rounded-xl bg-[#12151f] hover:bg-black text-amber-300 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSaving ? (
              <span className="inline-block w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'Saving…' : dirty ? 'Save Changes' : 'No changes yet'}
          </button>
        </form>

        {/* Order history */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              My Orders
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                {orders.length}
              </span>
            </h2>
            <div className="inline-flex rounded-lg p-1 bg-slate-200/70 text-[11px] font-bold">
              {(['active', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    orderFilter === f ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f === 'active' ? 'Active' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {ordersLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200 relative overflow-hidden">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" />
                </div>
              ))}
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                {orders.length === 0 ? 'You have not placed any order yet' : 'No orders in this view'}
              </p>
              <p className="text-xs text-slate-500 font-bn">
                অর্ডার করলে এখানে সব অর্ডারের অবস্থা দেখতে পাবেন।
              </p>
              <button
                onClick={() => onNavigate('shop')}
                className="px-4 py-2 rounded-xl bg-[#12151f] text-amber-300 text-xs font-extrabold hover:bg-black transition-colors cursor-pointer"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => {
                const meta = STATUS_META[order.status] || STATUS_META.pending;
                const expanded = expandedId === order.id;
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-shadow hover:shadow-md"
                  >
                    <button
                      onClick={() => setExpandedId(expanded ? null : order.id)}
                      className="w-full text-left p-4 flex items-center gap-3 cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        {order.items?.[0]?.img ? (
                          <img src={order.items[0].img} alt="" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          <Package className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-extrabold text-indigo-700">{order.id}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.chip}`}>
                            {meta.icon}
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {new Date(order.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {' · '}
                          {(order.items || []).length} item{(order.items || []).length === 1 ? '' : 's'}
                          {' · '}
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            {order.paymentMethod?.toUpperCase()}
                          </span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-slate-900">{formatBDT(order.total)}</p>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 animate-in fade-in duration-200">
                        <div className="space-y-2 pt-3">
                          {(order.items || []).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              {item.img && (
                                <img src={item.img} alt="" className="w-9 h-11 object-cover rounded-lg border border-slate-200" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                                <p className="text-[10px] text-slate-500">{item.variant}</p>
                              </div>
                              <p className="text-[11px] text-slate-600 shrink-0">
                                {item.quantity} × {formatBDT(item.price)}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-[11px] text-slate-600">
                          <p className="flex justify-between">
                            <span>Subtotal</span>
                            <span>{formatBDT(order.subtotal)}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Shipping ({order.deliveryZone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'})</span>
                            <span>{formatBDT(order.shippingFee)}</span>
                          </p>
                          <p className="flex justify-between font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                            <span>Total Paid / Due</span>
                            <span>{formatBDT(order.total)}</span>
                          </p>
                          {order.trackingNumber && (
                            <p className="pt-1 text-indigo-700 font-mono">Tracking: {order.trackingNumber}</p>
                          )}
                          <p className="pt-1 flex items-start gap-1.5">
                            <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                            <span>{order.address}</span>
                          </p>
                        </div>

                        <button
                          onClick={() => onNavigate('shop')}
                          className="w-full py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          Order Again from {settings.storeName || 'VELORA'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
