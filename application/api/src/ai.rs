//! AI provider integration.
//!
//! Supports 9 providers (matching the desktop app) through a single trait
//! so each call site is a one-liner instead of a 9-arm match. The trait is
//! local — providers never see the API key in a log line.
//!
//! SECURITY:
//! - API keys are passed by reference and zeroized on drop inside the rig
//!   clients. We never log the key.
//! - Errors are returned as `String`; routes wrap them in `AppError::Ai`.

use rig::client::CompletionClient;
use rig::completion::Prompt;
use rig::providers::{anthropic, deepseek, gemini, groq, ollama, openai, openrouter};
use serde::{Deserialize, Serialize};

use crate::models::JobDetails;

/// Provider-agnostic completion interface. dyn-compatible (no generic methods).
#[async_trait::async_trait]
trait ProviderAgent: Send + Sync {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String>;
    async fn test(&self, model: &str) -> Result<String, String>;
}

/// Per-provider extraction. Lives outside the trait so each impl can be
/// generic over `T`. The dispatch site is a single match — no duplication.
pub fn normalize_provider(provider: &str) -> String {
    let lower = provider.trim().to_lowercase();
    if lower == "claude" {
        "anthropic".to_string()
    } else {
        lower
    }
}

async fn extract_for<T>(
    provider: &str,
    api_key: &str,
    base_url: Option<&str>,
    model: &str,
    system: &str,
    user: &str,
) -> Result<T, String>
where
    T: schemars::JsonSchema
        + serde::de::DeserializeOwned
        + serde::Serialize
        + Send
        + Sync
        + 'static,
{
    let provider = normalize_provider(provider);
    match provider.as_str() {
        "gemini" => {
            let client = gemini::Client::new(api_key).map_err(|e| e.to_string())?;
            let extractor = client.extractor::<T>(model).preamble(system).build();
            extractor
                .extract(user)
                .await
                .map_err(|e| format!("Gemini AI Error: {}", e))
        }
        "openai" => {
            let client = openai_client(api_key, base_url)?;
            let mut b = client.extractor::<T>(model).preamble(system);
            if base_url.is_some_and(|u| !u.trim().is_empty()) {
                b = b.max_tokens(131072);
            }
            b.build()
                .extract(user)
                .await
                .map_err(|e| format!("OpenAI AI Error: {}", e))
        }
        "openrouter" => {
            let client = openrouter_client(api_key, base_url)?;
            let mut b = client.extractor::<T>(model).preamble(system);
            if base_url.is_some_and(|u| !u.trim().is_empty()) {
                b = b.max_tokens(131072);
            }
            b.build()
                .extract(user)
                .await
                .map_err(|e| format!("OpenRouter AI Error: {}", e))
        }
        "anthropic" => {
            let client = anthropic_client(api_key, base_url)?;
            let mut b = client.extractor::<T>(model).preamble(system);
            if base_url.is_some_and(|u| !u.trim().is_empty()) {
                b = b.max_tokens(131072);
            }
            b.build()
                .extract(user)
                .await
                .map_err(|e| format!("Anthropic AI Error: {}", e))
        }
        "groq" => {
            let client = groq::Client::new(api_key).map_err(|e| e.to_string())?;
            client
                .extractor::<T>(model)
                .preamble(system)
                .build()
                .extract(user)
                .await
                .map_err(|e| format!("Groq AI Error: {}", e))
        }
        "deepseek" => {
            let client = deepseek::Client::new(api_key).map_err(|e| e.to_string())?;
            client
                .extractor::<T>(model)
                .preamble(system)
                .build()
                .extract(user)
                .await
                .map_err(|e| format!("DeepSeek AI Error: {}", e))
        }
        "ollama" => {
            let client = ollama_client(api_key, base_url)?;
            client
                .extractor::<T>(model)
                .preamble(system)
                .build()
                .extract(user)
                .await
                .map_err(|e| format!("Ollama AI Error: {}", e))
        }
        "bedrock" => {
            configure_aws_credentials(api_key);
            let aws_cfg = aws_config::load_from_env().await;
            let bedrock_client = aws_sdk_bedrockruntime::Client::new(&aws_cfg);
            let client = rig_bedrock::client::Client::from(bedrock_client);
            client
                .extractor::<T>(model)
                .preamble(system)
                .build()
                .extract(user)
                .await
                .map_err(|e| format!("Bedrock AI Error: {}", e))
        }
        other => Err(format!("Unsupported provider: {}", other)),
    }
}

