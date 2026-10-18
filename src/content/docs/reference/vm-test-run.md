---
title: VM command test run
description: Preflight the walkthrough's Linux commands in a disposable Debian 13 ARM64 Lima VM on an Apple Silicon Mac.
prev: false
next: false
---

Use this separate test track to find command, configuration, and integration errors before a Raspberry Pi walkthrough. The target is **Debian 13 Trixie ARM64 under Lima**, not an emulated Raspberry Pi or a new KixetPi image. The [four stage guides](/kixetpi/#follow-the-four-stages) remain the procedure being tested.

:::caution[Partial command preflight; full walkthrough untested]
With the tested Kilo sandbox, the operator must start **and stop** this VM from a normal Mac terminal outside the sandbox. Sandboxed startup failed, and the later stop request was denied. The sandboxed agent subsequently passed baseline diagnostics, bounded service/isolation fixtures, and interactive package removal/reinstallation against the externally started guest without changing permissions. The [latest trial](#recorded-bounded-command-trial) also verified the Nix archive download, but direct TCP SSH was unreachable. This verifies only the recorded command scopes, not the full walkthrough or its recovery checkpoints. A website build checks rendering, not these commands. The Raspberry Pi walkthrough remains untested.
:::

## Scope and authorization

Obtain approval before creating the VM, downloading images, or running guest mutations. Keep all Linux administration inside the named disposable guest. **Never run a block titled VM guest in the Mac's shell.** Do not attach a physical disk, share the Mac's home directory, forward an SSH agent, or use production credentials.

This track can test systemd, journald, APT, SSH, sudo, and optional Nix/Home Manager behavior on a booted ARM64 Linux system. It cannot validate Raspberry Pi Imager, Pi firmware/kernel updates, Wi-Fi/Bluetooth, GPIO, stock Pi swap, SD-card behavior, power, thermal behavior, or physical recovery. Measurements describe this VM only.

Generic Debian has different package inventories and defaults. Do not add Raspberry Pi repositories, invent `/proc/device-tree/model`, create `/boot/firmware` to satisfy a check, or install Bluetooth just to make the example applicable. Record these differences and skip the affected Pi-specific assertions.

### Debian versus Raspberry Pi OS

The release and architecture match the proposed **64-bit** Pi path, making this a useful userspace-command test, not a Pi emulator. This table combines guest observations on 18 October 2026 with upstream Pi documentation and image-build sources checked that day. Source defaults are not observations of a particular released image; record the real Pi's configuration before applying them.

| Area | Observed Debian/Lima guest | Raspberry Pi difference and test consequence |
| --- | --- | --- |
| Userspace | Trixie, `arm64`, 64-bit userspace, `aarch64` kernel; systemd, APT, OpenSSH. | The command families and ARM64 Nix archive are relevant to 64-bit Pi OS. This does not cover the 32-bit/Raspbian path or identical package versions and dependencies. |
| Boot and kernel | Debian cloud kernel, Apple virtual hardware, `/boot/efi`, virtio disk. | Pi image sources install Raspberry Pi kernels and firmware and mount the boot partition at `/boot/firmware`. Device-tree/model, firmware/EEPROM, overlays, and kernel-update bootability require a real Pi. See [kernel packages](https://github.com/RPi-Distro/pi-gen/blob/d346cd53562b3c6b4f94c9155175f814258c456d/stage0/02-firmware/01-packages) and [mount layout](https://github.com/RPi-Distro/pi-gen/blob/d346cd53562b3c6b4f94c9155175f814258c456d/stage1/01-sys-tweaks/files/fstab). |
| Networking and discovery | `systemd-networkd`, `systemd-resolved`, virtual Ethernet, NAT, and LLMNR listeners. | Current Pi sources use NetworkManager and include Avahi, wireless components, and BlueZ. DNS, `.local`, Wi-Fi/Bluetooth dependencies, and firewall reachability need separate Pi tests. Do not replace the guest's network stack merely to imitate those names. See [Pi network packages](https://github.com/RPi-Distro/pi-gen/blob/d346cd53562b3c6b4f94c9155175f814258c456d/stage2/02-net-tweaks/00-packages). |
| Accounts and access | Host-derived user/home, generated key, locked account password, `NOPASSWD: ALL`, SSH already running. | Pi documentation requires enabling SSH and describes password-required sudo by default. Imager-selected user/password/key and actual policy must be checked. Lima cannot pass those first-boot or password-transition assertions unchanged. See [Pi SSH setup](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/remote-access/ssh.adoc) and [sudo policy](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/configuration/users.adoc). |
| First-boot provisioning | Lima/cloud-init supplies this guest's access fixtures. | Current Pi image sources also support cloud-init and Pi-specific integration. The distinction is provisioning content, not a universal absence of cloud-init on Pi OS. Check the chosen image and [Pi image-build options](https://github.com/RPi-Distro/pi-gen/blob/d346cd53562b3c6b4f94c9155175f814258c456d/README.md). |
| Command search path | Ordinary-user `PATH` omits `/usr/sbin` and `/sbin`; absolute `swapon`/`zramctl` paths work. | Pi image sources explicitly add those directories to login paths. The VM's lookup failure does not establish a broken Pi command. See the [Pi PATH patch](https://github.com/RPi-Distro/pi-gen/blob/d346cd53562b3c6b4f94c9155175f814258c456d/stage2/01-sys-tweaks/00-patches/05-path.diff). |
| Swap and resources | 2 GiB virtual RAM, no swap or zram devices, virtual disk. | Current Lite sources include `rpi-swap`/`rpi-loop-utils`; `rpi-swap` documents an automatic mechanism currently using zram with file-backed writeback. Inspect the installed image rather than assuming a legacy swap file. This guest cannot validate Pi memory pressure, storage wear, power, or thermal behavior. See [Lite packages](https://github.com/RPi-Distro/pi-gen/blob/d346cd53562b3c6b4f94c9155175f814258c456d/stage2/01-sys-tweaks/00-packages) and the [swap configuration manual](https://github.com/raspberrypi/rpi-swap/blob/dc2c7aa4465a66401ecbf9996b08aec3ab5a15ae/man/man5/swap.conf.5). |
| Confinement and updates | AppArmor loaded; Debian-only repositories and existing unattended-upgrades policy. | Guest profiles do not establish Pi kernel enablement or application confinement. Debian security origins do not establish coverage of Raspberry Pi/Raspbian packages. Repeat the guides' runtime discovery and origin checks on the Pi. |

Keep this minimal Debian guest as the command-compatibility layer. Use explicitly labeled fixtures for missing nonessential applications, and a separate real-Pi run for hardware, networking, account provisioning, update/reboot, and recovery assertions. Installing Pi repositories or fabricated hardware files in Debian would make the evidence less accurate, not closer to a validated Pi installation.

## Repository-local infrastructure probe

The tracked launcher `vm-tests/run.ts` provides a narrower first test than the manual walkthrough below. Run it from the repository root using Deno 2 and Lima **2.2.0** on an Apple Silicon Mac. No new package dependencies are required. Its Deno permissions allow project file access and the named `limactl`, `curl`, and `shasum` executables; they do not disable or widen Kilo's host sandbox.

The profile uses one instance named `test`, 2 CPUs, 2 GiB RAM, a 16 GiB virtual disk, VZ native NAT, and TCP SSH rather than VSock. It disables host mounts, containerd, SSH-agent forwarding, and importing the host's existing public keys. Lima generates a VM-only identity. There is no command to delete a VM or alter Kilo permissions, and no guest package installation, update, or access-policy change.

### Operator and agent responsibilities

For the tested **sandboxed Kilo agent**, the operator owns host-level VM startup and shutdown. Use a normal Mac terminal, not an agent-executed shell command. Do not disable the sandbox or add permissions just to repeat a lifecycle request already known to be denied.

| Action | Who runs it in this setup |
| --- | --- |
| `preflight`, `prepare`, `create` | Agent, with approval for the project-local preparation; these succeeded inside the sandbox. |
| `start`, `start-session` (`vm:start`) | Operator, outside the sandbox. Wait for successful completion; the combined command also requires its Screen readiness message before handoff. |
| `status`, `check`, and approved guest-side test commands | Sandboxed agent, with guest commands gated on a running VM and the procedure's prerequisites. The baseline checks passed. |
| `stop` | Operator, outside the sandbox, after guest jobs finish. Then verify `status` reports `Stopped`. |

The operator starts the existing VM **and its agent terminal session** from the repository root:

```sh title="Operator: normal Mac terminal outside Kilo's sandbox"
deno task vm:start
```

The agent can then inspect state, run the probe, and carry out further authorized guest work through Lima shell/SSH. This is the intended division of work, not proof that every remaining guide command works unattended: interactive passwords/installers, console recovery, firewall lockout tests, and other tool limitations still need their documented prerequisites.

### One-command Screen handoff

`deno task vm:start` invokes `vm:probe start-session`. It keeps the existing version, ownership, and exact-profile guards, runs Lima's normal startup/readiness operation, confirms the named instance reports `Running`, then starts an ordinary-user GNU Screen session named `kixetpi-agent` inside the guest. It prints the full identifier, such as `123.kixetpi-agent`, and records it as `screenSession` in the private run's `result.json` only after a bounded query of window `0` succeeds. The original `deno task vm:probe start` remains available for **VM-only** startup.

No new packages, sudo grants, SSH policy, host mounts, or guest boot services are installed. The prior guest inventory included Screen `4.9.1`; missing `screen`, `timeout`, or `flock` makes setup stop rather than install software. A private `~/.kixetpi-agent-start.lock` serializes guest session setup; its kernel lock is released when setup ends, and the detached shell does not inherit its descriptor. The shell uses no Bash profile/rc files, a recognizable `kixetpi> ` prompt, and no saved Bash history. Screen's user configuration is bypassed, but its system configuration can still apply. Terminal contents can remain sensitive even without saved shell history.

This detached guest process is deliberately started by the **operator's command outside Kilo**, not by an agent bypassing the managed-background restriction. The command returns instead of attaching the operator's terminal. After success, the agent starts with `deno task vm:probe check` and uses finite Lima shell calls to inspect/control the emitted Screen identifier as the same guest user. For example, replace `PID.kixetpi-agent` with the exact printed identifier:

```sh title="Agent on Mac, repository root: inspect the existing Screen control window"
LIMA_HOME="$PWD/.lima" limactl shell --workdir=/ test \
  timeout 5s screen -S PID.kixetpi-agent -p 0 -Q info
```

`-Q info` confirms control-window responsiveness, **not** the displayed prompt, successful input delivery, or completion of a job. Before submitting any guide command or answer, inspect the terminal contents using Screen's `hardcopy -h` mechanism with a fresh private guest snapshot path. Use `stuff` only for a specific reviewed input to that identified window; never blindly send `yes`, credentials, or a new command to a potentially busy shell. **Screen expands dollar variables and backslash escapes in `stuff` input.** Do not treat it as literal transport for arbitrary shell source. The verified workaround is to stage and syntax-check a private guest script through a separate Lima call, then type only its simple path invocation and the reviewed response. Capture each actual job's output and exit status separately; the Screen startup result is not its result. See the [Debian Screen manual](https://manpages.debian.org/trixie/screen/screen.1.en.html) for these control commands.

Running the combined command again while a matching session exists **stops with an error and preserves the session**, even if it appears stale. It does not replace it, remove sockets, attach, or send input. Keep invocations sequential and inspect existing work before deciding to reuse or clean it up. The post-start inventory has a 15-second host deadline and guest session setup a 90-second host deadline in addition to its guest-side bounds. On a host deadline, the launcher terminates only its own CLI subprocess and records `timed-out` with an **indeterminate guest outcome**; a guest script or shell may still be running. A failure after Lima startup leaves the VM and any created Screen session intact; inspect the private run records and `vm:probe status` instead of assuming shutdown or retrying blindly.

Screen survives a management-SSH disconnect, not a guest reboot or shutdown. After a reboot, the operator must recreate the session with `vm:start` after checking the guest's state; an old printed identifier must not be reused. Neither Screen nor its retained shell is an independent console or a tested backup. Baseline clones, firewall recovery, and optional sudo-password tests retain their separate prerequisites.

Implementation checks use `deno task vm:test` for mocked startup and guest-shell tests plus local subprocess-recording/deadline tests; they do not launch Lima or a real Screen process. Live startup and a bounded prompt/input round trip were subsequently verified as recorded below. This does not establish every interactive program's behavior.

### Recorded Screen handoff

At **03:11 UTC on 18 October 2026**, the operator ran `deno task vm:start` outside the sandbox. Its private `result.json` recorded successful startup and session `741.kixetpi-agent`. The sandboxed agent independently confirmed `Running`, passed the baseline probe at **03:13 UTC**, queried the Screen window, and captured its idle `kixetpi>` prompt. The transient startup `no route to host` warning cleared before Lima satisfied its SSH/readiness requirements.

The first agent-written input probe had a quoting error and exited the session shell; this was a verification-harness error, **not a launcher failure**. The operator reran the same startup command, creating `851.kixetpi-agent`. A second inline probe exposed Screen's expansion behavior described above and returned to the prompt without a valid result. Both failed attempts remain in private evidence rather than being counted as passes.

At **03:17 UTC**, the corrected file-based fixture passed: stdin and stdout were TTYs, `hardcopy -h` captured the waiting `KIXETPI_INPUT_PROBE>` prompt, `stuff` delivered the simple `screen-roundtrip-ok` response, the fixture printed `KIXETPI_INPUT_OK`, and its separate status file recorded `0`. A subsequent snapshot showed `KIXETPI_PROBE_EXIT=0` and the returned `kixetpi>` prompt. Screen remained accessible across separate Lima calls; the shell had no child job afterward. A separate `flock -n` check confirmed the startup lock was available while Screen remained running. The guest still had zero failed units and a clean `dpkg --audit`.

The final observed handoff was the **running** VM with idle ordinary-user session `851.kixetpi-agent`, not a recovery root shell. Only private fixture/script/snapshot/status files and ordinary diagnostic logs were written; no packages, access policy, or guest configuration were changed. No reboot, console recovery, clone restore, password-required sudo, APT confirmation, or full guide checkpoint passed during this test. Private evidence is under `.vm-runs/screen-roundtrip-*` and `.vm-runs/walkthrough-screen-*`; the operator's initial result is in `.vm-runs/2026-10-18T03-11-49-256Z-start-session-9f59565924724836/`, and the independent baseline is in `.vm-runs/2026-10-18T03-13-03-002Z-check-82dc336bfba3c7d0/`.

Once guest work has finished, the operator stops the VM and checks its state:

```sh title="Operator: normal Mac terminal outside Kilo's sandbox"
deno task vm:probe stop
deno task vm:probe status
```

Inspect the stop result before the status check; never infer shutdown merely from an SSH disconnect or command timeout. An agent running without these sandbox restrictions **may** be able to run lifecycle commands itself, with authorization. That is environment-dependent and is not established by the sandboxed-agent results here; this operator requirement is not a universal Lima or agent limitation.

| Path | Purpose | Git handling |
| --- | --- | --- |
| `vm-tests/run.ts` | Versioned profile, image checksum, bounded commands, and baseline assertions. | Tracked. |
| `vm-tests/screen.ts`, `vm-tests/command.ts`, and their `_test.ts` files | Operator-started Screen handoff, recorded command deadlines, and isolated tests; no real VM/Screen startup during tests. | Tracked. |
| `.lima/` | Instance configuration, generated private identity, sparse disk, and runtime sockets. | Ignored; never publish. |
| `.vm-images/` | Verified pinned base image; local input avoids Lima's macOS image-download cache. | Ignored. |
| `.vm-runs/` | Per-invocation configuration, stdout/stderr, exit statuses, raw results, and cloud-init temporary storage. | Ignored; review and sanitize before sharing. |

The launcher rejects symlinked runtime roots, overly long socket paths, unknown versions, checksum mismatches, and reuse of an existing instance during creation. Later lifecycle commands require the creation marker and an unchanged, non-symlinked configuration matching the approved profile byte for byte. Unexpected project-local Lima defaults/overrides are rejected rather than inherited. Keep invocations sequential; do not start a second operation while one is running. Absolute generated paths stay in ignored state, not in the tracked recipe. Moving a populated checkout is not supported; recreate from the recipe in its new location instead.

Commands record a started/running state before completion and stream stdout/stderr into private files as well as the terminal. Only an exited record supplies a final exit status. An incomplete record after interruption means inspect the process and VM state before retrying; it is not evidence that the operation stopped.

Run each approved stage separately using the roles above, inspecting its result before continuing:

```sh title="Mac, repository root: inspect the profile and project-local inventory"
deno task vm:probe preflight
```

```sh title="Mac, repository root: download, checksum, and validate"
deno task vm:probe prepare
```

The launcher disables curl's inherited configuration and requests an HTTPS-only download bounded to four minutes and at most 1 GiB. A failed download remains `.part`, not a trusted image. Do not erase or overwrite an unexplained partial file to hide a failure. A successful preparation reuses only a checksum-verified complete image.

```sh title="Mac, repository root: create only the disposable VM"
deno task vm:probe create
```

Creation is not a dry run: it creates disks, cloud-init data, and credentials, but does not boot Linux. After reviewing its result, hand startup to the operator:

```sh title="Operator, normal Mac terminal outside Kilo: two-minute readiness wait"
deno task vm:start
```

The readiness timeout does not bound all preparation or prove a VM stopped. After an error or disconnected tool, inspect state rather than repeating the start:

```sh title="Mac, repository root: inspect actual state"
deno task vm:probe status
```

Only after successful startup, `deno task vm:probe check` runs release/architecture/PID-1 assertions, a noninteractive query of the fixture's existing sudo access, and service/journal/network discovery. System-journal discovery uses `sudo -n journalctl --list-boots --no-pager` inside the guest, with the already-provisioned fixture policy; no journal group membership or sudo grant is changed. The probe is not a TCP reachability, password-policy, or full walkthrough test. The operator's `deno task vm:probe stop` requests a normal stop of the owned instance. A failed probe halts its command sequence; it does not automatically shut the VM down.

The initial manual procedure in sections 1-3 uses a different instance name, profile, and default Lima home. It is an alternative, not a continuation of this launcher. Do not mix the two namespaces or assume the manual example's `kixetpi-test` is this project-local `test` VM.

### Recorded sandbox trial

Observed on **18 October 2026 UTC**, macOS 27.0.1, Apple Silicon, Deno 2.9.7, Lima 2.2.0. Kilo's sandbox stayed enabled with its existing network policy. No additional writable paths, host sudo, signing changes, global cache relocation, or sandbox exceptions were used.

| Assertion | Actual result |
| --- | --- |
| Project-local runtime directories and 95-byte reserved socket path | Passed. |
| Generated local-image profile validation | Passed. |
| Download of the pinned ARM64 qcow2 and SHA-512 verification | Passed; actual downloaded bytes matched the digest below. |
| Instance creation and local qcow2-to-raw conversion | Passed; disk expanded to the configured 16 GiB virtual capacity. |
| Cloud-init ISO temporary workspace | Created under `.vm-runs/tmp/`. |
| VZ startup | Blocked: exited 1 immediately with the error below. |
| Post-failure inventory | `test` reported `Stopped`. |
| Guest boot, fresh SSH, and all guest assertions | Not run; startup prerequisite failed. |

```text title="Sanitized host-agent failure"
Error Domain=VZErrorDomain Code=2
Invalid virtual machine configuration.
Virtualization is not available on this hardware.
```

The installed Lima binary has Apple's virtualization entitlement. However, `sysctl -n kern.hv_support` returned `Operation not permitted` inside the sandbox, and Lima's `sysctl.proc_translated` query was also denied. Apple reported virtualization unavailable **in this execution context**. The agent did not attempt an alternate launcher, signing change, emulator installation, or unsandboxed retry. The operator's later comparison is recorded separately below.

The stopped instance and verified image were retained, occupying approximately 1.4 GiB of allocated storage at observation time. The virtual disk's 16 GiB capacity is not its current allocated size. Raw evidence remains in ignored `.vm-runs/` and `.lima/test/ha.stderr.log`; do not publish those files unreviewed.

### Operator-reported outside-sandbox comparison

On **18 October 2026 UTC**, the operator ran the same existing project-local VM through a normal Mac terminal and supplied its command output. These are operator-reported results, not commands the sandboxed agent executed. Allocated storage was not remeasured after this boot.

| Assertion | Reported result |
| --- | --- |
| `sysctl -n kern.hv_support` outside Kilo | `1`. |
| `deno task vm:probe start` | VZ entered `running`; essential SSH and boot-script requirements completed; Lima printed `READY`. |
| `deno task vm:probe status` | `test` reported `Running`. |
| Release and architecture checks | Debian 13 Trixie (`DEBIAN_VERSION_FULL=13.6`), `arm64`, `64`, and `aarch64`. |
| PID 1 and fixture sudo | `systemd`; `sudo -n /usr/bin/id -u` printed `0`. This does not pass a password-required sudo test. |
| Failed-unit discovery | Zero failed units listed. |
| Original unprivileged `journalctl --list-boots` | Exited 1: no journal files opened due to insufficient permissions. This was a launcher privilege error, not another VM startup failure. |
| Network discovery | Not reached because the probe stopped at the journal error. |
| `deno task vm:probe stop` | VZ entered `stopped`; Lima confirmed the instance shut down. |

The same configuration successfully booting outside Kilo strongly isolates the original startup failure to the sandboxed execution context, rather than unsupported physical hardware. It does **not** identify the exact missing sysctl/Mach/service allowances or prove that permitting one query would fix sandboxed startup.

The original journal query was incorrectly run as the ordinary Lima account, which lacked access to the system journal. The corrected launcher uses the fixture's existing noninteractive sudo access for that read-only query. The later sandboxed-agent trial below verified that correction and completed the baseline probe; the original operator run remains recorded as partial.

The initial `no route to host` message occurred while the guest was booting; SSH and readiness subsequently succeeded. The closed-listener message during shutdown was followed by VZ's `stopped` state and Lima's shutdown confirmation. Neither message alone negates the completed boot/shutdown sequence.

### Sandboxed agent operating the running guest

At **02:05 UTC on 18 October 2026**, the agent ran `deno task vm:probe status` and the corrected `deno task vm:probe check` inside Kilo's unchanged sandbox. The instance was already running; the agent did not start, restart, stop, or reconfigure it. All probe commands exited successfully and the run's `result.json` recorded `status: completed`.

| Assertion | Agent-observed result |
| --- | --- |
| Management connection to the existing guest | Lima shell commands succeeded from inside the sandbox. |
| Release and architecture | Debian 13 Trixie, release detail 13.6; `arm64`, `64`, and `aarch64`. |
| PID 1 | `systemd`. |
| Existing fixture sudo access | `sudo -n /usr/bin/id -u` printed `0`; no privilege policy changed. |
| Failed units | Zero failed units listed. |
| Corrected system-journal query | `sudo -n journalctl --list-boots --no-pager` succeeded and listed current and previous boots. |
| Network discovery | `ip -br address` succeeded and showed active guest interfaces. This is not a DNS, firewall, or end-to-end reachability test. |
| Sandbox/configuration changes and guest mutations | None; only baseline inspection and private run-record creation. |

This verifies the guest-work portion of the workflow: **operator starts the VM outside Kilo, sandboxed agent runs these guest checks, operator stops it afterward**. It does not establish sandboxed VM lifecycle control, automatic console recovery, interactive installer support, or managed background-tool availability. Two visible journal boots do not validate the guide's journal drop-in or recovery procedure. The VM was left running at the end of this probe; the subsequent shutdown trial is recorded below.

Raw evidence is retained in ignored `.vm-runs/2026-10-18T02-05-09-240Z-check-8d0e8c0b6cc743d9/`. The recurring host Rosetta-detection warning remained nonfatal. No secrets, private addresses, or boot IDs are included in this public summary.

### Stop boundary and operator shutdown

At **02:09 UTC on 18 October 2026**, the agent attempted the normal `deno task vm:probe stop` inside the unchanged sandbox. Lima tried to send `SIGINT` to the externally started host-agent process and received `operation not permitted`. It continued waiting until the shell tool's 120-second timeout; a separate agent status check still reported `Running`.

No forced stop, permission change, or alternate shutdown path was attempted. A timed-out stop request was not treated as success. Its command record may be incomplete because the wrapper was interrupted; inspect actual VM state before any further operation. Raw logs remain under ignored `.vm-runs/2026-10-18T02-09-32-471Z-stop-56d9082e93a95bec/`.

The operator then reported manually stopping the VM outside Kilo. At **02:13 UTC**, the agent independently ran `deno task vm:probe status` inside the sandbox and confirmed **`Stopped`**. That final state is recorded in `.vm-runs/2026-10-18T02-13-46-743Z-status-356349b8fb9ca07b/`. The tested operating rule is therefore operator-owned **start and stop**, with sandboxed agent-owned approved guest work in between.

### Permission boundary before continuing

Storage relocation worked: this trial did not need extra Kilo writable paths for Lima state, downloaded images, or the observed cloud-init scratch files. That does not grant native virtualization operations or prove every possible framework write is project-local.

The operator's outside-sandbox capability query returned `1`, and the actual VM boot succeeded there. The sandboxed agent's later baseline probe also succeeded against the running guest, but its host-level stop signal was denied. Keeping both lifecycle operations with the operator allows this split workflow without additional Kilo permission changes for the commands tested. The remaining policy question is which sandbox allowances would permit host lifecycle control, not whether this host can run the guest at all.

Kilo's current sandbox configuration has no documented per-command virtualization or sysctl allowlist field. Adding a shell approval or more writable directories cannot enable the missing native capability query. A targeted sandbox-policy fix would need to be supported by Kilo, rather than invented as a project setting. A test-only unsandboxed session is a broader alternative requiring separate approval, not something this launcher requests or performs.

Managed background-process launches are also blocked independently by Kilo's active sandbox. This trial used finite blocking shell commands, preserving their output and exit statuses. Moving files into the repository does not enable completion-triggered background-tool wakeups. See the companion's [job handling](/kixetpi/reference/agent-assistance/#run-vm-preflight-jobs) for the interaction and scheduling distinctions.

### Partial stages 1-3 command preflight

At **02:27-02:31 UTC on 18 October 2026**, the operator had already started the project-local `test` instance. Against guide revision `fcad3a2796813df08fa25ee77724da69e90fdc50`, the sandboxed agent confirmed `Running`, reran the baseline probe, and exercised the safe diagnostics and simulations below. These are command-compatibility observations, **not completed stage checkpoints**. Later-stage inspections did not bypass the unfinished stage 1 upgrade/recovery gate.

The guest was Debian 13.6 Trixie, `arm64`/`64`/`aarch64`, with kernel `6.12.95+deb13-cloud-arm64`, systemd `257.13-1~deb13u1`, APT `3.0.3`, and OpenSSH server `1:10.0p1-7+deb13u4`. The baseline had 1.9 GiB RAM, approximately 1.8 GiB available, no swap, and approximately 662 MiB used on the 16 GiB root filesystem. These idle VM measurements are not Pi savings or an application-load test.

| Area | Observed result and limit |
| --- | --- |
| Base identity, network, and clock | Passed release/architecture/PID-1 checks, route and DNS discovery, and synchronized time with active NTP. Pi model and `/boot/firmware` paths were absent as expected; the guest uses `/boot/efi`. |
| Resource, service, port, and package inventory | Commands succeeded except the ordinary-user lookup of `swapon`; its installed absolute path worked. Zero failed units. Listeners were SSH, local DNS, DHCP, and systemd-resolved's LLMNR. |
| APT refresh and upgrade proposal | `sudo apt update`, `apt list --upgradable`, and `sudo apt-get -s dist-upgrade` succeeded. The plan contained 55 upgrades, one new cloud-kernel package, and zero removals. No full upgrade or reboot was executed. |
| Bluetooth discovery | Unit not found; its nonzero status checks were expected. No Bluetooth software was installed or enabled. |
| Package review | Installed-package and dependency queries and simulated autoremove/removal worked. Simulating removal of `eject` also proposed removing `cloud-init`, so the removal gate correctly rejected it. Simulated `hello` installation proposed only that package; no package was installed or removed. |
| Journal and memory inspection | Configuration, usage, SSH/kernel log filters, and previous-boot queries worked. Existing history spanned three boots and used 8 MiB. Absolute-path `zramctl` showed no devices; `vmstat 1 10` showed no swap traffic. This did not test the proposed journal drop-in or its reboot persistence. |
| Sudo | `sudo -l` showed the fixture's `NOPASSWD: ALL`; `visudo -c` passed. The ordinary account's password was locked. No password-required sudo or console-login test passed. |
| SSH policy inspection | `sshd -t`, unfiltered `sshd -T`, and `sshd -T -C` with the observed management connection succeeded. Password and keyboard-interactive authentication were already disabled; root key login remained permitted by `permitrootlogin without-password`. The four proposed directives passed syntax/effective-policy checks supplied as command-line `-o` options only, not as an installed drop-in or running-server change. |
| SSH activation paths | TCP `ssh.service` was active, alongside generated VSock and Unix-local SSH sockets. Lima shell reused its management connection; this was not a fresh, independently verified TCP authentication test. |
| Firewall discovery | nftables/firewalld/UFW services were inactive or absent. `nft` and UFW were not installed. IPv4/IPv6 iptables save commands, including legacy variants, returned empty rules; forwarding was disabled. UFW installation simulation proposed only UFW. No UFW staging, activation, filtering, or console recovery was tested. |
| AppArmor | LSM discovery and `sudo aa-status` succeeded: 106 profiles loaded, seven enforcing, 23 complain, 76 unconfined, and zero currently profiled processes. This is not application confinement evidence. |
| Existing unattended-upgrades | `sudo unattended-upgrade --dry-run --debug` completed successfully using Debian Trixie and Debian security origins, excluding updates/backports under the existing policy. It populated download/cache/log state but did not upgrade packages. Its final "All upgrades installed" message was simulation output, not an applied update. |

**VM path adaptation:** this account's `PATH` omitted `/usr/sbin`, although `/usr/sbin/swapon` and `/usr/sbin/zramctl` were installed. The bare `swapon --show` command failed with exit 127, and ordinary `command -v zramctl` did not find the installed tool. Use the verified absolute paths for this VM; do not install duplicate packages or alter the Mac's `PATH` to address guest lookup failures. This observation does not establish Raspberry Pi OS's login defaults.

**Pause boundary:** the runner has no supported interactive stdin/terminal, no preserved stopped baseline clone was present, and no independent recovery console was demonstrated. Full upgrade, actual package transactions, fixture service/isolation changes, journal-policy changes, reboots, SSH-policy application/authentication-transition tests, and UFW changes remain **blocked or not run**, not failed guide commands. Optional sudo-password testing also needs a known disposable password and a retained recovery root shell. Resume mutation testing only after the operator provides the applicable recovery and interaction prerequisites. Do not bypass prompts with `-y`, change passwordless-sudo policy for convenience, or enable UFW over the management connection.

Final guest checks found zero failed units, a clean `dpkg --audit`, working DNS/time synchronization, and unchanged sampled installed package versions. No guest configuration or access policy changed. The VM was left running for operator handoff at the end of the preflight. The operator subsequently reported shutdown; at **02:39 UTC**, the agent independently confirmed `Stopped` in `.vm-runs/2026-10-18T02-39-32-530Z-status-f1ddf5ef9499c647/`. Private preflight evidence is under ignored `.vm-runs/walkthrough-*`, with the baseline probe in `.vm-runs/2026-10-18T02-27-26-125Z-check-73383ce123a827d9/`. Preserve failed probe attempts too: an empty-shell-glob inspection error and the initial tool-lookup failures are harness/adaptation issues, not successful guide assertions.

### Recorded bounded command trial

At **04:28-04:34 UTC on 18 October 2026**, following the operator's `vm:start` handoff and authorization to test the commands, the agent independently confirmed the project-local `test` VM was running and session `742.kixetpi-agent` was idle. The guide revision was `56fb1694de30b64e8c4403926710cc639411c52a`. The guest remained Debian 13.6 Trixie, kernel `6.12.95+deb13-cloud-arm64`, systemd `257.13-1~deb13u1`, APT `3.0.3`, OpenSSH server `1:10.0p1-7+deb13u4`, and util-linux `2.41-5`.

This was a **bounded compatibility trial**, not execution of all four stages in order. New fixtures were checked for name collisions, inspected before root-owned installation, and removed with targeted recovery commands. File transfer plus `install` substituted for interactive editing, and existing fixture sudo was queried with `-n` for finite privileged calls. Neither adaptation passes editor or password-required sudo tests. No stopped recovery clone or independent console was demonstrated; no access-policy change, upgrade, reboot, journal-retention change, or Nix installation was attempted.

| Test | Actual result and scope |
| --- | --- |
| Baseline and diagnostics | Passed release/architecture/PID-1, DNS, synchronized clock, resources, mounts, service/listener discovery, journal configuration/usage, `visudo -c`, `sshd -t`, unfiltered `sshd -T`, and AppArmor discovery. No swap/zram devices. Approximately 1.8 GiB RAM available at idle; not a Pi performance result. |
| APT review | `sudo apt update`, upgradable listing, and simulated `dist-upgrade` passed. The proposal still contained 55 upgrades, one new cloud-kernel package, and zero removals. It was **not applied**. |
| Service lifecycle | The documented `kixetpi-probe.service` fixture passed daemon-reload, `enable --now`, inspection, stop, start, and disable. `is-active` returned `inactive`/3 after stop; `is-enabled` returned `disabled`/1 after disable. The service remained active after disable, as documented. Startup behavior after reboot was not tested. |
| Service isolation | The guide's two-directive drop-in passed reload/restart/status/journal checks. Effective properties were `NoNewPrivileges=yes`, `PrivateTmp=yes`; the process had `NoNewPrivs: 1`, and `nsenter` proved a unique main-namespace `/tmp` file was absent in the service namespace. This verifies a sleeping fixture, not a real application or comprehensive confinement. |
| Isolation recovery and cleanup | Removing only the trial drop-in, reloading, and restarting restored `NoNewPrivileges=no`/`PrivateTmp=no` with the fixture active. Then the fixture was stopped and its new unit and empty drop-in directory removed; final `LoadState=not-found`. No unrelated service was changed. |
| Real package transactions | After simulation/dependency review, `sudo apt install hello`, `sudo apt-get remove hello`, and `sudo apt-get install hello` all completed with separately recorded status `0`. `hello` version `2.10-5` printed `Hello, world!` before removal and after reinstall; package and executable were absent after removal. Removal prompts were captured through Screen, compared with the hello-only simulation, and answered individually. No `-y`, `yes` pipe, blanket noninteractive environment, or extra sudo grant was used. A final reviewed removal restored the original package inventory. |
| Nix download and archive layout | Passed the documented 2.35.2 ARM64 download, SHA-256 comparison, `tar -tJf`, and ordinary-user extraction. The hash was `4d0302a2910f5eec1c33b8deef634f04899a75737e7001ec49908d003ae5efda`, matching the published value. All three named installer scripts existed and were copied out for inspection. A private review directory and bounded curl options were VM adaptations. No installer was executed; `/nix` and the `nix` command remained absent. Home Manager lock/build/activation/rollback remain not run. |
| Direct TCP SSH | **Blocked before authentication.** A separate `ssh -F /dev/null -a -S none` connection to the observed native-NAT IPv4 address exited 255 with `No route to host`. It used strict host-key checking, a private known-hosts fixture populated through management SSH, and Lima's existing VM-only identity. This was not the guide's independent console fingerprint check. No password-refusal assertion ran, no reachability/authentication pass was claimed, and no host network/sandbox settings were changed. The failure does not identify whether host routing, NAT, or execution-context restrictions caused it. |
| Final health | Zero failed units, clean `dpkg --audit`, working DNS and synchronized time. Test package/service removed; Screen returned idle. Private staged files, Nix archive/extraction, APT metadata/cache, and logs remain, so cleanup is not a byte-for-byte restore. Root usage was approximately 1.1 GiB afterward. |

**APT interaction finding:** both hello installation commands completed without a confirmation question even though no acceptance flag was supplied. Both removals displayed `Do you want to continue? [Y/n]`. Review simulations before invocation and inspect actual terminal output: do not wait for an imaginary prompt or type `y` into an already idle shell. This is an observed APT behavior, not an instruction to suppress prompts.

**Remaining gates:** full upgrade and reboot, journal-policy persistence/recovery, password-required sudo, SSH policy activation/authentication transition, UFW activation/filtering/console recovery, and multi-user Nix/Home Manager remain blocked or not run. Screen interaction is now demonstrated for these APT transactions; it does not supply the missing recovery clone, independent console, or reachable direct TCP path. Preserve those distinctions when resuming.

Private per-command argv, timestamps, stdout/stderr, exit records, and Screen snapshots are under ignored `.vm-runs/command-trial-*`; the separate hello removal review is in `.vm-runs/walkthrough-current-hello-removal-review-276d9ceb6c5e3720/`. The baseline probe is `.vm-runs/2026-10-18T04-28-11-349Z-check-5401f87d5b29181a/`. A local runner parse error occurred before any guest command and was corrected; retain it as a harness error, not a failed guide command. The VM was left **running**, with no job pending, for operator-owned shutdown using the commands above.

## 1. Inspect the host and reserve names

The initial CLI-only host inspection on 18 October 2026 UTC, before the repository-local trial, found the following. These are historical observations, not portable prerequisites or current VM inventory.

| Item | Observed |
| --- | --- |
| Lima | `limactl version 2.2.0` |
| Command location | `/opt/homebrew/bin/limactl` |
| Host OS | macOS `27.0.1` |
| Bundled template | `debian-13` is listed |
| VM inventory | No instances reported at that initial inspection. The later project-local trial retained a stopped `test` instance. |
| Inspection warning | Rosetta detection could not read `sysctl.proc_translated` in the agent environment; startup had not yet been attempted. |
| Job-runner limitation | The documentation session's managed-process launch was sandbox-denied; a blocking site build worked. Automatic completion wakeups have not been exercised. |

Recheck before a run:

```sh title="Mac: read-only capability and inventory checks"
limactl --version
sw_vers
uname -m
limactl list --json
limactl start --list-templates
limactl create --help
limactl start --help
limactl shell --help
limactl clone --help
```

Expect an Apple Silicon host (`arm64`) and a `debian-13` template. Stop if another instance already uses `kixetpi-test` or `kixetpi-baseline`; do not reuse, overwrite, or delete an unknown VM. The examples reserve those two names for this run only. Record any approved alternative names consistently.

Keep the guide revision, Lima version, resolved VM configuration, image URL/checksum, and command output in a run directory on the Mac, outside the guest and outside the website's public files. No passwords, private keys, or sensitive logs belong in this repository.

## 2. Create, review, and start the guest

The following **creates VM state and can download/prepare the image and disks**. It is not a dry run, although it does not start a guest. Four GiB of RAM and a 32 GiB disk are initial test allocations, not Pi or Nix minimum requirements. Leave capacity on the Mac for a baseline clone.

The installed `debian-13` template has a dated image and a moving daily fallback. To avoid silently accepting the fallback, create this small image definition in the approved run directory on the Mac, not in the website repository:

```yaml title="Mac file: kixetpi-vm-image.yaml"
images:
  - location: "https://cloud.debian.org/images/cloud/trixie/20260712-2537/debian-13-genericcloud-arm64-20260712-2537.qcow2"
    arch: aarch64
    digest: "sha512:8543d795f2fde630eb66c492f245a8c1da19dedc636e0a8e7b3d0f95920e1a05aa911ef2d82d177d41cc53ced5fccbd2a3945d07fa5e15018914c4d864bb07ed"
```

This image URL and digest match the installed Lima 2.2.0 template and Debian's [published SHA-512 list](https://cloud.debian.org/images/cloud/trixie/20260712-2537/SHA512SUMS), checked on 18 October 2026 UTC. This checks published metadata agreement, not downloaded bytes. Dated images may be removed upstream: if unavailable, stop and choose a new dated Trixie ARM64 genericcloud image with its matching verified digest. Do not remove checksum verification or substitute a moving URL. The `nocloud` image variant is not a drop-in replacement for genericcloud.

Check the staged YAML without creating or booting a VM:

```sh title="Mac: validate the local image definition"
limactl validate ./kixetpi-vm-image.yaml
```

The image definition passed this parser check during documentation work. This does not verify a download, the complete flag-adjusted VM configuration, or boot compatibility.

```sh title="Mac: create only the approved disposable VM"
limactl create --tty=false --name=kixetpi-test \
  --vm-type=vz --arch=aarch64 --cpus=2 --memory=4 --disk=32 \
  --plain --containerd=none --mount-none \
  --network=vzNAT --set='.ssh.overVsock = false' ./kixetpi-vm-image.yaml
```

Inspect the generated configuration in the instance directory reported by `limactl list --json`. With the default `LIMA_HOME`, it is `~/.lima/kixetpi-test/lima.yaml`. Review any global Lima defaults/overrides too. Confirm Debian 13 ARM64, the single intended image and digest, plain mode, no host mounts/containerd, no forwarded host credentials, and no physical devices.

This profile explicitly disables SSH over VSock and adds VZ's native NAT network for a directly host-reachable guest IP, without bridged networking or a host sudoers change. Record the actual address after boot; do not assume the default user-mode address is reachable. This network and TCP behavior remain untested here. If unavailable in the execution environment, stop rather than change the Mac firewall or silently switch transports.

Plain mode disables convenience features including filesystem mounts, dynamic port forwarding, containerd, the guest-agent daemon, SSH-agent forwarding, and host clock synchronization. It still provisions a base account and SSH keys. Those are **Lima fixtures**, not proof of Raspberry Pi Imager's behavior.

Only after reviewing that configuration:

```sh title="Mac: start and wait for guest readiness"
limactl start --tty=false --timeout=15m kixetpi-test
```

Do not use `--foreground` for this readiness check: that mode retains the host-agent process instead of simply returning after startup. In Lima 2.2.0, `--timeout` bounds the readiness-event wait, not the entire image preparation/download or VM lifetime. A timeout or failed readiness check is not a pass and does not prove the VM stopped. Inspect its state and logs before retrying; do not launch another start or package operation blindly.

## 3. Establish execution context and baseline

For a single command from the Mac, explicitly select a guest working directory. Plain mode does not share the repository directory:

```sh title="Mac: execute a command inside the named guest"
limactl shell --workdir=/ kixetpi-test uname -m
```

For the blocks labeled VM guest below, open a guest shell first, or use an equivalent `limactl shell` invocation for each command:

```sh title="Mac: open the guest shell"
limactl shell --workdir=/ kixetpi-test
```

Do not assume shell variables, `cd`, or a root shell survive separate tool calls. Run checks individually, preserve stdout/stderr and exit status, and inspect each result. Some discovery commands intentionally return nonzero. Never turn an unexplained failure into success with `|| true`.

```sh title="VM guest: identify the test target"
whoami
getent passwd "$(whoami)"
hostnamectl
cat /etc/os-release
dpkg --print-architecture
getconf LONG_BIT
uname -m
uname -r
ps -p 1 -o comm=
sudo -l
```

Require `VERSION_CODENAME=trixie`, `arm64`, `64`, `aarch64`, and systemd as PID 1. Record the actual username/home directory and privilege policy; the home may not be `/home/USERNAME`. Lima 2.2.0's default account is host-derived, has passwordless sudo, and has a locked password. Do not presume a known console password or count these defaults as a passed password-required sudo test.

Cloud-init/Lima provisioning can reapply password locking, authorized keys, and sudo policy during later Lima starts. For account-policy tests, distinguish a guest `sudo reboot` from a host-side stop/start and inspect the effective policy after both. Do not disable provisioning merely to hide a persistence mismatch.

```sh title="VM guest: capture services, resources, network, and logs"
ip -br address
ip route
timedatectl status
free -h
/usr/sbin/swapon --show
df -h /
systemd-analyze
systemctl --failed
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service --state=enabled
systemctl list-sockets --all
systemctl list-timers --all
sudo ss -lntup
sudo journalctl --disk-usage
sudo journalctl -b -p warning --no-pager
apt-cache policy
apt-mark showmanual
dpkg-query -W -f='${binary:Package}\t${Version}\n'
```

Record missing tools and existing failed units before installing anything. The absolute `swapon` path above accommodates the observed Debian VM account's missing `/usr/sbin` search path; verify installed paths rather than assuming an unfound command means a missing package. Correct a wrong clock, broken DNS, or unexpected repositories before updates. Do not demand an empty warning journal or describe the VM's RAM/boot measurements as Pi savings.

### Review updates separately

Use [stage 1's update gates](/kixetpi/guides/raspberry-pi-os/#5-confirm-the-release-and-update-normally). These commands change only the VM, but still require reviewing removals, package prompts, and disk estimates:

```sh title="VM guest: refresh metadata, then inspect the proposal"
sudo apt update
apt list --upgradable
sudo apt-get -s dist-upgrade
```

Only after accepting the reviewed transaction, run `sudo apt full-upgrade`. Reboot only after it completes successfully. An SSH disconnect on reboot is expected, not evidence of a successful next boot. From the Mac, wait for the guest to return, then recheck its kernel, failed units, network, clock, and fresh access.

### Preserve a baseline

After the baseline is healthy, leave the guest shell with `exit`. Stop and clone from the Mac:

```sh title="Mac: preserve the stopped baseline, then resume testing"
limactl stop kixetpi-test
limactl list --json
limactl clone --tty=false kixetpi-test kixetpi-baseline
limactl start --tty=false --timeout=15m kixetpi-test
```

Confirm the stop completed before cloning. Keep `kixetpi-baseline` stopped and unchanged. It is an out-of-band VM recovery fixture, **not** a passed local-console or full-card restore test. Before risky tests, clone the baseline to another approved temporary instance and verify that copy can boot and accept access, then stop it. Do not run identity-sharing copies together or assume cloning sanitizes credentials. No clone restoration has been exercised for this page.

Lima 2.2.0's VZ driver does **not** implement snapshots, even though `limactl snapshot` appears in CLI help. Use stopped-instance clones, not an assumed snapshot feature. No additional/external disks are part of this profile; do not assume an instance clone would preserve such disks.

## 4. Test reduction commands

### Service lifecycle

Follow the [Bluetooth discovery checks](/kixetpi/guides/dietpi/#2-trial-one-unused-service) only if the service exists and is unused. Absent, inactive, and disabled states are observations, not reasons to enable a service. Normally this VM should skip the hardware example.

To exercise the same systemctl command family without pretending Bluetooth exists, use a **separately recorded test fixture**. First confirm `kixetpi-probe.service` and its drop-in directory do not already exist. Create this unit in the VM, replacing `YOUR_VM_USER` with the ordinary account recorded above:

```ini title="VM guest file: /etc/systemd/system/kixetpi-probe.service"
[Unit]
Description=Disposable KixetPi command probe

[Service]
User=YOUR_VM_USER
ExecStart=/usr/bin/sleep infinity

[Install]
WantedBy=multi-user.target
```

Inspect the staged file before installing it as root-owned mode `0644`. File content is not shell input. Using a reviewed file transfer instead of `sudoedit` must be recorded as an adapted execution method, not a tested interactive editor command.

Run one operation at a time and verify its resulting state:

```sh title="VM guest: exercise the nonessential fixture"
sudo systemctl daemon-reload
sudo systemctl enable --now kixetpi-probe.service
systemctl cat kixetpi-probe.service
systemctl is-enabled kixetpi-probe.service
systemctl is-active kixetpi-probe.service
sudo systemctl stop kixetpi-probe.service
systemctl is-active kixetpi-probe.service
sudo systemctl start kixetpi-probe.service
sudo systemctl disable kixetpi-probe.service
systemctl is-enabled kixetpi-probe.service
```

Expect enabled/active after `enable --now`, inactive after stop, and disabled after disable. Nonzero from the expected inactive/disabled checks is normal. Disable does not stop the running process. Reboot after the operations complete, confirm the fixture does not automatically start, then exercise `sudo systemctl enable --now kixetpi-probe.service` as recovery. This passes only a fixture-level lifecycle test, not a Bluetooth dependency test.

### Package transaction

Use [stage 2's removal review](/kixetpi/guides/dietpi/#3-review-package-removal-without-a-bulk-purge). For a repeatable fixture, first establish that Debian's `hello` package is not already part of the baseline or a dependency of the workload. Review and install it with `sudo apt install hello`; record this as test preparation.

```sh title="VM guest: inspect and simulate the fixture removal"
apt-cache policy hello
apt-cache depends hello
apt-cache rdepends --installed hello
sudo apt-get -s remove hello
```

After reviewing the complete simulation, exercise `sudo apt-get remove hello` and `sudo apt-get install hello`. Inspect actual output and any confirmation question before answering; a simple installation may complete without one. Verify package state with `dpkg-query -W hello` and program behavior with `hello` before removal and after reinstall. A missing command after removal is expected. Remove only the added fixture package afterward if it was absent from the baseline. Do not run an actual `autoremove` or extrapolate this result to removing Pi metapackages.

### Persistent journal

Apply the exact drop-in and recovery from [stage 2's journal section](/kixetpi/guides/dietpi/#4-bound-logs-without-discarding-them-at-reboot), preserving logs and checking that its filename is unused. Test the commands, not just the configuration text:

```sh title="VM guest: inspect the applied logging configuration"
systemd-analyze cat-config systemd/journald.conf
sudo journalctl --disk-usage
sudo journalctl --list-boots
```

After applying the guide's settings, restarting journald, and flushing successfully, create a non-sensitive marker:

```sh title="VM guest: mark the current boot before a reboot"
logger -t kixetpi-vm-probe 'persistent journal preflight'
sudo journalctl -t kixetpi-vm-probe -b --no-pager
```

Reboot, reconnect, then require the marker in `sudo journalctl -t kixetpi-vm-probe -b -1 --no-pager`. Merely obtaining exit code zero from a journal query with no matching entries is not a pass. Exercise the guide's targeted drop-in removal/restart recovery too. Retention settings can discard history; undoing them cannot recover deleted logs.

## 5. Test hardening without false access checks

Read [stage 3](/kixetpi/guides/kicksecure/) in full before mutating access policy. These tests have additional prerequisites; waiting longer does not supply them.

| Test | Main commands and required evidence | Stop or skip condition |
| --- | --- | --- |
| Sudo policy | `sudo -l`, `visudo -c`; for the optional password change, `sudo -k` and `sudo /usr/bin/id -u` in a second normal-user session must prompt and print `0`. | No known disposable account password, supported terminal, or retained root recovery shell. Never change host sudo or grant extra passwordless access to make the test run. |
| SSH syntax/effective policy | The guide's `sudo /usr/sbin/sshd -t`, `sshd -T`, and `sshd -T -C` with real connection values, followed by `sudo systemctl reload ssh`. | Inspect Lima/cloud-init includes and socket units first. Conflicting defaults, missing include, or wrong effective settings mean stop, not overwrite. |
| SSH authentication | Fresh TCP key-only login, working sudo, and password-only refusal using the guide's `ssh -S none` commands. | No verified TCP route, authorized test public key, verified host fingerprint, or independent recovery channel. A timeout is not authentication refusal. |
| UFW | Inspect existing rules, install/review UFW, stage the guide's policy, and run `sudo ufw --dry-run enable`. For activation, test both allowed SSH and a known reachable non-allowed test port becoming blocked, then repeat after reboot. | No independent console/recovery channel for activation, unexplained rules, routing/container/VPN workload, or unsupported interactive prompt. Do not use `--force` or `ufw reset`. |
| AppArmor | `cat /sys/kernel/security/lsm`; `sudo aa-status` only if installed. | Missing module/tools/profiles means unavailable, not confined. Results apply only to the guest kernel. |

### Separate TCP testing from management access

Lima 2.2.0 normally uses SSH over VSock for VZ Linux guests; even ordinary SSH to its localhost port can terminate in guest VSock rather than TCP. This profile disables that behavior before creation, but verify the resolved configuration and startup logs. Establish a separate direct TCP path from the Mac or a peer VM to the guest's observed `vzNAT` address, and verify it before changing policy. Record the observed source/destination addresses for `sshd -T -C`. Do not blindly treat Lima's localhost management port as this path.

Lima's generated SSH configuration uses convenience defaults including multiplexing and disabled host-key checking. Do not adopt it unchanged as the security-test configuration. Do not use `limactl shell --reconnect` as a fresh-login check: it can terminate the SSH master and disrupt retained sessions. Inspect both `ssh.service` and any socket-activated SSH units so that a successful reload refers to the server actually being tested.

Provision a disposable public key using the [stage 1 key guidance](/kixetpi/guides/raspberry-pi-os/#prepare-an-ssh-key-first), adapting only the VM key filename and manual guest public-key authorization in place of Imager. Never copy its private key into the VM. Obtain and compare the server fingerprint before accepting it; do not bypass host-key checking through a convenience SSH configuration.

For example, with `~/.ssh/kixetpi_vm_ed25519` already authorized, a verified known-host entry, and the placeholders resolved to the **TCP-reachable** guest:

```sh title="Mac: fresh key-only TCP login to the guest"
ssh -F /dev/null -a -S none -o StrictHostKeyChecking=yes \
  -i ~/.ssh/kixetpi_vm_ed25519 \
  -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  YOUR_VM_USER@YOUR_VM_IP
```

`-F /dev/null` excludes inherited Mac SSH configuration, `-a` disables agent forwarding, and strict host-key checking requires the previously verified known-host entry. These VM-test adaptations prevent host aliases, proxies, or forwarding defaults from silently changing the test path.

After the policy change, run the password-only negative test against the same address:

```sh title="Mac: expect authentication refusal, not a timeout"
ssh -F /dev/null -a -S none -o StrictHostKeyChecking=yes \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password,keyboard-interactive \
  YOUR_VM_USER@YOUR_VM_IP
```

A locked-password account failing to log in is not proof that SSH policy disabled password authentication: also require the documented effective-policy checks and a suitable account fixture before claiming the full authentication transition. Check IPv4 and IPv6 separately when configured. Mark an unconfigured address family untested. SSH tunnels that terminate inside the guest can bypass the inbound filtering path and are not a substitute for this test.

Restoring a VM clone after lockout tests the harness's recovery, **not** the guide's console command `sudo ufw disable`. Without a demonstrated independent console, leave activation and its console recovery marked blocked. A separately approved VM-only lockout experiment must remain distinct from passing the original procedure.

### Isolation fixture

The probe service from section 4 can replace `YOUR_APP.service` in [stage 3's isolation trial](/kixetpi/guides/kicksecure/#5-trial-isolation-for-a-service-you-understand). Use only its new, unused `60-kixetpi-hardening.conf` with the guide's `NoNewPrivileges=yes` and `PrivateTmp=yes`. Then run the guide's daemon-reload, restart, status, journal, and security-inspection commands.

Inspect effective properties and verify behavior, not only a security score:

```sh title="VM guest: inspect the running isolated fixture"
systemctl show kixetpi-probe.service -p NoNewPrivileges -p PrivateTmp -p MainPID
```

Require an active service and a nonzero, current PID before `nsenter`. In the same guest shell, create a unique temporary file in the guest's main mount namespace and check it is absent inside the service's mount namespace:

```sh title="VM guest: verify the fixture's private temporary directory"
PROBE_PID=$(systemctl show kixetpi-probe.service -p MainPID --value)
test "$PROBE_PID" -gt 1
HOST_PROBE=$(mktemp /tmp/kixetpi-private-tmp.XXXXXX)
sudo nsenter --target "$PROBE_PID" --mount -- test ! -e "$HOST_PROBE"
sudo cat "/proc/$PROBE_PID/status"
rm "$HOST_PROBE"
```

The absence check should succeed; inspect `NoNewPrivs: 1` in the process status. If a prerequisite, command, or assertion fails, stop and diagnose before cleanup/continuation. This demonstrates these two mechanisms for a sleeping fixture, not isolation of a real application. Test the guide's targeted drop-in removal, reload, and restart recovery; do not use `systemctl revert`.

## 6. Test optional Nix and Home Manager

Preserve a separate stopped pre-Nix clone under a new approved name before beginning. Follow [stage 4](/kixetpi/guides/nix/) for architecture/capacity checks, release support, download, checksum comparison, archive/script review, and ordinary-user `./install --daemon`. Do not substitute a preinstalled Nix container or a single-user install and call the multi-user path passed.

The installer is interactive. If the runner cannot preserve and answer its prompts safely, mark installation blocked. Do not guess installer automation flags. Once installation succeeds, test a fresh login shell and these gates individually:

```sh title="VM guest: verify the newly installed multi-user Nix"
command -v nix
nix --version
systemctl status nix-daemon.socket nix-daemon.service --no-pager
```

Use the guide's user configuration and exact Home Manager file contents, replacing the account/home placeholders with observed VM values. Confirm the paired release branches are still supported. Do not change `aarch64-linux` to a Darwin platform just because the agent runs on a Mac.

```sh title="VM guest normal user: verify daemon access after enabling the documented features"
nix store info --store daemon
```

From the configuration directory, lock inputs and inspect the build proposal:

```sh title="VM guest normal user: lock and preview"
cd ~/.config/home-manager
nix flake lock
nix build .#homeConfigurations.pi.activationPackage --dry-run
```

Only after reviewing the preview, build with `nix build .#homeConfigurations.pi.activationPackage`. Only after a successful build, activate with `./result/activate`, without sudo. Preserve the configuration, generated lock file, and activation output outside the VM.

Apply the guide's shell-initialization block, open a fresh login, and verify:

```sh title="VM guest normal user: verify the activated user tools"
home-manager generations
command -v home-manager
type -a jq rg
jq --version
rg --version
```

Require the selected tools to resolve to the Nix user environment. Then perform the guide's package-list change: remove `ripgrep`, run `home-manager build --flake .#pi`, review, and only then run `home-manager switch --flake .#pi`. In a fresh shell verify the selected environment changed; an APT-provided `rg` may still exist.

Record the good generation before that change. Exercise `home-manager switch --rollback` only when the preceding retained generation is that known-good one. Verify the restored tools and restore the saved configuration/lock file too. The first activation has no previous generation. Reboot and retest SSH, sudo, APT, daemon access, and user tools. Record store size and VM memory observations without treating them as Pi measurements. Do not collect/delete generations during the rollback test.

## 7. Record results and recover deliberately

Keep one result per command or behavioral assertion. A syntax validator, effective-policy query, and actual connection test are three different assertions. Classify failures before changing the guide: a missing test prerequisite or VM-specific path is not automatically a documentation bug.

```text title="VM test record, stored outside the guest"
Run date and guide revision:
Host architecture/macOS; Lima version/backend:
Guest image URL/digest; resolved VM configuration:
Guest release/kernel/userspace architecture; installed package versions:
Original guide section and exact command or file content:
Fixture/substitution and reason, or unchanged command:
Preconditions; approval; execution account/session/working directory:
Expected exit status and behavioral result:
Actual exit status, stdout/stderr, and behavioral evidence:
Process/job identity and completion evidence, if asynchronous:
Recovery attempted; result; preserved baseline:
Status: passed in this VM / failed / skipped / blocked / not run
Remaining Raspberry Pi-specific assertion:
```

Export evidence while access still works. For a deliberately created, sanitized file in the guest user's home, Lima 2.2.0 supports:

```sh title="Mac: copy an existing guest evidence file to the existing run directory"
limactl copy kixetpi-test:YOUR_VM_HOME/vm-test-results.txt ./vm-test-results.txt
```

Replace `YOUR_VM_HOME` with the observed absolute guest home path, and resolve the destination run directory first; do not overwrite an existing result file. Copying is SSH-dependent too, so capture important output on the Mac as each command runs, not only at the end.

After failure, preserve accessible logs and stop the affected test. With separate approval to discard the test VM's state, stop that named VM, confirm it is stopped, remove **only that disposable instance**, and clone the preserved baseline back to its reserved name:

```sh title="Mac: destructive VM replacement, only after explicit discard approval"
limactl delete --tty=false kixetpi-test
limactl clone --tty=false kixetpi-baseline kixetpi-test
limactl start --tty=false --timeout=15m kixetpi-test
```

If a normal stop fails, assess a forced host-side stop separately; it can lose guest writes. Never delete the baseline or unrelated instances. Preserve SSH identity checks when restoring/cloning: verify the guest's fingerprint rather than disabling checks to suppress a warning. Successful VM replacement does not restore evidence that was kept only in the discarded guest.

The outcome is a command compatibility report for this setup. Do not update the four guides' hardware status to passed, claim Pi resource savings, or turn skipped controls into successes.

## Agent execution and sources

For managed long-running commands, completion-triggered wakeups, interactive prompts, and bounded waits, use the companion's [VM preflight job handling](/kixetpi/reference/agent-assistance/#run-vm-preflight-jobs). This page does not assume every agent has a persistent terminal or background completion notifications.

CLI options and bundled-template availability inspected locally against Lima 2.2.0 on 18 October 2026 UTC. Sandboxed creation, operator-reported outside-sandbox boot, the agent's complete corrected baseline probe, denied sandboxed stop, and agent-confirmed stopped state after operator shutdown are recorded separately above. The full manual guest procedure remains unverified. Consult the installed CLI help when moving to another release.

- [Lima plain mode](https://lima-vm.io/docs/config/plain/) and [VZ backend](https://lima-vm.io/docs/config/vmtype/vz/).
- [Lima start](https://lima-vm.io/docs/reference/limactl_start/), [shell](https://lima-vm.io/docs/reference/limactl_shell/), [clone](https://lima-vm.io/docs/reference/limactl_clone/), and [SSH](https://lima-vm.io/docs/usage/ssh/).
- Lima 2.2.0 source for [VZ transport and unimplemented snapshots](https://github.com/lima-vm/lima/blob/v2.2.0/pkg/driver/vz/vz_driver_darwin.go), [startup waits](https://github.com/lima-vm/lima/blob/v2.2.0/pkg/instance/start.go), and [account provisioning](https://github.com/lima-vm/lima/blob/v2.2.0/pkg/cidata/cidata.TEMPLATE.d/user-data).
- Apple's [VZ support query](https://developer.apple.com/documentation/virtualization/vzvirtualmachine/issupported) and [Hypervisor availability check](https://developer.apple.com/documentation/hypervisor), plus [Kilo's sandbox controls](https://kilo.ai/docs/getting-started/settings/sandboxing).
- [Debian Trixie ARM64 installation images](https://www.debian.org/releases/trixie/debian-installer/).
- [The four stages and their command references](/kixetpi/#follow-the-four-stages), including their prerequisites and recovery limits.
