import { readFile, mkdir, writeFile, rename } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export async function bridgeStatus(directory: string) {
    if (!directory) return { connected: false, reason: 'Set CODESYS_BRIDGE_DIR to the existing script bridge directory' };
    try {
        const data = JSON.parse(await readFile(path.join(directory, 'status.json'), 'utf8'));
        const age = Date.now() / 1000 - data.heartbeat;
        return { ...data, connected: Number.isFinite(age) && age >= 0 && age < 5 };
    } catch (e: any) { return { connected: false, reason: e.message }; }
}
export async function runBridge(directory: string, projectFilePath: string, code: string, timeoutSeconds = 30): Promise<any> {
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 45) throw new Error('Bridge timeout must be 1..45 seconds');
    const status: any = await bridgeStatus(directory);
    const normalize = (p: string) => path.resolve(p).toLowerCase();
    if (!status.connected || !status.project_path || normalize(status.project_path) !== normalize(projectFilePath)) throw new Error('Existing IDE bridge must be connected with the requested project open; no request submitted');
    const id = randomUUID().replace(/-/g, '');
    const queue = path.join(directory, 'queue');
    await mkdir(queue, { recursive: true });
    const temporary = path.join(queue, id + '.tmp');
    await writeFile(temporary, JSON.stringify({ id, operation: 'run_script', code, session: status.session, project_path: status.project_path, expires: Date.now() / 1000 + timeoutSeconds }), { flag: 'wx' });
    await rename(temporary, path.join(queue, id + '.json'));
    const resultPath = path.join(directory, 'results', id + '.json');
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
        let response: any;
        try { response = JSON.parse(await readFile(resultPath, 'utf8')); }
        catch (e: any) { if (e.code !== 'ENOENT') throw e; }
        if (response) {
            if (response.id !== id) throw new Error(`Mismatched bridge result ${resultPath}; inspect before retrying`);
            if (response.ok !== true) throw new Error(`Bridge request ${id} failed: ${response.error}; inspect project before retrying`);
            return response.result;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Bridge request ${id} timed out. Execution may have begun. Inspect ${resultPath} and project before retrying; no automatic retry performed.`);
}

export function pythonValue(value: any) {
    const encoded = JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    return `json.loads(${JSON.stringify(encoded)})`;
}
export function projectGuard(projectFilePath: string, parentPath: string) {
    return `import json, os\nproject = projects.primary\nif not project or os.path.normcase(os.path.abspath(project.path)) != os.path.normcase(os.path.abspath(${pythonValue(projectFilePath)})): raise RuntimeError('Requested project is not primary')\nparent = project\nfor part in ${pythonValue(parentPath.split('/').filter(Boolean))}:\n    matches = [child for child in parent.get_children(False) if child.get_name() == part]\n    if len(matches) != 1: raise RuntimeError('Parent path is missing or ambiguous: ' + part)\n    parent = matches[0]\n`;
}
