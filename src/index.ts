#!/usr/bin/env node

/**
 * Application entry point for cBioPortal Navigator MCP server.
 *
 * This file initializes the MCP server with support for two transport modes:
 * stdio mode for local Claude Desktop integration, and HTTP mode for remote
 * deployments like LibreChat. The transport mode is determined by the
 * MCP_TRANSPORT environment variable, defaulting to stdio.
 *
 * @remarks
 * Key components:
 * - `startStdio()`: Starts MCP server with StdioServerTransport for Claude Desktop
 * - `startHttp()`: Starts Express server with StreamableHTTPServerTransport for remote clients
 * - `main()`: Entry point that selects transport mode based on environment
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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import { setConfig } from './shared/utils/config.js';
import { createMcpServer } from './server.js';

/**
 * Start server in stdio mode (for Claude Desktop)
 */
async function startStdio() {
    // Configure base URL from environment
    if (process.env.CBIOPORTAL_BASE_URL) {
        setConfig({
            baseUrl: process.env.CBIOPORTAL_BASE_URL,
        });
    }

    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('cBioPortal Navigator running on stdio');
    console.error(
        `Base URL: ${process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org'}`
    );

    // Handle cleanup
    process.on('SIGINT', async () => {
        await server.close();
        process.exit(0);
    });
}

/**
 * Start server in HTTP mode (for LibreChat and other remote clients)
 */
async function startHttp() {
    // Configure base URL from environment
    if (process.env.CBIOPORTAL_BASE_URL) {
        setConfig({
            baseUrl: process.env.CBIOPORTAL_BASE_URL,
        });
    }

    const app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            service: 'cbioportal-navigator',
            version: '1.0.0',
            baseUrl:
                process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org',
        });
    });

    // MCP endpoint with Streamable HTTP transport
    app.all('/mcp', async (req, res) => {
        try {
            // Create new server and transport for each request (stateless mode)
            const server = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // Stateless
                enableJsonResponse: true,
            });

            // Clean up on response close
            res.on('close', () => {
                transport.close();
            });

            // Connect and handle request
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('Error handling MCP request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    });

    const port = parseInt(process.env.PORT || '8002');
    app.listen(port, () => {
        console.log(`cBioPortal Navigator HTTP server running`);
        console.log(`MCP endpoint: http://localhost:${port}/mcp`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(
            `Base URL: ${process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org'}`
        );
    });
}

/**
 * Main entry point
 */
async function main() {
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
