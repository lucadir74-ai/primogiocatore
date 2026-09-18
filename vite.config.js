import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // L'aggiornamento avviene da solo: appena il telefono ritrova la
      // rete e si ricarica la pagina, prende la versione nuova. Senza,
      // resterebbe per sempre su quella salvata la prima volta.
      registerType: 'autoUpdate',
      // Il manifesto è già scritto a mano in public/
      manifest: false,
      includeAssets: ['apple-touch-icon.png', 'icona-192.png', 'icona-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        // I dati non si mettono in cache: una statistica vecchia è
        // peggio di una statistica assente.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // I caratteri di Google servono all'aspetto, non ai dati:
            // tenerli da parte evita una pagina sgraziata senza rete.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'caratteri',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Le copertine dei giochi: se non arrivano, pazienza.
            urlPattern: /^https:\/\/cf\.geekdo-images\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'copertine',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
