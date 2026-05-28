import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    define: {
      __API_URL__: JSON.stringify(
        env.VITE_API_URL || "https://anchor-fleetpro-production.up.railway.app"
      ),
    },
    server: {
      port: 3000,
      proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            charts: ["recharts"],
          },
        },
      },
    },
  };
});

