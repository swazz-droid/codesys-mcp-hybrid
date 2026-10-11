import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'path';
import { readFile } from 'fs/promises';
import { validateSemantic, validateXsd } from './hybrid-validation';
import { routeOperation } from './hybrid-guidance';

export const reply = (data: any, failed = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], isError: failed });
export function registerHybridTools(server: McpServer, workspace: string) {
    const resolve = (file: string) => path.resolve(workspace, file);
    server.tool('get_workflow_guidance', 'Choose the smallest useful hybrid workflow; call only when the route is unclear.', {
        operation: z.enum(['st', 'backup', 'transfer', 'graphical', 'hmi', 'diagnostics', 'intelligence'])
    }, async ({ operation }) => reply(routeOperation(operation)));
    server.tool('validate_plcopen_xsd', 'Validate PLCopen XML against a local schema using Windows .NET. No downloads or CODESYS launch. Follow with semantic validation.', {
        filePath: z.string(), xsdPath: z.string().describe('Local PLCopen XSD matching the XML namespace; required because schema redistribution terms are unverified')
    }, async ({ filePath, xsdPath }) => {
        try { const report = await validateXsd(resolve(filePath), resolve(xsdPath)); return reply({ ...report, next: report.valid ? 'validate_plcopen_semantic' : 'Repair schema/XML and repeat XSD validation' }, !report.valid); }
        catch (e: any) { return reply({ valid: false, error: e.message }, true); }
    });
    server.tool('validate_plcopen_semantic', 'Check project-based PLCopen POU names, declarations, LD/FBD/SFC local IDs/connections and expected POU presence. Partial exports and external library types are allowed. Does not prove runtime correctness.', {
        filePath: z.string(), expectedPous: z.array(z.string()).optional(), externalTypes: z.array(z.string()).optional()
    }, async ({ filePath, expectedPous, externalTypes }) => {
        try { const report = validateSemantic(await readFile(resolve(filePath), 'utf8'), expectedPous, externalTypes); return reply(report, !report.valid); }
        catch (e: any) { return reply({ valid: false, error: e.message }, true); }
    });
}
