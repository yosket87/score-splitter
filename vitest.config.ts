import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/components/ui/**',
        '**/*.d.ts',
        'src/mocks/**',
        'src/app/**/loading.tsx',
        'src/instrumentation.ts',
      ],
      // 最終目標は80%。現状に合わせた下限から始め、テスト追加に合わせて段階的に引き上げる。
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 45,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/cache': path.resolve(__dirname, './tests/__mocks__/next-cache.ts'),
    },
  },
})
