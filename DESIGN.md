# Apple Design System Analysis

## Overview
Apple's web design prioritizes product photography above all else. The interface uses a minimal, purposeful palette with a single blue accent color (#0066cc) for all interactive elements. The layout alternates between light and dark full-bleed tiles that create rhythm without decorative borders or shadows.

## Core Design Principles

**Visual Hierarchy Through Restraint**
The system "recedes so the product can speak" by eliminating unnecessary chrome. Rather than using multiple accent colors or decorative effects, Apple relies on surface-color alternation (white/parchment vs. near-black tiles) to define sections.

**Typography as Brand Voice**
SF Pro Display and SF Pro Text form the foundation. Headlines use negative letter-spacing (around -0.28 to -0.374px) to create the signature "Apple tight" aesthetic. Body copy runs at 17px—not the industry-standard 16px—establishing a distinctly spacious reading rhythm.

**Functional Elevation**
The system uses exactly one drop-shadow, applied only to product renders resting on surfaces. All other elevation comes from color changes and backdrop-blur effects on sticky navigation. This restraint ensures nothing distracts from the product itself.

## Color Strategy

**Single Accent**: Action Blue (#0066cc) governs every clickable element—links, buttons, focus rings. No secondary brand color exists.

**Surface Palette**: White (#ffffff), parchment (#f5f5f7), pearl (#fafafc), and three near-black variants (#272729, #2a2a2c, #252527) create visual rhythm.

**Text Hierarchy**: Near-black ink (#1d1d1f) on light surfaces; white on dark tiles; muted tones for secondary information.

## Components & Spacing

Buttons follow two grammars: pill-shaped CTAs (rounded.pill) and compact utility rects (rounded.sm). The spacing system uses an 8px base unit, with section padding set at 80px—creating unusually generous whitespace even by luxury-brand standards.

Product tiles occupy roughly one full viewport height with centered content: headline, tagline, two blue pill CTAs, and product render. No decorative gradients; no shadows on interface elements.
