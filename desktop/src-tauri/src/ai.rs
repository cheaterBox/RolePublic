//! Provider transport for every AI call in the app.
//!
//! This module owns ZERO prompts: no preambles, no templates, no wording.
//! Each feature section (jobs, cover letters, pdf/diagram, outreach,
//! settings) builds its own system + user prompts and calls [`complete`]
//! for free text or [`extract`] for structured JSON below.
//!
//! The only feature-specific remnant is the `feature` label threaded into
//! error strings (e.g. "DeepSeek Outreach Error: ...") so existing
//! frontend error handling keeps working.

use rig::client::CompletionClient;
use rig::completion::Prompt;
use rig::providers::{anthropic, deepseek, gemini, groq, ollama, openai, openrouter};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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

#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
pub struct JobDetails {
    pub is_valid_job: bool, // AI will set this to false if the content is not a job description
    pub job_title: String,
    pub company_name: String,
    pub work_model: String,      // Remote, Hybrid, On-site, Other
    pub employment_type: String, // Full-time, Part-time, Contract, Freelance, Temporary, Internship
    pub requirements: Vec<String>,
    pub core_responsibilities: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JobParseResult {
    pub details: JobDetails,
    pub raw_description: String,
}

fn provider_label(provider: &str) -> &'static str {
    match provider {
        "gemini" => "Gemini AI",
        "openrouter" => "OpenRouter",
        "openai" => "OpenAI",
        "groq" => "Groq",
        "anthropic" => "Anthropic",
        "bedrock" => "Bedrock AI",
        "ollama" => "Ollama",
        "deepseek" => "DeepSeek",
        _ => "AI",
    }
}

fn provider_error(provider: &str, feature: &str, err: impl std::fmt::Display) -> String {
    let label = provider_label(provider);
    if feature.is_empty() {
        format!("{label} Error: {err}")
    } else {
        format!("{label} {feature} Error: {err}")
    }
}

