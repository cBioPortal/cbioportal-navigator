/**
 * Gene symbol validation and resolution.
 *
 * Validates gene symbols (Hugo gene symbols or Entrez IDs) against the
 * cBioPortal API. Supports single validation, batch validation, and
 * resolving Hugo symbols to Entrez Gene IDs for URL construction.
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
 * - `resolveToEntrezId(symbolOrId)`: Resolve Hugo symbol to Entrez ID string
 * - `resolvePlotsGene(selection)`: Resolve selectedGeneOption in a plots selection object
 *
 * Normalization:
 * All gene symbols are automatically normalized to uppercase for consistency
 * with cBioPortal conventions.
 *
 * @packageDocumentation
 */

import { apiClient } from './cbioportalClient.js';

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

    /**
     * Resolve a gene symbol or numeric string to an Entrez Gene ID string.
     * If input is already numeric (e.g. "3417"), returns it unchanged.
     * Otherwise looks up the symbol and returns entrezGeneId as a string.
     */
    async resolveToEntrezId(symbolOrId: string): Promise<string> {
        if (/^\d+$/.test(symbolOrId)) return symbolOrId;
        const gene = await this.getGeneInfo(symbolOrId);
        return String(gene.entrezGeneId);
    }

    /**
     * If a plots selection has a non-numeric selectedGeneOption (i.e. a Hugo symbol),
     * resolve it to an Entrez Gene ID string before building the URL.
     */
    async resolvePlotsGene<T extends { selectedGeneOption?: string }>(
        selection: T | undefined
    ): Promise<T | undefined> {
        if (!selection?.selectedGeneOption) return selection;
        if (/^\d+$/.test(selection.selectedGeneOption)) return selection;
        const entrezId = await this.resolveToEntrezId(
            selection.selectedGeneOption
        );
        return { ...selection, selectedGeneOption: entrezId };
    }
}

export const geneResolver = new GeneResolver();
