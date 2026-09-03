import React, { useState } from 'react';
import { Settings, Save, CheckCircle2, MessageCircle, Truck, MapPin, Lock, Eye, EyeOff, ShieldCheck, Bot } from 'lucide-react';
import { StoreSettings } from '../../types';
import { api } from '../../services/api';

interface AdminSettingsProps {
  settings: StoreSettings;
  onRefresh: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  settings,
  onRefresh,
}) => {
  // Store settings form state (never contains the admin password)
  const stripPassword = (s: StoreSettings): StoreSettings => {
    const { adminPassword: _omit, ...rest } = s;
    return rest as StoreSettings;
  };

  const [form, setForm] = useState<StoreSettings>(() => stripPassword(settings));
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Admin password form state (fully independent of the settings form)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  React.useEffect(() => {
    if (settings) {
      setForm(stripPassword(settings));
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const updated = await api.updateSettings(stripPassword(form));
      if (updated) {
        setForm(stripPassword(updated));
      }
      setSavedSuccess(true);
      if (onRefresh) {
        await onRefresh();
      }
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordChanged(false);

    const pass = newPassword.trim();
    if (pass.length < 5) {
      setPasswordError('Password must be at least 5 characters long.');
      return;
    }
    if (pass !== confirmPassword.trim()) {
      setPasswordError('Passwords do not match. Please re-type the confirmation.');
      return;
    }

    try {
      setIsSavingPassword(true);
      await api.setAdminPassword(pass);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordChanged(true);
      setTimeout(() => setPasswordChanged(false), 6000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update admin password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
            System Preferences
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
            Store Configuration & Logistics
          </h1>
          <p className="text-xs text-slate-500 font-bn mt-0.5">
            হোয়াটসঅ্যাপ নম্বর, ডেলিভারি চার্জ এবং ধানমন্ডি বুটিকের ঠিকানা
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings Saved Successfully!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* WhatsApp & Phone Config */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <MessageCircle className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">
              WhatsApp Concierge & Hotline Number
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            All one-click customer purchase orders, status updates, and customer chat buttons will open this phone number. Include country code (e.g. 88017...).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                WhatsApp Phone Number (with Country Code) *
              </label>
              <input
                type="text"
                required
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Customer Support Hotline Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Shipping & Delivery Configuration */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <Truck className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">
              Nationwide Delivery Rates (৳ BDT)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Inside Dhaka Shipping (৳)
              </label>
              <input
                type="number"
                required
                value={form.shippingFeeInsideDhaka}
                onChange={(e) =>
                  setForm({ ...form, shippingFeeInsideDhaka: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Outside Dhaka Shipping (৳)
              </label>
              <input
                type="number"
                required
                value={form.shippingFeeOutsideDhaka}
                onChange={(e) =>
                  setForm({ ...form, shippingFeeOutsideDhaka: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Free Shipping Threshold (৳)
              </label>
              <input
                type="number"
                value={form.freeShippingThreshold}
                onChange={(e) =>
                  setForm({ ...form, freeShippingThreshold: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Announcement Ticker Bar */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Top Announcement Ticker Bar
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.showTicker}
                onChange={(e) => setForm({ ...form, showTicker: e.target.checked })}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
              <span>Enable Ticker</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                English Announcement
              </label>
              <input
                type="text"
                value={form.tickerNoticeEn}
                onChange={(e) => setForm({ ...form, tickerNoticeEn: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Bengali Announcement
              </label>
              <input
                type="text"
                value={form.tickerNoticeBn}
                onChange={(e) => setForm({ ...form, tickerNoticeBn: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bn text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Address Info */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <MapPin className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">
              Physical Boutique Location
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Address (English)
              </label>
              <input
                type="text"
                value={form.addressEn}
                onChange={(e) => setForm({ ...form, addressEn: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Address (Bengali)
              </label>
              <input
                type="text"
                value={form.addressBn}
                onChange={(e) => setForm({ ...form, addressBn: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bn text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Live Chat Bot Auto-Replies */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-indigo-600">
              <Bot className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">
                Concierge Bot — Auto-Reply Messages
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">
                Auto reply {form.botEnabled !== false ? 'on' : 'off'}
              </span>
              <button
                type="button"
                onClick={() => setForm({ ...form, botEnabled: !(form.botEnabled !== false) })}
                className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${form.botEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
                role="switch"
                aria-checked={form.botEnabled !== false}
              >
                <span
                  className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${form.botEnabled !== false ? 'left-5' : 'left-0.5'}`}
                />
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            These are the exact messages the bot sends in the live chat. Placeholders are swapped with live data when sent:{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{name}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{store}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{whatsapp}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{feeIn}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{feeOut}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{freeThreshold}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{addressEn}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{addressBn}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded text-[11px]">{'{agent}'}</code>
          </p>

          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800">
            Edit any message below and click <strong>Save All Settings</strong>. Your next customer message will use the saved reply immediately.
          </div>

          <div className="space-y-3.5">
            {(
              [
                ['botGreeting', 'Greeting (first message when a chat opens)', 2],
                ['botReplyPrice', 'Price questions', 2],
                ['botReplyDelivery', 'Delivery & shipping questions', 2],
                ['botReplySize', 'Size & fitting questions', 2],
                ['botReplyLocation', 'Store location questions', 2],
                ['botReplyPayment', 'Payment / bKash / COD questions', 2],
                ['botReplyDefault', 'Default reply (any other question)', 2],
                ['chatAgentJoinedTemplate', 'Shown when an agent joins the chat', 1],
                ['chatAgentClosedTemplate', 'Shown when an agent closes the chat', 1],
              ] as [keyof StoreSettings, string, number][]
            ).map(([field, label, rows]) => (
              <div key={field}>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
                <textarea
                  rows={rows}
                  value={(form[field] as string) || ''}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-y leading-relaxed"
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Turn the switch off to silence the bot completely — customers then only hear from real agents.</p>
        </div>

        {/* Submit (store settings only) */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving Settings...' : 'Save All Settings'}</span>
          </button>
        </div>
      </form>

      {/* Admin Security Password — a completely separate form with its own button */}
      <form
        onSubmit={handlePasswordSubmit}
        className="bg-white rounded-xl p-6 border border-amber-200/80 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-amber-600">
            <Lock className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">
              Admin Master Account Password
            </h3>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            Primary Administrator
          </span>
        </div>

        <p className="text-xs text-slate-600">
          Change the master admin password here. It applies immediately to every administrator account on every device (sign in with your admin email or the <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800">admin</code> alias). Passwords are stored as salted PBKDF2 hashes in Firestore — never in plain text. This is saved separately from the store settings above.
        </p>

        {passwordChanged && (
          <div className="max-w-md flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium animate-in fade-in">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Admin password updated. Use the new password on your next sign in.
          </div>
        )}

        {passwordError && (
          <div className="max-w-md px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {passwordError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              New Admin Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 5 characters"
                autoComplete="new-password"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Confirm New Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type the new password"
              autoComplete="new-password"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isSavingPassword || !newPassword || !confirmPassword}
            className="px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock className="w-4 h-4" />
            <span>{isSavingPassword ? 'Updating Password...' : 'Update Admin Password'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
