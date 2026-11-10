import "./index.css";
import "github-markdown-css/github-markdown-light.css";
import "katex/dist/katex.min.css";
import "swiper/css";

import { extend } from "colord";
import mixPlugin from "colord/plugins/mix";
import { resetContext } from "kea";
import { loadersPlugin } from "kea-loaders";
import { PostHogConfig } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";

import App from "./App";

extend([mixPlugin]);
resetContext({
  plugins: [
    loadersPlugin({
      onFailure({ error }) {
        toast.error(error.message);
      },
    }),
  ],
});

const options: Partial<PostHogConfig> = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
};

if (import.meta.env.PROD) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={options}
    >
      <App />
    </PostHogProvider>,
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
}