fn configure_aws_credentials(api_key: &str) {
    let api_key = api_key.trim();
    if api_key.is_empty() || api_key == "bedrock_env_auth" {
        return;
    }
    let parts: Vec<&str> = api_key.split(':').collect();
    if parts.len() >= 2 {
        std::env::set_var("AWS_ACCESS_KEY_ID", parts[0].trim());
        std::env::set_var("AWS_SECRET_ACCESS_KEY", parts[1].trim());
        if parts.len() >= 3 {
            std::env::set_var("AWS_REGION", parts[2].trim());
            std::env::set_var("AWS_DEFAULT_REGION", parts[2].trim());
        } else if std::env::var("AWS_REGION").is_err()
            && std::env::var("AWS_DEFAULT_REGION").is_err()
        {
            std::env::set_var("AWS_REGION", "us-east-1");
            std::env::set_var("AWS_DEFAULT_REGION", "us-east-1");
        }
    }
}

// Provider factories — keep match arms tiny.
fn openai_client(api_key: &str, base_url: Option<&str>) -> Result<openai::Client, String> {
    match base_url {
        Some(url) if !url.trim().is_empty() => openai::Client::builder()
            .api_key(api_key)
            .base_url(url)
            .build()
            .map_err(|e| e.to_string()),
        _ => openai::Client::new(api_key).map_err(|e| e.to_string()),
    }
}

fn openrouter_client(api_key: &str, base_url: Option<&str>) -> Result<openrouter::Client, String> {
    match base_url {
        Some(url) if !url.trim().is_empty() => openrouter::Client::builder()
            .api_key(api_key)
            .base_url(url)
            .build()
            .map_err(|e| e.to_string()),
        _ => openrouter::Client::new(api_key).map_err(|e| e.to_string()),
    }
}

fn anthropic_client(api_key: &str, base_url: Option<&str>) -> Result<anthropic::Client, String> {
    match base_url {
        Some(url) if !url.trim().is_empty() => anthropic::Client::builder()
            .api_key(api_key)
            .base_url(url)
            .build()
            .map_err(|e| e.to_string()),
        _ => anthropic::Client::new(api_key).map_err(|e| e.to_string()),
    }
}

fn ollama_client(_api_key: &str, base_url: Option<&str>) -> Result<ollama::Client, String> {
    match base_url {
        Some(url) if !url.trim().is_empty() => ollama::Client::builder()
            .api_key(ollama::OllamaApiKey::default())
            .base_url(url)
            .build()
            .map_err(|e| e.to_string()),
        _ => ollama::Client::new(ollama::OllamaApiKey::default()).map_err(|e| e.to_string()),
    }
}

// ---------- Provider impls (only `complete` and `test`) ----------

