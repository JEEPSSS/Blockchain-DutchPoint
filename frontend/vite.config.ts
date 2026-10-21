import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // .env lives at the repository root, next to .env.example
  envDir: "..",
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
