import { encodeAbiParameters, keccak256, parseAbi, toHex, type Abi, type Hex } from 'viem';
import { creditAbi, engineAbi, registryAbi } from '../src/monad/abi.js';
import { C, deployer, handler, publicClient, sendTx, valid } from './_lib.js';

const DEFAULT_SB = 6674321;
const BACKDATE = BigInt(75 * 86400);
const backdateAbi = parseAbi(['function demoBackdate(bytes32) view returns (uint64)']);

/** Every step checks on-chain state first, so the whole call is safe to repeat or race. */
export default handler(async ({ exporter, sb }) => {
  if (!valid(exporter)) throw Object.assign(new Error('invalid exporter'), { status: 400 });
  const n = sb === undefined || sb === null ? DEFAULT_SB : sb;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1 || n > 999_999_999) {
    throw Object.assign(new Error('sb must be an integer between 1 and 999999999'), { status: 400 });
  }
  const { wallet } = deployer();
  const sbHash = keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'address' }], [`SB ${n}`, exporter]));
  const txs: Hex[] = [];
  const steps: Record<string, Hex | 'skipped'> = {};
  const write = async (step: string, address: typeof C.registry, abi: Abi, functionName: string, args: unknown[]) => {
    const { hash } = await sendTx(() => wallet.writeContract({ address, abi, functionName, args } as never));
    txs.push(hash);
    steps[step] = hash;
  };
  const read = (address: typeof C.registry, abi: Abi, functionName: string, args: unknown[]) =>
    publicClient.readContract({ address, abi, functionName, args } as never) as Promise<readonly unknown[]>;

  const bill = await read(C.registry, registryAbi as Abi, 'bills', [sbHash]);
  if (Number(bill[5]) === 0) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    await write('register', C.registry, registryAbi as Abi, 'registerShippingBill', [sbHash, keccak256(toHex('IEC-DEMO')), exporter, 4_875_000n, '0x555344', now, 0n]);
  } else steps.register = 'skipped';

  if (n === DEFAULT_SB) {
    const rec = await read(C.credit, creditAbi as Abi, 'records', [exporter]);
    if (Number(rec[0]) === 0 && Number(rec[3]) === 0) await write('creditSeed', C.credit, creditAbi as Abi, 'seed', [exporter, 2, 2, 60_000_000_000n]);
    else steps.creditSeed = 'skipped';

    const pos = await read(C.engine, engineAbi as Abi, 'positions', [sbHash]);
    // only while not financed, and skip when already set so a repeat call sends nothing
    const cur = (await read(C.engine, backdateAbi as Abi, 'demoBackdate', [sbHash])) as unknown as bigint;
    if (Number(pos[7]) === 0 && cur !== BACKDATE) await write('backdate', C.engine, engineAbi as Abi, 'setDemoBackdate', [sbHash, BACKDATE]);
    else steps.backdate = 'skipped';
  }
  return { sbHash, sb: n, skipped: txs.length === 0, steps, txs };
});
