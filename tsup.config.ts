import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bot: 'src/bot/index.ts',
    workers: 'src/workers/index.ts'
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: process.env.NODE_ENV === 'production',
  target: 'node20',
  esbuildOptions(options) {
    options.conditions = ['node']
  },
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
})
