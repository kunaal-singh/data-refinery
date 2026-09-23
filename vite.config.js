import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:8000' } }, build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules')) { if (/\/(recharts|d3-[^/]+)\//.test(id)) return 'charts-vendor'; if (/\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'; if (id.includes('/lucide-react/')) return 'icons-vendor'; if (id.includes('/papaparse/')) return 'parser-vendor'; } } } } } });
