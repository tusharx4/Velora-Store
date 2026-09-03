import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ChevronRight,
  Flame,
  Truck,
  ShieldCheck,
  Wallet,
  Gift,
  Sparkles,
  Store,
  Headphones,
  Tag,
} from 'lucide-react';
import { BannerSlide, Category, Product, StoreSettings } from '../../types';
import { formatBDT } from '../../utils/helpers';
import { resolvePexelsUrl } from '../../data/initialData';

interface MobileHomeProps {
  products: Product[];
  categories: Category[];
  banners: BannerSlide[];
  settings: StoreSettings;
  onOpenProduct: (product: Product) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onNavigate: (route: string) => void;
  onSelectCategory: (slug: string) => void;
}

/** Small circular shortcut used in the Daraz-style quick access grid. */
interface QuickLink {
  id: string;
  label: string;
  labelBn: string;
  icon: React.ReactNode;
  tint: string;
  onClick: () => void;
}

export const MobileHome: React.FC<MobileHomeProps> = ({
  products,
  categories,
  banners,
  settings,
  onOpenProduct,
  onAddToCart,
  onNavigate,
  onSelectCategory,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [bannerIndex, setBannerIndex] = useState(0);

  // Auto-rotate the hero strip like the Daraz app carousel
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = window.setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % banners.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  const flashProducts = useMemo(
    () => products.filter((p) => p.flashSale).slice(0, 8),
    [products]
  );

  const popularProducts = useMemo(
    () => [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8),
    [products]
  );

  const feedProducts = useMemo(() => products.slice(0, 12), [products]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim();
    onNavigate(term ? `shop?search=${encodeURIComponent(term)}` : 'shop');
  };

  const quickLinks: QuickLink[] = [
    {
      id: 'flash',
      label: 'Flash Sale',
      labelBn: 'ফ্ল্যাশ সেল',
      icon: <Flame className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-rose-500 to-amber-500 text-white',
      onClick: () => onNavigate('flash-sales'),
    },
    {
      id: 'new',
      label: 'New Arrivals',
      labelBn: 'নতুন কালেকশন',
      icon: <Sparkles className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white',
      onClick: () => onNavigate('shop?sort=new'),
    },
    {
      id: 'delivery',
      label: 'Fast Delivery',
      labelBn: 'দ্রুত ডেলিভারি',
      icon: <Truck className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
      onClick: () => onNavigate('about'),
    },
    {
      id: 'cod',
      label: 'Cash on Delivery',
      labelBn: 'ক্যাশ অন ডেলিভারি',
      icon: <Wallet className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white',
      onClick: () => onNavigate('about'),
    },
    {
      id: 'authentic',
      label: '100% Authentic',
      labelBn: 'অরিজিনাল পণ্য',
      icon: <ShieldCheck className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white',
      onClick: () => onNavigate('about'),
    },
    {
      id: 'gift',
      label: 'Gift Packing',
      labelBn: 'গিফট প্যাকিং',
      icon: <Gift className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-pink-500 to-rose-500 text-white',
      onClick: () => onNavigate('shop'),
    },
    {
      id: 'store',
      label: 'Visit Store',
      labelBn: 'শোরুম',
      icon: <Store className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-slate-700 to-slate-900 text-amber-300',
      onClick: () => onNavigate('contact'),
    },
    {
      id: 'support',
      label: 'Support',
      labelBn: 'সাপোর্ট',
      icon: <Headphones className="w-6 h-6" />,
      tint: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
      onClick: () => onNavigate('contact'),
    },
  ];

  const activeBanner = banners[bannerIndex];

  return (
    <div className="md:hidden -mx-4 bg-slate-100 pb-4">
      {/* Sticky search header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#12151f] to-[#1e2436] px-3 pt-3 pb-3 shadow-md">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white rounded-full pl-3.5 pr-1.5 py-1.5 shadow-sm">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sarees, panjabi, attar…"
              className="flex-1 min-w-0 text-xs text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
            />
            <button
              type="submit"
              className="shrink-0 px-3.5 py-1.5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-extrabold active:scale-95 transition-transform"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Hero banner carousel */}
      {activeBanner && (
        <button
          onClick={() => onNavigate(activeBanner.href || 'shop')}
          className="relative block w-full h-40 overflow-hidden text-left"
        >
          <img
            src={resolvePexelsUrl(activeBanner.img)}
            alt={activeBanner.t}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300 font-bn">
              {activeBanner.bn}
            </p>
            <h2 className="text-base font-bold leading-tight line-clamp-2">{activeBanner.t}</h2>
          </div>
          {banners.length > 1 && (
            <div className="absolute bottom-2 right-3 flex items-center gap-1">
              {banners.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === bannerIndex ? 'w-4 bg-amber-400' : 'w-1 bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </button>
      )}

      {/* Quick access grid */}
      <section className="bg-white mt-2 px-3 py-4">
        <div className="grid grid-cols-4 gap-y-4 gap-x-2">
          {quickLinks.map((link) => (
            <button
              key={link.id}
              onClick={link.onClick}
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
            >
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${link.tint}`}>
                {link.icon}
              </span>
              <span className="text-[10px] font-bold text-slate-800 leading-tight text-center">
                {link.label}
              </span>
              <span className="text-[9px] text-slate-400 font-bn leading-none text-center -mt-1">
                {link.labelBn}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Flash sale rail */}
      {settings.flashSaleActive && flashProducts.length > 0 && (
        <section className="bg-white mt-2 px-3 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-rose-600" />
              <h3 className="text-base font-extrabold text-slate-900">Flash Sale</h3>
            </div>
            <button
              onClick={() => onNavigate('flash-sales')}
              className="flex items-center gap-0.5 text-xs font-bold text-rose-600 active:opacity-70"
            >
              Shop More <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-3 px-3">
            {flashProducts.map((product) => {
              const discount =
                product.was && product.was > product.price
                  ? Math.round(((product.was - product.price) / product.was) * 100)
                  : product.flashSaleDiscountPercent || 0;
              const sold = product.flashSaleSold || 0;
              const quota = product.flashSaleStockQuota || Math.max(sold + product.stock, 1);
              const soldPercent = Math.min(100, Math.round((sold / quota) * 100));

              return (
                <button
                  key={product.id}
                  onClick={() => onOpenProduct(product)}
                  className="w-[112px] shrink-0 text-left active:scale-95 transition-transform"
                >
                  <div className="relative w-[112px] h-[112px] rounded-xl overflow-hidden bg-slate-100">
                    <img
                      src={product.img[0]}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {discount > 0 && (
                      <span className="absolute top-0 left-0 bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-br-lg">
                        -{discount}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-extrabold text-rose-600 leading-none">
                    {formatBDT(product.price)}
                  </p>
                  {product.was && product.was > product.price && (
                    <p className="text-[10px] text-slate-400 line-through leading-tight">
                      {formatBDT(product.was)}
                    </p>
                  )}
                  <div className="mt-1 h-3 rounded-full bg-rose-100 overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-amber-500"
                      style={{ width: `${Math.max(soldPercent, 12)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[8.5px] font-bold text-white">
                      {sold > 0 ? `${sold} Sold` : 'Selling fast'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Category tiles */}
      <section className="bg-white mt-2 px-3 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-slate-900">Popular Categories</h3>
          <button
            onClick={() => onNavigate('shop')}
            className="flex items-center gap-0.5 text-xs font-bold text-slate-500 active:opacity-70"
          >
            Scroll More <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {categories.slice(0, 6).map((category) => (
            <button
              key={category.slug}
              onClick={() => {
                onSelectCategory(category.slug);
                onNavigate(`shop?category=${category.slug}`);
              }}
              className="active:scale-95 transition-transform"
            >
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={resolvePexelsUrl(category.img)}
                  alt={category.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-1 text-[10.5px] font-bold text-slate-800 leading-tight line-clamp-1">
                {category.name}
              </p>
              <p className="text-[9px] text-slate-400 font-bn leading-none line-clamp-1">
                {category.bn}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Popular picks rail */}
      {popularProducts.length > 0 && (
        <section className="bg-white mt-2 px-3 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-amber-600" />
              <h3 className="text-base font-extrabold text-slate-900">Top Rated</h3>
            </div>
            <button
              onClick={() => onNavigate('shop')}
              className="flex items-center gap-0.5 text-xs font-bold text-slate-500 active:opacity-70"
            >
              See All <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-3 px-3">
            {popularProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => onOpenProduct(product)}
                className="w-[130px] shrink-0 text-left active:scale-95 transition-transform"
              >
                <div className="w-[130px] h-[150px] rounded-xl overflow-hidden bg-slate-100">
                  <img
                    src={product.img[0]}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2">
                  {product.name}
                </p>
                <p className="text-sm font-extrabold text-slate-900">{formatBDT(product.price)}</p>
                <p className="text-[10px] text-amber-600 font-bold">★ {product.rating.toFixed(1)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Just for you grid */}
      <section className="bg-white mt-2 px-3 py-4">
        <h3 className="text-base font-extrabold text-slate-900 mb-1">Just For You</h3>
        <p className="text-[10px] text-slate-400 font-bn mb-3">আপনার জন্য বাছাই করা কালেকশন</p>

        <div className="grid grid-cols-2 gap-3">
          {feedProducts.map((product) => {
            const discount =
              product.was && product.was > product.price
                ? Math.round(((product.was - product.price) / product.was) * 100)
                : 0;
            return (
              <div
                key={product.id}
                onClick={() => onOpenProduct(product)}
                className="rounded-xl border border-slate-200 overflow-hidden bg-white active:scale-[0.98] transition-transform"
              >
                <div className="relative w-full aspect-square bg-slate-100">
                  <img
                    src={product.img[0]}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {discount > 0 && (
                    <span className="absolute top-0 left-0 bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-br-lg">
                      -{discount}%
                    </span>
                  )}
                  {product.stock <= 0 && (
                    <span className="absolute inset-0 bg-black/55 text-white text-[11px] font-bold flex items-center justify-center">
                      Out of stock
                    </span>
                  )}
                </div>

                <div className="p-2 space-y-1">
                  <p className="text-[11px] text-slate-800 leading-snug line-clamp-2 min-h-[28px]">
                    {product.name}
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-extrabold text-slate-900">
                      {formatBDT(product.price)}
                    </span>
                    {product.was && product.was > product.price && (
                      <span className="text-[10px] text-slate-400 line-through">
                        {formatBDT(product.was)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-600 font-bold">
                      ★ {product.rating.toFixed(1)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToCart(product, e);
                      }}
                      disabled={product.stock <= 0}
                      className="px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold disabled:opacity-40 active:scale-95 transition-transform"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => onNavigate('shop')}
          className="mt-4 w-full py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 active:bg-slate-50"
        >
          View all products
        </button>
      </section>
    </div>
  );
};
