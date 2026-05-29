import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      // Babel fast refresh — faster HMR
      fastRefresh: true,
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 3000,
    proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
    // Minify with esbuild (faster and smaller than terser)
    minify: "esbuild",
    target: "es2020",
    rollupOptions: {
      output: {
        // Split chunks aggressively to maximise parallel loading
        manualChunks(id) {
          // Core React — always needed, load first
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom/")) {
            return "react-core";
          }
          // Charts — only loaded on analytics pages
          if (id.includes("recharts") || id.includes("d3-")) {
            return "charts";
          }
          // PDF generation — only loaded on invoice pages
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
            return "pdf";
          }
          // Excel — only on vehicle import
          if (id.includes("xlsx") || id.includes("papaparse")) {
            return "spreadsheet";
          }
          // Form libraries
          if (id.includes("react-hook-form") || id.includes("zod") || id.includes("@hookform")) {
            return "forms";
          }
          // Icons — large, worth splitting
          if (id.includes("lucide-react")) {
            return "icons";
          }
          // Everything else from node_modules
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
        // Consistent cache-busting filenames
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  // Optimise deps pre-bundling
  optimizeDeps: {
    include: [
      "react", "react-dom", "react-router-dom",
      "axios", "zustand", "react-hot-toast", "lucide-react",
    ],
    exclude: ["jspdf", "xlsx", "recharts"],
  },
});

