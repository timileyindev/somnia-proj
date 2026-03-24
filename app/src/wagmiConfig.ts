import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { defineChain } from 'viem'
import { http } from 'wagmi'

const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 50312)
const rpcUrl =
  (import.meta.env.VITE_RPC_URL as string | undefined)?.trim() ||
  'https://rpc.invalid.missing-env'

/** Same network the app reads from (VITE_RPC_URL + VITE_CHAIN_ID). */
export const targetChain = defineChain({
  id: chainId,
  name: (import.meta.env.VITE_NETWORK_NAME as string) || 'Somnia Testnet',
  nativeCurrency: { name: 'SOMI', symbol: 'SOMI', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
})

/**
 * WalletConnect / RainbowKit require a Reown (WalletConnect Cloud) project ID.
 * Free: https://cloud.reown.com — needed for the modal’s QR / WalletConnect option;
 * MetaMask and other injected wallets still work once this is set.
 */
const walletConnectProjectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() || ''

if (!walletConnectProjectId && import.meta.env.DEV) {
  console.warn(
    '[Somnia Autopilot] Add VITE_WALLETCONNECT_PROJECT_ID to .env (free at https://cloud.reown.com) for full RainbowKit / WalletConnect support.',
  )
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Somnia Autopilot',
  projectId: walletConnectProjectId || '00000000000000000000000000000000',
  chains: [targetChain],
  transports: {
    [targetChain.id]: http(rpcUrl),
  },
  ssr: false,
})
