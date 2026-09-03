import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Truck,
  ShieldCheck,
  MapPin,
  MessageCircle,
  Plus as PlusIcon,
} from 'lucide-react';
import { CartItem, DeliveryZone, StoreSettings } from '../types';
import { formatBDT, openWhatsAppChat, buildCartWhatsAppMessage } from '../utils/helpers';

interface CartPageProps {
  cart: CartItem[];
  onUpdateQuantity: (pid: string, size?: string, color?: string, delta?: number) => void;
  onRemoveItem: (pid: string, size?: string, color?: string) => void;
  onOpenCheckout: (zone: DeliveryZone) => void;
  settings: StoreSettings;
  onNavigate: (route: string) => void;
}

const ZONE_LABEL: Record<DeliveryZone, string> = {
  dhaka: 'Inside Dhaka',
  outside: 'Outside Dhaka',
};

export const CartPage: React.FC<CartPageProps> = ({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onOpenCheckout,
  settings,
  onNavigate,
}) => {
  const [deliveryZone, setDeliveryZone] = useState<DeliveryZone>('dhaka');

  // Reset scroll to top when navigating to the cart page
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const isEmpty = cart.length === 0;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const isFreeShipping = !isEmpty && settings.freeShippingThreshold > 0 && subtotal >= settings.freeShippingThreshold;
  const shippingFee = isFreeShipping ? 0 : isEmpty ? 0 : deliveryZone === 'dhaka' ? settings.shippingFeeInsideDhaka : settings.shippingFeeOutsideDhaka;
  const total = subtotal + shippingFee;

  const amountNeededForFreeShip = Math.max(0, settings.freeShippingThreshold - subtotal);
  const freeShipProgress = isEmpty
    ? 0
    : Math.min(100, Math.round((subtotal / Math.max(settings.freeShippingThreshold, 1)) * 100));

  const handleWhatsAppOrder = () => {
    if (isEmpty) return;
    const origin = window.location.origin + window.location.pathname;
    const msg = buildCartWhatsAppMessage(cart, deliveryZone, shippingFee, '', '', '', '', origin);
    openWhatsAppChat(settings.whatsappNumber, msg);
  };

  return (
    <div className="pb-28 md:pb-16 animate-in fade-in duration-300">
      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#12151f] to-[#1e2436] text-white px-5 sm:px-7 py-6 sm:py-7 mb-5 sm:mb-7 shadow-lg">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-12 -left-6 w-36 h-36 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">
              Your Shopping Bag
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {isEmpty ? 'Your cart is empty' : `${cart.length} item${cart.length > 1 ? 's' : ''} in your bag`}
            </h1>
            <p className="text-xs text-slate-300 mt-1 font-bn">
              {isEmpty
                ? 'কোনো পণ্য এখনো যোগ করা হয়নি — একটু ঘুরে দেখুন।'
                : 'সব পণ্য রিভিউ করে checkout করুন অথবা WhatsApp-এ অর্ডার পাঠান।'}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-bold text-slate-300">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Secure checkout
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10">
              <Truck className="w-3.5 h-3.5 text-amber-300" /> COD nationwide
            </span>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 sm:p-16 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <ShoppingBag className="w-7 h-7 text-amber-600" />
          </div>
          <p className="text-sm font-bold text-slate-800">You have not added anything to the bag yet.</p>
          <p className="text-xs text-slate-500 font-bn max-w-sm mx-auto">
            হোমপেজের ফ্ল্যাশ সেল, জনপ্রিয় ক্যাটাগরি অথবা সার্চ বার থেকে পছন্দের পণ্য যোগ করুন।
          </p>
          <button
            onClick={() => onNavigate('shop')}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#12151f] text-amber-300 text-xs font-extrabold hover:bg-black transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Browse Products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 sm:gap-6">
          {/* Cart items list */}
          <section className="space-y-3">
            {cart.map((item, idx) => (
              <div
                key={`${item.pid}-${item.size}-${item.color}-${idx}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 sm:p-4 flex items-center gap-3 sm:gap-4"
              >
                <button
                  onClick={() => onNavigate(`product/${item.slug}`)}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer"
                >
                  {item.img && (
                    <img
                      src={item.img}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onNavigate(`product/${item.slug}`)}
                    className="text-left w-full"
                  >
                    <p className="text-sm font-bold text-slate-900 line-clamp-2 hover:text-amber-700 transition-colors">
                      {item.name}
                    </p>
                  </button>
                  <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                    {item.size && <span>Size: {item.size}</span>}
                    {item.color && <span>Color: {item.color}</span>}
                  </p>
                  <p className="text-sm font-extrabold text-rose-600 mt-1">
                    {formatBDT(item.price)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => onRemoveItem(item.pid, item.size, item.color)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    aria-label="Remove item"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                    <button
                      onClick={() => onUpdateQuantity(item.pid, item.size, item.color, -1)}
                      className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-white rounded-l-lg cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center text-xs font-extrabold text-slate-800">{item.qty}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.pid, item.size, item.color, 1)}
                      className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-white rounded-r-lg cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 font-bold">
                    {formatBDT(item.price * item.qty)}
                  </p>
                </div>
              </div>
            ))}

            <button
              onClick={() => onNavigate('shop')}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer pt-1"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add more products
            </button>
          </section>

          {/* Summary panel */}
          <aside className="space-y-3 lg:sticky lg:top-24 self-start">
            {/* Free-shipping meter */}
            {settings.freeShippingThreshold > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    {isFreeShipping
                      ? '🎉 Free shipping unlocked'
                      : `Add ${formatBDT(amountNeededForFreeShip)} for free shipping`}
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono">{freeShipProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all"
                    style={{ width: `${freeShipProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <p className="text-sm font-extrabold text-slate-900">Order Summary</p>

              <div className="grid grid-cols-2 gap-2">
                {(['dhaka', 'outside'] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => setDeliveryZone(z)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      deliveryZone === z
                        ? 'bg-[#12151f] text-amber-300 border-[#12151f]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {ZONE_LABEL[z]}
                    <span className="block text-[10px] font-normal opacity-80 mt-0.5">
                      {formatBDT(z === 'dhaka' ? settings.shippingFeeInsideDhaka : settings.shippingFeeOutsideDhaka)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-bold text-slate-800">{formatBDT(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-bold text-slate-800">{shippingFee === 0 ? 'Free' : formatBDT(shippingFee)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <span className="font-extrabold text-slate-900">Total</span>
                  <span className="font-extrabold text-slate-900">{formatBDT(total)}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bn pt-1">
                  ক্যাশ অন ডেলিভারি — সারা বাংলাদেশে।
                </p>
              </div>

              <button
                onClick={() => onOpenCheckout(deliveryZone)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                Proceed to Checkout
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleWhatsAppOrder}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                Order on WhatsApp
              </button>

              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bn pt-1">
                <MapPin className="w-3 h-3" />
                সারা বাংলাদেশে ডেলিভারি · ২৪-৭২ ঘণ্টা
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
