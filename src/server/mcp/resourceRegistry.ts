/**
 * MCP Resources Registry.
 *
 * Central registration point for all MCP resources in the cBioPortal Navigator.
 * This module imports all resource definitions and registers them with the MCP server.
 *
 * @packageDocumentation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { clinicalAttributesResource } from '../../domain/studyView/resources/clinicalAttributes.js';
import { caseListsResource } from '../../domain/studyView/resources/caseLists.js';
import { molecularProfilesResource } from '../../domain/studyView/resources/molecularProfiles.js';

/**
 * Register all MCP resources with the server.
 *
 * This function is called during server initialization to make resources
 * available to MCP clients.
 *
 * @param server - The MCP server instance
 */
export function registerResources(server: McpServer): void {
    // Register StudyView filter metadata resources
    server.registerResource(
        clinicalAttributesResource.name,
        clinicalAttributesResource.uriTemplate,
        clinicalAttributesResource.metadata,
        clinicalAttributesResource.handler
    );

    server.registerResource(
        caseListsResource.name,
        caseListsResource.uriTemplate,
        caseListsResource.metadata,
        caseListsResource.handler
    );

    server.registerResource(
        molecularProfilesResource.name,
        molecularProfilesResource.uriTemplate,
        molecularProfilesResource.metadata,
        molecularProfilesResource.handler
    );
}
