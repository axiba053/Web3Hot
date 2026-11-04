import { useLoaderData } from "react-router";
import { loadOr404 } from "../../../apps/web/app/lib/api.server";
import { PhoneBar } from "../../../apps/web/app/components/shell/PhoneBar";
import { SITE } from "@aihot/site";
import type { PublicMonitor } from "../contracts";
import { Dashboard } from "./dashboard";
export const handle = { tab: "btc", name: "BTC 状态" };
export function headers() {
  return { "Cache-Control": "no-store" };
}
export function meta() {
  return [{ title: `BTC 状态监控 · ${SITE.name}` }];
}
export async function loader({ request }: { request: Request }) {
  return loadOr404<PublicMonitor>("/api/v1/btc-monitor", {
    signal: request.signal,
  });
}
export default function Page() {
  const data = useLoaderData<typeof loader>();
  return (
    <>
      <PhoneBar title="BTC 状态" />
      <Dashboard data={data} />
    </>
  );
}
