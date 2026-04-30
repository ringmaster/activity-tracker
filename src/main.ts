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
}

const DEFAULT_SETTINGS: ActivityTrackerSettings = {
  partyNotePath: "party.md",
  codeBlockLanguage: "dnd-combat",
};

export default class ActivityTrackerPlugin extends Plugin {
  settings: ActivityTrackerSettings = DEFAULT_SETTINGS;

  /** Active encounter states keyed by "filepath::sectionStart" */
  private encounterStates = new Map<string, EncounterState>();

  /** Mounted inline Svelte components keyed by element */
  private inlineComponents = new Map<HTMLElement, ReturnType<typeof mount>>();

  /** The sticky bar DOM container and its Svelte component */
  private barContainer: HTMLDivElement | null = null;
  private barComponent: ReturnType<typeof mount> | null = null;
  private activeState: EncounterState | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ActivityTrackerSettingTab(this.app, this));

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
    const sectionInfo = ctx.getSectionInfo(el);
    if (!sectionInfo) return;

    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!file || !(file instanceof TFile)) return;

    const key = `${ctx.sourcePath}::${sectionInfo.lineStart}`;

    let parsed: any;
    try {
      parsed = parseEncounterYaml(source);
    } catch (e) {
      el.createEl("div", {
        text: `Error parsing encounter YAML: ${e}`,
        cls: "dnd-inline-view",
      });
      return;
    }

    if (!parsed || !parsed.encounter) {
      el.createEl("div", {
        text: "Invalid encounter data: missing 'encounter' field.",
        cls: "dnd-inline-view",
      });
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

    // Detect view mode: the code block processor el isn't in the DOM yet,
    // so check the active leaf's view type via the workspace API.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const viewMode = activeView?.getMode?.() ?? "preview";
    const isReadingView = viewMode === "preview"; // "preview" = reading, "source" = edit/live preview

    // Mount InlineView
    const component = mount(InlineView, {
      target: el,
      props: {
        encounter: state,
        app: this.app,
        partyNotePath: this.settings.partyNotePath,
        readOnly: !isReadingView,
      },
    });
    this.inlineComponents.set(el, component);

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
    // updateBarVisibility handles the reading-view-only guard.
    // Use a longer delay to ensure the view mode has settled after
    // plugin reload or view switches.
    if (state.active) {
      setTimeout(() => this.updateBarVisibility(), 150);
    }
  }

  private bindBar(state: EncounterState) {
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
    if (!view) return;

    // Insert into .view-content, before the scrollable area.
    // This places it below the view header (tab bar / breadcrumbs)
    // but above the note content.
    const viewContent = view.contentEl;
    if (viewContent && this.barContainer.parentElement !== viewContent) {
      viewContent.prepend(this.barContainer);
    }
  }

  private hideBar() {
    if (this.barContainer) {
      this.barContainer.style.display = "none";
      // Remove from DOM so it doesn't linger in a view that switched to edit mode
      this.barContainer.remove();
    }
  }

  private updateBarVisibility() {
    // Only show the bar in reading view
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || activeView.getMode() !== "preview") {
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
  }
}
