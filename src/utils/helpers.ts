import { CartItem, Product } from '../types';

export const formatBDT = (amount: number): string => {
  return '৳' + Number(amount || 0).toLocaleString('en-IN');
};

/** Render {placeholders} in an admin-configurable bot template with live store data. */
export const renderBotTemplate = (
  template: string | undefined,
  ctx: Partial<Record<'name' | 'agent' | 'store' | 'whatsapp' | 'feeIn' | 'feeOut' | 'freeThreshold' | 'addressEn' | 'addressBn', string | number>>
): string => {
  if (!template || !template.trim()) return '';
  const fill: Record<string, string> = {
    name: String(ctx.name || 'valued guest'),
    agent: String(ctx.agent || 'A live agent'),
    store: String(ctx.store || 'VELORA'),
    whatsapp: String(ctx.whatsapp || ''),
    feeIn: String(ctx.feeIn ?? ''),
    feeOut: String(ctx.feeOut ?? ''),
    freeThreshold: typeof ctx.freeThreshold === 'number' ? ctx.freeThreshold.toLocaleString() : String(ctx.freeThreshold || ''),
    addressEn: String(ctx.addressEn || ''),
    addressBn: String(ctx.addressBn || ''),
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => fill[key] ?? `{${key}}`);
};

export const getWhatsAppUrl = (phone: string, message: string): string => {
  // Strip everything that isn't a digit, then normalise Bangladeshi
  // mobile numbers (01X…) to the international format (880…).
  const raw = String(phone || '').replace(/[^0-9]/g, '');
  let digits = raw;
  if (digits.startsWith('0') && digits.length === 11) {
    // 01XXXXXXXXX → 8801XXXXXXXXX
    digits = `880${digits.slice(1)}`;
  } else if (digits.startsWith('1') && digits.length === 10) {
    // 1XXXXXXXXX → 8801XXXXXXXXX
    digits = `880${digits}`;
  } else if (digits.length === 10) {
    // 10-digit number with no country code → assume Bangladesh
    digits = `880${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

/** Try the multiple WhatsApp entry points the browser can resolve.
 *  Returns the URL that ended up opening (or empty string if the user
 *  dismissed every attempt). Necessary in regions where `wa.me` is DNS-blocked.
 */
export const openWhatsAppChat = (phone: string, message: string): void => {
  const text = encodeURIComponent(message);
  const raw = String(phone || '').replace(/[^0-9]/g, '');
  let digits = raw;
  if (digits.startsWith('0') && digits.length === 11) digits = `880${digits.slice(1)}`;
  else if (digits.startsWith('1') && digits.length === 10) digits = `880${digits}`;
  else if (digits.length === 10) digits = `880${digits}`;

  // Try in order: native app intent → wa.me → web.whatsapp.com → api.whatsapp.com
  const candidates = [
    `whatsapp://send?phone=${digits}&text=${text}`,
    `https://wa.me/${digits}?text=${text}`,
    `https://web.whatsapp.com/send?phone=${digits}&text=${text}`,
    `https://api.whatsapp.com/send?phone=${digits}&text=${text}`,
  ];

  // Use a hidden iframe so the first attempt can succeed without navigating the page
  const tryOpen = (idx: number): void => {
    if (idx >= candidates.length) {
      // Final fallback: copy the message to clipboard and tell the user
      try {
        navigator.clipboard?.writeText(message);
        window.alert(
          'WhatsApp is unreachable from this network. The message has been copied to your clipboard — paste it into WhatsApp manually.'
        );
      } catch {
        window.alert('WhatsApp is unreachable from this network. Please open WhatsApp manually.');
      }
      return;
    }
    const url = candidates[idx];
    const isApp = url.startsWith('whatsapp://');

    if (isApp) {
      // Attempting a custom URL scheme without user gesture sometimes fails silently
      const started = Date.now();
      const blurHandler = () => {
        if (Date.now() - started < 1500) {
          // App opened, do nothing further
        }
        window.removeEventListener('blur', blurHandler);
      };
      window.addEventListener('blur', blurHandler);
      window.location.href = url;
      setTimeout(() => tryOpen(idx + 1), 1200);
    } else {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        // Popup blocked – fall back to same-tab navigation
        window.location.href = url;
      }
      setTimeout(() => tryOpen(idx + 1), 900);
    }
  };

  tryOpen(0);
};

export const buildProductWhatsAppMessage = (
  product: Product,
  variant: string,
  quantity: number,
  settingsPhone: string,
  origin: string
): string => {
  const lineTotal = product.price * quantity;
  return [
    `*✨ New Order Request — VELORA*`,
    ``,
    `*Item:* ${product.name}`,
    `*Variant:* ${variant || 'Standard'}`,
    `*Quantity:* ${quantity}`,
    `*Price:* ${formatBDT(product.price)}`,
    `*Total Amount:* ${formatBDT(lineTotal)}`,
    `*Product Link:* ${origin}#/product/${product.slug}`,
    ``,
    `*Delivery Details:*`,
    `Name: `,
    `Phone: `,
    `Address: `,
    `City/Zone: (Inside Dhaka / Outside Dhaka)`,
    ``,
    `_Cash on delivery nationwide · Dhaka ৳80 | Outside ৳150_`,
  ].join('\n');
};

export const buildCartWhatsAppMessage = (
  items: CartItem[],
  zone: 'dhaka' | 'outside',
  shippingFee: number,
  customerName?: string,
  customerPhone?: string,
  address?: string,
  orderId?: string,
  origin?: string
): string => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = subtotal + shippingFee;

  const itemLines = items.map((item, idx) => {
    const v = [item.size, item.color].filter(Boolean).join(' / ');
    return `${idx + 1}. *${item.name}*\n   • Variant: ${v || 'Standard'}\n   • Qty: ${item.qty} × ${formatBDT(item.price)} = ${formatBDT(item.price * item.qty)}`;
  });

  return [
    `*✨ New Order Request — VELORA*`,
    orderId ? `*Order ID:* ${orderId}` : '',
    ``,
    `*Ordered Items:*`,
    itemLines.join('\n\n'),
    ``,
    `*Subtotal:* ${formatBDT(subtotal)}`,
    `*Shipping (${zone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):* ${formatBDT(shippingFee)}`,
    `*Total Payable:* ${formatBDT(total)}`,
    ``,
    `*Customer Information:*`,
    `Name: ${customerName || ''}`,
    `Phone: ${customerPhone || ''}`,
    `Delivery Address: ${address || ''}`,
    `Delivery Zone: ${zone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}`,
    ``,
    `_Payment Method: Cash on Delivery (COD) / bKash_`,
  ].filter(Boolean).join('\n');
};
