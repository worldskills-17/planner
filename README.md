# WorldSkills Experts Allocation Planner

A standalone, offline-first web application for allocating experts to marking teams and floor duty across competition sessions at WorldSkills and EuroSkills international competitions.

Built to replace spreadsheet-based planning with a purpose-built tool that handles team composition, skill balancing, preference tracking, and session rotation.

## Quick Start

1. Open `index.html` in any modern browser
2. Click **Setup** to configure competition name, days, numbers of marking teams, and number of experts on the floor count
3. Go to **Experts** and import your roster via CSV
4. Switch to **Schedule** and use **All Sessions** to auto-allocate
5. Fine-tune by dragging experts between teams, floor, and free pool
6. Check **Overview** for a full grid of assignments across all days

No server, no build step, no internet connection required.

## Features

### Expert Management
- Import expert roster from CSV (_please see below for format details_)
- Inline editing of skill ratings (0-5 stars for Design Implementation (DI), Front-end Development (FE), Back-end Development (BE))
- Marking preferences per skill area (Yes / No / Maybe / Observer)
- NEW expert and Observer flags
- Add, edit, and delete experts directly

### Schedule (Allocation)
- Drag-and-drop experts between teams, floor duty, and free pool
- Auto-allocate single session or all sessions with one click
- Configurable number of teams and floor experts per session
- Team radar charts showing average skill profile
- Per-team marking room assignment

### Auto-Allocation Algorithm
- Respects marking preferences (N = excluded, M = lower priority, Y = preferred)
- Enforces rest rotation (minimum 2 free sessions per expert)
- Maintains team cohesion across sessions where possible
- Prefers NEW and observer experts for floor duty
- Ensures 5-star coverage in each team's primary skill area
- Supervisors selected based on experience and willingness

### Validation
- Hard constraints: team size, 5-star requirement, dual assignment detection
- Soft constraints: low skill averages, preference conflicts, too many NEW experts
- Inline validation badge with click-to-expand detail modal

### Marking Scheme
- Define modules (A, B, C...) with primary skill area
- Batch-add sub-criteria assigned to specific sessions
- Sub-criteria distributed across teams on a dedicated page

### Overview
- Grid view of all experts across all sessions
- Colour-coded cells: supervisor, expert, floor, free
- Sort by member country or by team assignment per session
- Marking / Floor / Rest session counts per expert
- Visual day separators

### Persistence
- Auto-saves to browser localStorage on every change
- Export/import full state as JSON file (Save / Load buttons)
- Undo/Redo with keyboard shortcuts (Ctrl+Z / Ctrl+Y)

## CSV Import Format

```
CC,Name,Member,Notes,DI,FE,BE,New,DI_Pref,FE_Pref,BE_Pref
AU,James Thornton,Australia,,5,4,3,N,Y,Y,M
```

| Column | Description | Values |
|--------|-------------|--------|
| CC | 2-letter country code | e.g. AU, UK, DE |
| Name | Expert full name | text |
| Member | Country/region name | text |
| Notes | Optional notes | text |
| DI/FE/BE | Skill self-rating | 0-5 |
| New | First-time expert | Y/N |
| DI_Pref/FE_Pref/BE_Pref | Marking preference | Y/N/M/Observer |

Flexible column matching — headers like `country_code`, `frontend`, `be_marking` etc. are also recognised.

## Competition Setup

| Setting | Description |
|---------|-------------|
| Competition Name | Displayed in the header (e.g. "WorldSkills Shanghai 2026") |
| Days | 3 (EuroSkills) or 4 (WorldSkills) |
| No. of marking teams | Teams per session (add/remove per session on Schedule page) |
| Experts on floor | Target floor duty count per session |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save state as JSON |

## Colour Legend

### Skill Levels
| Level | Colour | Description |
|-------|--------|-------------|
| 5 | Deep Green | Expert |
| 4 | Light Green | Strong |
| 3 | Yellow | Average |
| 2 | Amber | Basic |
| 1 | Red | Low |
| 0 | Grey | None |

### Marking Preferences
| Preference | Colour | Auto-allocation |
|------------|--------|-----------------|
| Yes | Green | Preferred (+3 score) |
| Maybe | Yellow | Lower priority (+1 score) |
| No | Red | Excluded from auto-allocation |
| Observer | Grey | Manual team placement only |

## Technical Details

- Vanilla JavaScript with ES modules (no framework)
- Tailwind CSS (pre-built, no runtime compilation)
- SheetJS for CSV parsing (bundled locally)
- All assets bundled — works fully offline
- Accessible: WCAG AA compliant, WAVE validated

## Browser Support

Any modern browser with ES module support (Chrome, Firefox, Edge, Safari).

## Licence

This project is provided as-is for WorldSkills competition management use.

---

Developed and maintained by Val Adamescu
