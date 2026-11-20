# DeskTea — Obsidian Gallery Studio Design System

## Core Aesthetic Philosophy
A full-viewport **Matte Obsidian Gallery Studio** (`lg:h-dvh lg:overflow-hidden`) where the user's real desk photograph commands the left two-thirds as an illuminated darkroom centerpiece, paired with a full-height editorial transcript rail on the right.

## Palette
- `--stage`: `#0A0A0C` (gallery photographic darkroom)
- `--rail`: `#121215` (vertical chat transcript rail)
- `--elevated`: `#19191E` (modals & drawers)
- `--ink`: `#F5F4F0` (warm ivory text & primary pill CTA)
- `--ink-secondary`: `rgba(245, 244, 240, 0.62)`
- `--ink-muted`: `rgba(245, 244, 240, 0.36)`
- `--hairline`: `rgba(255, 255, 255, 0.08)`
- `--hairline-strong`: `rgba(255, 255, 255, 0.16)`
- `--accent`: `#FF5A4E` (luminous coral — active `@mention`, tension indicator, breach alert)

## Structural Principles
- **100% Viewport Utilization**: No floating boxed containers with wasted outer margins; no separate opaque top navbar stealing vertical space.
- **Luminous Spatial Anchors**: Subtle glass halo dots at rest keep the desk photograph unobstructed; hovering, clicking, or active speech expands an anchor into a dark frosted glass card with the object's cropped real avatar and quote.
- **Single-Source Controls**: One floating top-bar cluster (Tone, Locale, Settings) and one floating bottom cinema dock (Filmstrip thumbnails, `Try your desk` CTA, Replay / Re-scan / Compare / Share).
