import { createPublicClient, createWalletClient, http, isAddress, type Address, type Hex } from 'viem';
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
