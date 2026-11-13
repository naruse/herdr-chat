import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// Execute the shipped tab-selection logic with Herdr's live data mocked.
const source = readFileSync(new URL("../mods/chat-tabs/main.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace("export default class Tabs", "class Tabs");

function selection({ address = "t1", label, chatTab, chatMod = "chat" }) {
  const terminal = { address, report: { app: "codex" }, labels: label ? { "chat.tab": label } : {} };
  const agent = { pane: "agent", tab: "work", terminal: address, focused: true };
  const allPanes = [agent, ...(chatTab ? [{ pane: "chat", tab: chatTab, mod: chatMod }] : [])];
  return runInNewContext(source + '\nnew Tabs().chatIn({ id: "work" }, { tabs: tabs })', {
    View: class {}, terminals: () => [terminal], panes: () => allPanes,
    tabs: [{ id: "work" }, ...(chatTab ? [{ id: chatTab }] : [])],
  });
}

test("offers Move to chat for an agent without a chat label", () => {
  assert.equal(selection({}).agent?.pane, "agent");
});
test("closing the chat tab in another layout leaves Move to chat available", () => {
  const result = selection({ label: "closed" });
  assert.equal(result.agent?.pane, "agent");
  assert.equal(result.back, undefined);
});
test("a surviving tab without a chat pane does not count as a chat", () => {
  const result = selection({ label: "old", chatTab: "old", chatMod: "files" });
  assert.equal(result.agent?.pane, "agent");
  assert.equal(result.back, undefined);
});
test("a live hidden chat offers Back to chat instead of a duplicate", () => {
  const result = selection({ label: "conversation", chatTab: "conversation" });
  assert.equal(result.agent, undefined);
  assert.equal(result.back, "conversation");
});
test("remote labels resolve against machine-qualified pane tab ids", () => {
  const result = selection({ address: "remote/t1", label: "conversation", chatTab: "remote/conversation" });
  assert.equal(result.agent, undefined);
  assert.equal(result.back, "remote/conversation");
});
