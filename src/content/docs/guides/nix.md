---
title: 4. Add declarative user packages with Nix
description: Optionally install Nix and Home Manager alongside Raspberry Pi OS while APT continues to own the operating system.
---

You can stop after [hardening](/guides/kicksecure/) and use APT alone. This stage is for readers who want a file that describes their user tools and can be reused or rolled back. It does not convert the Pi to NixOS.

:::caution[Optional and untested on this project]
This path targets a compatible Pi running 64-bit Raspberry Pi OS Lite. It adds a privileged daemon, build accounts, a package store, and update work. No Pi resource budget or Home Manager activation has been tested here. Use the separate test Pi, not the documentation computer.
:::

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

Continue only when the architecture results are `arm64`, `64`, and `aarch64`. The published Nix supported-platform list includes 64-bit ARM but does not list 32-bit ARM. The live official installer nevertheless offers `armv6l-linux` and `armv7l-linux` builds. Installer availability and package support are different things: Nixpkgs places those 32-bit platforms in tier 3 without Hydra binary coverage, while `aarch64-linux` has binary coverage.

This guide therefore limits its first walkthrough to 64-bit userspace. It does not claim that Nix is impossible on an original Pi or a 32-bit image. Those setups need a separate package-availability and resource investigation. Do not work around this boundary with incompatible APT repositories or an x86 installer. Also avoid letting a 64-bit kernel choose an installer for a 32-bit userspace.

CPU support alone is not enough. Nix evaluation consumes memory; downloaded package dependencies, source trees, and retained generations consume storage and inodes. Local builds can consume much more. A tiny user package list does not imply a tiny store.

Begin on the proposed Pi 4 test target with free space beyond the base installation, and record the actual cost. On a 512 MB board, start with the APT-only result instead. These are project choices, not an asserted universal Nix minimum. If the Pi is already swapping heavily or nearly full, stop here. Do not disable swap to make the baseline look smaller.

Take a new full-card backup. If `/nix` or a Nix installation already exists, stop and inspect its installer, configuration, users, and profiles. This page assumes no existing Nix installation and does not describe an in-place installer migration.

## 2. Review and install upstream Nix

