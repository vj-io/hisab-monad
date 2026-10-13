import { createPublicClient, createWalletClient, http, isAddress, type Address, type Hex, type TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dep from '../src/monad/deployments.json' with { type: 'json' };

export interface Req { method?: string; body?: unknown }
export interface Res { status(c: number): Res; json(b: unknown): void }

const rpc = process.env.MONAD_RPC_URL || dep.rpcUrl;
export const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
export const C = dep.contracts as Record<string, Address>;
export const publicClient = createPublicClient({ chain, transport: http(rpc), pollingInterval: 200 });

export function deployer() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex);
  return { account, wallet: createWalletClient({ account, chain, transport: http(rpc) }) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = /nonce too low|nonce has already been used|replacement transaction underpriced|already known|underpriced|fetch failed|http request failed|timed out|timeout|rate limit|too many requests|429|502|503|504|econnreset|econnrefused|etimedout|socket hang up|network/i;
const transient = (e: unknown) => {
  const x = e as { message?: string; shortMessage?: string; details?: string };
  return TRANSIENT.test(`${x.shortMessage ?? ''} ${x.details ?? ''} ${x.message ?? ''}`);
};

/** Send a deployer tx, retrying (max 3 attempts, small backoff) on nonce races and transient RPC errors,
 *  then wait for the receipt (also retried, without re-sending). Throws unless the receipt status is success.
 *  `send` is re-invoked per attempt so viem re-reads the pending nonce. */
export async function sendTx(send: () => Promise<Hex>): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
  let hash: Hex | undefined;
  for (let i = 0; !hash; i++) {
    try { hash = await send(); }
    catch (e) { if (i >= 2 || !transient(e)) throw e; await sleep(250 * (i + 1) + Math.random() * 250); }
  }
  for (let i = 0; ; i++) {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      if (receipt.status !== 'success') throw Object.assign(new Error(`transaction reverted (${hash})`), { status: 502 });
      return { hash, receipt };
    } catch (e) { if (i >= 2 || !transient(e)) throw e; await sleep(250 * (i + 1)); }
  }
}

export function body(req: Req): Record<string, unknown> {
  const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return (b ?? {}) as Record<string, unknown>;
}

export const valid = (a: unknown): a is Address => typeof a === 'string' && isAddress(a);

/** Wrap a handler: POST only, errors become 500 without leaking secrets. */
export function handler(fn: (b: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Req, res: Res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
      res.status(200).json(await fn(body(req)));
    } catch (e) {
      const err = e as { status?: number; shortMessage?: string; message?: string };
      res.status(err.status ?? 500).json({ error: err.shortMessage ?? err.message ?? 'failed' });
    }
  };
}
