---
title: VM command test run
description: Preflight the walkthrough's Linux commands in a disposable Debian 13 ARM64 Lima VM on an Apple Silicon Mac.
prev: false
next: false
---

Use this separate test track to find command, configuration, and integration errors before a Raspberry Pi walkthrough. The target is **Debian 13 Trixie ARM64 under Lima**, not an emulated Raspberry Pi or a new KixetPi image. The [four stage guides](/kixetpi/#follow-the-four-stages) remain the procedure being tested.

:::caution[Proposed procedure, not a recorded pass]
Only host-side CLI, configuration, and documentation checks have been performed. No VM has been created or booted for this page, and none of the guest tests below has run. A website build checks rendering, not these commands. The Raspberry Pi walkthrough remains untested.
:::

## Scope and authorization

Obtain approval before creating the VM, downloading images, or running guest mutations. Keep all Linux administration inside the named disposable guest. **Never run a block titled VM guest in the Mac's shell.** Do not attach a physical disk, share the Mac's home directory, forward an SSH agent, or use production credentials.

This track can test systemd, journald, APT, SSH, sudo, and optional Nix/Home Manager behavior on a booted ARM64 Linux system. It cannot validate Raspberry Pi Imager, Pi firmware/kernel updates, Wi-Fi/Bluetooth, GPIO, stock Pi swap, SD-card behavior, power, thermal behavior, or physical recovery. Measurements describe this VM only.

Generic Debian has different package inventories and defaults. Do not add Raspberry Pi repositories, invent `/proc/device-tree/model`, create `/boot/firmware` to satisfy a check, or install Bluetooth just to make the example applicable. Record these differences and skip the affected Pi-specific assertions.

## 1. Inspect the host and reserve names

The development host inspection on 18 October 2026 UTC found the following. These are observations, not portable prerequisites or guest test results.

| Item | Observed |
| --- | --- |
| Lima | `limactl version 2.2.0` |
| Command location | `/opt/homebrew/bin/limactl` |
| Host OS | macOS `27.0.1` |
| Bundled template | `debian-13` is listed |
| VM inventory | No instances reported |
| Inspection warning | Rosetta detection could not read `sysctl.proc_translated` in the agent environment; acceleration and startup remain unverified. |
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
swapon --show
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

Record missing tools and existing failed units before installing anything. Correct a wrong clock, broken DNS, or unexpected repositories before updates. Do not demand an empty warning journal or describe the VM's RAM/boot measurements as Pi savings.

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

After reviewing the complete simulation, exercise `sudo apt-get remove hello` and `sudo apt-get install hello`, reviewing the actual prompt each time. Verify package state with `dpkg-query -W hello` and program behavior with `hello` before removal and after reinstall. A missing command after removal is expected. Do not run an actual `autoremove` or extrapolate this result to removing Pi metapackages.

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

CLI options and bundled-template availability inspected locally against Lima 2.2.0 on 18 October 2026 UTC. The guest procedure is proposed and unexecuted. Consult the installed CLI help when moving to another release.

- [Lima plain mode](https://lima-vm.io/docs/config/plain/) and [VZ backend](https://lima-vm.io/docs/config/vmtype/vz/).
- [Lima start](https://lima-vm.io/docs/reference/limactl_start/), [shell](https://lima-vm.io/docs/reference/limactl_shell/), [clone](https://lima-vm.io/docs/reference/limactl_clone/), and [SSH](https://lima-vm.io/docs/usage/ssh/).
- Lima 2.2.0 source for [VZ transport and unimplemented snapshots](https://github.com/lima-vm/lima/blob/v2.2.0/pkg/driver/vz/vz_driver_darwin.go), [startup waits](https://github.com/lima-vm/lima/blob/v2.2.0/pkg/instance/start.go), and [account provisioning](https://github.com/lima-vm/lima/blob/v2.2.0/pkg/cidata/cidata.TEMPLATE.d/user-data).
- [Debian Trixie ARM64 installation images](https://www.debian.org/releases/trixie/debian-installer/).
- [The four stages and their command references](/kixetpi/#follow-the-four-stages), including their prerequisites and recovery limits.
