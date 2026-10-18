type Command = (
  label: string,
  args: string[],
  timeoutMs?: number,
) => Promise<string>;

// This script is run inside the guest by the operator's startup command.
export const screenSetup = String.raw`
set -eu
export LC_ALL=C
if [ "$(id -u)" -eq 0 ]; then
  printf '%s\n' 'Refusing to start the handoff shell as root.' >&2
  exit 1
fi
for tool in screen timeout flock; do
  if ! command -v "$tool" >/dev/null; then
    printf 'Required guest tool is missing: %s. Nothing was installed.\n' "$tool" >&2
    exit 1
  fi
done
screen --version

umask 077
lock_file="$HOME/.kixetpi-agent-start.lock"
if [ -L "$lock_file" ] || { [ -e "$lock_file" ] && [ ! -f "$lock_file" ]; }; then
  printf '%s\n' 'Refusing a symlink or non-regular Screen startup lock.' >&2
  exit 1
fi
exec 9>"$lock_file"
if ! flock -n 9; then
  printf '%s\n' 'Another Screen startup is in progress; no session was created.' >&2
  exit 1
fi

list_sessions() {
  local listing status=0 line
  listing=$(timeout 5s screen -ls) || status=$?
  if [ "$status" -ne 0 ] && { [ "$status" -ne 1 ] || [[ "$listing" != *'No Sockets found in '* ]]; }; then
    printf 'Screen inventory failed (exit %s): %s\n' "$status" "$listing" >&2
    return 1
  fi
  sessions=()
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*([0-9]+\.kixetpi-agent)[[:space:]] ]]; then
      sessions+=("${"$"}{BASH_REMATCH[1]}")
    fi
  done <<< "$listing"
}

list_sessions
if [ "${"$"}{#sessions[@]}" -ne 0 ]; then
  printf '%s\n' 'A kixetpi-agent Screen session already exists (possibly stale or busy).' >&2
  printf '%s\n' 'Preserving it without sending input. Inspect it before continuing; do not start a second job.' >&2
  exit 1
fi

unset STY PROMPT_COMMAND BASH_ENV
export HISTFILE=/dev/null PS1='kixetpi> '
timeout 5s screen -c /dev/null -dmS kixetpi-agent -t shell /bin/bash --noprofile --norc -i 9>&-

# -dm forks before the server is ready; a bounded query checks its control window.
info='No responsive Screen window found.'
for ((attempt=0; attempt<10; attempt++)); do
  list_sessions
  if [ "${"$"}{#sessions[@]}" -gt 1 ]; then
    printf '%s\n' 'Ambiguous Screen sessions; preserving all sessions without sending input.' >&2
    exit 1
  fi
  if [ "${"$"}{#sessions[@]}" -eq 1 ]; then
    if info=$(timeout 2s screen -S "${"$"}{sessions[0]}" -p 0 -Q info 2>&1); then
      printf '%s\n' "$info"
      printf 'SCREEN_READY=%s\n' "${"$"}{sessions[0]}"
      exit 0
    fi
  fi
  sleep 0.1
done
printf 'Screen readiness failed: %s\n' "$info" >&2
printf '%s\n' 'The VM and any created session were left intact; inspect them before retrying.' >&2
exit 1
`;

export async function startWithScreen(
  command: Command,
  instance: string,
): Promise<string> {
  await command("start", [
    "limactl",
    "start",
    "--tty=false",
    "--timeout=2m",
    instance,
  ]);
  const inventory = await command("screen-inventory", [
    "limactl",
    "list",
    "--json",
  ], 15_000);
  const matches = inventory.trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((item) => item?.name === instance);
  if (matches.length !== 1 || matches[0].status !== "Running") {
    throw new Error(
      "Screen setup requires exactly one matching Running VM; no guest setup was attempted.",
    );
  }
  const output = await command("screen-start", [
    "limactl",
    "shell",
    "--workdir=/",
    instance,
    "bash",
    "-c",
    screenSetup,
  ], 90_000);
  const ready = output.match(/^SCREEN_READY=([1-9][0-9]*\.kixetpi-agent)$/m);
  if (!ready) {
    throw new Error(
      "Screen command exited without a valid readiness marker; inspect the guest before retrying.",
    );
  }
  return ready[1];
}
