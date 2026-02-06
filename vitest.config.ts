import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Run tests sequentially to avoid shared database state issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
