import {
  Plugin,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  MarkdownView,
  Platform,
  PluginSettingTab,
  App,
  Setting,
  TFile,
} from "obsidian";
import { mount, unmount } from "svelte";
import InlineView from "./components/InlineView.svelte";
import StickyBar from "./components/StickyBar.svelte";
import { EncounterState } from "./state/encounter-state.svelte";
import { parseEncounterYaml } from "./state/yaml-bridge";
import {
  loadLibrary,
  invalidateLibraryCache,
  scanLibraryCandidates,
  mergeCatalog,
  catalogToPaths,
  pathsStringToCatalog,
  deriveLabel,
  type LibraryCatalogEntry,
} from "./state/library-loader";
import { expandCombatants } from "./utils/id-generator";

interface ActivityTrackerSettings {
  partyNotePath: string;
  /** Persisted catalog of discovered library files and their enabled state.
   *  This is the source of truth; `libraryPaths` is derived from it on save. */
  libraryCatalog: LibraryCatalogEntry[];
  /** Derived comma-separated path string for runtime consumers (encounter
   *  state, action logger). Recomputed from libraryCatalog on save. */
  libraryPaths: string;
  codeBlockLanguage: string;
  debugOverlay: boolean;
}

const DEFAULT_SETTINGS: ActivityTrackerSettings = {
  partyNotePath: "party.yaml",
  libraryCatalog: [],
  libraryPaths: "library.yaml, weapons.yaml, srd-library.yaml",
  codeBlockLanguage: "dnd-combat",
  debugOverlay: false,
};

/** Diagnostic log visible in the code block when debug overlay is enabled. */
class DebugLog {
  private entries: string[] = [];
  private el: HTMLElement | null = null;
  enabled = false;

  log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    this.entries.push(`[${ts}] ${msg}`);
    if (this.entries.length > 50) this.entries.shift();
    this.render();
  }

  attach(parent: HTMLElement) {
    if (!this.enabled) return;
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.className = "dnd-debug-overlay";
    }
    parent.appendChild(this.el);
    this.render();
  }

  detach() {
    this.el?.remove();
  }

  private render() {
    if (!this.el || !this.enabled) return;
    this.el.textContent = this.entries.join("\n");
  }
}

export default class ActivityTrackerPlugin extends Plugin {
  settings: ActivityTrackerSettings = DEFAULT_SETTINGS;

  /** Active encounter states keyed by "filepath::encounter-name". Stable
   *  across writes that shift line numbers, unlike the prior lineStart-based
   *  key, so that block-resize from one encounter doesn't orphan another's
   *  state. */
  private encounterStates = new Map<string, EncounterState>();

  /** Mounted inline Svelte components keyed by element */
  private inlineComponents = new Map<HTMLElement, ReturnType<typeof mount>>();

  /** Debug diagnostic log */
  private debug = new DebugLog();

  /** The sticky bar DOM container and its Svelte component */
  private barContainer: HTMLDivElement | null = null;
  private barComponent: ReturnType<typeof mount> | null = null;
  private activeState: EncounterState | null = null;

