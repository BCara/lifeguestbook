export type Role = "owner" | "admin" | "moderator" | "trusted";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  trusted: "Trusted contributor",
};

const RANK: Record<Role, number> = { trusted: 0, moderator: 1, admin: 2, owner: 3 };

export type Permission = "view_dashboard" | "moderate" | "manage_settings" | "manage_members" | "billing" | "delete" | "transfer";

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  switch (permission) {
    case "view_dashboard":
    case "moderate":
      return RANK[role] >= RANK.moderator;
    case "manage_settings":
    case "manage_members":
    case "billing":
      return RANK[role] >= RANK.admin;
    case "delete":
    case "transfer":
      return role === "owner";
  }
}

/** Who may give which role: admins can add anyone below owner; nobody hands out "owner" except via transfer. */
export function canAssign(actor: Role | null | undefined, target: Role): boolean {
  if (!can(actor, "manage_members")) return false;
  return target !== "owner";
}

/** Whether `actor` may remove or change a member who currently has `current`. */
export function canChangeMember(actor: Role | null | undefined, current: Role): boolean {
  if (!can(actor, "manage_members")) return false;
  if (current === "owner") return false;
  if (current === "admin") return actor === "owner" || actor === "admin";
  return true;
}
