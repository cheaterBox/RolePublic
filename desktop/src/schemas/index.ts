import { z } from 'zod';

/**
 * Common validation helpers
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => `[${issue.path.join('.') || 'root'}]: ${issue.message}`)
    .join('; ');
}

export function safeValidate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  fallback: T,
  context: string = 'Data'
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn(`[ZodValidationWarning] ${context} failed validation: ${formatZodError(result.error)}. Using fallback.`, data);
  return fallback;
}

export function validateOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string = 'Data'
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const formatted = formatZodError(result.error);
  console.error(`[ZodValidationError] ${context} failed validation: ${formatted}`, data);
  throw new Error(`[Validation Error] ${context}: ${formatted}`);
}

// -------------------------------------------------------------
// 1. Job Schemas
// -------------------------------------------------------------
export const JobParsedDetailsSchema = z.object({
  company_name: z.string().catch('Untitled Company'),
  job_title: z.string().catch('Untitled Position'),
  work_model: z.string().catch('On-site'),
  employment_type: z.string().catch('Full-time'),
  requirements: z.array(z.string()).catch([]),
  core_responsibilities: z.array(z.string()).catch([])
});

export const JobParseResultSchema = z.object({
  details: JobParsedDetailsSchema,
  raw_description: z.string().optional()
});

export const JobSchema = z.object({
  id: z.string(),
  company_name: z.string().catch('Untitled Company'),
  job_title: z.string().catch('Untitled Position'),
  work_model: z.string().catch('On-site'),
  employment_type: z.string().catch('Full-time'),
  status: z.string().catch('Drafting'),
  raw_jd: z.string().catch(''),
  requirements: z.string().nullable().optional(),
  core_responsibilities: z.string().nullable().optional(),
  custom_instruction: z.string().nullable().optional(),
  reference_name: z.string().nullable().optional(),
  reference_email: z.string().nullable().optional(),
  social_link: z.string().nullable().optional(),
  job_url: z.string().nullable().optional(),
  base_resume_id: z.string().nullable().optional(),
  base_cl_id: z.string().nullable().optional(),
  salary: z.string().nullable().optional(),
  applied_date: z.string().nullable().optional(),
  interview_date: z.string().nullable().optional(),
  offer_date: z.string().nullable().optional(),
  rejected_date: z.string().nullable().optional(),
  joining_date: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional()
});

export const JobListSchema = z.array(JobSchema);

export type Job = z.infer<typeof JobSchema>;
export type JobParsedDetails = z.infer<typeof JobParsedDetailsSchema>;
export type JobParseResult = z.infer<typeof JobParseResultSchema>;

// -------------------------------------------------------------
// 2. Resume Schemas
// -------------------------------------------------------------
export const BaseResumeSchema = z.object({
  id: z.string(),
  name: z.string().catch('Untitled Resume'),
  category: z.string().catch('General'),
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().catch(() => new Date().toISOString())
});

export const ResumeDetailSchema = BaseResumeSchema.extend({
  latex_content: z.string().catch('')
});

export const ResumeListSchema = z.array(BaseResumeSchema);

export type BaseResume = z.infer<typeof BaseResumeSchema>;
export type ResumeDetail = z.infer<typeof ResumeDetailSchema>;

// -------------------------------------------------------------
// 3. Cover Letter Schemas
// -------------------------------------------------------------
export const BaseCoverLetterSchema = z.object({
  id: z.string(),
  name: z.string().catch('Untitled Cover Letter'),
  category: z.string().catch('General'),
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().catch(() => new Date().toISOString())
});

export const CoverLetterDetailSchema = BaseCoverLetterSchema.extend({
  latex_content: z.string().catch('')
});

export const CoverLetterListSchema = z.array(BaseCoverLetterSchema);

export type BaseCoverLetter = z.infer<typeof BaseCoverLetterSchema>;
export type CoverLetterDetail = z.infer<typeof CoverLetterDetailSchema>;

// -------------------------------------------------------------
// 4. HR Message Template Schemas
// -------------------------------------------------------------
export const HrMessageTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Template name is required'),
  category: z.string().catch('Outreach'),
  content: z.string().min(1, 'Template content is required'),
  is_builtin: z.boolean().optional().default(false),
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().catch(() => new Date().toISOString())
});

export const HrMessageTemplateListSchema = z.array(HrMessageTemplateSchema);

export type HrMessageTemplate = z.infer<typeof HrMessageTemplateSchema>;

// -------------------------------------------------------------
// 5. Tailored Content Schema
// -------------------------------------------------------------
export const TailoredContentSchema = z.object({
  id: z.string(),
  base_template_id: z.string().nullable().optional().catch(''),
  content: z.string().catch('')
});

export type TailoredContent = z.infer<typeof TailoredContentSchema>;

// -------------------------------------------------------------
// 6. License Status Schemas
// -------------------------------------------------------------
export const LicenseStatusSchema = z.object({
  activated: z.boolean().catch(false),
  valid: z.boolean().catch(false),
  status: z.string().catch('none'),
  trial: z.boolean().catch(false),
  trial_ends_at: z.string().nullable().catch(null),
  expires_at: z.string().nullable().catch(null),
  customer_name: z.string().nullable().catch(null),
  customer_email: z.string().nullable().catch(null),
  license_key: z.string().nullable().catch(null),
  instance_id: z.string().nullable().optional().catch(null)
});

export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

// -------------------------------------------------------------
// 7. Match Score Schemas
// -------------------------------------------------------------
export const MatchBreakdownSchema = z.object({
  overall: z.number().catch(0),
  skills_score: z.number().catch(0),
  tfidf_score: z.number().catch(0),
  jaccard_score: z.number().catch(0),
  present_skills: z.array(z.string()).catch([]),
  missing_skills: z.array(z.string()).catch([]),
  weak_skills: z.array(z.string()).catch([]),
  jd_skill_count: z.number().catch(0),
  resume_skill_count: z.number().catch(0),
  jd_token_count: z.number().catch(0),
  resume_token_count: z.number().catch(0)
});

export type MatchBreakdown = z.infer<typeof MatchBreakdownSchema>;

// -------------------------------------------------------------
// 8. Document Summary Schemas
// -------------------------------------------------------------
export const DocumentSummarySchema = z.object({
  id: z.string(),
  title: z.string().catch('Untitled Document'),
  description: z.string().catch(''),
  tags: z.string().catch(''),
  starred: z.boolean().catch(false),
  main_file: z.string().nullable().catch(null),
  last_compiled_at: z.string().nullable().catch(null),
  compile_status: z.enum(['success', 'error']).nullable().catch(null),
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().catch(() => new Date().toISOString())
});

export const DocumentListSchema = z.array(DocumentSummarySchema);

export const DocumentFileEntrySchema = z.object({
  rel_path: z.string(),
  size_bytes: z.number().catch(0),
  updated_at: z.string().catch(() => new Date().toISOString())
});

export const DocumentFileListSchema = z.array(DocumentFileEntrySchema);

export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;
export type DocumentFileEntry = z.infer<typeof DocumentFileEntrySchema>;

// -------------------------------------------------------------
// 9. Theme Schemas
// -------------------------------------------------------------
export const ThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: z.string(),
  is_builtin: z.boolean().catch(false)
});

export const ThemeListSchema = z.array(ThemeSchema);

export type Theme = z.infer<typeof ThemeSchema>;

// -------------------------------------------------------------
// 10. Inbox & Extension Schemas
// -------------------------------------------------------------
export const InboxJobSchema = z.object({
  id: z.string(),
  url: z.string().nullable().catch(null),
  raw_description: z.string().catch(''),
  status: z.enum(['Pending', 'Processed']).catch('Pending'),
  created_at: z.string().catch(() => new Date().toISOString()),
});

export const InboxJobListSchema = z.array(InboxJobSchema);
export type InboxJob = z.infer<typeof InboxJobSchema>;

export const ExtensionConfigSchema = z.object({
  secret: z.string().catch(''),
  port: z.string().catch(''),
});
export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>;

export const CustomThemeImportSchema = z.object({
  name: z.string().min(1, 'Theme name is required'),
  colors: z.record(z.string(), z.string())
});
export type CustomThemeImport = z.infer<typeof CustomThemeImportSchema>;

// -------------------------------------------------------------
// 11. Outreach Lead Schemas
// -------------------------------------------------------------
export const OutreachLeadSchema = z.object({
  id: z.string(),
  person_name: z.string().catch(''),
  profile_url: z.string().catch(''),
  headline: z.string().nullable().optional().catch(null),
  raw_bio: z.string().catch(''),
  recent_posts: z.array(z.string()).catch([]),
  template_id: z.string().nullable().optional().catch(null),
  char_limit: z.number().catch(250),
  tailored_message: z.string().nullable().optional().catch(null),
  status: z.string().catch('Draft'),
  created_at: z.string().nullable().optional().catch(null),
  updated_at: z.string().nullable().optional().catch(null),
});

export const OutreachLeadListSchema = z.array(OutreachLeadSchema);

export type OutreachLead = z.infer<typeof OutreachLeadSchema>;

// -------------------------------------------------------------
// 12. Error Audit Schemas
// -------------------------------------------------------------
export const ErrorAuditLogSchema = z.object({
  id: z.string(),
  task_type: z.string().catch('general'),
  error_type: z.string().catch('GeneralError'),
  message: z.string().catch(''),
  details: z.string().nullable().optional().catch(null),
  source: z.string().nullable().optional().catch(null),
  created_at: z.string().catch(''),
});

export const ErrorAuditLogListSchema = z.array(ErrorAuditLogSchema);

export type ErrorAuditLog = z.infer<typeof ErrorAuditLogSchema>;

export const ErrorLogStatsSchema = z.object({
  total: z.number().catch(0),
  by_task: z.record(z.string(), z.number()).catch({}),
});

export type ErrorLogStats = z.infer<typeof ErrorLogStatsSchema>;