  async onload() {
    await this.loadSettings();
    this.debug.enabled = this.settings.debugOverlay;
    this.addSettingTab(new ActivityTrackerSettingTab(this.app, this));

    this.debug.log(`onload: platform=${navigator.userAgent.includes("Mobile") ? "mobile" : "desktop"}`);

    // Apply a body class on iPhone so styles.css can guarantee a minimum
    // padding below the notch / Dynamic Island. iPad and desktop are
    // unaffected; the underlying env(safe-area-inset-top) rule still applies
    // everywhere and handles the typical case.
    if (Platform.isIosApp && Platform.isPhone) {
      document.body.classList.add("dnd-ios-phone");
    }

    // Load actions library
    loadLibrary(this.app, this.settings.libraryPaths);

    // Register the code block processor
    this.registerMarkdownCodeBlockProcessor(
      this.settings.codeBlockLanguage,
      (source, el, ctx) => this.processCodeBlock(source, el, ctx),
    );

    // Create the sticky bar container (not attached to DOM yet;
    // it gets inserted into the active leaf's view content on bindBar)
    this.barContainer = document.createElement("div");
    this.barContainer.classList.add("dnd-combat-bar-container");
    this.barContainer.style.display = "none";

    // Capture unhandled errors to the debug log
    if (this.settings.debugOverlay) {
      window.addEventListener("error", (e) => {
        this.debug.log(`UNCAUGHT: ${e.message} at ${e.filename}:${e.lineno}`);
      });
      window.addEventListener("unhandledrejection", (e) => {
        this.debug.log(`UNHANDLED PROMISE: ${e.reason}`);
      });
    }

    // Listen for leaf changes to manage bar visibility
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateBarVisibility();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.updateBarVisibility();
      }),
    );

    // On plugin load, the workspace may already be showing a note with
    // an active encounter. Wait for layout to be ready, then check.
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => this.updateBarVisibility(), 200);
    });
  }

  onunload() {
    document.body.classList.remove("dnd-ios-phone");

    // Unmount all inline components
    for (const [el, component] of this.inlineComponents) {
      try {
        unmount(component);
      } catch {
        // Component may already be gone
      }
    }
    this.inlineComponents.clear();

    // Unmount bar
    if (this.barComponent) {
      try {
        unmount(this.barComponent);
      } catch {
        // Ignore
      }
      this.barComponent = null;
    }

    // Remove bar container
    if (this.barContainer) {
      this.barContainer.remove();
      this.barContainer = null;
    }

    // Destroy all encounter states
    for (const state of this.encounterStates.values()) {
      state.destroy();
    }
    this.encounterStates.clear();
  }

  private processCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ) {
    try {
      this._processCodeBlockInner(source, el, ctx);
    } catch (e: any) {
      const msg = e?.stack ?? e?.message ?? String(e);
      this.debug.log(`FATAL in processCodeBlock: ${msg}`);
      el.createEl("div", {
        text: `Plugin error: ${msg}`,
        cls: "dnd-inline-view",
      });
      this.debug.attach(el);
    }
  }

  private _processCodeBlockInner(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ) {
    this.debug.log(`processCodeBlock: sourcePath=${ctx.sourcePath}`);

    const sectionInfo = ctx.getSectionInfo(el);
    if (!sectionInfo) {
      this.debug.log("processCodeBlock: sectionInfo is null, aborting");
      this.debug.attach(el);
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!file || !(file instanceof TFile)) {
      this.debug.log(`processCodeBlock: file not found for ${ctx.sourcePath}`);
      return;
    }

    let parsed: any;
    try {
      parsed = parseEncounterYaml(source);
    } catch (e) {
      this.debug.log(`YAML parse error: ${e}`);
      el.createEl("div", {
        text: `Error parsing encounter YAML: ${e}`,
        cls: "dnd-inline-view",
      });
      this.debug.attach(el);
      return;
    }

    if (!parsed || !parsed.encounter) {
      this.debug.log(`Missing encounter field in parsed YAML`);
      el.createEl("div", {
        text: "Invalid encounter data: missing 'encounter' field.",
        cls: "dnd-inline-view",
      });
      this.debug.attach(el);
      return;
    }

    const key = `${ctx.sourcePath}::${parsed.encounter}`;

    // Clean up old component FIRST to avoid reactive cascades
    // when loadFromData mutates state that the old component is subscribed to.
    const oldComponent = this.inlineComponents.get(el);
    if (oldComponent) {
      try {
        unmount(oldComponent);
      } catch {
        // Ignore
      }
      this.inlineComponents.delete(el);
    }

    // Reuse or create encounter state.
    // Reload from parsed YAML so in-memory state stays in sync.
    let state = this.encounterStates.get(key);
    if (state) {
      state.loadFromData(parsed);
    } else {
      state = new EncounterState(
        this.app,
        file,
        this.settings.codeBlockLanguage,
        parsed,
      );
      state.onDeactivate = () => this.hideBar();
      // Wire the blocking-encounter callback so the inline view can disable
      // Run/Continue when a sibling block in the same file is already active.
      state.blockingEncounterName = () => {
        const filePrefix = `${ctx.sourcePath}::`;
        for (const [k, other] of this.encounterStates) {
          if (other === state) continue;
          if (!k.startsWith(filePrefix)) continue;
          if (other.active) return other.encounter;
        }
        return null;
      };
      state.partyNotePath = this.settings.partyNotePath;
      state.libraryPaths = this.settings.libraryPaths;
      this.encounterStates.set(key, state);
    }

    // Detect view mode. On mobile, getMode() may not be available immediately.
    // Fall back to checking DOM classes once the element is attached.
    const isReadingView = this.isReadingView(el);
    this.debug.log(`processCodeBlock: isReadingView=${isReadingView}, active=${state.active}, key=${key}`);

    // Mount InlineView
    this.debug.log("processCodeBlock: mounting InlineView...");
    let component: ReturnType<typeof mount>;
    try {
      component = mount(InlineView, {
        target: el,
        props: {
          encounter: state,
          app: this.app,
          partyNotePath: this.settings.partyNotePath,
          readOnly: !isReadingView,
        },
      });
    } catch (e: any) {
      const msg = e?.stack ?? e?.message ?? String(e);
      this.debug.log(`MOUNT FAILED: ${msg}`);
      el.createEl("div", {
        text: `Svelte mount error: ${msg}`,
        cls: "dnd-inline-view",
      });
      this.debug.attach(el);
      return;
    }
    this.debug.log("processCodeBlock: mount succeeded");
    this.inlineComponents.set(el, component);
    this.debug.attach(el);

    // Register cleanup via a proper MarkdownRenderChild
    const cleanup = new MarkdownRenderChild(el);
    cleanup.onunload = () => {
      const comp = this.inlineComponents.get(el);
      if (comp) {
        try {
          unmount(comp);
        } catch {
          // Component may already be gone
        }
        this.inlineComponents.delete(el);
      }
    };
    ctx.addChild(cleanup);

    // If this encounter is active, schedule a visibility check.
    if (state.active) {
      setTimeout(() => this.updateBarVisibility(), 150);
    }
  }

  private bindBar(state: EncounterState) {
    this.debug.log(`bindBar: barContainer=${!!this.barContainer}`);
    if (!this.barContainer) return;

    // Deactivate other encounters
    for (const [key, otherState] of this.encounterStates) {
      if (otherState !== state && otherState.active) {
        otherState.active = false;
      }
    }

    // If already bound to this state, just show
    if (this.activeState === state && this.barComponent) {
      this.ensureBarInLeaf();
      this.barContainer.style.display = "";
      return;
    }

    // Unmount existing bar
    if (this.barComponent) {
      try {
        unmount(this.barComponent);
      } catch {
        // Ignore
      }
      this.barComponent = null;
    }

    // Mount new bar
    this.activeState = state;
    this.barComponent = mount(StickyBar, {
      target: this.barContainer,
      props: { encounter: state },
    });
    this.ensureBarInLeaf();
    this.barContainer.style.display = "";
  }

  /** Insert the bar container at the top of the active leaf's view content. */
  private ensureBarInLeaf() {
    if (!this.barContainer) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      this.debug.log("ensureBarInLeaf: no MarkdownView found");
      return;
    }

    const viewContent = view.contentEl;
    this.debug.log(`ensureBarInLeaf: contentEl=${!!viewContent}, tag=${viewContent?.tagName}, classes=${viewContent?.className?.slice(0, 60)}`);
    if (viewContent && this.barContainer.parentElement !== viewContent) {
      viewContent.prepend(this.barContainer);
      this.debug.log("ensureBarInLeaf: prepended bar to contentEl");
    }
  }

  private hideBar() {
    if (this.barContainer) {
      this.barContainer.style.display = "none";
      // Remove from DOM so it doesn't linger in a view that switched to edit mode
      this.barContainer.remove();
    }
  }

  /** Check if the current view is reading mode. Uses multiple detection strategies
   *  for compatibility with desktop and mobile Obsidian. */
  private isReadingView(el?: HTMLElement): boolean {
    // Strategy 1: Obsidian API
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      try {
        const mode = activeView.getMode?.();
        this.debug.log(`isReadingView: API mode=${mode}`);
        if (mode === "preview") return true;
        if (mode === "source") return false;
      } catch (e) {
        this.debug.log(`isReadingView: getMode threw: ${e}`);
      }
    } else {
      this.debug.log("isReadingView: no MarkdownView from API");
    }

    // Strategy 2: DOM class check (works after element is attached)
    if (el) {
      const hasReading = !!el.closest(".markdown-reading-view");
      const hasSource = !!el.closest(".markdown-source-view");
      this.debug.log(`isReadingView: DOM check reading=${hasReading} source=${hasSource} inDoc=${el.isConnected}`);
      if (hasReading) return true;
      if (hasSource) return false;
    }

    // Strategy 3: Check the active leaf's view container
    if (activeView) {
      const container = activeView.containerEl;
      const hasReading = !!container?.querySelector(".markdown-reading-view");
      const hasSource = !!container?.querySelector(".markdown-source-view");
      this.debug.log(`isReadingView: container check reading=${hasReading} source=${hasSource}`);
      if (hasReading) return true;
      if (hasSource) return false;
    }

    // Default: assume reading view (safer for mobile where detection may fail)
    this.debug.log("isReadingView: all strategies failed, defaulting to true");
    return true;
  }

  private updateBarVisibility() {
    const isReading = this.isReadingView();
    this.debug.log(`updateBarVisibility: isReading=${isReading}`);
    if (!isReading) {
      this.hideBar();
      return;
    }

    const activeLeaf = this.app.workspace.getActiveFile();
    if (!activeLeaf) {
      this.hideBar();
      return;
    }

    // Find any active encounter belonging to the current file
    let found = false;
    for (const [key, state] of this.encounterStates) {
      const filePath = key.split("::")[0];
      if (filePath === activeLeaf.path && state.active) {
        this.bindBar(state);
        found = true;
        break;
      }
    }

    if (!found) {
      this.hideBar();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Migration: seed catalog from legacy libraryPaths string on first run.
    if (
      (!this.settings.libraryCatalog || this.settings.libraryCatalog.length === 0) &&
      this.settings.libraryPaths
    ) {
      this.settings.libraryCatalog = pathsStringToCatalog(this.settings.libraryPaths);
    }
    // Always derive libraryPaths from the catalog after load.
    this.settings.libraryPaths = catalogToPaths(this.settings.libraryCatalog);
  }

  async saveSettings() {
    // Catalog is canonical; keep libraryPaths in sync for runtime consumers.
    this.settings.libraryPaths = catalogToPaths(this.settings.libraryCatalog);
    await this.saveData(this.settings);
    // Push updated paths into every live encounter state so the inline
    // Reload-library button and the action logger pick up the change
    // without requiring a re-open of the note.
    for (const state of this.encounterStates.values()) {
      state.libraryPaths = this.settings.libraryPaths;
      state.partyNotePath = this.settings.partyNotePath;
    }
    // Refresh the autocomplete cache against the new path set. The catalog
    // toggle handlers invalidate first, so this call does the real reload.
    await loadLibrary(this.app, this.settings.libraryPaths);
  }
}

