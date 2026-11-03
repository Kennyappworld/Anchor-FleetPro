const crypto = require('crypto');
const prisma = require('../config/prisma');

// Count-based numbers repeat once a record is deleted, and two requests at the
// same moment got the same number. Try the next numbers until one is free.
async function nextNumber(prefix, countFn, existsFn) {
  const year = new Date().getFullYear().toString().slice(2);
  let n = (await countFn()) + 1;
  for (let i = 0; i < 20; i++, n++) {
    const candidate = `${prefix}-${year}${String(n).padStart(4, '0')}`;
    if (!(await existsFn(candidate))) return candidate;
  }
  return `${prefix}-${year}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

exports.generateJobNumber = () => nextNumber('JB',
  () => prisma.jobRequest.count(),
  (jobNumber) => prisma.jobRequest.findFirst({ where: { jobNumber }, select: { id: true } }));

exports.generateInvoiceNumber = () => nextNumber('INV',
  () => prisma.invoice.count(),
  (invoiceNumber) => prisma.invoice.findFirst({ where: { invoiceNumber }, select: { id: true } }));
