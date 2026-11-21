import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function ensureCharset(value) {
  if (typeof value !== "string" || /charset=/i.test(value)) return value;
  if (/^(text\/html|text\/css|text\/javascript|application\/javascript|application\/json)\b/i.test(value)) {
    return `${value}; charset=utf-8`;
  }
  return value;
}

// React's dev preamble is injected at the start of <head>, ahead of the
// charset tag. Windows then sniffs the page as Windows-1252 and turns
// · — ₹ → into Â· / â€” / â‚¹ / â†’.
function utf8Charset() {
  return {
    name: "utf8-charset",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const tag = '<meta charset="UTF-8" />';
        const stripped = html.replace(/\s*<meta\s+charset=["']?utf-8["']?\s*\/?>/gi, "");
        return stripped.replace(/<head([^>]*)>/i, `<head$1>\n    ${tag}`);
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (name, value) => {
          if (typeof name === "string" && name.toLowerCase() === "content-type") value = ensureCharset(value);
          return setHeader(name, value);
        };
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [utf8Charset(), react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ["hankering-undertake-preset.ngrok-free.dev"],
    proxy: { "/api": { target: "http://127.0.0.1:4000", changeOrigin: true } },
  },
});
