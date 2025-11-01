const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

/**
 * Copy webview files to dist directory
 */
function copyWebviewFiles() {
  const webviewSrc = path.join(__dirname, "src", "webview");
  const webviewDist = path.join(__dirname, "dist", "webview");

  // Create dist/webview directory if it doesn't exist
  if (!fs.existsSync(webviewDist)) {
    fs.mkdirSync(webviewDist, { recursive: true });
  }

  // Copy HTML, CSS, and JS files
  const filesToCopy = ["index.html", "styles.css", "script.js"];
  filesToCopy.forEach((file) => {
    const srcPath = path.join(webviewSrc, file);
    const distPath = path.join(webviewDist, file);
    fs.copyFileSync(srcPath, distPath);
    console.log(`Copied ${file} to dist/webview/`);
  });
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
    // Copy webview files in watch mode too
    copyWebviewFiles();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    // Copy webview files after build
    copyWebviewFiles();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
