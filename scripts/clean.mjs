import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const paths = [
  "dist",
  "dist-ssr",
  ".output",
  ".tanstack",
  ".nitro",
  "tsconfig.tsbuildinfo",
  "node_modules/.vite",
];

async function clean() {
  await Promise.all(
    paths.map(async (p) => {
      if (existsSync(p)) {
        console.log(`Removing ${p}...`);
        await rm(p, { recursive: true, force: true });
      }
    })
  );
  console.log("Cleaned stale build artifacts.");
}

clean().catch((err) => {
  console.error(err);
  process.exit(1);
});
