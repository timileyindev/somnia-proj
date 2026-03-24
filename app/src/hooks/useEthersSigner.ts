import { useEffect, useState } from 'react'
import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { useAccount } from 'wagmi'

/**
 * Bridges the connected wagmi wallet to an ethers v6 signer for existing contract code.
 */
export function useEthersSigner(): JsonRpcSigner | null {
  const { status, connector, chainId } = useAccount()
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null)

  useEffect(() => {
    let cancelled = false

    if (status !== 'connected' || !connector) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setSigner(null)
        }
      })
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const providerUnknown = await connector.getProvider()
        if (!providerUnknown || cancelled) {
          return
        }
        const browserProvider = new BrowserProvider(
          providerUnknown as import('ethers').Eip1193Provider,
        )
        const next = await browserProvider.getSigner()
        if (!cancelled) {
          setSigner(next)
        }
      } catch {
        if (!cancelled) {
          setSigner(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [status, connector, chainId])

  return signer
}
