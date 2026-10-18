// Run from the repository root. Deno permissions do not relax the host sandbox.
// This probe does not install guest packages or change access policy.
import { startWithScreen } from "./screen.ts";
import { createCommandRunner } from "./command.ts";

const action = Deno.args[0];
const actions = ["preflight", "prepare", "create", "start", "start-session", "check", "status", "stop"];
if (Deno.args.length !== 1 || !actions.includes(action)) {
  console.log(
    "Usage: deno run --allow-read=. --allow-write=. --allow-run=limactl,curl,shasum vm-tests/run.ts <action>",
  );
  console.log(`Actions: ${actions.join(", ")}. Nothing deletes state or changes Kilo permissions.`);
  Deno.exit(action === "--help" ? 0 : 2);
}

const root = await Deno.realPath(new URL("../", import.meta.url));
if (await Deno.realPath(".") !== root) throw new Error("Run from the repository root.");
if (Deno.build.os !== "darwin" || Deno.build.arch !== "aarch64") {
  throw new Error("This profile requires an Apple Silicon Mac.");
}

const name = "test";
const imageName = "debian-13-genericcloud-arm64-20260712-2537.qcow2";
const imageURL = `https://cloud.debian.org/images/cloud/trixie/20260712-2537/${imageName}`;
const digest =
  "8543d795f2fde630eb66c492f245a8c1da19dedc636e0a8e7b3d0f95920e1a05aa911ef2d82d177d41cc53ced5fccbd2a3945d07fa5e15018914c4d864bb07ed";