class ActivityTrackerSettingTab extends PluginSettingTab {
  plugin: ActivityTrackerPlugin;
  private catalogContainer: HTMLElement | null = null;

  constructor(app: App, plugin: ActivityTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private renderCatalog(): void {
    if (!this.catalogContainer) return;
    this.catalogContainer.empty();
    const catalog = this.plugin.settings.libraryCatalog;
    if (catalog.length === 0) {
      this.catalogContainer.createDiv({
        text: "No libraries cataloged yet. Click 'Scan vault' above to discover .yaml library files.",
        cls: "setting-item-description",
      });
      return;
    }
    for (const entry of catalog) {
      const setting = new Setting(this.catalogContainer);
      setting.setName(entry.label);

      const parts: string[] = [entry.path];
      if (entry.missing) {
        parts.push("missing file");
      } else {
        const counts: string[] = [];
        if (entry.actionCount > 0) {
          counts.push(`${entry.actionCount} action${entry.actionCount === 1 ? "" : "s"}`);
        }
        if (entry.spellCount > 0) {
          counts.push(`${entry.spellCount} spell${entry.spellCount === 1 ? "" : "s"}`);
        }
        if (counts.length) parts.push(counts.join(", "));
      }
      setting.setDesc(parts.join(" • "));

      setting.addToggle((tg) =>
        tg.setValue(entry.enabled).onChange(async (value) => {
          entry.enabled = value;
          invalidateLibraryCache();
          await this.plugin.saveSettings();
        }),
      );

      setting.addExtraButton((btn) =>
        btn
          .setIcon("trash")
          .setTooltip("Remove from catalog")
          .onClick(async () => {
            const idx = this.plugin.settings.libraryCatalog.indexOf(entry);
            if (idx === -1) return;
            this.plugin.settings.libraryCatalog.splice(idx, 1);
            invalidateLibraryCache();
            await this.plugin.saveSettings();
            this.renderCatalog();
          }),
      );
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Party note path")
      .setDesc("Path to the vault note containing party data (e.g., party.yaml)")
      .addText((text) =>
        text
          .setPlaceholder("party.yaml")
          .setValue(this.plugin.settings.partyNotePath)
          .onChange(async (value) => {
            this.plugin.settings.partyNotePath = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Library files")
      .setDesc(
        "Scan your vault for .yaml files that parse as a library, then toggle which to load. The catalog is cached — only rescan when you add, move, or remove files.",
      )
      .addButton((btn) =>
        btn
          .setButtonText("Scan vault")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Scanning...").setDisabled(true);
            try {
              const scanned = await scanLibraryCandidates(this.plugin.app);
              this.plugin.settings.libraryCatalog = mergeCatalog(
                this.plugin.settings.libraryCatalog,
                scanned,
              );
              invalidateLibraryCache();
              await this.plugin.saveSettings();
              this.renderCatalog();
            } finally {
              btn.setButtonText("Scan vault").setDisabled(false);
            }
          }),
      );

    this.catalogContainer = containerEl.createDiv({
      cls: "activity-tracker-catalog",
    });
    this.renderCatalog();

    let manualPathInput: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName("Add path manually")
      .setDesc(
        "Add a vault path to the catalog without scanning. Useful for files in unusual locations.",
      )
      .addText((text) => {
        text.setPlaceholder("path/to/library.yaml");
        manualPathInput = text.inputEl;
      })
      .addButton((btn) =>
        btn.setButtonText("Add").onClick(async () => {
          const value = manualPathInput?.value.trim();
          if (!value) return;
          const exists = this.plugin.settings.libraryCatalog.some(
            (e) => e.path === value,
          );
          if (!exists) {
            this.plugin.settings.libraryCatalog.push({
              path: value,
              label: deriveLabel(value),
              actionCount: 0,
              spellCount: 0,
              enabled: true,
              missing: true,
            });
            this.plugin.settings.libraryCatalog.sort((a, b) =>
              a.path.localeCompare(b.path),
            );
            invalidateLibraryCache();
            await this.plugin.saveSettings();
            if (manualPathInput) manualPathInput.value = "";
            this.renderCatalog();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Download SRD spell library")
      .setDesc("Download the D&D 5e SRD spell list as srd-library.yaml in your vault root")
      .addButton((btn) =>
        btn
          .setButtonText("Download")
          .onClick(async () => {
            btn.setButtonText("Downloading...");
            btn.setDisabled(true);
            try {
              const url = "https://raw.githubusercontent.com/ringmaster/activity-tracker/main/samples/srd-library.yaml";
              const response = await fetch(url);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const content = await response.text();
              const exists = this.plugin.app.vault.getAbstractFileByPath("srd-library.yaml");
              if (exists) {
                await this.plugin.app.vault.modify(exists as any, content);
              } else {
                await this.plugin.app.vault.create("srd-library.yaml", content);
              }
              btn.setButtonText("Downloaded!");
              const catalog = this.plugin.settings.libraryCatalog;
              if (!catalog.some((e) => e.path === "srd-library.yaml")) {
                catalog.push({
                  path: "srd-library.yaml",
                  label: deriveLabel("srd-library.yaml"),
                  actionCount: 0,
                  spellCount: 0,
                  enabled: true,
                });
                catalog.sort((a, b) => a.path.localeCompare(b.path));
              } else {
                const entry = catalog.find((e) => e.path === "srd-library.yaml");
                if (entry) entry.enabled = true;
              }
              invalidateLibraryCache();
              await this.plugin.saveSettings();
              this.renderCatalog();
              loadLibrary(this.plugin.app, this.plugin.settings.libraryPaths);
            } catch (e: any) {
              btn.setButtonText(`Error: ${e.message}`);
            }
          }),
      );

    new Setting(containerEl)
      .setName("Code block language")
      .setDesc(
        "The language tag used for encounter code blocks (requires restart)",
      )
      .addText((text) =>
        text
          .setPlaceholder("dnd-combat")
          .setValue(this.plugin.settings.codeBlockLanguage)
          .onChange(async (value) => {
            this.plugin.settings.codeBlockLanguage = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Debug overlay")
      .setDesc(
        "Show a diagnostic log inside encounter code blocks (for troubleshooting)",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugOverlay)
          .onChange(async (value) => {
            this.plugin.settings.debugOverlay = value;
            this.plugin.debug.enabled = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
