import { z } from "zod";

/**
 * Input schema for the generate_ecosystem_audit_report tool.
 */
export const generateEcosystemAuditReportSchema = z.object({
  timeframe: z.string().describe("The timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'."),
  focus_area: z.enum(["communications", "policy_changes", "morphology_adjustments", "all"]).optional().default("all")
});

/**
 * Type inferred from the generateEcosystemAuditReportSchema.
 */
export type GenerateEcosystemAuditReportInput = z.infer<typeof generateEcosystemAuditReportSchema>;

/**
 * Interface representing a synthesized insight from the audit logs.
 */
export interface AuditInsight {
  category: string;
  description: string;
  evidence: string[]; // List of report IDs or specific log entries that support the insight
}

/**
 * Interface representing a recommendation based on audit insights.
 */
export interface AuditRecommendation {
  action: string;
  rationale: string;
  expected_impact: string;
}

/**
 * Interface representing the complete ecosystem audit report output.
 */
export interface EcosystemAuditReport {
  report_id: string;
  timeframe: string;
  focus_area: string;
  summary: string;
  communication_patterns: AuditInsight[];
  policy_evolution: AuditInsight[];
  morphology_changes: AuditInsight[];
  anomalies: AuditInsight[];
  recommendations: AuditRecommendation[];
  raw_events_analyzed: number;
}
