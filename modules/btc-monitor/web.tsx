import { defineWebModule } from "@aihot/web/modules";
import { IconBolt } from "../../apps/web/app/components/icons";
export default defineWebModule({
  name: "btc-monitor",
  sidebar: {
    section: "市场",
    items: [{ to: "/btc", label: "BTC 状态", icon: IconBolt }],
  },
  tabs: [{ key: "btc", to: "/btc", label: "BTC", icon: IconBolt }],
  tools: [{ to: "/btc", label: "BTC 状态监控", icon: <IconBolt /> }],
  admin: {
    groups: [
      { group: "市场监控", items: [{ to: "/admin/btc", label: "BTC 告警" }] },
    ],
  },
});
