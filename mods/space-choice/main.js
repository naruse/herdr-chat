import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, theme, run, openOverlay, closeOverlay } from "herdr";

export default class SpaceChoice extends View {
  render() {
    const p = props() ?? {};
    const t = theme();
    const machine = p.machine ?? null;
    const choose = (kind) => {
      closeOverlay(p.overlay);
      if (kind === "terminal") run("space.new", { machine: machine ?? "" });
      else openOverlay({ mod: "chat", kind: "dialog", width: 760, height: 0.85, props: { machine } });
    };
    const option = (id, title) => div().id(id).h(31).px(8).rounded(7)
      .flex().items_center().hover(s => s.bg(t.hover)).on_click(() => choose(id))
      .child(title);
    return v_flex().id("root").w_full().p(5).bg(t.popover).text_size(11).text_color(t.foreground)
      .child(option("terminal", "Terminal"))
      .child(option("chat", "Chat"));
  }
}
