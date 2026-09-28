---
title: 3. Adapt Kicksecure's hardening practices
description: Harden access and reduce exposure on Raspberry Pi OS without adding Kicksecure repositories or claiming its full security model.
---

Keep the Raspberry Pi OS base from [stage 1](/guides/raspberry-pi-os/) and the reviewed reductions from [stage 2](/guides/dietpi/). This stage applies a small set of access controls, then checks which confinement mechanisms the actual Pi supports.

:::caution[Untested integration, local recovery required]
Use a test Pi with a known-good card backup and working local console access. SSH and firewall changes can lock you out. Keep your first SSH session open, but do not treat it as a substitute for a console. No hardening or recovery procedure here has passed a hardware test.
:::

## What changes and how to recover

| Action | Recovery limit |
| --- | --- |
| Require a sudo password | Restore the original rule from the retained root shell. A normal login alone cannot repair broken sudo. |
| Change SSH policy | Remove only the new drop-in, validate, then reload from working recovery access. |
| Enable UFW | Disable it at the local console. This leaves its saved rules and installed package in place. |
| Add service isolation | Remove only the trial drop-in, reload systemd, then restart the application. This does not restore application data. |

Stop after any failed check instead of making further changes. A drop-in is a small configuration file added beside the main configuration. You can remove it without changing the main file.

## This is not a Kicksecure conversion

Kicksecure's [Raspberry Pi](https://www.kicksecure.com/wiki/Raspberry_Pi) and [ARM64](https://www.kicksecure.com/wiki/ARM64) pages describe source builds and distro morphing as testers-only, without a downloadable image. Its [Debian conversion instructions](https://www.kicksecure.com/wiki/Debian) target Debian Trixie. Matching the Debian release does not establish Raspberry Pi OS compatibility.

Do not add Kicksecure repositories or install its metapackages, `security-misc`, replacement kernels, or boot-management packages on this base. Do not copy GRUB commands, x86-specific settings, or large sysctl lists. Those changes can conflict with Pi boot, networking, devices, or package management.

The practices we use here are granting only needed privileges, exposing fewer services, keeping software updated, and restricting what applications can access where possible. The procedures below use Raspberry Pi OS and Debian tools. Kicksecure does not support this adaptation as a Kicksecure installation.

## 1. Check updates and administrative privileges

On the Pi, confirm the expected base and inspect its state:

```sh title="Pi: inspect the system before hardening"
cat /etc/os-release
dpkg --print-architecture
uname -r
apt-cache policy
systemctl --failed
sudo ss -lntup
sudo -l
```

**Reference:** Installed `man os-release`, `man dpkg`, `man uname`, `man apt-cache`, `man systemctl`, `man ss`, and `man sudo` describe these diagnostic commands.

