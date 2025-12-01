import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Generate a version based on the current timestamp (YYYY.MM.DD.HHmm)
  const now = new Date();
  const buildVersion = `${now.getFullYear()}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getDate().toString().padStart(2, '0')}.${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;

  return {
    plugins: [react()],
    define: {
      // This ensures process.env.API_KEY is replaced with the actual value during build/serve
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Inject the generated build version
      'process.env.BUILD_VERSION': JSON.stringify(buildVersion),
      // Polyfill process.env for other usages if necessary
      'process.env': JSON.stringify(env)
    }
  };
});