const home = `${root}/.lima`;
const images = `${root}/.vm-images`;
const runs = `${root}/.vm-runs`;
const temporary = `${runs}/tmp`;
const image = `${images}/${imageName}`;
const instance = `${home}/${name}`;
const ownerFile = `${instance}/kixetpi-probe.json`;
const socketBytes = new TextEncoder().encode(`${instance}/ssh.sock.${"x".repeat(16)}`).length;
if (socketBytes >= 104) {
  throw new Error(
    `Checkout is too deep: Lima reserves a ${socketBytes}-byte socket path; macOS requires <104. Use a shorter real checkout path.`,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

for (const path of [home, images, runs, temporary]) {
  if (await exists(path)) {
    if (!(await Deno.lstat(path)).isDirectory) {
      throw new Error(`Refusing a symlink or non-directory runtime path: ${path}`);
    }
  } else {
    await Deno.mkdir(path, { mode: 0o700 });
  }
}
const run = await Deno.makeTempDir({
  dir: runs,
  prefix: `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${action}-`,
});
console.log(`Action: ${action}; instance: ${name}; reserved socket path: ${socketBytes} bytes`);
console.log(`Private run output: ${run}`);

const profile = {
  vmType: "vz",
  arch: "aarch64",
  cpus: 2,
  memory: "2GiB",
  disk: "16GiB",
  plain: true,
  mounts: [],
  containerd: { system: false, user: false },
  ssh: { overVsock: false, forwardAgent: false, loadDotSSHPubKeys: false },
  networks: [{ vzNAT: true }],
  images: [{ location: image, arch: "aarch64", digest: `sha512:${digest}` }],
};
const config = `${run}/lima.json`;
await Deno.writeTextFile(config, `${JSON.stringify(profile, null, 2)}\n`, { createNew: true, mode: 0o600 });
await Deno.writeTextFile(
  `${run}/context.json`,
  `${JSON.stringify({ action, name, imageURL, digest, socketBytes, profile }, null, 2)}\n`,
  { createNew: true, mode: 0o600 },
);

const command = createCommandRunner({ root, home, temporary, run });

async function verifyImage() {
  if (!(await Deno.lstat(image)).isFile) throw new Error("The base image must be a regular file, not a symlink.");
  const hash = await command("image-sha512", ["shasum", "-a", "512", image]);
  if (hash.trim().split(/\s+/)[0] !== digest) {
    throw new Error("Base-image SHA-512 mismatch. Do not create or start a VM.");
  }
}

async function requireOwnedInstance() {
  if (!(await Deno.lstat(instance)).isDirectory || !(await Deno.lstat(ownerFile)).isFile) {
    throw new Error("Refusing an instance without this launcher's ownership marker.");
  }
  const owner = JSON.parse(await Deno.readTextFile(ownerFile));
  if (owner.root !== root || owner.digest !== digest) {
    throw new Error("Instance ownership marker does not match this checkout/image.");
  }
  const savedConfig = `${instance}/lima.yaml`;
  if (
    !(await Deno.lstat(savedConfig)).isFile ||
    await Deno.readTextFile(savedConfig) !== await Deno.readTextFile(config)
  ) {
    throw new Error("Saved instance configuration differs from the approved profile; refusing lifecycle changes.");
  }
}

let screenSession: string | undefined;
try {
  if (action !== "status") {
    for (const file of ["default.yaml", "override.yaml"]) {
      if (await exists(`${home}/_config/${file}`)) {
        throw new Error(`Unexpected project-local Lima ${file}; inspect it rather than inheriting overrides.`);
      }
    }
  }
  const version = await command("lima-version", ["limactl", "--version"]);
  if (version.trim() !== "limactl version 2.2.0") {
    throw new Error("This profile was inspected for Lima 2.2.0; review a different release before using it.");
  }

  if (action === "preflight") {
    await command("inventory", ["limactl", "list", "--json"]);
    await command("configuration", ["limactl", "validate", config]);
  } else if (action === "prepare") {
    if (!await exists(image)) {
      const partial = `${image}.part`;
      if (await exists(partial)) {
        throw new Error("A previous partial image exists; inspect it rather than silently overwriting it.");
      }
      await command("download", [
        "curl",
        "--disable",
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--silent",
        "--show-error",
        "--connect-timeout",
        "20",
        "--max-time",
        "240",
        "--max-filesize",
        "1073741824",
        "--output",
        partial,
        imageURL,
      ]);
      const hash = await command("download-sha512", ["shasum", "-a", "512", partial]);
      if (hash.trim().split(/\s+/)[0] !== digest) {
        throw new Error("Downloaded image has the wrong SHA-512; leaving it untrusted as .part.");
      }
      await Deno.rename(partial, image);
    }
    await verifyImage();
    await command("configuration", ["limactl", "validate", config]);
  } else if (action === "create") {
    if (await exists(instance)) throw new Error("Instance path already exists. It will not be reused or overwritten.");
    await verifyImage();
    await command("configuration", ["limactl", "validate", config]);
    await command("create", ["limactl", "create", "--tty=false", `--name=${name}`, config]);
    await Deno.writeTextFile(ownerFile, `${JSON.stringify({ root, digest })}\n`, { createNew: true, mode: 0o600 });
  } else if (action === "status") {
    await command("inventory", ["limactl", "list", "--json"]);
  } else {
    await requireOwnedInstance();
    if (action === "start-session") {
      screenSession = await startWithScreen(command, name);
      console.log(`VM and Screen control window ready: ${screenSession}`);
      console.log("Agent handoff: run vm:probe check, then inspect this Screen session before sending any input.");
      console.log("The session is an ordinary-user guest shell, not a root recovery shell or independent console.");
    } else if (action === "start") {
      await command("start", ["limactl", "start", "--tty=false", "--timeout=2m", name]);
    } else if (action === "stop") {
      await command("stop", ["limactl", "stop", name]);
    } else {
      const guest = ["limactl", "shell", "--workdir=/", name];
      for (
        const [label, args, expected] of [
          ["release", ["cat", "/etc/os-release"], /VERSION_CODENAME=trixie/],
          ["userspace", ["dpkg", "--print-architecture"], /^arm64\s*$/],
          ["word-size", ["getconf", "LONG_BIT"], /^64\s*$/],
          ["machine", ["uname", "-m"], /^aarch64\s*$/],
          ["init", ["ps", "-p", "1", "-o", "comm="], /^systemd\s*$/],
          ["fixture-sudo", ["sudo", "-n", "/usr/bin/id", "-u"], /^0\s*$/],
        ] as const
      ) {
        const output = await command(label, [...guest, ...args]);
        if (!expected.test(output)) throw new Error(`${label}: command succeeded but the behavioral assertion failed.`);
      }
      await command("failed-units", [...guest, "systemctl", "--failed", "--no-pager"]);
      await command("journal", [...guest, "sudo", "-n", "journalctl", "--list-boots", "--no-pager"]);
      await command("network", [...guest, "ip", "-br", "address"]);
    }
  }
  await Deno.writeTextFile(
    `${run}/result.json`,
    `${JSON.stringify({ action, status: "completed", screenSession, scope: "VM infrastructure probe, not a walkthrough pass" })}\n`,
    { createNew: true, mode: 0o600 },
  );
} catch (error) {
  await Deno.writeTextFile(
    `${run}/result.json`,
    `${JSON.stringify({ action, status: "failed-or-blocked", error: String(error) })}\n`,
    { createNew: true, mode: 0o600 },
  );
  console.error(error);
  console.error(
    "Probe halted; the VM was not automatically stopped. No automatic retry, deletion, permission change, or sandbox escape was attempted.",
  );
  Deno.exit(1);
}