Keep the image's Raspberry Pi and Debian or Raspbian package sources. Follow [stage 1's reviewed APT update and reboot steps](/guides/raspberry-pi-os/#5-confirm-the-release-and-update-normally), not `rpi-update`. Raspberry Pi recommends a fresh image for a major release change, not changing APT release names.

Review whether `sudo -l` grants `NOPASSWD: ALL`. If it does, code running as that user can normally obtain root without knowing a password. Even password-protected sudo is not a sandbox for malicious code in your own account.

### Optional: require a sudo password

First confirm that you know your account's local password and can use it to log in at the console. Open a root shell in the original session and **keep it open** until you have verified sudo in a separate normal-user session. A normal login cannot give you root access if the sudo policy is broken.

```sh title="Pi original session: retain recovery access"
sudo -i
id -u
```

Expect `0`, meaning this shell has root privileges. Keep it open for recovery until both checks below pass.

1. Inspect `/etc/sudoers` and its included files. Record the original grant so you can restore it.
2. From the retained root shell, use `visudo` or `visudo -f PATH` on the actual file granting passwordless access. Replace `PATH` with that file's path.
3. Change only the relevant `NOPASSWD` grant to `PASSWD`; do not remove administrative access or overwrite the configuration. Never force an invalid save.
4. Validate the whole policy:

```sh title="Pi retained root shell: check the whole sudo policy"
visudo -c
```

`visudo -c` checks syntax, ownership, and permissions, not which rule wins for a user. Stop and restore the original grant if it fails. In a *second, normal-user* session, invalidate its cached credentials before testing an actual privileged command:

```sh title="Pi second normal-user session: verify password and privilege"
sudo -k
sudo /usr/bin/id -u
```

Confirm that sudo prompts for your password and the command prints `0`. If the command succeeds without a prompt, another rule may still allow passwordless access. Inspect the other matching rules. If authentication or access fails, restore the original grant with `visudo` in the retained root shell. Only then leave the root shell with `exit`.

**Reference:** [Debian visudo(8)](https://manpages.debian.org/trixie/sudo/visudo.8.en.html), [sudoers(5) rule order and PASSWD tags](https://manpages.debian.org/trixie/sudo/sudoers.5.en.html), and installed `man sudo` for `-i` and `-k`.

For a network-facing application, use its package's dedicated service account rather than your administrator account. This page does not define a safe environment for arbitrary hostile software.

## 2. Verify key-only SSH before disabling passwords

Use the key configured in Raspberry Pi Imager. If you initially used password authentication, follow the official [SSH key instructions](https://www.raspberrypi.com/documentation/computers/remote-access.html#configure-ssh-without-a-password) first. Never copy the private key to the Pi.

From a second terminal on your administration computer, replace the example username and hostname. Use the key path from stage 1, or the path to your existing key:

```sh title="Administration computer: prove public-key login works"
ssh -S none -i ~/.ssh/kixetpi_ed25519 -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no YOUR_USER@YOUR_PI
```

The `-S none` option disables connection sharing. Without it, an existing SSH master connection could bypass a fresh authentication test. Inside this new session, run `sudo -v`. Do not continue unless both login and administrative access work. A key passphrase prompt is local to the private key and is different from an SSH account-password prompt.

**Reference:** [Raspberry Pi SSH key setup](https://www.raspberrypi.com/documentation/computers/remote-access.html#configure-ssh-without-a-password) and [Debian ssh(1)](https://manpages.debian.org/trixie/openssh-client/ssh.1.en.html).

Inspect `/etc/ssh/sshd_config` and `/etc/ssh/sshd_config.d/`. Debian normally includes the drop-ins near the start of the main configuration. OpenSSH generally uses the first obtained value for a setting, so a later file does not necessarily override an earlier one. Existing `Match` blocks can change settings for individual connections.

Create the following file only if its name is unused, the standard drop-in include is present, and no earlier or conditional rules conflict. Otherwise stop and reconcile the configuration first.

Keep the existing SSH session and local console available. Recovery removes **only this new file**, then validates before reloading; see [Recover SSH access](#recover-ssh-access). Keep your account password for sudo and local recovery; do not lock the account with `passwd -l`.

```sh title="Pi: create a dedicated SSH policy file"
sudoedit /etc/ssh/sshd_config.d/00-kixetpi.conf
```

```text title="/etc/ssh/sshd_config.d/00-kixetpi.conf"
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
```

These settings allow public-key login but refuse SSH passwords, keyboard-interactive authentication, and direct root login. Disabling SSH passwords does not lock the local account.

**Reference:** [Debian sshd_config(5) precedence and authentication directives](https://manpages.debian.org/trixie/openssh-server/sshd_config.5.en.html) and [sshd(8) account-lock behavior](https://manpages.debian.org/trixie/openssh-server/sshd.8.en.html).

Check syntax and effective settings before applying the change:

```sh title="Pi: validate SSH configuration"
sudo /usr/sbin/sshd -t
sudo /usr/sbin/sshd -T | grep -E '^(pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
```

Expect `pubkeyauthentication yes` and `no` for the other three settings. If the configuration has `Match` rules, also inspect `sshd -T -C` with the real connection details. For example, replace all values in this command:

```sh title="Pi: inspect settings for your actual SSH connection"
sudo /usr/sbin/sshd -T -C user=YOUR_USER,addr=ADMIN_IP,host=ADMIN_HOSTNAME
```

Check the same four settings in the conditional output. **Do not reload** if either syntax or effective policy is wrong; correct the drop-in and recheck first.

**Reference:** [Debian sshd(8) test modes `-t`, `-T`, and `-C`](https://manpages.debian.org/trixie/openssh-server/sshd.8.en.html).

Only when both checks pass, reload without closing the recovery connection:

```sh title="Pi: reload SSH without closing the current session"
sudo systemctl reload ssh
systemctl status ssh --no-pager
```

**Reference:** [Debian systemctl(1) reload and status](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).

Repeat the exact key-only command above, including `-S none`, to open a new connection, and run `sudo -v` again. Also verify that password-only SSH is refused from your administration computer:

```sh title="Administration computer: expect permission denied"
ssh -S none -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive YOUR_USER@YOUR_PI
```

If it still accepts an account password, the effective policy is not what this guide expects. Investigate includes and conditional rules before continuing.

**Reference:** [Debian ssh(1) authentication and connection-sharing options](https://manpages.debian.org/trixie/openssh-client/ssh.1.en.html).

### Recover SSH access

From the retained session or local console, remove only the new file and validate:

```sh title="Pi: undo this guide's SSH policy"
sudo rm /etc/ssh/sshd_config.d/00-kixetpi.conf
sudo /usr/sbin/sshd -t
```

**Only if validation succeeds**, run `sudo systemctl reload ssh` and test a fresh connection before closing recovery access. If you edited any existing configuration instead, restore that file from its pre-change copy. Do not delete other SSH drop-ins.

**Reference:** [Debian sshd(8) syntax validation](https://manpages.debian.org/trixie/openssh-server/sshd.8.en.html) and [systemctl(1) reload](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).

## 3. Add a firewall for a simple headless Pi

This example is only for a fresh Pi that does not route traffic and needs incoming connections only for SSH on TCP port 22. The policy is not for a router, access point, VPN gateway, container host, or public server. If your workload needs other inbound ports, document and allow them before enabling a firewall.

Use UFW from the existing APT repositories as a simpler interface than a hand-written nftables ruleset. This is a project choice, not a copy of Kicksecure's firewall.

First inspect listening ports and check whether a firewall manager is already in use. Firewall services may be absent or inactive on a fresh image. This can make `is-active` return nonzero. Continue the inspection rather than enabling those services:

```sh title="Pi: inspect before installing another firewall manager"
sudo ss -lntup
systemctl is-active nftables firewalld ufw
```

If `nft` is installed, also run `sudo nft list ruleset`. If legacy iptables tools are in use, inspect their saved rules too. An inactive service does not prove that no firewall rules exist. Do not proceed if you find a configured firewall, containers, a VPN, or rules you cannot explain. Do not flush or reset them to make the example fit.

**Reference:** Installed `man ss`, `man systemctl`, `man nft`, and `man iptables-save` describe these checks.

With a working local console and a confirmed fresh configuration:

```sh title="Pi: install the firewall from the existing repositories"
sudo apt install ufw
sudo ufw status verbose
sudo ufw show added
```

Stop if UFW is already active or has existing rules. Inspect `/etc/default/ufw` and keep `IPV6=yes` so the policy covers IPv6 too. Do not disable IPv6 across the operating system as a shortcut.

**Reference:** [Debian apt(8)](https://manpages.debian.org/trixie/apt/apt.8.en.html) and [ufw(8) status, added rules, and IPv6](https://manpages.debian.org/trixie/ufw/ufw.8.en.html).

Stage the default policy and SSH exception while the firewall is still inactive:

```sh title="Pi: stage the policy before enabling it"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw logging low
sudo ufw show added
sudo ufw --dry-run enable
```

The SSH exception permits any source that can reach the Pi, on IPv4 and IPv6. It is not a LAN-only rule. Keep router port-forwarding disabled and check the router's IPv6 exposure policy. Restricting SSH to a known management address or subnet is a useful later change, but it needs a stable address and separate lockout testing.

UFW includes rules for established traffic and selected network functions such as DHCP, ICMP, and discovery. "Deny incoming" does not mean every packet except SSH is rejected. Review `sudo ufw show raw` after activation for the complete rules; `ufw status` shows only part of the policy. Do not remove IPv6 neighbor-discovery or other default network rules blindly.

**Reference:** [Debian ufw(8) rules, dry-run, default exceptions, and reports](https://manpages.debian.org/trixie/ufw/ufw.8.en.html).

:::caution[Enabling UFW can drop SSH]
Use the local console, not a remotely pasted command sequence. Do not use `--force`. If a new SSH login fails, run `sudo ufw disable` **at the console**; this unloads UFW and disables it at boot while leaving the staged rules for inspection. A dry run cannot prove network reachability.
:::

Only with the SSH exception staged and recovery access ready, enable from the local console:

```sh title="Pi local console: enable and inspect"
sudo ufw enable
sudo ufw status verbose
sudo ufw show raw
```

**Reference:** [Debian ufw(8) remote-management warning, enable, status, and raw rules](https://manpages.debian.org/trixie/ufw/ufw.8.en.html).

From the administration computer, establish a new key-only SSH connection immediately, test the workload, and confirm that `sudo apt update` and name resolution still work. Check IPv4 and IPv6 access separately if both are used.

If access fails, return to the local console:

```sh title="Pi local console: disable the new firewall"
sudo ufw disable
```

This restores the pre-example inactive state but keeps the staged rules for inspection. Do not use `ufw reset` as generic recovery. Reboot only after the new policy works, then test access again. An incoming firewall with outgoing traffic allowed does not stop an allowed program from sending your data out.

**Reference:** [Debian ufw(8) disable versus reset](https://manpages.debian.org/trixie/ufw/ufw.8.en.html).

## 4. Check AppArmor rather than assume confinement

Kicksecure uses AppArmor, but installing the package does not reproduce Kicksecure's policies. The kernel must support AppArmor and have it enabled. The program also needs a loaded profile that enforces restrictions.

Inspect the Pi. The file may be absent if the kernel security filesystem is unavailable; record that result rather than assuming protection exists:

```sh title="Pi: discover kernel security modules"
cat /sys/kernel/security/lsm
```

**Reference:** [Linux kernel LSM configuration and AppArmor enablement](https://www.kernel.org/doc/html/latest/admin-guide/LSM/apparmor.html).

If AppArmor's tools are installed, also run:

```sh title="Pi: inspect loaded AppArmor policy"
sudo aa-status
```

**Reference:** [Debian aa-status(8) profiles and process modes](https://manpages.debian.org/trixie/apparmor/aa-status.8.en.html).

A missing file, missing command, or absent `apparmor` entry is a reason to investigate, not evidence that protection exists. An enabled module without a profile for your application does not confine that application. A profile in complain mode records events rather than enforcing its restrictions.

Record which applications have enforcing profiles. Do not install experimental Kicksecure profiles, change the Pi's boot parameters, or force every profile into enforce mode here. If AppArmor is unavailable, mark this check as unavailable and leave policy enablement for a separate kernel-specific experiment. The previous SSH and firewall steps do not depend on AppArmor, but they do not replace it either.

Nix store paths also differ from ordinary `/usr/bin` paths. Do not assume a profile for an APT-installed executable automatically covers a Nix-installed equivalent.

## 5. Trial isolation for a service you understand

Skip this section if you have not installed a custom application service. Do not experiment on SSH, networking, login, or Raspberry Pi hardware-management units.

For one nonessential service, replace `YOUR_APP.service` with its real unit name:

```sh title="Pi: inspect an application service"
systemctl cat YOUR_APP.service
systemd-analyze security YOUR_APP.service
```

Read the unit, especially its user, writable paths, and privilege requirements. The security score is a checklist, not an audit or proof of safety. A root-running service does not lose its existing privileges just because `NoNewPrivileges` is set.

**Reference:** [Debian systemctl(1) unit inspection](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html) and [systemd-analyze(1) security exposure estimate](https://manpages.debian.org/trixie/systemd/systemd-analyze.1.en.html).

Continue only if the application does not need privilege-gaining executables or temporary files shared with other services. Create a dedicated drop-in **only if this filename is unused**.

If the service fails to restart after this change, remove only `60-kixetpi-hardening.conf`. Run `sudo systemctl daemon-reload`, then restart the service. Do not use `systemctl revert`, which also removes unrelated overrides.

```sh title="Pi: create an isolated trial drop-in"
sudo mkdir -p /etc/systemd/system/YOUR_APP.service.d
sudoedit /etc/systemd/system/YOUR_APP.service.d/60-kixetpi-hardening.conf
```

```ini title="60-kixetpi-hardening.conf"
[Service]
NoNewPrivileges=yes
PrivateTmp=yes
```

`NoNewPrivileges` prevents the service and its descendants from gaining privileges through mechanisms such as setuid execution. `PrivateTmp` gives the service private temporary directories. Neither prevents all filesystem or network access.

**Reference:** [Debian systemd.exec(5) `NoNewPrivileges` and `PrivateTmp`](https://manpages.debian.org/trixie/systemd/systemd.exec.5.en.html) and [systemctl(1) drop-in/revert behavior](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).

```sh title="Pi: apply only to the selected application"
sudo systemctl daemon-reload
sudo systemctl restart YOUR_APP.service
systemctl status YOUR_APP.service --no-pager
sudo journalctl -u YOUR_APP.service --since today --no-pager
```

**Reference:** [Debian systemctl(1) daemon-reload and restart](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html) and installed `man journalctl`.

Test the application, including its writes, network requests, and restart behavior. If it fails, use the targeted recovery above. Keep more restrictive filesystem and network controls for an application-specific guide.

## 6. Keep an update routine

APT update timers and unattended security updates are not the same thing. This draft requires a deliberate update routine, such as a weekly review and prompt action on relevant security advisories. Use the base guide's update and reboot checks. Do not regard a completed initial install as permanently hardened.

If you already use `unattended-upgrades`, inspect its configuration and run `sudo unattended-upgrade --dry-run --debug`. Confirm which actual repository origins it allows. A Debian-only example may omit Raspberry Pi or Raspbian packages. Do not claim automatic coverage until its output shows the required origins and you have tested the process on this image.

**Reference:** [Debian unattended-upgrade(8) dry-run and configuration](https://manpages.debian.org/trixie/unattended-upgrades/unattended-upgrade.8.en.html).

Do not copy origin patterns from another release, enable unattended major-version upgrades, or schedule automatic reboots without a recovery plan. Optional Nix packages need their own reviewed updates; APT does not update them.

## Checkpoint

Before rebooting, verify a new key-only SSH login, working sudo access, firewall recovery from the console, and the real application. After rebooting, repeat the login and application tests, then record:

```sh title="Pi: collect the hardening checkpoint"
systemctl --failed
sudo ss -lntup
sudo journalctl -u ssh -b --no-pager
sudo journalctl -b -p warning --no-pager
sudo apt update
```

**Reference:** Installed `man systemctl`, `man ss`, and `man journalctl`; [Debian apt(8)](https://manpages.debian.org/trixie/apt/apt.8.en.html).

Only if you completed the UFW section:

```sh title="Pi: check the optional firewall"
sudo ufw status verbose
```

**Reference:** [Debian ufw(8) status](https://manpages.debian.org/trixie/ufw/ufw.8.en.html).

Explain why each remaining listening service is needed. Record which applications AppArmor confines and which it does not, including when AppArmor is unavailable. Back up this working state before adding more software.

You can stop here and keep an APT-only system. If the hardware has enough resources and you want declarative user packages, continue to the [optional Nix guide](/guides/nix/).

## Sources and review status

Reviewed on 28 September 2026. No claim here establishes Kicksecure equivalence or tested Pi support. If a local manual is missing, use the [Debian manual index](https://manpages.debian.org/trixie/index.html).

- [Kicksecure on Raspberry Pi](https://www.kicksecure.com/wiki/Raspberry_Pi), [ARM64 status](https://www.kicksecure.com/wiki/ARM64), and [Debian conversion](https://www.kicksecure.com/wiki/Debian).
- [Kicksecure security-misc](https://www.kicksecure.com/wiki/Security-misc) and [bootloader-related packages](https://www.kicksecure.com/wiki/Dev/boot#Bootloader-related_Kicksecure_and_Whonix_packages).
- [Raspberry Pi SSH access](https://www.raspberrypi.com/documentation/computers/remote-access.html#ssh) and [software updates](https://www.raspberrypi.com/documentation/computers/os.html#update-software).
- [Raspberry Pi documentation source for SSH](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/remote-access/ssh.adoc) and [updates](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/os/updating.adoc). The published pages returned HTTP 403 during this review.
- [Debian OpenSSH configuration](https://manpages.debian.org/trixie/openssh-server/sshd_config.5.en.html) and [configuration validation](https://manpages.debian.org/trixie/openssh-server/sshd.8.en.html).
- [Debian visudo validation and recovery precautions](https://manpages.debian.org/trixie/sudo/visudo.8.en.html) and [unattended-upgrade dry-run behavior](https://manpages.debian.org/trixie/unattended-upgrades/unattended-upgrade.8.en.html).
- [Debian UFW manual](https://manpages.debian.org/trixie/ufw/ufw.8.en.html), including remote-management warnings and default network allowances.
- [Linux AppArmor requirements](https://www.kernel.org/doc/html/latest/admin-guide/LSM/apparmor.html) and [Kicksecure AppArmor guidance](https://www.kicksecure.com/wiki/AppArmor).
- [Debian systemd execution controls](https://manpages.debian.org/trixie/systemd/systemd.exec.5.en.html), [security analysis](https://manpages.debian.org/trixie/systemd/systemd-analyze.1.en.html), and [targeted drop-in management](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).
