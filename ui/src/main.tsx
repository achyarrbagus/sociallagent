import { BrowserRouter } from "@/lib/router";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { startChunkLoadRecovery } from "./lib/chunk-load-recovery";
import { getOrCreatePaperclipReactRoot } from "./lib/react-root";
import "@mdxeditor/editor/style.css";
import "./index.css";

startChunkLoadRecovery();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("SocialAgent root element is missing");

getOrCreatePaperclipReactRoot(window, rootElement).render(
  <AppProviders router={BrowserRouter}>
    <App />
  </AppProviders>,
);
