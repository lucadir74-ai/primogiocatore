import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Indirizzo pubblico per l'anteprima dei link condivisi (og:image vuole
// un indirizzo completo). Su Vercel arriva da solo; si può forzare con
// la variabile SITO_PUBBLICO (es. https://www.esempio.it).
const sito = (
  process.env.SITO_PUBBLICO
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || ''
).replace(/\/$/, '')

const indirizzoPubblico = {
  name: 'indirizzo-pubblico',
  transformIndexHtml: (html) => html.replaceAll('%SITO%', sito),
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Librerie a parte: cambiano di rado, quindi restano in cache fra un
        // aggiornamento dell'app e l'altro.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [
    react(),
    indirizzoPubblico,
    VitePWA({
      // La versione nuova aspetta e si propone (src/aggiornamento.js): prima
      // ricaricava la pagina da sola, anche mentre si stava scrivendo.
      registerType: 'prompt',
      // Il manifesto è già scritto a mano in public/
      manifest: false,
      includeAssets: ['apple-touch-icon.png', 'icona-192.png', 'icona-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Le immagini per l'anteprima dei link servono a WhatsApp, non all'app.
        globIgnores: ['anteprima-*.png', 'anteprima_logo.png', 'prova.png'],
        cleanupOutdatedCaches: true,
        // I dati non passano da qui: le letture le tiene da parte l'app
        // (src/memoriaRete.js), divise per account, e le usa solo quando
        // la rete manca, dicendolo.
        navigateFallback: '/index.html',
        // Gli indirizzi /api sono del server, non dell'app: aperti nel
        // browser devono arrivare a Vercel, non finire sulla pagina dell'app.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // I caratteri di Google servono all'aspetto, non ai dati:
            // tenerli da parte evita una pagina sgraziata senza rete.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'caratteri',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Le copertine dei giochi: se non arrivano, pazienza.
            urlPattern: /^https:\/\/cf\.geekdo-images\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'copertine',
              // Le immagini di un altro sito arrivano «opache» (stato 0):
              // senza questa riga non venivano tenute affatto.
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
