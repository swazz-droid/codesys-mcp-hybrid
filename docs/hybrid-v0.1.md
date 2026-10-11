# Hybrid v0.1

Johannes Pettersson's toolkit remains the project/POU/ST core. Existing native
import/export and project backup remain the full-fidelity transfer/backup route.
No PLC download, login, start/stop or online variable writes are added.

## Tools and boundaries

| Tool | Behavior | Verification in this change |
| --- | --- | --- |
| `validate_plcopen_xsd` | Windows .NET schema validation; caller supplies local XSD | Automated tests and the user's FBD XML/schema |
| `validate_plcopen_semantic` | Standard and CODESYS embedded POUs, names, interface manifest, graphical IDs/wires, SFC initial step | Automated tests and existing LD/FBD/SFC/project exports |
| `compile_project_diagnostics` | Existing Johannes build selection plus Build message objects | SP22 Patch 4: passing/warning builds, located compiler errors and repaired build |
| `get_workflow_guidance` | Native/Johannes/graphical/HMI routing and minimum usage | MCP registration/handshake |
| `get_symbols`, `find_references` | Read project text; simple VAR declarations and comment/string-aware identifier candidates | Tests and actual SP22 project scan including Unicode |
| `prepare_graphical_xml` | Adapt one native LD/FBD/SFC POU template, rename POU, refresh matching object IDs, replace exact variable/expression bindings | All three adapted templates imported, roundtrip exported and built with calls in SP22 |
| `hybrid_bridge_status` | Existing IDE bridge heartbeat/project | Offline protection tests; live wrong-project and late read-only timeout result |
| `import_graphical_xml` | Validate a POU-only file, export native backup, reject name conflicts, import, verify requested direct POU names, save | SP22 LD/FBD/SFC imports, compile signatures and duplicate rejection |
| `create_visualization` | New page with positions/text/bindings/tap/edit/navigation | SP22 create/save/readback/native event payload; simulator interaction pending |
| `read_visualization` | Filter by text/exact variable/index; select properties; paginate | SP22 73-element page: full, filtered, default limit and offset checked |
| `update_visualization` | Change selected existing text/position/binding properties after expected-value checks; native backup and saved readback | SP22 Unicode title/width update; stale batch rejected before mutation; untouched native button/events identical |

Capability verification is scoped to SP22 Patch 4 (3.5.22.40). Diagnostics and
textual scans are runtime-verified. Graphical/HMI `ideApiVerified` records actual
IDE tests while `runtimeVerified: false` retains the untested execution/UI boundary.
The user's prior core/native tests remain separate evidence.
The MCP smoke test uses an offline executable placeholder and calls no CODESYS
runtime tools. Passing it proves protocol/registration behavior, not runtime compatibility.

## Setup

Keep the existing CODESYS path/profile/workspace arguments. For IDE graphical/HMI
operations, add an environment variable pointing at the **existing** bridge:

```json
{
  "CODESYS_BRIDGE_DIR": "C:\\Users\\DENISA\\Codex_Codesys_Bridge"
}
```

The server does not start, install, modify or replace the bridge. Run its existing
`start_bridge.py` inside an already open CODESYS IDE, then check
`hybrid_bridge_status`. The heartbeat must be fresh, and the requested `.project`
must match the IDE's primary project. Disconnected/wrong-project requests are
rejected before queue submission. A timeout returns an ID/result path to inspect;
there is no automatic replay.

Use `xsdPath` matching the XML namespace (`tc6_0200` versus `tc6_0201`). Schemas
are not bundled because the Festo reference states their redistribution terms are
unverified. External schema resolution and DTDs are disabled. Lax vendor extension
warnings are reported separately from schema errors; an undeclared document root
still fails validation. This validator requires Windows PowerShell/.NET.

## Minimal workflow

For existing HMI edits, use `read_visualization` with `textContains`, `variable`
or `elementIndexes` and a short `properties` list. Filters combine with AND;
`variable` is an exact match on text/color/tap binding. Indexes are zero-based and
can change if elements are added/removed. The default read limit is now **20**,
with `elementCount`, `matchedCount`, `offset`, `truncated` and per-element indexes.
Use `offset`/`maxResults` for more results or explicit `maxResults: 500` for a full
page. Never assume the default response contains every element.

Pass recently read property values in `expected` to update existing elements:

```json
{
  "projectFilePath": "working-copy.project",
  "parentPath": "Device/Plc Logic/Application",
  "name": "Screen_1",
  "updates": [{
    "elementIndex": 0,
    "expected": {"Texts.Text": "Old title", "Position.X": "16"},
    "set": {"Texts.Text": "Toolkit-test", "Position.Width": 320}
  }]
}
```

All batch preconditions are checked before backup/mutation. Supported keys are
the eight properties exposed by the reader; positions are finite numbers,
dimensions positive, and text/bindings strings. Other properties and existing
event lists are retained. This does not add/delete elements or rewrite navigation
and edit-action lists. CODESYS applies edits at `end_modify`; saved values are
reacquired and checked afterward. A setter/save failure can still leave partial
changes: inspect the native backup/project rather than automatically retrying.

1. Read `get_capabilities` once. Its bridge state reflects the current heartbeat.
2. ST/POU edits: use the existing Johannes tools, read only the relevant objects,
   edit coherently, save once, then build once.
3. Full backup/transfer: `.project` backup plus native `.export`. PLCopen cannot
   restore the complete HMI/device/task state.
