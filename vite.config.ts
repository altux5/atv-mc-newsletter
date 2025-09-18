import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
declare const process: { env: Record<string, string | undefined> }
const isCiBuild = process.env.VITE_CI_BUILD === '1'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    // Keep minify off by default; terser/esbuild can spike memory in CI
    minify: false,
    // In CI low-memory mode, disable HMR pre-bundling extras and chunking
    rollupOptions: isCiBuild
      ? {
          output: {
            // Fewer chunks can lower memory spikes
            manualChunks: undefined,
          },
        }
      : undefined,
    // Smaller JS target can reduce transformation work
    target: isCiBuild ? 'es2019' : 'es2020',
    // Limit parallel transform workers in low-memory envs
    cssMinify: isCiBuild ? false : undefined,
  },
})



