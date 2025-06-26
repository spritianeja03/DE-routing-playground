import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api/hs-proxy/decide-gateway': {
        target: 'https://sandbox.hyperswitch.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hs-proxy\/decide-gateway/, '/decide-gateway'),
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      },
      '/api/hs-proxy/update-gateway-score': {
        target: 'https://sandbox.hyperswitch.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hs-proxy\/update-gateway-score/, '/update-gateway-score'),
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      },
    },
  },
  define: {
    'process.env': {}
  }
})
