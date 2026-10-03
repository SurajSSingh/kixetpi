---
title: A leaner, hardened Raspberry Pi
description: Build on Raspberry Pi OS Lite with selected DietPi and Kicksecure practices, then optionally manage user packages with Nix.
---

KixetPi is a guide to adapting Raspberry Pi OS Lite, not a new operating system image. Keep the Raspberry Pi kernel, hardware support, and package sources used by APT, Debian's package manager.

Remove what your workload does not need, add selected security controls, and optionally describe your user packages with Nix.

:::caution[Research draft, not a tested system]
These instructions combine upstream documentation with proposed integration choices. No Raspberry Pi model has passed this guide yet. There are no measured memory savings or verified security claims. Use a spare card and a separate test Pi before relying on this setup.
:::

## Follow the four stages

| Stage | What you will do | What stays unchanged |
| --- | --- | --- |
| [1. Set up Raspberry Pi OS Lite](/guides/raspberry-pi-os/) | Choose an image, establish access, update, and record a baseline. | The official Raspberry Pi OS base. |
| [2. Adapt DietPi practices](/guides/dietpi/) | Audit services and packages, keep only what you need, and set a modest log budget. | No DietPi conversion, repositories, or management scripts. |
| [3. Adapt Kicksecure practices](/guides/kicksecure/) | Reduce remote exposure, verify updates, and check available confinement. | No Kicksecure conversion, replacement kernel, or boot stack. |
| [4. Add Nix optionally](/guides/nix/) | Declare a small user package set with Home Manager. | APT continues to own the operating system. |

Complete each stage's checks before continuing. Stopping after stage 3 is a complete path. Nix is opt-in, not a dependency of the lean or hardened configuration.

### Working with an AI agent

The four stages are written for you to follow directly. If an AI agent is helping, give it the separate [agent assistance companion](/reference/agent-assistance/) for a reading path, command references, and decision checkpoints. It supplements these instructions without turning them into an unattended setup script.

## What can be carried over

Raspberry Pi OS, DietPi, and Kicksecure use Debian foundations, but that does not make their repositories or configuration packages interchangeable. They make different choices about kernels, supported machines, services, package dependencies, and release lifecycles.

Distromorphing means converting an installed Linux distribution into another one. This guide borrows individual practices, not repositories or whole configurations.

Nix is a package manager that can run alongside an existing Linux distribution. NixOS is a separate Linux distribution built around Nix. This guide uses Nix and optional Home Manager configuration, not NixOS modules or `nixos-rebuild`.

| Owner | Responsibilities |
| --- | --- |
| Raspberry Pi OS and APT | Kernel, firmware, boot files, networking, SSH, firewall, system services, security updates, and the host's system libraries. |
| Local administrator | Reviewed configuration files, backups, service decisions, tests, and recovery. |
| Optional Nix installation | Its package store, build accounts, background service, and package dependencies. These are system-level additions even though this guide uses Nix only for user tools. |
| Optional Home Manager configuration | Selected user tools and explicitly declared home configuration. It must not replace the system's networking, login, or update management. |

Keep system-service executables on APT-managed paths such as `/usr/bin`. Nix packages may bring their own library versions, but do not replace `/usr/lib` or make APT aware of those packages.

## Scope and limits

The first target is a headless Pi on a trusted home network. Headless means normally used without a display or keyboard. Use an ordinary account with `sudo` access for administration. This guide does not cover a public server, router, high-assurance workstation, or anonymity system.

Fewer running services can mean fewer reachable entry points. Removing an unused package can reduce maintenance, but package count alone does not measure security or memory use. Disk space, idle memory, boot time, and workload performance are separate measurements.

Hardening means reducing unnecessary exposure. It does not make malicious packages safe:

- A program running as your user can usually read your files and change your shell configuration.
- Nix's build sandbox restricts package builds, not programs you run afterward.
- Software run with `sudo` can change the whole system.

This guide does not establish verified boot, full-disk encryption, physical security, or protection after root compromise. It does not reproduce Kicksecure's complete security design. Install software only from sources you trust, and do not use this test Pi for sensitive credentials.

## Use these instructions safely

- Commands on the four guide pages are for the separate Raspberry Pi unless a block explicitly says it runs on your administration computer.
- Read the prerequisites and warnings before each block. Explanations and references follow it; complete the result checks before the next step. Do not paste a whole page into a terminal.
- Replace example usernames, addresses, and file paths with your own values. Stop if the documented preconditions do not match your machine.
- Stop on unexpected errors; do not continue to later commands in the block. Expected failures, such as a refused password-only login, are labeled.
- Make one change at a time. Keep an existing SSH session open while testing another, and arrange local console access before access-control changes.
- Keep a known-good full-card backup or spare card outside the Pi. Package lists and copies of `/etc` are useful records, not a bootable recovery image.
- Preserve updates, working name resolution, time synchronization, and useful logs. A smaller system that cannot update or diagnose a failure is not the goal.

### Know what recovery means

Each stage explains what its changes do and how to recover. A reversible change lets you restore a setting or a saved package environment. It does not let you undo every effect the change had.

- Inspection reads the current state without changing configuration.
- To undo a setting change, restore the recorded setting or remove only this guide's new configuration file. You may need working console or administrator access.
- Imaging a card, replacing packages, or deleting history may require a backup to recover. A reverse command cannot reliably undo these actions. Preserve a recovery card and needed data first.

## Record the first hardware walkthrough

Every stage is currently **not tested**. Upstream documentation supports the individual mechanisms, not this combined setup. Each guide lists its sources and review status; links and upstream releases may change.

Use this checklist to record each stage. It is a notes template, not executable code. Keep it outside the test card, and remove private addresses, keys, and credentials before sharing it.

```text title="Walkthrough record"
Date and guide revision:
Stage and exact step:
Pi model and RAM:
Image filename, release date, and published checksum:
OS codename, dpkg architecture, and kernel:
Boot storage, power supply, and network connection:
Pre-change backup location and restore check:
Commands run and configuration changes:
Expected result:
Actual result and relevant logs:
Idle available RAM, swap usage, root disk usage, and listening ports:
Workload tested and result after reboot:
Rollback attempted and result:
Status: not tested / passed on this setup / failed / skipped with reason
```

A passing result applies only to the recorded hardware, image, and configuration. Capture troubleshooting details where the failure occurs before revising the instructions. Do not turn an untested suggestion into a claimed default for every Pi.

Start with [Raspberry Pi OS Lite](/guides/raspberry-pi-os/).
