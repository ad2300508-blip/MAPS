import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// When deploying to GitHub Pages the assets are served from /MAPS/ sub-path.
// Locally (npm run dev) we keep the root path.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Cache the app shell for offline access
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          // Cache CARTO map tiles (stale-while-revalidate)
          {
            urlPattern: /^https:\/\/basemaps\.cartocdn\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'carto-tiles', expiration: { maxEntries: 200 } },
          },
          // Cache Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-webfonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      manifest: {
        name: 'VIA — Navigazione',
        short_name: 'VIA',
        description: 'VIA — navigazione next-gen. Mappe vettoriali 3D, multi-modale, 100% gratuita.',
        lang: 'it',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        screenshots: [
          {
            label: 'Navigazione 3D con HUD e indicazioni in italiano',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