/// Run a free-text completion against any configured provider.
/// `feature` only names the error context (e.g. "Tailoring", "Parsing",
/// "Outreach", "Refinement", "Fix", or "" for a bare "<Provider> Error").
pub async fn complete(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    system_prompt: &str,
    user_prompt: &str,
    feature: &str,
) -> Result<String, String> {
    let model = model.trim();
    match provider {
        "gemini" => {
            let client = gemini::Client::new(api_key).map_err(|e| e.to_string())?;
            let agent = client.agent(model).preamble(system_prompt).build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "openrouter" => {
            let is_custom = custom_base_url.is_some_and(|u| !u.trim().is_empty());
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => openrouter::Client::builder()
                    .api_key(api_key)
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => openrouter::Client::new(api_key).map_err(|e| e.to_string())?,
            };
            let mut builder = client.agent(model).preamble(system_prompt);
            if is_custom {
                builder = builder.max_tokens(131072);
            }
            let agent = builder.build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "openai" => {
            let is_custom = custom_base_url.is_some_and(|u| !u.trim().is_empty());
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => openai::Client::builder()
                    .api_key(api_key)
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => openai::Client::new(api_key).map_err(|e| e.to_string())?,
            };
            let mut builder = client.agent(model).preamble(system_prompt);
            if is_custom {
                builder = builder.max_tokens(131072);
            }
            let agent = builder.build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "groq" => {
            let client = groq::Client::new(api_key).map_err(|e| e.to_string())?;
            let agent = client.agent(model).preamble(system_prompt).build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "anthropic" => {
            let is_custom = custom_base_url.is_some_and(|u| !u.trim().is_empty());
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => anthropic::Client::builder()
                    .api_key(api_key)
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => anthropic::Client::new(api_key).map_err(|e| e.to_string())?,
            };
            let mut builder = client.agent(model).preamble(system_prompt);
            if is_custom {
                builder = builder.max_tokens(131072);
            }
            let agent = builder.build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "bedrock" => {
            configure_aws_credentials(api_key);
            let config = aws_config::load_from_env().await;
            let bedrock_client = aws_sdk_bedrockruntime::Client::new(&config);
            let client = rig_bedrock::client::Client::from(bedrock_client);
            let agent = client.agent(model).preamble(system_prompt).build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "ollama" => {
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => ollama::Client::builder()
                    .api_key(ollama::OllamaApiKey::default())
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => ollama::Client::new(ollama::OllamaApiKey::default())
                    .map_err(|e| e.to_string())?,
            };
            let agent = client.agent(model).preamble(system_prompt).build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "deepseek" => {
            let client = deepseek::Client::new(api_key).map_err(|e| e.to_string())?;
            let agent = client.agent(model).preamble(system_prompt).build();
            agent
                .prompt(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    }
}

/// Run a structured-JSON extraction against any configured provider.
/// Same transport as [`complete`]; the caller owns both prompts.
/// Concrete over [`JobDetails`] (the only extracted shape) so no
/// trait-bound guessing is needed at the transport layer.
pub async fn extract_job_details(
    provider: &str,
    model: &str,
    api_key: &str,
    custom_base_url: Option<&str>,
    system_prompt: &str,
    user_prompt: &str,
    feature: &str,
) -> Result<JobDetails, String> {
    let model = model.trim();
    match provider {
        "gemini" => {
            let client = gemini::Client::new(api_key).map_err(|e| e.to_string())?;
            let extractor = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt)
                .build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "openrouter" => {
            let is_custom = custom_base_url.is_some_and(|u| !u.trim().is_empty());
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => openrouter::Client::builder()
                    .api_key(api_key)
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => openrouter::Client::new(api_key).map_err(|e| e.to_string())?,
            };
            let mut builder = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt);
            if is_custom {
                builder = builder.max_tokens(131072);
            }
            let extractor = builder.build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "openai" => {
            let is_custom = custom_base_url.is_some_and(|u| !u.trim().is_empty());
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => openai::Client::builder()
                    .api_key(api_key)
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => openai::Client::new(api_key).map_err(|e| e.to_string())?,
            };
            let mut builder = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt);
            if is_custom {
                builder = builder.max_tokens(131072);
            }
            let extractor = builder.build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "groq" => {
            let client = groq::Client::new(api_key).map_err(|e| e.to_string())?;
            let extractor = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt)
                .build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "anthropic" => {
            let is_custom = custom_base_url.is_some_and(|u| !u.trim().is_empty());
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => anthropic::Client::builder()
                    .api_key(api_key)
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => anthropic::Client::new(api_key).map_err(|e| e.to_string())?,
            };
            let mut builder = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt);
            if is_custom {
                builder = builder.max_tokens(131072);
            }
            let extractor = builder.build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "bedrock" => {
            configure_aws_credentials(api_key);
            let config = aws_config::load_from_env().await;
            let bedrock_client = aws_sdk_bedrockruntime::Client::new(&config);
            let client = rig_bedrock::client::Client::from(bedrock_client);
            let extractor = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt)
                .build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "ollama" => {
            let client = match custom_base_url {
                Some(url) if !url.trim().is_empty() => ollama::Client::builder()
                    .api_key(ollama::OllamaApiKey::default())
                    .base_url(url)
                    .build()
                    .map_err(|e| e.to_string())?,
                _ => ollama::Client::new(ollama::OllamaApiKey::default())
                    .map_err(|e| e.to_string())?,
            };
            let extractor = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt)
                .build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        "deepseek" => {
            let client = deepseek::Client::new(api_key).map_err(|e| e.to_string())?;
            let extractor = client
                .extractor::<JobDetails>(model)
                .preamble(system_prompt)
                .build();
            extractor
                .extract(user_prompt)
                .await
                .map_err(|e| provider_error(provider, feature, e))
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    }
}
