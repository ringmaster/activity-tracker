import {
  Plugin,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  MarkdownView,
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
import { expandCombatants } from "./utils/id-generator";

interface ActivityTrackerSettings {
  partyNotePath: string;
  codeBlockLanguage: string;
  debugOverlay: boolean;
}

const DEFAULT_SETTINGS: ActivityTrackerSettings = {
  partyNotePath: "party.md",
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

  /** Active encounter states keyed by "filepath::sectionStart" */
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

    const key = `${ctx.sourcePath}::${sectionInfo.lineStart}`;

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

    // Reuse or create encounter state.
    // Always reload from the parsed YAML so the in-memory state
    // stays in sync with the file (e.g., active flag, round, log).
    let state = this.encounterStates.get(key);
    if (state) {
      state.updateSectionBounds(sectionInfo.lineStart, sectionInfo.lineEnd);
      state.loadFromData(parsed);
    } else {
      state = new EncounterState(
        this.app,
        file,
        sectionInfo.lineStart,
        sectionInfo.lineEnd,
        parsed,
      );
      state.onDeactivate = () => this.hideBar();
      state.partyNotePath = this.settings.partyNotePath;
      this.encounterStates.set(key, state);
    }

    // Clean up old component if re-rendered
    const oldComponent = this.inlineComponents.get(el);
    if (oldComponent) {
      try {
        unmount(oldComponent);
      } catch {
        // Ignore
      }
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
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ActivityTrackerSettingTab extends PluginSettingTab {
  plugin: ActivityTrackerPlugin;

  constructor(app: App, plugin: ActivityTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Party note path")
      .setDesc("Path to the vault note containing party data (e.g., party.md)")
      .addText((text) =>
        text
          .setPlaceholder("party.md")
          .setValue(this.plugin.settings.partyNotePath)
          .onChange(async (value) => {
            this.plugin.settings.partyNotePath = value;
            await this.plugin.saveSettings();
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
