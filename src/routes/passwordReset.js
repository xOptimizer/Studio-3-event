import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { createPasswordResetOtp, verifyPasswordResetOtp } from '../services/otp.js';
import { sendPasswordResetOtpEmail } from '../services/email.js';

const router = Router();

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const GENERIC_MESSAGE =
  'If an account exists for that email, a verification code has been sent.';

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const otp = await createPasswordResetOtp(user.id);
    await sendPasswordResetOtpEmail({ to: user.email, name: user.name, otp });
  }

  res.json({ success: true, message: GENERIC_MESSAGE });
});

router.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reset data', details: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired verification code' });
    return;
  }

  const validOtp = await verifyPasswordResetOtp(user.id, parsed.data.otp);
  if (!validOtp) {
    res.status(400).json({ error: 'Invalid or expired verification code' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  res.json({ success: true, message: 'Password reset successfully. You can log in with your new password.' });
});

export default router;
