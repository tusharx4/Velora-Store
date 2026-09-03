import React from 'react';
import { Home, LayoutGrid, ShoppingCart, User } from 'lucide-react';

interface MobileBottomNavProps {
  currentRoute: string;
  cartCount: number;
  isSignedIn: boolean;
  onNavigate: (route: string) => void;
  /** Open the auth modal so the user can sign in / register. */
  onOpenAuth?: (defaultTab?: 'signin' | 'signup') => void;
}

/** Daraz-style fixed bottom tab bar shown only on small screens. */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  cartCount,
  isSignedIn,
  onNavigate,
  onOpenAuth,
}) => {
  const isHome = currentRoute === '' || currentRoute === 'home';
  const isShop = currentRoute === 'shop' || currentRoute.startsWith('shop?');

  const handleAccountTap = () => {
    if (isSignedIn) {
      onNavigate('account');
    } else if (onOpenAuth) {
      onOpenAuth('signin');
    } else {
      onNavigate('shop');
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
      active ? 'text-amber-600' : 'text-slate-500'
    }`;

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch">
        <button onClick={() => onNavigate('')} className={tabClass(isHome)}>
          <Home className={`w-5 h-5 ${isHome ? 'fill-amber-100' : ''}`} />
          <span className="text-[10px] font-bold">Home</span>
        </button>

        <button onClick={() => onNavigate('shop')} className={tabClass(isShop)}>
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] font-bold">Categories</span>
        </button>

        <button onClick={() => onNavigate('cart')} className={`${tabClass(currentRoute === 'cart')} relative`}>
          <span className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </span>
          <span className="text-[10px] font-bold">Cart</span>
        </button>

        <button
          onClick={handleAccountTap}
          className={tabClass(currentRoute === 'account' || (!isSignedIn && currentRoute === 'account'))}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-bold">{isSignedIn ? 'Account' : 'Sign In'}</span>
        </button>
      </div>
    </nav>
  );
};
