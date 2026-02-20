/**
 * Client for creating ResultsView (main) sessions.
 *
 * ResultsView supports session-based URL sharing via POST /api/session/main_session.
 * When case_ids is large (many filtered samples), storing the query in a session
 * avoids URL length limits. The resulting URL is /results?session_id={id}.
 *
 * Based on cbioportal-frontend URLWrapper.ts session creation logic.
 *
 * @packageDocumentation
 */

/**
 * Query parameters stored in a main session.
 * Mirrors the formOps object built in StudyViewPageStore.onSubmitQuery().
 */
export interface MainSessionData {
    cancer_study_list: string;
    gene_list: string;
    case_set_id: string;
    /** studyId:sampleId entries joined by '+' */
    case_ids?: string;
    tab_index?: string;
    Action?: string;
    profileFilter?: string;
    Z_SCORE_THRESHOLD?: string;
    RPPA_SCORE_THRESHOLD?: string;
}

export interface MainSessionResponse {
    id: string;
}

export class MainSessionClient {
    constructor(private baseUrl: string) {}

    /**
     * Create a main session and return its ID.
     *
     * @param data - Query parameters to store
     * @returns Session ID for URL construction
     * @throws Error if session creation fails
     */
    async createSession(data: MainSessionData): Promise<MainSessionResponse> {
        const url = `${this.baseUrl}/api/session/main_session`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to create main session (${response.status}): ${errorText}`
            );
        }

        return (await response.json()) as MainSessionResponse;
    }
}
