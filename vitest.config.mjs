import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/utils/**/*.{test,spec}.{ts,tsx}',
      'tests/hooks/**/*.{test,spec}.{ts,tsx}',
      'tests/services/**/*.{test,spec}.{ts,tsx}',
      'tests/store/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules/**', 'tests/integration/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react-native-get-random-values': path.resolve(
        __dirname,
        './tests/mocks/react-native-get-random-values.js',
      ),
    },
  },
});
