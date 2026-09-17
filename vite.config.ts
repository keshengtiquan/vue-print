import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import vueDevTools from "vite-plugin-vue-devtools";

export default () => {
  return defineConfig({
    server: {
      port: 3500
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    plugins: [vue(), tailwindcss(), vueDevTools()]
  });
};
