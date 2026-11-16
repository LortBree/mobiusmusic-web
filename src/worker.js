import { onRequestOptions, onRequestPost } from "../functions/api/dac-report.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/dac-report") {
      if (request.method === "OPTIONS") {
        return onRequestOptions();
      }
      if (request.method === "POST") {
        return onRequestPost({ request, env });
      }
      return new Response("Method Not Allowed", { status: 405 });
    }
    return env.ASSETS.fetch(request);
  },
};
