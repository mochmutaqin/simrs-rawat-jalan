import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server mem-proxy API supaya frontend cukup memanggil path relatif:
//   /api/*   -> backend Yii   (default http://localhost:8080)
//   /node/*  -> services-node (default http://localhost:3001), prefix /node dibuang
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.YII_URL || 'http://localhost:8080', changeOrigin: true },
        // regex (bukan prefix biasa) agar tidak ikut menangkap /node_modules milik Vite
        '^/node/': {
          target: env.NODE_URL || 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/node/, ''),
        },
      },
    },
    preview: { port: 4173 },
  };
});
