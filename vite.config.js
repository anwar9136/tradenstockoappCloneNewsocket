import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: [
        'Android >= 4.4', // Support Android 4.4+ (Chrome 30+)
        'Chrome >= 30',
        'Safari >= 7',
        'iOS >= 7'
      ],
      modernPolyfills: true,
      renderLegacyChunks: true,
      additionalLegacyPolyfills: [
        'regenerator-runtime/runtime'
      ],
      polyfills: [
        'es.symbol',
        'es.array.filter',
        'es.promise',
        'es.promise.finally',
        'es/map',
        'es/set',
        'es.array.for-each',
        'es.object.define-properties',
        'es.object.define-property',
        'es.object.get-own-property-descriptor',
        'es.object.get-own-property-descriptors',
        'es.object.keys',
        'es.array.push',
        'es.array.concat',
        'es.array.slice',
        'es.array.join',
        'es.string.split',
        'es.string.replace',
        'es.string.match',
        'es.regexp.exec',
        'es.array.map',
        'es.array.reduce',
        'es.array.reduce-right',
        'es.array.find',
        'es.array.find-index',
        'es.array.includes',
        'es.string.includes',
        'es.string.starts-with',
        'es.string.ends-with',
        'es.number.is-nan',
        'es.number.is-finite',
        'web.dom-collections.for-each',
        'web.timers',
        'web.immediate'
      ]
    })
  ],
  server: {
    port: 3001,
    host: '0.0.0.0',
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok.app',
      '.localhost.run',
      '.trycloudflare.com'
    ],
    proxy: {
      '/api': {
        target: 'https://www.tradenstocko.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
  build: {
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
    target: 'es2015',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      },
      target: 'es2015',
    }
  }
})