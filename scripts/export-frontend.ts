import { exportFrontendArtifacts } from "./lib/export-frontend.js";

await exportFrontendArtifacts();
console.log("Exported contract ABIs to src/generated/");
