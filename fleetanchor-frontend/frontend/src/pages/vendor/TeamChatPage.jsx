import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Image, X, MessageSquare, Hash, Lock, Users, ChevronDown, Smile } from 'lucide-react';

/* ── Mock data ─────────────────────────────────────────────── */
const ME = { id:'me', name:'Adebayo Okafor', role:'Fleet Manager', initials:'AO', color:'bg-teal' };

const CHANNELS = [
  { id:'general',    name:'general',        desc:'Team-wide updates',           locked:false },
  { id:'oem-ops',    name:'oem-ops',         desc:'OEM ↔ Vendor operations',    locked:false },
  { id:'repairs',    name:'active-repairs',  desc:'Live repair discussions',     locked:false },
  { id:'billing',    name:'billing',         desc:'Invoices & payments',         locked:true  },
];

const MEMBERS = [
  { id:'ao', name:'Adebayo Okafor',   role:'Fleet Manager',         initials:'AO', color:'bg-teal',        status:'online' },
  { id:'ws', name:'Workshop Staff',   role:'Workshop Staff',        initials:'WS', color:'bg-amber-500',   status:'online' },
  { id:'oa', name:'OEM Admin',        role:'OEM Admin',             initials:'OA', color:'bg-anchor-blue', status:'away'   },
  { id:'em', name:'E. Maintenance',   role:'Maintenance Supervisor',initials:'EM', color:'bg-purple-500',  status:'offline'},
];

const SEED = {
  general: [
    { id:'1', user:{id:'ws',name:'Workshop Staff',initials:'WS',color:'bg-amber-500'},
      text:'Good morning team. Bay 3 is clear for new jobs today.', ts:'2026-05-28T08:02:00Z', type:'text' },
    { id:'2', user:{id:'oa',name:'OEM Admin',initials:'OA',color:'bg-anchor-blue'},
      text:'Noted. Please prioritise the Coca-Cola vehicles — they have a delivery deadline Friday.', ts:'2026-05-28T08:15:00Z', type:'text' },
    { id:'3', user:ME,
      text:'Understood. LND-421-XY alternator repair is marked critical.', ts:'2026-05-28T08:22:00Z', type:'text' },
  ],
  'oem-ops': [
    { id:'4', user:{id:'oa',name:'OEM Admin',initials:'OA',color:'bg-anchor-blue'},
      text:'New vendor PMC FAW Motors has been onboarded. Please reach out for their first job walkthrough.', ts:'2026-05-28T09:00:00Z', type:'text' },
  ],
  repairs: [
    { id:'5', user:{id:'ws',name:'Workshop Staff',initials:'WS',color:'bg-amber-500'},
      text:'JB-2647 — engine inspection done. Estimate ready for your approval.', ts:'2026-05-28T10:30:00Z', type:'text' },
    { id:'6', user:ME,
      text:'Reviewing now. Back in 5 min.', ts:'2026-05-28T10:33:00Z', type:'text' },
  ],
  billing: [
    { id:'7', user:{id:'oa',name:'OEM Admin',initials:'OA',color:'bg-anchor-blue'},
      text:'Invoice #INV-0042 confirmed paid. ₦142,000 received via Paystack.', ts:'2026-05-28T11:00:00Z', type:'text' },
  ],
};

