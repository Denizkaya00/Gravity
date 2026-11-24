import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: {
        external: ['@ghostery/adblocker-electron']
      }
    }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          guest: resolve('src/preload/guest.ts')
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
