import { createPublicClient, http, parseAbiItem, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { GRAILS_ETH_ROUTER } from '@/constants/referrers'

// Server-only: reads GrailsETHRouter logs so ETH-paid Grails transactions can be told apart.

const PAID_WITH_ETH = parseAbiItem(
  'event PaidWithETH(address indexed payer, uint256 ethSpent, uint256 usdcBought, uint256 usdcRefunded)'
)

// The hotbox RPC rejects eth_getLogs spans over 10,000 blocks
const MAX_RANGE = BigInt(10_000)
const PARALLEL_REQUESTS = 8
const REFRESH_MS = 60_000

let client: PublicClient | null = null

function getClient(): PublicClient {
  if (!client) {
    const url = process.env.ETH_RPC_URL
    if (!url) throw new Error('ETH_RPC_URL environment variable is not set')
    client = createPublicClient({
      chain: mainnet,
      transport: http(url, { retryCount: 3 }),
    })
  }
  return client
}

// Router tx hashes seen so far, and the next block to scan. Kept for the life of the server
// process, so after the first request only new blocks are read.
const state = {
  hashes: new Set<string>(),
  nextBlock: GRAILS_ETH_ROUTER.deployBlock,
  checkedAt: 0,
  pending: null as Promise<void> | null,
}

async function scanNewBlocks() {
  const rpc = getClient()
  const head = await rpc.getBlockNumber()
  const ranges: Array<[bigint, bigint]> = []
  for (let from = state.nextBlock; from <= head; from += MAX_RANGE) {
    const to = from + MAX_RANGE - BigInt(1)
    ranges.push([from, to > head ? head : to])
  }

  for (let i = 0; i < ranges.length; i += PARALLEL_REQUESTS) {
    const results = await Promise.all(
      ranges.slice(i, i + PARALLEL_REQUESTS).map(([fromBlock, toBlock]) =>
        rpc.getLogs({
          address: GRAILS_ETH_ROUTER.address,
          event: PAID_WITH_ETH,
          fromBlock,
          toBlock,
        })
      )
    )
    for (const logs of results) {
      for (const log of logs) {
        if (log.transactionHash) state.hashes.add(log.transactionHash.toLowerCase())
      }
    }
  }

  state.nextBlock = head + BigInt(1)
  state.checkedAt = Date.now()
}

/** Hashes of every transaction that went through GrailsETHRouter (lowercase). */
export async function getRouterTxHashes(): Promise<string[]> {
  if (Date.now() - state.checkedAt > REFRESH_MS) {
    state.pending ??= scanNewBlocks().finally(() => {
      state.pending = null
    })
    await state.pending
  }
  return [...state.hashes]
}
