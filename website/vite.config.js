import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// the app's version at build time, used until the github api answers
const appVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// served from https://greenythebeany.github.io/BeanyIK/
export default defineConfig({
  base: '/BeanyIK/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
});
