# Validation report — 2026-10-11

Branch: `hybrid-v0.1`. All changes and checks were performed locally.

## Passed

- `npm run build` / TypeScript compilation after coherent steps.
- `npm test`: **19 passed, 0 failed, 0 skipped**. Covers graph IDs/wires,
  embedded CODESYS POUs, interface manifests, XML/DTD failures, .NET XSD valid /
  invalid / undeclared root / lax extension cases, diagnostic envelopes and status,
  comment/string-aware reference candidates, native-template metadata/ID changes,
  bridge session/project/timeout behavior and a real MCP stdio handshake.
- MCP smoke check: existing core/native tool registrations and project/POU resource
  templates retained; new tools registered; routing recommendations reference
  available tools; capability response scopes IDE evidence separately from unverified execution;
  disconnected HMI mutation rejects before queue submission.
- `npm pack --dry-run`: builds and includes compiled hybrid modules, XSD runner,
  workflow documentation and both retained MIT license notices.
- `git diff --check`: no whitespace errors.

## Read-only checks against the user's existing files

These inspect XML offline and do not execute or modify a CODESYS project:

| File | Check | Result |
| --- | --- | --- |
| `C:/Users/DENISA/Codex_Demo_XML/Codex_LD_Demo_v2.xml` | Semantic; local matching TC6 0200 XSD; template adaptation | Pass; one POU; allowed vendor warnings |
| `C:/Users/DENISA/Codex_Demo_XML/Codex_FBD_Demo_v2.xml` | Semantic; local `tc6_xml_v201.xsd`; template adaptation | Pass; one POU; allowed CallType vendor warning |
| `C:/Users/DENISA/Tre_Cylindrar_Uppgift_1_3/SFC_reference.xml` | Semantic; local matching TC6 0200 XSD; template adaptation | Pass; one POU; allowed vendor warnings |
| `C:/Users/DENISA/Tre_Cylindrar_Uppgift_1_3/Tre_Cylindrar_Final.xml` | Project-based semantic inspection | Pass; two embedded POUs |
| `C:/Users/DENISA/HMI_Tre_Cylindrar_1_1_3/HMI_Tre_Cylindrar_1_1_3.xml` | Project-based semantic inspection | Pass; three embedded POUs |

Local TC6 0200 schema used for these read-only checks:
`C:/CODESYS_AI/festo-codesys-mcp/python/lib/plcopen_validation/data/tc6_xml_v200_patched.xsd`.
It was read locally, not copied into this package. Vendor warnings are bounded in
tool output with total counts retained.

## Failures encountered and resolved

- The original `npm test` was an intentional failing placeholder. Replaced it
  with the build plus real Node test suite.
- Adding the interface manifest exposed a TypeScript/Zod inferred optional-field
  mismatch in the repository's non-strict TypeScript configuration. Corrected
  the validated input type; final build/tests pass.
- .NET reported lax CODESYS vendor payloads as warnings; the first validator
  treated all events as blocking. Separated warnings/errors, retained undeclared
  root rejection and added regression checks.
- Initial standard-only semantic traversal saw empty `<types><pous/>` in full
  CODESYS exports while actual POUs were embedded under vendor resource data.
  Extended traversal, applied duplicate-name checks per resource/application and
  added a regression case. Actual embedded POU counts are shown above.

## Actual SP22 Patch 4 verification after bridge connection

Executable 3.5.22.40; ScriptEngine 4.2.0.0; visualization plugin 4.10.0.0.
Primary test copy: `C:/CODESYS_AI/TestProjects/HMI_Tre_Cylindrar_1_1_3.project`.
An untouched disk copy was made as `HybridRuntimeVerification/BeforeHybridRuntime.project`.
No PLC login/download/start/stop/online variable write was performed.

- Actual packaged MCP diagnostics: original and repaired builds **0 errors / 18
  existing library-image warnings**. Invalid native library-warning GUID locations
  are recorded per message without losing the report. Compiler errors produced
  failed status, codes, object paths and position text. Test wrapper errors were
  corrected; no failing original logic was rewritten.
- Actual symbols/references: GVL_HMI has 24 candidates, bounded results report
  truncation; xHmiStart declaration found; entire textual scan had no read failures.
  Native declaration containing Swedish characters/en dash serialized correctly.
