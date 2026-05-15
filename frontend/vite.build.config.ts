import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
// import { obfuscator } from "rollup-obfuscator";

export default defineConfig({
  // plugins: [react(), cssInjectedByJsPlugin()],
  plugins: [react()],
  build: {
    outDir: "build",
    rollupOptions: {
      plugins: [
        // obfuscator({
        //   compact: true,
        //   controlFlowFlattening: true,
        //   controlFlowFlatteningThreshold: 0.5,
        //   deadCodeInjection: true,
        //   deadCodeInjectionThreshold: 0.2,
        //   stringArray: true,
        //   stringArrayEncoding: ["base64"],
        //   stringArrayThreshold: 0.5,
        //   renameGlobals: false,
        //   selfDefending: true,
        // }),
      ],
      output: {
        manualChunks: undefined,
        codeSplitting: false,
      },
    },
    cssCodeSplit: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      // mangle: {
      //   toplevel: true,
      // },
    },
  },
});
