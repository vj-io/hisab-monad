import { createPublicClient, defineChain, encodeAbiParameters, formatUnits, http, keccak256, zeroAddress, BaseError, ContractFunctionRevertedError, decodeErrorResult, type Address, type Hex } from 'viem';
import dep from './deployments.json';
import { errorsAbi } from './abi';

export const GRACE = 15 * 86400;
export const STATUS = ['NONE', 'FINANCED', 'REALISED', 'PARTIAL', 'DEFAULTED'] as const;
export const REG_OPEN = 1;

export const monad = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [dep.rpcUrl] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: dep.explorer } },
});

export const publicClient = createPublicClient({ chain: monad, transport: http(dep.rpcUrl), pollingInterval: 200 }); // Monad blocks are ~400 ms; viem default polling is 4 s
export const C = dep.contracts as Record<'roles' | 'registry' | 'token' | 'engine' | 'pool' | 'credit' | 'ausd', Address>;
export const deployed = C.engine !== zeroAddress && C.pool !== zeroAddress;
export const txUrl = (h: string) => `${dep.explorer}/tx/${h}`;

export const DEFAULT_SB = 6674321;
const activeKey = (e: Address) => `hisab-monad-active-sb-${e.toLowerCase()}`;
/** The shipping-bill number the UI currently shows for an exporter (default SB 6674321). */
export function activeSb(exporter: Address): number {
  try { const n = Number(localStorage.getItem(activeKey(exporter))); if (Number.isSafeInteger(n) && n > 0) return n; } catch { /* storage unavailable */ }
  return DEFAULT_SB;
}
export function setActiveSb(exporter: Address, n: number) {
  try { localStorage.setItem(activeKey(exporter), String(n)); } catch { /* ignore */ }
}
/** sbHash = keccak256(abi.encode("SB <n>", exporter)); n defaults to the exporter's active bill. */
export const sbHashFor = (exporter: Address, sb: number = activeSb(exporter)): Hex =>
  keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'address' }], [`SB ${sb}`, exporter]));

/** AUSD (6 dp) to "1,234.56" (rounded to 2 dp). */
export function fmtAusd(v: bigint | undefined | null): string {
  if (v === undefined || v === null) return 'n/a';
  const cents = (v + 5000n) / 10000n;
  return `${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2, '0')}`;
}
export const exactAusd = (v: bigint) => formatUnits(v, 6);
export const fmtMon = (v: bigint | undefined) => (v === undefined ? 'n/a' : Number(formatUnits(v, 18)).toFixed(3));
export const fmtDate = (ts: bigint | number) => (Number(ts) ? new Date(Number(ts) * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'n/a');
export const parseAusd = (s: string): bigint => {
  const [w, f = ''] = s.trim().replace(/,/g, '').split('.');
  return BigInt(w || '0') * 1_000_000n + BigInt((f + '000000').slice(0, 6));
};

/** Friendly message; custom error name when it can be decoded. */
export function errMessage(e: unknown): { name?: string; text: string } {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) {
      const name = rev.data?.errorName;
      if (name) return { name, text: name };
      if (rev.reason) return { text: rev.reason };
    }
    const raw = e.walk((x) => typeof (x as { data?: unknown }).data === 'string') as { data?: Hex } | null;
    if (raw?.data?.startsWith('0x')) {
      try {
        const d = decodeErrorResult({ abi: errorsAbi, data: raw.data });
        return { name: d.errorName, text: d.errorName };
      } catch { /* not ours */ }
    }
    if (/user rejected|denied/i.test(e.message)) return { text: 'Rejected in wallet' };
    return { text: e.shortMessage };
  }
  return { text: e instanceof Error ? e.message : String(e) };
}