- Prepared/imported `Hybrid_Verify_LD`, `_FBD`, `_SFC` through matching XSD and
  semantic gates. Exported each back to XML. LD/FBD were instantiated by a temporary
  ST wrapper; SFC was temporarily called in Task. Called build passed 0/18 and
  returned signatures LD 3803411359, FBD 26405518, SFC 462773767. These prove code
  generation, not functional execution. Existing-name import was rejected.
- Created a 4-element HMI with Unicode title, GVL_HMI.xHmiStart tap, editable
  GVL_HMI.iAntal and Screen_1 navigation. Readback matched text/positions/bindings;
  native export retained input/navigation payload. Existing-page collision rejected.
  Read existing Screen_1: 73 elements. Visual layout and actual clicks remain untested.
- Live wrong-project request rejected before submission. A single read-only 2-second
  delay with 1-second timeout reported uncertainty, did not retry, and its matching
  late successful result was inspected (`bridge-controls.json`). Offline tests
  cover disconnected/stale targets and absence of duplicate submission.
- Restored the first automatic native backup into a separate secondary project;
  primary remained open. Object trees matched (27 objects), Screen_1/Screen_2 kept
  73/101 elements. CODESYS comparison initially showed three changed tasks:
  native import changed Core2/core_binding -1 to -2. After restoring original
  bindings, comparison returned **no changed objects**. The import API returned
  `no_changes` despite populating the new project; actual tree/comparison was used
  as evidence instead of this enum alone.
- Test POUs/page were removed; original Task call order and CPU binding restored;
  original GlobalTextList restored. A cyclic Task's serialized EventPOUGuid changed
  during testing; its event GUID accessor was unavailable, so byte-for-byte identity
  of the active test copy is not claimed. Original disk backup remains untouched.

Raw MCP responses, roundtrip XML, control/recovery reports and the full native
snapshot containing test objects are under
`C:/CODESYS_AI/TestProjects/HybridRuntimeVerification/`.
Key evidence: `1791692478314-compile_project_diagnostics.json` (called graphics),
`1791692494417-read_visualization.json` (Unicode HMI),
`1791692923535-compile_project_diagnostics.json` (final cleanup build),
`native-recovery-check.json`, and `VerifiedWithTestObjects.export`.
`tests/manual-runtime.cjs` is a local explicit verification helper, excluded from
the package, not an automatic test that modifies a project.

## Runtime fixes found by these tests

- Build category must be System.Guid; .NET message integers need conversion;
  project-root path traversal must stop before get_name; invalid warning locations
  must not abort collection.
- Symbol/diagnostic tools use the configured existing bridge with an exact project
  guard, retaining the CLI path when no bridge is configured. Core tools unchanged.
- Native IronPython strings reported str despite non-ASCII contents. UTF-8 JSON
  through .NET/base64 prevents bridge ASCII-coercion failures, including HMI text.
- Namespace stripping discarded xmlns and blocked valid imports. Root namespace
  is retained, including prefixed/empty roots, with a regression test.
- Temporary direct calls to LD/FBD function-block types and reserved ST name `ld`
  caused expected compiler failures; a correctly named instantiated ST wrapper
  repaired the fixture. Task call removal did not take effect through the exposed
  collection API; original Task was restored with native conflict handling instead.

## Exactly what remains local/manual

1. Inspect LD/FBD/SFC graphical editors/connections and HMI layout visually.
2. Test HMI tap, editable value and navigation in local simulation; existing pages
   and Visualization Manager/WebVisu must remain usable.
3. Run Tre cylindrar: timer pause/resume, cycle limit/count, sensor acknowledgements
   and start/stop/step behavior. No functional simulator sequence has been run.
4. Check physical I/O on the intended controller if that is in scope.
5. For further native recovery, compare tasks and restore original core bindings
   if SP22 normalizes them. Do not treat raw import success as exact equivalence.

No zero-warning fixture or manual Build-pane comparison was performed. Method/
property/shadowing scans beyond unit fixtures and other CODESYS versions remain
unverified. These limits are separate from the completed IDE integration tests.
