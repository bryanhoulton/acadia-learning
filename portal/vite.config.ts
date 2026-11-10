import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import { defineConfig, ViteDevServer } from "vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// Custom plugin to return 404 for missing LDraw files instead of SPA fallback
function ldrawFileHandler() {
  return {
    name: "ldraw-file-handler",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          // Check if request is for LDraw files (.dat, .ldr, .mpd)
          if (req.url && /\.(dat|ldr|mpd)$/i.test(req.url)) {
            const filePath = path.join(
              process.cwd(),
              "public",
              decodeURIComponent(req.url)
            );
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end("Not found");
              return;
            }
          }
          next();
        }
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ldrawFileHandler()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate Radix UI into its own chunk to avoid conflicts
          if (id.includes("@radix-ui")) {
            return "radix-ui";
          }
          // Separate slate-ui into its own chunk
          if (id.includes("slate-ui")) {
            return "slate-ui";
          }
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@radix-ui/react-slot"],
  },
});
