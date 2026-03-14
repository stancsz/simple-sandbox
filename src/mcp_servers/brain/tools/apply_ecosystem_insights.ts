import { EpisodicMemory } from "../../../brain/episodic.js";
import { analyzeEcosystemPatterns } from "./pattern_analysis.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Extracts meta-learning insights from the ecosystem and filters/personalizes
 * them for a specific company context.
 *
 * @param company_id The target company context to personalize insights for.
 * @param episodicMemory An instance of EpisodicMemory to query global patterns.
 * @param llm An LLM instance.
 * @param insight_type Optional filter (e.g., 'efficiency', 'cost_optimization').
 * @returns A structured string/JSON containing the personalized insights.
 */
export async function personalize_company_context(
    company_id: string,
    episodicMemory: EpisodicMemory,
    llm: any,
    insight_type?: string
): Promise<string> {
    // 1. Retrieve the global meta-learning insights from the ecosystem
    // analyzeEcosystemPatterns queries the episodic memory for success/failure patterns
    const globalPatterns = await analyzeEcosystemPatterns(episodicMemory, llm);

    // 2. Fetch the company's current context
    let companyContext = "";
    try {
        const companyContextSrc = join(process.cwd(), "src", "mcp_servers", "company_context.ts");
        const companyContextDist = join(process.cwd(), "dist", "mcp_servers", "company_context.js");
        let cmd = "node";
        let clientArgs = [companyContextDist];
        if (existsSync(companyContextSrc) && !existsSync(companyContextDist)) {
           cmd = "npx";
           clientArgs = ["tsx", companyContextSrc];
        }

        const transport = new StdioClientTransport({ command: cmd, args: clientArgs });
        const ccClient = new Client({ name: "brain-to-cc-fetch", version: "1.0.0" }, { capabilities: {} });
        await ccClient.connect(transport);

        const result: any = await ccClient.callTool({
           name: "query_company_context",
           arguments: { company_id: company_id, query: "company overview strategic goals industry tech stack" }
        });
        await ccClient.close();

        if (!result.isError && result.content && result.content.length > 0) {
            companyContext = result.content[0].text;
        } else {
            companyContext = "No detailed context found. Rely on general best practices.";
        }
    } catch (e) {
        companyContext = "Failed to fetch detailed context. Rely on general best practices.";
    }

    let typeFilterPrompt = "";
    if (insight_type) {
        typeFilterPrompt = `\nFocus specifically on insights related to: ${insight_type}.`;
    }

    const systemPrompt = "You are a senior strategic advisor. Your task is to analyze global ecosystem patterns and extract actionable meta-learning insights specifically tailored for a target company.";
    const userPrompt = `
Analyze the following global ecosystem patterns (meta-learning insights extracted from our multi-agency fleet):

${JSON.stringify(globalPatterns, null, 2)}

Here is the current context for the company "${company_id}":
---
${companyContext}
---

Your task is to extract, filter, and adapt the global insights into a personalized 'Company Context Update' tailored specifically to this company's industry, tech stack, and strategic goals.${typeFilterPrompt}

Provide the output as a clear, concise summary of actionable recommendations and insights that will be injected directly into the company's memory vector store (RAG). The text should be written such that an agent retrieving it later will understand exactly how to apply the global learnings to this specific context. Focus on actionable directives.
`;

    // 3. Generate personalized insights via LLM
    const response = await llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);

    return response;
}
