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

// Referrer codes that count as Grails (legacy + current)
export const GRAILS_REFERRERS = Object.entries(REFERRER_SOURCES)
  .filter(([, source]) => source === 'grails')
  .map(([hash]) => hash)

// GrailsETHRouter: pays for ENSv2 registrations/renewals in ETH by swapping to USDC, then calls
// BulkRegistrationV2. It emits PaidWithETH once per call, which is how the market share page
// tells ETH-paid Grails activity apart from USDC/DAI.
export const GRAILS_ETH_ROUTER = {
  address: '0x83827712df81af5a85a532a6bf08c3f74d1fc707',
  deployBlock: BigInt(26288756), // 2026-10-28
} as const

// Relayer wallets that submit ENSv2 smart-account transactions: one transaction per user, gas paid
// in USDC, a per-name resolver deployed. Very likely the official ENS app, but that's inferred from
// on-chain behaviour (identified 2026-11-03). Add new relayer wallets here if the ENS app rotates them.
export const SMART_ACCOUNT_RELAYERS = ['0x46565eedb0bb948ae787dd105cce300f736da28e']

// First ENSv2 registrar/renewer event on mainnet (2026-10-27 06:45 UTC)
export const ENSV2_LAUNCH_DATE = '2026-10-27'
