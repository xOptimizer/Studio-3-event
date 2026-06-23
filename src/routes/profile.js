import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePasswordChanged } from '../middleware/auth.js';
import { formatUserProfile, profileSelect } from '../lib/userProfile.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads/profiles');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.user.userId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
  },
});

const updatePhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^[\d\s+\-().]+$/, 'Invalid phone number format'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

router.get('/', requireAuth, requirePasswordChanged, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: profileSelect,
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: formatUserProfile(user) });
});

router.patch('/', requireAuth, requirePasswordChanged, async (req, res) => {
  const parsed = updatePhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid phone number', details: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { phone: parsed.data.phone },
    select: profileSelect,
  });

  res.json({ user: formatUserProfile(user) });
});

router.post('/photo', requireAuth, requirePasswordChanged, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5MB' : err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No photo uploaded. Use field name "photo".' });
    return;
  }

  const profilePhotoUrl = `/uploads/profiles/${req.file.filename}`;

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { profilePhotoUrl },
    select: profileSelect,
  });

  res.json({ user: formatUserProfile(user) });
});

router.post('/change-password', requireAuth, requirePasswordChanged, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid password data', details: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!matches) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  res.json({ success: true, message: 'Password updated successfully' });
});

export default router;