4. Graphical: export/select a single known-working POU template, use
   `prepare_graphical_xml`, then fast XML -> XSD -> semantic validation.
   `import_graphical_xml` rechecks schema/semantics against staged bytes before
   importing via the IDE bridge. It requires `expectedPous` to exactly match the
   file and rejects device/configuration transfers and existing POU names.
5. HMI: retain the working Visualization Manager/WebVisu from the project/template.
   `create_visualization` creates a new page; it never clears/replaces an existing
   page. Use `textVariable`, `activeVariable`, `tapVariable`, `writeVariable` and
   `navigationTarget` to specify actual bindings/actions. `writeVariable` requires
   `textVariable`. The page is saved but not compiled automatically.
6. Confirm diagnostics, then inspect language/task bindings and runtime behavior.

Graphical/HMI mutations export a timestamped native backup of the open project to
`<workspace>/hybrid-backups` before edits. Validated XML is retained in
`<workspace>/hybrid-staging`. Both directories are ignored by Git. Failed mutation
or timeout may leave a partially changed project; inspect the project and the
returned request result before deciding whether to restore the backup.

### Interface manifest

Semantic validation can verify expected interface entries without ST sidecars:

```json
{
  "filePath": "generated.xml",
  "expectedPous": ["Demo"],
  "externalTypes": ["TON"],
  "expectedVariables": {
    "Demo": [{"name": "xStart", "type": "BOOL", "initialValue": "FALSE"}]
  }
}
```

Type checks cover simple type names/derived names; initializer checks cover simple
values. Complex array/struct initializers, compiler type resolution, physical I/O,
task execution order, HMI event wiring and all graph behavior remain CODESYS checks.
Referenced project/library types absent from partial XML are warnings, not errors.

Symbol results are textual candidates, include declaration occurrences, use
1-based positions and do not resolve overloads/scopes/inheritance. `get_symbols`
indexes simple single-line VAR declarations. Neither tool scans graphical/HMI/task
bindings or library internals. Do not use candidate results alone to perform a rename.
`scope` narrows results; the current project runner still traverses the project text.

The existing `compile_project` remains unchanged. Prefer
`compile_project_diagnostics` for a confirmed Build result: it clears only the Build
message category, builds the same selected application and reads structured messages.
Uncollectable diagnostics return `unknown`/`isError: true`, even if the build script
ran. Positions are preserved as CODESYS position text/offsets, not guessed line numbers.

## Local checks still required: CODESYS V3.5 SP22 Patch 4

The checks below are the complete reproducible checklist. Actual completed IDE
checks and evidence are in [hybrid-validation-report.md](hybrid-validation-report.md).
Remaining manual checks are HMI layout/tap/edit/navigation, the Tre cylindrar
simulation sequence (pause/resume/count/sensors/start-stop-step), and physical I/O
if intended. Broader project/library/version coverage remains untested. A
zero-warning fixture and manual Build-pane comparison have not been run.

**Recovery finding:** SP22 native import normalized task `core_binding` from -1
to -2 in this project. Restoring the original values removed all content differences
in the separate recovery project. Native remains the full-fidelity transfer format,
but compare recovered tasks/core bindings against the original before using them.
The original Johannes tools have not been replaced to work around this IDE behavior.

Perform these on disposable project copies, recording the exact tool response,
CODESYS version/profile and Build messages:

1. **Structured compile diagnostics:** a clean project, a deliberate syntax/type
   error and a warning-only project. Confirm statuses/counts/codes/object paths and
   position text against the Build pane. Repair the deliberate error afterward.
   Confirm the unavailable-message-API case is `unknown`, never `passed`.
2. **Symbols/references:** scan a real project with a local variable, a qualified
   GVL reference, comments/strings, methods/properties and a same-name variable in
   another POU. Confirm textual candidates/positions and documented exclusions.
3. **Each graphical language:** prepare one LD, FBD and SFC template; validate with
   its matching XSD; import into a copy with no name conflict. Confirm exactly one
   intended POU, correct graphical language/editor, connections, declarations,
   action/transition/object IDs and retained vendor data; no `_1` suffix objects.
   Check/name task calls explicitly and compile. Try an existing name to confirm
   the import rejects it without deleting anything.
4. **Bridge protection:** disconnected, stale, wrong-project and timeout cases.
   Confirm no request for invalid targets and no duplicate execution after timeout.
   Inspect the result ID rather than blindly resubmitting.
5. **HMI:** create a new disposable page with text/read bindings, a tap control,
   an editable value and navigation to an existing page. Read it back, compile,
   inspect layout and test events/navigation in a local simulator. Confirm the
   existing Visualization Manager/WebVisu and pages remain usable. No WebVisu
   creation API is claimed.
6. **Backup recovery:** inspect the automatically created native export for full
   tree/HMI content; restore it into another disposable project and inspect
   device/I/O/tasks/POUs/HMI. This tests the new automatic backup wrapper, not a
   reclassification of the user's earlier native import/export tests.
7. **Tre cylindrar end-to-end:** on a working copy, confirm existing ST/POU tools
   still work, task call order/actual imported objects, clean Build, timer pause /
   resume / cycle count / sensor acknowledgement / HMI start-stop-step behavior
   in local simulation. Physical I/O needs a separate local check if intended;
   these tools do not perform PLC downloads or online writes.

## Validation commands

```text
npm run build
npm test
npm pack --dry-run
```

See NOTICE.md and third-party/ for preserved Johannes/Festo MIT attribution.
