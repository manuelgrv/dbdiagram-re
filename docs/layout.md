# Saved visual state

The host derives the file path by replacing the model's `.dbml` suffix with `.dbdiagram` in the same directory. The extension creates this file to remember the preview layout.

## Version 3 shape

```json
{
  "version": "3.0.0",
  "darkMode": true,
  "gridEnabling": false,
  "currentViewName": null,
  "defaultView": {
    "detailLevel": "All",
    "relationshipMode": "Dependency",
    "tablePositions": [],
    "tableGroupCollapseStates": [],
    "stickyNoteLayouts": [],
    "referencePaths": []
  },
  "views": {}
}
```

`views` maps names to the same visual-state shape as `defaultView`. Actual view membership is defined in DBML; the sidecar holds positions and modes, not the authoritative schema or ETL transformations.

`relationshipMode` accepts exactly `Relationship`, `Dependency`, or `All`. Invalid values normalize to `All`. Detail-level UI values are `Tables`, `Keys`, and `All`; the decoder is permissive and does not enforce the detail-level enum in the same way it enforces relationship mode.

A table position has `name`, `schemaName`, `x`, and `y`. Reference paths identify both endpoints with schema/table/field names, relation values, and `checkPoints`. Group and sticky-note arrays are forwarded as renderer state. The tests cover migrations; the project does not claim a complete independently validated JSON Schema for every renderer-specific layout entry.

## Migrations verified through the actual decoder

- V3 and V2 normalize to V3; `darkMode` must be boolean for these versions.
- V1 and unversioned objects move top-level visual fields into `defaultView` and reset named views.
- Unknown versions use the current object normalizer rather than being rejected outright.
- Invalid JSON returns `null`.
- Missing optional arrays become empty arrays.

The host falls back to a new default state if reading or decoding fails. Saves use a one-second debounce. Disposal flushes immediately. Editing the sidecar while a preview is open can be overwritten by its in-memory state; close the preview before making manual layout edits.

To inspect a normalized layout without changing it:

```sh
node src/cli.mjs layout ../retail_lineage.dbdiagram
```
