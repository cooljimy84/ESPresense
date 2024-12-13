import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import strip from '@rollup/plugin-strip';

export default defineConfig({
    plugins: [
        sveltekit(),
        strip({
            include: '**/*.(js|ts|svelte)',
            functions: ['console.*', 'assert.*'],
        }),
    ],
    build: {
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: () => 'index'
            }
        }
    },
    server: {
        proxy: {
            '/json': 'http://192.168.128.165',
            '/extras': 'http://192.168.128.165',
            '/ws': {
                target: 'ws://192.168.128.165',
                ws: true,
            }
        }
    }
});
