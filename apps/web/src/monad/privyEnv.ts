export const PRIVY_APP_ID = ((import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_PRIVY_APP_ID ?? '').trim() || undefined;
export const privyEnabled = !!PRIVY_APP_ID;
