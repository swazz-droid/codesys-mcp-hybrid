import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'path';
import { readFile } from 'fs/promises';
import { validateSemantic, validateXsd, ExpectedVariable } from './hybrid-validation';
import { routeOperation } from './hybrid-guidance';
import { collectSourcesScript, getSymbols, findReferences } from './hybrid-intelligence';

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
        filePath: z.string(), expectedPous: z.array(z.string()).optional(), externalTypes: z.array(z.string()).optional(),
        expectedVariables: z.record(z.array(z.object({name:z.string(),type:z.string().optional(),initialValue:z.string().optional()}))).optional().describe('Optional per-POU interface manifest to detect omitted variables/types/simple initializers without an ST sidecar')
    }, async ({ filePath, expectedPous, externalTypes, expectedVariables }) => {
        try { const report = validateSemantic(await readFile(resolve(filePath), 'utf8'), expectedPous, externalTypes, expectedVariables as Record<string, ExpectedVariable[]>); return reply(report, !report.valid); }
        catch (e: any) { return reply({ valid: false, error: e.message }, true); }
    });
}

export type ProjectRunner = (projectFilePath: string, body: string) => Promise<any>;
const decodeSources = (data: any) => data.sourceJsonBase64 ? JSON.parse(Buffer.from(data.sourceJsonBase64, 'base64').toString('utf8')) : data;
export function registerIntelligenceTools(server: McpServer, run: ProjectRunner) {
    const schema = { projectFilePath: z.string(), scope: z.string().optional().describe('Exact slash-separated path or subtree; reduces response size'), maxResults: z.number().int().min(1).max(1000).default(100) };
    server.tool('get_symbols', 'Read project textual objects and list simple VAR declarations. Results are candidates, not compiler symbols. Narrow scope and reuse results until edits.', schema,
        async ({ projectFilePath, scope, maxResults }) => {
            try { const data = decodeSources(await run(projectFilePath, collectSourcesScript)); return reply({ ...getSymbols(data.objects, maxResults, scope), readFailures: data.readFailures, runtimeVerified: true, verifiedProfile: 'CODESYS V3.5 SP22 Patch 4; textual candidates only' }); }
            catch (e: any) { return reply({error:e.message},true); }
        });
    server.tool('find_references', 'Find case-insensitive identifier candidates in project text, ignoring comments/strings. Includes declarations; excludes graphical/HMI/task bindings. Does not prove symbol resolution.', {
        ...schema, symbol: z.string().regex(/^[A-Za-z_]\w*$/)
    }, async ({ projectFilePath, symbol, scope, maxResults }) => {
        try { const data = decodeSources(await run(projectFilePath, collectSourcesScript)); return reply({ ...findReferences(data.objects, symbol, maxResults, scope), readFailures: data.readFailures, runtimeVerified: true, verifiedProfile: 'CODESYS V3.5 SP22 Patch 4; textual candidates only' }); }
        catch (e: any) { return reply({error:e.message},true); }
    });
}
