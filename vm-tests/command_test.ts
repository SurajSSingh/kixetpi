import { createCommandRunner } from "./command.ts";

for (const mode of ["success", "nonzero", "timeout"] as const) {
  Deno.test(`recorded subprocess: ${mode}`, async () => {
    await Deno.mkdir(".vm-runs", { recursive: true, mode: 0o700 });
    const run = await Deno.makeTempDir({
      dir: ".vm-runs",
      prefix: "command-unit-",
    });
    try {
      const root = Deno.cwd();
      const command = createCommandRunner({
        root,
        home: run,
        temporary: run,
        run,
      });
      const script = mode === "timeout"
        ? "exec /bin/sleep 30"
        : `printf 'stdout\\n'; printf 'stderr\\n' >&2; exit ${
          mode === "success" ? 0 : 7
        }`;
      let output: string | undefined;
      let error: unknown;
      try {
        output = await command(
          "probe",
          ["/bin/bash", "-c", script],
          mode === "timeout" ? 25 : 5_000,
        );
      } catch (caught) {
        error = caught;
      }
      const record = JSON.parse(
        await Deno.readTextFile(`${run}/01-probe.json`),
      );
      if (mode === "timeout") {
        if (
          !String(error).includes("indeterminate") ||
          record.state !== "timed-out" || record.signal !== "SIGKILL"
        ) {
          throw new Error(
            `Invalid deadline result: ${JSON.stringify(record)}, ${error}`,
          );
        }
        // A timeout must not abort the shared terminal streams used by the next job.
        const next = await command("next", [
          "/bin/bash",
          "-c",
          "printf 'next\\n'",
        ], 5_000);
        if (next !== "next\n") {
          throw new Error("Terminal/logging unavailable after timeout");
        }
      } else {
        if (
          record.state !== "exited" ||
          record.code !== (mode === "success" ? 0 : 7)
        ) {
          throw new Error(
            `Invalid completion record: ${JSON.stringify(record)}`,
          );
        }
        if ((mode === "success") !== (error === undefined)) {
          throw new Error(`Unexpected error: ${error}`);
        }
        if (mode === "success" && output !== "stdout\n") {
          throw new Error("Missing captured output");
        }
        const stderr = await Deno.readTextFile(`${run}/01-probe.stderr.log`);
        if (stderr !== "stderr\n") throw new Error("Missing captured stderr");
      }
    } finally {
      await Deno.remove(run, { recursive: true });
    }
  });
}
