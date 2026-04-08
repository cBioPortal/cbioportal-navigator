#!/usr/bin/env node

/**
 * Application entry point for cBioPortal Navigator MCP server.
 *
 * Supports two transport modes:
 * - stdio mode for local Claude Desktop integration
 * - HTTP mode for remote MCP clients (Streamable HTTP transport)
 *
 * Environment variables:
 * - `MCP_TRANSPORT`: Transport mode ('stdio' or 'http'), defaults to 'stdio'
 * - `CBIOPORTAL_BASE_URL`: Base URL for cBioPortal instance, defaults to https://www.cbioportal.org
 * - `PORT`: HTTP server port, defaults to 8002 (HTTP mode only)
 *
 * HTTP mode endpoints:
 * - `GET /health`: Health check endpoint returning service status
 * - `POST /mcp`: MCP protocol endpoint for tool invocations
 *
 * @packageDocumentation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import { setConfig } from './tools/shared/config.js';
import { initPrompts } from './tools/shared/promptLoader.js';
import { registerTools } from './toolRegistry.js';

function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'cbioportal-navigator',
        version: '1.0.0',
    });
    registerTools(server);
    return server;
}

async function startStdio() {
    if (process.env.CBIOPORTAL_BASE_URL) {
        setConfig({ baseUrl: process.env.CBIOPORTAL_BASE_URL });
    }

    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('cBioPortal Navigator running on stdio');
    console.error(
        `Base URL: ${process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org'}`
    );

    process.on('SIGINT', async () => {
        await server.close();
        process.exit(0);
    });
}

async function startHttp() {
    if (process.env.CBIOPORTAL_BASE_URL) {
        setConfig({ baseUrl: process.env.CBIOPORTAL_BASE_URL });
    }

    const app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            service: 'cbioportal-navigator',
            version: '1.0.0',
        });
    });

    app.all('/mcp', async (req, res) => {
        try {
            const server = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true,
            });

            res.on('close', () => {
                transport.close();
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('Error handling MCP request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null,
                });
            }
        }
    });

    const port = parseInt(process.env.PORT || '8002');
    const server = app.listen(port, () => {
        console.log(`cBioPortal Navigator HTTP server running`);
        console.log(`MCP endpoint: http://localhost:${port}/mcp`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(
            `Base URL: ${process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org'}`
        );
    });

    process.on('SIGTERM', async () => {
        server.close(() => process.exit(0));
    });

    process.on('SIGINT', async () => {
        server.close(() => process.exit(0));
    });
}

async function main() {
    initPrompts();

    const mode = process.env.MCP_TRANSPORT || 'stdio';
    if (mode === 'http') {
        console.log('Starting in HTTP mode (Streamable HTTP transport)');
        await startHttp();
    } else {
        console.error('Starting in stdio mode (for Claude Desktop)');
        await startStdio();
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
