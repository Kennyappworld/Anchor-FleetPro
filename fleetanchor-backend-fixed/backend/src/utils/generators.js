const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.generateJobNumber = async () => {
  const count = await prisma.jobRequest.count();
  const num = String(count + 1).padStart(4, '0');
  const year = new Date().getFullYear().toString().slice(2);
  return `JB-${year}${num}`;
};

exports.generateInvoiceNumber = async () => {
  const count = await prisma.invoice.count();
  const num = String(count + 1).padStart(4, '0');
  const year = new Date().getFullYear().toString().slice(2);
  return `INV-${year}${num}`;
};