function ts(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  const today = now.toDateString() === d.toDateString();
  if (today) return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function fullTs(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday:'short', day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

const EMOJIS = ['👍','✅','🔧','⚠️','🚗','💰','📋','🔴','🟡','🟢'];

export default function TeamChatPage() {
  const [channel, setChannel]   = useState('general');
  const [messages, setMessages] = useState(SEED);
  const [input, setInput]       = useState('');
  const [hovered, setHovered]   = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);
  const inputRef  = useRef(null);

  const ch = CHANNELS.find(c => c.id === channel);
  const msgs = messages[channel] || [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs, channel]);

  const send = () => {
    const text = input.trim();
    if (!text && !imagePreview) return;
    const msg = {
      id: Date.now().toString(),
      user: ME,
      text: text || '',
      ts: new Date().toISOString(),
      type: imagePreview ? 'image' : 'text',
      imageUrl: imagePreview || null,
    };
    setMessages(prev => ({ ...prev, [channel]: [...(prev[channel]||[]), msg] }));
    setInput('');
    setImagePreview(null);
    setShowEmoji(false);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Max file size is 5MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const isMe = (msg) => msg.user.id === 'me';

  // Group messages by date
  const grouped = [];
  let lastDate = '';
  msgs.forEach(m => {
    const d = new Date(m.ts).toDateString();
    if (d !== lastDate) { grouped.push({ type:'divider', label: d === new Date().toDateString() ? 'Today' : new Date(m.ts).toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long'}) }); lastDate = d; }
    grouped.push({ type:'msg', msg: m });
  });

  return (
    <div className="flex h-full" style={{ height:'calc(100vh - 48px)' }}>

      {/* Left: channel + member list */}
      <div className="w-44 border-r border-white/[0.08] flex flex-col flex-shrink-0" style={{ backgroundColor:'#0a1628' }}>
        <div className="px-3 py-3 border-b border-white/[0.08]">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Channels</div>
          {CHANNELS.map(c => (
            <button key={c.id} onClick={() => !c.locked && setChannel(c.id)}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left mb-0.5 transition-colors
                ${channel===c.id ? 'bg-white/[0.10] text-white' : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'}
                ${c.locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
              {c.locked ? <Lock className="w-3 h-3 flex-shrink-0"/> : <Hash className="w-3 h-3 flex-shrink-0"/>}
              <span className="text-[11px] truncate">{c.name}</span>
              {(messages[c.id]||[]).length > 0 && channel!==c.id && (
                <span className="ml-auto w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[8px] flex items-center justify-center font-bold flex-shrink-0">
                  {(messages[c.id]||[]).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-3 py-3 flex-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Users className="w-3 h-3"/> Members
          </div>
          {MEMBERS.map(m => (
            <div key={m.id} className="flex items-center gap-2 py-1.5">
              <div className="relative flex-shrink-0">
                <div className={`w-6 h-6 rounded-full ${m.color} flex items-center justify-center text-[9px] font-bold text-white`}>
                  {m.initials}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0a1628]
                  ${m.status==='online'?'bg-green-400':m.status==='away'?'bg-amber-400':'bg-white/20'}`}/>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-white/80 truncate">{m.name.split(' ')[0]}</div>
                <div className="text-[9px] text-white/30 truncate">{m.role.split(' ').slice(-1)[0]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.08] flex-shrink-0" style={{ backgroundColor:'#0d1f38' }}>
          <Hash className="w-4 h-4 text-[var(--text3)]"/>
          <div>
            <div className="text-[13px] font-semibold text-white">{ch?.name}</div>
            <div className="text-[10px] text-white/40">{ch?.desc} · {msgs.length} messages</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {grouped.map((item, i) => {
            if (item.type === 'divider') return (
              <div key={i} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-white/[0.06]"/>
                <span className="text-[10px] text-white/30 font-medium px-2">{item.label}</span>
                <div className="flex-1 h-px bg-white/[0.06]"/>
              </div>
            );
            const { msg: m } = item;
            const mine = isMe(m);
            return (
              <div key={m.id}
                onMouseEnter={() => setHovered(m.id)}
                onMouseLeave={() => setHovered(null)}
                className={`flex gap-2.5 group ${mine ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full ${m.user.color} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5`}>
                  {m.user.initials}
                </div>
                {/* Bubble */}
                <div className={`max-w-[65%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-white/80">{m.user.name}</span>
                      <span className="text-[9px] text-white/30">{m.user.role}</span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-3 py-2 text-[12px] leading-relaxed
                    ${mine
                      ? 'bg-[var(--accent)] text-white rounded-tr-sm'
                      : 'bg-white/[0.07] text-white/90 rounded-tl-sm'}`}>
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt="attachment" className="rounded-lg max-w-full mb-1.5 max-h-48 object-cover"/>
                    )}
                    {m.text && <span>{m.text}</span>}
                  </div>
                  {/* Timestamp — show on hover or always */}
                  <div className={`text-[9px] text-white/25 mt-1 px-1 transition-opacity
                    ${hovered===m.id ? 'opacity-100' : 'opacity-60'}`}
                    title={fullTs(m.ts)}>
                    {ts(m.ts)} {hovered===m.id && <span className="text-white/15">· {fullTs(m.ts)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-white/20">
              <MessageSquare className="w-8 h-8 mb-2"/>
              <p className="text-sm">No messages yet in #{ch?.name}</p>
              <p className="text-xs mt-1">Start the conversation below</p>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="relative inline-block">
              <img src={imagePreview} alt="preview" className="h-20 rounded-lg object-cover border border-white/[0.12]"/>
              <button onClick={() => setImagePreview(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-anchor-red flex items-center justify-center">
                <X className="w-3 h-3 text-white"/>
              </button>
            </div>
          </div>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div className="px-4 pb-1 flex-shrink-0">
            <div className="flex gap-1.5 flex-wrap border border-white/[0.10] rounded-xl p-2" style={{ backgroundColor:'#0d1f38' }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => { setInput(i => i + e); setShowEmoji(false); inputRef.current?.focus(); }}
                  className="text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        {ch?.locked ? (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.08] text-[11px] text-white/30 flex-shrink-0">
            <Lock className="w-3.5 h-3.5"/> This channel is read-only for your role.
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-white/[0.08] flex-shrink-0" style={{ backgroundColor:'#0d1f38' }}>
            <div className="flex items-end gap-2 border border-white/[0.12] rounded-xl px-3 py-2"
                 style={{ backgroundColor:'#0a1628' }}>
              <div className="flex gap-1.5 mb-0.5 flex-shrink-0">
                <button onClick={() => { setShowEmoji(s => !s); }}
                  className="text-white/30 hover:text-white/60 transition-colors">
                  <Smile className="w-4 h-4"/>
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="text-white/30 hover:text-white/60 transition-colors"
                  title="Attach image (max 5MB)">
                  <Image className="w-4 h-4"/>
                </button>
              </div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message #${ch?.name}… (Enter to send, Shift+Enter for new line)`}
                className="flex-1 bg-transparent text-[12px] text-white placeholder-white/25 outline-none resize-none max-h-24"
                rows={1}
              />
              <button onClick={send} disabled={!input.trim() && !imagePreview}
                className="flex-shrink-0 w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center
                           disabled:opacity-30 hover:opacity-90 transition-opacity mb-0.5">
                <Send className="w-3.5 h-3.5 text-white"/>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile}/>
            <p className="text-[9px] text-white/20 mt-1.5 ml-1">
              📎 Images only (max 5MB) · Video files not supported to keep the app fast
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