struct OpenaiProvider {
    api_key: String,
    base_url: Option<String>,
}
#[async_trait::async_trait]
impl ProviderAgent for OpenaiProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = openai_client(&self.api_key, self.base_url.as_deref())?;
        let mut b = client.agent(model).preamble(system);
        if self
            .base_url
            .as_ref()
            .map_or(false, |u| !u.trim().is_empty())
        {
            b = b.max_tokens(131072);
        }
        b.build()
            .prompt(user)
            .await
            .map_err(|e| format!("OpenAI AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct OpenrouterProvider {
    api_key: String,
    base_url: Option<String>,
}
#[async_trait::async_trait]
impl ProviderAgent for OpenrouterProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = openrouter_client(&self.api_key, self.base_url.as_deref())?;
        let mut b = client.agent(model).preamble(system);
        if self
            .base_url
            .as_ref()
            .map_or(false, |u| !u.trim().is_empty())
        {
            b = b.max_tokens(131072);
        }
        b.build()
            .prompt(user)
            .await
            .map_err(|e| format!("OpenRouter AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct AnthropicProvider {
    api_key: String,
    base_url: Option<String>,
}
#[async_trait::async_trait]
impl ProviderAgent for AnthropicProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = anthropic_client(&self.api_key, self.base_url.as_deref())?;
        let mut b = client.agent(model).preamble(system);
        if self
            .base_url
            .as_ref()
            .map_or(false, |u| !u.trim().is_empty())
        {
            b = b.max_tokens(131072);
        }
        b.build()
            .prompt(user)
            .await
            .map_err(|e| format!("Anthropic AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct GeminiProvider {
    api_key: String,
}
#[async_trait::async_trait]
impl ProviderAgent for GeminiProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = gemini::Client::new(&self.api_key).map_err(|e| e.to_string())?;
        client
            .agent(model)
            .preamble(system)
            .build()
            .prompt(user)
            .await
            .map_err(|e| format!("Gemini AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct GroqProvider {
    api_key: String,
}
#[async_trait::async_trait]
impl ProviderAgent for GroqProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = groq::Client::new(&self.api_key).map_err(|e| e.to_string())?;
        client
            .agent(model)
            .preamble(system)
            .build()
            .prompt(user)
            .await
            .map_err(|e| format!("Groq AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct DeepseekProvider {
    api_key: String,
}
#[async_trait::async_trait]
impl ProviderAgent for DeepseekProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = deepseek::Client::new(&self.api_key).map_err(|e| e.to_string())?;
        client
            .agent(model)
            .preamble(system)
            .build()
            .prompt(user)
            .await
            .map_err(|e| format!("DeepSeek AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct OllamaProvider {
    base_url: Option<String>,
}
#[async_trait::async_trait]
impl ProviderAgent for OllamaProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        let client = ollama_client("", self.base_url.as_deref())?;
        client
            .agent(model)
            .preamble(system)
            .build()
            .prompt(user)
            .await
            .map_err(|e| format!("Ollama AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

struct BedrockProvider {
    api_key: String,
}
#[async_trait::async_trait]
impl ProviderAgent for BedrockProvider {
    async fn complete(&self, model: &str, system: &str, user: &str) -> Result<String, String> {
        configure_aws_credentials(&self.api_key);
        let aws_cfg = aws_config::load_from_env().await;
        let bedrock_client = aws_sdk_bedrockruntime::Client::new(&aws_cfg);
        let client = rig_bedrock::client::Client::from(bedrock_client);
        client
            .agent(model)
            .preamble(system)
            .build()
            .prompt(user)
            .await
            .map_err(|e| format!("Bedrock AI Error: {}", e))
    }
    async fn test(&self, model: &str) -> Result<String, String> {
        self.complete(
            model,
            "Respond ONLY with valid JSON: {\"status\":\"ok\"}",
            "test",
        )
        .await
    }
}

fn provider_for(
    provider: &str,
    api_key: &str,
    base_url: Option<&str>,
) -> Result<Box<dyn ProviderAgent>, String> {
    let provider = normalize_provider(provider);
    match provider.as_str() {
        "gemini" => Ok(Box::new(GeminiProvider {
            api_key: api_key.into(),
        })),
        "openai" => Ok(Box::new(OpenaiProvider {
            api_key: api_key.into(),
            base_url: base_url.map(|s| s.to_string()),
        })),
        "openrouter" => Ok(Box::new(OpenrouterProvider {
            api_key: api_key.into(),
            base_url: base_url.map(|s| s.to_string()),
        })),
        "anthropic" => Ok(Box::new(AnthropicProvider {
            api_key: api_key.into(),
            base_url: base_url.map(|s| s.to_string()),
        })),
        "groq" => Ok(Box::new(GroqProvider {
            api_key: api_key.into(),
        })),
        "deepseek" => Ok(Box::new(DeepseekProvider {
            api_key: api_key.into(),
        })),
        "ollama" => Ok(Box::new(OllamaProvider {
            base_url: base_url.map(|s| s.to_string()),
        })),
        "bedrock" => Ok(Box::new(BedrockProvider {
            api_key: api_key.into(),
        })),
        other => Err(format!("Unsupported provider: {}", other)),
    }
}

// ---------- Public call sites ----------

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JobParseResult {
    pub details: JobDetails,
    pub raw_description: String,
}

pub async fn parse_job_description(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    raw_jd: &str,
    job_url: Option<&str>,
) -> Result<JobParseResult, String> {
    let input_text = raw_jd.trim();
    let url = job_url.unwrap_or("").trim();

    if input_text.is_empty() && url.is_empty() {
        return Err("Either a job description or a URL must be provided.".into());
    }

    let model = model.trim();
    let system_prompt = "You are an expert job details extractor. TASK: - If a RAW DESCRIPTION is provided below, extract details from that text. - If ONLY a URL is provided, crawl/fetch the content from that URL and extract details. - If BOTH are provided, PRIORITIZE the manual RAW DESCRIPTION for extraction. VALIDATION: - Be permissive: If the text looks like a job posting (even if short or partial), set 'is_valid_job' to true. - ONLY set 'is_valid_job' to false if the content is clearly NOT a job. Output the results in the requested structured format.";

    let user_prompt = if !input_text.is_empty() {
        format!(
            "RAW DESCRIPTION:\n{}\n\n(Optional URL for reference: {})",
            input_text, url
        )
    } else {
        format!("PLEASE FETCH AND PARSE THIS URL: {}", url)
    };

    let details: JobDetails = extract_for(
        provider,
        api_key,
        custom_base_url,
        model,
        system_prompt,
        &user_prompt,
    )
    .await?;

    if !details.is_valid_job {
        return Err(
            "The content provided does not appear to contain a valid job description.".into(),
        );
    }

    Ok(JobParseResult {
        details,
        raw_description: if !input_text.is_empty() {
            input_text.to_string()
        } else {
            format!("Source URL: {}", url)
        },
    })
}

pub async fn tailor_latex_for_job(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    base_latex: &str,
    raw_job_content: &str,
    custom_instruction: Option<&str>,
) -> Result<String, String> {
    let agent = provider_for(provider, api_key, custom_base_url)?;
    let system_prompt = "You are an expert resume tailoring AI. Rules: 1) Only modify the resume content, NOT the structure. 2) Highlight keywords matching the JD. 3) Keep all original sections. 4) Output ONLY valid LaTeX code with no markdown or code fences. If custom instructions are provided, prioritize them.";
    let user_prompt = format!(
        r#"Base LaTeX Resume:
{}

Job Description:
{}

{}

Please tailor the resume to match the job description. Return only the modified LaTeX code."#,
        base_latex,
        raw_job_content,
        custom_instruction
            .map(|ci| format!("Custom Instructions:\n{}", ci))
            .unwrap_or_default()
    );
    agent.complete(model, system_prompt, &user_prompt).await
}

pub async fn tailor_latex_for_cover_letter(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    base_latex: &str,
    raw_job_content: &str,
    custom_instruction: Option<&str>,
) -> Result<String, String> {
    let agent = provider_for(provider, api_key, custom_base_url)?;
    let system_prompt = "You are an expert cover letter tailoring AI. Rules: 1) Only modify cover letter content (recipient info, body paragraphs). 2) Emphasize how the candidate's skills and experiences align with the job requirements. 3) Maintain professional, persuasive tone. 4) Output ONLY valid LaTeX code with no markdown or code fences. If custom instructions are provided, prioritize them.";
    let user_prompt = format!(
        r#"Base LaTeX Cover Letter:
{}

Job Description:
{}

{}

Please tailor the cover letter to match the job description. Return only the modified LaTeX code."#,
        base_latex,
        raw_job_content,
        custom_instruction
            .map(|ci| format!("Custom Instructions:\n{}", ci))
            .unwrap_or_default()
    );
    agent.complete(model, system_prompt, &user_prompt).await
}

pub async fn refine_tailored_resume(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    current_latex: &str,
    instruction: &str,
) -> Result<String, String> {
    let agent = provider_for(provider, api_key, custom_base_url)?;
    let system_prompt = "You are an expert LaTeX resume editor. Apply specific refinements while preserving content and structure. Maintain valid LaTeX syntax. Output ONLY the modified LaTeX code with no markdown or code fences.";
    let user_prompt = format!(
        r#"Current LaTeX Resume:
{}

Requested Refinement:
{}

Please apply the requested changes. Return only the updated LaTeX code."#,
        current_latex, instruction
    );
    agent.complete(model, system_prompt, &user_prompt).await
}

pub async fn fix_latex_errors(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    broken_latex: &str,
    error_logs: &str,
) -> Result<String, String> {
    let agent = provider_for(provider, api_key, custom_base_url)?;
    let system_prompt = "You are an expert LaTeX debugger. Fix syntax errors, missing packages, or illegal characters in LaTeX code based on provided error logs. DO NOT change the resume content unless necessary. Output ONLY corrected LaTeX code with no markdown or code fences.";
    let user_prompt = format!(
        r#"Broken LaTeX Code:
{}

Tectonic Error Logs:
{}

Please fix the LaTeX code so it compiles successfully. Return only the fixed LaTeX code."#,
        broken_latex, error_logs
    );
    agent.complete(model, system_prompt, &user_prompt).await
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
struct AiScore {
    score: u32,
    reasoning: String,
    missing_keywords: Vec<String>,
    matched_keywords: Vec<String>,
}

pub async fn score_resume_against_job(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    resume_text: &str,
    job_text: &str,
) -> Result<crate::models::ScoreResumeResult, String> {
    let system_prompt = "You are an expert resume evaluator. Score the resume against the job description on a scale of 0-100 based on keyword match, experience relevance, and qualification alignment. Respond in structured JSON.";
    let user_prompt = format!(
        r#"Resume:
{}

Job Description:
{}

Provide: score (0-100), reasoning, missing_keywords (array), matched_keywords (array)."#,
        resume_text, job_text
    );

    let result: AiScore = extract_for(
        provider,
        api_key,
        custom_base_url,
        model,
        system_prompt,
        &user_prompt,
    )
    .await?;
    Ok(crate::models::ScoreResumeResult {
        score: result.score,
        reasoning: result.reasoning,
        missing_keywords: result.missing_keywords,
        matched_keywords: result.matched_keywords,
    })
}

pub async fn test_ai(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
) -> Result<String, String> {
    let agent = provider_for(provider, api_key, custom_base_url)?;
    agent.test(model).await
}
