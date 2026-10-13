import { Button } from '../ui/Button';
import { useToast } from '../components/Toasts';
import { useWallets, type Role } from './wallets';

/** Per-role email-wallet controls for the wallet bar. Renders nothing when VITE_PRIVY_APP_ID is unset. */
export function PrivyRoleControls({ role }: { role: Role }) {
  const { slots, privy, bindEmail, unbind, logoutEmail } = useWallets();
  const toast = useToast();
  if (!privy.enabled) return null;
  const slot = slots[role];
  const bound = slot.kind === 'privy';
  const fail = (e: unknown) => toast.push('error', e instanceof Error ? e.message : String(e));
  return (
    <>
      {bound && <span className="text-xs text-muted" title={slot.address}>{slot.email ?? privy.email ?? 'email wallet'}{slot.live ? '' : ' (connecting)'}</span>}
      {bound ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => unbind(role)}>Use burner</Button>
          <Button size="sm" variant="ghost" onClick={() => logoutEmail().catch(fail)}>Log out</Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={!privy.ready} onClick={() => bindEmail(role).catch(fail)}>Use email wallet</Button>
      )}
    </>
  );
}
