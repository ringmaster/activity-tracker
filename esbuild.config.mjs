import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import { compileModule } from "svelte/compiler";
import { readFile, copyFile } from "fs/promises";
import process from "process";
import builtins from "module";

const prod = process.argv[2] === "production";

/**
 * Custom plugin to compile .svelte.ts files through Svelte's compileModule.
 * esbuild-svelte only handles .svelte components; .svelte.ts module files
 * (which use runes like $state/$derived outside of components) need this.
 *
 * TypeScript is stripped via esbuild.transform before passing to compileModule,
 * since compileModule only accepts JavaScript.
 */
const svelteModulePlugin = {
  name: "svelte-module",
  setup(build) {
    // Resolve bare ".svelte" imports to ".svelte.ts" files when they exist on disk.
    // This lets `import { X } from "./foo.svelte"` find `./foo.svelte.ts`.
    // If no .svelte.ts file exists, fall through so esbuild-svelte handles .svelte components.
    build.onResolve({ filter: /\.svelte$/ }, async (args) => {
      if (args.kind === "import-statement") {
        const tsPath = args.path + ".ts";
        try {
          const resolved = await build.resolve(tsPath, {
            resolveDir: args.resolveDir,
            kind: args.kind,
            pluginName: "svelte-module",
          });
          if (!resolved.errors.length) {
            return { path: resolved.path, namespace: "file" };
          }
        } catch {
          // .svelte.ts doesn't exist; fall through to esbuild-svelte
        }
      }
      return null;
    });

    build.onLoad({ filter: /\.svelte\.ts$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");

      // Step 1: Strip TypeScript annotations with esbuild
      const stripped = await esbuild.transform(source, {
        loader: "ts",
        target: "esnext", // preserve class fields for compileModule
      });

      // Step 2: Compile runes with Svelte's compileModule
      const result = compileModule(stripped.code, {
        filename: args.path,
        dev: !prod,
        generate: "client",
      });

      for (const warning of result.warnings) {
        console.warn(`[svelte-module] ${args.path}: ${warning.message}`);
      }

      return {
        contents: result.js.code,
        loader: "js",
      };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins.builtinModules,
  ],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "build/main.js",
  minify: prod,
  mainFields: ["svelte", "browser", "module", "main"],
  conditions: ["svelte", "browser"],
  plugins: [
    svelteModulePlugin,
    esbuildSvelte({
      compilerOptions: {
        css: "injected",
        runes: true,
      },
    }),
  ],
});

async function copyStaticAssets() {
  await copyFile("manifest.json", "build/manifest.json");
  await copyFile("styles.css", "build/styles.css");
}

if (prod) {
  await context.rebuild();
  await copyStaticAssets();
  process.exit(0);
} else {
  await copyStaticAssets();
  await context.watch();
}
