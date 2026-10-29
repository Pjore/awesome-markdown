# Authoring checklist

## Data fidelity

- Preserve the item's slug and creation time; let the provider update `updatedAt`.
- Keep frontmatter properties recursive and typed. Quote identifiers, timestamp-like text and number-like text such as `"003"`.
- Keep document text in the Markdown body. At the API root, `body` represents that document text.
- Respect 16 container levels, 5,000 values and 524,288 serialized UTF-8 bytes.
- Use supported plain mappings/lists and safe property names. Store exact large identifiers as text.

## Selection

- Read the board's candidate filter and every referenced axis.
- Write a filter as an object; use `all`/`any` for groups.
- Match `$board` comparison values to the intended current board slug.
- For a path such as `boards.$board.column`, author `boards` as a list of groups with `board` identities.
- For nested `$axis` paths, give selected groups their `axis` identities.
- Resolve duplicate/incompatible lookups through the identified item and configured path before an explicit edit.

## Mutation and recovery

- Use structural arrays for literal editor keys/list indices and explicit selectors for contextual writes.
- Capture the complete source and revision before planned changes.
- Submit one revision-checked mutation batch and inspect the authoritative saved result.
- Keep body, unrelated properties and ordering intact when changing one group.
- Retain private recovery files for approved structural changes; use 0700 directories and 0600 files.

## Verification

- Check candidates, column/swimlane placement and homeless results.
- Confirm configured sort precedence and the single selected manual-order target.
- Exercise read/edit Save/Cancel and YAML/full-Markdown recovery in both providers.
- Use isolated browser seeds and temporary filesystem content for tests.
- For a Home, verify the installed binding with `home board connection` and its actual board/task reads.
