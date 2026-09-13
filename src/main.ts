import { createApp } from "vue";
import App from "@/App.vue";
import { initRouter } from "@/router";
import { initStore } from "./store";
import "@/styles/index.css";

const app = createApp(App);
initStore(app);
initRouter(app);
app.mount("#app");
