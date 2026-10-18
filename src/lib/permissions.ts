// Shared (client + server) access-control model. Contains no secrets.
//
// A permission is either '*' (full admin) or '<section>:<action>'.
// 'write' implies 'read'.

export const SECTIONS = [
  'dashboard',
  'categories',
  'names',
  'analytics',
  'activity',
  'comments',
  'chat-moderation',
  'global-chat',
  'valuations',
  'notifications',
] as const

export type Section = (typeof SECTIONS)[number]
export type Action = 'read' | 'write'
export type Permission = '*' | `${Section}:${Action}`

// Landing page for each section, used to send restricted users somewhere they can go
export const SECTION_PATHS: Record<Section, string> = {
  dashboard: '/',
  categories: '/categories/dashboard',
  names: '/names',
  analytics: '/analytics',
  activity: '/activity',
  comments: '/comments',
  'chat-moderation': '/chat-moderation',
  'global-chat': '/global-chat',
  valuations: '/valuations/settings',
  notifications: '/notifications',
}

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value)
}

export function parsePermission(value: string): Permission | null {
  const [section, action] = value.trim().split(':')
  if (!section || !isSection(section)) return null
  if (action !== 'read' && action !== 'write') return null
  return `${section}:${action}`
}

export function hasFullAccess(permissions: readonly Permission[]): boolean {
  return permissions.includes('*')
}

// Omitting section means "full admin only"
export function can(permissions: readonly Permission[], section?: Section, action: Action = 'read'): boolean {
  if (hasFullAccess(permissions)) return true
  if (!section) return false
  if (permissions.includes(`${section}:write`)) return true
  return action === 'read' && permissions.includes(`${section}:read`)
}

export function firstAllowedPath(permissions: readonly Permission[]): string | null {
  const section = SECTIONS.find((s) => can(permissions, s))
  return section ? SECTION_PATHS[section] : null
}
