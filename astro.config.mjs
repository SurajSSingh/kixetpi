// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://surajssingh.github.io',
	base: '/kixetpi',
	integrations: [
		starlight({
			title: 'KixetPi',
			sidebar: [
				{ label: 'Start here', slug: '' },
				{
					label: 'Build your system',
					items: [
						{ label: '1. Raspberry Pi OS Lite', slug: 'guides/raspberry-pi-os' },
						{ label: '2. DietPi-inspired reduction', slug: 'guides/dietpi' },
						{ label: '3. Kicksecure-inspired hardening', slug: 'guides/kicksecure' },
						{ label: '4. Nix for your home', slug: 'guides/nix', badge: 'Optional' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Assisting with an AI agent', slug: 'reference/agent-assistance' },
						{ label: 'VM command test run', slug: 'reference/vm-test-run' },
					],
				},
			],
		}),
	],
});
