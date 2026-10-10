import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// served from https://greenythebeany.github.io/BeanyIK/
export default defineConfig({
  base: '/BeanyIK/',
  plugins: [react()],
});
