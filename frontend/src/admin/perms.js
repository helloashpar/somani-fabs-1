// What the signed-in admin may do. Mirrors backend/permissions.py: super admins
// can do everything; staff only what their permissions allow. The server
// checks every action too; this only hides what would be refused.
export function isSuper(user) {
  return user?.role === "super";
}

export function can(user, key) {
  return isSuper(user) || !!user?.permissions?.[key];
}

// Order and grouping of the permission matrix in Admins.
export const PERM_GROUPS = ["sessions", "customers", "history", "reports", "setup"];
