/**
 * Gene Resolver
 * Handles gene symbol validation
 */

import { apiClient } from '../api/client.js';

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
