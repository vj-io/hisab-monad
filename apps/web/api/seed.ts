import { encodeAbiParameters, keccak256, toHex, type Abi, type Hex } from 'viem';
import { creditAbi, engineAbi, registryAbi } from '../src/monad/abi.js';
import { C, deployer, handler, publicClient, valid } from './_lib.js';

export default handler(async ({ exporter }) => {
  if (!valid(exporter)) throw Object.assign(new Error('invalid exporter'), { status: 400 });
  const { wallet } = deployer();
  const sbHash = keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'address' }], ['SB 6674321', exporter]));
  const txs: Hex[] = [];
  // sequential with receipts: all four writes share the deployer nonce
  const write = async (address: typeof C.registry, abi: Abi, functionName: string, args: unknown[]) => {
    const hash = await wallet.writeContract({ address, abi, functionName, args } as never);
    await publicClient.waitForTransactionReceipt({ hash });
    txs.push(hash);
  };
  const bill = (await publicClient.readContract({ address: C.registry, abi: registryAbi, functionName: 'bills', args: [sbHash] })) as readonly unknown[];
  if (Number(bill[5]) !== 0) return { sbHash, skipped: true, txs };
  const now = BigInt(Math.floor(Date.now() / 1000));
  await write(C.registry, registryAbi as Abi, 'registerShippingBill', [sbHash, keccak256(toHex('IEC-DEMO')), exporter, 4_875_000n, '0x555344', now, 0n]);
  await write(C.credit, creditAbi as Abi, 'seed', [exporter, 2, 2, 60_000_000_000n]);
  await write(C.engine, engineAbi as Abi, 'setDemoBackdate', [sbHash, BigInt(75 * 86400)]);
  return { sbHash, skipped: false, txs };
});
