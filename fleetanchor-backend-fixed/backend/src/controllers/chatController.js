// Team chat — one set of channels per fleet (vendor), shared with its workshop.
//
// Who can see a fleet's chat:
//  - the fleet's own users (their vendorId)
//  - workshop users (OEM_ADMIN / WORKSHOP_STAFF) of the OEM that fleet belongs to
//  - SUPER_ADMIN
// Fleet users can never pick another fleet; workshop users pass ?vendorId=.

const prisma = require('../config/prisma');
const { resolveVendorId, VENDOR_ROLES, isSuper, isOem } = require('../utils/tenant');

const CHANNELS = {
  general: { name: 'general', desc: 'Team-wide updates' },
  'oem-ops': { name: 'oem-ops', desc: 'Workshop ↔ fleet operations' },
  repairs: { name: 'active-repairs', desc: 'Live repair discussions' },
  billing: { name: 'billing', desc: 'Invoices & payments', writers: ['FLEET_MANAGER', 'OEM_ADMIN', 'SUPER_ADMIN'] },
};

const MAX_TEXT = 4000;
const MAX_IMAGE = 700 * 1024; // characters of data URL (≈500 KB image)
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

// Presence: last time each user polled the chat (single API instance on Render).
const seen = new Map();
const touch = (userId) => seen.set(userId, Date.now());
const statusOf = (userId) => {
  const t = seen.get(userId);
  if (!t) return 'offline';
  const age = Date.now() - t;
  return age < 60 * 1000 ? 'online' : age < 10 * 60 * 1000 ? 'away' : 'offline';
};

// Per-user send limit: 30 messages a minute.
const sends = new Map();
function allowSend(userId) {
  const now = Date.now();
  const list = (sends.get(userId) || []).filter((t) => now - t < 60 * 1000);
  if (list.length >= 30) { sends.set(userId, list); return false; }
  list.push(now);
  sends.set(userId, list);
  return true;
}

const canWrite = (role, channel) => !CHANNELS[channel].writers || CHANNELS[channel].writers.includes(role);

async function roomFor(req, res) {
  const u = req.user;
  if (!VENDOR_ROLES.includes(u.role) && !isOem(u) && !isSuper(u)) {
    res.status(403).json({ success: false, error: 'Chat is not available for your role' });
    return null;
  }
  const vendorId = await resolveVendorId(u, req.query.vendorId || req.body?.vendorId);
  if (!vendorId) {
    res.status(400).json({ success: false, error: isOem(u) || isSuper(u) ? 'Choose a fleet' : 'Your account is not linked to a fleet' });
    return null;
  }
  return vendorId;
}

const shape = (m, me) => ({
  id: m.id,
  channel: m.channel,
  text: m.text,
  imageData: m.imageData,
  createdAt: m.createdAt,
  mine: m.userId === me,
  user: { id: m.user.id, name: m.user.fullName, role: m.user.role },
});

const USER_SELECT = { id: true, fullName: true, role: true };

// GET /api/chat/summary?vendorId= — channels (with latest message time) and members
exports.summary = async (req, res, next) => {
  try {
    const vendorId = await roomFor(req, res);
    if (!vendorId) return;
    touch(req.user.userId);

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, companyName: true, oemId: true } });
    const latest = await prisma.chatMessage.groupBy({
      by: ['channel'], where: { vendorId, deletedAt: null }, _max: { createdAt: true }, _count: { _all: true },
    });
    const members = await prisma.user.findMany({
      where: {
        active: true, deletedAt: null,
        OR: [{ vendorId }, ...(vendor?.oemId ? [{ oemId: vendor.oemId, role: { in: ['OEM_ADMIN', 'WORKSHOP_STAFF'] } }] : [])],
      },
      select: USER_SELECT, orderBy: { fullName: 'asc' }, take: 200,
    });

    res.json({
      success: true,
      vendor: vendor && { id: vendor.id, name: vendor.companyName },
      channels: Object.entries(CHANNELS).map(([id, c]) => {
        const l = latest.find((x) => x.channel === id);
        return { id, name: c.name, desc: c.desc, canWrite: canWrite(req.user.role, id), count: l?._count._all || 0, lastAt: l?._max.createdAt || null };
      }),
      members: members.map((m) => ({ id: m.id, name: m.fullName, role: m.role, status: m.id === req.user.userId ? 'online' : statusOf(m.id) })),
    });
  } catch (e) { next(e); }
};

// GET /api/chat/:channel/messages?vendorId=&after=ISO
exports.list = async (req, res, next) => {
  try {
    const { channel } = req.params;
    if (!CHANNELS[channel]) return res.status(404).json({ success: false, error: 'No such channel' });
    const vendorId = await roomFor(req, res);
    if (!vendorId) return;
    touch(req.user.userId);

    const after = req.query.after ? new Date(String(req.query.after)) : null;
    const where = { vendorId, channel, deletedAt: null, ...(after && !isNaN(after) ? { createdAt: { gt: after } } : {}) };
    const rows = await prisma.chatMessage.findMany({
      where, include: { user: { select: USER_SELECT } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
    res.json({ success: true, data: rows.reverse().map((m) => shape(m, req.user.userId)) });
  } catch (e) { next(e); }
};

// POST /api/chat/:channel/messages  { text?, imageData?, vendorId? }
exports.send = async (req, res, next) => {
  try {
    const { channel } = req.params;
    if (!CHANNELS[channel]) return res.status(404).json({ success: false, error: 'No such channel' });
    const vendorId = await roomFor(req, res);
    if (!vendorId) return;
    if (!canWrite(req.user.role, channel)) return res.status(403).json({ success: false, error: 'This channel is read-only for your role' });
    if (!allowSend(req.user.userId)) return res.status(429).json({ success: false, error: 'You are sending messages too quickly' });

    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const imageData = typeof req.body.imageData === 'string' && req.body.imageData ? req.body.imageData : null;
    if (!text && !imageData) return res.status(400).json({ success: false, error: 'Message is empty' });
    if (text.length > MAX_TEXT) return res.status(400).json({ success: false, error: `Messages are limited to ${MAX_TEXT} characters` });
    if (imageData && (imageData.length > MAX_IMAGE || !IMAGE_RE.test(imageData))) {
      return res.status(400).json({ success: false, error: 'Images must be PNG, JPEG, WebP or GIF under 500 KB' });
    }

    const m = await prisma.chatMessage.create({
      data: { vendorId, channel, userId: req.user.userId, text: text || null, imageData },
      include: { user: { select: USER_SELECT } },
    });
    touch(req.user.userId);
    res.status(201).json({ success: true, data: shape(m, req.user.userId) });
  } catch (e) { next(e); }
};

// DELETE /api/chat/messages/:id — authors delete their own; admins can remove any in their reach
exports.remove = async (req, res, next) => {
  try {
    const vendorId = await roomFor(req, res);
    if (!vendorId) return;
    const m = await prisma.chatMessage.findFirst({ where: { id: req.params.id, vendorId, deletedAt: null } });
    if (!m) return res.status(404).json({ success: false, error: 'Message not found' });
    const moderator = ['OEM_ADMIN', 'SUPER_ADMIN', 'FLEET_MANAGER'].includes(req.user.role);
    if (m.userId !== req.user.userId && !moderator) return res.status(403).json({ success: false, error: 'You can only delete your own messages' });
    await prisma.chatMessage.update({ where: { id: m.id }, data: { deletedAt: new Date(), text: null, imageData: null } });
    res.json({ success: true });
  } catch (e) { next(e); }
};

exports.CHANNELS = CHANNELS;
