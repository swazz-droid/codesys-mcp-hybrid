# Hybrid v0.1

Johannes Pettersson's toolkit remains the project/POU/ST core. Existing native
import/export and project backup remain the full-fidelity transfer/backup route.
No PLC download, login, start/stop or online variable writes are added.

## Tools and boundaries

| Tool | Behavior | Verification in this change |
| --- | --- | --- |
| `validate_plcopen_xsd` | Windows .NET schema validation; caller supplies local XSD | Automated tests and the user's FBD XML/schema |
| `validate_plcopen_semantic` | Standard and CODESYS embedded POUs, names, interface manifest, graphical IDs/wires, SFC initial step | Automated tests and existing LD/FBD/SFC/project exports |
| `compile_project_diagnostics` | Existing Johannes build selection plus Build message objects | Response tests; actual SP22 run pending |
| `get_workflow_guidance` | Native/Johannes/graphical/HMI routing and minimum usage | MCP registration/handshake |
| `get_symbols`, `find_references` | Read project text; simple VAR declarations and comment/string-aware identifier candidates | Offline lexer/search tests; actual project scan pending |
| `prepare_graphical_xml` | Adapt one native LD/FBD/SFC POU template, rename POU, refresh matching object IDs, replace exact variable/expression bindings | Tests and existing user templates; import of prepared outputs pending |
| `hybrid_bridge_status` | Existing IDE bridge heartbeat/project | Disconnected/stale/project checks tested |
| `import_graphical_xml` | Validate a POU-only file, export native backup, reject name conflicts, import, verify requested direct POU names, save | Bridge protocol/tests; actual IDE import pending |
| `create_visualization` | New page with positions/text/bindings/tap/edit/navigation | Based on user's working API patterns; packaged tool not yet IDE-tested |
| `read_visualization` | Basic positions/text/bindings | Packaged tool not yet IDE-tested |

`runtimeVerified: false` describes these new integrations. The user's previously
reported core/native tests are not reclassified or treated as new verification.
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
