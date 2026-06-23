export const profileSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  profilePhotoUrl: true,
  role: true,
  mustChangePassword: true,
  createdAt: true,
};

export function formatUserProfile(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    profilePhotoUrl: user.profilePhotoUrl,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}
