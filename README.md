# QuestAIsle

QuestAIsle is a desktop application for running AI-assisted tabletop RPG sessions. It uses reusable story templates (setting, premise, safety guidance, and tracked values) and per-run saves to keep narrative continuity and game state consistent across turns.

## What you can do

- Create and manage story templates with structured tracked values (numbers, text, lists, objects).
- Start multiple “runs” per template and switch between saves.
- Advance the story with OpenAI, with live streaming text and suggested next actions.
- Review your session history, edit past entries, or rewind to an earlier point.
- Add run-only tracked values for a single save, and optionally export the run as a new template.

## Requirements

- An OpenAI API key.
- Network access to call the OpenAI API.
- OpenAI API usage is billed to your OpenAI account.

## Getting started (in the app)

1. Open **OpenAI Settings** and set:
	- **API Key**
	- **Model**
	- **Memory Window** (how many previous turns are included with each request)
2. Create a template in **Template Library**:
	- Add at least one tracked value (for example: health, time remaining, inventory).
	- Optionally use the template generator (requires an API key).
3. Create a run in **Saved Adventures** by selecting a template and choosing **New Run**.
4. In **Current Session**:
	- Enter a player action and advance the story.
	- Use the suggested actions as quick prompts.
	- Watch tracked values update as the AI reports state changes.

## Tracked values

Templates define tracked values that act like a structured character sheet or campaign sheet. Each value has an id, a label, and a type:

- **number / integer / float** (optional min/max bounds)
- **string / text**
- **boolean**
- **array** (optional max length)
- **object** (a JSON object made of strings/numbers/booleans, or arrays of those)

Within a run, you can also add **run-only values** that exist only for that save. Run-only values can be saved to the run, and you can export the run’s merged values as a new template.

## History controls

- **Edit**: update a previous player action or narrative text.
- **Rewind**: remove a turn (and anything after it) and restore tracked values using the recorded “previous” values from history.

## Data storage and privacy

QuestAIsle stores templates, saves, and settings as JSON files in the Tauri **AppLocalData** directory for your system.

- Templates are stored under `templates/` and named by slug: `<slug>.json`.
- Saves are stored under `saves/` and named by id: `<id>.json`.
- Settings are stored under `settings/config.json`.

If you want to back up or transfer your data, copy the app’s AppLocalData folder (it typically includes `com.questaisle` in the path).

OpenAI requests are made directly from the app to OpenAI. Each turn sends the information needed to run the session, which may include:

- The selected template (setting/premise/safety/instructions and value definitions)
- Your current tracked values
- The recent turn history (based on the Memory Window setting)
- The save’s hidden long-term memory entries
- Your current player action

Your API key is stored locally to allow the app to call OpenAI. Treat it like a secret.

AI-generated output can be incorrect or inconsistent. Review the narrative and state updates as you would with any automated tool.

## Development

QuestAIsle is built with Tauri (Rust) + React + Vite + TypeScript.

### Prerequisites

- Node.js
- Rust toolchain
- Tauri prerequisites for your OS

### Commands

- `npm install`
- `npm run dev` (Vite dev server on port 2160)
- `npm run tauri dev` (desktop app + dev server)
- `npm run build`
- `npm run tauri build`

### Optional environment variables

- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_MODEL` (defaults to `gpt-4.1-mini` if not set)
