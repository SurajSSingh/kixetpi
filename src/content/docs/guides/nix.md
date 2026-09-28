---
title: 4. Add declarative user packages with Nix
description: Optionally install Nix and Home Manager alongside Raspberry Pi OS while APT continues to own the operating system.
---

You can stop after [hardening](/guides/kicksecure/) and use APT alone. This stage is for readers who want a file that describes their user tools and can be reused or rolled back. It does not convert the Pi to NixOS.

:::caution[Optional and untested on this project]
This path targets a compatible Pi running 64-bit Raspberry Pi OS Lite. It adds a privileged daemon, build accounts, a package store, and update work. No Pi resource budget or Home Manager activation has been tested here. Use the separate test Pi, not the documentation computer.
:::

## What changes and how to recover

| Action | Recovery limit |
| --- | --- |
| Install Nix | Changes the host, including accounts and services. Preserve a pre-Nix card image; Home Manager rollback does not undo installation. |
| Edit user configuration | Restore your saved files. If already activated, also return to a known-good retained generation. |
| Activate Home Manager | Changes your user environment. The first activation has no previous generation; later rollback does not restore arbitrary user data. |
| Delete generations and collect unused packages | Removed local rollback options are lost. A saved configuration is not a guarantee you can download or rebuild everything later. |

Take a fresh full-card backup before installation. Keep it until installation, activation, reboot, and rollback checks pass. Restoring that image is the clearest return to the pre-Nix system.

## What Nix owns

APT still manages the kernel, firmware, boot files, network, SSH server, firewall, and system services. Nix stores its own packages and dependencies under `/nix/store`; Home Manager chooses which of them appear in your user's environment.

The division is by responsibility, not by eliminating every duplicated library. Nix packages can use different dependencies from APT packages. That costs disk space but avoids replacing the system's copies.

Keep system-service executables on explicit APT-managed paths. Do not use NixOS modules, `nixos-rebuild`, Home Manager system-service substitutes, or a Nix-managed login shell in this initial setup. The example below manages only two user tools and the Home Manager command itself.

Nix is not a security boundary for running programs. A malicious Nix package or Home Manager activation can act with your user's permissions. A privileged daemon does not make the software it supplies trustworthy. Use only reviewed configuration and trusted package sources; never run Home Manager with `sudo`.

## 1. Check architecture and capacity

Run on the Pi:

```sh title="Pi: check Nix prerequisites"
dpkg --print-architecture
getconf LONG_BIT
uname -m
free -h
swapon --show
df -h /
df -i /
```

Continue only when the architecture results are `arm64`, `64`, and `aarch64`. This is the guide's 64-bit-userspace boundary, not a claim that Nix is impossible on a 32-bit Pi. Do not work around it with incompatible APT sources or an installer selected only from the kernel architecture.

The published support list includes 64-bit ARM, while the installer also offers 32-bit ARM builds. These are different promises: Nixpkgs gives `aarch64-linux` prebuilt-package coverage from Hydra, its build service, but places 32-bit ARM in tier 3 without that coverage.

CPU support alone is not enough. Evaluating Nix configuration consumes memory. Packages, source trees, and retained **generations** (built versions of your environment) consume storage and **inodes** (filesystem entries tracked by `df -i`). A small package list does not imply a small store.

Begin on the proposed Pi 4 test target with free space beyond the base installation, and record the actual cost. On a 512 MB board, start with the APT-only result instead. These are project choices, not an asserted universal Nix minimum. If the Pi is already swapping heavily or nearly full, stop here. Do not disable swap to make the baseline look smaller.

