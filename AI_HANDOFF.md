# Photo Effects - AI_HANDOFF.md

**Version:** 1.0\
**Purpose:** Standard handoff document for any AI assistant working on
the Photo Effects project.

------------------------------------------------------------------------

# Mission

Continue developing **Photo Effects** as a professional,
production-quality Progressive Web App.

Do **not** redesign the architecture unless the user explicitly requests
it.

Focus only on the feature requested in the current conversation.

------------------------------------------------------------------------

# Project Summary

Photo Effects is a browser-based image editing application built with:

-   HTML5
-   JavaScript ES Modules
-   Canvas API
-   CSS3
-   PWA
-   GitHub Pages

The application is completely client-side.

------------------------------------------------------------------------

# Reference Documents

Before making any changes, follow these documents in order:

1.  ARCHITECTURE.md
2.  FEATURES.md
3.  UI_GUIDELINE.md
4.  VERSIONING.md
5.  CONTRIBUTING.md
6.  AI_HANDOFF.md

These documents define the project rules.

------------------------------------------------------------------------

# Do NOT Change

Unless specifically requested, do not change:

-   Folder structure
-   main.css architecture
-   Shared framework
-   Navigation layout
-   Existing icon naming
-   State management
-   Draft recovery mechanism

------------------------------------------------------------------------

# Development Rules

Every new feature should:

-   Live inside its own feature folder.
-   Reuse shared framework components.
-   Avoid duplicated code.
-   Be production-ready.
-   Support responsive layouts.

------------------------------------------------------------------------

# Required Capabilities for Every Feature

Every image editing feature should automatically support:

-   Open Photo
-   Save Photo
-   Share Photo
-   Home Navigation
-   Settings
-   Auto Save
-   Draft Recovery
-   LocalStorage
-   IndexedDB
-   Responsive UI

These capabilities should be reused rather than rewritten.

------------------------------------------------------------------------

# Draft Recovery Policy

If a user leaves a feature without saving or sharing:

-   Preserve the source image.
-   Preserve all adjustment parameters.
-   Preserve the selected mode.
-   Preserve UI state.
-   Restore everything automatically when the user returns.

The user should never lose unfinished work.

------------------------------------------------------------------------

# User Interface Rules

Theme:

-   Tiffany Green

Style:

-   Apple Human Interface inspired
-   Senior-friendly
-   Large icons
-   Large touch targets
-   High contrast
-   Minimal text
-   Consistent navigation

------------------------------------------------------------------------

# Output Rules

During development:

Generate only files that changed.

Do NOT regenerate the entire project.

Do NOT create README.md.

README is produced only for official releases.

------------------------------------------------------------------------

# Coding Rules

-   ES Modules
-   Clean architecture
-   Small reusable modules
-   No placeholder code
-   No duplicated logic
-   Maintain backward compatibility whenever practical.

------------------------------------------------------------------------

# Conversation Scope

Each conversation should focus on exactly one feature.

Examples:

-   F1 Mirror
-   F2 Crystal Ball
-   F3 Magic Sky

Avoid making unrelated framework changes.

------------------------------------------------------------------------

# Versioning

Application version and feature version are independent.

Example:

Photo Effects v0.5.0

Mirror v1.2.0

Crystal Ball v0.3.0

------------------------------------------------------------------------

# Standard Prompt for New Conversations

Use the following prompt when starting a new AI conversation:

> Continue the **Photo Effects** project following ARCHITECTURE.md,
> FEATURES.md, UI_GUIDELINE.md, VERSIONING.md, CONTRIBUTING.md and
> AI_HANDOFF.md.
>
> Do not redesign the architecture.
>
> Modify only the files required for the requested feature.
>
> Today we are implementing **`<Feature Name>`{=html}** only.

------------------------------------------------------------------------

# Long-Term Vision

The goal is to build a professional image editing suite containing 28
independent editing tools that share one common framework, consistent
UI, and maintainable architecture.

Every change should move the project toward a stable v1.0 release.
