export function readEnvelope(output: string, marker = 'HYBRID_RESULT:'): any {
    const lines = output.split(/\r?\n/).filter(line => line.startsWith(marker));
    if (lines.length !== 1) throw new Error(`Expected one ${marker} response, received ${lines.length}; inspect raw output`);
    return JSON.parse(lines[0].slice(marker.length));
}
export function compileReport(output: string, scriptSuccess: boolean) {
    let data: any;
    try { data = readEnvelope(output); } catch (e: any) {
        return { status: scriptSuccess ? 'unknown' : 'failed', diagnosticsAvailable: false, error: e.message, rawOutput: output, next: 'Inspect CODESYS Build messages; no automatic retry after timeout' };
    }
    if (!scriptSuccess || data.collectionError || !data.buildCompleted) return { ...data, status: scriptSuccess ? 'unknown' : 'failed', rawOutput: output };
    const diagnostics = data.diagnostics || [];
    const errors = diagnostics.filter((d: any) => /^(error|fatalerror)$/i.test(d.severity)).length;
    return { ...data, status: errors ? 'failed' : 'passed', errorCount: errors, warningCount: diagnostics.filter((d: any) => /^warning$/i.test(d.severity)).length, next: errors ? 'Fix listed errors and compile once after coherent changes' : 'Verify task bindings and runtime behavior locally' };
}

// ScriptSystem API: https://content.helpme-codesys.com/en/ScriptingEngine/ScriptSystem.html
export const beforeBuild = `
    import json
    from System import Guid
    build_category = Guid('97F48D64-A2A3-4856-B640-75C046E37EA9')
    diagnostic_error = None
    try: system.clear_messages(build_category)
    except Exception as clear_error: diagnostic_error = str(clear_error)
`;
export const afterBuild = `
    diagnostics = []
    try:
        if diagnostic_error: raise RuntimeError(diagnostic_error)
        for message in system.get_message_objects(build_category):
            object_path = None
            position_text = None
            location_error = None
            try:
                obj = message.object
                if obj:
                    parts = []
                    while obj and hasattr(obj, 'get_name'):
                        parts.insert(0, obj.get_name())
                        obj = obj.parent
                    object_path = '/'.join(parts)
                position_text = message.position_text
            except Exception as location_exception: location_error = str(location_exception)
            prefix = str(message.prefix) if message.prefix is not None else None
            number = int(message.number) if message.number is not None else None
            code = (prefix + str(number).zfill(4)) if prefix is not None and number is not None else None
            diagnostics.append({'severity': str(message.severity), 'code': code, 'message': str(message.text), 'objectPath': object_path, 'positionText': str(position_text) if position_text is not None else None, 'position': int(message.position), 'positionOffset': int(message.position_offset), 'locationError': location_error})
    except Exception as collection_error: diagnostic_error = str(collection_error)
    diagnostic_result = {'buildCompleted': True, 'diagnosticsAvailable': diagnostic_error is None, 'collectionError': diagnostic_error, 'diagnostics': diagnostics, 'application': app_name, 'project': PROJECT_FILE_PATH}
    print('HYBRID_RESULT:' + json.dumps(diagnostic_result))
`;
