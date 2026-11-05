import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Image, X, MessageSquare, Hash, Lock, Users, Smile, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../context/authStore';
import { chatService, vendorService } from '../../services/api';

// Team chat, saved on the server. Each fleet has its own channels, shared with
// its workshop. Workshop users pick which fleet's chat they are in.
// New messages arrive by checking every few seconds.

const POLL_MS = 4000;
const SUMMARY_MS = 20000;
const COLORS = ['bg-teal', 'bg-amber-500', 'bg-anchor-blue', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-600'];
const EMOJIS = ['👍', '✅', '🔧', '⚠️', '🚗', '💰', '📋', '🔴', '🟡', '🟢'];
const ROLE = { SUPER_ADMIN: 'Super Admin', OEM_ADMIN: 'Workshop Admin', WORKSHOP_STAFF: 'Workshop Staff', FLEET_MANAGER: 'Fleet Manager',
  MAINTENANCE_SUPERVISOR: 'Maintenance Supervisor', FIELD_AGENT: 'Field Agent', DRIVER: 'Driver' };

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const colorFor = (id = '') => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const errMsg = (e, fb) => e?.response?.data?.error || fb;

function ts(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (now.toDateString() === d.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
const fullTs = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Last-read time per fleet+channel, kept in this browser only (for the unread dots).
const readKey = (vendorId, ch) => `fa-chat-read:${vendorId}:${ch}`;
const getRead = (vendorId, ch) => { try { return localStorage.getItem(readKey(vendorId, ch)) || ''; } catch { return ''; } };
const setRead = (vendorId, ch, iso) => { try { localStorage.setItem(readKey(vendorId, ch), iso); } catch { /* storage unavailable */ } };

// Shrink photos before sending so they stay well under the server's 500 KB limit.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = 1280, quality = 0.78, out = '';
      for (let i = 0; i < 5; i++) {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', quality);
        if (out.length < 650 * 1024) return resolve(out);
        max *= 0.75; quality -= 0.08;
      }
      reject(new Error('Image is too large even after shrinking'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image')); };
    img.src = url;
  });
}

export default function TeamChatPage() {
  const user = useAuthStore((s) => s.user);
  const isFleetUser = !!user?.vendorId;

  const [fleets, setFleets] = useState([]);
  const [vendorId, setVendorId] = useState(user?.vendorId || '');
  const [summary, setSummary] = useState(null);
  const [channel, setChannel] = useState('general');
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const lastAtRef = useRef(null);

  // Workshop users: load the fleets they can reach and pick the first.
  useEffect(() => {
    if (isFleetUser) return;
    vendorService.list({ limit: 100 })
      .then((res) => {
        const list = res.data.data || [];
        setFleets(list);
        setVendorId((v) => v || list[0]?.id || '');
      })
      .catch(() => toast.error('Could not load fleets'));
  }, [isFleetUser]);

  const loadSummary = useCallback(async () => {
    if (!vendorId) return;
    try { setSummary((await chatService.summary(isFleetUser ? undefined : vendorId)).data); } catch { /* keep the last one */ }
  }, [vendorId, isFleetUser]);

  useEffect(() => {
    loadSummary();
    const t = setInterval(loadSummary, SUMMARY_MS);
    return () => clearInterval(t);
  }, [loadSummary]);

  const vid = isFleetUser ? undefined : vendorId;

  // Load the channel, then keep fetching only newer messages.
  useEffect(() => {
    if (!vendorId) return undefined;
    let stop = false;
    setMsgs([]);
    lastAtRef.current = null;
    setLoading(true);

    const pull = async (first) => {
      try {
        const res = await chatService.messages(channel, vid, first ? undefined : lastAtRef.current || undefined);
        if (stop) return;
        const rows = res.data.data || [];
        if (first) setMsgs(rows);
        else if (rows.length) setMsgs((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...rows.filter((m) => !seen.has(m.id))];
        });
        if (rows.length) {
          lastAtRef.current = rows[rows.length - 1].createdAt;
          setRead(vendorId, channel, lastAtRef.current);
        }
      } catch (e) {
        if (first && !stop) toast.error(errMsg(e, 'Could not load messages'));
      } finally {
        if (first && !stop) setLoading(false);
      }
    };

    pull(true);
    const t = setInterval(() => { if (document.visibilityState === 'visible') pull(false); }, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [vendorId, channel, vid]);

  // Keep the newest message in view when already near the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);

  const channels = summary?.channels || [];
  const ch = channels.find((c) => c.id === channel) || { id: channel, name: channel, desc: '', canWrite: true };
  const members = summary?.members || [];

  const send = async () => {
    const text = input.trim();
    if ((!text && !imagePreview) || sending) return;
    setSending(true);
    try {
      const res = await chatService.send(channel, vid, { text, imageData: imagePreview || undefined });
      const m = res.data.data;
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      lastAtRef.current = m.createdAt;
      setRead(vendorId, channel, m.createdAt);
      setInput('');
      setImagePreview(null);
      setShowEmoji(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 30);
    } catch (e) {
      toast.error(errMsg(e, 'Message not sent'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (m) => {
    try {
      await chatService.remove(m.id, vid);
      setMsgs((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      toast.error(errMsg(e, 'Could not delete the message'));
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error('Max image size is 15 MB'); return; }
    try { setImagePreview(await compressImage(file)); } catch (err) { toast.error(err.message); }
  };

  const canModerate = ['OEM_ADMIN', 'SUPER_ADMIN', 'FLEET_MANAGER'].includes(user?.role);

  const grouped = useMemo(() => {
    const out = [];
    let lastDate = '';
    msgs.forEach((m) => {
      const d = new Date(m.createdAt).toDateString();
      if (d !== lastDate) {
        out.push({ type: 'divider', key: `d-${d}`, label: d === new Date().toDateString() ? 'Today' : new Date(m.createdAt).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }) });
        lastDate = d;
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    });
    return out;
  }, [msgs]);

  if (!isFleetUser && fleets.length === 0) {
    return (
      <div className="content text-center py-16 text-[var(--text3)]">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Team chat opens once you have at least one fleet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left: channels + members (hidden on phones) */}
      <div className="hidden md:flex w-48 border-r border-white/[0.08] flex-col flex-shrink-0" style={{ backgroundColor: '#0a1628' }}>
        {!isFleetUser && (
          <div className="px-3 pt-3">
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Fleet</div>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="form-input py-1.5 text-[12px]" aria-label="Fleet">
              {fleets.map((f) => <option key={f.id} value={f.id}>{f.companyName}</option>)}
            </select>
          </div>
        )}
        <div className="px-3 py-3 border-b border-white/[0.08]">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Channels</div>
          {channels.map((c) => {
            const unread = c.id !== channel && c.lastAt && c.lastAt > getRead(vendorId, c.id);
            return (
              <button key={c.id} onClick={() => setChannel(c.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left mb-0.5 transition-colors
                  ${channel === c.id ? 'bg-white/[0.10] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/80'}`}>
                {c.canWrite ? <Hash className="w-3 h-3 flex-shrink-0" /> : <Lock className="w-3 h-3 flex-shrink-0" />}
                <span className="text-[12px] truncate">{c.name}</span>
                {unread && <span className="ml-auto w-2 h-2 rounded-full bg-teal flex-shrink-0" aria-label="New messages" />}
              </button>
            );
          })}
        </div>
        <div className="px-3 py-3 flex-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Members ({members.length})
          </div>
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1.5">
              <div className="relative flex-shrink-0">
                <div className={`w-6 h-6 rounded-full ${colorFor(m.id)} flex items-center justify-center text-[9px] font-bold text-white`}>{initials(m.name)}</div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0a1628]
                  ${m.status === 'online' ? 'bg-green-400' : m.status === 'away' ? 'bg-amber-400' : 'bg-white/20'}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-white/80 truncate">{m.name}</div>
                <div className="text-[10px] text-white/30 truncate">{ROLE[m.role] || m.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.08] flex-shrink-0 flex-wrap" style={{ backgroundColor: '#0d1f38' }}>
          <Hash className="w-4 h-4 text-[var(--text3)] flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white">{ch.name}</div>
            <div className="text-[11px] text-white/40 truncate">
              {[summary?.vendor?.name, ch.desc].filter(Boolean).join(' · ')}
            </div>
          </div>
          {/* Phones: pickers replace the side list */}
          {!isFleetUser && (
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} aria-label="Fleet" className="md:hidden form-input w-auto max-w-[45%] py-1.5">
              {fleets.map((f) => <option key={f.id} value={f.id}>{f.companyName}</option>)}
            </select>
          )}
          <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel" className="md:hidden form-input w-auto max-w-[45%] py-1.5">
            {(channels.length ? channels : [ch]).map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {loading && <div className="text-center text-xs text-white/30 py-6">Loading messages…</div>}
          {grouped.map((item) => {
            if (item.type === 'divider') return (
              <div key={item.key} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[10px] text-white/30 font-medium px-2">{item.label}</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>
            );
            const m = item.msg;
            const mine = m.mine;
            return (
              <div key={m.id} className={`flex gap-2.5 group ${mine ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full ${colorFor(m.user.id)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5`}>
                  {initials(m.user.name)}
                </div>
                <div className={`max-w-[78%] sm:max-w-[65%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-white/80">{m.user.name}</span>
                      <span className="text-[10px] text-white/30">{ROLE[m.user.role] || m.user.role}</span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap
                    ${mine ? 'bg-teal text-white rounded-tr-sm' : 'bg-white/[0.07] text-white/90 rounded-tl-sm'}`}>
                    {m.imageData && <img src={m.imageData} alt="Shared" className="rounded-lg max-w-full mb-1.5 max-h-60 object-cover" />}
                    {m.text && <span>{m.text}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-[10px] text-white/30" title={fullTs(m.createdAt)}>{ts(m.createdAt)}</span>
                    {(mine || canModerate) && (
                      <button onClick={() => remove(m)} title="Delete message" aria-label="Delete message"
                        className="h-4 text-white/20 hover:text-anchor-red opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-white/25">
              <MessageSquare className="w-8 h-8 mb-2" />
              <p className="text-sm">No messages yet in #{ch.name}</p>
              {ch.canWrite && <p className="text-xs mt-1">Start the conversation below</p>}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {imagePreview && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="relative inline-block">
              <img src={imagePreview} alt="Preview" className="h-20 rounded-lg object-cover border border-white/[0.12]" />
              <button onClick={() => setImagePreview(null)} aria-label="Remove image"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-anchor-red flex items-center justify-center">
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        )}

        {showEmoji && (
          <div className="px-4 pb-1 flex-shrink-0">
            <div className="flex gap-1.5 flex-wrap border border-white/[0.10] rounded-xl p-2" style={{ backgroundColor: '#0d1f38' }}>
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => { setInput((i) => i + e); setShowEmoji(false); inputRef.current?.focus(); }}
                  className="text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </div>
        )}

        {!ch.canWrite ? (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.08] text-[11px] text-white/40 flex-shrink-0">
            <Lock className="w-3.5 h-3.5" /> This channel is read-only for your role.
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-white/[0.08] flex-shrink-0" style={{ backgroundColor: '#0d1f38' }}>
            <div className="flex items-end gap-2 border border-white/[0.12] rounded-xl px-3 py-2" style={{ backgroundColor: '#0a1628' }}>
              <div className="flex gap-1.5 mb-0.5 flex-shrink-0">
                <button onClick={() => setShowEmoji((s) => !s)} aria-label="Emoji" className="text-white/40 hover:text-white/70 transition-colors">
                  <Smile className="w-4 h-4" />
                </button>
                <button onClick={() => fileRef.current?.click()} aria-label="Attach photo" title="Attach a photo"
                  className="text-white/40 hover:text-white/70 transition-colors">
                  <Image className="w-4 h-4" />
                </button>
              </div>
              <textarea ref={inputRef} value={input} maxLength={4000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message #${ch.name}`}
                className="flex-1 bg-transparent text-[13px] text-white placeholder-white/25 outline-none resize-none max-h-24"
                rows={1} />
              <button onClick={send} disabled={(!input.trim() && !imagePreview) || sending} aria-label="Send"
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal flex items-center justify-center disabled:opacity-30 hover:opacity-90 transition-opacity">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <p className="text-[10px] text-white/25 mt-1.5 ml-1 hidden sm:block">Enter to send · Shift+Enter for a new line · Photos are shrunk automatically</p>
          </div>
        )}
      </div>
    </div>
  );
}
