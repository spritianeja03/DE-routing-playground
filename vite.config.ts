import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  
  build:{
    lib: {
      entry: path.resolve(__dirname, 'src/App.tsx'), // or index.ts
      name:"DERoutingPlayground",
      fileName: (format) => `index.${format}.js`, // Output file name
      formats: ['es', 'umd']
    },
    rollupOptions: {
      // Externalize React, ReactDOM
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        }
      }
    },

  },
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
      '/api/hs-proxy/merchant-account/create': {
        target: 'https://sandbox.hyperswitch.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hs-proxy/, ''),
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      },
      '/api/hs-proxy/rule/create': {
        target: 'https://sandbox.hyperswitch.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hs-proxy/, ''),
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      },
      '/api/hs-proxy/merchant-account/': {
        target: 'https://sandbox.hyperswitch.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hs-proxy/, ''),
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      },
      '/api/hs-proxy/rule/update': {
        target: 'https://sandbox.hyperswitch.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hs-proxy/, ''),
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
