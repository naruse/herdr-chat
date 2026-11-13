import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, terminals, run, exec, home, notify, openOverlay, theme, window, shared, layout, settings } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Claude Code or Codex: the agents the chat mod can show.
function isAgent(pane) {
  const term = pane.terminal && terminals().find((x) => x.address === pane.terminal);
  const argv0 = term?.argv?.[0]?.split("/").pop() ?? "";
  const what = `${term?.report?.app ?? ""} ${term?.foreground?.name ?? ""} ${term?.program?.key ?? ""} ${argv0}`.toLowerCase();
  return what.includes("claude") || what.includes("codex");
}

// An agent terminal that moved out of its chat's tab (the chat's Hide terminal).
function hasChat(pane) {
  return Boolean(chatTabOf(pane));
}

// The tab of the chat that agent terminal stepped out of, as tabs are named in
// the lists (with the machine in front for another machine's terminal).
function chatTabOf(pane) {
  const term = pane.terminal && terminals().find((x) => x.address === pane.terminal);
  const id = term?.labels?.["chat.tab"];
  if (!id) return null;
  const tab = term.address.includes("/") ? `${term.address.split("/")[0]}/${id}` : id;
  // Other layouts can close the chat without clearing the terminal's label.
  // A label alone must not hide Move to chat or offer a broken Back to chat.
  return panes().some((p) => p.tab === tab && p.mod === "chat") ? tab : null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // "Move to chat": shown while the tab has a Claude or Codex terminal and no
  // chat. Opens one beside the agent's terminal (the focused one first) and
  // zooms it. Once there's a chat, its own header shows or hides the terminal.
  // "Back to chat": shown in the tab of an agent terminal that Hide terminal
  // moved out of its chat (Herdr shows that tab when the agent is picked from
  // the lists). Goes to the chat's tab and puts this one away again.
  chatIn(tab, space) {
    const inTab = panes().filter((p) => p.tab === tab?.id);
    const back = inTab.map(chatTabOf).find((id) => id && id !== tab?.id && space?.tabs?.some((x) => x.id === id));
    return {
      back,
      chat: inTab.find((p) => p.mod === "chat"),
      // Not an agent whose chat it hid from (Hide terminal): that one has a chat.
      agent: inTab.find((p) => p.focused && isAgent(p) && !hasChat(p)) ?? inTab.find((p) => isAgent(p) && !hasChat(p)),
    };
  }

  openChat(tab, cx) {
    const { chat, agent } = this.chatIn(tab);
    if (chat || !agent) return;
    run("pane.split", { direction: "right", pane: agent.pane, mod: "chat", props: { terminal: agent.terminal } });
    // run() gives no pane id: zoom the chat once it's in the tab.
    cx.spawn(async () => {
      for (let i = 0; i < 20; i++) {
        await exec("sh", ["-c", "sleep 0.1"]);
        const { chat } = this.chatIn(tab);
        if (chat) return run("pane.zoom", { pane: chat.pane });
      }
      notify({ title: "Couldn't open the chat", body: "The chat pane didn't appear", level: "error" });
    });
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    // Settled tabs are put away (a chat's hidden agent terminal lives in one) unless shown.
    const shown = (space?.tabs ?? []).filter((x) => !x.settled || x.active);
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    const tab = shown.find((c) => c.active);
    const { chat, agent, back } = this.chatIn(tab, space);
    const move = Boolean(agent && !chat);
    const backButton = h_flex().id("panel-back-chat").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).bg(t.chrome).text_color(t.accent).border_1().border_color(t.accent)
      .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click(() => { run("tab.select", { id: back }); run("tab.settle", { id: tab.id }); })
      .child(svg("mods/chat-tabs/chat.svg").size(14)).child("Back to chat");
    const chatButton = h_flex().id("panel-chat").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).bg(t.chrome).text_color(t.accent).border_1().border_color(t.accent)
      .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => this.openChat(tab, cx))
      .child(svg("mods/chat-tabs/chat.svg").size(14)).child("Move to chat");
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(move, el => el.child(chatButton))
      .when(Boolean(back && !chat), el => el.child(backButton))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/chat-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/chat-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/chat-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
