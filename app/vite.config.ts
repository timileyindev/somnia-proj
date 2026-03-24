import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appModules = path.join(__dirname, 'node_modules')
const rootModules = path.join(__dirname, '..', 'node_modules')

function resolveDep(name: string): string {
  const inApp = path.join(appModules, name)
  if (fs.existsSync(inApp)) return inApp
  return path.join(rootModules, name)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom', 'wagmi', 'viem'],
    alias: {
      react: resolveDep('react'),
      'react-dom': resolveDep('react-dom'),
      // RainbowKit is hoisted to root; point wagmi/viem at install locations (workspace layout).
      wagmi: resolveDep('wagmi'),
      viem: resolveDep('viem'),
      'react-is': resolveDep('react-is'),
    },
  },
  optimizeDeps: {
    include: [
      '@tanstack/react-query',
      'wagmi',
      'viem',
      '@rainbow-me/rainbowkit',
    ],
  },
  server: {
    port: 5173,
  },
})
