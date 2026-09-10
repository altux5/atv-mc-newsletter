import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import dotenv from 'dotenv'
import { localAuthPlugin } from './dev/localAuthPlugin'

dotenv.config()

// https://vitejs.dev/config/
declare const process: { env: Record<string, string | undefined> }
const isCiBuild = process.env.VITE_CI_BUILD === '1'
const proxyPort = process.env.PROXY_PORT || '8788'

export default defineConfig(({ mode }) => ({
  plugins: [react(), localAuthPlugin(loadEnv(mode, '.', '').MIAMI_CLIENT_ID || 'MIAMI_ATVPRD')],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${proxyPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    // Keep minify off by default; terser/esbuild can spike memory in CI
    minify: false,
    // In CI low-memory mode, disable chunking and heavy rollup features
    rollupOptions: isCiBuild
      ? {
          treeshake: false,
          output: {
            inlineDynamicImports: true,
            // Fewer chunks can lower memory spikes
            manualChunks: undefined,
            hoistTransitiveImports: false,
          },
        }
      : undefined,
    // Smaller JS target can reduce transformation work
    target: isCiBuild ? 'es2019' : 'es2020',
    // Limit parallel transform workers in low-memory envs
    cssMinify: isCiBuild ? false : undefined,
    // Avoid reporting compressed size (allocates buffers)
    reportCompressedSize: false,
    // Disable CSS code splitting to reduce graph
    cssCodeSplit: isCiBuild ? false : undefined,
  },
}))



