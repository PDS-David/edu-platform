// client/src/pages/PlatformOversightPage.jsx
//
// Frontend for server/routes/platformRoutes.js's owner-only endpoints
// (GET /api/platform/admins, GET /api/platform/timeline,
// POST /api/platform/admins/:id/pause, POST /api/platform/admins/:id/unpause).
// See server/middleware/ownerOnly.js's own header comment for the full
// design reasoning this page is built to match exactly — summarized here
// because it directly shapes what this file does and does NOT do:
//
// - The real access control is entirely server-side (PLATFORM_OWNER_EMAILS,
//   checked against req.user.email on every request). This page does NOT
//   hardcode owner emails, does NOT read any owner-email config (there is
//   none to read — nothing under client/ has access to that env var by
//   design), and does NOT gate its own rendering on any client-side email
//   check. It always attempts the real requests and renders whatever comes
//   back — the server decides who gets real data.
// - ownerOnly deliberately returns 404, not 403, to a non-owner — so an
//   App Admin who finds this URL and loads it sees nothing suggesting a
//   restricted feature exists. This page preserves that exactly: any 404
//   from either GET renders the app's OWN existing NotFound page
//   (imported directly, not re-implemented) with no partial UI, no
//   flash of a pause button, and no "you don't have permission" message
//   anywhere. A different failure (500, network) gets a plain, generic
//   error state instead — genuinely distinct from "not found", since only
//   the 404 case needs to stay indistinguishable from a missing route.
// - Not linked from AdminLayout's ADMIN_NAV_ITEMS or anywhere else —
//   reachable only by navigating to /admin/platform-oversight directly.
//   That's the only sense in which this is "hidden": obscurity, not
//   security — the real protection is server-side, exactly as
//   ownerOnly.js's own comment says.

import { useState, useEffect, useCallback } from 'react';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import NotFound from './NotFound';
import {
  Loader2, ShieldAlert, ShieldCheck, Pause, Play, Clock, AlertTriangle,
} from 'lucide-react';

const Toast = ({ message, type, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border
    ${type === 'success' ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-600'}`}>
    {message}
    <button onClick={onClose} className="text-gray-300 hover:text-gray-500 ml-1">×</button>
  </div>
);

export default function PlatformOversightPage() {
  const { user } = useAuth();

  const [state, setState] = useState('loading'); // 'loading' | 'ok' | 'not-found' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [admins, setAdmins] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [toast, setToast] = useState(null);
  const [actingOn, setActingOn] = useState(null); // admin id currently mid-action
  const [reasonDrafts, setReasonDrafts] = useState({}); // admin id -> in-progress reason text

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [adminsRes, timelineRes] = await Promise.all([
        api.get('/platform/admins'),
        api.get('/platform/timeline', { params: { admin_only: true, limit: 50 } }),
      ]);
      setAdmins(adminsRes.data);
      setTimeline(timelineRes.data);
      setState('ok');
    } catch (err) {
      if (err?.status === 404) {
        setState('not-found');
      } else {
        setErrorMsg(err?.message || 'Something went wrong.');
        setState('error');
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePause = async (admin) => {
    const reason = (reasonDrafts[admin.id] || '').trim();
    if (!reason) { showToast('A reason is required to pause an account.', 'error'); return; }
    if (!window.confirm(`Pause ${admin.first_name} ${admin.last_name} (${admin.email})? This ends their active session immediately.`)) return;

    setActingOn(admin.id);
    try {
      await api.post(`/platform/admins/${admin.id}/pause`, { reason });
      showToast(`${admin.email} paused.`);
      setReasonDrafts(prev => ({ ...prev, [admin.id]: '' }));
      load();
    } catch (err) {
      showToast(err?.message || 'Could not pause this account.', 'error');
    } finally {
      setActingOn(null);
    }
  };

  const handleUnpause = async (admin) => {
    const reason = (reasonDrafts[admin.id] || '').trim();
    if (!window.confirm(`Unpause ${admin.first_name} ${admin.last_name} (${admin.email})?`)) return;

    setActingOn(admin.id);
    try {
      await api.post(`/platform/admins/${admin.id}/unpause`, reason ? { reason } : {});
      showToast(`${admin.email} unpaused.`);
      setReasonDrafts(prev => ({ ...prev, [admin.id]: '' }));
      load();
    } catch (err) {
      showToast(err?.message || 'Could not unpause this account.', 'error');
    } finally {
      setActingOn(null);
    }
  };

  if (state === 'loading') {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  }

  // Deliberately identical to what a genuinely missing route renders — see
  // this file's header comment for why that indistinguishability matters.
  if (state === 'not-found') {
    return <NotFound />;
  }

  if (state === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertTriangle size={24} className="mx-auto text-red-400 mb-3" />
        <p className="text-sm text-gray-500">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h1 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <ShieldAlert size={20} className="text-violet-500" /> Platform Oversight
      </h1>
      <p className="text-sm text-gray-500 mb-8">Visible only to platform owner accounts — see server/middleware/ownerOnly.js.</p>

      {/* ── Admin accounts ─────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Admin accounts ({admins.length})</h2>
        <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {admins.map(a => {
            const isSelf = a.id === user?.id;
            const isPaused = !a.is_active;
            return (
              <div key={a.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {a.first_name} {a.last_name}
                      {isSelf && <span className="ml-2 text-xs text-gray-400 font-normal">(you)</span>}
                      {isPaused && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Paused</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.last_login_at
                        ? `Last login ${new Date(a.last_login_at).toLocaleString()}${a.last_login_ip ? ` from ${a.last_login_ip}` : ''}`
                        : 'No recorded login'}
                    </p>
                  </div>

                  {!isSelf && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        value={reasonDrafts[a.id] || ''}
                        onChange={e => setReasonDrafts(prev => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder={isPaused ? 'Reason (optional)' : 'Reason (required)'}
                        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      {isPaused ? (
                        <button onClick={() => handleUnpause(a)} disabled={actingOn === a.id}
                          className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-40">
                          {actingOn === a.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Unpause
                        </button>
                      ) : (
                        <button onClick={() => handlePause(a)} disabled={actingOn === a.id}
                          className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40">
                          {actingOn === a.id ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />} Pause
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Activity timeline ──────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <Clock size={14} /> Recent admin activity
        </h2>
        <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
          {timeline.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No recorded activity yet.</div>
          ) : timeline.map((t, i) => (
            <div key={i} className="px-4 py-2.5 text-xs flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-700">{t.actor_email || 'unknown'}</span>
                <span className="text-gray-400"> — {t.event}</span>
                {t.target_email && <span className="text-gray-400"> → {t.target_email}</span>}
              </div>
              <div className="text-gray-400 shrink-0 flex items-center gap-2">
                {t.ip_address && <span>{t.ip_address}</span>}
                <span>{new Date(t.occurred_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
