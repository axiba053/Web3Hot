// Read-only live acceptance, separate from automated tests; never sends mail or writes data.
import { SOURCES, readText } from "../backend/collectors.ts";
const now = new Date();
for (const source of SOURCES) {
  try {
    const points = source
      .parse(await readText(source.url), now)
      .sort((a, b) => a.at.localeCompare(b.at));
    console.log(
      JSON.stringify({
        source: source.id,
        points: points.length,
        latest: points.at(-1),
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        source: source.id,
        error: error instanceof Error ? error.message : "failed",
      }),
    );
  }
}
process.exit();