Follow the [official multi-user installation instructions](https://nixos.org/manual/nix/stable/installation/installing-binary.html) for Linux with systemd. The multi-user daemon keeps the shared store under privileged control and separates build users from your login account. It still changes the host system.

Install prerequisites from your existing APT repositories if missing:

```sh title="Pi: install host-side download prerequisites"
sudo apt update
sudo apt install ca-certificates curl xz-utils
```

Use the official [binary-tarball installation procedure](https://nix.dev/manual/nix/latest/installation/installing-binary.html#installing-from-a-binary-tarball) so you can inspect the second-stage scripts before they run. The example selects Nix 2.35.2, the version reviewed for this draft. Check the [official release directory](https://releases.nixos.org/?prefix=nix/) for maintenance status before use and select a newer supported version when needed. Perform these downloads only on the test Pi when you are ready to install.

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

Compare the complete SHA-256 value with the checksum published for that exact version and `aarch64-linux` archive in the official release directory. Stop if it differs or you cannot obtain the expected checksum. Keep the archive, version, and checksum with the walkthrough record. A checksum from the same source verifies download integrity, not independent trust in that source.

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

Only after that review, run the local installer from the extracted directory as your normal administrator account. Let it request sudo for the steps that need it:

```sh title="Pi: install Nix in multi-user mode"
./install --daemon
```

Record the installed Nix version and any backup files or shell changes it reports. Do not overwrite an existing `/etc/nix/nix.conf`, add a random binary cache, disable signature verification, or add your account to `trusted-users` to bypass an error. A trusted Nix daemon user has powerful capabilities that should be treated as root-equivalent.

Log out and open a new SSH session, then check:

```sh title="Pi: verify the daemon and client"
command -v nix
nix --version
systemctl status nix-daemon.socket nix-daemon.service --no-pager
```

The service can be socket-activated, so an idle service alone is not proof of failure. If the command is missing, follow the installer's shell initialization instructions. Do not reinstall repeatedly or symlink binaries into `/usr/bin`.

## 3. Enable the commands for this user

This guide uses flakes to record exact dependency revisions. The Nix CLI still places flakes and the newer command interface behind experimental feature flags. That status is separate from choosing a stable Nixpkgs release.

Create or edit `~/.config/nix/nix.conf` as your normal user. Keep existing settings, and merge these values if an `experimental-features` line already exists:

```sh title="Pi: edit the user's Nix settings"
mkdir -p ~/.config/nix
nano ~/.config/nix/nix.conf
```

```ini title="~/.config/nix/nix.conf"
experimental-features = nix-command flakes
max-jobs = 1
cores = 1
```

Use another installed editor if you prefer. The build limits reduce requested parallelism; they do not bound evaluation memory or guarantee that builds fit. Do not replace the root-owned daemon configuration for these user settings.

Keep the official cache and its signature checks. Do not accept unfamiliar flake-provided configuration or additional trusted keys just to make a command proceed. Stop if packages require large local builds on this board.

Verify that your ordinary account can reach the daemon before building a configuration:

```sh title="Pi user: verify daemon access without sudo"
nix store info --store daemon
```

If access is denied, inspect the installer's daemon configuration and its `allowed-users` setting. Permission to connect is distinct from the powerful `trusted-users` setting. Do not fix access by granting extra daemon trust.

## 4. Declare a small home configuration

[Home Manager](https://nix-community.github.io/home-manager/) can run standalone on a non-NixOS distribution. It is optional community software on top of Nix, with its own release and update cycle.

The example pairs Nixpkgs `nixos-26.05` with Home Manager `release-26.05`. The name of the Nixpkgs branch does not turn the host into NixOS. Before first use, confirm that both release branches exist and remain maintained. For a newer release, update both together after reading their release notes; do not mix a stable Home Manager release with an arbitrary development Nixpkgs branch.

Create a new configuration directory, or stop and back up any existing Home Manager configuration:

```sh title="Pi: create the user configuration directory"
mkdir -p ~/.config/home-manager
```

Use your editor to create the following two files. These are file contents, not shell commands. The initial walkthrough uses a plain directory rather than a Git repository.

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

Replace `YOUR_USER` in both fields with the output of `whoami`. Use your actual home path from `printf '%s\n' "$HOME"` if it is not `/home/YOUR_USER`. The configuration name `pi` is only an output label. It does not require a login account named `pi`.

`home.stateVersion` selects compatibility defaults for stateful settings. It does not pin packages or update Home Manager. Set it for the initial configuration and do not raise it automatically during later upgrades.

Do not put private keys, passwords, Wi-Fi credentials, or tokens in these files. Nix copies configuration inputs and generated files into a store that other local users can normally read. Keep secret management outside this example.

## 5. Lock, build, and activate without sudo

Generate the lock file on the Pi:

```sh title="Pi user: resolve and lock the inputs"
cd ~/.config/home-manager
nix flake lock
```

`flake.lock` records exact revisions and content hashes for Nixpkgs and Home Manager. Release branch names move; the lock is what makes subsequent builds use the same inputs. Preserve all three files together. Do not invent hashes or copy an unrelated lock file from this website.

Inspect the proposed build before starting it:

```sh title="Pi user: inspect the first activation build"
cd ~/.config/home-manager
nix build .#homeConfigurations.pi.activationPackage --dry-run
```

Expect some small local builds for the generated home environment, even when package binaries come from the cache. A long list of compilers or large application builds is a reason to stop on a small Pi. The dry run still evaluates the configuration and does not predict peak memory usage.

Build, then activate as separate steps. Run activation only after the build succeeds:

```sh title="Pi user: build the pinned home generation"
cd ~/.config/home-manager
nix build .#homeConfigurations.pi.activationPackage
```

```sh title="Pi user: activate the successful build"
cd ~/.config/home-manager
./result/activate
```

This bootstraps Home Manager from the already locked input rather than running a second, floating installer reference. Building does not by itself change your active home environment. Activation does; it can create links, manage declared files, and execute user-level activation actions.

If activation reports a conflicting existing file, stop. Inspect and back up that file rather than forcing an overwrite. The minimal example deliberately avoids taking over your shell configuration and login shell.

Because Home Manager is not managing Bash here, initialize its session variables explicitly. On this standard standalone installation, add the following to your existing `~/.profile` once, after reviewing that file. Do not replace the file:

```sh title="Add to ~/.profile, not to a root-owned system profile"
if [ -f "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh" ]; then
  . "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh"
fi
```

If your shell reads a different login file, follow Home Manager's standalone shell instructions for that shell. Log out and open a new SSH session before testing:

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

## 6. Add, remove, update, and roll back

To change the desired package set, edit `home.packages` in `home.nix`. For example, remove `ripgrep` from the list. Then build and inspect the change before switching:

```sh title="Pi user: apply a reviewed package-list change"
cd ~/.config/home-manager
home-manager build --flake .#pi
```

Only after a successful build and review:

```sh title="Pi user: switch to the new home generation"
cd ~/.config/home-manager
home-manager switch --flake .#pi
```

This changes the active user environment. It does not delete old generations, package data in your home directory, APT packages, or every copy of a package in the Nix store. Do not mix `nix-env` or `nix profile install` with this declarative package set; packages managed through another profile can remain after removal from `home.nix`.

For package security updates, preserve a known-good copy of `flake.nix`, `home.nix`, and `flake.lock`, then update the inputs deliberately:

```sh title="Pi user: update the lock, not the operating system"
cd ~/.config/home-manager
nix flake update
home-manager build --flake .#pi
```

Review the lock-file changes and build output before running `home-manager switch --flake .#pi` from that directory. A pinned old revision stays old until you update it. APT updates do not fix vulnerabilities in Nix-provided copies of software. Check release support and the Nix installation's own upgrade procedure as part of this routine.

For rollback, inspect `home-manager generations`. To activate the previous retained generation, use the documented command as your normal user:

```sh title="Pi user: return to the preceding generation"
home-manager switch --rollback
```

For a specific older generation, the generation list provides its store path; its `activate` script can activate that retained build directly. Also restore your known-good configuration and lock file so the next ordinary switch does not rebuild the failed change. Activation rollback does not reverse every user-data change or arbitrary script action. Keep real backups of important data.

### Storage and garbage collection

Inspect `df -h /` and `du -sh /nix/store` after the first installation and each update. Old generations consume space but provide rollback paths. The `result` link also keeps its build reachable.

Do not delete `/nix/store` files by hand. After checking which generations you still need, use Home Manager's documented generation expiry and Nix garbage collection commands. Start conservatively with `nix-collect-garbage` as your normal user. Without generation-deletion options it collects only objects that no retained root needs, so it may reclaim little space.

Avoid `nix-collect-garbage -d` during the walkthrough, especially with sudo, which can affect profiles beyond your own. Removing old generations and their store objects removes local rollback options. Keep both configuration backups and retained generations until you have tested the new environment.

## Troubleshooting and opting out

| Symptom | Response |
| --- | --- |
| `nix` is missing after installation. | Open a fresh login shell and check the installer's shell initialization and daemon units. |
| An architecture error or unavailable binary appears. | Recheck userspace architecture and the selected package's platform support. Do not force a 32-bit Pi through the 64-bit example. |
| Evaluation or builds exhaust memory or storage. | Stop the workload, inspect logs and free space, retain stock swap, and use the APT-only path if necessary. |
| Home Manager refuses to replace a file. | Back up and inspect the existing file. Do not enable forced overwrites to suppress the warning. |
| A removed package still runs. | Use `type -a` to check APT and other profiles, and start a fresh shell to clear cached command paths. |
| A flake file is missing after you later adopt Git. | Add the intended configuration and lock files to the repository. Git-backed flakes normally omit untracked files. Never add secrets. |

To stop using the managed packages, first back up your configuration, record the active generation, and ensure any essential user tool has an APT alternative. In this minimal example, set `home.packages = [ ];` and `programs.home-manager.enable = false;`, then use the same `nix build .#homeConfigurations.pi.activationPackage` and `./result/activate` steps while Nix still works. Do not use sudo. This removes the declared tools from the active environment, including the Home Manager command, but retains generation records and old store objects.

Do not assume `home-manager uninstall` works unchanged for this flake-only bootstrap. The 26.05 implementation's uninstall path uses a non-flake configuration lookup, which may require a Home Manager channel that this guide never created. For a configuration expanded beyond these packages, follow that version's removal guidance and migrate managed files or services deliberately. Remove only the shell initialization block you added if it is no longer needed.

Removing Home Manager does not uninstall Nix. Follow the [official multi-user Nix uninstall instructions](https://nixos.org/manual/nix/stable/installation/uninstall.html) for the installer you actually used. They include daemon units, shell initialization, build accounts, configuration, and store cleanup. Do not start with `rm -rf /nix`, and do not assume uninstalling removes every user data file. Restoring the pre-Nix test-card image is the clearest return to the earlier baseline.

## Checkpoint

Record the Nix version, locked input revisions, active Home Manager generation, added services and accounts, memory observations, and store size. Test a package-list change and a rollback before treating the setup as repeatable. Reboot and confirm SSH, sudo, APT updates, the daemon, and your user tools still work.

If those checks fail, the first three stages remain usable without this layer. Record the failure and restore the pre-Nix baseline rather than converting the system to NixOS to make this example work.

## Sources and review status

Reviewed on 26 September 2026. The example configuration and commands remain untested on Raspberry Pi hardware; the first lock file must be generated and validated during that test.

- [Nix supported platforms](https://nixos.org/manual/nix/stable/installation/supported-platforms.html).
- [Nixpkgs platform tiers and binary coverage](https://nixos.org/manual/nixpkgs/stable/#sec-platform-breakdown) and [the live installer source](https://nixos.org/nix/install).
- [Official binary installation](https://nixos.org/manual/nix/stable/installation/installing-binary.html) and [multi-user uninstall](https://nixos.org/manual/nix/stable/installation/uninstall.html).
- [Nix configuration, sandboxing, and daemon trust](https://nixos.org/manual/nix/stable/command-ref/conf-file.html).
- [Nix store connectivity check](https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-store-info.html).
- [Nix flakes and lock files](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake.html) and [garbage collection](https://nixos.org/manual/nix/stable/command-ref/nix-collect-garbage.html).
- [Home Manager manual](https://nix-community.github.io/home-manager/), including standalone installation, flakes, generations, and `home.stateVersion`.
- [Home Manager rollback instructions](https://nix-community.github.io/home-manager/usage/rollbacks.html) and [26.05 command implementation](https://github.com/nix-community/home-manager/blob/release-26.05/home-manager/home-manager).
- [Home Manager release branches](https://github.com/nix-community/home-manager/branches) and [Nixpkgs repository](https://github.com/NixOS/nixpkgs).
