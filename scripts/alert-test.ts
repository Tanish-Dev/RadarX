/** npm run alert:test — sends a sample alert to every configured channel. */
import "../src/worker/env";
import { sendTestAlert } from "../src/alerts/dispatch";

const r = await sendTestAlert();
if (r.channels.length) console.log(`✅ Test alert sent via ${r.channels.join(" + ")}`);
for (const e of r.errors) console.log(`❌ ${e}`);
process.exit(r.errors.length && !r.channels.length ? 1 : 0);
