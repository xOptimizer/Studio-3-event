import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function createPasswordResetOtp(userId) {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.passwordResetOtp.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.passwordResetOtp.create({
    data: { userId, codeHash, expiresAt },
  });

  return code;
}

export async function verifyPasswordResetOtp(userId, otp) {
  const record = await prisma.passwordResetOtp.findFirst({
    where: {
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return false;
  }

  const valid = await bcrypt.compare(otp, record.codeHash);
  if (!valid) {
    return false;
  }

  await prisma.passwordResetOtp.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return true;
}
