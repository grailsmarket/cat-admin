export const REFERRER_SOURCES: Record<string, string> = {
  // Grails has two referral codes: legacy (pre ENS v2) and current. Both count as 'grails'.
  '0x0000000000000000000000007e491cde0fbf08e51f54c4fb6b9e24afbd18966d': 'grails',
  '0x000000000000000000000000387e4fd48122a6b6fe4717c5351860a43e35c852': 'grails',
  '0x000000000000000000000000f919a96d2970380b87917b04f02e6d3d08368b10': 'vision',
  '0x0000000000000000000000001c0ea438837302b4516ac3f380313061ec11760f': 'snipezone',
  '0x000000000000000000000000efce7f86fd1efb0359a91c873e6dee9f98788713': 'enstools',
  '0x0000000000000000000000009531c059098e3d194ff87febb587ab07b30b1306': 'rotki',
  '0x000000000000000000000000486b883dbbe12b342efc5d4685343611dd4b2c18': 'namewhisper',
}

export const SOURCE_NAMES = ['grails', 'vision', 'snipezone', 'enstools', 'rotki', 'namewhisper', 'direct'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]

export const SOURCE_COLORS: Record<SourceName, string> = {
  grails: '#3b82f6',
  vision: '#f59e0b',
  snipezone: '#06b6d4',
  enstools: '#8b5cf6',
  rotki: '#10b981',
  namewhisper: '#ec4899',
  direct: '#9ca3af',
}

// Sources hidden from the analytics page (still counted in totals)
export const HIDDEN_SOURCES: readonly SourceName[] = ['rotki', 'enstools', 'snipezone']

export function buildReferrerCaseExpression(): string {
  const cases = Object.entries(REFERRER_SOURCES)
    .map(([hash, name]) => `WHEN referrer = '${hash}' THEN '${name}'`)
    .join('\n      ')
  return `CASE\n      ${cases}\n      ELSE 'direct'\n    END`
}