**Reference:** [Nix supported platforms](https://nixos.org/manual/nix/stable/installation/supported-platforms.html), [Nixpkgs platform tiers](https://nixos.org/manual/nixpkgs/stable/#sec-platform-breakdown), [versioned installer platform choices](https://releases.nixos.org/nix/nix-2.35.2/install), and the installed `dpkg(1)`, `getconf(1)`, `uname(1)`, `free(1)`, `swapon(8)`, and `df(1)` manuals for the checks.

If `/nix` or a Nix installation already exists, stop and inspect its installer, configuration, users, and profiles. This page assumes no existing Nix installation and does not describe an in-place installer migration.

## 2. Review and install upstream Nix

Use the [official multi-user installation procedure](https://nixos.org/manual/nix/stable/installation/installing-binary.html) for Linux with systemd. Do not mix installers or migrate an existing Nix installation using these steps.

Install prerequisites from your existing APT repositories if missing:

```sh title="Pi: install host-side download prerequisites"
sudo apt update
sudo apt install ca-certificates curl xz-utils
```

**Reference:** [Debian package management](https://www.debian.org/doc/manuals/debian-reference/ch02.en.html) and the installed `apt(8)` manual.

### Download and inspect

This example uses Nix 2.35.2, the version reviewed for this draft. Check the [official release listing](https://releases.nixos.org/?prefix=nix/) and upstream documentation before use; select a newer supported version when needed. If that archive already exists in `~/kixetpi-installers`, stop and inspect it instead of overwriting your earlier copy.

In the same terminal session, download the versioned archive without executing it:

```sh title="Pi: download a versioned archive for review"
mkdir -p ~/kixetpi-installers
cd ~/kixetpi-installers
NIX_VERSION=2.35.2
NIX_ARCHIVE="nix-${NIX_VERSION}-aarch64-linux.tar.xz"
curl --fail --location --proto '=https' --tlsv1.2 \
  "https://releases.nixos.org/nix/nix-${NIX_VERSION}/${NIX_ARCHIVE}" \
  -o "$NIX_ARCHIVE"
sha256sum "$NIX_ARCHIVE"
```

Compare the complete SHA-256 value with the [published checksum for this exact archive](https://releases.nixos.org/nix/nix-2.35.2/nix-2.35.2-aarch64-linux.tar.xz.sha256). For another version, use its matching `.sha256` file. Stop if it differs or the expected checksum is unavailable.

Keep the archive, version, and checksum with the walkthrough record. A checksum from the same source verifies download integrity, not independent trust in that source.

**Reference:** [Nix binary-tarball procedure](https://nix.dev/manual/nix/latest/installation/installing-binary.html#installing-from-a-binary-tarball), [versioned installer archive and hash](https://releases.nixos.org/nix/nix-2.35.2/install), and [curl options](https://curl.se/docs/manpage.html).

After the checksum matches, list and unpack the archive as your normal user, not as root. Use a fresh review directory and inspect the included installer scripts:

```sh title="Pi: inspect the archive and second-stage scripts"
tar -tJf "$NIX_ARCHIVE"
REVIEW_DIR=$(mktemp -d "$HOME/kixetpi-installers/review.XXXXXX")
tar -xJf "$NIX_ARCHIVE" -C "$REVIEW_DIR"
cd "$REVIEW_DIR/nix-${NIX_VERSION}-aarch64-linux"
less install
less install-multi-user
less install-systemd-multi-user.sh
```

Review the scripts they invoke too, especially the proposed sudo, account, systemd, and shell-profile changes. If a selected release has a different layout, follow its own instructions rather than executing an unreviewed replacement. Reading the download wrapper alone would not review these scripts, and inspecting scripts does not prove that the included binaries are safe.

**Reference:** [Nix binary-tarball installation](https://nix.dev/manual/nix/latest/installation/installing-binary.html#installing-from-a-binary-tarball) and the installed `tar(1)` and `less(1)` manuals.

### Install the reviewed archive

Only after reviewing the scripts, run the local installer from the extracted directory as your normal administrator account. Let it request sudo when needed. Keep the pre-Nix image available; this changes host accounts, services, and shell initialization.

Do not overwrite an existing `/etc/nix/nix.conf`, disable signature checks, add an unfamiliar binary cache, or add yourself to `trusted-users` to bypass an error. Record the backup files and changes the installer reports:

```sh title="Pi: install Nix in multi-user mode"
./install --daemon
```

The daemon is a privileged background service that manages the shared store using separate build accounts. Permission to use it is not the same as being a `trusted-users` member; that setting grants capabilities that should be treated as root-equivalent.

**Reference:** [Nix multi-user installation](https://nix.dev/manual/nix/latest/installation/installing-binary.html#multi-user-installation) and [daemon trust settings](https://nixos.org/manual/nix/stable/command-ref/conf-file.html#conf-trusted-users).

Log out and open a new SSH session, then check:

```sh title="Pi: verify the daemon and client"
command -v nix
nix --version
systemctl status nix-daemon.socket nix-daemon.service --no-pager
```

The service can be socket-activated, so an idle service alone is not proof of failure. If the command is missing, follow the installer's shell initialization instructions. Do not reinstall repeatedly or symlink binaries into `/usr/bin`.

**Reference:** [Nix multi-user installation](https://nix.dev/manual/nix/latest/installation/installing-binary.html#multi-user-installation) and the installed `systemctl(1)` manual.

## 3. Enable the commands for this user

Create or edit `~/.config/nix/nix.conf` as your normal user, using an installed editor (`nano` below). Back up any existing file and preserve its other settings. Merge these values if an `experimental-features` line already exists; do not replace the root-owned daemon configuration:

```sh title="Pi: edit the user's Nix settings"
mkdir -p ~/.config/nix
nano ~/.config/nix/nix.conf
```

```ini title="~/.config/nix/nix.conf"
experimental-features = nix-command flakes
max-jobs = 1
cores = 1
```

A **flake** describes a Nix project's inputs and outputs. Flakes and the newer command interface still require experimental feature flags, even with a stable Nixpkgs release. The build limits reduce requested parallelism; they do not bound evaluation memory or guarantee that builds fit.

**Reference:** [Nix configuration files and build limits](https://nixos.org/manual/nix/stable/command-ref/conf-file.html#configuration-file).

Keep the official cache and its signature checks. Do not accept unfamiliar flake-provided configuration or additional trusted keys just to make a command proceed. Stop if packages require large local builds on this board.

Verify that your ordinary account can reach the daemon before building a configuration:

```sh title="Pi user: verify daemon access without sudo"
nix store info --store daemon
```

If access is denied, inspect the installer's daemon configuration and its `allowed-users` setting. Permission to connect is distinct from the powerful `trusted-users` setting. Do not fix access by granting extra daemon trust.

**Reference:** [Nix store connectivity check](https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-store-info.html) and [daemon allowed users](https://nixos.org/manual/nix/stable/command-ref/conf-file.html#conf-allowed-users).

## 4. Declare a small home configuration

[Home Manager](https://nix-community.github.io/home-manager/) can run standalone on a non-NixOS distribution. It is optional community software on top of Nix, with its own release and update cycle.

The example pairs Nixpkgs `nixos-26.05` with Home Manager `release-26.05`. The name of the Nixpkgs branch does not turn the host into NixOS. Before first use, confirm that both release branches exist and remain maintained. For a newer release, update both together after reading their release notes; do not mix a stable Home Manager release with an arbitrary development Nixpkgs branch.

Create a new configuration directory, or stop and back up any existing Home Manager configuration:

```sh title="Pi: create the user configuration directory"
mkdir -p ~/.config/home-manager
```

Use your editor to create these two files in a plain directory, not a Git repository. These are file contents, not shell commands. In `home.nix`, replace `YOUR_USER` with your login name and `/home/YOUR_USER` with your actual home path.

**Do not add secrets:** private keys, passwords, Wi-Fi credentials, and tokens do not belong here. Nix copies inputs and generated files into a store that other local users can normally read.

```nix title="~/.config/home-manager/flake.nix"
{
  description = "User packages on Raspberry Pi OS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    home-manager = {
      url = "github:nix-community/home-manager/release-26.05";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, ... }: {
    homeConfigurations.pi = home-manager.lib.homeManagerConfiguration {
      pkgs = nixpkgs.legacyPackages.aarch64-linux;
      modules = [ ./home.nix ];
    };
  };
}
```

```nix title="~/.config/home-manager/home.nix"
{ pkgs, ... }:

{
  home.username = "YOUR_USER";
  home.homeDirectory = "/home/YOUR_USER";
  home.stateVersion = "26.05";

  home.packages = with pkgs; [
    jq
    ripgrep
  ];

  programs.home-manager.enable = true;
}
```

The configuration name `pi` is only an output label, not a required login name. `home.packages` selects `jq` (a JSON processor) and `ripgrep` (the `rg` text-search command).

`home.stateVersion` selects compatibility defaults for stateful settings. It does not pin packages or update Home Manager. Set it for the initial configuration and do not raise it automatically during later upgrades.

**Reference:** [Home Manager standalone flakes](https://nix-community.github.io/home-manager/nix-flakes/standalone.html), [configuration example](https://nix-community.github.io/home-manager/usage/configuration.html), and [Nix local flake paths](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake.html#path-like-syntax).

## 5. Lock, build, and activate without sudo

Generate the lock file on the Pi:

```sh title="Pi user: resolve and lock the inputs"
cd ~/.config/home-manager
nix flake lock
```

`flake.lock` records exact revisions and content hashes for Nixpkgs and Home Manager. Release branch names move; the lock is what makes subsequent builds use the same inputs. Preserve all three files together. Do not invent hashes or copy an unrelated lock file from this website.

**Reference:** [Nix flake lock](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake-lock.html) and [flake lock-file format](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake.html#lock-files).

Inspect the proposed build before starting it:

```sh title="Pi user: inspect the first activation build"
cd ~/.config/home-manager
nix build .#homeConfigurations.pi.activationPackage --dry-run
```

Expect some small local builds for the generated home environment, even when package binaries come from the cache. A long list of compilers or large application builds is a reason to stop on a small Pi. The dry run still evaluates the configuration and does not predict peak memory usage.

**Reference:** [Nix build dry runs](https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-build.html#opt-dry-run) and [Home Manager activation package](https://nix-community.github.io/home-manager/internals/activation.html).

Build first, without activating:

```sh title="Pi user: build the pinned home generation"
cd ~/.config/home-manager
nix build .#homeConfigurations.pi.activationPackage
```

Building creates an environment but does not make it active.

**Before activation:** this changes your user environment and may execute user-level actions. Keep the pre-Nix card image available: the first generation has no previous generation to roll back to. Run the next block only after a successful build, without sudo. If it reports a conflicting file, inspect and back up that file instead of forcing an overwrite.

```sh title="Pi user: activate the successful build"
cd ~/.config/home-manager
./result/activate
```

This bootstraps Home Manager from the locked input, rather than a second installer whose version can change. Activation creates links and applies declared user settings.

The minimal example deliberately avoids taking over your shell configuration and login shell.

**Reference:** [Home Manager activation modes](https://nix-community.github.io/home-manager/internals/activation.html) and [26.05 activation/profile implementation](https://github.com/nix-community/home-manager/blob/release-26.05/modules/home-environment.nix).

Back up and review `~/.profile`, then add this block once; do not replace the file. If your shell reads a different login file, follow [Home Manager's standalone shell instructions](https://nix-community.github.io/home-manager/installation/standalone.html) instead. To undo this edit, remove only the block you added:

```sh title="Add to ~/.profile, not to a root-owned system profile"
if [ -f "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh" ]; then
  . "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh"
fi
```

Home Manager is not managing Bash here, so this loads its session variables explicitly when the file exists.

**Reference:** [Home Manager standalone shell setup](https://nix-community.github.io/home-manager/installation/standalone.html) and [session variables FAQ](https://nix-community.github.io/home-manager/faq/session-variables.html).

Log out and open a new SSH session before testing:

```sh title="Pi user: verify the active home environment"
home-manager generations
command -v home-manager
command -v jq
command -v rg
type -a jq rg
jq --version
rg --version
```

Confirm the selected executables are from your Nix user environment. If APT also installed one of these tools, `type -a` will show both. Removing the Home Manager package can reveal the APT version again. PATH precedence is not isolation, and APT does not track Nix packages.

**Reference:** [Home Manager generations](https://nix-community.github.io/home-manager/usage/rollbacks.html), [standalone configuration](https://nix-community.github.io/home-manager/usage/configuration.html), and the installed manuals `man bash`, `man jq`, and `man rg` for command lookup and version checks.

## 6. Add, remove, update, and roll back

### Package changes

Before changing `home.packages`, back up all three configuration files and record `home-manager generations`. If a change breaks the environment, use the [rollback steps](#rollback) to return to the recorded good generation and restore those files.

For example, remove `ripgrep` from `home.nix`, then build and inspect the change:

```sh title="Pi user: apply a reviewed package-list change"
cd ~/.config/home-manager
home-manager build --flake .#pi
```

**Reference:** [Home Manager build and activation](https://nix-community.github.io/home-manager/usage/configuration.html) and [26.05 build implementation](https://github.com/nix-community/home-manager/blob/release-26.05/home-manager/home-manager).

Only after a successful build and review, switch without sudo:

```sh title="Pi user: switch to the new home generation"
cd ~/.config/home-manager
home-manager switch --flake .#pi
```

This changes the active user environment. It does not delete old generations, package data in your home directory, APT packages, or every copy of a package in the Nix store. Do not mix `nix-env` or `nix profile install` with this declarative package set; packages managed through another profile can remain after removal from `home.nix`.

**Reference:** [Home Manager standalone flakes](https://nix-community.github.io/home-manager/nix-flakes/standalone.html), [rollbacks](https://nix-community.github.io/home-manager/usage/rollbacks.html), and [profile installation in 26.05](https://github.com/nix-community/home-manager/blob/release-26.05/modules/home-environment.nix).

### Input updates

Before updating packages, back up `flake.nix`, `home.nix`, and `flake.lock`, and retain the current generation for recovery. Then update the inputs deliberately:

```sh title="Pi user: update the lock, not the operating system"
cd ~/.config/home-manager
nix flake update
```

Review the lock-file changes before building with the new inputs. Repeat the [build preview](#5-lock-build-and-activate-without-sudo) and stop if it proposes large local builds. Only then build the updated environment:

```sh title="Pi user: build the reviewed input updates"
cd ~/.config/home-manager
home-manager build --flake .#pi
```

Only after a successful build and review of its output, run `home-manager switch --flake .#pi` from that directory.

A pinned revision stays old until you update it. APT does not update Nix-provided software. Check release support and the Nix installation's own upgrade procedure as part of this routine.

**Reference:** [Home Manager flake updates](https://nix-community.github.io/home-manager/usage/updating.html) and [Nix flake update](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake-update.html).

### Rollback

Inspect `home-manager generations` first. Use this command without sudo only when the preceding retained generation is the known-good one you want. Rollback does not restore arbitrary user data or undo every activation-script action:

```sh title="Pi user: return to the preceding generation"
home-manager switch --rollback
```

**Reference:** [Home Manager rollback instructions](https://nix-community.github.io/home-manager/usage/rollbacks.html) and [26.05 switch implementation](https://github.com/nix-community/home-manager/blob/release-26.05/home-manager/home-manager).

For a specific older generation, use the store path shown in the generation list and run its `activate` script directly. This also avoids assuming a failed activation made a new generation current.

Restore your known-good configuration and lock file too, so the next ordinary switch does not rebuild the failed change. Keep real backups of important data.

### Storage and garbage collection

Inspect `df -h /` and `du -sh /nix/store` after the first installation and each update. Old generations consume space but provide rollback paths. The `result` link also keeps its build reachable.

Do not delete `/nix/store` files by hand. After checking which generations you still need, use Home Manager's documented generation expiry and Nix garbage collection commands. Start conservatively with `nix-collect-garbage` as your normal user. Without generation-deletion options it collects only objects that no retained root needs, so it may reclaim little space.

Avoid `nix-collect-garbage -d` during the walkthrough, especially with sudo, which can affect profiles beyond your own. Removing old generations and their store objects removes local rollback options. Keep both configuration backups and retained generations until you have tested the new environment.

**Reference:** [Home Manager generation management](https://github.com/nix-community/home-manager/blob/release-26.05/home-manager/home-manager) and [Nix garbage collection](https://nixos.org/manual/nix/stable/command-ref/nix-collect-garbage.html).

## Troubleshooting and opting out

| Symptom | Response |
| --- | --- |
| `nix` is missing after installation. | Open a fresh login shell and check the installer's shell initialization and daemon units. |
| An architecture error or unavailable binary appears. | Recheck userspace architecture and the selected package's platform support. Do not force a 32-bit Pi through the 64-bit example. |
| Evaluation or builds exhaust memory or storage. | Stop the workload, inspect logs and free space, retain stock swap, and use the APT-only path if necessary. |
| Home Manager refuses to replace a file. | Back up and inspect the existing file. Do not enable forced overwrites to suppress the warning. |
| A removed package still runs. | Use `type -a` to check APT and other profiles, and start a fresh shell to clear cached command paths. |
| A flake file is missing after you later adopt Git. | Add the intended configuration and lock files to the repository. Git-backed flakes normally omit untracked files. Never add secrets. |

### Stop managing these packages

Before opting out, back up the configuration, record the active generation's store path, and ensure essential user tools have APT alternatives. The steps below remove the Home Manager command itself from the active environment; recovery must use the retained generation's `activate` script.

1. In this minimal example, set `home.packages = [ ];` and `programs.home-manager.enable = false;`.
2. While Nix still works, repeat the [build and activation steps](#5-lock-build-and-activate-without-sudo). Do not use sudo, and activate only after a successful build.
3. To return to the prior environment, run its recorded store path's `activate` script as your user and restore the saved configuration.

This removes the declared tools from the active environment, not generation records or old store objects.

Do not assume `home-manager uninstall` works unchanged for this flake-only bootstrap. The 26.05 implementation's uninstall path uses a non-flake configuration lookup, which may require a Home Manager channel that this guide never created. For a configuration expanded beyond these packages, follow that version's removal guidance and migrate managed files or services deliberately. Remove only the shell initialization block you added if it is no longer needed.

### Remove Nix itself

Removing Home Manager does not uninstall Nix. Follow the [official multi-user Nix uninstall instructions](https://nixos.org/manual/nix/stable/installation/uninstall.html) for your installer. Do not start with `rm -rf /nix`, and do not assume uninstalling removes every user data file.

Uninstallation includes daemon units, shell initialization, build accounts, configuration, and store cleanup. Restoring the pre-Nix test-card image is the clearest return to the earlier baseline.

## Checkpoint

Record the Nix version, locked input revisions, active Home Manager generation, added services and accounts, memory observations, and store size. Test a package-list change and a rollback before treating the setup as repeatable. Reboot and confirm SSH, sudo, APT updates, the daemon, and your user tools still work.

If those checks fail, the first three stages remain usable without this layer. Record the failure and restore the pre-Nix baseline rather than converting the system to NixOS to make this example work.

## Sources and review status

Reviewed against upstream sources on 28 September 2026. The example configuration and commands remain untested on Raspberry Pi hardware; the first lock file must be generated and validated during that test.

For ordinary shell and file operations, use the Pi's installed `man bash`, `man mkdir`, `man mktemp`, `man sha256sum`, `man nano`, and `man du` manuals. The [Debian manual index](https://manpages.debian.org/trixie/index.html) is an online alternative.

- [Nix supported platforms](https://nixos.org/manual/nix/stable/installation/supported-platforms.html).
- [Nixpkgs platform tiers and binary coverage](https://nixos.org/manual/nixpkgs/stable/#sec-platform-breakdown) and [the live installer source](https://nixos.org/nix/install).
- [Official binary installation](https://nixos.org/manual/nix/stable/installation/installing-binary.html), [2.35.2 aarch64 archive checksum](https://releases.nixos.org/nix/nix-2.35.2/nix-2.35.2-aarch64-linux.tar.xz.sha256), and [multi-user uninstall](https://nixos.org/manual/nix/stable/installation/uninstall.html).
- [Nix configuration, sandboxing, and daemon trust](https://nixos.org/manual/nix/stable/command-ref/conf-file.html).
- [Nix store connectivity check](https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-store-info.html).
- [Nix flakes and lock files](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake.html) and [garbage collection](https://nixos.org/manual/nix/stable/command-ref/nix-collect-garbage.html).
- [Home Manager manual](https://nix-community.github.io/home-manager/), including standalone installation, flakes, generations, and `home.stateVersion`.
- [Home Manager rollback instructions](https://nix-community.github.io/home-manager/usage/rollbacks.html) and [26.05 command implementation](https://github.com/nix-community/home-manager/blob/release-26.05/home-manager/home-manager).
- [Home Manager release branches](https://github.com/nix-community/home-manager/branches) and [Nixpkgs repository](https://github.com/NixOS/nixpkgs).
