export function createCommandRunner(
  { root, home, temporary, run }: {
    root: string;
    home: string;
    temporary: string;
    run: string;
  },
) {
  let sequence = 0;
  return async function command(
    label: string,
    args: string[],
    timeoutMs?: number,
  ): Promise<string> {
    console.log(`Running: ${args.join(" ")}`);
    const prefix = `${run}/${String(++sequence).padStart(2, "0")}-${label}`;
    const started = new Date().toISOString();
    await Deno.writeTextFile(
      `${prefix}.json`,
      `${JSON.stringify({ args, started, state: "started" })}\n`,
      {
        createNew: true,
        mode: 0o600,
      },
    );
    const stdoutLog = await Deno.open(`${prefix}.stdout.log`, {
      write: true,
      createNew: true,
      mode: 0o600,
    });
    const stderrLog = await Deno.open(`${prefix}.stderr.log`, {
      write: true,
      createNew: true,
      mode: 0o600,
    });
    let child: Deno.ChildProcess;
    try {
      child = new Deno.Command(args[0], {
        args: args.slice(1),
        cwd: root,
        env: { LIMA_HOME: home, TMPDIR: temporary },
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).spawn();
    } catch (error) {
      stdoutLog.close();
      stderrLog.close();
      throw error;
    }
    const [stdoutDisk, stdoutTerminal] = child.stdout.tee();
    const [stderrDisk, stderrTerminal] = child.stderr.tee();
    const io = new AbortController();
    let timedOut = false;
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      io.abort();
      try {
        // Terminate only this host CLI, never the VM or a detached guest job.
        child.kill("SIGKILL");
      } catch (error) {
        console.error(
          `Could not terminate timed-out CLI ${child.pid}: ${error}`,
        );
      }
    }, timeoutMs);
    let results;
    try {
      results = await Promise.allSettled(
        [
          child.status,
          stdoutDisk.pipeTo(stdoutLog.writable, { signal: io.signal }),
          stderrDisk.pipeTo(stderrLog.writable, { signal: io.signal }),
          stdoutTerminal.pipeTo(Deno.stdout.writable, {
            preventClose: true,
            preventAbort: true,
            signal: io.signal,
          }),
          stderrTerminal.pipeTo(Deno.stderr.writable, {
            preventClose: true,
            preventAbort: true,
            signal: io.signal,
          }),
          Deno.writeTextFile(
            `${prefix}.json`,
            `${
              JSON.stringify({
                args,
                started,
                pid: child.pid,
                state: "running",
                timeoutMs,
              })
            }\n`,
          ),
        ] as const,
      );
    } finally {
      clearTimeout(timer);
    }
    const status = results[0];
    if (status.status === "rejected") throw status.reason;
    const result = status.value;
    await Deno.writeTextFile(
      `${prefix}.json`,
      `${
        JSON.stringify(
          {
            args,
            started,
            pid: child.pid,
            state: timedOut ? "timed-out" : "exited",
            ended: new Date().toISOString(),
            code: result.code,
            signal: result.signal,
            timeoutMs,
            guestOutcome: timedOut
              ? "indeterminate; guest work may still be running"
              : undefined,
          },
          null,
          2,
        )
      }\n`,
      { mode: 0o600 },
    );
    if (timedOut) {
      throw new Error(
        `${label} exceeded ${timeoutMs} ms; host CLI terminated, guest outcome indeterminate. Inspect state before retrying.`,
      );
    }
    for (const outcome of results.slice(1)) {
      if (outcome.status === "rejected") throw outcome.reason;
    }
    if (!result.success) {
      throw new Error(
        `${label} exited ${result.code}; inspect ${prefix}.* before retrying.`,
      );
    }
    return await Deno.readTextFile(`${prefix}.stdout.log`);
  };
}
