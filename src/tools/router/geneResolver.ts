/**
 * Gene symbol validation resolver.
 *
 * This module validates gene symbols (Hugo gene symbols or Entrez IDs) against
 * the cBioPortal API. It supports both single gene validation and batch
 * validation with automatic filtering of invalid genes, ensuring that only
 * valid gene symbols are used in URL construction.
 *
 * @remarks
 * Key exports:
 * - `GeneResolver`: Class with validation and retrieval methods
 * - `geneResolver`: Singleton instance for convenient access
 *
 * Methods:
 * - `validate(geneSymbol)`: Check if a single gene symbol is valid
 * - `validateBatch(geneSymbols)`: Validate multiple genes, return only valid ones
 * - `getGeneInfo(geneSymbol)`: Retrieve detailed gene information
 *
 * Normalization:
 * All gene symbols are automatically normalized to uppercase for consistency
 * with cBioPortal conventions.
 *
 * Batch validation:
 * Rather than failing on invalid genes, validateBatch filters them out and
 * returns only valid ones, allowing requests to proceed with partial matches.
 *
 * @packageDocumentation
 */

import { apiClient } from '../shared/cbioportalClient.js';

export class GeneResolver {
    /**
     * Validate if a gene symbol exists
     */
    async validate(geneSymbol: string): Promise<boolean> {
        const normalizedSymbol = geneSymbol.toUpperCase();

        try {
            await apiClient.getGene(normalizedSymbol);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate multiple gene symbols
     * Returns only the valid genes
     */
    async validateBatch(geneSymbols: string[]): Promise<string[]> {
        const results = await Promise.all(
            geneSymbols.map(async (gene) => {
                const normalized = gene.toUpperCase();
                const isValid = await this.validate(normalized);
                return isValid ? normalized : null;
            })
        );

        return results.filter((g): g is string => g !== null);
    }

    /**
     * Get gene details
     */
    async getGeneInfo(geneSymbol: string) {
        const normalized = geneSymbol.toUpperCase();
        return await apiClient.getGene(normalized);
    }
}

export const geneResolver = new GeneResolver();
