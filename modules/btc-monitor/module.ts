import { defineModule } from "@aihot/contracts/modules";
export default defineModule({
  name: "btc-monitor",
  pages: [{ path: "btc", file: "web/public.tsx" }],
  adminPages: [{ path: "admin/btc", file: "web/admin.tsx" }],
  apiPaths: [/^\/api\/v1\/btc-monitor(?:\/|$)/],
});
