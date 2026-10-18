import { screenSetup, startWithScreen } from "./screen.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("startup waits for Lima and Running inventory before creating Screen", async () => {
  const calls: string[][] = [];
  const deadlines: Array<number | undefined> = [];
  const session = await startWithScreen((_label, args, timeoutMs) => {
    calls.push(args);
    deadlines.push(timeoutMs);
    if (args[1] === "list") {
      return Promise.resolve('{"name":"test","status":"Running"}\n');
    }
    if (args[1] === "shell") {
      return Promise.resolve("SCREEN_READY=123.kixetpi-agent\n");
    }
    return Promise.resolve("READY\n");
  }, "test");
  assert(session === "123.kixetpi-agent");
  assert(
    JSON.stringify(calls[0]) ===
      JSON.stringify([
        "limactl",
        "start",
        "--tty=false",
        "--timeout=2m",
        "test",
      ]),
  );
  assert(calls[1][1] === "list");
  assert(deadlines[1] === 15_000 && deadlines[2] === 90_000);
  assert(
    JSON.stringify(calls[2]) === JSON.stringify([
      "limactl",
      "shell",
      "--workdir=/",
      "test",
      "bash",
      "-c",
      screenSetup,
    ]),
  );
});

Deno.test("failed startup never runs inventory or guest commands", async () => {
  let calls = 0;
  try {
    await startWithScreen(() => {
      calls++;
      return Promise.reject(new Error("Startup failed"));
    }, "test");
    throw new Error("Expected startup failure");
  } catch (error) {
    assert(String(error).includes("Startup failed"));
  }
  assert(calls === 1);
});

for (
  const inventory of [
    "",
    '{"name":"test","status":"Stopped"}',
    '{"name":"other","status":"Running"}',
    '{"name":"test","status":"Running"}\n{"name":"test","status":"Running"}',
    "invalid JSON",
  ]
) {
  Deno.test(`unsafe inventory blocks guest setup: ${inventory}`, async () => {
    let guestCalled = false;
    let failed = false;
    try {
      await startWithScreen((_label, args) => {
        if (args[1] === "shell") guestCalled = true;
        return Promise.resolve(args[1] === "list" ? inventory : "READY");
      }, "test");
    } catch {
      failed = true;
    }
    assert(failed && !guestCalled);
  });
}

Deno.test("successful shell exit without readiness marker is not a pass", async () => {
  let failed = false;
  try {
    await startWithScreen((_label, args) =>
      Promise.resolve(
        args[1] === "list" ? '{"name":"test","status":"Running"}' : "",
      ), "test");
  } catch (error) {
    failed = String(error).includes("readiness marker");
  }
  assert(failed);
});

// Only Bash runs locally. Screen, user identity, timeouts, and sleeps are fakes;
// these tests cannot start Lima, allocate a real Screen PTY, or mutate the guest.
const fakes = String.raw`
created=0
id() { printf '%s\n' "$MOCK_UID"; }
sleep() { :; }
timeout() { shift; "$@"; }
flock() { [ "$MOCK_MODE" != lock-busy ]; }
command() {
  if [ "$1" = -v ] && [ "$2" = screen ] && [ "$MOCK_MODE" = missing ]; then
    return 1
  fi
  builtin command "$@"
}
screen() {
  case "$1" in
    --version) printf '%s\n' 'Screen version 4.09.01';;
    -ls)
      if [ "$MOCK_MODE" = inventory-error ]; then
        printf '%s\n' 'Unexpected socket error'; return 1
      elif [ "$MOCK_MODE" = existing ]; then
        printf '\t123.kixetpi-agent\t(timestamp)\t(Detached)\n'; return 0
      elif [ "$MOCK_MODE" = stale ]; then
        printf '\t123.kixetpi-agent\t(timestamp)\t(Dead ???)\n'; return 0
      elif [ "$created" -eq 1 ]; then
        if [ "$MOCK_MODE" = duplicate ]; then
          printf '\t124.kixetpi-agent\t(timestamp)\t(Detached)\n'
        fi
        printf '\t123.kixetpi-agent\t(timestamp)\t(Detached)\n'; return 0
      elif [ "$MOCK_MODE" = unrelated ]; then
        printf '\t123.kixetpi-agent-other\t(timestamp)\t(Detached)\n'; return 0
      fi
      printf '%s\n' 'No Sockets found in /run/screen/S-test.'; return 1;;
    -c)
      printf '%s\n' 'CREATE_CALLED'
      [ "$*" = '-c /dev/null -dmS kixetpi-agent -t shell /bin/bash --noprofile --norc -i' ] || return 2
      [ "$MOCK_MODE" != create-error ] || return 1
      created=1;;
    -S)
      [ "$*" = '-S 123.kixetpi-agent -p 0 -Q info' ] || return 2
      if [ "$MOCK_MODE" = query-error ]; then return 1; fi
      printf '%s\n' '(0,0)/(80,24)';;
    *) printf '%s\n' 'Unexpected Screen command' >&2; return 2;;
  esac
}
`;

for (
  const [mode, success, creates] of [
    ["normal", true, true],
    ["unrelated", true, true],
    ["existing", false, false],
    ["stale", false, false],
    ["missing", false, false],
    ["inventory-error", false, false],
    ["lock-busy", false, false],
    ["create-error", false, true],
    ["duplicate", false, true],
    ["query-error", false, true],
    ["root", false, false],
  ] as const
) {
  Deno.test(`guest Screen setup: ${mode}`, async () => {
    await Deno.mkdir(".vm-runs", { recursive: true, mode: 0o700 });
    const home = await Deno.makeTempDir({
      dir: ".vm-runs",
      prefix: "screen-unit-",
    });
    try {
      const result = await new Deno.Command("/bin/bash", {
        args: ["--noprofile", "--norc", "-c", `${fakes}\n${screenSetup}`],
        clearEnv: true,
        env: {
          MOCK_MODE: mode,
          MOCK_UID: mode === "root" ? "0" : "502",
          PATH: "/usr/bin:/bin",
          HOME: home,
        },
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).output();
      const output = new TextDecoder().decode(result.stdout);
      const error = new TextDecoder().decode(result.stderr);
      assert(result.success === success, `${mode}: ${output}\n${error}`);
      assert(
        output.includes("CREATE_CALLED") === creates,
        `${mode}: unexpected creation state`,
      );
      assert(output.includes("SCREEN_READY=123.kixetpi-agent") === success);
    } finally {
      await Deno.remove(home, { recursive: true });
    }
  });
}
