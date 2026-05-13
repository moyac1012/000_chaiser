import { clerkClient } from "@clerk/nextjs/server";

export type UserPermission = "admin" | "tournament:create";

const KNOWN_PERMISSIONS = new Set<UserPermission>([
  "admin",
  "tournament:create",
]);

function normalizePermission(value: string): UserPermission | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return KNOWN_PERMISSIONS.has(trimmed as UserPermission)
    ? (trimmed as UserPermission)
    : null;
}

function addPermissionsFromList(
  value: unknown,
  into: Set<UserPermission>,
): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizePermission(item);
    if (normalized) into.add(normalized);
  }
}

function addPermissionFromRole(
  value: unknown,
  into: Set<UserPermission>,
): void {
  if (typeof value !== "string") return;
  const normalized = normalizePermission(value);
  if (normalized) into.add(normalized);
}

function extractPermissions(metadata: unknown): Set<UserPermission> {
  const permissions = new Set<UserPermission>();
  if (!metadata || typeof metadata !== "object") return permissions;
  const record = metadata as Record<string, unknown>;
  addPermissionsFromList(record.permissions, permissions);
  addPermissionsFromList(record.roles, permissions);
  addPermissionFromRole(record.role, permissions);
  return permissions;
}

export async function resolveUserPermissions(
  userId: string,
): Promise<Set<UserPermission>> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const permissions = extractPermissions(user.publicMetadata);
    const privatePermissions = extractPermissions(user.privateMetadata);
    for (const permission of privatePermissions) {
      permissions.add(permission);
    }
    return permissions;
  } catch {
    return new Set<UserPermission>();
  }
}

export function hasPermission(
  permissions: Set<UserPermission>,
  permission: UserPermission,
): boolean {
  return permissions.has("admin") || permissions.has(permission);
}

export async function canCreateTournament(userId: string): Promise<boolean> {
  const permissions = await resolveUserPermissions(userId);
  return hasPermission(permissions, "tournament:create");
}

export async function canManageTournament(
  userId: string,
  ownerId: string,
): Promise<boolean> {
  if (userId === ownerId) return true;
  const permissions = await resolveUserPermissions(userId);
  return permissions.has("admin");
}
