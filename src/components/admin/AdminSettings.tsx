import React, { useState } from 'react';
import { Settings, Save, CheckCircle2, MessageCircle, Truck, MapPin, Lock, Eye, EyeOff, ShieldCheck, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { StoreSettings } from '../../types';
import { api } from '../../services/api';
import type { CloudStatus } from '../../services/firestoreStore';

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

  // Firebase / Firestore connection status
  const [cloud, setCloud] = useState<CloudStatus>(() => api.getCloudStatus());
  const [checkingCloud, setCheckingCloud] = useState(false);

  const handleRecheckCloud = async () => {
    setCheckingCloud(true);
    try {
      setCloud(await api.checkCloud());
    } finally {
      setCheckingCloud(false);
    }
  };

  React.useEffect(() => {
    handleRecheckCloud();
  }, []);

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

      {/* Firebase Cloud Sync Status */}
      <div
        className={`rounded-xl p-5 border shadow-xs flex items-start justify-between gap-4 flex-wrap ${
          cloud.connected ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/70 border-amber-200'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          {cloud.connected ? (
            <Cloud className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <CloudOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          )}
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900">
              Firebase Cloud Sync:{' '}
              {checkingCloud ? 'Checking…' : cloud.connected ? 'Connected' : 'Not connected'}
            </h3>
            <p className="text-[11px] text-slate-500 break-all">
              Project <code className="bg-white/70 px-1 py-0.5 rounded font-mono">{cloud.projectId}</code> · Database{' '}
              <code className="bg-white/70 px-1 py-0.5 rounded font-mono">{cloud.databaseId}</code>
            </p>
            {cloud.connected ? (
              <p className="text-xs text-emerald-800">
                Products, categories, banners, settings, orders and user accounts are stored in Firestore and shared across every device and visitor.
              </p>
            ) : (
              <div className="text-xs text-amber-900 space-y-1">
                {cloud.lastErrorCode === 'api-disabled' ||
                cloud.lastErrorCode === 'database-missing' ||
                cloud.lastErrorCode === 'not-found' ? (
                  <div className="space-y-1.5">
                    <p>
                      The Firestore database has not been created in project{' '}
                      <span className="font-mono">{cloud.projectId}</span> yet (the app uses Cloud Firestore, not Realtime Database).
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5">
                      <li>
                        Open <strong>Firebase Console → Build → Firestore Database</strong> and click <strong>Create database</strong>.
                      </li>
                      <li>
                        Choose a location close to Bangladesh (e.g. <span className="font-mono">asia-south1</span> Mumbai) — either mode is fine.
                      </li>
                      <li>
                        Open the <strong>Rules</strong> tab, paste the contents of <span className="font-mono">firestore.rules</span> and click{' '}
                        <strong>Publish</strong>.
                      </li>
                      <li>Come back here and press <strong>Re-check</strong>.</li>
                    </ol>
                  </div>
                ) : cloud.lastErrorCode === 'permission-denied' ? (
                  <p>
                    Firestore rejected the request (<span className="font-mono">permission-denied</span>). Open{' '}
                    <strong>Firebase Console → Firestore Database</strong>
                    {cloud.databaseId !== '(default)' ? ', pick this database from the dropdown' : ''}, go to the{' '}
                    <strong>Rules</strong> tab, paste the contents of <span className="font-mono">firestore.rules</span> and click{' '}
                    <strong>Publish</strong>.
                  </p>
                ) : cloud.lastError ? (
                  <p>
                    Last error (<span className="font-mono">{cloud.lastErrorCode}</span>): {cloud.lastError}
                  </p>
                ) : (
                  <p>Waiting for the first connection check…</p>
                )}
                <p>Until the connection works, changes are saved on this device only.</p>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleRecheckCloud}
          disabled={checkingCloud}
          className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checkingCloud ? 'animate-spin' : ''}`} />
          Re-check
        </button>
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
