/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { contentParserPlugin } from './src/plugins/vite-content-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    contentParserPlugin({
      contentRoot: path.resolve(__dirname, 'content'),
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['vite.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: false, // Use existing public/manifest.json
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB to accommodate large search index
        globPatterns: [
          '**/*.{js,css,html}',
          'content-manifest.json',
          'search-index.json',
          'content/**/*.json',
        ],
        runtimeCaching: [
          {
            // Cache-first for content JSON files
            urlPattern: /\/content\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'content-json-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            // Cache-first for images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            // Stale-while-revalidate for app shell (HTML/JS/CSS)
            urlPattern: /\.(?:js|css|html)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-shell-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
          {
            // Cache-first for content-manifest.json and search-index.json
            urlPattern: /\/(content-manifest|search-index)\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'manifest-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Isolate heavy rendering libraries into their own chunks
          // so they only load when content actually uses them
          'vendor-mermaid': ['mermaid'],
          'vendor-katex': ['katex'],
          'vendor-recharts': ['recharts'],
          'vendor-sql': ['sql.js'],
          'vendor-cytoscape': ['cytoscape'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
    },
  },
})
